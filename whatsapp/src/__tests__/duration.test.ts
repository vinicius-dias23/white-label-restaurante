import { describe, expect, it } from 'vitest'
import { formatDuration, parseDuration, resolveDuration } from '../booking/duration.js'

/**
 * No config do site a duração é texto livre, porque é o que fica bonito no card.
 * A agenda precisa de número — e é aqui que a tradução acontece.
 */

describe('parseDuration', () => {
  it('entende os formatos que barbearia escreve de verdade', () => {
    expect(parseDuration('40 min')).toBe(40)
    expect(parseDuration('30min')).toBe(30)
    expect(parseDuration('45 minutos')).toBe(45)
    expect(parseDuration('1h')).toBe(60)
    expect(parseDuration('2h')).toBe(120)
    expect(parseDuration('1h 10')).toBe(70)
    expect(parseDuration('1 hora e meia')).toBe(90)
    expect(parseDuration('1h e meia')).toBe(90)
    expect(parseDuration('45')).toBe(45)
  })

  it('devolve null para o que não dá para deduzir', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('rapidinho')).toBeNull()
    expect(parseDuration('a combinar')).toBeNull()
    expect(parseDuration('0 min')).toBeNull()
  })
})

describe('resolveDuration', () => {
  it('durationMin explícito manda em tudo', () => {
    expect(resolveDuration({ duration: '1h', durationMin: 25 }, 40)).toEqual({ minutes: 25, fallback: false })
  })

  it('sem durationMin, deduz do texto', () => {
    expect(resolveDuration({ duration: '1h 10', durationMin: 0 }, 40)).toEqual({ minutes: 70, fallback: false })
  })

  it('sinaliza quando precisou usar o padrão', () => {
    // O `fallback: true` é o que faz o tenant:sync avisar o dono da barbearia.
    expect(resolveDuration({ duration: 'a combinar', durationMin: 0 }, 40)).toEqual({
      minutes: 40,
      fallback: true,
    })
  })
})

describe('formatDuration', () => {
  it('escreve de volta do jeito que se fala', () => {
    expect(formatDuration(40)).toBe('40 min')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(70)).toBe('1h 10')
    expect(formatDuration(90)).toBe('1h 30')
  })
})
