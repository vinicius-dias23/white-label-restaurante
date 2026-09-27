import { DateTime } from 'luxon'
import { agendaBetween, createTimeBlock } from '../db/repositories/appointments.js'
import type { Contact } from '../db/repositories/contacts.js'
import { setBotPaused } from '../db/repositories/tenants.js'
import { normalizePhone } from '@barbearia/shared/lib/whatsapp'
import { env } from '../env.js'
import { formatDayLabel, formatTime } from '../lib/datetime.js'
import { invalidateTenantCache, type TenantContext } from '../tenants/registry.js'
import type { Tenant } from '../tenants/types.js'
import { buttonMessage, listMessage, textMessage, type OutgoingMessage } from '../whatsapp/payloads.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import { send } from './handler.js'
import { makeT, type T } from './textos.js'

/**
 * Menu do dono da barbearia.
 *
 * A escolha aqui foi não construir painel web nenhum: o barbeiro já vive no
 * WhatsApp, e uma tela a mais é uma senha a mais para esquecer. Ele manda
 * qualquer coisa para o próprio número da barbearia e recebe um menu com o que
 * precisa no dia a dia — ver a agenda, fechar um horário, calar o bot.
 *
 * O número do dono vem do cadastro da barbearia (`--owner`), então ninguém
 * mais alcança este menu.
 *
 * Como em `screens.ts`, nenhuma frase mora aqui: todo texto vem do catálogo
 * pelo `t()`, e a barbearia sobrescreve o que quiser em `whatsapp.textos`.
 */

export const OWNER_ACTION = {
  menu: 'dono:menu',
  hoje: 'dono:hoje',
  amanha: 'dono:amanha',
  semana: 'dono:semana',
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
      return ownerMenu(to, tenant, now)
  }
}

function ownerMenu(to: string, tenant: Tenant, now: Date): OutgoingMessage {
  const t = makeT(tenant.config)
  const paused = tenant.botPausedUntil && tenant.botPausedUntil > now

  const rows = [
    { id: OWNER_ACTION.hoje, title: t('rotulos.dono.hoje') },
    { id: OWNER_ACTION.amanha, title: t('rotulos.dono.amanha') },
    { id: OWNER_ACTION.semana, title: t('rotulos.dono.semana') },
    {
      id: OWNER_ACTION.bloquear,
      title: t('rotulos.dono.bloquear'),
      description: t('rotulos.dono.bloquearDesc'),
    },
    paused
      ? { id: OWNER_ACTION.retomar, title: t('rotulos.dono.religar') }
      : { id: OWNER_ACTION.pausar, title: t('rotulos.dono.pausar') },
  ]

  const status = paused
    ? t('dono.menu.statusPausado', { hora: formatTime(tenant.botPausedUntil!, tenant.timezone) })
    : ''

  return listMessage(
    to,
    t('dono.menu.titulo', { marca: tenant.config.brand.name, status }),
    t('rotulos.lista.verOpcoes'),
    [{ title: t('rotulos.secao.administracao'), rows }],
  )
}

