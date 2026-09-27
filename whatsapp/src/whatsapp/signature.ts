import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Conferência da assinatura do webhook.
 *
 * A Meta assina cada POST com HMAC-SHA256 do corpo CRU usando a chave secreta
 * do aplicativo, e manda o resultado no cabeçalho `X-Hub-Signature-256`.
 *
 * Sem essa checagem, qualquer pessoa que descobrir a URL pode inventar
 * mensagens: agendar em nome de terceiros, cancelar horários alheios,
 * disparar o menu do dono. É a única barreira do endpoint — ele é público.
 *
 * Dois cuidados que parecem detalhe e não são:
 *
 *  · o HMAC é do corpo EXATAMENTE como chegou. `JSON.parse` seguido de
 *    `JSON.stringify` reordena e reespaça, e a assinatura nunca mais bate.
 *  · a comparação é feita em tempo constante. Um `===` compara byte a byte e
 *    para no primeiro diferente — o tempo de resposta vaza quantos bytes
 *    estavam certos, e isso permite descobrir a assinatura por tentativa.
 */

const PREFIX = 'sha256='

export function computeSignature(rawBody: Buffer | string, appSecret: string): string {
  const hmac = createHmac('sha256', appSecret)
  hmac.update(rawBody)
  return PREFIX + hmac.digest('hex')
}

export function isValidSignature(
  rawBody: Buffer | string,
  headerValue: string | undefined,
  appSecret: string,
): boolean {
  if (!headerValue || !headerValue.startsWith(PREFIX)) return false

  const expected = Buffer.from(computeSignature(rawBody, appSecret), 'utf8')
  const received = Buffer.from(headerValue, 'utf8')

  // timingSafeEqual exige o mesmo tamanho; tamanho diferente já é inválido.
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

/**
 * Verificação do webhook (GET), feita uma vez quando você cadastra a URL no
 * painel da Meta: ela chama a URL com um desafio e o token que você digitou lá.
 * Devolvendo o desafio, o webhook é ativado.
 */
export function verifyChallenge(
  params: { mode?: string; token?: string; challenge?: string },
  verifyToken: string,
): string | null {
  if (params.mode === 'subscribe' && params.token === verifyToken && params.challenge) {
    return params.challenge
  }
  return null
}
