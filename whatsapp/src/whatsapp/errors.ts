/**
 * Erros da Cloud API: quais adianta tentar de novo e quais não.
 *
 * Insistir num erro definitivo é pior que inútil — gasta tentativa, polui o log
 * e atrasa as mensagens que iriam sair. O caso mais comum em restaurante é o
 * 131047: passou das 24 horas desde a última mensagem do cliente, então texto
 * livre não sai mais e só um template aprovado resolve.
 */

export interface MetaError {
  code: number
  subcode?: number
  message: string
  details?: string
  /** ID de rastreio da Meta — é o que o suporte deles pede. */
  traceId?: string
}

/** Erros em que tentar de novo mais tarde tem chance real de funcionar. */
const RETRYABLE = new Set([
  0, // erro desconhecido / temporário
  1, // API indisponível
  2, // serviço temporariamente fora
  4, // limite de chamadas da aplicação
  80007, // limite de chamadas do WhatsApp Business
  130429, // limite de envio atingido
  131000, // erro genérico do servidor da Meta
  131016, // serviço indisponível
  131026, // mensagem não entregável (número pode voltar a existir)
  133016, // conta com restrição temporária
])

/** Erros em que insistir nunca vai adiantar. */
const PERMANENT = new Set([
  131047, // fora da janela de 24h — precisa de template
  131051, // tipo de mensagem não suportado
  131052, // falha ao baixar mídia
  132000, // número de variáveis do template não bate
  132001, // template não existe nesse idioma
  132005, // template reprovado / pausado
  132007, // template viola a política
  132012, // formato de variável inválido
  132015, // template pausado por baixa qualidade
  132016, // template desativado
  133010, // número não registrado
  100, // parâmetro inválido na chamada
])

export class WhatsAppApiError extends Error {
  readonly status: number
  readonly meta: MetaError
  readonly retryable: boolean

  constructor(status: number, meta: MetaError) {
    super(`WhatsApp ${meta.code}: ${meta.message}`)
    this.name = 'WhatsAppApiError'
    this.status = status
    this.meta = meta
    this.retryable = isRetryable(status, meta.code)
  }
}

export function isRetryable(status: number, code: number): boolean {
  if (PERMANENT.has(code)) return false
  if (RETRYABLE.has(code)) return true
  // 429 e 5xx são temporários por definição; 4xx restante é erro nosso.
  if (status === 429 || status >= 500) return true
  return false
}

/** O 131047 tem tratamento próprio: é o sinal de "use template a partir de agora". */
export function isOutsideWindow(error: unknown): boolean {
  return error instanceof WhatsAppApiError && error.meta.code === 131047
}

export function parseMetaError(status: number, body: unknown): WhatsAppApiError {
  const raw = (body as { error?: Record<string, unknown> } | null)?.error ?? {}
  const data = (raw.error_data ?? {}) as { details?: string }

  // Nem toda resposta ruim vem no formato de erro da Meta: proxy no caminho,
  // HTML de página de erro, corpo vazio. Guardar o status e um pedaço do corpo
  // é a diferença entre "erro desconhecido" e conseguir depurar.
  const message = raw.message
    ? String(raw.message)
    : `resposta HTTP ${status} sem erro no formato da Meta: ${preview(body)}`

  return new WhatsAppApiError(status, {
    code: Number(raw.code ?? 0),
    subcode: raw.error_subcode ? Number(raw.error_subcode) : undefined,
    message,
    details: data.details ? String(data.details) : undefined,
    traceId: raw.fbtrace_id ? String(raw.fbtrace_id) : undefined,
  })
}

function preview(body: unknown): string {
  if (body === null || body === undefined) return '(corpo vazio)'
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}
