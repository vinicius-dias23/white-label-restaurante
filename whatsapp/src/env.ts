import { config as loadDotenv } from 'dotenv'
import { ENV_FILE } from './lib/paths.js'

/**
 * Leitura e validação do `.env`.
 *
 * Tudo é conferido no boot: faltou variável obrigatória, o processo morre aqui
 * dizendo exatamente qual. O contrário — descobrir que `META_APP_SECRET` está
 * vazio na primeira mensagem de cliente — é o pior momento possível.
 *
 * O `whatsapp/.env.example` explica cada uma delas.
 */

loadDotenv({ path: ENV_FILE })

const problems: string[] = []

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    problems.push(`${name} está vazia ou ausente`)
    return ''
  }
  return value
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback
}

function integer(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n > max) {
    problems.push(`${name}="${raw}" deveria ser um número entre ${min} e ${max}`)
    return fallback
  }
  return Math.round(n)
}

/** Aceita true/false, 1/0, sim/não — o dono do restaurante não é programador. */
function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (['true', '1', 'yes', 'sim', 'on'].includes(raw)) return true
  if (['false', '0', 'no', 'nao', 'não', 'off'].includes(raw)) return false
  problems.push(`${name}="${raw}" deveria ser true ou false`)
  return fallback
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function time(name: string, fallback: string): string {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  if (!TIME_RE.test(raw)) {
    problems.push(`${name}="${raw}" deveria estar no formato HH:MM`)
    return fallback
  }
  return raw
}

/** A chave de criptografia precisa ter exatamente 32 bytes depois do base64. */
function encryptionKey(name: string): Buffer {
  const raw = process.env[name]?.trim()
  if (!raw) {
    problems.push(`${name} está vazia — gere uma com: openssl rand -base64 32`)
    return Buffer.alloc(32)
  }
  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    problems.push(`${name} não é base64 válido — gere uma com: openssl rand -base64 32`)
    return Buffer.alloc(32)
  }
  if (key.length !== 32) {
    problems.push(`${name} tem ${key.length} bytes, precisa de 32 — gere com: openssl rand -base64 32`)
    return Buffer.alloc(32)
  }
  return key
}

const nodeEnv = optional('NODE_ENV', 'development')
const isProduction = nodeEnv === 'production'
const isTest = nodeEnv === 'test' || process.env.VITEST === 'true'

export const env = {
  nodeEnv,
  isProduction,
  isTest,

  port: integer('PORT', 3333, 1, 65535),
  publicUrl: optional('PUBLIC_URL'),
  logLevel: optional('LOG_LEVEL', 'info'),

  databaseUrl: isTest ? optional('DATABASE_URL_TEST') : required('DATABASE_URL'),
  databaseSsl: boolean('DATABASE_SSL', false),
  databasePoolMax: integer('DATABASE_POOL_MAX', 10, 1, 100),

  meta: {
    appId: isTest ? optional('META_APP_ID', 'test') : required('META_APP_ID'),
    appSecret: isTest ? optional('META_APP_SECRET', 'test-secret') : required('META_APP_SECRET'),
    verifyToken: isTest ? optional('META_VERIFY_TOKEN', 'test-verify') : required('META_VERIFY_TOKEN'),
    graphVersion: optional('META_GRAPH_VERSION', 'v21.0'),
    apiBaseUrl: optional('META_API_BASE_URL', 'https://graph.facebook.com'),
    timeoutMs: integer('META_TIMEOUT_MS', 15_000, 1000, 120_000),
  },

  encryptionKey: isTest ? Buffer.alloc(32, 7) : encryptionKey('APP_ENCRYPTION_KEY'),
  adminApiToken: isTest ? optional('ADMIN_API_TOKEN', 'test-admin') : required('ADMIN_API_TOKEN'),

  defaultTimezone: optional('DEFAULT_TIMEZONE', 'America/Sao_Paulo'),
  defaultLocale: optional('DEFAULT_LOCALE', 'pt_BR'),
  defaultCountryCode: optional('DEFAULT_COUNTRY_CODE', '55'),

  worker: {
    enabled: boolean('WORKER_ENABLED', true),
    inProcess: boolean('WORKER_IN_PROCESS', true),
    intervalMs: integer('WORKER_INTERVAL_MS', 30_000, 1000, 600_000),
    batchSize: integer('WORKER_BATCH_SIZE', 20, 1, 500),
    maxAttempts: integer('OUTBOX_MAX_ATTEMPTS', 5, 1, 20),
    dailyJobsAt: time('DAILY_JOBS_AT', '09:00'),
  },

  /**
   * Trava geral das mensagens programadas. Cada restaurante ainda precisa ligar a
   * dela em `whatsapp.messages` — só sai o que estiver ligado nos dois lugares.
   */
  features: {
    lembrete24h: boolean('FEATURE_LEMBRETE_24H', true),
    lembrete2h: boolean('FEATURE_LEMBRETE_2H', true),
    posAtendimento: boolean('FEATURE_POS_ATENDIMENTO', false),
    reativacao: boolean('FEATURE_REATIVACAO', false),
    aniversario: boolean('FEATURE_ANIVERSARIO', false),
  },

  templates: {
    lembrete24h: optional('TEMPLATE_LEMBRETE_24H', 'lembrete_24h'),
    lembrete2h: optional('TEMPLATE_LEMBRETE_2H', 'lembrete_2h'),
    posAtendimento: optional('TEMPLATE_POS_ATENDIMENTO', 'pos_atendimento'),
    reativacao: optional('TEMPLATE_REATIVACAO', 'reativacao_cliente'),
    aniversario: optional('TEMPLATE_ANIVERSARIO', 'aniversario_cliente'),
  },

  conversation: {
    handoffMinutes: integer('HANDOFF_MINUTES', 30, 0, 1440),
    sessionTimeoutMin: integer('SESSION_TIMEOUT_MIN', 20, 1, 1440),
    quietHoursStart: time('QUIET_HOURS_START', '21:00'),
    quietHoursEnd: time('QUIET_HOURS_END', '08:00'),
    rateLimitPerMin: integer('RATE_LIMIT_PER_CONTACT_PER_MIN', 40, 1, 600),
    messageRetentionDays: integer('MESSAGE_RETENTION_DAYS', 180, 0, 3650),
  },

  /** Primeiro restaurante, cadastrado direto pelo .env. Opcional. */
  bootstrapTenant: {
    slug: optional('TENANT_SLUG'),
    phoneNumberId: optional('TENANT_PHONE_NUMBER_ID'),
    wabaId: optional('TENANT_WABA_ID'),
    accessToken: optional('TENANT_ACCESS_TOKEN'),
    ownerPhone: optional('TENANT_OWNER_PHONE'),
    timezone: optional('TENANT_TIMEZONE'),
  },
} as const

/**
 * Chamado pelos entrypoints (API, worker, CLIs). Junta TODOS os problemas numa
 * mensagem só — corrigir o `.env` de uma vez é melhor que descobrir um por vez.
 */
export function assertEnv(): void {
  if (env.isProduction && !env.publicUrl) {
    problems.push('PUBLIC_URL está vazia — a Meta precisa de uma URL HTTPS para o webhook')
  }
  if (problems.length === 0) return

  console.error('\n✖ Configuração inválida no .env:\n')
  for (const problem of problems) console.error(`  · ${problem}`)
  console.error('\n  O whatsapp/.env.example explica cada variável.')
  console.error('  Comece com:  cp whatsapp/.env.example whatsapp/.env\n')
  process.exit(1)
}

export type Env = typeof env
