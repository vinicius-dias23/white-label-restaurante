import { DateTime } from 'luxon'
import { findContactById, type Contact } from '../db/repositories/contacts.js'
import { cancelPendingForReservation } from '../db/repositories/outbox.js'
import {
  agendaBetween,
  approveReservation,
  createTimeBlock,
  declineReservation,
  findReservation,
  listPending,
  resumo,
  type ReservationDetail,
} from '../db/repositories/reservations.js'
import { setBotPaused } from '../db/repositories/tenants.js'
import { normalizePhone } from '@restaurante/shared/lib/whatsapp'
import { env } from '../env.js'
import { formatDayLabel, formatDayShort, formatTime } from '../lib/datetime.js'
import {
  pedidoAprovacao,
  reservaAprovadaMessage,
  reservaRecusadaMessage,
  type ReservationMessageData,
} from '../scheduler/messages.js'
import { scheduleReservationMessages } from '../scheduler/schedule.js'
import { invalidateTenantCache, type TenantContext } from '../tenants/registry.js'
import type { Tenant } from '../tenants/types.js'
import { buttonMessage, listMessage, textMessage, type ListRow, type OutgoingMessage } from '../whatsapp/payloads.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import { send } from './handler.js'
import { OWNER_DECISION } from './machine.js'
import { agendaLinha, resumoTexto, STAFF_ACTION } from './recepcao.js'
import { pessoas } from './screens.js'
import { makeT, type T } from './textos.js'

/**
 * Menu do dono do restaurante.
 *
 * A escolha aqui foi não construir painel web nenhum: o dono já vive no
 * WhatsApp, e uma tela a mais é uma senha a mais para esquecer. Ele manda
 * qualquer coisa para o próprio número do restaurante e recebe um menu com o
 * que precisa no dia a dia — ver as reservas, aprovar grupo grande, fechar a
 * agenda num feriado, calar o bot.
 *
 * O número do dono vem do cadastro do restaurante (`whatsapp.owner.phones` ou
 * `--owner`), então ninguém mais alcança este menu.
 *
 * Como em `screens.ts`, nenhuma frase mora aqui: todo texto vem do catálogo
 * pelo `t()`, e o restaurante sobrescreve o que quiser em `whatsapp.textos`.
 */

export const OWNER_ACTION = {
  menu: 'dono:menu',
  hoje: 'dono:hoje',
  amanha: 'dono:amanha',
  semana: 'dono:semana',
  pendentes: 'dono:pendentes',
  pedido: 'dono:pedido:',
  relatorio: 'dono:relatorio',
  bloquear: 'dono:bloquear',
  bloquearDia: 'dono:bloq:',
  pausar: 'dono:pausar',
  retomar: 'dono:retomar',
} as const

export function isOwner(tenant: Tenant, waId: string): boolean {
  if (!tenant.ownerPhone) return false
  return normalizePhone(waId, env.defaultCountryCode) === normalizePhone(tenant.ownerPhone, env.defaultCountryCode)
}

export async function handleOwnerMessage(
  ctx: TenantContext,
  contact: Contact,
  inbound: NormalizedInbound,
  now: Date,
): Promise<void> {
  const message = await buildOwnerReply(ctx, inbound, now)
  await send(ctx, contact, message)
}

