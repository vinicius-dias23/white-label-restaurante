import { normalizeConfig, type SiteConfig } from '@restaurante/shared/config'
import { normalizePhone } from '@restaurante/shared/lib/whatsapp'
import { env } from '../../env.js'
import { decryptSecret, encryptSecret } from '../../lib/crypto.js'
import { log } from '../../lib/logger.js'
import { resolveSlugs } from '../../tenants/slug.js'
import type { AreaRecord, StaffMember, Tenant } from '../../tenants/types.js'
import { query, queryOne, transaction } from '../pool.js'

interface TenantRow {
  id: string
  slug: string
  display_name: string
  phone_number_id: string
  waba_id: string
  access_token_enc: Buffer | null
  owner_phone: string
  timezone: string
  config: unknown
  active: boolean
  bot_paused_until: Date | null
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    ownerPhone: row.owner_phone,
    timezone: row.timezone || env.defaultTimezone,
    config: normalizeConfig(row.config),
    active: row.active,
    botPausedUntil: row.bot_paused_until,
  }
}

const SELECT = `
  SELECT id, slug, display_name, phone_number_id, waba_id, access_token_enc,
         owner_phone, timezone, config, active, bot_paused_until
  FROM tenants
`

export async function findTenantByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
  const row = await queryOne<TenantRow>(`${SELECT} WHERE phone_number_id = $1 AND active`, [phoneNumberId])
  return row ? toTenant(row) : null
}

export async function findTenantBySlug(slug: string): Promise<Tenant | null> {
  const row = await queryOne<TenantRow>(`${SELECT} WHERE slug = $1`, [slug])
  return row ? toTenant(row) : null
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  const row = await queryOne<TenantRow>(`${SELECT} WHERE id = $1`, [id])
  return row ? toTenant(row) : null
}

export async function listTenants(): Promise<Tenant[]> {
  const rows = await query<TenantRow>(`${SELECT} ORDER BY slug`)
  return rows.map(toTenant)
}

/** Token da Meta, decifrado na hora do uso. Nunca fica em cache em texto claro. */
export async function getAccessToken(tenantId: string): Promise<string> {
  const row = await queryOne<{ access_token_enc: Buffer | null }>(
    'SELECT access_token_enc FROM tenants WHERE id = $1',
    [tenantId],
  )
  if (!row?.access_token_enc) {
    throw new Error('restaurante sem token cadastrado — rode: npm run tenant:add')
  }
  return decryptSecret(row.access_token_enc)
}

export interface TenantInput {
  slug: string
  displayName: string
  phoneNumberId: string
  wabaId: string
  /** Vazio mantém o token que já está no banco. */
  accessToken?: string
  ownerPhone: string
  timezone: string
  config: SiteConfig
}

/**
 * Cria ou atualiza o restaurante. Chamado pelo `tenant:sync` a cada deploy: o
 * `restaurante.config.json` é a fonte da verdade, o banco é o espelho dele.
 */
export async function upsertTenant(input: TenantInput): Promise<Tenant> {
  const encrypted = input.accessToken ? encryptSecret(input.accessToken) : null

  const row = await upsertRow(input, encrypted)
  if (!row) throw new Error('falha ao gravar o restaurante')
  return toTenant(row)
}

/** Código do Postgres para violação de UNIQUE. */
const UNIQUE_VIOLATION = '23505'

async function upsertRow(input: TenantInput, encrypted: Buffer | null): Promise<TenantRow | null> {
  try {
    return await runUpsert(input, encrypted)
  } catch (error) {
    // O conflito por `slug` o próprio ON CONFLICT resolve. O que sobra é outro
    // restaurante já usando este phone_number_id — acontece ao renomear o slug
    // de um restaurante já cadastrado, e o erro cru do banco não explica nada.
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      const dono = await queryOne<{ slug: string }>(
        'SELECT slug FROM tenants WHERE phone_number_id = $1',
        [input.phoneNumberId],
      )
      if (dono && dono.slug !== input.slug) {
        throw new Error(
          `o número ${input.phoneNumberId} já está cadastrado no restaurante "${dono.slug}".\n` +
            `  Cada restaurante precisa do seu próprio número.\n` +
            `  · Era para ser o mesmo restaurante? Renomeie a pasta tenants/${input.slug}/ para tenants/${dono.slug}/\n` +
            `  · São restaurantes diferentes? Use o phone_number_id do outro número em TENANT_PHONE_NUMBER_ID`,
        )
      }
    }
    throw error
  }
}

