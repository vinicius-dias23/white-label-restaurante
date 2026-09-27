/**
 * Identificador estável a partir de um nome ("Área Externa" → "area-externa").
 *
 * Estável importa: o slug é a ponte entre o `restaurante.config.json` e as linhas
 * já gravadas no banco. Se ele mudasse a cada sync, cada `npm run tenant:sync`
 * criaria ambientes novos e órfãos, e as reservas apontariam para o ambiente
 * antigo. Por isso: renomear um ambiente no config muda o nome, não o slug —
 * desde que o começo do nome continue o mesmo.
 */
export function slugify(text: string, fallback = 'item'): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return slug || fallback
}

/** Garante slugs únicos dentro de uma lista, acrescentando -2, -3... */
export function uniqueSlugs(names: string[], fallback = 'item'): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const base = slugify(name, fallback)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

/**
 * Os slugs de uma lista de itens que podem trazer o seu já fixado.
 *
 * O slug escrito no config manda — é ele que segura a identidade quando o dono
 * renomeia o ambiente pelo estúdio. Quem não tem cai na derivação do nome, como
 * sempre, e a numeração de desempate pula os slugs já tomados para nunca
 * roubar a linha de outro item.
 */
export function resolveSlugs(
  items: { slug: string; name: string }[],
  fallback = 'item',
): string[] {
  const fixos = new Set(items.map((item) => item.slug).filter(Boolean))
  const usados = new Set(fixos)

  return items.map((item) => {
    if (item.slug) return item.slug

    const base = slugify(item.name, fallback)
    if (!usados.has(base)) {
      usados.add(base)
      return base
    }
    for (let n = 2; ; n += 1) {
      const candidato = `${base}-${n}`
      if (!usados.has(candidato)) {
        usados.add(candidato)
        return candidato
      }
    }
  })
}
