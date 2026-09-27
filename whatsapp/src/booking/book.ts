import { DateTime } from 'luxon'
import {
  areaOccupancy,
  countUpcomingByContact,
  createReservation,
  type Reservation,
} from '../db/repositories/reservations.js'
import type { Contact } from '../db/repositories/contacts.js'
import { log } from '../lib/logger.js'
import type { TenantContext } from '../tenants/registry.js'
import type { AreaRecord } from '../tenants/types.js'
import { availableDays, slotsForDay, type DayAvailability, type SlotOptions } from './slots.js'

/**
 * Reserva de mesa.
 *
 * "Tanto faz" o ambiente é o caso interessante: a lista mostrada é a união dos
 * horários em que o grupo cabe em ALGUM ambiente, e só na hora de confirmar o
 * sistema decide onde vai ser. É isso que enche a casa — um horário só
 * desaparece da lista quando nenhum ambiente tem lugar para o grupo.
 */

export const ANY_AREA = 'any'

/** Os ambientes onde um grupo deste tamanho cabe, na ordem do config. */
export function areasForParty(ctx: TenantContext, partySize: number): AreaRecord[] {
  return ctx.areas.filter((area) => area.capacity >= partySize)
}

function slotOptions(
  ctx: TenantContext,
  area: AreaRecord,
  partySize: number,
  occupancy: Pick<SlotOptions, 'reservations' | 'blocks'>,
  now: Date,
): SlotOptions {
  const { booking } = ctx.tenant.config
  return {
    hours: ctx.tenant.config.hours,
    timezone: ctx.tenant.timezone,
    durationMin: booking.durationMin,
    stepMin: booking.slotStepMin,
    lastSeatingMin: booking.lastSeatingMin,
    leadTimeMin: booking.leadTimeMin,
    partySize,
    capacity: area.capacity,
    ...occupancy,
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

async function availabilityForArea(
  ctx: TenantContext,
  area: AreaRecord,
  partySize: number,
  now: Date,
): Promise<DayAvailability[]> {
  const { from, to } = horizon(ctx, now)
  const occupancy = await areaOccupancy(ctx.tenant.id, area.id, from, to)
  return availableDays({
    ...slotOptions(ctx, area, partySize, occupancy, now),
    horizonDays: ctx.tenant.config.booking.horizonDays,
  })
}

function areasFor(ctx: TenantContext, areaId: string, partySize: number): AreaRecord[] {
  const eligible = areasForParty(ctx, partySize)
  return areaId === ANY_AREA ? eligible : eligible.filter((area) => area.id === areaId)
}

/**
 * Dias com mesa para o grupo. Com `ANY_AREA`, junta todos os ambientes e tira
 * as repetições — o cliente vê "20:00" uma vez, não uma por ambiente.
 */
export async function availability(
  ctx: TenantContext,
  partySize: number,
  areaId: string,
  now: Date = new Date(),
): Promise<DayAvailability[]> {
  const areas = areasFor(ctx, areaId, partySize)
  if (areas.length === 0) return []

  const perArea = await Promise.all(areas.map((area) => availabilityForArea(ctx, area, partySize, now)))

  const byDay = new Map<string, Set<number>>()
  for (const days of perArea) {
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

/** Horários com mesa num dia específico, já no formato que a tela usa. */
export async function slotsForDate(
  ctx: TenantContext,
  partySize: number,
  areaId: string,
  day: string,
  now: Date = new Date(),
): Promise<Date[]> {
  const days = await availability(ctx, partySize, areaId, now)
  return days.find((entry) => entry.day === day)?.slots ?? []
}

/**
 * Em quais ambientes tentar, em ordem. Com "tanto faz", é a ordem do config dos
 * que ainda têm lugar naquele horário — assim o salão principal enche antes, que
 * é como o restaurante costuma querer.
 */
async function candidateAreas(
  ctx: TenantContext,
  partySize: number,
  areaId: string,
  startsAt: Date,
  now: Date,
): Promise<AreaRecord[]> {
  const areas = areasFor(ctx, areaId, partySize)
  if (areaId !== ANY_AREA) return areas

  const day = DateTime.fromJSDate(startsAt, { zone: ctx.tenant.timezone }).toISODate()
  if (!day) return []

  const { from, to } = horizon(ctx, now)
  const withRoom: AreaRecord[] = []
  for (const area of areas) {
    const occupancy = await areaOccupancy(ctx.tenant.id, area.id, from, to)
    const free = slotsForDay(day, slotOptions(ctx, area, partySize, occupancy, now)).some(
      (slot) => slot.getTime() === startsAt.getTime(),
    )
    if (free) withRoom.push(area)
  }
  return withRoom
}

/** Este grupo precisa da aprovação do dono? */
export function needsApproval(ctx: TenantContext, partySize: number): boolean {
  const limite = ctx.tenant.config.booking.approvalAbovePartySize
  return limite > 0 && partySize > limite
}

export type BookResult =
  | { ok: true; reservation: Reservation; area: AreaRecord; pending: boolean }
  | { ok: false; reason: 'ocupado' | 'limite' | 'invalido' }

/**
 * Efetiva a reserva.
 *
 * A checagem de lugar que veio antes é só para montar a lista: entre o cliente
 * ver o horário e tocar em "Confirmar" passam segundos, e outro grupo pode ter
 * confirmado no meio. Quem decide de verdade é o `createReservation`, com o
 * ambiente travado — e é por isso que `reason: 'ocupado'` é um caminho normal
 * do fluxo, não um erro.
 */
export async function book(
  ctx: TenantContext,
  contact: Contact,
  partySize: number,
  areaId: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<BookResult> {
  const { booking } = ctx.tenant.config

  if (startsAt.getTime() <= now.getTime()) return { ok: false, reason: 'invalido' }
  if (partySize < 1 || partySize > booking.maxPartySize) return { ok: false, reason: 'invalido' }

  const upcoming = await countUpcomingByContact(contact.id, now)
  if (upcoming >= booking.maxPerContact) return { ok: false, reason: 'limite' }

  const pending = needsApproval(ctx, partySize)
  const endsAt = new Date(startsAt.getTime() + booking.durationMin * 60_000)

  // Com "tanto faz", se o primeiro ambiente encheu no meio do caminho, o
  // segundo ainda serve — o cliente não precisa saber que houve disputa.
  for (const area of await candidateAreas(ctx, partySize, areaId, startsAt, now)) {
    const reservation = await createReservation({
      tenantId: ctx.tenant.id,
      contactId: contact.id,
      areaId: area.id,
      partySize,
      startsAt,
      endsAt,
      status: pending ? 'pending' : 'scheduled',
    })
    if (reservation) return { ok: true, reservation, area, pending }
  }

  log.info('ambiente lotou entre a lista e a confirmação', {
    tenant: ctx.tenant.slug,
    partySize,
    startsAt: startsAt.toISOString(),
  })
  return { ok: false, reason: 'ocupado' }
}

/** O cliente ainda pode cancelar sozinho, ou já está em cima da hora? */
export function canCancel(startsAt: Date, deadlineHours: number, now: Date = new Date()): boolean {
  return startsAt.getTime() - now.getTime() > deadlineHours * 60 * 60 * 1000
}
