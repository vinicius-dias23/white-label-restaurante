import { describe, expect, it } from 'vitest'
import { dayKeyOf, formatRanges, getOpenState, isOpenNow, nextOpening, toMinutes } from '../hours.js'
import type { WeeklyHours } from '../../config/types.js'

const hours: WeeklyHours = {
  mon: [['09:00', '19:00']],
  tue: [['09:00', '12:00'], ['13:30', '19:00']],
  wed: [['09:00', '19:00']],
  thu: [['09:00', '19:00']],
  fri: [['18:00', '02:00']],
  sat: [['08:00', '18:00']],
  sun: [],
}

/** Datas locais, para bater com o relógio do visitante. */
const at = (iso: string) => new Date(iso)

describe('toMinutes', () => {
  it('converte HH:MM em minutos', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('23:59')).toBe(1439)
  })
})

describe('dayKeyOf', () => {
  it('mapeia domingo e segunda corretamente', () => {
    expect(dayKeyOf(at('2026-08-23T10:00'))).toBe('sun')
    expect(dayKeyOf(at('2026-08-24T10:00'))).toBe('mon')
  })
})

describe('getOpenState', () => {
  it('abre dentro do horário', () => {
    expect(isOpenNow(hours, at('2026-08-24T10:00'))).toBe(true)
  })

  it('fecha antes de abrir e depois de fechar', () => {
    expect(isOpenNow(hours, at('2026-08-24T08:59'))).toBe(false)
    expect(isOpenNow(hours, at('2026-08-24T19:00'))).toBe(false)
  })

  it('fecha durante o intervalo de almoço', () => {
    expect(isOpenNow(hours, at('2026-08-25T12:30'))).toBe(false)
    expect(isOpenNow(hours, at('2026-08-25T13:30'))).toBe(true)
  })

  it('fecha no dia sem faixas', () => {
    expect(isOpenNow(hours, at('2026-08-23T12:00'))).toBe(false)
  })

  it('respeita faixa que atravessa a meia-noite', () => {
    // Sexta 23h: dentro da faixa 18:00–02:00.
    expect(isOpenNow(hours, at('2026-08-28T23:00'))).toBe(true)
    // Sábado 01:00: ainda é a faixa da sexta.
    expect(isOpenNow(hours, at('2026-08-29T01:00'))).toBe(true)
    // Sábado 03:00: já fechou e o sábado só abre às 08:00.
    expect(isOpenNow(hours, at('2026-08-29T03:00'))).toBe(false)
  })

  it('devolve o dia e as faixas de hoje ordenadas', () => {
    const state = getOpenState(hours, at('2026-08-25T09:00'))
    expect(state.today).toBe('tue')
    expect(state.todayRanges[0]).toEqual(['09:00', '12:00'])
  })
})

describe('nextOpening', () => {
  it('aponta a próxima faixa do mesmo dia', () => {
    expect(nextOpening(hours, at('2026-08-25T12:30'))).toEqual({ day: 'tue', time: '13:30' })
  })

  it('pula para o próximo dia com atendimento', () => {
    // Domingo é fechado: a próxima abertura é segunda.
    expect(nextOpening(hours, at('2026-08-23T10:00'))).toEqual({ day: 'mon', time: '09:00' })
  })

  it('devolve null quando nunca abre', () => {
    const closed: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
    expect(nextOpening(closed, at('2026-08-24T10:00'))).toBeNull()
  })
})

describe('formatRanges', () => {
  it('junta as faixas do dia', () => {
    expect(formatRanges(hours.tue)).toBe('09:00 – 12:00 · 13:30 – 19:00')
  })

  it('mostra Fechado quando não há faixa', () => {
    expect(formatRanges([])).toBe('Fechado')
  })
})
