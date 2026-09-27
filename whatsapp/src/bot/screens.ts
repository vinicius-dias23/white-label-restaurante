import { DAY_KEYS, DAY_LABELS, type MenuItem, type SiteConfig } from '@restaurante/shared/config'
import { formatRanges } from '@restaurante/shared/lib/hours'
import { mapsUrl } from '@restaurante/shared/lib/whatsapp'
import { openStateInZone } from '../booking/open-state.js'
import { groupByPeriod, PERIOD_LABELS, type Period } from '../booking/slots.js'
import { formatDateTime, formatDayLabel, formatDayShort, formatTime } from '../lib/datetime.js'
import type { AreaRecord, Tenant } from '../tenants/types.js'
import {
  buttonMessage,
  listMessage,
  textMessage,
  type ListRow,
  type ListSection,
  type OutgoingMessage,
} from '../whatsapp/payloads.js'
import { ACTION } from './machine.js'
import { makeT, type T } from './textos.js'

/**
 * As telas do atendimento: dados → payload do WhatsApp.
 *
 * Também são funções puras, então o teste consegue percorrer o menu inteiro e
 * conferir que nada estoura os limites da Meta — que é onde a integração
 * costuma quebrar em produção, com o cliente olhando.
 *
 * Nenhuma frase mora aqui: todo texto vem do catálogo (`config/textos.ts`) pelo
 * `t()`, e o restaurante sobrescreve o que quiser em `whatsapp.textos`. O que
 * sobra nestas funções é a montagem do payload e as regras de quando cada
 * pedaço aparece.
 *
 * Por isso toda tela recebe o `t` do restaurante — inclusive as que não usam
 * mais nenhum outro dado dele.
 */

/** Quantas linhas sobram para conteúdo depois de reservar a de "voltar ao menu". */
const ROWS_WITH_BACK = 9

/** Na lista "Quantas pessoas?", até quantos números aparecem antes do "ou mais". */
const PARTY_ROWS = 8

const backRow = (t: T): ListRow => ({ id: ACTION.menu, title: t('rotulos.linha.voltarMenu') })

/** Atalho para as telas que recebem o tenant inteiro. */
const tenantT = (tenant: Tenant): T => makeT(tenant.config)

function greeting(t: T, config: SiteConfig): string {
  return t('cliente.menu.saudacao', { marca: config.brand.name })
}

/** "1 pessoa", "4 pessoas". */
export function pessoas(t: T, total: number): string {
  return total === 1 ? t('rotulos.pessoa.uma') : t('rotulos.pessoa.varias', { total })
}

// ---------------------------------------------------------------------------
// Menu principal
// ---------------------------------------------------------------------------

export function menuScreen(to: string, tenant: Tenant, prefix = ''): OutgoingMessage {
  const { config } = tenant
  const t = tenantT(tenant)

  const rows: ListRow[] = [
    {
      id: ACTION.reservar,
      title: t('rotulos.menu.reservar'),
      description: t('rotulos.menu.reservarDesc'),
    },
    { id: ACTION.minhas, title: t('rotulos.menu.minhas'), description: t('rotulos.menu.minhasDesc') },
  ]

  if (config.menu.items.length > 0 || config.menu.url) {
    rows.push({
      id: ACTION.cardapio,
      title: t('rotulos.menu.cardapio'),
      description: t('rotulos.menu.cardapioDesc'),
    })
  }
  rows.push({ id: ACTION.horarios, title: t('rotulos.menu.horarios') })

  if (config.contact.address) {
    rows.push({
      id: ACTION.endereco,
      title: t('rotulos.menu.endereco'),
      description: t('rotulos.menu.enderecoDesc'),
    })
  }
  if (config.whatsapp.paymentMethods) {
    rows.push({ id: ACTION.pagamento, title: t('rotulos.menu.pagamento') })
  }
  rows.push({
    id: ACTION.atendente,
    title: t('rotulos.menu.atendente'),
    description: t('rotulos.menu.atendenteDesc'),
  })

  const corpo = t('cliente.menu.corpo', {
    saudacao: greeting(t, config),
    marca: config.brand.name,
  })
  const body = prefix ? `${prefix}\n\n${corpo}` : corpo

  return listMessage(to, body, t('rotulos.lista.verOpcoes'), [
    { title: t('rotulos.secao.atendimento'), rows },
  ])
}

