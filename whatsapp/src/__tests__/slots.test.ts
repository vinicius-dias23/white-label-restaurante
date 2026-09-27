import { describe, expect, it } from 'vitest'
import type { WeeklyHours } from '@restaurante/shared/config'
import {
  availableDays,
  fits,
  groupByPeriod,
  peakOccupancy,
  periodOf,
  slotsForDay,
  type Occupancy,
  type SlotOptions,
} from '../booking/slots.js'
import { formatTime } from '../lib/datetime.js'

const TZ = 'America/Sao_Paulo'

const HOURS: WeeklyHours = {
  mon: [],
  tue: [['19:00', '23:00']],
  // Quarta com almoço e jantar.
  wed: [
    ['12:00', '15:00'],
    ['19:00', '23:00'],
  ],
  thu: [['19:00', '23:00']],
  fri: [['19:00', '23:00']],
  sat: [['12:00', '16:00']],
  sun: [],
}

/** Instante a partir de um horário local, para os testes ficarem legíveis. */
const at = (day: string, time: string): Date => new Date(`${day}T${time}:00-03:00`)

/** Uma reserva de 2h para `partySize` pessoas começando no horário local. */
const mesa = (day: string, time: string, partySize: number, durationMin = 120): Occupancy => {
  const start = at(day, time)
  return { start, end: new Date(start.getTime() + durationMin * 60_000), partySize }
}

function options(overrides: Partial<SlotOptions> = {}): SlotOptions {
  return {
    hours: HOURS,
    timezone: TZ,
    durationMin: 120,
    stepMin: 30,
    lastSeatingMin: 60,
    leadTimeMin: 0,
    partySize: 2,
    capacity: 20,
    reservations: [],
    blocks: [],
    // Quarta-feira, bem antes de abrir.
    now: at('2026-08-19', '06:00'),
    ...overrides,
  }
}

const times = (slots: Date[]): string[] => slots.map((slot) => formatTime(slot, TZ))

describe('peakOccupancy', () => {
  const DIA = '2026-08-19'
  const ms = (time: string) => at(DIA, time).getTime()

  it('soma quem está sentado ao mesmo tempo', () => {
    const reservas = [mesa(DIA, '19:00', 4), mesa(DIA, '19:30', 6)]
    expect(peakOccupancy(reservas, ms('20:00'), ms('22:00'))).toBe(10)
  })

  it('não soma reservas que nunca dividem o salão', () => {
    // 19h–21h e 21h–23h: a mesa das 20h só encontra uma de cada vez.
    const reservas = [mesa(DIA, '19:00', 8), mesa(DIA, '21:00', 8)]
    expect(peakOccupancy(reservas, ms('20:00'), ms('22:00'))).toBe(8)
  })

  it('pega o pico que acontece no meio do intervalo', () => {
    const reservas = [mesa(DIA, '19:00', 4), mesa(DIA, '20:30', 10)]
    expect(peakOccupancy(reservas, ms('19:30'), ms('21:30'))).toBe(14)
  })

  it('reserva que termina exatamente no começo não conta', () => {
    expect(peakOccupancy([mesa(DIA, '17:00', 10)], ms('19:00'), ms('21:00'))).toBe(0)
  })

  it('fits aceita lotar exatamente o ambiente, e não um lugar a mais', () => {
    const reservas = [mesa(DIA, '19:00', 16)]
    expect(fits(reservas, ms('19:00'), ms('21:00'), 4, 20)).toBe(true)
    expect(fits(reservas, ms('19:00'), ms('21:00'), 5, 20)).toBe(false)
  })
})

