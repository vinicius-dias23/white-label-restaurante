import { describe, expect, it } from 'vitest'
import { editarCaminho, editarChaveAninhada } from '../studio/json-edit.js'

/**
 * O que este teste protege: o config do restaurante é escrito à mão e revisado em
 * pull request. Uma edição do estúdio precisa aparecer no diff como as linhas
 * que mudaram, e nada mais.
 */

const ARQUIVO = `{
  "brand": {
    "name": "Cantina do Zé"
  },

  "areas": [
    {
      "name": "Salão",
      "capacity": 40
    }
  ],

  "whatsapp": {
    "greeting": "",
    "handoffMinutes": 30,
    "messages": {
      "lembrete24h": true
    }
  }
}
`

describe('editarChaveAninhada', () => {
  it('cria a chave nova sem tocar no resto do arquivo', () => {
    const saida = editarChaveAninhada(ARQUIVO, 'whatsapp', 'textos', { 'cliente.cancelado.corpo': 'Feito.' })!

    expect(saida).toContain('"brand": {\n    "name": "Cantina do Zé"\n  },\n\n  "areas"')
    expect(saida).toContain('    "textos": {\n      "cliente.cancelado.corpo": "Feito."\n    }')
    expect(JSON.parse(saida).whatsapp.textos).toEqual({ 'cliente.cancelado.corpo': 'Feito.' })
    expect(JSON.parse(saida).whatsapp.handoffMinutes).toBe(30)
  })

  it('substitui a chave que já existe', () => {
    const comTextos = editarChaveAninhada(ARQUIVO, 'whatsapp', 'textos', { a: '1' })!
    const trocado = editarChaveAninhada(comTextos, 'whatsapp', 'textos', { b: '2' })!

    expect(JSON.parse(trocado).whatsapp.textos).toEqual({ b: '2' })
    expect(trocado.split('"textos"')).toHaveLength(2)
  })

  it('remove a chave e a vírgula que sobraria', () => {
    const comTextos = editarChaveAninhada(ARQUIVO, 'whatsapp', 'textos', { a: '1' })!
    const removido = editarChaveAninhada(comTextos, 'whatsapp', 'textos', null)!

    expect(removido).toBe(ARQUIVO)
  })

  it('não inventa a raiz que não existe', () => {
    expect(editarChaveAninhada('{\n  "brand": {}\n}\n', 'whatsapp', 'textos', { a: '1' })).toBeNull()
  })

  it('não se perde com chave dentro de string', () => {
    const arquivo = `{
  "hero": {
    "headline": "vem pro \\"whatsapp\\" da gente"
  },

  "whatsapp": {
    "greeting": ""
  }
}
`
    const saida = editarChaveAninhada(arquivo, 'whatsapp', 'textos', { a: '1' })!
    expect(JSON.parse(saida).whatsapp.textos).toEqual({ a: '1' })
    expect(JSON.parse(saida).hero.headline).toBe('vem pro "whatsapp" da gente')
  })

  it('preserva um texto com quebra de linha e emoji', () => {
    const saida = editarChaveAninhada(ARQUIVO, 'whatsapp', 'textos', {
      'cliente.menu.corpo': 'Olá 🍝\nComo posso ajudar?',
    })!
    expect(JSON.parse(saida).whatsapp.textos['cliente.menu.corpo']).toBe('Olá 🍝\nComo posso ajudar?')
  })
})

describe('editarCaminho — primeiro nível', () => {
  it('troca uma lista inteira sem tocar nas seções vizinhas', () => {
    const saida = editarCaminho(ARQUIVO, ['areas'], [
      { slug: 'salao', name: 'Salão principal', capacity: 50 },
    ])!

    expect(JSON.parse(saida).areas).toEqual([
      { slug: 'salao', name: 'Salão principal', capacity: 50 },
    ])
    // O que não faz parte da lista continua byte a byte igual.
    expect(saida).toContain('"brand": {\n    "name": "Cantina do Zé"\n  },')
    expect(saida).toContain('"whatsapp": {\n    "greeting": ""')
    expect(saida.startsWith('{\n  "brand"')).toBe(true)
  })

  it('cria a chave de primeiro nível que ainda não existe', () => {
    const saida = editarCaminho(ARQUIVO, ['booking'], { maxPerContact: 2 })!
    expect(JSON.parse(saida).booking).toEqual({ maxPerContact: 2 })
    expect(JSON.parse(saida).areas).toHaveLength(1)
  })

  it('remove a chave de primeiro nível', () => {
    const saida = editarCaminho(ARQUIVO, ['areas'], null)!
    expect(JSON.parse(saida).areas).toBeUndefined()
    expect(JSON.parse(saida).brand.name).toBe('Cantina do Zé')
  })

  it('preserva o arquivo quando o valor não muda nada de fato', () => {
    const original = JSON.parse(ARQUIVO)
    const saida = editarCaminho(ARQUIVO, ['areas'], original.areas)!
    expect(JSON.parse(saida)).toEqual(original)
  })
})
