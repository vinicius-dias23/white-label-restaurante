import type { SiteConfig } from '@restaurante/shared/config'

/** Um restaurante atendido por este servidor. */
export interface Tenant {
  id: string
  slug: string
  displayName: string
  /** Chave de roteamento: é o que vem no webhook da Meta. */
  phoneNumberId: string
  wabaId: string
  ownerPhone: string
  timezone: string
  /** `restaurante.config.json` já normalizado — o mesmo que o site usa. */
  config: SiteConfig
  active: boolean
  /** Enquanto estiver no futuro, o bot não responde a ninguém deste restaurante. */
  botPausedUntil: Date | null
}

/** Um ambiente do restaurante, espelhado do `areas[]` do config. */
export interface AreaRecord {
  id: string
  slug: string
  name: string
  /** Pessoas ao mesmo tempo. */
  capacity: number
  active: boolean
  sortOrder: number
}

/** Alguém da equipe, espelhado do `team[]` do config. */
export interface StaffMember {
  id: string
  slug: string
  name: string
  /**
   * WhatsApp do colaborador, normalizado (só dígitos, com DDI). Vazio = ele não
   * tem painel no bot. Vem do `team[].phone` do config pelo `tenant:sync`.
   */
  phone: string
  active: boolean
  sortOrder: number
}
