import { normalizeConfig, type SiteConfig } from '@barbearia/shared/config'
import { normalizePhone } from '@barbearia/shared/lib/whatsapp'
import { resolveDuration } from '../../booking/duration.js'
import { env } from '../../env.js'
import { decryptSecret, encryptSecret } from '../../lib/crypto.js'
import { log } from '../../lib/logger.js'
import { resolveSlugs } from '../../tenants/slug.js'
import type { Barber, ServiceRecord, Tenant } from '../../tenants/types.js'
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
    throw new Error('barbearia sem token cadastrado — rode: npm run tenant:add')
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
 * Cria ou atualiza a barbearia. Chamado pelo `tenant:sync` a cada deploy: o
 * `barbearia.config.json` é a fonte da verdade, o banco é o espelho dele.
 */
export async function upsertTenant(input: TenantInput): Promise<Tenant> {
  const encrypted = input.accessToken ? encryptSecret(input.accessToken) : null

  const row = await upsertRow(input, encrypted)
  if (!row) throw new Error('falha ao gravar a barbearia')
  return toTenant(row)
}

/** Código do Postgres para violação de UNIQUE. */
const UNIQUE_VIOLATION = '23505'

async function upsertRow(input: TenantInput, encrypted: Buffer | null): Promise<TenantRow | null> {
  try {
    return await runUpsert(input, encrypted)
  } catch (error) {
    // O conflito por `slug` o próprio ON CONFLICT resolve. O que sobra é outra
    // barbearia já usando este phone_number_id — acontece ao renomear o slug de
    // uma barbearia já cadastrada, e o erro cru do banco não explica nada.
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      const dono = await queryOne<{ slug: string }>(
        'SELECT slug FROM tenants WHERE phone_number_id = $1',
        [input.phoneNumberId],
      )
      if (dono && dono.slug !== input.slug) {
        throw new Error(
          `o número ${input.phoneNumberId} já está cadastrado na barbearia "${dono.slug}".\n` +
            `  Cada barbearia precisa do seu próprio número.\n` +
            `  · Era para ser a mesma barbearia? Renomeie a pasta tenants/${input.slug}/ para tenants/${dono.slug}/\n` +
            `  · São barbearias diferentes? Use o phone_number_id do outro número em TENANT_PHONE_NUMBER_ID`,
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
 * Espelha `team` e `services` do config nas tabelas de agenda.
 *
 * Quem sumiu do config é DESATIVADO, nunca apagado: apagar levaria junto os
 * agendamentos históricos daquele barbeiro. Desativado some do menu e continua
 * no histórico.
 */
export async function syncCatalog(tenant: Tenant): Promise<{ barbers: number; services: number; fallbacks: string[] }> {
  const bookableTeam = tenant.config.team.filter((member) => member.bookable)
  // Barbearia sem equipe no config vira uma agenda única com o nome da casa.
  // Ela não ganha telefone: quem comanda essa barbearia é o dono, e ele já tem
  // o painel dele.
  const team: { slug: string; name: string; phone?: string }[] =
    bookableTeam.length > 0 ? bookableTeam : [{ slug: '', name: tenant.config.brand.name }]
  const barberSlugs = resolveSlugs(team, 'barbeiro')

  const serviceSlugs = resolveSlugs(tenant.config.services, 'servico')
  const fallbacks: string[] = []

  await transaction(async (client) => {
    await client.query('UPDATE barbers SET active = FALSE WHERE tenant_id = $1', [tenant.id])
    await client.query('UPDATE services SET active = FALSE WHERE tenant_id = $1', [tenant.id])

    for (const [index, member] of team.entries()) {
      // O config guarda o telefone cru ("(11) 91234-5678"); o banco guarda só
      // dígitos com DDI, porque é assim que o `wa_id` da Meta chega e é assim
      // que a comparação no menu do barbeiro vira igualdade simples.
      const phone = normalizePhone(member.phone ?? '', env.defaultCountryCode)

      await client.query(
        `
        INSERT INTO barbers (tenant_id, slug, name, phone, active, sort_order)
        VALUES ($1, $2, $3, $4, TRUE, $5)
        ON CONFLICT (tenant_id, slug)
        DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
                      active = TRUE, sort_order = EXCLUDED.sort_order
        `,
        [tenant.id, barberSlugs[index], member.name, phone, index],
      )
    }

    for (const [index, service] of tenant.config.services.entries()) {
      const duration = resolveDuration(service, tenant.config.booking.defaultDurationMin)
      if (duration.fallback) fallbacks.push(service.name)

      await client.query(
        `
        INSERT INTO services (tenant_id, slug, name, price_label, duration_min, active, sort_order)
        VALUES ($1, $2, $3, $4, $5, TRUE, $6)
        ON CONFLICT (tenant_id, slug)
        DO UPDATE SET name = EXCLUDED.name, price_label = EXCLUDED.price_label,
                      duration_min = EXCLUDED.duration_min, active = TRUE,
                      sort_order = EXCLUDED.sort_order
        `,
        [tenant.id, serviceSlugs[index], service.name, service.price, duration.minutes, index],
      )
    }
  })

  log.info('catálogo sincronizado', { tenant: tenant.slug, barbers: team.length, services: tenant.config.services.length })
  return { barbers: team.length, services: tenant.config.services.length, fallbacks }
}

interface BarberRow {
  id: string
  slug: string
  name: string
  phone: string
  active: boolean
  sort_order: number
}

export async function listBarbers(tenantId: string): Promise<Barber[]> {
  const rows = await query<BarberRow>(
    'SELECT id, slug, name, phone, active, sort_order FROM barbers WHERE tenant_id = $1 AND active ORDER BY sort_order',
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

interface ServiceRow {
  id: string
  slug: string
  name: string
  price_label: string
  duration_min: number
  active: boolean
  sort_order: number
}

export async function listServices(tenantId: string): Promise<ServiceRecord[]> {
  const rows = await query<ServiceRow>(
    `SELECT id, slug, name, price_label, duration_min, active, sort_order
     FROM services WHERE tenant_id = $1 AND active ORDER BY sort_order`,
    [tenantId],
  )
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceLabel: row.price_label,
    durationMin: row.duration_min,
    active: row.active,
    sortOrder: row.sort_order,
  }))
}


/** Cala (ou destrava) o bot para a barbearia inteira — menu do dono. */
export async function setBotPaused(tenantId: string, until: Date | null): Promise<void> {
  await query('UPDATE tenants SET bot_paused_until = $2, updated_at = now() WHERE id = $1', [
    tenantId,
    until,
  ])
}