async function buildOwnerReply(
  ctx: TenantContext,
  inbound: NormalizedInbound,
  now: Date,
): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const to = tenant.ownerPhone
  const t = makeT(tenant.config)
  const action = inbound.action ?? ''

  switch (true) {
    case action === OWNER_ACTION.hoje:
      return agendaMessage(ctx, 0, now)

    case action === OWNER_ACTION.amanha:
      return agendaMessage(ctx, 1, now)

    case action === OWNER_ACTION.semana:
      return semanaMessage(ctx, now)

    case action === OWNER_ACTION.pendentes:
      return pendentesMessage(ctx, now)

    case action.startsWith(OWNER_ACTION.pedido):
      return pedidoMessage(ctx, action.slice(OWNER_ACTION.pedido.length))

    case action.startsWith(OWNER_DECISION.aprovar):
      return aprovar(ctx, action.slice(OWNER_DECISION.aprovar.length), now)

    case action.startsWith(OWNER_DECISION.recusar):
      return recusar(ctx, action.slice(OWNER_DECISION.recusar.length))

    case action === OWNER_ACTION.relatorio:
      return relatorioMessage(ctx, now)

    case action === OWNER_ACTION.bloquear:
      return bloquearMenu(to, t, now, tenant)

    case action.startsWith(OWNER_ACTION.bloquearDia):
      return aplicarBloqueio(ctx, action.slice(OWNER_ACTION.bloquearDia.length), now)

    case action === OWNER_ACTION.pausar: {
      const until = new Date(now.getTime() + tenant.config.whatsapp.owner.pauseMinutes * 60 * 1000)
      await setBotPaused(tenant.id, until)
      invalidateTenantCache(tenant.phoneNumberId)
      return buttonMessage(to, t('dono.pausar.corpo', { hora: formatTime(until, tenant.timezone) }), [
        { id: OWNER_ACTION.retomar, title: t('rotulos.dono.retomarAgora') },
      ])
    }

    case action === OWNER_ACTION.retomar:
      await setBotPaused(tenant.id, null)
      invalidateTenantCache(tenant.phoneNumberId)
      return buttonMessage(to, t('dono.retomar.corpo'), [
        { id: OWNER_ACTION.menu, title: t('rotulos.dono.menu') },
      ])

    default:
      return ownerMenu(ctx, now)
  }
}

async function ownerMenu(ctx: TenantContext, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const paused = tenant.botPausedUntil && tenant.botPausedUntil > now
  const pending = await listPending(tenant.id, now)

  const rows: ListRow[] = []
  // Pedido esperando resposta vem primeiro: é a única coisa do menu que tem um
  // cliente do outro lado aguardando.
  if (pending.length > 0) {
    rows.push({
      id: OWNER_ACTION.pendentes,
      title: t('rotulos.dono.pendentes', { total: pending.length }),
      description: t('rotulos.dono.pendentesDesc'),
    })
  }
  rows.push(
    { id: OWNER_ACTION.hoje, title: t('rotulos.dono.hoje') },
    { id: OWNER_ACTION.amanha, title: t('rotulos.dono.amanha') },
    { id: OWNER_ACTION.semana, title: t('rotulos.dono.semana') },
    {
      id: STAFF_ACTION.chegadas,
      title: t('rotulos.dono.chegadas'),
      description: t('rotulos.dono.chegadasDesc'),
    },
    {
      id: OWNER_ACTION.relatorio,
      title: t('rotulos.dono.relatorio'),
      description: t('rotulos.dono.relatorioDesc'),
    },
    {
      id: OWNER_ACTION.bloquear,
      title: t('rotulos.dono.bloquear'),
      description: t('rotulos.dono.bloquearDesc'),
    },
    paused
      ? { id: OWNER_ACTION.retomar, title: t('rotulos.dono.religar') }
      : { id: OWNER_ACTION.pausar, title: t('rotulos.dono.pausar') },
  )

  const status = paused
    ? t('dono.menu.statusPausado', { hora: formatTime(tenant.botPausedUntil!, tenant.timezone) })
    : ''

  return listMessage(
    tenant.ownerPhone,
    t('dono.menu.titulo', { marca: tenant.config.brand.name, status }),
    t('rotulos.lista.verOpcoes'),
    [{ title: t('rotulos.secao.administracao'), rows }],
  )
}

