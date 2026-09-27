import { DateTime } from 'luxon'
import type { Contact } from '../db/repositories/contacts.js'
import {
  agendaBetween,
  findReservation,
  markArrival,
  resumo,
  type ReservationDetail,
  type ResumoPeriodo,
} from '../db/repositories/reservations.js'
import { normalizePhone } from '@restaurante/shared/lib/whatsapp'
import { env } from '../env.js'
import { formatDayLabel, formatTime } from '../lib/datetime.js'
import type { TenantContext } from '../tenants/registry.js'
import type { StaffMember } from '../tenants/types.js'
import { buttonMessage, listMessage, type ListRow, type OutgoingMessage } from '../whatsapp/payloads.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import { send } from './handler.js'
import { pessoas } from './screens.js'
import { makeT, type T } from './textos.js'

/**
 * Painel da recepção.
 *
 * É o menu do dono com menos poder, pensado para quem fica na porta: a lista da
 * noite, quem chegou, quem faltou. O dono manda no restaurante — aprova grupo
 * grande, fecha a agenda, cala o bot. A recepção só registra o que está
 * acontecendo no salão, e é esse registro que vira o "compareceram / faltaram"
 * do relatório do dono.
 *
 * Quem tem o painel: cada pessoa do `team[]` do config com o `phone`
 * preenchido (editável no estúdio). Sem telefone, a pessoa só aparece no site,
 * e escrever para o restaurante a atende como cliente.
 *
 * A separação é de dado, não só de menu: TODA consulta daqui filtra pelo
 * `tenant_id` que veio do número que recebeu a mensagem — nunca do payload do
 * botão. Não existe id de botão que alguém possa forjar para marcar a reserva
 * de outro restaurante.
 *
 * O dono também chega aqui, pelo item "Marcar chegadas" do menu dele: em
 * restaurante pequeno quem recebe o cliente na porta é o próprio dono.
 *
 * Como em `owner.ts`, nenhuma frase mora aqui: todo texto vem do catálogo pelo
 * `t()`, e o restaurante sobrescreve o que quiser em `whatsapp.textos`.
 */

export const STAFF_ACTION = {
  /** Tudo que começa com isto é da recepção — é assim que o handler roteia o dono. */
  prefix: 'recepcao:',
  menu: 'recepcao:menu',
  hoje: 'recepcao:hoje',
  amanha: 'recepcao:amanha',
  chegadas: 'recepcao:chegadas',
  chegadasMais: 'recepcao:chegadas:mais:',
  reserva: 'recepcao:res:',
  chegou: 'recepcao:chegou:',
  faltou: 'recepcao:faltou:',
  resumo: 'recepcao:resumo',
} as const

/** Quem está usando o painel: alguém da equipe, ou o dono pelo atalho dele. */
export interface StaffIdentity {
  name: string
  isOwner: boolean
}

/**
 * Quem é da equipe e está escrevendo — ou `null`, se for um cliente.
 *
 * Lê do `ctx.staff`, que o registry já mantém em cache por 60s junto do
 * tenant: nenhuma consulta a mais por mensagem recebida.
 */
export function findStaff(ctx: TenantContext, waId: string): StaffMember | null {
  const numero = normalizePhone(waId, env.defaultCountryCode)
  if (numero === '') return null

  // Normalizamos os dois lados: o banco já guarda normalizado, mas uma linha
  // gravada antes de um sync, ou um sync que não rodou, não pode fazer o painel
  // abrir para a pessoa errada. São poucos itens.
  return (
    ctx.staff.find(
      (member) => member.phone !== '' && normalizePhone(member.phone, env.defaultCountryCode) === numero,
    ) ?? null
  )
}

export async function handleStaffMessage(
  ctx: TenantContext,
  contact: Contact,
  who: StaffIdentity,
  inbound: NormalizedInbound,
  now: Date,
): Promise<void> {
  const message = await buildStaffReply(ctx, contact, who, inbound, now)
  await send(ctx, contact, message)
}

