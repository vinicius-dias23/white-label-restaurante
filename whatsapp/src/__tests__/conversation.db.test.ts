import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { normalizeConfig } from '@barbearia/shared/config'
import { closePool, query, queryOne } from '../db/pool.js'
import { migrate } from '../db/migrate.js'
import { syncCatalog, upsertTenant } from '../db/repositories/tenants.js'
import { upsertContact } from '../db/repositories/contacts.js'
import { env } from '../env.js'
import { invalidateTenantCache, setClientFactory } from '../tenants/registry.js'
import type { SendResult, WhatsAppSender } from '../whatsapp/client.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'
import { processPayload } from '../whatsapp/webhook.js'

/**
 * O atendimento inteiro, de "oi" até o horário marcado.
 *
 * Roda o webhook de verdade contra o banco de verdade, trocando só a saída para
 * a Meta por um cliente falso. É o teste que pega o que os testes de unidade não
 * pegam: contexto perdido entre telas, botão que aponta para lugar nenhum,
 * agendamento que não vira lembrete na fila.
 */

const temBanco = Boolean(env.databaseUrl)

const PHONE_NUMBER_ID = '111122223333444'
const CLIENTE = '5511977776666'

/** Guarda o que teria sido enviado, em vez de falar com a Meta. */
class FakeSender implements WhatsAppSender {
  readonly enviadas: OutgoingMessage[] = []
  private contador = 0

  async send(message: OutgoingMessage): Promise<SendResult> {
    this.enviadas.push(message)
    this.contador += 1
    return { messageId: `wamid.fake.${this.contador}` }
  }

  async markRead(): Promise<void> {}

  get ultima(): OutgoingMessage {
    const last = this.enviadas.at(-1)
    if (!last) throw new Error('o bot não respondeu nada')
    return last
  }

  limpar(): void {
    this.enviadas.length = 0
  }
}

const sender = new FakeSender()

/** IDs das linhas da lista ou dos botões da última mensagem. */
function opcoes(message: OutgoingMessage): string[] {
  const interactive = message.interactive as
    | {
        type: string
        action: {
          buttons?: { reply: { id: string } }[]
          sections?: { rows: { id: string }[] }[]
        }
      }
    | undefined

  if (!interactive) return []
  if (interactive.action.buttons) return interactive.action.buttons.map((button) => button.reply.id)
  return (interactive.action.sections ?? []).flatMap((section) => section.rows.map((row) => row.id))
}

function corpo(message: OutgoingMessage): string {
  const interactive = message.interactive as { body?: { text?: string } } | undefined
  const text = message.text as { body?: string } | undefined
  return interactive?.body?.text ?? text?.body ?? ''
}

/** Acha o primeiro ID que começa com o prefixo — como o cliente tocando nele. */
function opcaoComPrefixo(message: OutgoingMessage, prefixo: string): string {
  const encontrada = opcoes(message).find((id) => id.startsWith(prefixo))
  if (!encontrada) {
    throw new Error(`nenhuma opção "${prefixo}" na tela. Havia: ${opcoes(message).join(', ')}`)
  }
  return encontrada
}

let sequencia = 0