async function runUpsert(input: TenantInput, encrypted: Buffer | null): Promise<TenantRow | null> {
  return queryOne<TenantRow>(
    `
    INSERT INTO tenants (slug, display_name, phone_number_id, waba_id, access_token_enc,
                         owner_phone, timezone, config, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (slug) DO UPDATE SET
      display_name     = EXCLUDED.display_name,
      phone_number_id  = EXCLUDED.phone_number_id,
      waba_id          = EXCLUDED.waba_id,
      -- token vazio no sync não apaga o que já está salvo
      access_token_enc = COALESCE(EXCLUDED.access_token_enc, tenants.access_token_enc),
      -- telefone vazio no sync não apaga o que já está salvo, igual ao token:
      -- um config publicado sem os números não pode tirar o painel do dono.
      owner_phone      = COALESCE(NULLIF(EXCLUDED.owner_phone, ''), tenants.owner_phone),
      timezone         = EXCLUDED.timezone,
      config           = EXCLUDED.config,
      updated_at       = now()
    RETURNING id, slug, display_name, phone_number_id, waba_id, access_token_enc,
              owner_phone, timezone, config, active, bot_paused_until
    `,
    [
      input.slug,
      input.displayName,
      input.phoneNumberId,
      input.wabaId,
      encrypted,
      input.ownerPhone,
      input.timezone,
      JSON.stringify(input.config),
    ],
  )
}

/**
 * Espelha `areas` e `team` do config nas tabelas do banco.
 *
 * Quem sumiu do config é DESATIVADO, nunca apagado: apagar um ambiente levaria
 * junto o histórico de reservas dele. Desativado some do menu e continua no
 * histórico — e as reservas futuras que já existiam continuam valendo.
 */
export async function syncCatalog(tenant: Tenant): Promise<{ areas: number; staff: number }> {
  const bookable = tenant.config.areas.filter((area) => area.bookable && area.capacity > 0)
  // Restaurante sem ambiente no config vira um salão único com o nome da casa.
  // Sem lotação definida não dá para recusar ninguém, então ele nasce com a
  // lotação padrão do primeiro ambiente de demonstração — e o `tenant:sync`
  // avisa, porque é quase certo que falta configurar.
  const areas: { slug: string; name: string; capacity: number }[] =
    bookable.length > 0 ? bookable : [{ slug: '', name: tenant.config.brand.name, capacity: 40 }]
  const areaSlugs = resolveSlugs(areas, 'ambiente')

  const team = tenant.config.team
  const staffSlugs = resolveSlugs(team, 'colaborador')

  await transaction(async (client) => {
    await client.query('UPDATE areas SET active = FALSE WHERE tenant_id = $1', [tenant.id])
    await client.query('UPDATE staff SET active = FALSE WHERE tenant_id = $1', [tenant.id])

    for (const [index, area] of areas.entries()) {
      await client.query(
        `
        INSERT INTO areas (tenant_id, slug, name, capacity, active, sort_order)
        VALUES ($1, $2, $3, $4, TRUE, $5)
        ON CONFLICT (tenant_id, slug)
        DO UPDATE SET name = EXCLUDED.name, capacity = EXCLUDED.capacity,
                      active = TRUE, sort_order = EXCLUDED.sort_order
        `,
        [tenant.id, areaSlugs[index], area.name, area.capacity, index],
      )
    }

    for (const [index, member] of team.entries()) {
      // O config guarda o telefone cru ("(11) 91234-5678"); o banco guarda só
      // dígitos com DDI, porque é assim que o `wa_id` da Meta chega e é assim
      // que a comparação no painel da recepção vira igualdade simples.
      const phone = normalizePhone(member.phone, env.defaultCountryCode)

      await client.query(
        `
        INSERT INTO staff (tenant_id, slug, name, phone, active, sort_order)
        VALUES ($1, $2, $3, $4, TRUE, $5)
        ON CONFLICT (tenant_id, slug)
        DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
                      active = TRUE, sort_order = EXCLUDED.sort_order
        `,
        [tenant.id, staffSlugs[index], member.name, phone, index],
      )
    }
  })

  log.info('catálogo sincronizado', { tenant: tenant.slug, areas: areas.length, staff: team.length })
  return { areas: areas.length, staff: team.length }
}

interface AreaRow {
  id: string
  slug: string
  name: string
  capacity: number
  active: boolean
  sort_order: number
}

export async function listAreas(tenantId: string): Promise<AreaRecord[]> {
  const rows = await query<AreaRow>(
    `SELECT id, slug, name, capacity, active, sort_order
     FROM areas WHERE tenant_id = $1 AND active ORDER BY sort_order`,
    [tenantId],
  )
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    capacity: row.capacity,
    active: row.active,
    sortOrder: row.sort_order,
  }))
}

interface StaffRow {
  id: string
  slug: string
  name: string
  phone: string
  active: boolean
  sort_order: number
}

export async function listStaff(tenantId: string): Promise<StaffMember[]> {
  const rows = await query<StaffRow>(
    'SELECT id, slug, name, phone, active, sort_order FROM staff WHERE tenant_id = $1 AND active ORDER BY sort_order',
    [tenantId],
  )
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    active: row.active,
    sortOrder: row.sort_order,
  }))
}

/** Cala (ou destrava) o bot para o restaurante inteiro — menu do dono. */
export async function setBotPaused(tenantId: string, until: Date | null): Promise<void> {
  await query('UPDATE tenants SET bot_paused_until = $2, updated_at = now() WHERE id = $1', [
    tenantId,
    until,
  ])
}