export function naoEntendiScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  return menuScreen(to, tenant, t('cliente.menu.naoEntendi'))
}

// ---------------------------------------------------------------------------
// Telas informativas
// ---------------------------------------------------------------------------

/** Pratos agrupados pela categoria, na ordem em que cada categoria aparece. */
function byCategory(items: MenuItem[]): [string, MenuItem[]][] {
  const groups = new Map<string, MenuItem[]>()
  for (const item of items) {
    const list = groups.get(item.category) ?? []
    list.push(item)
    groups.set(item.category, list)
  }
  return [...groups.entries()]
}

/**
 * O cardápio: os destaques com preço e, se houver, o link do completo.
 *
 * O link vai no corpo, e não num botão de URL, de propósito: a mensagem com
 * botão de link não aceita os botões de resposta, e "Reservar mesa" é o
 * próximo passo natural de quem acabou de olhar o cardápio.
 */
/** Quantos pratos vão na tela quando o dono não marcou nenhum destaque. */
const MAX_PRATOS_SEM_DESTAQUE = 6

export function cardapioScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  const { menu, brand } = tenant.config

  // Só os destaques, com preço: o cardápio inteiro não cabe numa mensagem (e
  // ninguém lê 40 pratos no WhatsApp). O resto está no link. Sem nenhum
  // destaque marcado, vão os primeiros pratos, para a tela não sair vazia.
  const highlights = menu.items.filter((item) => item.highlight)
  const shown = highlights.length > 0 ? highlights : menu.items.slice(0, MAX_PRATOS_SEM_DESTAQUE)

  const blocks = byCategory(shown).map(([category, items]) => {
    const lines = items.map((item) => {
      const price = item.price ? ` — ${item.price}` : ''
      const description = item.description ? `\n  ${item.description}` : ''
      return `• *${item.name}*${price}${description}`
    })
    return category ? [`*${category}*`, ...lines].join('\n') : lines.join('\n')
  })

  const parts = [t('cliente.cardapio.titulo', { marca: brand.name })]
  if (blocks.length > 0) parts.push(blocks.join('\n\n'))
  if (menu.url) parts.push(t('cliente.cardapio.link', { link: menu.url }))

  return buttonMessage(to, parts.join('\n\n'), [
    { id: ACTION.reservar, title: t('rotulos.botao.reservar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function horariosScreen(to: string, tenant: Tenant, now: Date = new Date()): OutgoingMessage {
  const { hours } = tenant.config
  const t = tenantT(tenant)
  const state = openStateInZone(hours, tenant.timezone, now)

  const table = DAY_KEYS.map((day) => `${DAY_LABELS[day].padEnd(8)} ${formatRanges(hours[day])}`)

  const status = state.open
    ? t('cliente.horarios.aberto')
    : state.nextOpening
      ? t('cliente.horarios.fechadoComProxima', {
          dia: state.nextOpening.label,
          hora: state.nextOpening.time,
        })
      : t('cliente.horarios.fechado')

  const body = [status, '', t('cliente.horarios.titulo'), ...table].join('\n')

  return buttonMessage(to, body, [
    { id: ACTION.reservar, title: t('rotulos.botao.reservar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function enderecoScreen(to: string, tenant: Tenant): OutgoingMessage {
  const { contact, brand } = tenant.config
  const link = mapsUrl(contact.address, contact.mapsUrl)

  const t = tenantT(tenant)
  const body = t('cliente.endereco.corpo', {
    marca: brand.name,
    endereco: contact.address,
    link,
  })

  // preview_url ligado: o WhatsApp mostra o cartão do mapa embaixo da mensagem.
  return textMessage(to, body, true)
}

export function pagamentoScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  const body = t('cliente.pagamento.corpo', { formas: tenant.config.whatsapp.paymentMethods })

  return buttonMessage(to, body, [
    { id: ACTION.reservar, title: t('rotulos.botao.reservar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function atendenteScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  const minutes = tenant.config.whatsapp.handoffMinutes
  const pausa = minutes > 0 ? t('cliente.atendente.pausa', { minutos: minutes }) : ''

  return textMessage(to, t('cliente.atendente.corpo', { pausa }))
}

// ---------------------------------------------------------------------------
// Fluxo de reserva
// ---------------------------------------------------------------------------

/**
 * "Quantas pessoas?" — de 1 até 8 na lista, e "9 ou mais" para digitar.
 *
 * Oito linhas porque a lista cabe dez: sobra uma para o "ou mais" e uma para
 * voltar. Restaurante que só aceita grupos pequenos (`maxPartySize` menor que
 * 8) não mostra o "ou mais".
 */
export function escolherPessoasScreen(to: string, t: T, maxPartySize: number): OutgoingMessage {
  const visible = Math.min(PARTY_ROWS, maxPartySize)
  const rows: ListRow[] = Array.from({ length: visible }, (_, index) => ({
    id: `${ACTION.party}${index + 1}`,
    title: pessoas(t, index + 1),
  }))

  if (maxPartySize > PARTY_ROWS) {
    rows.push({
      id: ACTION.partyMore,
      title: t('rotulos.linha.maisPessoas', { total: PARTY_ROWS + 1 }),
      description: t('rotulos.linha.maisPessoasDesc'),
    })
  }
  rows.push(backRow(t))

  return listMessage(to, t('cliente.escolherPessoas.corpo'), t('rotulos.lista.escolher'), [
    { title: t('rotulos.secao.pessoas'), rows },
  ])
}

export function digitarPessoasScreen(to: string, t: T, maxPartySize: number): OutgoingMessage {
  return buttonMessage(to, t('cliente.digitarPessoas.corpo', { maximo: maxPartySize }), [
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

/** Grupo maior do que o bot aceita, ou maior que qualquer ambiente. */
export function grupoGrandeScreen(to: string, t: T, partySize: number): OutgoingMessage {
  return buttonMessage(to, t('cliente.grupoGrande.corpo', { pessoas: pessoas(t, partySize) }), [
    { id: ACTION.atendente, title: t('rotulos.botao.atendente') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function escolherAmbienteScreen(
  to: string,
  t: T,
  areas: AreaRecord[],
  /** Descrição de cada ambiente, pelo nome — vem do config, não do banco. */
  descriptions: Record<string, string>,
  partySize: number,
): OutgoingMessage {
  const rows: ListRow[] = [
    {
      id: ACTION.areaAny,
      title: t('rotulos.linha.tantoFaz'),
      description: t('rotulos.linha.tantoFazDesc'),
    },
    ...areas.slice(0, ROWS_WITH_BACK - 1).map((area) => {
      const row: ListRow = { id: `${ACTION.area}${area.id}`, title: area.name }
      const description = descriptions[area.name]
      if (description) row.description = description
      return row
    }),
  ]
  rows.push(backRow(t))

  return listMessage(
    to,
    t('cliente.escolherAmbiente.corpo', { pessoas: pessoas(t, partySize) }),
    t('rotulos.lista.escolher'),
    [{ title: t('rotulos.secao.ambientes'), rows }],
  )
}

export interface DayOption {
  day: string
  date: Date
}

export function escolherDiaScreen(
  to: string,
  t: T,
  days: DayOption[],
  timezone: string,
  offset: number,
  now: Date = new Date(),
): OutgoingMessage {
  const page = days.slice(offset, offset + 8)
  const hasMore = days.length > offset + page.length

  const rows: ListRow[] = page.map((option) => ({
    id: `${ACTION.day}${option.day}`,
    title: formatDayShort(option.date, timezone, now),
  }))

  if (hasMore) {
    rows.push({ id: `${ACTION.dayMore}:${offset + page.length}`, title: t('rotulos.linha.maisDias') })
  }
  rows.push(backRow(t))

  return listMessage(to, t('cliente.escolherDia.corpo'), t('rotulos.lista.escolherDia'), [
    { title: t('rotulos.secao.dias'), rows },
  ])
}

export function escolherHorarioScreen(
  to: string,
  t: T,
  date: Date,
  slots: Date[],
  timezone: string,
  offset: number,
  now: Date = new Date(),
): OutgoingMessage {
  const page = slots.slice(offset, offset + 8)
  const hasMore = slots.length > offset + page.length

  // As linhas saem agrupadas por turno: o sábado inteiro cabe numa lista só, e
  // o cliente ainda enxerga "almoço" e "jantar" sem precisar de uma pergunta extra.
  const groups = groupByPeriod(page, timezone)
  const sections: ListSection[] = (Object.keys(groups) as Period[])
    .filter((period) => groups[period].length > 0)
    .map((period) => ({
      title: PERIOD_LABELS[period],
      rows: groups[period].map((slot) => ({
        id: `${ACTION.time}${slot.toISOString()}`,
        title: formatTime(slot, timezone),
      })),
    }))

  const extra: ListRow[] = []
  if (hasMore) {
    extra.push({
      id: `${ACTION.timeMore}:${offset + page.length}`,
      title: t('rotulos.linha.maisHorarios'),
    })
  }
  extra.push(backRow(t))
  sections.push({ title: t('rotulos.secao.outrasOpcoes'), rows: extra })

  return listMessage(
    to,
    t('cliente.escolherHorario.corpo', { dia: formatDayLabel(date, timezone, now) }),
    t('rotulos.lista.verHorarios'),
    sections,
  )
}

export interface BookingSummary {
  partySize: number
  areaName: string
  slot: Date
}

export function confirmarScreen(
  to: string,
  t: T,
  summary: BookingSummary,
  timezone: string,
  approval: boolean,
  now: Date = new Date(),
): OutgoingMessage {
  const body = t('cliente.confirmar.corpo', {
    pessoas: pessoas(t, summary.partySize),
    ambiente: summary.areaName,
    data: formatDateTime(summary.slot, timezone, now),
    aprovacao: approval ? t('cliente.confirmar.aprovacao') : '',
  })

  return buttonMessage(to, body, [
    { id: ACTION.confirm, title: t('rotulos.botao.confirmar') },
    { id: ACTION.changeTime, title: t('rotulos.botao.trocarHorario') },
    { id: ACTION.abort, title: t('rotulos.botao.cancelar') },
  ])
}

/**
 * Confirmação da reserva — a ÚNICA que o cliente recebe.
 *
 * Ela é a resposta ao toque em "Confirmar", então sai na hora e traz tudo:
 * pessoas, ambiente, data e endereço. Não existe uma segunda confirmação saindo
 * pela fila; duas mensagens iguais em sequência só poluem a conversa. Os
 * lembretes de 24h e 2h continuam vindo pela fila.
 */
export function reservadoScreen(
  to: string,
  summary: BookingSummary,
  tenant: Tenant,
  now: Date = new Date(),
): OutgoingMessage {
  const t = tenantT(tenant)
  const endereco = tenant.config.contact.address
    ? t('cliente.reservado.endereco', { endereco: tenant.config.contact.address })
    : ''

  const body = t('cliente.reservado.corpo', {
    marca: tenant.config.brand.name,
    pessoas: pessoas(t, summary.partySize),
    ambiente: summary.areaName,
    data: formatDateTime(summary.slot, tenant.timezone, now),
    endereco,
  })

  return buttonMessage(to, body, [{ id: ACTION.menu, title: t('rotulos.botao.voltarMenu') }])
}

/** Grupo grande: o pedido foi registrado e segura os lugares, mas o dono decide. */
export function aguardandoAprovacaoScreen(
  to: string,
  summary: BookingSummary,
  tenant: Tenant,
  now: Date = new Date(),
): OutgoingMessage {
  const t = tenantT(tenant)
  const body = t('cliente.aguardandoAprovacao.corpo', {
    marca: tenant.config.brand.name,
    pessoas: pessoas(t, summary.partySize),
    ambiente: summary.areaName,
    data: formatDateTime(summary.slot, tenant.timezone, now),
  })

  return buttonMessage(to, body, [{ id: ACTION.menu, title: t('rotulos.botao.voltarMenu') }])
}

export function semHorarioScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.semHorario.corpo'), [
    { id: ACTION.atendente, title: t('rotulos.botao.atendente') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function horarioOcupadoScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.horarioOcupado.corpo'), [
    { id: ACTION.changeTime, title: t('rotulos.botao.verOutrosHorarios') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function limiteReservasScreen(to: string, t: T, limite: number): OutgoingMessage {
  const quantos =
    limite === 1 ? t('cliente.limiteReservas.um') : t('cliente.limiteReservas.varios', { limite })

  return buttonMessage(to, t('cliente.limiteReservas.corpo', { quantos }), [
    { id: ACTION.minhas, title: t('rotulos.botao.minhas') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

// ---------------------------------------------------------------------------
// Reservas do cliente
// ---------------------------------------------------------------------------

export interface ReservationSummary {
  id: string
  partySize: number
  areaName: string
  startsAt: Date
  pending: boolean
}

export function minhasReservasScreen(
  to: string,
  t: T,
  reservations: ReservationSummary[],
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  if (reservations.length === 0) {
    return buttonMessage(to, t('cliente.minhasReservas.vazio'), [
      { id: ACTION.reservar, title: t('rotulos.botao.reservarMesa') },
      { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
    ])
  }

  const rows: ListRow[] = reservations.slice(0, ROWS_WITH_BACK).map((reservation) => {
    const status = reservation.pending ? ` · ${t('rotulos.status.pendente')}` : ''
    return {
      id: `${ACTION.reservation}${reservation.id}`,
      title: formatDayShort(reservation.startsAt, timezone, now),
      description: `${formatTime(reservation.startsAt, timezone)} · ${pessoas(t, reservation.partySize)} · ${reservation.areaName}${status}`,
    }
  })
  rows.push(backRow(t))

  return listMessage(to, t('cliente.minhasReservas.titulo'), t('rotulos.lista.verReservas'), [
    { title: t('rotulos.secao.reservas'), rows },
  ])
}

export function acoesReservaScreen(
  to: string,
  t: T,
  reservation: ReservationSummary,
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  const body = t('cliente.acoesReserva.corpo', {
    data: formatDateTime(reservation.startsAt, timezone, now),
    pessoas: pessoas(t, reservation.partySize),
    ambiente: reservation.areaName,
    status: reservation.pending ? t('cliente.acoesReserva.pendente') : '',
  })

  return buttonMessage(to, body, [
    { id: `${ACTION.reschedule}${reservation.id}`, title: t('rotulos.botao.remarcar') },
    { id: `${ACTION.cancel}${reservation.id}`, title: t('rotulos.botao.cancelar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function confirmarCancelamentoScreen(
  to: string,
  t: T,
  reservation: ReservationSummary,
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  const body = t('cliente.confirmarCancelamento.corpo', {
    data: formatDateTime(reservation.startsAt, timezone, now),
    pessoas: pessoas(t, reservation.partySize),
    ambiente: reservation.areaName,
  })

  return buttonMessage(to, body, [
    { id: `${ACTION.cancelYes}${reservation.id}`, title: t('rotulos.botao.simCancelar') },
    { id: ACTION.cancelNo, title: t('rotulos.botao.naoManter') },
  ])
}

export function canceladoScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.cancelado.corpo'), [
    { id: ACTION.reservar, title: t('rotulos.botao.reservarOutra') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function cancelamentoTardeScreen(to: string, t: T, deadlineHours: number): OutgoingMessage {
  return buttonMessage(to, t('cliente.cancelamentoTarde.corpo', { horas: deadlineHours }), [
    { id: ACTION.atendente, title: t('rotulos.botao.atendente') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function presencaConfirmadaScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.presencaConfirmada.corpo'), [
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

// ---------------------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------------------

export function optOutScreen(to: string, t: T): OutgoingMessage {
  return textMessage(to, t('cliente.optOut.corpo'))
}

export function optInScreen(to: string, t: T, brandName: string): OutgoingMessage {
  return textMessage(to, t('cliente.optIn.corpo', { marca: brandName }))
}