/** Simula o webhook da Meta com uma mensagem do cliente. */
async function cliente(input: { texto?: string; toca?: string }): Promise<void> {
  sequencia += 1
  const message: Record<string, unknown> = {
    id: `wamid.in.${sequencia}`,
    from: CLIENTE,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }

  if (input.toca) {
    message.type = 'interactive'
    message.interactive = { type: 'list_reply', list_reply: { id: input.toca, title: 'x' } }
  } else {
    message.type = 'text'
    message.text = { body: input.texto ?? 'oi' }
  }

  await processPayload({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ wa_id: CLIENTE, profile: { name: 'João Cliente' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  })
}

describe.skipIf(!temBanco)('conversa completa', () => {
  beforeAll(async () => {
    await migrate({ withReset: true })
    setClientFactory(() => sender)
  })

  afterAll(async () => {
    await closePool()
  })

  beforeEach(async () => {
    await query('TRUNCATE tenants CASCADE')
    invalidateTenantCache()
    sender.limpar()
    sequencia = 0

    const config = normalizeConfig({
      brand: { name: 'Barbearia do Zé' },
      contact: { whatsapp: '5511912345678', address: 'Rua das Palmeiras, 250' },
      services: [
        { name: 'Corte Degradê', price: 'R$ 45', duration: '40 min' },
        { name: 'Corte + Barba', price: 'R$ 75', duration: '1h 10' },
      ],
      team: [
        { name: 'Rafael', bookable: true },
        { name: 'Diego', bookable: true },
      ],
      hours: {
        mon: [['09:00', '19:00']],
        tue: [['09:00', '19:00']],
        wed: [['09:00', '19:00']],
        thu: [['09:00', '19:00']],
        fri: [['09:00', '19:00']],
        sat: [['09:00', '19:00']],
        sun: [['09:00', '19:00']],
      },
      whatsapp: { paymentMethods: 'Pix e cartão' },
    })

    const tenant = await upsertTenant({
      slug: 'ze',
      displayName: 'Barbearia do Zé',
      phoneNumberId: PHONE_NUMBER_ID,
      wabaId: 'waba-1',
      accessToken: 'token-falso',
      ownerPhone: '',
      timezone: 'America/Sao_Paulo',
      config,
    })
    await syncCatalog(tenant)
  })

  it('responde qualquer texto com o menu, sem tentar interpretar', async () => {
    await cliente({ texto: 'boa tarde, vcs tem horário pra hoje?' })

    expect(corpo(sender.ultima)).toContain('Não entendi')
    expect(opcoes(sender.ultima)).toContain('menu:agendar')
  })

  it('mostra os serviços com preço e duração', async () => {
    await cliente({ texto: 'oi' })
    await cliente({ toca: 'menu:servicos' })

    const texto = corpo(sender.ultima)
    expect(texto).toContain('Corte Degradê')
    expect(texto).toContain('R$ 45')
    expect(texto).toContain('40 min')
    expect(texto).toContain('1h 10') // "1h 10" foi entendido como 70 minutos
  })

  it('vai de "oi" até o horário marcado', async () => {
    await cliente({ texto: 'oi' })
    expect(opcoes(sender.ultima)).toContain('menu:agendar')

    await cliente({ toca: 'menu:agendar' })
    const servico = opcaoComPrefixo(sender.ultima, 'svc:')

    await cliente({ toca: servico })
    expect(opcoes(sender.ultima)).toContain('brb:any')

    await cliente({ toca: 'brb:any' })
    const dia = opcaoComPrefixo(sender.ultima, 'day:')

    await cliente({ toca: dia })
    const horario = opcaoComPrefixo(sender.ultima, 'hor:')

    await cliente({ toca: horario })
    expect(corpo(sender.ultima)).toContain('Confere para mim?')
    expect(opcoes(sender.ultima)).toContain('ok:sim')

    await cliente({ toca: 'ok:sim' })
    expect(corpo(sender.ultima)).toContain('Agendamento confirmado')

    const agendamento = await queryOne<{ status: string; barber: string }>(
      `SELECT a.status, b.name AS barber FROM appointments a JOIN barbers b ON b.id = a.barber_id`,
    )
    expect(agendamento!.status).toBe('scheduled')
    // "Sem preferência" resolveu para um barbeiro de verdade.
    expect(['Rafael', 'Diego']).toContain(agendamento!.barber)
  })

  it('enfileira os lembretes ao marcar, e nenhuma confirmação repetida', async () => {
    await marcarUmHorario(1) // depois de amanhã: dá tempo para o lembrete de véspera

    const fila = await query<{ kind: string; status: string; scheduled_for: Date }>(
      'SELECT kind, status, scheduled_for FROM outbox ORDER BY scheduled_for',
    )
    const tipos = fila.map((linha) => linha.kind)

    expect(tipos).toContain('lembrete24h')

    // O lembrete da véspera fica para o futuro.
    const vespera = fila.find((linha) => linha.kind === 'lembrete24h')!
    expect(vespera.scheduled_for.getTime()).toBeGreaterThan(Date.now())

    // A confirmação já foi entregue na conversa como resposta ao "Confirmar" —
    // nada na fila pode repeti-la, senão o cliente recebe a mesma coisa duas
    // vezes seguidas.
    expect(tipos).not.toContain('confirmacao')
    const repetidas = await query<{ id: string }>(
      `SELECT id FROM outbox WHERE payload::text LIKE '%Agendamento confirmado%'`,
    )
    expect(repetidas).toHaveLength(0)
  })

  it('não agenda lembrete de 24h para um corte que é hoje ou amanhã cedo', async () => {
    // Marcar para daqui a poucas horas: a véspera já passou, então o lembrete
    // de 24h não faz sentido e não pode entrar na fila.
    await marcarUmHorario(0)

    const lembretes = await query<{ kind: string }>(
      `SELECT kind FROM outbox WHERE kind = 'lembrete24h'`,
    )
    expect(lembretes).toHaveLength(0)
  })

  it('cancelar devolve o horário e limpa os lembretes da fila', async () => {
    await marcarUmHorario()

    await cliente({ toca: 'menu' })
    await cliente({ toca: 'menu:meus' })
    const agendamento = opcaoComPrefixo(sender.ultima, 'apt:')

    await cliente({ toca: agendamento })
    const cancelar = opcaoComPrefixo(sender.ultima, 'apt:cancelar:')

    await cliente({ toca: cancelar })
    expect(corpo(sender.ultima)).toContain('Cancelar o horário')

    const confirmar = opcaoComPrefixo(sender.ultima, 'del:sim:')
    await cliente({ toca: confirmar })
    expect(corpo(sender.ultima)).toContain('cancelado')

    const status = await queryOne<{ status: string }>('SELECT status FROM appointments')
    expect(status!.status).toBe('cancelled')

    // Os lembretes que ainda não saíram não podem chegar depois do cancelamento.
    const pendentes = await query<{ id: string }>(
      `SELECT id FROM outbox WHERE status = 'pending' AND kind LIKE 'lembrete%'`,
    )
    expect(pendentes).toHaveLength(0)
  })

  it('a mesma mensagem reenviada pela Meta não é atendida duas vezes', async () => {
    await cliente({ texto: 'oi' })
    const respostas = sender.enviadas.length

    // Reenvio: mesmo id de mensagem.
    await processPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [
                  { id: 'wamid.in.1', from: CLIENTE, type: 'text', text: { body: 'oi' }, timestamp: '1' },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(sender.enviadas.length).toBe(respostas)
  })

  it('"sair" corta as mensagens automáticas', async () => {
    await cliente({ texto: 'sair' })

    expect(corpo(sender.ultima)).toContain('não vai mais receber')

    const contato = await queryOne<{ opted_out: boolean }>('SELECT opted_out FROM contacts LIMIT 1')
    expect(contato!.opted_out).toBe(true)
  })

  it('"falar com atendente" cala o bot naquela conversa', async () => {
    await cliente({ texto: 'oi' })
    await cliente({ toca: 'menu:atendente' })
    expect(corpo(sender.ultima)).toContain('avisei a equipe')

    const antes = sender.enviadas.length
    await cliente({ texto: 'alô?' })
    expect(sender.enviadas.length).toBe(antes) // silêncio

    // ...mas "menu" traz o bot de volta.
    await cliente({ texto: 'menu' })
    expect(sender.enviadas.length).toBeGreaterThan(antes)
  })

  it('mensagem para um número que não é de nenhuma barbearia é ignorada', async () => {
    const antes = sender.enviadas.length

    await processPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'numero-desconhecido' },
                messages: [{ id: 'wamid.x', from: CLIENTE, type: 'text', text: { body: 'oi' }, timestamp: '1' }],
              },
            },
          ],
        },
      ],
    })

    expect(sender.enviadas.length).toBe(antes)
  })

  it('respeita o limite de agendamentos por cliente', async () => {
    // Os dois primeiros entram direto no banco: percorrer o menu duas vezes só
    // para chegar no terceiro gastaria toques à toa (e esbarraria no freio
    // contra enxurrada, que é outro teste).
    await semearAgendamentos(2)

    // O terceiro esbarra no maxPerContact (padrão: 2).
    await cliente({ toca: 'menu' })
    await cliente({ toca: 'menu:agendar' })
    const servico = opcaoComPrefixo(sender.ultima, 'svc:')
    await cliente({ toca: servico })
    await cliente({ toca: 'brb:any' })
    const dia = opcaoComPrefixo(sender.ultima, 'day:')
    await cliente({ toca: dia })
    const horario = opcaoComPrefixo(sender.ultima, 'hor:')
    await cliente({ toca: horario })
    await cliente({ toca: 'ok:sim' })

    expect(corpo(sender.ultima)).toContain('já tem')
  })

  /** Cria N agendamentos futuros para o cliente, direto no banco. */
  async function semearAgendamentos(quantos: number): Promise<void> {
    const contato = await upsertContact(
      (await queryOne<{ id: string }>('SELECT id FROM tenants'))!.id,
      CLIENTE,
      'João Cliente',
      new Date(),
    )
    const barbeiro = await queryOne<{ id: string }>('SELECT id FROM barbers LIMIT 1')
    const servico = await queryOne<{ id: string }>('SELECT id FROM services LIMIT 1')

    for (let i = 0; i < quantos; i += 1) {
      const inicio = new Date(Date.now() + (i + 3) * 24 * 60 * 60 * 1000)
      await query(
        `INSERT INTO appointments (tenant_id, contact_id, barber_id, service_id, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [contato.tenantId, contato.id, barbeiro!.id, servico!.id, inicio, new Date(inicio.getTime() + 40 * 60_000)],
      )
    }
  }

  /**
   * Percorre o fluxo até confirmar.
   *
   * `diaIndex` escolhe qual dia da lista tocar: o lembrete de 24h só entra na
   * fila quando o corte está a mais de um dia de distância, então o teste dele
   * precisa de um dia mais à frente.
   */
  async function marcarUmHorario(diaIndex = 0): Promise<void> {
    await cliente({ toca: 'menu' })
    await cliente({ toca: 'menu:agendar' })
    const servico = opcaoComPrefixo(sender.ultima, 'svc:')
    await cliente({ toca: servico })
    await cliente({ toca: 'brb:any' })

    const dias = opcoes(sender.ultima).filter((id) => id.startsWith('day:') && !id.startsWith('day:mais'))
    await cliente({ toca: dias[diaIndex]! })

    const horario = opcaoComPrefixo(sender.ultima, 'hor:')
    await cliente({ toca: horario })
    await cliente({ toca: 'ok:sim' })
  }
})
