import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeConfig, setConfigWarnHandler, type SiteConfig } from '@restaurante/shared/config'
import { findTenantBySlug, syncCatalog, upsertTenant } from '../db/repositories/tenants.js'
import { env } from '../env.js'
import { log } from '../lib/logger.js'
import { TENANTS_DIR } from '../lib/paths.js'
import { normalizePhone } from '@restaurante/shared/lib/whatsapp'
import { invalidateTenantCache } from './registry.js'
import type { Tenant } from './types.js'

/**
 * Carrega os `whatsapp/tenants/<slug>/restaurante.config.json` para o banco.
 *
 * O arquivo continua sendo a fonte da verdade — versionado no git, revisável
 * num pull request. O banco é só o espelho que o servidor lê rápido.
 *
 * Rode isto depois de todo deploy que mexa em cardápio, horário, ambientes ou equipe.
 */

export { TENANTS_DIR } from '../lib/paths.js'

export interface TenantFile {
  slug: string
  config: SiteConfig
  /** Avisos de validação do JSON (campo inválido caiu no padrão). */
  warnings: string[]
}

export async function listTenantSlugs(dir = TENANTS_DIR): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  } catch {
    return []
  }
}

export async function readTenantFile(slug: string, dir = TENANTS_DIR): Promise<TenantFile> {
  const path = join(dir, slug, 'restaurante.config.json')
  const raw = await readFile(path, 'utf8')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${path} não é um JSON válido: ${error instanceof Error ? error.message : error}`)
  }

  // Os avisos do normalize vão para uma lista em vez do console do navegador.
  const warnings: string[] = []
  setConfigWarnHandler((message) => warnings.push(message))
  const config = normalizeConfig(parsed)
  setConfigWarnHandler(null)

  return { slug, config, warnings }
}

export interface Credentials {
  phoneNumberId: string
  wabaId: string
  accessToken: string
  ownerPhone: string
  timezone: string
}

/**
 * Credenciais do restaurante. Só a primeira (a do `.env`) pode ser cadastrada por
 * variável de ambiente; as demais entram pelo `npm run tenant:add`, que grava
 * criptografado no banco.
 */
export function credentialsFromEnv(slug: string): Credentials | null {
  const bootstrap = env.bootstrapTenant
  if (!bootstrap.slug || bootstrap.slug !== slug) return null
  if (!bootstrap.phoneNumberId) return null

  return {
    phoneNumberId: bootstrap.phoneNumberId,
    wabaId: bootstrap.wabaId,
    accessToken: bootstrap.accessToken,
    ownerPhone: bootstrap.ownerPhone ? normalizePhone(bootstrap.ownerPhone, env.defaultCountryCode) : '',
    timezone: bootstrap.timezone || env.defaultTimezone,
  }
}

export interface SyncResult {
  slug: string
  tenant: Tenant | null
  warnings: string[]
  skipped?: string
}

/**
 * Sincroniza um restaurante. Sem credenciais, o config é gravado assim mesmo
 * quando o restaurante já existe no banco (é o caso comum: mudou o cardápio, o
 * número continua o mesmo).
 */
export async function syncTenant(slug: string, dir = TENANTS_DIR): Promise<SyncResult> {
  const file = await readTenantFile(slug, dir)
  const credentials = credentialsFromEnv(slug)

  // Buscado SEMPRE (e não só quando faltam credenciais): é dele que sai o
  // telefone do dono quando o config não traz nenhum. Uma consulta a mais num
  // script que roda no deploy não custa nada.
  const existing = await findTenantBySlug(slug)

  if (!credentials && !existing) {
    return {
      slug,
      tenant: null,
      warnings: file.warnings,
      skipped:
        'sem credenciais da Meta. Cadastre com: npm run tenant:add -- --slug=' +
        slug +
        ' --phone-number-id=... --waba-id=... --token=... --owner=...',
    }
  }

  /**
   * Quem manda no telefone do dono, nesta ordem:
   *
   *   1. o config — é a fonte da verdade, e é o que o estúdio edita;
   *   2. o `TENANT_OWNER_PHONE` do .env — bootstrap de instalação única;
   *   3. o que já está no banco — cadastrado por `tenant:add --owner`.
   *
   * O que esta ordem garante: publicar um config SEM os números nunca tira o
   * painel de quem já tinha. E preencher no estúdio passa a valer sem ninguém
   * precisar mexer em .env nem em SQL.
   */
  const ownerDoConfig = file.config.whatsapp.owner.phones[0] ?? ''
  const ownerPhone =
    (ownerDoConfig ? normalizePhone(ownerDoConfig, env.defaultCountryCode) : '') ||
    credentials?.ownerPhone ||
    existing?.ownerPhone ||
    ''

  const tenant = await upsertTenant({
    slug,
    displayName: file.config.brand.name,
    phoneNumberId: credentials?.phoneNumberId ?? existing!.phoneNumberId,
    wabaId: credentials?.wabaId ?? existing!.wabaId,
    ...(credentials?.accessToken ? { accessToken: credentials.accessToken } : {}),
    ownerPhone,
    timezone: credentials?.timezone ?? existing!.timezone,
    config: file.config,
  })

  await syncCatalog(tenant)
  invalidateTenantCache(tenant.phoneNumberId)

  const warnings = [...file.warnings]
  if (!file.config.areas.some((area) => area.bookable && area.capacity > 0)) {
    warnings.push(
      'nenhum ambiente com lotação em "areas" — as reservas vão para um salão único de 40 lugares. Configure no estúdio.',
    )
  }

  return { slug, tenant, warnings }
}

export async function syncAllTenants(dir = TENANTS_DIR): Promise<SyncResult[]> {
  const slugs = await listTenantSlugs(dir)
  if (slugs.length === 0) {
    log.warn(`nenhum restaurante encontrado em ${dir}/ — crie ${dir}/<slug>/restaurante.config.json`)
    return []
  }
  const results: SyncResult[] = []
  for (const slug of slugs) results.push(await syncTenant(slug, dir))
  return results
}
