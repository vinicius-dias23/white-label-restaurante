import { env } from '../env.js'
import { log } from '../lib/logger.js'
import { parseMetaError, WhatsAppApiError } from './errors.js'
import { markAsRead, type OutgoingMessage } from './payloads.js'

/**
 * Cliente HTTP da Cloud API.
 *
 * Uma instância por barbearia, porque cada uma tem seu número e seu token.
 * O `TenantRegistry` cuida de criar e reaproveitar essas instâncias.
 */

export interface SendResult {
  /** ID da mensagem na Meta (wamid...). Serve para casar com os status depois. */
  messageId: string
}

/** Fachada mínima — o teste injeta uma implementação falsa no lugar. */
export interface WhatsAppSender {
  send(message: OutgoingMessage): Promise<SendResult>
  markRead(messageId: string): Promise<void>
}

export class WhatsAppClient implements WhatsAppSender {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  private get messagesUrl(): string {
    return `${env.meta.apiBaseUrl}/${env.meta.graphVersion}/${this.phoneNumberId}/messages`
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    const body = await this.post(this.messagesUrl, message)
    const messages = (body as { messages?: { id?: string }[] }).messages ?? []
    return { messageId: messages[0]?.id ?? '' }
  }

  /**
   * Tiques azuis na mensagem do cliente. Falhar aqui não é motivo para derrubar
   * o atendimento — no pior caso o cliente só não vê o "lido".
   */
  async markRead(messageId: string): Promise<void> {
    try {
      await this.post(this.messagesUrl, markAsRead(messageId))
    } catch (error) {
      log.debug('não deu para marcar como lida', {
        messageId,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Lista os templates da conta — usado pelo `npm run templates:check`. */
  async listTemplates(wabaId: string): Promise<{ name: string; status: string; language: string; category: string }[]> {
    const url = `${env.meta.apiBaseUrl}/${env.meta.graphVersion}/${wabaId}/message_templates?limit=200`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(env.meta.timeoutMs),
    })
    // Nem sempre volta JSON: proxy no caminho, página de erro em HTML, corpo
    // vazio. Sem este catch, o `templates:check` mostraria um erro de parse
    // ("Unexpected token 'H'") no lugar do que de fato aconteceu.
    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) throw parseMetaError(response.status, body)
    if (body === null) throw parseMetaError(response.status, null)
    return ((body as { data?: unknown[] }).data ?? []) as {
      name: string
      status: string
      language: string
      category: string
    }[]
  }

  private async post(url: string, payload: unknown): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(env.meta.timeoutMs),
      })
    } catch (error) {
      // Rede caiu ou estourou o tempo: tratado como temporário, vale tentar de novo.
      throw new WhatsAppApiError(0, {
        code: 0,
        message: error instanceof Error ? error.message : 'falha de rede ao falar com a Meta',
      })
    }

    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) throw parseMetaError(response.status, body)
    return body
  }
}

/**
 * Reenvio com espera crescente (1s, 2s, 4s...), só para erro temporário.
 * Erro definitivo sobe na primeira tentativa: insistir num template reprovado
 * não muda nada e só atrasa a fila.
 */
export async function sendWithRetry(
  sender: WhatsAppSender,
  message: OutgoingMessage,
  maxAttempts = 3,
): Promise<SendResult> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await sender.send(message)
    } catch (error) {
      lastError = error
      const retryable = error instanceof WhatsAppApiError && error.retryable
      if (!retryable || attempt === maxAttempts) break

      const waitMs = 2 ** (attempt - 1) * 1000
      log.warn('envio falhou, tentando de novo', {
        attempt,
        waitMs,
        reason: error instanceof Error ? error.message : String(error),
      })
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  throw lastError
}
