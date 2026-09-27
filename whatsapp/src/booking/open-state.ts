import { DateTime } from 'luxon'
import { DAY_LABELS, type WeeklyHours } from '@restaurante/shared/config'
import { formatRanges } from '@restaurante/shared/lib/hours'
import { windowsForDay } from './slots.js'

/**
 * "Aberto agora" e "abre sexta às 09:00", no fuso do restaurante.
 *
 * O site tem a mesma conta em `@restaurante/shared/lib/hours`, mas lá ela usa o relógio do
 * navegador do visitante — que é o certo para quem está olhando a página. Aqui
 * o relógio é o do servidor, que pode estar em qualquer lugar do mundo, então a
 * conta precisa ser explicitamente no fuso do restaurante.
 */

export interface OpenStateInZone {
  open: boolean
  /** Faixas de hoje já formatadas: "09:00 – 12:00 · 13:00 – 19:00". */
  todayLabel: string
  /** Quando abre de novo, quando estiver fechada. */
  nextOpening: { label: string; time: string } | null
}

export function openStateInZone(hours: WeeklyHours, timezone: string, now: Date = new Date()): OpenStateInZone {
  const local = DateTime.fromJSDate(now, { zone: timezone })
  const today = local.startOf('day')

  // A janela de ontem pode atravessar a meia-noite e ainda estar valendo.
  const windows = [...windowsForDay(today.minus({ days: 1 }), hours), ...windowsForDay(today, hours)]
  const open = windows.some((window) => local >= window.start && local < window.end)

  const todayRanges = hours[DAY_KEYS_INDEX[today.weekday - 1]!] ?? []

  return {
    open,
    todayLabel: formatRanges(todayRanges),
    nextOpening: open ? null : findNextOpening(hours, timezone, now),
  }
}

const DAY_KEYS_INDEX = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function findNextOpening(
  hours: WeeklyHours,
  timezone: string,
  now: Date,
): { label: string; time: string } | null {
  const local = DateTime.fromJSDate(now, { zone: timezone })

  for (let offset = 0; offset < 8; offset += 1) {
    const day = local.startOf('day').plus({ days: offset })
    for (const window of windowsForDay(day, hours)) {
      if (window.start > local) {
        const label =
          offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : DAY_LABELS[DAY_KEYS_INDEX[day.weekday - 1]!].toLowerCase()
        return { label, time: window.start.toFormat('HH:mm') }
      }
    }
  }
  return null
}
