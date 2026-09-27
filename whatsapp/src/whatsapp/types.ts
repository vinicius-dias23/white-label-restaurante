/**
 * Formato do webhook da Cloud API — só as partes que este bot usa.
 *
 * Tudo é opcional de propósito: o payload vem de fora, pode mudar de uma versão
 * da API para outra, e um campo faltando não pode derrubar o servidor.
 */

export interface WebhookPayload {
  object?: string
  entry?: WebhookEntry[]
}

export interface WebhookEntry {
  id?: string
  changes?: WebhookChange[]
}

export interface WebhookChange {
  field?: string
  value?: WebhookValue
}

export interface WebhookValue {
  messaging_product?: string
  metadata?: {
    display_phone_number?: string
    /** É por aqui que descobrimos de qual barbearia é a mensagem. */
    phone_number_id?: string
  }
  contacts?: { profile?: { name?: string }; wa_id?: string }[]
  messages?: InboundMessage[]
  statuses?: MessageStatus[]
  errors?: { code?: number; title?: string; message?: string }[]
}

export interface InboundMessage {
  id?: string
  from?: string
  /** Unix em segundos, como string. */
  timestamp?: string
  type?: string
  text?: { body?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string; description?: string }
  }
  /** Resposta a botão de template aprovado. */
  button?: { payload?: string; text?: string }
  image?: { id?: string; mime_type?: string }
  audio?: { id?: string; mime_type?: string }
  location?: { latitude?: number; longitude?: number }
  /** Presente quando o cliente responde citando outra mensagem. */
  context?: { id?: string; from?: string }
}

export interface MessageStatus {
  id?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: string
  recipient_id?: string
  errors?: { code?: number; title?: string; message?: string }[]
  conversation?: { id?: string; origin?: { type?: string } }
  pricing?: { billable?: boolean; category?: string; pricing_model?: string }
}

/**
 * O que o bot realmente precisa saber de uma mensagem recebida, já traduzido:
 * ou o cliente tocou num botão (`action`), ou digitou/mandou outra coisa.
 */
export interface NormalizedInbound {
  messageId: string
  from: string
  profileName: string
  timestamp: Date
  /** ID do botão ou da linha da lista que o cliente tocou. */
  action: string | null
  /** Texto digitado, quando houver. */
  text: string
  /** image, audio, sticker, location... quando não é texto nem botão. */
  mediaType: string | null
}

/**
 * Traduz a mensagem crua para o formato acima.
 *
 * Um detalhe importante: a resposta a botão de TEMPLATE chega em `button.payload`,
 * e não em `interactive` como nas mensagens normais. Sem tratar os dois, os
 * botões "Confirmar presença" e "Cancelar" do lembrete de 24h simplesmente não
 * funcionariam — e é justamente o lembrete que mais gera resposta.
 */
export function normalizeInbound(message: InboundMessage): NormalizedInbound | null {
  if (!message.id || !message.from) return null

  const interactive = message.interactive
  const action =
    interactive?.button_reply?.id ??
    interactive?.list_reply?.id ??
    message.button?.payload ??
    null

  const type = message.type ?? 'unknown'
  const isTextual = type === 'text' || type === 'interactive' || type === 'button'

  return {
    messageId: message.id,
    from: message.from,
    profileName: '',
    timestamp: new Date(Number(message.timestamp ?? 0) * 1000 || Date.now()),
    action,
    text: message.text?.body?.trim() ?? message.button?.text?.trim() ?? '',
    mediaType: isTextual ? null : type,
  }
}
