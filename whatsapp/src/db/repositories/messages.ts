import { query, queryOne } from '../pool.js'

/**
 * Registro das mensagens.
 *
 * Serve para duas coisas: não atender a mesma mensagem duas vezes (a Meta
 * reenvia o webhook quando não recebe 200 rápido) e ter histórico para
 * conferir o que foi dito quando um cliente reclama.
 */

/**
 * Grava a mensagem recebida e diz se ela é nova.
 *
 * O UNIQUE em `wa_message_id` faz o trabalho: se já existia, o INSERT não
 * acontece, `false` volta, e o handler descarta o reenvio.
 */
export async function registerInbound(
  tenantId: string,
  contactId: string,
  waMessageId: string,
  type: string,
  body: unknown,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `
    INSERT INTO message_log (tenant_id, contact_id, direction, wa_message_id, type, body)
    VALUES ($1, $2, 'in', $3, $4, $5)
    ON CONFLICT (wa_message_id) DO NOTHING
    RETURNING id
    `,
    [tenantId, contactId, waMessageId, type, JSON.stringify(body)],
  )
  return row !== null
}

export async function logOutbound(
  tenantId: string,
  contactId: string,
  waMessageId: string,
  type: string,
  body: unknown,
): Promise<void> {
  await query(
    `INSERT INTO message_log (tenant_id, contact_id, direction, wa_message_id, type, body, status)
     VALUES ($1, $2, 'out', $3, $4, $5, 'sent')
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [tenantId, contactId, waMessageId || null, type, JSON.stringify(body)],
  )
}

/** Atualiza com o status que a Meta devolve depois (entregue, lido, falhou). */
export async function updateDeliveryStatus(
  waMessageId: string,
  status: string,
  errorCode: number | null,
): Promise<void> {
  await query('UPDATE message_log SET status = $2, error_code = $3 WHERE wa_message_id = $1', [
    waMessageId,
    status,
    errorCode,
  ])
}

/**
 * LGPD: apaga o conteúdo das mensagens antigas, preservando a linha para
 * estatística. Guardar conversa de cliente para sempre não tem justificativa.
 */
export async function purgeOldMessageBodies(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const rows = await query<{ id: string }>(
    `UPDATE message_log SET body = NULL
     WHERE body IS NOT NULL AND created_at < now() - ($1 || ' days')::interval
     RETURNING id`,
    [String(retentionDays)],
  )
  return rows.length
}

/** Freio contra enxurrada de mensagens de um mesmo número. */
export async function countRecentInbound(contactId: string, seconds = 60): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM message_log
     WHERE contact_id = $1 AND direction = 'in' AND created_at > now() - ($2 || ' seconds')::interval`,
    [contactId, String(seconds)],
  )
  return Number(row?.count ?? 0)
}
