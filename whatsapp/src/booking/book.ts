import { DateTime } from 'luxon'
import {
  busyIntervals,
  countUpcomingByContact,
  createAppointment,
  type Appointment,
} from '../db/repositories/appointments.js'
import type { Contact } from '../db/repositories/contacts.js'
import { log } from '../lib/logger.js'
import type { TenantContext } from '../tenants/registry.js'
import type { Barber, ServiceRecord } from '../tenants/types.js'
import { availableDays, slotsForDay, type DayAvailability, type SlotOptions } from './slots.js'

/**
 * Reserva de horário.
 *
 * "Sem preferência" é o caso interessante: a agenda mostrada é a união dos
 * horários de todos os barbeiros, e só na hora de confirmar o sistema decide
 * com quem vai ser. É isso que enche a agenda — um horário só desaparece da
 * lista quando TODO mundo está ocupado nele.
 */

export const ANY_BARBER = 'any'

function slotOptions(ctx: TenantContext, service: ServiceRecord, busy: SlotOptions['busy'], now: Date): SlotOptions {
  const { booking } = ctx.tenant.config
  return {
    hours: ctx.tenant.config.hours,
    timezone: ctx.tenant.timezone,
    durationMin: service.durationMin,
    stepMin: booking.slotStepMin,
    bufferMin: booking.bufferMin,
    leadTimeMin: booking.leadTimeMin,
    busy,
    now,
  }
}

/** Janela de busca: de agora até o horizonte configurado. */
function horizon(ctx: TenantContext, now: Date): { from: Date; to: Date } {
  return {
    from: now,
    to: new Date(now.getTime() + (ctx.tenant.config.booking.horizonDays + 2) * 24 * 60 * 60 * 1000),
  }
}

async function availabilityForBarber(
  ctx: TenantContext,
  service: ServiceRecord,
  barber: Barber,
  now: Date,
): Promise<DayAvailability[]> {
  const { from, to } = horizon(ctx, now)
  const busy = await busyIntervals(ctx.tenant.id, barber.id, from, to)
  return availableDays({
    ...slotOptions(ctx, service, busy, now),
    horizonDays: ctx.tenant.config.booking.horizonDays,
  })
}

/**
 * Dias com horário livre. Com `ANY_BARBER`, junta a agenda de todos e tira as
 * repetições — o cliente vê "14:00" uma vez, não uma por barbeiro.
 */
export async function availability(
  ctx: TenantContext,
  service: ServiceRecord,
  barberId: string,
  now: Date = new Date(),
): Promise<DayAvailability[]> {
  const barbers =
    barberId === ANY_BARBER ? ctx.barbers : ctx.barbers.filter((barber) => barber.id === barberId)

  if (barbers.length === 0) return []

  const perBarber = await Promise.all(
    barbers.map((barber) => availabilityForBarber(ctx, service, barber, now)),
  )

  const byDay = new Map<string, Set<number>>()
  for (const days of perBarber) {
    for (const day of days) {
      const slots = byDay.get(day.day) ?? new Set<number>()
      for (const slot of day.slots) slots.add(slot.getTime())
      byDay.set(day.day, slots)
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, slots]) => ({
      day,
      slots: [...slots].sort((a, b) => a - b).map((time) => new Date(time)),
    }))
}

/** Horários livres de um dia específico, já no formato que a tela usa. */
export async function slotsForDate(
  ctx: TenantContext,
  service: ServiceRecord,
  barberId: string,
  day: string,
  now: Date = new Date(),
): Promise<Date[]> {
  const days = await availability(ctx, service, barberId, now)
  return days.find((entry) => entry.day === day)?.slots ?? []
}

/**
 * Com qual barbeiro marcar. Escolhe o primeiro da ordem do config que esteja
 * livre — assim o barbeiro-chefe enche a agenda antes, que é como a barbearia
 * costuma querer.
 */
async function pickBarber(
  ctx: TenantContext,
  service: ServiceRecord,
  barberId: string,
  startsAt: Date,
  now: Date,
): Promise<Barber | null> {
  if (barberId !== ANY_BARBER) {
    return ctx.barbers.find((barber) => barber.id === barberId) ?? null
  }

  const day = DateTime.fromJSDate(startsAt, { zone: ctx.tenant.timezone }).toISODate()
  if (!day) return null

  for (const barber of ctx.barbers) {
    const { from, to } = horizon(ctx, now)
    const busy = await busyIntervals(ctx.tenant.id, barber.id, from, to)
    const free = slotsForDay(day, slotOptions(ctx, service, busy, now)).some(
      (slot) => slot.getTime() === startsAt.getTime(),
    )
    if (free) return barber
  }
  return null
}

export type BookResult =
  | { ok: true; appointment: Appointment; barber: Barber }
  | { ok: false; reason: 'ocupado' | 'limite' | 'invalido' }

/**
 * Efetiva a reserva.
 *
 * A checagem de disponibilidade que veio antes é só para montar a lista: entre
 * o cliente ver o horário e tocar em "Confirmar" passam segundos, e outra
 * pessoa pode ter confirmado no meio. Quem decide de verdade é a constraint do
 * banco, e é por isso que `reason: 'ocupado'` é um caminho normal do fluxo, não
 * um erro.
 */
export async function book(
  ctx: TenantContext,
  contact: Contact,
  service: ServiceRecord,
  barberId: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<BookResult> {
  const { booking } = ctx.tenant.config

  if (startsAt.getTime() <= now.getTime()) return { ok: false, reason: 'invalido' }

  const upcoming = await countUpcomingByContact(contact.id, now)
  if (upcoming >= booking.maxPerContact) return { ok: false, reason: 'limite' }

  const barber = await pickBarber(ctx, service, barberId, startsAt, now)
  if (!barber) return { ok: false, reason: 'ocupado' }

  const appointment = await createAppointment({
    tenantId: ctx.tenant.id,
    contactId: contact.id,
    barberId: barber.id,
    serviceId: service.id,
    startsAt,
    endsAt: new Date(startsAt.getTime() + service.durationMin * 60_000),
  })

  if (!appointment) {
    log.info('horário pego por outra pessoa entre a lista e a confirmação', {
      tenant: ctx.tenant.slug,
      barber: barber.name,
      startsAt: startsAt.toISOString(),
    })
    return { ok: false, reason: 'ocupado' }
  }

  return { ok: true, appointment, barber }
}

/** O cliente ainda pode cancelar sozinho, ou já está em cima da hora? */
export function canCancel(startsAt: Date, deadlineHours: number, now: Date = new Date()): boolean {
  return startsAt.getTime() - now.getTime() > deadlineHours * 60 * 60 * 1000
}
