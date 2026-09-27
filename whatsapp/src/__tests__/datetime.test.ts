import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@restaurante/shared/config'
import {
  formatDateTime,
  formatDayLabel,
  formatDayShort,
  formatTime,
  isQuietHour,
  nextAllowedTime,
  toLocalDay,
} from '../lib/datetime.js'
import { isInQuietHours, isMessageEnabled } from '../scheduler/schedule.js'
import type { Tenant } from '../tenants/types.js'

const TZ = 'America/Sao_Paulo'

function fakeTenant(overrides: Partial<Tenant['config']['whatsapp']['messages']> = {}): Tenant {
  return {
    id: 't1',
    slug: 'teste',
    displayName: 'Cantina Teste',
    phoneNumberId: '123',
    wabaId: '456',
    ownerPhone: '5511999999999',
    timezone: TZ,
    active: true,
    botPausedUntil: null,
    config: {
      ...DEFAULT_CONFIG,
      whatsapp: {
        ...DEFAULT_CONFIG.whatsapp,
        messages: { ...DEFAULT_CONFIG.whatsapp.messages, ...overrides },
      },
    },
  }
}

describe('datas em português', () => {
  const now = new Date('2026-08-21T15:00:00-03:00') // sexta

  it('usa "hoje" e "amanhã" em vez do dia da semana', () => {
    expect(formatDayLabel(new Date('2026-08-21T18:00:00-03:00'), TZ, now)).toBe('hoje')
    expect(formatDayLabel(new Date('2026-08-22T10:00:00-03:00'), TZ, now)).toBe('amanhã')
    expect(formatDayLabel(new Date('2026-08-24T10:00:00-03:00'), TZ, now)).toBe('segunda, 24/08')
  })

  it('versão curta cabe nas 24 letras da linha da lista', () => {
    const label = formatDayShort(new Date('2026-08-25T10:00:00-03:00'), TZ, now)
    expect(label).toBe('Ter 25/08')
    expect(label.length).toBeLessThanOrEqual(24)
  })

  it('converte para o fuso do restaurante, não o do servidor', () => {
    // 23:30 UTC ainda é o dia anterior em São Paulo.
    const instant = new Date('2026-08-22T02:30:00Z')
    expect(formatTime(instant, TZ)).toBe('23:30')
    expect(toLocalDay(instant, TZ)).toBe('2026-08-21')
  })

  it('junta dia e hora no formato das confirmações', () => {
    expect(formatDateTime(new Date('2026-08-22T17:30:00Z'), TZ, now)).toBe('amanhã às 14:30')
  })
})

describe('silêncio noturno', () => {
  it('reconhece a faixa que atravessa a meia-noite', () => {
    const at = (time: string) => new Date(`2026-08-21T${time}:00-03:00`)

    expect(isQuietHour(at('22:00'), TZ, '21:00', '08:00')).toBe(true)
    expect(isQuietHour(at('03:00'), TZ, '21:00', '08:00')).toBe(true)
    expect(isQuietHour(at('07:59'), TZ, '21:00', '08:00')).toBe(true)
    expect(isQuietHour(at('08:00'), TZ, '21:00', '08:00')).toBe(false)
    expect(isQuietHour(at('14:00'), TZ, '21:00', '08:00')).toBe(false)
  })

  it('adia o envio da madrugada para o horário de abertura', () => {
    const madrugada = new Date('2026-08-22T03:00:00-03:00')
    const adiado = nextAllowedTime(madrugada, TZ, '21:00', '08:00')
    expect(formatTime(adiado, TZ)).toBe('08:00')
    expect(toLocalDay(adiado, TZ)).toBe('2026-08-22') // mesmo dia
  })

  it('o que cai à noite é adiado para a manhã seguinte', () => {
    const noite = new Date('2026-08-21T22:30:00-03:00')
    const adiado = nextAllowedTime(noite, TZ, '21:00', '08:00')
    expect(formatTime(adiado, TZ)).toBe('08:00')
    expect(toLocalDay(adiado, TZ)).toBe('2026-08-22') // dia seguinte
  })

  it('não mexe no que já está em horário permitido', () => {
    const tarde = new Date('2026-08-21T14:00:00-03:00')
    expect(nextAllowedTime(tarde, TZ, '21:00', '08:00').getTime()).toBe(tarde.getTime())
  })

  it('usa a faixa configurada por restaurante', () => {
    const tenant = fakeTenant()
    // Padrão do restaurante: 23:30 às 09:00 — o jantar termina tarde.
    expect(isInQuietHours(new Date('2026-08-21T23:45:00-03:00'), tenant)).toBe(true)
    expect(isInQuietHours(new Date('2026-08-21T23:00:00-03:00'), tenant)).toBe(false)
    expect(isInQuietHours(new Date('2026-08-21T10:00:00-03:00'), tenant)).toBe(false)
  })
})

describe('liga/desliga das mensagens programadas', () => {
  it('os lembretes vêm ligados e as três de marketing, desligadas', () => {
    const tenant = fakeTenant()
    expect(isMessageEnabled('lembrete24h', tenant)).toBe(true)
    expect(isMessageEnabled('lembrete2h', tenant)).toBe(true)

    expect(isMessageEnabled('posAtendimento', tenant)).toBe(false)
    expect(isMessageEnabled('reativacao', tenant)).toBe(false)
    expect(isMessageEnabled('aniversario', tenant)).toBe(false)
  })

  it('o restaurante consegue desligar o que o servidor deixou ligado', () => {
    const tenant = fakeTenant({ lembrete2h: false })
    expect(isMessageEnabled('lembrete2h', tenant)).toBe(false)
    expect(isMessageEnabled('lembrete24h', tenant)).toBe(true)
  })

  it('o restaurante NÃO consegue ligar o que o servidor deixou desligado', () => {
    // A trava do .env vem primeiro: é o operador do servidor que responde pela
    // conta na Meta e pela conta do mês.
    const tenant = fakeTenant({ reativacao: true })
    expect(isMessageEnabled('reativacao', tenant)).toBe(false)
  })
})
