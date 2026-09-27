import { describe, expect, it } from 'vitest'
import type { WeeklyHours } from '@barbearia/shared/config'
import { availableDays, groupByPeriod, periodOf, slotsForDay, type SlotOptions } from '../booking/slots.js'
import { formatTime } from '../lib/datetime.js'

const TZ = 'America/Sao_Paulo'

const HOURS: WeeklyHours = {
  mon: [['09:00', '19:00']],
  tue: [['09:00', '19:00']],
  wed: [['09:00', '19:00']],
  thu: [['09:00', '19:00']],
  // Sexta com intervalo de almoço.
  fri: [
    ['09:00', '12:00'],
    ['13:00', '19:00'],
  ],
  sat: [['08:00', '13:00']],
  sun: [],
}

/** Instante a partir de um horário local, para os testes ficarem legíveis. */
const at = (day: string, time: string): Date => new Date(`${day}T${time}:00-03:00`)

function options(overrides: Partial<SlotOptions> = {}): SlotOptions {
  return {
    hours: HOURS,
    timezone: TZ,
    durationMin: 40,
    stepMin: 30,
    bufferMin: 0,
    leadTimeMin: 0,
    busy: [],
    // Quarta-feira, bem antes de abrir.
    now: at('2026-08-19', '06:00'),
    ...overrides,
  }
}

const times = (slots: Date[]): string[] => slots.map((slot) => formatTime(slot, TZ))

describe('slotsForDay', () => {
  it('gera a grade inteira do dia respeitando o passo', () => {
    const slots = times(slotsForDay('2026-08-19', options()))
    expect(slots[0]).toBe('09:00')
    expect(slots[1]).toBe('09:30')
    // Fecha às 19h e o corte dura 40 min: o último começa 18:00 e termina 18:40.
    // 18:30 + 40 min passaria das 19h.
    expect(slots.at(-1)).toBe('18:00')
  })

  it('não oferece horário que atravessa o intervalo de almoço', () => {
    const slots = times(slotsForDay('2026-08-21', options())) // sexta
    // Fecha 12:00 para o almoço: 11:30 + 40min invadiria o intervalo.
    expect(slots).toContain('11:00')
    expect(slots).not.toContain('11:30')
    expect(slots).toContain('13:00')
  })

  it('dia fechado não tem horário nenhum', () => {
    expect(slotsForDay('2026-08-23', options())).toEqual([]) // domingo
  })

  it('pula o horário já ocupado', () => {
    const busy = [{ start: at('2026-08-19', '10:00'), end: at('2026-08-19', '10:40') }]
    const slots = times(slotsForDay('2026-08-19', options({ busy })))
    expect(slots).not.toContain('10:00')
    // 09:30 + 40min = 10:10, invadiria o agendamento das 10:00.
    expect(slots).not.toContain('09:30')
    // 10:30 começaria antes de o atendimento das 10:00 terminar (10:40).
    expect(slots).not.toContain('10:30')
    expect(slots).toContain('09:00')
    expect(slots).toContain('11:00')
  })

  it('respeita a folga entre atendimentos', () => {
    const busy = [{ start: at('2026-08-19', '10:00'), end: at('2026-08-19', '10:40') }]
    const slots = times(slotsForDay('2026-08-19', options({ busy, bufferMin: 30 })))
    // Sem folga, 11:00 estaria livre (o anterior termina 10:40). Com 30 min de
    // folga o barbeiro precisa dos 30 minutos, então o próximo é 11:30.
    expect(slots).not.toContain('11:00')
    expect(slots).toContain('11:30')
  })

  it('respeita a antecedência mínima', () => {
    const slots = times(
      slotsForDay('2026-08-19', options({ now: at('2026-08-19', '10:05'), leadTimeMin: 60 })),
    )
    // 10:05 + 1h = 11:05, então 11:00 ainda não vale.
    expect(slots).not.toContain('11:00')
    expect(slots[0]).toBe('11:30')
  })

  it('atende a faixa que atravessa a meia-noite', () => {
    const nightHours: WeeklyHours = { ...HOURS, wed: [['18:00', '02:00']] }
    const slots = times(slotsForDay('2026-08-19', options({ hours: nightHours })))
    expect(slots[0]).toBe('18:00')
    // Fecha às 2h do dia seguinte: o último corte de 40 min começa 01:00.
    expect(slots.at(-1)).toBe('01:00')
  })

  it('serviço longo demais para a janela não gera horário', () => {
    // Sábado abre 08:00 e fecha 13:00 — 5 horas.
    expect(slotsForDay('2026-08-22', options({ durationMin: 400 }))).toEqual([])
  })
})

describe('availableDays', () => {
  it('devolve só os dias que têm horário livre', () => {
    const days = availableDays({ ...options(), horizonDays: 7 }).map((day) => day.day)
    expect(days).toContain('2026-08-19')
    expect(days).not.toContain('2026-08-23') // domingo, fechado
  })

  it('some com o dia que já acabou', () => {
    const days = availableDays({
      ...options({ now: at('2026-08-19', '20:00') }),
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
  it('classifica manhã, tarde e noite pelo fuso da barbearia', () => {
    expect(periodOf(at('2026-08-19', '09:00'), TZ)).toBe('manha')
    expect(periodOf(at('2026-08-19', '13:00'), TZ)).toBe('tarde')
    expect(periodOf(at('2026-08-19', '19:00'), TZ)).toBe('noite')
  })

  it('agrupa a grade do dia em três turnos', () => {
    const groups = groupByPeriod(slotsForDay('2026-08-19', options()), TZ)
    expect(groups.manha.length).toBeGreaterThan(0)
    expect(groups.tarde.length).toBeGreaterThan(0)
    expect(times(groups.manha).every((time) => time < '12:00')).toBe(true)
  })
})
