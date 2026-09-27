import type { BotContext, Screen } from '../../bot/machine.js'
import { queryOne, query } from '../pool.js'

/** Onde cada cliente parou no menu. Uma linha por contato. */

export interface Conversation {
  id: string
  tenantId: string
  contactId: string
  screen: Screen
  context: BotContext
  stateUpdatedAt: Date
  /** Enquanto estiver no futuro, o bot fica calado: tem humano atendendo. */
  handoffUntil: Date | null
}

interface ConversationRow {
  id: string
  tenant_id: string
  contact_id: string
  state: string
  context: BotContext
  state_updated_at: Date
  handoff_until: Date | null
}

const toConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  tenantId: row.tenant_id,
  contactId: row.contact_id,
  screen: row.state as Screen,
  context: row.context ?? {},
  stateUpdatedAt: row.state_updated_at,
  handoffUntil: row.handoff_until,
})

const COLUMNS = 'id, tenant_id, contact_id, state, context, state_updated_at, handoff_until'

export async function getConversation(tenantId: string, contactId: string): Promise<Conversation> {
  const row = await queryOne<ConversationRow>(
    `
    INSERT INTO conversations (tenant_id, contact_id)
    VALUES ($1, $2)
    ON CONFLICT (contact_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
    RETURNING ${COLUMNS}
    `,
    [tenantId, contactId],
  )
  if (!row) throw new Error('falha ao abrir a conversa')
  return toConversation(row)
}

export async function saveConversation(
  conversationId: string,
  screen: Screen,
  context: BotContext,
): Promise<void> {
  await query(
    `UPDATE conversations
     SET state = $2, context = $3, state_updated_at = now(), updated_at = now()
     WHERE id = $1`,
    [conversationId, screen, JSON.stringify(context)],
  )
}

/** Silencia o bot nesta conversa enquanto um humano atende. */
export async function startHandoff(conversationId: string, minutes: number): Promise<void> {
  await query(
    `UPDATE conversations
     SET handoff_until = now() + ($2 || ' minutes')::interval, updated_at = now()
     WHERE id = $1`,
    [conversationId, String(minutes)],
  )
}

export async function endHandoff(conversationId: string): Promise<void> {
  await query('UPDATE conversations SET handoff_until = NULL, updated_at = now() WHERE id = $1', [
    conversationId,
  ])
}

export function isInHandoff(conversation: Conversation, now: Date = new Date()): boolean {
  return conversation.handoffUntil !== null && conversation.handoffUntil > now
}
