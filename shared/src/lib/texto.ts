/**
 * Substituição das variáveis dos textos do bot.
 *
 * `{nome}` vira o valor correspondente. Uma variável sem valor sai vazia — e
 * não como `{nome}` na cara do cliente, que é o pior desfecho possível de um
 * texto customizado errado.
 *
 * `{{1}}` dos templates da Meta NÃO é tocado: são dois pares de chaves, e o
 * padrão abaixo casa só com um.
 */

const VARIAVEL = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g

export function renderTexto(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(VARIAVEL, (_match, nome: string) => {
    const valor = vars[nome]
    if (valor === undefined || valor === null) return ''
    return String(valor)
  })
}

/** As variáveis usadas num texto, na ordem em que aparecem, sem repetir. */
export function variaveisDe(template: string): string[] {
  const encontradas = new Set<string>()
  for (const match of template.matchAll(VARIAVEL)) {
    if (match[1]) encontradas.add(match[1])
  }
  return [...encontradas]
}
