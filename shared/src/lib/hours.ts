import { DAY_KEYS } from '../config/types.js'
import type { DayKey, TimeRange, WeeklyHours } from '../config/types.js'

/** Minutos desde a meia-noite para "HH:MM". */
export function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/** Chave do dia da semana para uma data (`Date.getDay()`: 0 = domingo). */
export function dayKeyOf(date: Date): DayKey {
  const index = (date.getDay() + 6) % 7 // segunda = 0
  return DAY_KEYS[index]!
}

function previousDay(day: DayKey): DayKey {
  const index = DAY_KEYS.indexOf(day)
  return DAY_KEYS[(index + DAY_KEYS.length - 1) % DAY_KEYS.length]!
}

/**
 * Uma faixa que termina antes de começar atravessa a meia-noite:
 * ["18:00", "02:00"] fecha às 2h do dia seguinte.
 */
const crossesMidnight = ([open, close]: TimeRange) => toMinutes(close) <= toMinutes(open)

function coversToday(range: TimeRange, minutes: number): boolean {
  const open = toMinutes(range[0])
  const close = toMinutes(range[1])
  return crossesMidnight(range) ? minutes >= open : minutes >= open && minutes < close
}

/** Faixa de ontem que ainda está valendo na madrugada de hoje. */
function coversFromYesterday(range: TimeRange, minutes: number): boolean {
  return crossesMidnight(range) && minutes < toMinutes(range[1])
}

export interface OpenState {
  open: boolean
  /** Dia da semana de hoje, para destacar na tabela. */
  today: DayKey
  /** Faixas de hoje, já ordenadas. */
  todayRanges: TimeRange[]
}

/** O restaurante está aberto neste instante? */
export function getOpenState(hours: WeeklyHours, now: Date = new Date()): OpenState {
  const today = dayKeyOf(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const todayRanges = [...(hours[today] ?? [])].sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]))

  const openNow =
    todayRanges.some((range) => coversToday(range, minutes)) ||
    (hours[previousDay(today)] ?? []).some((range) => coversFromYesterday(range, minutes))

  return { open: openNow, today, todayRanges }
}

/** `isOpenNow(hours)` — atalho para quem só quer o booleano. */
export const isOpenNow = (hours: WeeklyHours, now: Date = new Date()): boolean =>
  getOpenState(hours, now).open

/** ["09:00","19:00"] + almoço -> "09:00 – 12:00 · 13:30 – 19:00". */
export function formatRanges(ranges: TimeRange[], closedLabel = 'Fechado'): string {
  if (ranges.length === 0) return closedLabel
  return ranges.map(([open, close]) => `${open} – ${close}`).join(' · ')
}

/** Próximo horário de abertura, para o texto "abre seg. às 09:00". */
export function nextOpening(hours: WeeklyHours, now: Date = new Date()): { day: DayKey; time: string } | null {
  const todayIndex = DAY_KEYS.indexOf(dayKeyOf(now))
  const minutes = now.getHours() * 60 + now.getMinutes()

  for (let offset = 0; offset < 7; offset += 1) {
    const day = DAY_KEYS[(todayIndex + offset) % DAY_KEYS.length]!
    const ranges = [...(hours[day] ?? [])].sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]))
    for (const range of ranges) {
      if (offset > 0 || toMinutes(range[0]) > minutes) {
        return { day, time: range[0] }
      }
    }
  }
  return null
}