async function agendaMessage(ctx: TenantContext, dayOffset: number, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const day = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day').plus({ days: dayOffset })
  const appointments = await agendaBetween(tenant.id, day.toJSDate(), day.plus({ days: 1 }).toJSDate())

  const label = formatDayLabel(day.toJSDate(), tenant.timezone, now)

  if (appointments.length === 0) {
    return buttonMessage(tenant.ownerPhone, t('dono.agenda.vazia', { dia: label }), [
      { id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') },
    ])
  }

  const lines = appointments.map((appointment) =>
    t('dono.agenda.linha', {
      hora: formatTime(appointment.startsAt, tenant.timezone),
      servico: appointment.serviceName,
      confirmado: appointment.status === 'confirmed' ? ' ✅' : '',
      cliente: appointment.contactName || appointment.contactWaId,
      barbeiro: appointment.barberName,
    }),
  )

  const body = [t('dono.agenda.titulo', { dia: label, total: appointments.length }), '', ...lines].join('\n')

  return buttonMessage(tenant.ownerPhone, body, [
    { id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') },
  ])
}

async function semanaMessage(ctx: TenantContext, now: Date): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const start = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')
  const appointments = await agendaBetween(
    tenant.id,
    start.toJSDate(),
    start.plus({ days: 7 }).toJSDate(),
  )

  const byDay = new Map<string, number>()
  for (const appointment of appointments) {
    const key = DateTime.fromJSDate(appointment.startsAt, { zone: tenant.timezone }).toFormat('dd/MM')
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }

  const t = makeT(tenant.config)
  const lines =
    byDay.size === 0
      ? [t('dono.semana.vazia')]
      : [...byDay.entries()].map(([day, count]) => `${day}  ${'▪'.repeat(Math.min(count, 12))} ${count}`)

  return buttonMessage(
    tenant.ownerPhone,
    [t('dono.semana.titulo', { total: appointments.length }), '', ...lines].join('\n'),
    [{ id: OWNER_ACTION.menu, title: t('rotulos.dono.voltar') }],
  )
}

/**
 * Bloqueio rápido: hoje ou amanhã, por turno ou o dia inteiro. Cobre o que
 * acontece de verdade — "vou sair mais cedo", "amanhã não abro".
 */
function bloquearMenu(to: string, t: T, now: Date, tenant: Tenant): OutgoingMessage {
  const today = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')
  const { afternoonStartHour, eveningStartHour } = tenant.config.whatsapp.owner
  const rows = [
    {
      id: `${OWNER_ACTION.bloquearDia}0:tarde`,
      title: t('rotulos.dono.bloqHojeTarde'),
      description: t('rotulos.dono.bloqHojeTardeDesc', { hora: afternoonStartHour }),
    },
    {
      id: `${OWNER_ACTION.bloquearDia}0:noite`,
      title: t('rotulos.dono.bloqHojeNoite'),
      description: t('rotulos.dono.bloqHojeNoiteDesc', { hora: eveningStartHour }),
    },
    { id: `${OWNER_ACTION.bloquearDia}0:dia`, title: t('rotulos.dono.bloqHojeDia') },
    {
      id: `${OWNER_ACTION.bloquearDia}1:manha`,
      title: t('rotulos.dono.bloqAmanhaManha'),
      description: t('rotulos.dono.bloqAmanhaManhaDesc', {
        data: today.plus({ days: 1 }).toFormat('dd/MM'),
        hora: afternoonStartHour,
      }),
    },
    { id: `${OWNER_ACTION.bloquearDia}1:dia`, title: t('rotulos.dono.bloqAmanhaDia') },
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
    manha: [0, afternoonStartHour],
    tarde: [afternoonStartHour, eveningStartHour],
    noite: [eveningStartHour, 24],
    dia: [0, 24],
  }
  const [fromHour, toHour] = ranges[period] ?? ranges.dia!

  const startsAt = day.plus({ hours: fromHour }).toJSDate()
  const endsAt = day.plus({ hours: toHour }).toJSDate()

  // barber_id nulo = fecha para a barbearia inteira.
  await createTimeBlock(tenant.id, null, startsAt, endsAt, 'bloqueio pelo menu do dono')

  const label = formatDayLabel(startsAt, tenant.timezone, now)
  const periodLabel =
    period === 'dia'
      ? t('dono.bloqueado.periodoDia')
      : t('dono.bloqueado.periodoFaixa', { de: fromHour, ate: toHour })

  const affected = await agendaBetween(tenant.id, startsAt, endsAt)
  const warning =
    affected.length > 0 ? t('dono.bloqueado.aviso', { total: affected.length }) : ''

  return buttonMessage(
    tenant.ownerPhone,
    t('dono.bloqueado.corpo', { dia: label, periodo: periodLabel, aviso: warning }),
    [{ id: OWNER_ACTION.menu, title: t('rotulos.dono.menu') }],
  )
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
