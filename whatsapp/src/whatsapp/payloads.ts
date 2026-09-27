import { assertMax, fit, fitBody, LIMITS } from './limits.js'

/**
 * Construtores dos payloads que a Cloud API espera em
 * `POST /{phone-number-id}/messages`.
 *
 * São funções puras: recebem texto e devolvem objeto. Isso deixa o menu inteiro
 * testável sem rede, sem banco e sem token — é onde mora a maior parte dos bugs
 * de integração, e é o que os testes cobrem linha a linha.
 */

export interface OutgoingMessage {
  messaging_product: 'whatsapp'
  recipient_type?: 'individual'
  to: string
  [key: string]: unknown
}

export interface ReplyButton {
  id: string
  title: string
}

export interface ListRow {
  id: string
  title: string
  description?: string
}

export interface ListSection {
  title: string
  rows: ListRow[]
}

/** Mensagem de texto simples. Só vale dentro da janela de 24h. */
export function textMessage(to: string, body: string, previewUrl = false): OutgoingMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: fitBody(body, LIMITS.text), preview_url: previewUrl },
  }
}

/**
 * Até 3 botões de resposta rápida. Para mais opções, use `listMessage` —
 * a Meta não aceita um quarto botão de jeito nenhum.
 */
export function buttonMessage(
  to: string,
  body: string,
  buttons: ReplyButton[],
  options: { header?: string; footer?: string } = {},
): OutgoingMessage {
  assertMax(buttons.length, LIMITS.maxButtons, 'botões')

  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: fitBody(body) },
    action: {
      buttons: buttons.map((button) => ({
        type: 'reply',
        reply: { id: fit(button.id, LIMITS.buttonId), title: fit(button.title, LIMITS.buttonTitle) },
      })),
    },
  }
  if (options.header) interactive.header = { type: 'text', text: fit(options.header, LIMITS.headerText) }
  if (options.footer) interactive.footer = { text: fit(options.footer, LIMITS.footerText) }

  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive }
}

/**
 * Menu em lista: um botão que abre até 10 linhas. É o formato do menu principal
 * e das listas de serviço, dia e horário.
 */
export function listMessage(
  to: string,
  body: string,
  buttonLabel: string,
  sections: ListSection[],
  options: { header?: string; footer?: string } = {},
): OutgoingMessage {
  assertMax(sections.length, LIMITS.maxSections, 'seções')
  const totalRows = sections.reduce((sum, section) => sum + section.rows.length, 0)
  assertMax(totalRows, LIMITS.maxRows, 'linhas de lista')
  if (totalRows === 0) throw new Error('lista sem nenhuma linha')

  const interactive: Record<string, unknown> = {
    type: 'list',
    body: { text: fitBody(body) },
    action: {
      button: fit(buttonLabel, LIMITS.listButton),
      sections: sections.map((section) => ({
        title: fit(section.title, LIMITS.sectionTitle),
        rows: section.rows.map((row) => {
          const built: Record<string, string> = {
            id: fit(row.id, LIMITS.rowId),
            title: fit(row.title, LIMITS.rowTitle),
          }
          if (row.description) built.description = fit(row.description, LIMITS.rowDescription)
          return built
        }),
      })),
    },
  }
  if (options.header) interactive.header = { type: 'text', text: fit(options.header, LIMITS.headerText) }
  if (options.footer) interactive.footer = { text: fit(options.footer, LIMITS.footerText) }

  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive }
}

/** Botão que abre um link (usado no pedido de avaliação no Google). */
export function ctaUrlMessage(
  to: string,
  body: string,
  buttonLabel: string,
  url: string,
  options: { header?: string; footer?: string } = {},
): OutgoingMessage {
  const interactive: Record<string, unknown> = {
    type: 'cta_url',
    body: { text: fitBody(body) },
    action: {
      name: 'cta_url',
      parameters: { display_text: fit(buttonLabel, LIMITS.buttonTitle), url },
    },
  }
  if (options.header) interactive.header = { type: 'text', text: fit(options.header, LIMITS.headerText) }
  if (options.footer) interactive.footer = { text: fit(options.footer, LIMITS.footerText) }

  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive }
}

export interface TemplateOptions {
  /** Variáveis {{1}}, {{2}}... do corpo, na ordem. */
  bodyParams?: string[]
  /** Payload de cada botão de resposta rápida do template, na ordem. */
  quickReplyPayloads?: string[]
  /** Sufixo do botão dinâmico de URL, quando o template tiver um. */
  urlSuffix?: string
}

/**
 * Mensagem de template — o ÚNICO formato aceito fora da janela de 24 horas.
 *
 * O nome e o idioma precisam bater exatamente com o que foi aprovado no
 * WhatsApp Manager, e a quantidade de variáveis também: um `{{2}}` sobrando
 * volta como erro 132000 e a mensagem não sai.
 */
export function templateMessage(
  to: string,
  name: string,
  language: string,
  options: TemplateOptions = {},
): OutgoingMessage {
  const components: Record<string, unknown>[] = []

  if (options.bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: options.bodyParams.map((text) => ({ type: 'text', text })),
    })
  }

  options.quickReplyPayloads?.forEach((payload, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload: fit(payload, LIMITS.buttonId) }],
    })
  })

  if (options.urlSuffix) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(options.quickReplyPayloads?.length ?? 0),
      parameters: [{ type: 'text', text: options.urlSuffix }],
    })
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: language },
      ...(components.length > 0 ? { components } : {}),
    },
  }
}

/**
 * Marca a mensagem do cliente como lida (os dois tiques azuis). Barato e faz
 * diferença: o cliente vê que a mensagem chegou antes de o menu aparecer.
 */
export function markAsRead(messageId: string): Record<string, unknown> {
  return { messaging_product: 'whatsapp', status: 'read', message_id: messageId }
}
