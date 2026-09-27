import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { normalizePhone } from '@restaurante/shared/lib/whatsapp'
import { closePool, pool } from '../db/pool.js'
import { findTenantBySlug, listStaff, listTenants } from '../db/repositories/tenants.js'
import { assertEnv, env } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { getTenantContext, invalidateTenantCache, setClientFactory } from '../tenants/registry.js'
import type { SendResult, WhatsAppSender } from '../whatsapp/client.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import { handleInbound } from './handler.js'

/**
 * Conversa com o bot pelo terminal, como se você fosse o cliente.
 *
 *   npm run bot:sim                          cliente qualquer, primeiro restaurante
 *   npm run bot:sim -- --from=5511988887777  outro cliente
 *   npm run bot:sim -- --dono                entra como o dono (painel de admin)
 *   npm run bot:sim -- --recepcao=julia      entra como alguém da equipe (painel da recepção)
 *
 * É o bot INTEIRO: máquina de estados, banco, lotação dos ambientes, reserva
 * de verdade. A única peça trocada é o envio para a Meta — em vez de sair pela
 * Cloud API, a mensagem é desenhada aqui. Por isso não precisa de número na
 * lista de permitidos, não gasta conversa e não depende de webhook.
 *
 * O que ele NÃO cobre: como a Meta renderiza a lista no aplicativo, e o envio
 * de verdade (token, template aprovado, janela de 24h). Para isso, o número de
 * teste continua sendo a palavra final.
 */

function flag(name: string): string {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length).trim() : ''
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const OFF = '\x1b[0m'

/** As opções da última mensagem interativa, na ordem em que foram desenhadas. */
interface Choice {
  id: string
  title: string
}

let lastChoices: Choice[] = []

/**
 * Desenha no terminal o que o cliente veria no WhatsApp. Numera as opções para
 * você responder "3" em vez de decorar o id do botão.
 */
function render(message: OutgoingMessage): void {
  const choices: Choice[] = []
  const say = (text: string): void => {
    for (const line of text.split('\n')) console.log(`   ${line}`)
  }

  console.log(`\n${GREEN}${BOLD}⬅ restaurante${OFF}`)

  if (message.type === 'text') {
    say((message.text as { body: string }).body)
  } else if (message.type === 'interactive') {
    const interactive = message.interactive as Record<string, any>
    if (interactive.header?.text) say(`${BOLD}${interactive.header.text}${OFF}`)
    say(interactive.body?.text ?? '')

    if (interactive.type === 'button') {
      for (const button of interactive.action?.buttons ?? []) {
        choices.push({ id: button.reply.id, title: button.reply.title })
      }
    } else if (interactive.type === 'list') {
      for (const section of interactive.action?.sections ?? []) {
        if (section.title) console.log(`\n   ${DIM}── ${section.title} ──${OFF}`)
        for (const row of section.rows ?? []) {
          choices.push({ id: row.id, title: row.title })
          const n = String(choices.length).padStart(2)
          const description = row.description ? ` ${DIM}— ${row.description}${OFF}` : ''
          console.log(`   ${CYAN}[${n}]${OFF} ${row.title}${description}`)
        }
      }
    } else if (interactive.type === 'cta_url') {
      say(`${CYAN}🔗 ${interactive.action?.parameters?.display_text}: ${interactive.action?.parameters?.url}${OFF}`)
    }

    if (interactive.type === 'button' && choices.length) {
      console.log('')
      choices.forEach((choice, index) => {
        console.log(`   ${CYAN}[${String(index + 1).padStart(2)}]${OFF} ${choice.title}`)
      })
    }
    if (interactive.footer?.text) console.log(`   ${DIM}${interactive.footer.text}${OFF}`)
  } else if (message.type === 'template') {
    const template = message.template as Record<string, any>
    say(`${YELLOW}[template ${template.name}]${OFF}`)
    const body = (template.components ?? []).find((c: any) => c.type === 'body')
    if (body) say((body.parameters ?? []).map((p: any) => p.text).join(' · '))
  } else {
    say(JSON.stringify(message, null, 2))
  }

  if (choices.length) lastChoices = choices
}

/**
 * O cliente falso. Tudo que o bot mandaria para a Meta é desenhado no terminal.
 * Mensagem para OUTRO número (o aviso que vai para o dono) aparece marcada,
 * para você não confundir com a resposta ao cliente.
 */
function makeSender(clientNumber: string): WhatsAppSender {
  let counter = 0
  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      if (message.to !== clientNumber) {
        console.log(`\n${YELLOW}⬅ (aviso para ${message.to} — o dono)${OFF}`)
      }
      render(message)
      counter += 1
      return { messageId: `wamid.SIM_${Date.now()}_${counter}` }
    },
    async markRead(): Promise<void> {},
  }
}

/** Limpa a conversa e as mensagens deste número, para começar do zero. */
async function reset(tenantId: string, waId: string): Promise<void> {
  const contact = await pool.query('select id from contacts where tenant_id = $1 and wa_id = $2', [tenantId, waId])
  const id = contact.rows[0]?.id
  if (!id) return
  await pool.query('delete from message_log where contact_id = $1', [id])
  await pool.query('delete from conversations where contact_id = $1', [id])
  console.log(`${DIM}conversa reiniciada (as reservas foram mantidas)${OFF}`)
}

