/**
 * Quanto tempo dura um serviço, em minutos.
 *
 * No config do site a duração é texto livre — "40 min", "1h 10", "1 hora e
 * meia" — porque é o que aparece bonito no card. A agenda precisa de número.
 * Este parser cobre os formatos que barbearia realmente escreve; o que ele não
 * entender cai no `durationMin` explícito do serviço ou no padrão do config, e
 * o `tenant:sync` avisa quais serviços caíram no padrão.
 */

const HOUR_AND_MINUTE = /(\d+)\s*h(?:oras?)?\s*(?:e\s*)?(\d+)?\s*(?:min(?:utos?)?)?/i
const MINUTES_ONLY = /(\d+)\s*(?:min(?:utos?)?|')/i
const HALF_HOUR = /(\d+)\s*h(?:oras?)?\s*e\s*meia/i
const BARE_NUMBER = /^\s*(\d+)\s*$/

export function parseDuration(text: string): number | null {
  if (!text) return null
  const clean = text.trim().toLowerCase()

  // "1h e meia", "1 hora e meia"
  const half = HALF_HOUR.exec(clean)
  if (half?.[1]) return Number(half[1]) * 60 + 30

  // "1h 10", "2h", "1 hora 30 min"
  const withHours = HOUR_AND_MINUTE.exec(clean)
  if (withHours?.[1]) {
    const hours = Number(withHours[1])
    const minutes = withHours[2] ? Number(withHours[2]) : 0
    const total = hours * 60 + minutes
    return total > 0 ? total : null
  }

  // "40 min", "30min", "45'"
  const onlyMinutes = MINUTES_ONLY.exec(clean)
  if (onlyMinutes?.[1]) {
    const minutes = Number(onlyMinutes[1])
    return minutes > 0 ? minutes : null
  }

  // "45" sozinho: quase sempre são minutos.
  const bare = BARE_NUMBER.exec(clean)
  if (bare?.[1]) {
    const minutes = Number(bare[1])
    return minutes > 0 && minutes <= 480 ? minutes : null
  }

  return null
}

export interface ResolvedDuration {
  minutes: number
  /** `true` quando a duração veio do padrão porque não deu para deduzir. */
  fallback: boolean
}

/**
 * Ordem de preferência: `durationMin` explícito → texto de `duration` →
 * padrão do config. Explícito ganha sempre, para o dono ter como mandar no
 * número quando o texto do card é criativo demais.
 */
export function resolveDuration(
  service: { duration: string; durationMin: number },
  defaultMinutes: number,
): ResolvedDuration {
  if (service.durationMin > 0) return { minutes: service.durationMin, fallback: false }

  const parsed = parseDuration(service.duration)
  if (parsed !== null) return { minutes: parsed, fallback: false }

  return { minutes: defaultMinutes, fallback: true }
}

/** "1h 10" a partir dos minutos — para mostrar de volta ao cliente. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}`
}
