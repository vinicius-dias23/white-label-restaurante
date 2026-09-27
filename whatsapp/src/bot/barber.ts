import { DateTime } from 'luxon'
import { agendaBetween, cortesDoBarbeiro, createTimeBlock } from '../db/repositories/appointments.js'
import type { Contact } from '../db/repositories/contacts.js'
import { normalizePhone } from '@barbearia/shared/lib/whatsapp'
import { env } from '../env.js'
import { formatDayLabel, formatTime } from '../lib/datetime.js'
import type { TenantContext } from '../tenants/registry.js'
import type { Barber, Tenant } from '../tenants/types.js'
import { buttonMessage, listMessage, type OutgoingMessage } from '../whatsapp/payloads.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import { send } from './handler.js'
import { makeT } from './textos.js'

/**
 * Menu do barbeiro.
 *
 * É o menu do dono com menos poder. O dono manda na barbearia: vê a agenda da
 * casa, fecha o horário de todo mundo, cala o bot. O barbeiro manda só em si
 * mesmo — a agenda dele, os cortes dele, a folga dele.
 *
 * A separação não é só de menu, é de dado: TODA consulta daqui filtra por
 * `tenant_id` E `barber_id`, e o `barber_id` vem sempre da identificação pelo
 * telefone — nunca do payload da mensagem. Não existe id de botão que um
 * barbeiro possa forjar para ler a agenda do colega.
 *
 * O número dele vem do `team[].phone` do config, editável no estúdio. Barbeiro
 * sem telefone preenchido não tem painel: escreve para a barbearia e é atendido
 * como cliente, que é o comportamento de antes desta tela existir.
 *
 * Como em `owner.ts`, nenhuma frase mora aqui: todo texto vem do catálogo pelo
 * `t()`, e a barbearia sobrescreve o que quiser em `whatsapp.textos`.
 */

export const BARBER_ACTION = {
  menu: 'barbeiro:menu',
  hoje: 'barbeiro:hoje',
  amanha: 'barbeiro:amanha',
  semana: 'barbeiro:semana',
  cortes: 'barbeiro:cortes',
  folga: 'barbeiro:folga',
  folgaDia: 'barbeiro:folga:',
} as const

/**
 * Quem é o barbeiro que está escrevendo — ou `null`, se for um cliente.
 *
 * Lê do `ctx.barbers`, que o registry já mantém em cache por 60s junto do
 * tenant: nenhuma consulta a mais por mensagem recebida.
 */
export function findBarber(ctx: TenantContext, waId: string): Barber | null {
  const numero = normalizePhone(waId, env.defaultCountryCode)
  if (numero === '') return null

  // Normalizamos os dois lados: o banco já guarda normalizado, mas uma linha
  // gravada antes desta coluna existir, ou um sync que não rodou, não pode
  // fazer o painel abrir para a pessoa errada. São três ou quatro itens.
  return (
    ctx.barbers.find(
      (barber) =>
        barber.phone !== '' && normalizePhone(barber.phone, env.defaultCountryCode) === numero,
    ) ?? null
  )
}

export async function handleBarberMessage(
  ctx: TenantContext,
  contact: Contact,
  barber: Barber,
  inbound: NormalizedInbound,
  now: Date,
): Promise<void> {
  const message = await buildBarberReply(ctx, contact, barber, inbound, now)
  await send(ctx, contact, message)
}

async function buildBarberReply(
  ctx: TenantContext,
  contact: Contact,
  barber: Barber,
  inbound: NormalizedInbound,
  now: Date,
): Promise<OutgoingMessage> {
  const action = inbound.action ?? ''

  switch (true) {
    case action === BARBER_ACTION.hoje:
      return agendaMessage(ctx, contact, barber, 0, now)

    case action === BARBER_ACTION.amanha:
      return agendaMessage(ctx, contact, barber, 1, now)

    case action === BARBER_ACTION.semana:
      return semanaMessage(ctx, contact, barber, now)

    case action === BARBER_ACTION.cortes:
      return cortesMessage(ctx, contact, barber, now)

    case action === BARBER_ACTION.folga:
      return folgaMenu(ctx.tenant, contact.waId, now)

    case action.startsWith(BARBER_ACTION.folgaDia):
      return aplicarFolga(ctx, contact, barber, action.slice(BARBER_ACTION.folgaDia.length), now)

    default:
      return barberMenu(ctx.tenant, contact.waId, barber)
  }
}