async function main(): Promise<void> {
  assertEnv()

  const slug = flag('slug')
  const tenant = slug ? await findTenantBySlug(slug) : (await listTenants())[0]
  if (!tenant) {
    console.error(
      slug
        ? `✖ restaurante "${slug}" não está cadastrado. Rode: npm run tenant:sync`
        : '✖ nenhum restaurante cadastrado. Rode: npm run tenant:sync',
    )
    process.exit(1)
  }

  // O número é o que decide qual painel abre — é assim que o `handleInbound`
  // reconhece o dono e a recepção. Então o simulador não "entra como": ele só
  // escolhe de que número está escrevendo.
  const recepcaoSlug = flag('recepcao')
  let recepcao: Awaited<ReturnType<typeof listStaff>>[number] | undefined

  if (recepcaoSlug) {
    const equipe = await listStaff(tenant.id)
    recepcao = equipe.find((item) => item.slug === recepcaoSlug)

    if (!recepcao) {
      const nomes = equipe.map((item) => item.slug).join(', ') || '(ninguém)'
      console.error(`✖ "${recepcaoSlug}" não está na equipe deste restaurante. Tem: ${nomes}`)
      process.exit(1)
    }
    if (!recepcao.phone) {
      console.error(
        `✖ "${recepcao.name}" está sem telefone.\n` +
          '  Preencha o WhatsApp na aba Equipe do estúdio (npm run textos:studio)\n' +
          '  e rode: npm run tenant:sync',
      )
      process.exit(1)
    }
  }

  const waId = has('dono')
    ? normalizePhone(tenant.ownerPhone, env.defaultCountryCode)
    : recepcao
      ? normalizePhone(recepcao.phone, env.defaultCountryCode)
      : normalizePhone(flag('from') || '5511988887777', env.defaultCountryCode)

  if (has('dono') && !waId) {
    console.error('✖ este restaurante não tem TENANT_OWNER_PHONE cadastrado.')
    process.exit(1)
  }

  // Precisa vir ANTES do getTenantContext: é o que impede o envio real.
  setClientFactory(() => makeSender(waId))
  invalidateTenantCache()

  const ctx = await getTenantContext(tenant.phoneNumberId)
  if (!ctx) {
    console.error('✖ não consegui montar o contexto do restaurante.')
    process.exit(1)
  }

  if (has('reset')) await reset(tenant.id, waId)

  console.log(`\n${BOLD}${tenant.displayName}${OFF} ${DIM}(${tenant.slug})${OFF}`)
  const papel = has('dono')
    ? ' — o DONO'
    : recepcao
      ? ` — ${recepcao.name}, da recepção`
      : ' — um cliente'
  console.log(`${DIM}você é ${waId}${papel}${OFF}`)
  console.log(`${DIM}nada sai para a Meta. digite um texto, ou o número de uma opção.${OFF}`)
  console.log(`${DIM}=12 manda "12" como texto (o número de pessoas) · /reset reinicia · /sair encerra${OFF}`)

  // O iterador assíncrono (em vez de `rl.question`) é o que faz o simulador
  // servir nos dois modos: digitando, e com a entrada vinda de um pipe — que é
  // como se escreve um roteiro de fumaça do atendimento inteiro.
  const rl = createInterface({ input: stdin, output: stdout })
  const prompt = (): void => {
    stdout.write(`\n${BOLD}➡ você${OFF} > `)
  }
  let counter = 0

  prompt()
  for await (const raw of rl) {
    const line = raw.trim()
    if (line === '') {
      prompt()
      continue
    }
    if (line === '/sair' || line === '/quit') break
    if (line === '/reset') {
      await reset(tenant.id, waId)
      lastChoices = []
      prompt()
      continue
    }

    // Um número sozinho escolhe a opção correspondente da última lista/botões —
    // é o equivalente a tocar nela no aplicativo, e o bot recebe o id, não o texto.
    //
    // "=12" é o escape: manda o texto "12" mesmo havendo uma opção 12 — é como
    // se responde "Quantas pessoas?" depois de tocar em "9 ou mais".
    let action: string | null = null
    let text = line.startsWith('=') ? line.slice(1).trim() : line
    const picked = /^\d+$/.test(line) ? lastChoices[Number(line) - 1] : undefined
    if (picked) {
      action = picked.id
      text = picked.title
      console.log(`${DIM}   ↳ ${picked.title}  (${picked.id})${OFF}`)
    }

    counter += 1
    const inbound: NormalizedInbound = {
      messageId: `wamid.SIM_IN_${Date.now()}_${counter}`,
      from: waId,
      profileName: has('dono') ? 'Dono (sim)' : recepcao ? `${recepcao.name} (sim)` : 'Cliente (sim)',
      timestamp: new Date(),
      action,
      text,
      mediaType: null,
    }

    try {
      await handleInbound(ctx, inbound)
    } catch (error) {
      console.error(`\n✖ o bot estourou: ${error instanceof Error ? error.stack : String(error)}`)
    }
    prompt()
  }

  rl.close()
  await closePool()
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
