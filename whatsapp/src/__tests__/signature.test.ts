import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { computeSignature, isValidSignature, verifyChallenge } from '../whatsapp/signature.js'

/**
 * O webhook é um endereço público: sem esta conferência, qualquer pessoa que
 * descobrir a URL agenda e cancela horários em nome de terceiros.
 */

const SECRET = 'segredo-do-app'
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

describe('assinatura do webhook', () => {
  it('aceita a assinatura que a Meta calcularia', () => {
    const signature = `sha256=${createHmac('sha256', SECRET).update(BODY).digest('hex')}`
    expect(isValidSignature(BODY, signature, SECRET)).toBe(true)
  })

  it('recusa assinatura de outra chave', () => {
    const signature = computeSignature(BODY, 'chave-errada')
    expect(isValidSignature(BODY, signature, SECRET)).toBe(false)
  })

  it('recusa corpo adulterado', () => {
    const signature = computeSignature(BODY, SECRET)
    const adulterado = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'falso' }] })
    expect(isValidSignature(adulterado, signature, SECRET)).toBe(false)
  })

  it('recusa cabeçalho ausente, vazio ou sem o prefixo', () => {
    expect(isValidSignature(BODY, undefined, SECRET)).toBe(false)
    expect(isValidSignature(BODY, '', SECRET)).toBe(false)
    expect(isValidSignature(BODY, 'abc123', SECRET)).toBe(false)
  })

  it('recusa assinatura de tamanho diferente sem estourar', () => {
    // timingSafeEqual lança se os buffers têm tamanhos diferentes — o código
    // precisa conferir o tamanho antes, e não deixar a exceção vazar.
    expect(() => isValidSignature(BODY, 'sha256=abc', SECRET)).not.toThrow()
    expect(isValidSignature(BODY, 'sha256=abc', SECRET)).toBe(false)
  })

  it('funciona igual com Buffer e com string', () => {
    const signature = computeSignature(BODY, SECRET)
    expect(isValidSignature(Buffer.from(BODY, 'utf8'), signature, SECRET)).toBe(true)
  })

  it('a mesma carga reordenada NÃO valida — por isso o corpo cru importa', () => {
    const signature = computeSignature(BODY, SECRET)
    const reordenado = JSON.stringify({ entry: [], object: 'whatsapp_business_account' })
    expect(isValidSignature(reordenado, signature, SECRET)).toBe(false)
  })
})

describe('verificação do webhook (GET)', () => {
  it('devolve o desafio quando o token confere', () => {
    expect(
      verifyChallenge({ mode: 'subscribe', token: 'meu-token', challenge: '12345' }, 'meu-token'),
    ).toBe('12345')
  })

  it('recusa token errado, modo errado e desafio ausente', () => {
    expect(verifyChallenge({ mode: 'subscribe', token: 'outro', challenge: '1' }, 'meu-token')).toBeNull()
    expect(verifyChallenge({ mode: 'unsubscribe', token: 'meu-token', challenge: '1' }, 'meu-token')).toBeNull()
    expect(verifyChallenge({ mode: 'subscribe', token: 'meu-token' }, 'meu-token')).toBeNull()
  })
})