function barberMenu(tenant: Tenant, to: string, barber: Barber): OutgoingMessage {
  const t = makeT(tenant.config)

  const rows = [
    { id: BARBER_ACTION.hoje, title: t('rotulos.barbeiro.hoje') },
    { id: BARBER_ACTION.amanha, title: t('rotulos.barbeiro.amanha') },
    { id: BARBER_ACTION.semana, title: t('rotulos.barbeiro.semana') },
    {
      id: BARBER_ACTION.cortes,
      title: t('rotulos.barbeiro.cortes'),
      description: t('rotulos.barbeiro.cortesDesc'),
    },
    {
      id: BARBER_ACTION.folga,
      title: t('rotulos.barbeiro.folga'),
      description: t('rotulos.barbeiro.folgaDesc'),
    },
  ]

  return listMessage(
    to,
    t('barbeiro.menu.titulo', { nome: barber.name, marca: tenant.config.brand.name }),
    t('rotulos.lista.verOpcoes'),
    [{ title: t('rotulos.secao.minhaAgenda'), rows }],
  )
}

async function agendaMessage(
  ctx: TenantContext,
  contact: Contact,
  barber: Barber,
  dayOffset: number,
  now: Date,
): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const day = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day').plus({ days: dayOffset })

  const appointments = await agendaBetween(
    tenant.id,
    day.toJSDate(),
    day.plus({ days: 1 }).toJSDate(),
    barber.id,
  )

  const label = formatDayLabel(day.toJSDate(), tenant.timezone, now)

  if (appointments.length === 0) {
    return buttonMessage(contact.waId, t('barbeiro.agenda.vazia', { dia: label }), [
      { id: BARBER_ACTION.menu, title: t('rotulos.barbeiro.voltar') },
    ])
  }

  // Sem {barbeiro} na linha: ele é o barbeiro. O nome do cliente aparece porque
  // é o cliente DELE — é o único dado de terceiro neste painel.
  const lines = appointments.map((appointment) =>
    t('barbeiro.agenda.linha', {
      hora: formatTime(appointment.startsAt, tenant.timezone),
      servico: appointment.serviceName,
      confirmado: appointment.status === 'confirmed' ? ' ✅' : '',
      cliente: appointment.contactName || appointment.contactWaId,
    }),
  )

  const body = [
    t('barbeiro.agenda.titulo', { dia: label, total: appointments.length }),
    '',
    ...lines,
  ].join('\n')

  return buttonMessage(contact.waId, body, [
    { id: BARBER_ACTION.menu, title: t('rotulos.barbeiro.voltar') },
  ])
}

async function semanaMessage(
  ctx: TenantContext,
  contact: Contact,
  barber: Barber,
  now: Date,
): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const start = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')

  const appointments = await agendaBetween(
    tenant.id,
    start.toJSDate(),
    start.plus({ days: 7 }).toJSDate(),
    barber.id,
  )

  const byDay = new Map<string, number>()
  for (const appointment of appointments) {
    const key = DateTime.fromJSDate(appointment.startsAt, { zone: tenant.timezone }).toFormat('dd/MM')
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }

  const t = makeT(tenant.config)
  const lines =
    byDay.size === 0
      ? [t('barbeiro.semana.vazia')]
      : [...byDay.entries()].map(([day, count]) => `${day}  ${'▪'.repeat(Math.min(count, 12))} ${count}`)

  return buttonMessage(
    contact.waId,
    [t('barbeiro.semana.titulo', { total: appointments.length }), '', ...lines].join('\n'),
    [{ id: BARBER_ACTION.menu, title: t('rotulos.barbeiro.voltar') }],
  )
}

