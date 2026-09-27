import type { SiteConfig } from '@barbearia/shared/config'

/** Uma barbearia atendida por este servidor. */
export interface Tenant {
  id: string
  slug: string
  displayName: string
  /** Chave de roteamento: é o que vem no webhook da Meta. */
  phoneNumberId: string
  wabaId: string
  ownerPhone: string
  timezone: string
  /** `barbearia.config.json` já normalizado — o mesmo que o site usa. */
  config: SiteConfig
  active: boolean
  /** Enquanto estiver no futuro, o bot não responde a ninguém desta barbearia. */
  botPausedUntil: Date | null
}

export interface Barber {
  id: string
  slug: string
  name: string
  /**
   * WhatsApp do barbeiro, normalizado (só dígitos, com DDI). Vazio = ele não
   * tem painel no bot. Vem do `team[].phone` do config pelo `tenant:sync`.
   */
  phone: string
  active: boolean
  sortOrder: number
}

export interface ServiceRecord {
  id: string
  slug: string
  name: string
  priceLabel: string
  durationMin: number
  active: boolean
  sortOrder: number
}
