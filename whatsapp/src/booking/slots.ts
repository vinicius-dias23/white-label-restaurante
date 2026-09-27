import { DateTime } from 'luxon'
import { toMinutes } from '@barbearia/shared/lib/hours'
import { DAY_KEYS, type DayKey, type TimeRange, type WeeklyHours } from '@barbearia/shared/config'

/**
 * Geração dos horários livres.
 *
 * É o coração do agendamento e, de propósito, uma função pura: entra o horário
 * de funcionamento, a duração do serviço e a lista de ocupações; sai a lista de
 * horários. Sem banco, sem rede, sem relógio implícito — o `now` é parâmetro.
 * Isso deixa o teste cobrir os casos chatos (almoço, folga, virada de dia,
 * véspera de feriado) sem subir nada.
 *
 * Todo horário circula em UTC (`Date`). A conversa com o cliente é o único
 * lugar que fala no fuso da barbearia — misturar os dois no meio da conta é
 * como se erra em agenda.
 */

export interface BusyInterval {
  start: Date
  end: Date
}

export interface SlotOptions {
  hours: WeeklyHours
  /** Fuso da barbearia, ex.: "America/Sao_Paulo". */
  timezone: string
  /** Duração do serviço escolhido. */
  durationMin: number
  /** Passo da grade: 15 gera 09:00, 09:15, 09:30... */
  stepMin: number
  /** Folga antes e depois de cada atendimento. */
  bufferMin: number
  /** Antecedência mínima: não oferece horário para daqui a 5 minutos. */
  leadTimeMin: number
  /** Agendamentos e bloqueios que já ocupam a agenda deste barbeiro. */
  busy: BusyInterval[]
  now: Date
}

/** Dia da semana no fuso da barbearia — não no fuso do servidor. */
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
 * Horários livres de um dia (data local no formato "2026-08-22").
 *
 * Um horário só entra na lista se:
 *  · o atendimento inteiro cabe antes de fechar (ninguém começa 19:50 um corte
 *    de 40 min numa barbearia que fecha às 20h);
 *  · não encosta em nada já marcado, respeitando a folga entre atendimentos;
 *  · respeita a antecedência mínima.
 */
export function slotsForDay(day: string, options: SlotOptions): Date[] {
  const date = DateTime.fromISO(day, { zone: options.timezone })
  if (!date.isValid) return []

  const step = Math.max(5, options.stepMin)
  const duration = Math.max(5, options.durationMin)
  const earliest = options.now.getTime() + options.leadTimeMin * 60_000
  const bufferMs = options.bufferMin * 60_000

  const slots: Date[] = []

  for (const window of windowsForDay(date, options.hours)) {
    let cursor = window.start
    while (cursor.plus({ minutes: duration }) <= window.end) {
      const startMs = cursor.toMillis()
      const endMs = startMs + duration * 60_000

      const free =
        startMs >= earliest && !overlaps(startMs - bufferMs, endMs + bufferMs, options.busy)

      if (free) slots.push(new Date(startMs))
      cursor = cursor.plus({ minutes: step })
    }
  }

  return slots
}

export interface DayAvailability {
  /** "2026-08-22" no fuso da barbearia. */
  day: string
  slots: Date[]
}

/**
 * Varre os próximos dias e devolve só os que têm horário livre — o cliente não
 * deve ver um dia na lista para descobrir depois que está lotado.
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

export type Period = 'manha' | 'tarde' | 'noite'

export const PERIOD_LABELS: Record<Period, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
}

/**
 * Turno de um horário, no fuso da barbearia.
 *
 * Existe porque a lista do WhatsApp cabe 10 linhas e um sábado inteiro tem
 * muito mais horário que isso. Perguntar o turno antes corta a lista num
 * tamanho que o cliente lê no celular sem rolar.
 */
export function periodOf(date: Date, timezone: string): Period {
  const hour = DateTime.fromJSDate(date, { zone: timezone }).hour
  if (hour < 12) return 'manha'
  if (hour < 18) return 'tarde'
  return 'noite'
}

export function groupByPeriod(slots: Date[], timezone: string): Record<Period, Date[]> {
  const groups: Record<Period, Date[]> = { manha: [], tarde: [], noite: [] }
  for (const slot of slots) groups[periodOf(slot, timezone)].push(slot)
  return groups
}
