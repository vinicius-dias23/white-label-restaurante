import type { OutgoingMessage } from '../../whatsapp/payloads.js'
import { query, queryOne, transaction } from '../pool.js'

/**
 * Fila de saída.
 *
 * TUDO que o servidor envia por iniciativa própria passa por aqui — lembretes,
 * mensagens de marketing, avisos ao dono. Guardar antes de enviar resolve três problemas de
 * uma vez:
 *
 *   · reinício do processo não perde mensagem;
 *   · `dedupe_key` único garante que ninguém receba o mesmo lembrete duas vezes,
 *     mesmo se o job rodar de novo;
 *   · a mensagem pode ser descartada até o último instante — se o cliente
 *     cancelar o corte, o lembrete some da fila em vez de chegar sem sentido.
 */

export type OutboxKind =
  | 'lembrete24h'
  | 'lembrete2h'
  | 'posAtendimento'
  | 'reativacao'
  | 'aniversario'
  | 'avisoDono'

export interface OutboxItem {
  id: string
  tenantId: string
  contactId: string
  appointmentId: string | null
  kind: OutboxKind
  payload: OutgoingMessage
  scheduledFor: Date
  attempts: number
}

interface OutboxRow {
  id: string
  tenant_id: string
  contact_id: string
  appointment_id: string | null
  kind: OutboxKind
  payload: OutgoingMessage
  scheduled_for: Date
  attempts: number
}

const toItem = (row: OutboxRow): OutboxItem => ({
  id: row.id,
  tenantId: row.tenant_id,
  contactId: row.contact_id,
  appointmentId: row.appointment_id,
  kind: row.kind,
  payload: row.payload,
  scheduledFor: row.scheduled_for,
  attempts: row.attempts,
})

export interface EnqueueInput {
  tenantId: string
  contactId: string
  appointmentId?: string | null
  kind: OutboxKind
  payload: OutgoingMessage
  scheduledFor: Date
  /** Identidade da mensagem: "<agendamento>:<tipo>". Repetido = ignorado. */
  dedupeKey: string
}

/** Enfileira. Chave repetida não gera erro nem duplicata — só não faz nada. */
export async function enqueue(input: EnqueueInput): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `
    INSERT INTO outbox (tenant_id, contact_id, appointment_id, kind, payload, scheduled_for, dedupe_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
    `,
    [
      input.tenantId,
      input.contactId,
      input.appointmentId ?? null,
      input.kind,
      JSON.stringify(input.payload),
      input.scheduledFor,
      input.dedupeKey,
    ],
  )
  return row !== null
}

/**
 * Pega o próximo lote para enviar.
 *
 * `FOR UPDATE SKIP LOCKED` é o que permite rodar mais de uma instância do worker
 * sem as duas brigarem pela mesma mensagem: quem chegou primeiro trava a linha,
 * a outra simplesmente pula.
 */
export async function claimDue(limit: number, workerId: string, now: Date = new Date()): Promise<OutboxItem[]> {
  return transaction(async (client) => {
    const { rows } = await client.query<OutboxRow>(
      `
      WITH due AS (
        SELECT id FROM outbox
        WHERE status = 'pending' AND scheduled_for <= $1
        ORDER BY scheduled_for
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox o
      SET status = 'sending', locked_at = now(), locked_by = $3, attempts = o.attempts + 1
      FROM due
      WHERE o.id = due.id
      RETURNING o.id, o.tenant_id, o.contact_id, o.appointment_id, o.kind,
                o.payload, o.scheduled_for, o.attempts
      `,
      [now, limit, workerId],
    )
    return rows.map(toItem)
  })
}

export async function markSent(id: string, waMessageId: string): Promise<void> {
  await query(
    `UPDATE outbox SET status = 'sent', wa_message_id = $2, sent_at = now(), locked_at = NULL WHERE id = $1`,
    [id, waMessageId],
  )
}

/**
 * Erro no envio. Volta para a fila com espera crescente (1, 2, 4, 8 minutos)
 * quando vale a pena tentar de novo; vira `failed` quando não vale — insistir
 * num template reprovado só atrasa o resto da fila.
 */
export async function markFailed(
  id: string,
  error: string,
  retryable: boolean,
  maxAttempts: number,
): Promise<void> {
  await query(
    `
    UPDATE outbox
    SET status = CASE WHEN $3 AND attempts < $4 THEN 'pending' ELSE 'failed' END,
        scheduled_for = CASE
          WHEN $3 AND attempts < $4
          THEN now() + (POWER(2, LEAST(attempts, 6)) || ' minutes')::interval
          ELSE scheduled_for
        END,
        last_error = $2,
        locked_at = NULL
    WHERE id = $1
    `,
    [id, error.slice(0, 500), retryable, maxAttempts],
  )
}

/** Não enviada de propósito: cliente saiu da lista, agendamento cancelado, etc. */
export async function markSkipped(id: string, reason: string): Promise<void> {
  await query(`UPDATE outbox SET status = 'skipped', last_error = $2, locked_at = NULL WHERE id = $1`, [
    id,
    reason.slice(0, 500),
  ])
}

/**
 * Cancelou o corte: os lembretes que ainda não saíram somem da fila.
 * Sem isto o cliente receberia "seu horário é amanhã às 14h" depois de cancelar.
 */
export async function cancelPendingForAppointment(appointmentId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE outbox SET status = 'skipped', last_error = 'agendamento cancelado'
     WHERE appointment_id = $1 AND status = 'pending'
     RETURNING id`,
    [appointmentId],
  )
  return rows.length
}

/**
 * Devolve para a fila o que ficou preso em "sending" (o processo morreu no meio
 * do envio). Roda no start do worker.
 */
export async function releaseStale(olderThanMinutes = 10): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE outbox SET status = 'pending', locked_at = NULL, locked_by = NULL
     WHERE status = 'sending' AND locked_at < now() - ($1 || ' minutes')::interval
     RETURNING id`,
    [String(olderThanMinutes)],
  )
  return rows.length
}

export async function outboxStats(tenantId: string): Promise<Record<string, number>> {
  const rows = await query<{ status: string; count: string }>(
    'SELECT status, COUNT(*) AS count FROM outbox WHERE tenant_id = $1 GROUP BY status',
    [tenantId],
  )
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]))
}
