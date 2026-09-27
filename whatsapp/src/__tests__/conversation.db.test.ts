import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { normalizeConfig } from '@restaurante/shared/config'
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
 * O atendimento inteiro, de "oi" até a mesa reservada.
 *
 * Roda o webhook de verdade contra o banco de verdade, trocando só a saída para
 * a Meta por um cliente falso. É o teste que pega o que os testes de unidade não
 * pegam: contexto perdido entre telas, botão que aponta para lugar nenhum,
 * reserva que não vira lembrete na fila, pedido de grupo que não chega ao dono.
 */

const temBanco = Boolean(env.databaseUrl)

const PHONE_NUMBER_ID = '111122223333444'
const CLIENTE = '5511977776666'
const DONO = '5511900001111'
const RECEPCAO = '5511955554444'

/** Aberto todo dia, do almoço até tarde: sempre existe mesa "hoje" para o teste. */
const TODOS: [string, string][] = [['12:00', '23:30']]

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

/** Simula o webhook da Meta com uma mensagem de `from` (o cliente, por padrão). */
async function cliente(input: { texto?: string; toca?: string; from?: string }): Promise<void> {
  sequencia += 1
  const from = input.from ?? CLIENTE
  const message: Record<string, unknown> = {
    id: `wamid.in.${sequencia}`,
    from,
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
              contacts: [{ wa_id: from, profile: { name: from === CLIENTE ? 'João Cliente' : 'Equipe' } }],
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
      brand: { name: 'Cantina do Zé' },
      contact: { whatsapp: '5511912345678', address: 'Rua das Palmeiras, 250' },
      menu: {
        url: 'https://exemplo.com/cardapio.pdf',
        items: [
          { name: 'Lasanha da Nonna', price: 'R$ 68', category: 'Massas', highlight: true },
          { name: 'Tiramisù', price: 'R$ 32', category: 'Sobremesas', highlight: true },
          { name: 'Água com gás', price: 'R$ 8', category: 'Bebidas', highlight: false },
        ],
      },
      areas: [
        { name: 'Salão', capacity: 20 },
        { name: 'Varanda', capacity: 10 },
      ],
      team: [
        { name: 'Giulia', role: 'Recepção', phone: RECEPCAO },
        { name: 'Marco', role: 'Garçom' },
      ],
      hours: {
        mon: TODOS,
        tue: TODOS,
        wed: TODOS,
        thu: TODOS,
        fri: TODOS,
        sat: TODOS,
        sun: TODOS,
      },
      booking: { maxPartySize: 20, approvalAbovePartySize: 8, lastSeatingMin: 0, leadTimeMin: 0 },
      whatsapp: { paymentMethods: 'Pix e cartão' },
    })

    const tenant = await upsertTenant({
      slug: 'ze',
      displayName: 'Cantina do Zé',
      phoneNumberId: PHONE_NUMBER_ID,
      wabaId: 'waba-1',
      accessToken: 'token-falso',
      ownerPhone: DONO,
      timezone: 'America/Sao_Paulo',
      config,
    })
    await syncCatalog(tenant)
  })

  it('responde qualquer texto com o menu, sem tentar interpretar', async () => {
    await cliente({ texto: 'boa tarde, tem mesa pra hoje?' })

    expect(corpo(sender.ultima)).toContain('Não entendi')
    expect(opcoes(sender.ultima)).toContain('menu:reservar')
  })

  it('mostra os destaques do cardápio com preço e o link do cardápio completo', async () => {
    await cliente({ texto: 'oi' })
    await cliente({ toca: 'menu:cardapio' })

    const texto = corpo(sender.ultima)
    expect(texto).toContain('Lasanha da Nonna')
    expect(texto).toContain('R$ 68')
    expect(texto).toContain('Tiramisù')
    // Só os destaques: o resto fica no link.
    expect(texto).not.toContain('Água com gás')
    expect(texto).toContain('https://exemplo.com/cardapio.pdf')
  })

  it('vai de "oi" até a mesa reservada', async () => {
    await cliente({ texto: 'oi' })
    expect(opcoes(sender.ultima)).toContain('menu:reservar')

    await cliente({ toca: 'menu:reservar' })
    expect(opcoes(sender.ultima)).toContain('pes:2')

    await cliente({ toca: 'pes:2' })
    expect(opcoes(sender.ultima)).toContain('amb:any')

    await cliente({ toca: 'amb:any' })
    const dia = opcaoComPrefixo(sender.ultima, 'day:')

    await cliente({ toca: dia })
    const horario = opcaoComPrefixo(sender.ultima, 'hor:')

    await cliente({ toca: horario })
    expect(corpo(sender.ultima)).toContain('Confere a reserva')
    expect(opcoes(sender.ultima)).toContain('ok:sim')

    await cliente({ toca: 'ok:sim' })
    expect(corpo(sender.ultima)).toContain('Mesa reservada')

    const reserva = await queryOne<{ status: string; party_size: number; area: string }>(
      `SELECT r.status, r.party_size, a.name AS area FROM reservations r JOIN areas a ON a.id = r.area_id`,
    )
    expect(reserva!.status).toBe('scheduled')
    expect(reserva!.party_size).toBe(2)
    // "Tanto faz" resolveu para um ambiente de verdade.
    expect(['Salão', 'Varanda']).toContain(reserva!.area)
  })

  it('o link do ambiente no site pula a escolha do ambiente', async () => {
    await cliente({ texto: 'Olá, Cantina do Zé! Gostaria de reservar uma mesa na Varanda.' })
    expect(opcoes(sender.ultima)).toContain('pes:2')

    await cliente({ toca: 'pes:2' })
    // Direto para os dias: o ambiente já veio da mensagem.
    opcaoComPrefixo(sender.ultima, 'day:')

    await reservarAteOFim()
    const reserva = await queryOne<{ area: string }>(
      'SELECT a.name AS area FROM reservations r JOIN areas a ON a.id = r.area_id',
    )
    expect(reserva!.area).toBe('Varanda')
  })

  it('grupo que não cabe na varanda nem aparece com ela na lista', async () => {
    await cliente({ toca: 'menu:reservar' })
    await cliente({ toca: 'pes:mais' })
    await cliente({ texto: '12' })

    // 12 pessoas: só o Salão (20) comporta. Com um ambiente só, o bot não pergunta.
    opcaoComPrefixo(sender.ultima, 'day:')
  })

  it('grupo acima do máximo vai para o atendente, não para a grade', async () => {
    await cliente({ toca: 'menu:reservar' })
    await cliente({ toca: 'pes:mais' })
    await cliente({ texto: '30 pessoas' })

    expect(corpo(sender.ultima)).toContain('combinar')
    expect(opcoes(sender.ultima)).toContain('menu:atendente')
  })

  it('grupo grande vira pedido, o dono aprova pelo WhatsApp e o cliente é avisado', async () => {
    // O dono falou com o número há pouco: está dentro da janela de 24h.
    await cliente({ texto: 'menu', from: DONO })
    sender.limpar()

    await cliente({ toca: 'menu:reservar' })
    await cliente({ toca: 'pes:mais' })
    await cliente({ texto: '10' })
    await cliente({ toca: 'amb:any' })
    await reservarAteOFim()
    expect(corpo(sender.ultima)).toContain('Pedido enviado')

    const pedido = await queryOne<{ id: string; status: string }>('SELECT id, status FROM reservations')
    expect(pedido!.status).toBe('pending')

    // O aviso com os botões foi para a fila do dono.
    const aviso = await queryOne<{ payload: unknown }>(
      `SELECT payload FROM outbox WHERE dedupe_key = $1`,
      [`${pedido!.id}:avisoDono:pedido`],
    )
    expect(JSON.stringify(aviso!.payload)).toContain(`dono:aprovar:${pedido!.id}`)

    // Pedido pendente não recebe lembrete — ainda não é uma reserva.
    const lembretes = await query(`SELECT 1 FROM outbox WHERE kind LIKE 'lembrete%'`)
    expect(lembretes).toHaveLength(0)

    await cliente({ toca: `dono:aprovar:${pedido!.id}`, from: DONO })

    const depois = await queryOne<{ status: string }>('SELECT status FROM reservations')
    expect(depois!.status).toBe('scheduled')
    const paraOCliente = sender.enviadas.filter((m) => m.to === CLIENTE).map(corpo)
    expect(paraOCliente.some((texto) => texto.includes('Reserva confirmada'))).toBe(true)

    // Tocar de novo (o dono tem dois celulares) não faz nada de novo.
    await cliente({ toca: `dono:recusar:${pedido!.id}`, from: DONO })
    const final = await queryOne<{ status: string }>('SELECT status FROM reservations')
    expect(final!.status).toBe('scheduled')
  })

  it('o dono recusa e os lugares voltam', async () => {
    await cliente({ toca: 'menu:reservar' })
    await cliente({ toca: 'pes:mais' })
    await cliente({ texto: '10' })
    await cliente({ toca: 'amb:any' })
    await reservarAteOFim()

    const pedido = await queryOne<{ id: string }>('SELECT id FROM reservations')
    await cliente({ toca: `dono:recusar:${pedido!.id}`, from: DONO })

    const depois = await queryOne<{ status: string }>('SELECT status FROM reservations')
    expect(depois!.status).toBe('declined')
    const paraOCliente = sender.enviadas.filter((m) => m.to === CLIENTE).map(corpo)
    expect(paraOCliente.some((texto) => texto.includes('não vamos conseguir'))).toBe(true)
  })

  it('a recepção vê as reservas de hoje e marca a chegada', async () => {
    await marcarUmaMesa(0)
    const reserva = await queryOne<{ id: string }>('SELECT id FROM reservations')
    sender.limpar()

    await cliente({ texto: 'oi', from: RECEPCAO })
    expect(corpo(sender.ultima)).toContain('Giulia')
    expect(opcoes(sender.ultima)).toContain('recepcao:chegadas')

    await cliente({ toca: 'recepcao:chegadas', from: RECEPCAO })
    expect(opcoes(sender.ultima)).toContain(`recepcao:res:${reserva!.id}`)

    await cliente({ toca: `recepcao:chegou:${reserva!.id}`, from: RECEPCAO })
    expect(corpo(sender.ultima)).toContain('chegou')

    const status = await queryOne<{ status: string }>('SELECT status FROM reservations')
    expect(status!.status).toBe('arrived')
  })

  it('a recepção não tem os botões do dono', async () => {
    await cliente({ texto: 'oi', from: RECEPCAO })
    const menu = opcoes(sender.ultima)
    expect(menu.some((id) => id.startsWith('dono:'))).toBe(false)

    // Um botão do dono digitado à mão não abre nada.
    await cliente({ toca: 'dono:pausar', from: RECEPCAO })
    const tenant = await queryOne<{ bot_paused_until: Date | null }>('SELECT bot_paused_until FROM tenants')
    expect(tenant!.bot_paused_until).toBeNull()
  })

  it('enfileira os lembretes ao reservar, e nenhuma confirmação repetida', async () => {
    await marcarUmaMesa(2) // depois de amanhã: dá tempo para o lembrete de véspera

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
      `SELECT id FROM outbox WHERE payload::text LIKE '%Mesa reservada%'`,
    )
    expect(repetidas).toHaveLength(0)
  })

  it('não agenda lembrete de 24h para uma mesa que é hoje', async () => {
    // Reservar para daqui a poucas horas: a véspera já passou, então o lembrete
    // de 24h não faz sentido e não pode entrar na fila.
    await marcarUmaMesa(0)

    const lembretes = await query<{ kind: string }>(
      `SELECT kind FROM outbox WHERE kind = 'lembrete24h'`,
    )
    expect(lembretes).toHaveLength(0)
  })

  it('cancelar devolve os lugares e limpa os lembretes da fila', async () => {
    await marcarUmaMesa(1)

    await cliente({ toca: 'menu' })
    await cliente({ toca: 'menu:minhas' })
    const reserva = opcaoComPrefixo(sender.ultima, 'res:')

    await cliente({ toca: reserva })
    const cancelar = opcaoComPrefixo(sender.ultima, 'res:cancelar:')

    await cliente({ toca: cancelar })
    expect(corpo(sender.ultima)).toContain('Cancelar a reserva')

    const confirmar = opcaoComPrefixo(sender.ultima, 'del:sim:')
    await cliente({ toca: confirmar })
    expect(corpo(sender.ultima)).toContain('cancelada')

    const status = await queryOne<{ status: string }>('SELECT status FROM reservations')
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

  it('mensagem para um número que não é de nenhum restaurante é ignorada', async () => {
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

  it('respeita o limite de reservas por cliente', async () => {
    // As duas primeiras entram direto no banco: percorrer o menu duas vezes só
    // para chegar na terceira gastaria toques à toa (e esbarraria no freio
    // contra enxurrada, que é outro teste).
    await semearReservas(2)

    // A terceira esbarra no maxPerContact (padrão: 2).
    await cliente({ toca: 'menu' })
    await cliente({ toca: 'menu:reservar' })
    await cliente({ toca: 'pes:2' })
    await cliente({ toca: 'amb:any' })
    await reservarAteOFim()

    expect(corpo(sender.ultima)).toContain('já tem')
  })

  /** Cria N reservas futuras para o cliente, direto no banco. */
  async function semearReservas(quantas: number): Promise<void> {
    const contato = await upsertContact(
      (await queryOne<{ id: string }>('SELECT id FROM tenants'))!.id,
      CLIENTE,
      'João Cliente',
      new Date(),
    )
    const ambiente = await queryOne<{ id: string }>(`SELECT id FROM areas WHERE name = 'Salão'`)

    for (let i = 0; i < quantas; i += 1) {
      const inicio = new Date(Date.now() + (i + 3) * 24 * 60 * 60 * 1000)
      await query(
        `INSERT INTO reservations (tenant_id, contact_id, area_id, party_size, starts_at, ends_at)
         VALUES ($1, $2, $3, 2, $4, $5)`,
        [contato.tenantId, contato.id, ambiente!.id, inicio, new Date(inicio.getTime() + 120 * 60_000)],
      )
    }
  }

  /** Da lista de dias em diante: toca no dia, no primeiro horário e confirma. */
  async function reservarAteOFim(diaIndex = 0): Promise<void> {
    const dias = opcoes(sender.ultima).filter((id) => id.startsWith('day:') && !id.startsWith('day:mais'))
    await cliente({ toca: dias[diaIndex]! })

    const horario = opcaoComPrefixo(sender.ultima, 'hor:')
    await cliente({ toca: horario })
    await cliente({ toca: 'ok:sim' })
  }

  /**
   * Percorre o fluxo de um casal até confirmar.
   *
   * `diaIndex` escolhe qual dia da lista tocar: o lembrete de 24h só entra na
   * fila quando a mesa está a mais de um dia de distância, então o teste dele
   * precisa de um dia mais à frente.
   */
  async function marcarUmaMesa(diaIndex = 0): Promise<void> {
    await cliente({ toca: 'menu' })
    await cliente({ toca: 'menu:reservar' })
    await cliente({ toca: 'pes:2' })
    await cliente({ toca: 'amb:any' })
    await reservarAteOFim(diaIndex)
  }
})
