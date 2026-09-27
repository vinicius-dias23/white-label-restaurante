import { DateTime } from 'luxon'
import { toMinutes } from '@restaurante/shared/lib/hours'
import { DAY_KEYS, type DayKey, type TimeRange, type WeeklyHours } from '@restaurante/shared/config'

/**
 * Geração dos horários com mesa.
 *
 * É o coração da reserva e, de propósito, uma função pura: entra o horário de
 * funcionamento, a lotação do ambiente, o tamanho do grupo e as reservas que já
 * existem; sai a lista de horários em que o grupo cabe. Sem banco, sem rede,
 * sem relógio implícito — o `now` é parâmetro. Isso deixa o teste cobrir os
 * casos chatos (almoço e jantar, virada de dia, último lugar do sábado) sem
 * subir nada.
 *
 * Todo horário circula em UTC (`Date`). A conversa com o cliente é o único
 * lugar que fala no fuso do restaurante — misturar os dois no meio da conta é
 * como se erra em reserva.
 */

export interface BusyInterval {
  start: Date
  end: Date
}

/** Uma reserva que já ocupa lugares no ambiente. */
export interface Occupancy extends BusyInterval {
  partySize: number
}

export interface SlotOptions {
  hours: WeeklyHours
  /** Fuso do restaurante, ex.: "America/Sao_Paulo". */
  timezone: string
  /** Quanto tempo a mesa fica com o grupo. */
  durationMin: number
  /** Passo da grade: 30 gera 19:00, 19:30, 20:00... */
  stepMin: number
  /** Última reserva: quantos minutos antes de fechar. */
  lastSeatingMin: number
  /** Antecedência mínima: não oferece mesa para daqui a 5 minutos. */
  leadTimeMin: number
  /** Pessoas no grupo. */
  partySize: number
  /** Lotação do ambiente, em pessoas. */
  capacity: number
  /** Reservas vivas neste ambiente. */
  reservations: Occupancy[]
  /** Bloqueios que fecham o ambiente (ou o restaurante inteiro). */
  blocks: BusyInterval[]
  now: Date
}

/** Dia da semana no fuso do restaurante — não no fuso do servidor. */
export function dayKeyInZone(date: DateTime): DayKey {
  return DAY_KEYS[date.weekday - 1]!
}

/** Uma faixa que termina antes de começar atravessa a meia-noite. */
const crossesMidnight = ([open, close]: TimeRange): boolean => toMinutes(close) <= toMinutes(open)

interface Window {
  start: DateTime
  end: DateTime
}

/**
 * Janelas de atendimento de um dia local, já como instantes.
 * `["18:00","02:00"]` numa sexta fecha às 2h de sábado.
 */
export function windowsForDay(day: DateTime, hours: WeeklyHours): Window[] {
  const ranges = hours[dayKeyInZone(day)] ?? []
  return ranges
    .map(([open, close]) => {
      const start = day.startOf('day').plus({ minutes: toMinutes(open) })
      const closeMinutes = toMinutes(close)
      const end = crossesMidnight([open, close])
        ? day.startOf('day').plus({ days: 1, minutes: closeMinutes })
        : day.startOf('day').plus({ minutes: closeMinutes })
      return { start, end }
    })
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())
}

function overlaps(startMs: number, endMs: number, busy: BusyInterval[]): boolean {
  return busy.some((interval) => startMs < interval.end.getTime() && endMs > interval.start.getTime())
}

/**
 * Maior número de pessoas sentadas ao mesmo tempo dentro de [start, end).
 *
 * Não basta somar tudo que encosta no intervalo: uma reserva das 19h às 21h e
 * outra das 21h às 23h nunca dividem o salão, e somar as duas recusaria um
 * grupo das 20h que cabe. O pico só pode mudar quando alguém chega, então
 * basta olhar o começo do intervalo e cada chegada dentro dele.
 */
