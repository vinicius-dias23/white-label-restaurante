/** Utilidades de cor usadas para derivar o tema a partir das cores do config. */

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** `true` para `#fff` ou `#ffffff` (com ou sem maiúsculas). */
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim())
}

/** Normaliza para a forma longa em minúsculas: `#FFF` -> `#ffffff`. */
export function normalizeHex(value: string): string {
  const hex = value.trim().toLowerCase()
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return hex
}

export function hexToRgb(value: string): Rgb {
  const hex = normalizeHex(value)
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Luminância relativa (WCAG 2.1), de 0 (preto) a 1 (branco). */
export function luminance(value: string): number {
  const { r, g, b } = hexToRgb(value)
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Razão de contraste WCAG entre duas cores, de 1 a 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/** Mistura linear entre duas cores. `amount` 0 = `a`, 1 = `b`. */
export function mix(a: string, b: string, amount: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const t = Math.min(1, Math.max(0, amount))
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  })
}

export const lighten = (value: string, amount: number) => mix(value, '#ffffff', amount)
export const darken = (value: string, amount: number) => mix(value, '#000000', amount)

/** `#rrggbb` -> `rgb(r g b / alpha)`, para sombras e véus sobre imagem. */
export function withAlpha(value: string, alpha: number): string {
  const { r, g, b } = hexToRgb(value)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

/**
 * Escolhe entre o texto claro e o escuro do tema o que tiver melhor
 * contraste sobre `background` — usado no texto dos botões da marca.
 */
export function readableOn(background: string, light = '#ffffff', dark = '#0A0A0B'): string {
  return contrast(background, light) >= contrast(background, dark) ? light : dark
}

/**
 * Ajusta `color` até atingir `target` de contraste sobre `background`,
 * clareando ou escurecendo conforme o fundo. Devolve a cor original
 * quando o contraste já é suficiente.
 *
 * Serve para o caso mais comum do white-label: uma marca azul-escura
 * sobre um fundo preto, que sumiria em textos, ícones e bordas.
 */
export function ensureContrast(color: string, background: string, target = 4.5): string {
  if (contrast(color, background) >= target) return color

  const towards = luminance(background) < 0.5 ? '#ffffff' : '#000000'
  let best = color
  for (let step = 1; step <= 20; step += 1) {
    best = mix(color, towards, step / 20)
    if (contrast(best, background) >= target) return best
  }
  return best
}