async function buildStaffReply(
  ctx: TenantContext,
  contact: Contact,
  who: StaffIdentity,
  inbound: NormalizedInbound,
  now: Date,
): Promise<OutgoingMessage> {
  const action = inbound.action ?? ''
  const to = contact.waId

  switch (true) {
    case action === STAFF_ACTION.hoje:
      return agendaMessage(ctx, to, 0, now)

    case action === STAFF_ACTION.amanha:
      return agendaMessage(ctx, to, 1, now)

    // Antes de `chegadas`: o prefixo da página seguinte começa igual.
    case action.startsWith(STAFF_ACTION.chegadasMais):
      return chegadasMessage(ctx, to, Number(action.slice(STAFF_ACTION.chegadasMais.length)) || 0, now)

    case action === STAFF_ACTION.chegadas:
      return chegadasMessage(ctx, to, 0, now)

    case action.startsWith(STAFF_ACTION.reserva):
      return reservaMessage(ctx, to, action.slice(STAFF_ACTION.reserva.length), now)

    case action.startsWith(STAFF_ACTION.chegou):
      return marcar(ctx, to, action.slice(STAFF_ACTION.chegou.length), true)

    case action.startsWith(STAFF_ACTION.faltou):
      return marcar(ctx, to, action.slice(STAFF_ACTION.faltou.length), false)

    case action === STAFF_ACTION.resumo:
      return resumoMessage(ctx, to, now)

    default:
      return staffMenu(ctx, to, who)
  }
}

function staffMenu(ctx: TenantContext, to: string, who: StaffIdentity): OutgoingMessage {
  const { tenant } = ctx
  const t = makeT(tenant.config)

  const rows: ListRow[] = [
    { id: STAFF_ACTION.hoje, title: t('rotulos.recepcao.hoje') },
    { id: STAFF_ACTION.amanha, title: t('rotulos.recepcao.amanha') },
    {
      id: STAFF_ACTION.chegadas,
      title: t('rotulos.recepcao.chegadas'),
      description: t('rotulos.recepcao.chegadasDesc'),
    },
    {
      id: STAFF_ACTION.resumo,
      title: t('rotulos.recepcao.resumo'),
      description: t('rotulos.recepcao.resumoDesc'),
    },
  ]
  // O dono entrou pelo atalho: precisa de um caminho de volta para o menu dele.
  if (who.isOwner) rows.push({ id: 'dono:menu', title: t('rotulos.dono.menu') })

  return listMessage(
    to,
    t('recepcao.menu.titulo', { nome: who.name, marca: tenant.config.brand.name }),
    t('rotulos.lista.verOpcoes'),
    [{ title: t('rotulos.secao.recepcao'), rows }],
  )
}

/** "20:00 · Marina · 4 pessoas · Salão ✅" — a linha das listas do dono e da recepção. */
export function agendaLinha(t: T, reservation: ReservationDetail, timezone: string): string {
  return t('recepcao.agenda.linha', {
    hora: formatTime(reservation.startsAt, timezone),
    cliente: reservation.contactName || reservation.contactWaId,
    pessoas: pessoas(t, reservation.partySize),
    ambiente: reservation.areaName,
    status: statusMarca(t, reservation),
  })
}

function statusMarca(t: T, reservation: ReservationDetail): string {
  switch (reservation.status) {
    case 'pending':
      return t('rotulos.status.marcaPendente')
    case 'confirmed':
      return t('rotulos.status.marcaConfirmada')
    case 'arrived':
      return t('rotulos.status.marcaChegou')
    case 'no_show':
      return t('rotulos.status.marcaFaltou')
    default:
      return ''
  }
}

/** Um bloco do resumo: "*Hoje* — 12 reservas, 38 pessoas · 10 vieram, 1 faltou". */
export function resumoTexto(t: T, periodo: string, dados: ResumoPeriodo): string {
  return t('recepcao.resumo.bloco', {
    periodo,
    reservas: dados.reservas,
    pessoas: pessoas(t, dados.pessoas),
    compareceram: dados.compareceram,
    faltaram: dados.faltaram,
  })
}

async function agendaDoDia(ctx: TenantContext, dayOffset: number, now: Date): Promise<ReservationDetail[]> {
  const { tenant } = ctx
  const day = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day').plus({ days: dayOffset })
  return agendaBetween(tenant.id, day.toJSDate(), day.plus({ days: 1 }).toJSDate())
}

async function agendaMessage(ctx: TenantContext, to: string, dayOffset: number, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const day = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day').plus({ days: dayOffset })
  // A recepção não decide pedido de grupo grande: pendente fica de fora até o
  // dono aprovar, para ninguém arrumar mesa para quem ainda pode ser recusado.
  const reservations = (await agendaDoDia(ctx, dayOffset, now)).filter((r) => r.status !== 'pending')

  const label = formatDayLabel(day.toJSDate(), tenant.timezone, now)
  const buttons = [
    ...(dayOffset === 0 ? [{ id: STAFF_ACTION.chegadas, title: t('rotulos.recepcao.marcar') }] : []),
    { id: STAFF_ACTION.menu, title: t('rotulos.recepcao.voltar') },
  ]

  if (reservations.length === 0) {
    return buttonMessage(to, t('recepcao.agenda.vazia', { dia: label }), [
      { id: STAFF_ACTION.menu, title: t('rotulos.recepcao.voltar') },
    ])
  }

  const total = reservations.reduce((sum, reservation) => sum + reservation.partySize, 0)
  const body = [
    t('recepcao.agenda.titulo', { dia: label, total: reservations.length, pessoas: pessoas(t, total) }),
    '',
    ...reservations.map((reservation) => agendaLinha(t, reservation, tenant.timezone)),
  ].join('\n')

  return buttonMessage(to, body, buttons)
}