export function peakOccupancy(reservations: Occupancy[], startMs: number, endMs: number): number {
  const overlapping = reservations.filter(
    (r) => r.start.getTime() < endMs && r.end.getTime() > startMs,
  )
  const moments = [
    startMs,
    ...overlapping.map((r) => r.start.getTime()).filter((ms) => ms > startMs && ms < endMs),
  ]

  let peak = 0
  for (const moment of moments) {
    const seated = overlapping
      .filter((r) => r.start.getTime() <= moment && r.end.getTime() > moment)
      .reduce((sum, r) => sum + r.partySize, 0)
    peak = Math.max(peak, seated)
  }
  return peak
}

/** O grupo cabe no ambiente nesse intervalo? */
export function fits(
  reservations: Occupancy[],
  startMs: number,
  endMs: number,
  partySize: number,
  capacity: number,
): boolean {
  return peakOccupancy(reservations, startMs, endMs) + partySize <= capacity
}

/**
 * Horários com mesa num dia (data local no formato "2026-08-22").
 *
 * Um horário só entra na lista se:
 *  · começa dentro do expediente e até `lastSeatingMin` antes de fechar
 *    (a mesa pode ficar depois do fechamento da cozinha — quem chega às 22h
 *    num restaurante que fecha às 23h não sai às 23h em ponto);
 *  · o grupo cabe no ambiente durante TODO o tempo da mesa;
 *  · não cai num bloqueio (feriado, evento fechado);
 *  · respeita a antecedência mínima.
 */
export function slotsForDay(day: string, options: SlotOptions): Date[] {
  const date = DateTime.fromISO(day, { zone: options.timezone })
  if (!date.isValid) return []
  if (options.partySize > options.capacity) return []

  const step = Math.max(5, options.stepMin)
  const duration = Math.max(5, options.durationMin)
  const earliest = options.now.getTime() + options.leadTimeMin * 60_000

  const slots: Date[] = []

  for (const window of windowsForDay(date, options.hours)) {
    const lastStart = window.end.minus({ minutes: options.lastSeatingMin })
    let cursor = window.start
    while (cursor <= lastStart && cursor < window.end) {
      const startMs = cursor.toMillis()
      const endMs = startMs + duration * 60_000

      const free =
        startMs >= earliest &&
        !overlaps(startMs, endMs, options.blocks) &&
        fits(options.reservations, startMs, endMs, options.partySize, options.capacity)

      if (free) slots.push(new Date(startMs))
      cursor = cursor.plus({ minutes: step })
    }
  }

  return slots
}

export interface DayAvailability {
  /** "2026-08-22" no fuso do restaurante. */
  day: string
  slots: Date[]
}

/**
 * Varre os próximos dias e devolve só os que têm mesa — o cliente não deve ver
 * um dia na lista para descobrir depois que está lotado.
 */
export function availableDays(options: SlotOptions & { horizonDays: number }): DayAvailability[] {
  const today = DateTime.fromJSDate(options.now, { zone: options.timezone }).startOf('day')
  const days: DayAvailability[] = []

  for (let offset = 0; offset <= options.horizonDays; offset += 1) {
    const day = today.plus({ days: offset }).toISODate()
    if (!day) continue
    const slots = slotsForDay(day, options)
    if (slots.length > 0) days.push({ day, slots })
  }

  return days
}

export type Period = 'manha' | 'almoco' | 'jantar'

export const PERIOD_LABELS: Record<Period, string> = {
  manha: 'Manhã',
  almoco: 'Almoço',
  jantar: 'Jantar',
}

/**
 * Turno de um horário, no fuso do restaurante.
 *
 * Existe porque a lista do WhatsApp cabe 10 linhas: separar "almoço" e
 * "jantar" deixa o cliente achar o horário dele sem ler a lista inteira.
 */
export function periodOf(date: Date, timezone: string): Period {
  const hour = DateTime.fromJSDate(date, { zone: timezone }).hour
  if (hour < 11) return 'manha'
  if (hour < 17) return 'almoco'
  return 'jantar'
}

export function groupByPeriod(slots: Date[], timezone: string): Record<Period, Date[]> {
  const groups: Record<Period, Date[]> = { manha: [], almoco: [], jantar: [] }
  for (const slot of slots) groups[periodOf(slot, timezone)].push(slot)
  return groups
}
