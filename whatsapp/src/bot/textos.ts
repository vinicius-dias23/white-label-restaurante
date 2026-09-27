import type { SiteConfig } from '@restaurante/shared/config'
import { TEXTOS, type TextoKey } from '@restaurante/shared/config/textos'
import { renderTexto } from '@restaurante/shared/lib/texto'

/**
 * O acessor dos textos do bot.
 *
 * `t('cliente.menu.corpo', { marca })` devolve o texto do restaurante quando ele
 * customizou, e o padrão do catálogo quando não. Nenhuma frase visível ao
 * cliente ou ao dono deve nascer fora daqui — o teste de completude reprova.
 */

export type T = (key: TextoKey, vars?: Record<string, string | number>) => string

/**
 * `whatsapp.greeting` é anterior ao catálogo e continua mandando quando
 * preenchido: quem já tinha a saudação no JSON não vê nada mudar.
 */
const HERDADOS: Partial<Record<TextoKey, (config: SiteConfig) => string>> = {
  'cliente.menu.saudacao': (config) => config.whatsapp.greeting,
}

export function makeT(config: SiteConfig): T {
  const textos = config.whatsapp.textos
  return (key, vars = {}) => {
    const herdado = HERDADOS[key]?.(config)
    const template = herdado || textos[key] || TEXTOS[key].padrao
    return renderTexto(template, vars)
  }
}
