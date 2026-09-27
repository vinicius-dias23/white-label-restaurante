import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, TEXTOS, TEXTO_KEYS, type TextoKey } from '@restaurante/shared/config'
import { makeT } from '../bot/textos.js'

/**
 * O contrato entre o catálogo e o bot.
 *
 * Uma chave que ninguém usa vira campo morto no estúdio: o dono edita e nada
 * muda no WhatsApp. Um `t()` que aponta para chave inexistente cai no padrão
 * errado — ou em nada. Os dois defeitos são invisíveis em produção até o
 * cliente reclamar, então são conferidos aqui.
 */

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Onde os textos podem ser usados. Fora daqui, não é lugar de frase. */
const PASTAS = ['bot', 'scheduler']

function arquivosTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const caminho = join(dir, entry.name)
    if (entry.isDirectory()) return arquivosTs(caminho)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [caminho] : []
  })
}

const codigo = PASTAS.flatMap((pasta) => arquivosTs(join(SRC, pasta)))
  .map((arquivo) => readFileSync(arquivo, 'utf8'))
  .join('\n')

/**
 * Toda chave do catálogo citada no código. Casa o literal pelo formato, e não
 * pela chamada: `t('...')`, `makeT(config)('...')` e uma constante à parte
 * contam igual.
 */
const usadas = new Set(
  [...codigo.matchAll(/'((?:cliente|dono|recepcao|rotulos|template)\.[\w.]+)'/g)].map(
    (match) => match[1] as string,
  ),
)

describe('catálogo de textos', () => {
  it('não tem chave morta: tudo que está no catálogo é usado pelo bot', () => {
    // Os templates da Meta são a exceção: o texto deles é referência do que
    // está aprovado no WhatsApp Manager, e o envio usa o template, não isto.
    const orfas = TEXTO_KEYS.filter(
      (key) => TEXTOS[key].grupo !== 'templates' && !usadas.has(key),
    )
    expect(orfas).toEqual([])
  })

  it('não tem chave inventada: todo t() do código existe no catálogo', () => {
    const inexistentes = [...usadas].filter((key) => !TEXTO_KEYS.includes(key as TextoKey))
    expect(inexistentes).toEqual([])
  })
})

describe('makeT', () => {
  it('devolve o padrão quando o restaurante não customizou nada', () => {
    const t = makeT(DEFAULT_CONFIG)
    expect(t('cliente.menu.saudacao', { marca: 'Cantina do Zé' })).toBe(
      'Olá! Aqui é a Cantina do Zé 🍝',
    )
  })

  it('usa o texto do restaurante quando existe', () => {
    const config = {
      ...DEFAULT_CONFIG,
      whatsapp: {
        ...DEFAULT_CONFIG.whatsapp,
        textos: { 'cliente.cancelado.corpo': 'Cancelado, tudo certo.' } as Partial<
          Record<TextoKey, string>
        >,
      },
    }
    expect(makeT(config)('cliente.cancelado.corpo')).toBe('Cancelado, tudo certo.')
  })

  it('mantém "whatsapp.greeting" mandando na saudação, para não mudar quem já usava', () => {
    const config = {
      ...DEFAULT_CONFIG,
      whatsapp: {
        ...DEFAULT_CONFIG.whatsapp,
        greeting: 'Fala! Cantina do Zé na área.',
        textos: { 'cliente.menu.saudacao': 'Isto aqui perde' } as Partial<Record<TextoKey, string>>,
      },
    }
    expect(makeT(config)('cliente.menu.saudacao', { marca: 'x' })).toBe('Fala! Cantina do Zé na área.')
  })
})