async function agendaMessage(ctx: TenantContext, dayOffset: number, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const day = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day').plus({ days: dayOffset })
  const reservations = await agendaBetween(tenant.id, day.toJSDate(), day.plus({ days: 1 }).toJSDate())

  const label = formatDayLabel(day.toJSDate(), tenant.timezone, now)
  const back = [{ id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') }]

  if (reservations.length === 0) {
    return buttonMessage(tenant.ownerPhone, t('dono.agenda.vazia', { dia: label }), back)
  }

  const total = reservations.reduce((sum, reservation) => sum + reservation.partySize, 0)
  const lines = reservations.map((reservation) => agendaLinha(t, reservation, tenant.timezone))
  const body = [
    t('dono.agenda.titulo', { dia: label, total: reservations.length, pessoas: pessoas(t, total) }),
    '',
    ...lines,
  ].join('\n')

  return buttonMessage(tenant.ownerPhone, body, back)
}

async function semanaMessage(ctx: TenantContext, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const start = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')
  const reservations = await agendaBetween(tenant.id, start.toJSDate(), start.plus({ days: 7 }).toJSDate())

  // Por dia: quantas reservas e quantas pessoas. É o número de pessoas que diz
  // quanta massa abrir e quantos garçons chamar.
  const byDay = new Map<string, { reservas: number; pessoas: number }>()
  for (const reservation of reservations) {
    const key = DateTime.fromJSDate(reservation.startsAt, { zone: tenant.timezone }).toFormat('dd/MM')
    const entry = byDay.get(key) ?? { reservas: 0, pessoas: 0 }
    entry.reservas += 1
    entry.pessoas += reservation.partySize
    byDay.set(key, entry)
  }

  const t = makeT(tenant.config)
  const lines =
    byDay.size === 0
      ? [t('dono.semana.vazia')]
      : [...byDay.entries()].map(([day, entry]) =>
          t('dono.semana.linha', { dia: day, reservas: entry.reservas, pessoas: pessoas(t, entry.pessoas) }),
        )

  const totalPessoas = reservations.reduce((sum, reservation) => sum + reservation.partySize, 0)
  return buttonMessage(
    tenant.ownerPhone,
    [t('dono.semana.titulo', { total: reservations.length, pessoas: pessoas(t, totalPessoas) }), '', ...lines].join(
      '\n',
    ),
    [{ id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') }],
  )
}

async function pendentesMessage(ctx: TenantContext, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const pending = await listPending(tenant.id, now)

  if (pending.length === 0) {
    return buttonMessage(tenant.ownerPhone, t('dono.pendentes.vazio'), [
      { id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') },
    ])
  }

  const rows: ListRow[] = pending.slice(0, 9).map((reservation) => ({
    id: `${OWNER_ACTION.pedido}${reservation.id}`,
    title: `${formatDayShort(reservation.startsAt, tenant.timezone, now)} ${formatTime(reservation.startsAt, tenant.timezone)}`,
    description: `${pessoas(t, reservation.partySize)} · ${reservation.areaName} · ${reservation.contactName || reservation.contactWaId}`,
  }))
  rows.push({ id: OWNER_ACTION.menu, title: t('rotulos.dono.voltarLista') })

  return listMessage(tenant.ownerPhone, t('dono.pendentes.corpo', { total: pending.length }), t('rotulos.lista.escolher'), [
    { title: t('rotulos.secao.pedidos'), rows },
  ])
}

/** Um pedido da lista: o mesmo aviso com "Aprovar" e "Recusar" que chega sozinho. */
async function pedidoMessage(ctx: TenantContext, reservationId: string): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const reservation = await findOwnReservation(ctx, reservationId)
  if (!reservation || reservation.status !== 'pending') return jaResolvido(tenant)
  return pedidoAprovacao(tenant.ownerPhone, tenant, messageData(reservation))
}

/**
 * Aprovar: a reserva vira uma reserva normal — lembretes programados e o
 * cliente avisado na hora.
 */
async function aprovar(ctx: TenantContext, reservationId: string, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)

  const approved = await approveReservation(tenant.id, reservationId)
  if (!approved) return jaResolvido(tenant)

  const data = messageData(approved)
  const client = await findContactById(approved.contactId)
  if (client) {
    await scheduleReservationMessages(tenant, client, data, now)
    await send(ctx, client, reservaAprovadaMessage(client.waId, tenant, data))
  }

  return buttonMessage(
    tenant.ownerPhone,
    t('dono.aprovada.corpo', { cliente: data.contactName || t('dono.semNome'), pessoas: pessoas(t, data.partySize) }),
    [
      { id: OWNER_ACTION.pendentes, title: t('rotulos.dono.outrosPedidos') },
      { id: OWNER_ACTION.menu, title: t('rotulos.dono.menu') },
    ],
  )
}

/** Recusar: os lugares voltam para a lotação e o cliente é avisado. */
async function recusar(ctx: TenantContext, reservationId: string): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)

  const declined = await declineReservation(tenant.id, reservationId)
  if (!declined) return jaResolvido(tenant)

  await cancelPendingForReservation(declined.id)
  const data = messageData(declined)
  const client = await findContactById(declined.contactId)
  if (client) await send(ctx, client, reservaRecusadaMessage(client.waId, tenant, data))

  return buttonMessage(
    tenant.ownerPhone,
    t('dono.recusada.corpo', { cliente: data.contactName || t('dono.semNome') }),
    [
      { id: OWNER_ACTION.pendentes, title: t('rotulos.dono.outrosPedidos') },
      { id: OWNER_ACTION.menu, title: t('rotulos.dono.menu') },
    ],
  )
}

/**
 * O pedido já não está pendente: o cliente cancelou, o dono já respondeu pelo
 * aviso, ou a hora passou. Tocar de novo num botão antigo cai aqui.
 */
function jaResolvido(tenant: Tenant): OutgoingMessage {
  const t = makeT(tenant.config)
  return buttonMessage(tenant.ownerPhone, t('dono.pedido.jaResolvido'), [
    { id: OWNER_ACTION.menu, title: t('rotulos.dono.menu') },
  ])
}

async function findOwnReservation(ctx: TenantContext, reservationId: string): Promise<ReservationDetail | null> {
  const reservation = await findReservation(reservationId)
  return reservation && reservation.tenantId === ctx.tenant.id ? reservation : null
}

async function relatorioMessage(ctx: TenantContext, now: Date): Promise<OutgoingMessage> {
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
    t('dono.relatorio.titulo', { marca: tenant.config.brand.name }),
    '',
    resumoTexto(t, t('dono.relatorio.hoje'), dados.hoje),
    resumoTexto(t, t('dono.relatorio.ontem'), dados.ontem),
    resumoTexto(t, t('dono.relatorio.semana'), dados.semana),
    resumoTexto(t, t('dono.relatorio.mes'), dados.mes),
  ].join('\n\n')

  return buttonMessage(tenant.ownerPhone, body, [{ id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') }])
}

/**
 * Fechar a agenda: hoje ou amanhã, o almoço, o jantar ou o dia inteiro. Cobre o
 * que acontece de verdade — "o salão está fechado para um evento hoje à noite",
 * "amanhã não abrimos para o almoço". Não cancela quem já reservou: o dono é
 * avisado de quantas reservas caem no período para falar com elas.
 */
function bloquearMenu(to: string, t: T, now: Date, tenant: Tenant): OutgoingMessage {
  const amanha = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day').plus({ days: 1 })
  const { afternoonStartHour, eveningStartHour } = tenant.config.whatsapp.owner
  const data = amanha.toFormat('dd/MM')
  const rows = [
    {
      id: `${OWNER_ACTION.bloquearDia}0:almoco`,
      title: t('rotulos.dono.bloqHojeAlmoco'),
      description: t('rotulos.dono.bloqAlmocoDesc', { de: afternoonStartHour, ate: eveningStartHour }),
    },
    {
      id: `${OWNER_ACTION.bloquearDia}0:jantar`,
      title: t('rotulos.dono.bloqHojeJantar'),
      description: t('rotulos.dono.bloqJantarDesc', { hora: eveningStartHour }),
    },
    { id: `${OWNER_ACTION.bloquearDia}0:dia`, title: t('rotulos.dono.bloqHojeDia') },
    {
      id: `${OWNER_ACTION.bloquearDia}1:almoco`,
      title: t('rotulos.dono.bloqAmanhaAlmoco', { data }),
      description: t('rotulos.dono.bloqAlmocoDesc', { de: afternoonStartHour, ate: eveningStartHour }),
    },
    {
      id: `${OWNER_ACTION.bloquearDia}1:jantar`,
      title: t('rotulos.dono.bloqAmanhaJantar', { data }),
      description: t('rotulos.dono.bloqJantarDesc', { hora: eveningStartHour }),
    },
    { id: `${OWNER_ACTION.bloquearDia}1:dia`, title: t('rotulos.dono.bloqAmanhaDia', { data }) },
    { id: OWNER_ACTION.menu, title: t('rotulos.dono.voltarLista') },
  ]

  return listMessage(to, t('dono.bloquear.corpo'), t('rotulos.lista.escolher'), [
    { title: t('rotulos.secao.bloqueios'), rows },
  ])
}

async function aplicarBloqueio(ctx: TenantContext, spec: string, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const [offsetRaw = '0', period = 'dia'] = spec.split(':')

  const day = DateTime.fromJSDate(now, { zone: tenant.timezone })
    .startOf('day')
    .plus({ days: Number(offsetRaw) || 0 })

  const { afternoonStartHour, eveningStartHour } = tenant.config.whatsapp.owner
  const ranges: Record<string, [number, number]> = {
    almoco: [afternoonStartHour, eveningStartHour],
    jantar: [eveningStartHour, 24],
    dia: [0, 24],
  }
  const [fromHour, toHour] = ranges[period] ?? ranges.dia!

  const startsAt = day.plus({ hours: fromHour }).toJSDate()
  const endsAt = day.plus({ hours: toHour }).toJSDate()

  // area_id nulo = fecha o restaurante inteiro, todos os ambientes.
  await createTimeBlock(tenant.id, null, startsAt, endsAt, 'fechado pelo menu do dono')

  const label = formatDayLabel(startsAt, tenant.timezone, now)
  const periodLabel =
    period === 'dia'
      ? t('dono.bloqueado.periodoDia')
      : t('dono.bloqueado.periodoFaixa', { de: fromHour, ate: toHour })

  const affected = (await agendaBetween(tenant.id, startsAt, endsAt)).filter(
    (reservation) => reservation.status !== 'no_show',
  )
  const warning = affected.length > 0 ? t('dono.bloqueado.aviso', { total: affected.length }) : ''

  return buttonMessage(
    tenant.ownerPhone,
    t('dono.bloqueado.corpo', { dia: label, periodo: periodLabel, aviso: warning }),
    [{ id: OWNER_ACTION.menu, title: t('rotulos.dono.menu') }],
  )
}

function messageData(reservation: ReservationDetail): ReservationMessageData {
  return {
    contactName: reservation.contactName,
    contactWaId: reservation.contactWaId,
    partySize: reservation.partySize,
    areaName: reservation.areaName,
    startsAt: reservation.startsAt,
    reservationId: reservation.id,
  }
}

/** O dono pausou o bot? Consultado antes de responder qualquer cliente. */
export function isBotPaused(tenant: Tenant, now: Date = new Date()): boolean {
  return tenant.botPausedUntil !== null && tenant.botPausedUntil > now
}

/** Mensagem de cortesia quando o cliente escreve com o bot pausado. */
export function botPausedNotice(to: string, tenant: Tenant): OutgoingMessage {
  const t = makeT(tenant.config)
  return textMessage(to, t('cliente.botPausado.corpo', { marca: tenant.config.brand.name }))
}
