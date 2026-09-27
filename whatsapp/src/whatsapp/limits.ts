/**
 * Limites de tamanho da Cloud API.
 *
 * A Meta recusa a mensagem inteira quando um único campo passa do limite — um
 * prato chamado "Fettuccine ao Ragù de Costela com Burrata" derrubaria o menu todo.
 * Por isso todo texto que sai daqui passa por `fit()`, que corta com reticências
 * em vez de deixar o envio falhar na frente do cliente.
 *
 * ⚠️  Confira estes números na documentação oficial ao subir a versão da Graph
 *     API: developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
export const LIMITS = {
  /** Corpo da mensagem interativa. */
  bodyText: 1024,
  /** Cabeçalho de texto. */
  headerText: 60,
  /** Rodapé. */
  footerText: 60,
  /** Mensagem de texto simples. */
  text: 4096,

  /** Botões de resposta rápida: no máximo 3 por mensagem. */
  maxButtons: 3,
  buttonTitle: 20,
  buttonId: 256,

  /** Lista: 1 botão que abre o menu, no máximo 10 linhas somando as seções. */
  listButton: 20,
  maxSections: 10,
  maxRows: 10,
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
  rowId: 200,
} as const

/**
 * Encurta o texto para caber, preservando palavras inteiras quando dá.
 * Não coloca "…" se sobrar espaço — o normal é o texto caber inteiro.
 */
export function fit(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  if (max <= 1) return clean.slice(0, max)

  const hard = clean.slice(0, max - 1)
  const lastSpace = hard.lastIndexOf(' ')
  // Só quebra na palavra se isso não jogar fora mais de um terço do espaço.
  const base = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard
  return `${base.trimEnd()}…`
}

/**
 * Mesmo que `fit`, mas preservando as quebras de linha — usado no corpo das
 * mensagens, onde o parágrafo importa.
 */
export function fitBody(text: string, max: number = LIMITS.bodyText): string {
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

/**
 * Erro de programação, não de dado: passar 4 botões é bug no código do menu,
 * não texto comprido do dono do restaurante. Falha alto para aparecer no teste.
 */
export function assertMax(count: number, max: number, what: string): void {
  if (count > max) {
    throw new Error(`WhatsApp aceita no máximo ${max} ${what} — foram montados ${count}`)
  }
}
