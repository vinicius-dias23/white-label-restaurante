import {
  findTenantByPhoneNumberId,
  getAccessToken,
  listBarbers,
  listServices,
} from '../db/repositories/tenants.js'
import { log } from '../lib/logger.js'
import { WhatsAppClient, type WhatsAppSender } from '../whatsapp/client.js'
import type { Barber, ServiceRecord, Tenant } from './types.js'

/**
 * Cache das barbearias em memória.
 *
 * Toda mensagem que chega precisa saber de qual barbearia é, quais serviços
 * existem e qual token usar. Buscar isso no banco a cada mensagem seria três
 * consultas por toque de botão. O cache vale por pouco tempo — mudou o config e
 * rodou `tenant:sync`, o menu novo aparece em no máximo um minuto.
 */

export interface TenantContext {
  tenant: Tenant
  barbers: Barber[]
  services: ServiceRecord[]
  client: WhatsAppSender
}

const TTL_MS = 60_000

interface CacheEntry {
  context: TenantContext
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/** Substitui o cliente real por um falso nos testes. */
let clientFactory = (phoneNumberId: string, token: string): WhatsAppSender =>
  new WhatsAppClient(phoneNumberId, token)

export function setClientFactory(factory: typeof clientFactory): void {
  clientFactory = factory
}

export async function getTenantContext(phoneNumberId: string): Promise<TenantContext | null> {
  const cached = cache.get(phoneNumberId)
  if (cached && cached.expiresAt > Date.now()) return cached.context

  const tenant = await findTenantByPhoneNumberId(phoneNumberId)
  if (!tenant) {
    // Acontece quando alguém aponta outro número para este webhook, ou quando o
    // tenant:sync ainda não rodou depois de trocar o número na Meta.
    log.warn('mensagem para um número que não é de nenhuma barbearia cadastrada', { phoneNumberId })
    return null
  }

  const [barbers, services, token] = await Promise.all([
    listBarbers(tenant.id),
    listServices(tenant.id),
    getAccessToken(tenant.id),
  ])

  const context: TenantContext = {
    tenant,
    barbers,
    services,
    client: clientFactory(tenant.phoneNumberId, token),
  }

  cache.set(phoneNumberId, { context, expiresAt: Date.now() + TTL_MS })
  return context
}

/** Chamado depois do `tenant:sync` para o menu novo valer na hora. */
export function invalidateTenantCache(phoneNumberId?: string): void {
  if (phoneNumberId) cache.delete(phoneNumberId)
  else cache.clear()
}
