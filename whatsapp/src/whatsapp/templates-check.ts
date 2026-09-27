import { closePool } from '../db/pool.js'
import { getAccessToken, listTenants } from '../db/repositories/tenants.js'
import { assertEnv, env } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { WhatsAppClient } from './client.js'

/**
 * Confere quais templates estão aprovados na Meta.
 *
 * Descobrir que o template do lembrete foi reprovado só quando o cliente
 * deveria receber a mensagem é o pior jeito de descobrir. Rode isto antes de
 * ligar qualquer mensagem programada, e de novo depois de cada deploy.
 *
 *   npm run templates:check
 */

const STATUS_ICON: Record<string, string> = {
  APPROVED: '✔',
  PENDING: '⏳',
  REJECTED: '✖',
  PAUSED: '⏸',
  DISABLED: '⛔',
}

interface Expected {
  nome: string
  usadoPor: string
  ligado: boolean
}

function expectedTemplates(): Expected[] {
  return [
    { nome: env.templates.lembrete24h, usadoPor: 'lembrete de 24h', ligado: env.features.lembrete24h },
    { nome: env.templates.lembrete2h, usadoPor: 'lembrete de 2h', ligado: env.features.lembrete2h },
    { nome: env.templates.posAtendimento, usadoPor: 'pós-atendimento', ligado: env.features.posAtendimento },
    { nome: env.templates.reativacao, usadoPor: 'reativação', ligado: env.features.reativacao },
    { nome: env.templates.aniversario, usadoPor: 'aniversário', ligado: env.features.aniversario },
  ]
}

async function main(): Promise<void> {
  assertEnv()
  const tenants = await listTenants()

  if (tenants.length === 0) {
    console.log('Nenhuma barbearia cadastrada. Rode: npm run tenant:sync')
    return
  }

  for (const tenant of tenants) {
    console.log(`\n━━ ${tenant.displayName} (${tenant.slug})`)

    if (!tenant.wabaId) {
      console.log('   ⚠  sem WABA_ID cadastrado — não dá para listar os templates.')
      console.log('      Cadastre com: npm run tenant:add -- --slug=' + tenant.slug + ' --waba-id=...')
      continue
    }

    let approved: Map<string, string>
    try {
      const token = await getAccessToken(tenant.id)
      const client = new WhatsAppClient(tenant.phoneNumberId, token)
      const templates = await client.listTemplates(tenant.wabaId)
      approved = new Map(
        templates
          .filter((template) => template.language === env.defaultLocale)
          .map((template) => [template.name, template.status]),
      )
    } catch (error) {
      console.log(`   ✖ não deu para consultar a Meta: ${error instanceof Error ? error.message : error}`)
      continue
    }

    for (const expected of expectedTemplates()) {
      const status = approved.get(expected.nome)
      const icon = status ? (STATUS_ICON[status] ?? '?') : '·'
      const situacao = status ?? 'NÃO EXISTE'
      const flag = expected.ligado ? 'ligado' : 'desligado'

      console.log(`   ${icon} ${expected.nome.padEnd(24)} ${situacao.padEnd(12)} ${expected.usadoPor} (${flag})`)

      if (expected.ligado && status !== 'APPROVED') {
        console.log(
          `      ⚠  ESTÁ LIGADO mas o template não está aprovado — essas mensagens vão falhar.`,
        )
        console.log(`         O JSON para cadastrar está em docs/templates.md`)
      }
    }
  }
  console.log()
}

if (isMain(import.meta.url)) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(() => closePool())
}
