import { DateTime } from 'luxon'

/**
 * Datas e horas em português, no fuso do restaurante.
 *
 * Toda saída para o cliente passa por aqui. O resto do sistema trabalha em UTC:
 * a conversão acontece só na hora de escrever a mensagem.
 */

const WEEKDAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function inZone(date: Date, timezone: string): DateTime {
  return DateTime.fromJSDate(date, { zone: timezone })
}

/** "14:30" */
export function formatTime(date: Date, timezone: string): string {
  return inZone(date, timezone).toFormat('HH:mm')
}

/** "22/08" */
export function formatDayMonth(date: Date, timezone: string): string {
  return inZone(date, timezone).toFormat('dd/MM')
}

/** "sexta, 22/08" — com "hoje" e "amanhã" quando for o caso. */
export function formatDayLabel(date: Date, timezone: string, now: Date = new Date()): string {
  const target = inZone(date, timezone).startOf('day')
  const today = inZone(now, timezone).startOf('day')
  const diff = Math.round(target.diff(today, 'days').days)

  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  return `${WEEKDAYS[target.weekday - 1]}, ${target.toFormat('dd/MM')}`
}

/** "Sáb 23/08" — versão curta, para caber nas 24 letras da linha da lista. */
export function formatDayShort(date: Date, timezone: string, now: Date = new Date()): string {
  const target = inZone(date, timezone).startOf('day')
  const today = inZone(now, timezone).startOf('day')
  const diff = Math.round(target.diff(today, 'days').days)

  if (diff === 0) return `Hoje ${target.toFormat('dd/MM')}`
  if (diff === 1) return `Amanhã ${target.toFormat('dd/MM')}`
  return `${WEEKDAYS_SHORT[target.weekday - 1]} ${target.toFormat('dd/MM')}`
}

/** "sexta, 22/08 às 14:30" — o formato usado nas confirmações e lembretes. */
export function formatDateTime(date: Date, timezone: string, now: Date = new Date()): string {
  return `${formatDayLabel(date, timezone, now)} às ${formatTime(date, timezone)}`
}

/** Data local no formato "2026-08-22". */
export function toLocalDay(date: Date, timezone: string): string {
  return inZone(date, timezone).toISODate() ?? ''
}

/**
 * O instante está dentro do silêncio noturno?
 *
 * A faixa costuma atravessar a meia-noite ("21:00" → "08:00"), então a
 * comparação é feita nos dois sentidos.
 */
export function isQuietHour(date: Date, timezone: string, start: string, end: string): boolean {
  const minutes = inZone(date, timezone).hour * 60 + inZone(date, timezone).minute
  const from = hhmmToMinutes(start)
  const to = hhmmToMinutes(end)
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

/**
 * Adia o envio para o fim do silêncio noturno. Um lembrete de 2h que cairia às
 * 6h da manhã sai às 8h — se o atendimento for antes disso, quem chama decide
 * descartar em vez de acordar o cliente.
 */
export function nextAllowedTime(date: Date, timezone: string, start: string, end: string): Date {
  if (!isQuietHour(date, timezone, start, end)) return date

  const local = inZone(date, timezone)
  const endMinutes = hhmmToMinutes(end)
  const sameDayEnd = local.startOf('day').plus({ minutes: endMinutes })

  const target = local < sameDayEnd ? sameDayEnd : sameDayEnd.plus({ days: 1 })
  return target.toJSDate()
}

function hhmmToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':')
  return Number(hours) * 60 + Number(minutes)
}
