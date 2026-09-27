import type { ThemeColors } from '@barbearia/shared/config'
import { contrast, ensureContrast, lighten, mix, readableOn, withAlpha } from '@barbearia/shared/lib/color'

/**
 * Traduz as cores do config nas custom properties que o CSS consome.
 *
 * Além das seis cores configuráveis, deriva os tons que fazem o tema
 * funcionar com qualquer marca: um acento com contraste garantido sobre
 * o fundo, a cor de texto dos botões e as bordas/véus translúcidos.
 */
export function buildThemeVars(colors: ThemeColors): Record<string, string> {
  const { background, surface, text, muted, brand } = colors

  // Marca azul-escura sobre fundo preto some em texto e ícone:
  // o acento é a versão com contraste garantido para esses usos.
  const accent = colors.brandAccent || ensureContrast(brand, background, 4.5)

  // O botão sólido preserva a cor da marca — é ela que dá identidade ao
  // site. Só sobe para o acento quando a marca é praticamente o próprio
  // fundo e o botão sumiria por completo.
  const brandSolid = contrast(brand, background) >= 1.25 ? brand : accent

  return {
    '--bb-bg': background,
    '--bb-surface': surface,
    '--bb-surface-2': mix(surface, text, 0.07),
    '--bb-text': text,
    '--bb-muted': muted,
    '--bb-brand': brand,
    '--bb-brand-solid': brandSolid,
    '--bb-brand-accent': accent,
    '--bb-brand-soft': withAlpha(accent, 0.14),
    '--bb-brand-glow': withAlpha(accent, 0.35),
    '--bb-on-brand': readableOn(brandSolid, text, background),
    '--bb-border': withAlpha(text, 0.1),
    '--bb-border-strong': withAlpha(text, 0.2),
    '--bb-scrim': withAlpha(background, 0.72),
    '--bb-overlay-top': withAlpha(background, 0.25),
    '--bb-overlay-bottom': background,
    '--bb-hover': lighten(surface, 0.06),
  }
}

/** Aplica o tema no `<html>`. Chamado antes do primeiro render. */
export function applyTheme(colors: ThemeColors, root: HTMLElement = document.documentElement): void {
  const vars = buildThemeVars(colors)
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background)
}

/** Favicon padrão: navalha na cor da marca sobre o fundo do tema. */
export function defaultFavicon(colors: ThemeColors): string {
  const accent = colors.brandAccent || ensureContrast(colors.brand, colors.background, 4.5)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="${colors.background}"/>
<path d="M9 21.5 21.5 9M9 21.5l2.6 2.6 12.5-12.5-2.6-2.6M9 21.5 6.4 24l2.6 2.6" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n/g, ''))}`
}

/** Troca o favicon da página pelo do config, ou pelo gerado. */
export function applyFavicon(faviconUrl: string, colors: ThemeColors): void {
  const href = faviconUrl || defaultFavicon(colors)
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href
}
