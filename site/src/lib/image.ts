/**
 * Ajuste de imagens remotas.
 *
 * URLs do Unsplash aceitam parâmetros de redimensionamento, então o site
 * pede exatamente o tamanho que vai usar — no 4G isso é a diferença entre
 * 2 MB e 80 KB por foto. Qualquer outra URL passa intacta.
 */

const UNSPLASH_HOST = 'images.unsplash.com'

function isUnsplash(url: string): boolean {
  try {
    return new URL(url, 'https://x.invalid').hostname === UNSPLASH_HOST
  } catch {
    return false
  }
}

export interface SizeOptions {
  width: number
  /** Proporção largura/altura. Sem valor, o Unsplash mantém a original. */
  ratio?: number
  quality?: number
}

/** URL da imagem no tamanho pedido. */
export function sizedUrl(url: string, { width, ratio, quality = 72 }: SizeOptions): string {
  if (!url || !isUnsplash(url)) return url
  const parsed = new URL(url)
  parsed.searchParams.set('auto', 'format')
  parsed.searchParams.set('fit', 'crop')
  parsed.searchParams.set('crop', 'entropy')
  parsed.searchParams.set('q', String(quality))
  parsed.searchParams.set('w', String(Math.round(width)))
  if (ratio) parsed.searchParams.set('h', String(Math.round(width / ratio)))
  return parsed.toString()
}

/** `srcSet` em 1x/1.5x/2x para telas retina de celular. */
export function buildSrcSet(url: string, options: SizeOptions): string | undefined {
  if (!url || !isUnsplash(url)) return undefined
  return [1, 1.5, 2]
    .map((dpr) => {
      const width = Math.round(options.width * dpr)
      return `${sizedUrl(url, { ...options, width })} ${width}w`
    })
    .join(', ')
}

/**
 * Placeholder usado quando a imagem não carrega (link quebrado, offline)
 * ou quando o config não trouxe foto: gradiente escuro com a navalha da
 * marca, no lugar do ícone de imagem quebrada do navegador.
 */
export function placeholderImage(seed: string, accent: string, background: string): string {
  const id = `g${Math.abs(hash(seed)) % 9999}`
  const angle = (Math.abs(hash(seed)) % 60) + 20
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} 0.5 0.5)">
<stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="${accent}" stop-opacity="0.35"/>
</linearGradient></defs>
<rect width="400" height="400" fill="url(#${id})"/>
<g stroke="${accent}" stroke-opacity="0.5" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none">
<path d="M150 250 250 150M150 250l20 20 100-100-20-20M150 250l-20 20 20 20"/>
</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n/g, ''))}`
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i)
    h |= 0
  }
  return h
}