describe('slotsForDay', () => {
  it('gera a grade do jantar respeitando o passo e a última reserva', () => {
    const slots = times(slotsForDay('2026-08-20', options())) // quinta
    expect(slots[0]).toBe('19:00')
    expect(slots[1]).toBe('19:30')
    // Fecha às 23h e a última reserva é 1h antes.
    expect(slots.at(-1)).toBe('22:00')
  })

  it('separa almoço e jantar sem oferecer horário no intervalo', () => {
    const slots = times(slotsForDay('2026-08-19', options())) // quarta
    expect(slots).toContain('12:00')
    expect(slots).toContain('14:00')
    expect(slots).not.toContain('14:30')
    expect(slots).not.toContain('17:00')
    expect(slots).toContain('19:00')
  })

  it('dia fechado não tem horário nenhum', () => {
    expect(slotsForDay('2026-08-23', options())).toEqual([]) // domingo
  })

  it('some com o horário em que o grupo não cabe mais', () => {
    const reservations = [mesa('2026-08-20', '20:00', 18)]
    const slots = times(slotsForDay('2026-08-20', options({ reservations, partySize: 4 })))
    // 18 sentados das 20h às 22h: um grupo de 4 não cabe em nada que encoste.
    expect(slots).not.toContain('19:00') // 19h–21h encontra a mesa das 20h
    expect(slots).not.toContain('20:00')
    expect(slots).not.toContain('21:30')
    // Já um casal cabe (18 + 2 = 20).
    expect(times(slotsForDay('2026-08-20', options({ reservations, partySize: 2 })))).toContain('20:00')
  })

  it('volta a oferecer quando a mesa anterior já foi embora', () => {
    const reservations = [mesa('2026-08-20', '19:00', 20)]
    const slots = times(slotsForDay('2026-08-20', options({ reservations })))
    expect(slots).not.toContain('20:30')
    expect(slots).toContain('21:00')
  })

  it('grupo maior que o ambiente não tem horário', () => {
    expect(slotsForDay('2026-08-20', options({ partySize: 25 }))).toEqual([])
  })

  it('respeita o bloqueio do dono', () => {
    const blocks = [{ start: at('2026-08-19', '19:00'), end: at('2026-08-19', '23:59') }]
    const slots = times(slotsForDay('2026-08-19', options({ blocks })))
    expect(slots).toContain('12:00')
    expect(slots.some((time) => time >= '17:00')).toBe(false)
  })

  it('respeita a antecedência mínima', () => {
    const slots = times(
      slotsForDay('2026-08-20', options({ now: at('2026-08-20', '19:05'), leadTimeMin: 60 })),
    )
    // 19:05 + 1h = 20:05, então 20:00 ainda não vale.
    expect(slots).not.toContain('20:00')
    expect(slots[0]).toBe('20:30')
  })

  it('atende a faixa que atravessa a meia-noite', () => {
    const nightHours: WeeklyHours = { ...HOURS, fri: [['19:00', '02:00']] }
    const slots = times(slotsForDay('2026-08-21', options({ hours: nightHours })))
    expect(slots[0]).toBe('19:00')
    // Fecha às 2h do dia seguinte: a última reserva é 01:00.
    expect(slots.at(-1)).toBe('01:00')
  })
})

describe('availableDays', () => {
  it('devolve só os dias que têm mesa', () => {
    const days = availableDays({ ...options(), horizonDays: 7 }).map((day) => day.day)
    expect(days).toContain('2026-08-19')
    expect(days).not.toContain('2026-08-23') // domingo, fechado
    expect(days).not.toContain('2026-08-24') // segunda, fechado
  })

  it('some com o dia que já acabou', () => {
    const days = availableDays({
      ...options({ now: at('2026-08-19', '23:30') }),
      horizonDays: 2,
    }).map((day) => day.day)
    expect(days).not.toContain('2026-08-19')
    expect(days[0]).toBe('2026-08-20')
  })

  it('não passa do horizonte configurado', () => {
    const days = availableDays({ ...options(), horizonDays: 2 })
    expect(days.every((day) => day.day <= '2026-08-21')).toBe(true)
  })
})

describe('turnos', () => {
  it('classifica manhã, almoço e jantar pelo fuso do restaurante', () => {
    expect(periodOf(at('2026-08-19', '09:00'), TZ)).toBe('manha')
    expect(periodOf(at('2026-08-19', '13:00'), TZ)).toBe('almoco')
    expect(periodOf(at('2026-08-19', '20:00'), TZ)).toBe('jantar')
  })

  it('agrupa a grade do dia em almoço e jantar', () => {
    const groups = groupByPeriod(slotsForDay('2026-08-19', options()), TZ)
    expect(groups.manha).toEqual([])
    expect(groups.almoco.length).toBeGreaterThan(0)
    expect(groups.jantar.length).toBeGreaterThan(0)
    expect(times(groups.almoco).every((time) => time < '17:00')).toBe(true)
  })
})
