import { env } from '../env.js'

/**
 * Log em uma linha por evento, em JSON quando em produção (para a hospedagem
 * indexar) e legível no terminal durante o desenvolvimento.
 *
 * Nada de segredo entra aqui: tokens e o corpo de mensagens de cliente ficam
 * de fora de propósito.
 */

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const
type Level = keyof typeof LEVELS

const threshold = LEVELS[(env.logLevel as Level) in LEVELS ? (env.logLevel as Level) : 'info']

function emit(level: Level, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return

  if (env.isProduction) {
    console.log(JSON.stringify({ level, time: new Date().toISOString(), message, ...data }))
    return
  }

  const extra = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ''
  const line = `[${level}] ${message}${extra}`
  if (level === 'error' || level === 'fatal') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  trace: (message: string, data?: Record<string, unknown>) => emit('trace', message, data),
  debug: (message: string, data?: Record<string, unknown>) => emit('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => emit('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => emit('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => emit('error', message, data),
  fatal: (message: string, data?: Record<string, unknown>) => emit('fatal', message, data),
}

/** Mensagem de erro sem estourar quando o que chega não é um Error. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}
