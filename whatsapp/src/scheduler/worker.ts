import { randomUUID } from 'node:crypto'
import { findReservation } from '../db/repositories/reservations.js'
import { findContactById, isWithinServiceWindow } from '../db/repositories/contacts.js'
import { claimDue, markFailed, markSent, markSkipped, releaseStale, type OutboxItem } from '../db/repositories/outbox.js'
import { logOutbound } from '../db/repositories/messages.js'
import { findTenantById } from '../db/repositories/tenants.js'
import { env } from '../env.js'
import { errorMessage, log } from '../lib/logger.js'
import { getTenantContext } from '../tenants/registry.js'
import { isOutsideWindow, WhatsAppApiError } from '../whatsapp/errors.js'
import { KIND_LABELS } from './messages.js'
import { runDailyJobs } from './jobs.js'

/**
 * O worker: tira mensagens da fila e envia na hora marcada.
 *
 * Antes de cada envio ele confere de novo se aquela mensagem ainda faz sentido.
 * Isso importa porque entre programar o lembrete e enviá-lo passa um dia inteiro,
 * e no meio disso o cliente pode ter cancelado a reserva ou pedido para sair da
 * lista. Enviar assim mesmo seria pior que não enviar nada.
 */

const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`

/** Motivos para descartar uma mensagem já enfileirada. */
type SkipReason = string | null

async function shouldSkip(item: OutboxItem): Promise<SkipReason> {
  const contact = await findContactById(item.contactId)
  if (!contact) return 'contato não existe mais'

  // "SAIR" corta tudo, sem exceção. Exigência de LGPD e da política da Meta.
  if (contact.optedOut) return 'cliente pediu para sair da lista'

  // Marketing só com consentimento explícito.
  const isMarketing = item.kind === 'reativacao' || item.kind === 'aniversario'
  if (isMarketing && !contact.marketingOptIn) return 'sem opt-in de marketing'

  // A reserva foi cancelada (ou recusada) depois que o lembrete entrou na fila.
  if (item.reservationId) {
    const reservation = await findReservation(item.reservationId)
    if (!reservation) return 'reserva não existe mais'
    if (reservation.status === 'cancelled' || reservation.status === 'declined') return 'reserva cancelada'

    const isReminder = item.kind === 'lembrete24h' || item.kind === 'lembrete2h'
    if (isReminder && reservation.startsAt < new Date()) return 'o horário já passou'
  }

  // Texto livre fora da janela de 24h a Meta recusa — melhor não gastar a
  // chamada nem a tentativa.
  const isTemplate = item.payload.type === 'template'
  if (!isTemplate && !isWithinServiceWindow(contact)) {
    return 'fora da janela de 24h e a mensagem não é template'
  }

  return null
}

async function processItem(item: OutboxItem): Promise<void> {
  const skip = await shouldSkip(item)
  if (skip) {
    await markSkipped(item.id, skip)
    log.info('mensagem descartada antes do envio', { kind: KIND_LABELS[item.kind], motivo: skip })
    return
  }

  const tenant = await findTenantById(item.tenantId)
  if (!tenant) {
    await markSkipped(item.id, 'restaurante não existe mais')
    return
  }

  const ctx = await getTenantContext(tenant.phoneNumberId)
  if (!ctx) {
    await markFailed(item.id, 'restaurante sem credenciais válidas', false, env.worker.maxAttempts)
    return
  }

  try {
    const result = await ctx.client.send(item.payload)
    await markSent(item.id, result.messageId)
    await logOutbound(item.tenantId, item.contactId, result.messageId, String(item.payload.type ?? ''), item.payload)

    log.info('mensagem programada enviada', {
      tenant: tenant.slug,
      kind: KIND_LABELS[item.kind],
      messageId: result.messageId,
    })
  } catch (error) {
    // 131047 = passou das 24h e a mensagem não era template. Não é falha de
    // envio, é a mensagem errada para o momento — e insistir nunca resolve.
    if (isOutsideWindow(error)) {
      await markSkipped(item.id, 'fora da janela de 24h (a Meta exige template)')
      log.warn('mensagem descartada: precisaria ser template', {
        tenant: tenant.slug,
        kind: KIND_LABELS[item.kind],
      })
      return
    }

    const retryable = error instanceof WhatsAppApiError ? error.retryable : true
    await markFailed(item.id, errorMessage(error), retryable, env.worker.maxAttempts)

    log.warn('falha ao enviar mensagem programada', {
      tenant: tenant.slug,
      kind: KIND_LABELS[item.kind],
      retryable,
      reason: errorMessage(error),
    })
  }
}

/** Uma rodada. Exportada para o `npm run outbox:run` disparar na mão. */
export async function runOnce(now: Date = new Date()): Promise<number> {
  const batch = await claimDue(env.worker.batchSize, WORKER_ID, now)
  if (batch.length === 0) return 0

  // Em série, de propósito: a Meta limita a taxa de envio por número, e uma
  // rajada de 20 chamadas paralelas volta como 130429.
  for (const item of batch) await processItem(item)
  return batch.length
}

let timer: NodeJS.Timeout | null = null
let lastDailyRun = ''

export async function startWorker(): Promise<void> {
  if (!env.worker.enabled) {
    log.warn('worker desligado (WORKER_ENABLED=false) — nenhum lembrete será enviado')
    return
  }

  // Mensagens que ficaram presas em "sending" porque o processo caiu no meio.
  const released = await releaseStale()
  if (released > 0) log.info('mensagens travadas devolvidas para a fila', { released })

  const tick = async (): Promise<void> => {
    try {
      const sent = await runOnce()
      if (sent > 0) log.debug('rodada do worker', { processadas: sent })

      // Os jobs diários (pós-atendimento, reativação, aniversário, limpeza)
      // rodam uma vez por dia, no horário configurado.
      const today = new Date().toISOString().slice(0, 10)
      if (today !== lastDailyRun && isDailyJobTime()) {
        lastDailyRun = today
        await runDailyJobs()
      }
    } catch (error) {
      log.error('erro na rodada do worker', { reason: errorMessage(error) })
    }
  }

  timer = setInterval(() => void tick(), env.worker.intervalMs)
  log.info('worker no ar', { intervalo: `${env.worker.intervalMs / 1000}s`, id: WORKER_ID })
  void tick()
}

export function stopWorker(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function isDailyJobTime(now: Date = new Date()): boolean {
  const [hour = '9', minute = '0'] = env.worker.dailyJobsAt.split(':')
  const target = Number(hour) * 60 + Number(minute)
  const current = now.getHours() * 60 + now.getMinutes()
  // Janela de tolerância: o worker acorda a cada 30s, mas o processo pode ter
  // sido reiniciado justo no minuto do job.
  return current >= target && current < target + 15
}
