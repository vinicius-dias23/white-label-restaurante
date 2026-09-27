/**
 * Schema do `barbearia.config.json`: tipos, padrões e validação.
 *
 * Quem carrega o arquivo é cada módulo — o site importa o JSON da raiz no
 * build, a automação lê os `tenants/<slug>/barbearia.config.json` do disco.
 * Os dois passam o resultado por `normalizeConfig` para chegar na mesma
 * `SiteConfig` completa.
 */
export * from './types.js'
export { DEFAULT_CONFIG } from './defaults.js'
export {
  GRUPO_LABELS,
  isTextoKey,
  TEXTOS,
  TEXTOS_PADRAO,
  TEXTO_KEYS,
  type GrupoTexto,
  type TextoKey,
  type TextoMeta,
} from './textos.js'
export { normalizeConfig, setConfigWarnHandler } from './normalize.js'
