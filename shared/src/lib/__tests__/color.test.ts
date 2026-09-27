import { describe, expect, it } from 'vitest'
import { contrast, ensureContrast, isHex, luminance, mix, normalizeHex, readableOn, withAlpha } from '../color.js'

describe('isHex / normalizeHex', () => {
  it('aceita as formas curta e longa', () => {
    expect(isHex('#fff')).toBe(true)
    expect(isHex('#1E3A5F')).toBe(true)
  })

  it('rejeita o que não é cor', () => {
    expect(isHex('azul')).toBe(false)
    expect(isHex('#12345')).toBe(false)
    expect(isHex(42)).toBe(false)
    expect(isHex(undefined)).toBe(false)
  })

  it('expande a forma curta', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff')
    expect(normalizeHex('#1E3A5F')).toBe('#1e3a5f')
  })
})

describe('luminance / contrast', () => {
  it('vai de preto a branco', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('calcula o contraste máximo entre preto e branco', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('é simétrico', () => {
    expect(contrast('#16345b', '#0a0a0b')).toBeCloseTo(contrast('#0a0a0b', '#16345b'), 5)
  })
})

describe('mix', () => {
  it('interpola entre as duas pontas', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('readableOn', () => {
  it('escolhe texto claro sobre fundo escuro e vice-versa', () => {
    expect(readableOn('#16345b')).toBe('#ffffff')
    expect(readableOn('#f5d76e')).toBe('#0A0A0B')
  })
})

describe('ensureContrast', () => {
  it('clareia a marca escura até ficar legível sobre o preto', () => {
    const accent = ensureContrast('#16345b', '#0a0a0b', 4.5)
    expect(contrast(accent, '#0a0a0b')).toBeGreaterThanOrEqual(4.5)
  })

  it('não mexe na cor que já tem contraste', () => {
    expect(ensureContrast('#f5d76e', '#0a0a0b', 4.5)).toBe('#f5d76e')
  })

  it('escurece quando o fundo é claro', () => {
    const accent = ensureContrast('#cccccc', '#ffffff', 4.5)
    expect(luminance(accent)).toBeLessThan(luminance('#cccccc'))
  })
})

describe('withAlpha', () => {
  it('converte para rgb com alfa', () => {
    expect(withAlpha('#16345b', 0.5)).toBe('rgb(22 52 91 / 0.5)')
  })
})
