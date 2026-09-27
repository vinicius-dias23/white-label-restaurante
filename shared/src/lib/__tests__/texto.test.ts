import { describe, expect, it } from 'vitest'
import { renderTexto, variaveisDe } from '../texto.js'
import { TEXTOS, TEXTO_KEYS } from '../../config/textos.js'

describe('renderTexto', () => {
  it('troca a variável pelo valor', () => {
    expect(renderTexto('Olá! Aqui é a {marca} 🍝', { marca: 'Cantina do Zé' })).toBe(
      'Olá! Aqui é a Cantina do Zé 🍝',
    )
  })

  it('aceita número', () => {
    expect(renderTexto('{limite} horários marcados', { limite: 3 })).toBe('3 horários marcados')
  })

  it('repete o valor em todas as ocorrências', () => {
    expect(renderTexto('{a} e {a}', { a: 'x' })).toBe('x e x')
  })

  it('some com a variável que não recebeu valor, em vez de vazar a chave', () => {
    expect(renderTexto('Bloqueado{aviso}', {})).toBe('Bloqueado')
  })

  it('não mexe nos placeholders de template da Meta', () => {
    expect(renderTexto('Oi, {{1}}! na {{2}}', { '1': 'João' })).toBe('Oi, {{1}}! na {{2}}')
  })

  it('deixa passar chave que não é nome de variável', () => {
    expect(renderTexto('{ } e {123}', {})).toBe('{ } e {123}')
  })
})

describe('variaveisDe', () => {
  it('lista na ordem, sem repetir', () => {
    expect(variaveisDe('{a} {b} {a}')).toEqual(['a', 'b'])
  })
})

describe('catálogo', () => {
  it('declara todas as variáveis que o padrão de fato usa', () => {
    for (const key of TEXTO_KEYS) {
      const usadas = variaveisDe(TEXTOS[key].padrao)
      const declaradas = TEXTOS[key].variaveis
      expect({ key, usadas }).toEqual({ key, usadas: usadas.filter((v) => declaradas.includes(v)) })
    }
  })

  it('respeita o limite da Meta em cada padrão', () => {
    for (const key of TEXTO_KEYS) {
      const { padrao, limite } = TEXTOS[key]
      if (limite) expect({ key, tamanho: padrao.length <= limite }).toEqual({ key, tamanho: true })
    }
  })

  it('não tem padrão vazio', () => {
    for (const key of TEXTO_KEYS) {
      expect({ key, vazio: TEXTOS[key].padrao.trim() === '' }).toEqual({ key, vazio: false })
    }
  })
})