/**
 * A lista para marcar chegada: as reservas de hoje, na ordem do horário. Quem já
 * foi marcado continua na lista (com a marca), para dar para corrigir.
 */
async function chegadasMessage(ctx: TenantContext, to: string, offset: number, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const reservations = (await agendaDoDia(ctx, 0, now)).filter((r) => r.status !== 'pending')

  if (reservations.length === 0) {
    return buttonMessage(to, t('recepcao.chegadas.vazio'), [
      { id: STAFF_ACTION.menu, title: t('rotulos.recepcao.voltar') },
    ])
  }

  const page = reservations.slice(offset, offset + 8)
  const rows: ListRow[] = page.map((reservation) => {
    const marca = statusMarca(t, reservation)
    return {
      id: `${STAFF_ACTION.reserva}${reservation.id}`,
      title: `${formatTime(reservation.startsAt, tenant.timezone)} ${reservation.contactName || reservation.contactWaId}`,
      description: `${pessoas(t, reservation.partySize)} · ${reservation.areaName}${marca}`,
    }
  })
  if (reservations.length > offset + page.length) {
    rows.push({ id: `${STAFF_ACTION.chegadasMais}${offset + page.length}`, title: t('rotulos.linha.maisReservas') })
  }
  rows.push({ id: STAFF_ACTION.menu, title: t('rotulos.recepcao.voltarLista') })

  return listMessage(to, t('recepcao.chegadas.corpo'), t('rotulos.lista.verReservas'), [
    { title: t('rotulos.secao.hoje'), rows },
  ])
}

/** Uma reserva da lista, com os dois botões que importam na porta. */
async function reservaMessage(
  ctx: TenantContext,
  to: string,
  reservationId: string,
  now: Date,
): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const reservation = await findReservation(reservationId)
  if (!reservation || reservation.tenantId !== tenant.id) return chegadasMessage(ctx, to, 0, now)

  const body = t('recepcao.reserva.corpo', {
    cliente: reservation.contactName || t('dono.semNome'),
    waId: reservation.contactWaId,
    hora: formatTime(reservation.startsAt, tenant.timezone),
    pessoas: pessoas(t, reservation.partySize),
    ambiente: reservation.areaName,
    status: statusMarca(t, reservation),
  })

  return buttonMessage(to, body, [
    { id: `${STAFF_ACTION.chegou}${reservation.id}`, title: t('rotulos.recepcao.chegou') },
    { id: `${STAFF_ACTION.faltou}${reservation.id}`, title: t('rotulos.recepcao.faltou') },
    { id: STAFF_ACTION.chegadas, title: t('rotulos.recepcao.voltar') },
  ])
}

async function marcar(ctx: TenantContext, to: string, reservationId: string, arrived: boolean): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)

  const marked = await markArrival(tenant.id, reservationId, arrived)
  const next = [
    { id: STAFF_ACTION.chegadas, title: t('rotulos.recepcao.proxima') },
    { id: STAFF_ACTION.menu, title: t('rotulos.recepcao.menu') },
  ]

  if (!marked) return buttonMessage(to, t('recepcao.marcar.naoEncontrada'), next)

  const cliente = marked.contactName || t('dono.semNome')
  const body = arrived
    ? t('recepcao.marcar.chegou', { cliente, pessoas: pessoas(t, marked.partySize), ambiente: marked.areaName })
    : t('recepcao.marcar.faltou', { cliente })

  return buttonMessage(to, body, next)
}

async function resumoMessage(ctx: TenantContext, to: string, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const hoje = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')

  const dados = await resumo(tenant.id, {
    ontem: hoje.minus({ days: 1 }).toJSDate(),
    hoje: hoje.toJSDate(),
    amanha: hoje.plus({ days: 1 }).toJSDate(),
    semana: hoje.minus({ days: 6 }).toJSDate(),
    mes: hoje.startOf('month').toJSDate(),
  })

  const body = [
    resumoTexto(t, t('dono.relatorio.hoje'), dados.hoje),
    resumoTexto(t, t('dono.relatorio.ontem'), dados.ontem),
  ].join('\n\n')

  return buttonMessage(to, body, [{ id: STAFF_ACTION.menu, title: t('rotulos.recepcao.voltar') }])
}