async function cortesMessage(
  ctx: TenantContext,
  contact: Contact,
  barber: Barber,
  now: Date,
): Promise<OutgoingMessage> {
  const { tenant } = ctx
  const t = makeT(tenant.config)
  const hoje = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')

  const cortes = await cortesDoBarbeiro(tenant.id, barber.id, {
    ontem: hoje.minus({ days: 1 }).toJSDate(),
    hoje: hoje.toJSDate(),
    amanha: hoje.plus({ days: 1 }).toJSDate(),
    mes: hoje.startOf('month').toJSDate(),
  })

  return buttonMessage(
    contact.waId,
    t('barbeiro.cortes.corpo', { hoje: cortes.hoje, ontem: cortes.ontem, mes: cortes.mes }),
    [
      { id: BARBER_ACTION.menu, title: t('rotulos.barbeiro.voltar') },
    ],
  )
}

/**
 * Folga rápida: hoje ou amanhã, por turno ou o dia inteiro. É o gêmeo do
 * bloqueio do dono, com uma diferença que é o ponto da tela — fecha só a agenda
 * deste barbeiro, e a barbearia continua atendendo com os outros.
 */
function folgaMenu(tenant: Tenant, to: string, now: Date): OutgoingMessage {
  const t = makeT(tenant.config)
  const today = DateTime.fromJSDate(now, { zone: tenant.timezone }).startOf('day')

  // Reaproveita as faixas do painel do dono de propósito: "quando começa a
  // tarde" é horário da casa, não do dono. Um campo novo só duplicaria.
  const { afternoonStartHour, eveningStartHour } = tenant.config.whatsapp.owner

  const rows = [
    {
      id: `${BARBER_ACTION.folgaDia}0:tarde`,
      title: t('rotulos.barbeiro.folgaHojeTarde'),
      description: t('rotulos.barbeiro.folgaHojeTardeDesc', { hora: afternoonStartHour }),
    },
    {
      id: `${BARBER_ACTION.folgaDia}0:noite`,
      title: t('rotulos.barbeiro.folgaHojeNoite'),
      description: t('rotulos.barbeiro.folgaHojeNoiteDesc', { hora: eveningStartHour }),
    },
    { id: `${BARBER_ACTION.folgaDia}0:dia`, title: t('rotulos.barbeiro.folgaHojeDia') },
    {
      id: `${BARBER_ACTION.folgaDia}1:manha`,
      title: t('rotulos.barbeiro.folgaAmanhaManha'),
      description: t('rotulos.barbeiro.folgaAmanhaManhaDesc', {
        data: today.plus({ days: 1 }).toFormat('dd/MM'),
        hora: afternoonStartHour,
      }),
    },
    { id: `${BARBER_ACTION.folgaDia}1:dia`, title: t('rotulos.barbeiro.folgaAmanhaDia') },
    { id: BARBER_ACTION.menu, title: t('rotulos.barbeiro.voltarLista') },
  ]

  return listMessage(to, t('barbeiro.folga.corpo'), t('rotulos.lista.escolher'), [
    { title: t('rotulos.secao.folgas'), rows },
  ])
}

async function aplicarFolga(
  ctx: TenantContext,
  contact: Contact,
  barber: Barber,
  spec: string,
  now: Date,
): Promise<OutgoingMessage> {
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

  // Com o barber_id preenchido, fecha SÓ a agenda dele — o dono passa `null`
  // aqui, e é isso que fecha a barbearia inteira.
  await createTimeBlock(tenant.id, barber.id, startsAt, endsAt, `folga de ${barber.name}`)

  const label = formatDayLabel(startsAt, tenant.timezone, now)
  const periodLabel =
    period === 'dia'
      ? t('barbeiro.folga.periodoDia')
      : t('barbeiro.folga.periodoFaixa', { de: fromHour, ate: toHour })

  const affected = await agendaBetween(tenant.id, startsAt, endsAt, barber.id)
  const warning = affected.length > 0 ? t('barbeiro.folga.aviso', { total: affected.length }) : ''

  return buttonMessage(
    contact.waId,
    t('barbeiro.folga.confirmada', { dia: label, periodo: periodLabel, aviso: warning }),
    [{ id: BARBER_ACTION.menu, title: t('rotulos.barbeiro.menu') }],
  )
}
