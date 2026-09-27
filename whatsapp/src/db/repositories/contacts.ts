import { query, queryOne } from '../pool.js'

/**
 * Clientes e o estado da conversa de cada um.
 *
 * `last_inbound_at` é o campo mais importante daqui: é dele que sai a janela de
 * 24 horas. Fora dela a Meta só aceita template aprovado, e mandar texto livre
 * volta como erro 131047.
 */

export interface Contact {
  id: string
  tenantId: string
  waId: string
  name: string
  lastInboundAt: Date | null
  marketingOptIn: boolean
  optedOut: boolean
  birthday: Date | null
}

interface ContactRow {
  id: string
  tenant_id: string
  wa_id: string
  name: string
  last_inbound_at: Date | null
  marketing_opt_in: boolean
  opted_out: boolean
  birthday: Date | null
}

const toContact = (row: ContactRow): Contact => ({
  id: row.id,
  tenantId: row.tenant_id,
  waId: row.wa_id,
  name: row.name,
  lastInboundAt: row.last_inbound_at,
  marketingOptIn: row.marketing_opt_in,
  optedOut: row.opted_out,
  birthday: row.birthday,
})

const COLUMNS = 'id, tenant_id, wa_id, name, last_inbound_at, marketing_opt_in, opted_out, birthday'

/**
 * Acha o cliente ou cria na hora, e marca a janela de 24h.
 *
 * O nome só é atualizado quando vem preenchido: a Meta nem sempre manda o nome
 * do perfil, e sobrescrever com vazio apagaria o que já sabíamos.
 */
export async function upsertContact(
  tenantId: string,
  waId: string,
  name: string,
  inboundAt: Date,
): Promise<Contact> {
  const row = await queryOne<ContactRow>(
    `
    INSERT INTO contacts (tenant_id, wa_id, name, last_inbound_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, wa_id) DO UPDATE SET
      name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE contacts.name END,
      last_inbound_at = GREATEST(contacts.last_inbound_at, EXCLUDED.last_inbound_at)
    RETURNING ${COLUMNS}
    `,
    [tenantId, waId, name, inboundAt],
  )
  if (!row) throw new Error('falha ao gravar o contato')
  return toContact(row)
}

export async function findContact(tenantId: string, waId: string): Promise<Contact | null> {
  const row = await queryOne<ContactRow>(
    `SELECT ${COLUMNS} FROM contacts WHERE tenant_id = $1 AND wa_id = $2`,
    [tenantId, waId],
  )
  return row ? toContact(row) : null
}

export async function findContactById(contactId: string): Promise<Contact | null> {
  const row = await queryOne<ContactRow>(`SELECT ${COLUMNS} FROM contacts WHERE id = $1`, [contactId])
  return row ? toContact(row) : null
}

/** "SAIR": corta toda mensagem automática, sem exceção. Exigência de LGPD. */
export async function setOptedOut(contactId: string, optedOut: boolean): Promise<void> {
  await query(
    `UPDATE contacts
     SET opted_out = $2,
         opted_out_at = CASE WHEN $2 THEN now() ELSE NULL END,
         -- Sair também desfaz o opt-in de marketing: voltar exige pedir de novo.
         marketing_opt_in = CASE WHEN $2 THEN FALSE ELSE marketing_opt_in END
     WHERE id = $1`,
    [contactId, optedOut],
  )
}

/** Consentimento para mensagens de marketing (reativação, aniversário). */
export async function setMarketingOptIn(contactId: string, optIn: boolean): Promise<void> {
  await query(
    `UPDATE contacts
     SET marketing_opt_in = $2,
         marketing_opt_in_at = CASE WHEN $2 THEN now() ELSE NULL END,
         opted_out = CASE WHEN $2 THEN FALSE ELSE opted_out END
     WHERE id = $1`,
    [contactId, optIn],
  )
}

export async function setBirthday(contactId: string, birthday: Date | null): Promise<void> {
  await query('UPDATE contacts SET birthday = $2 WHERE id = $1', [contactId, birthday])
}

/**
 * A conversa está dentro da janela de 24 horas?
 *
 * Fora dela, só template. Esta checagem é o que evita gastar uma chamada à
 * Meta para receber 131047 de volta.
 */
export function isWithinServiceWindow(contact: Contact, now: Date = new Date()): boolean {
  if (!contact.lastInboundAt) return false
  return now.getTime() - contact.lastInboundAt.getTime() < 24 * 60 * 60 * 1000
}

/**
 * Aniversariantes do dia. Compara dia e mês, ignorando o ano — e o
 * `opted_out`/`marketing_opt_in` já filtra quem não quer receber.
 */
export async function contactsWithBirthday(
  tenantId: string,
  month: number,
  day: number,
): Promise<Contact[]> {
  const rows = await query<ContactRow>(
    `SELECT ${COLUMNS} FROM contacts
     WHERE tenant_id = $1
       AND birthday IS NOT NULL
       AND EXTRACT(MONTH FROM birthday) = $2
       AND EXTRACT(DAY FROM birthday) = $3
       AND NOT opted_out
       AND marketing_opt_in`,
    [tenantId, month, day],
  )
  return rows.map(toContact)
}
