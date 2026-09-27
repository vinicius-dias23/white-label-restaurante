import type { BusyInterval, Occupancy } from '../../booking/slots.js'
import { fits } from '../../booking/slots.js'
import { query, queryOne, transaction } from '../pool.js'

/**
 * As reservas.
 *
 * O ponto central aqui é `createReservation`. Na barbearia bastava uma
 * constraint EXCLUDE (um barbeiro, um cliente por vez); no restaurante o
 * ambiente recebe VÁRIOS grupos ao mesmo tempo até encher, e isso nenhuma
 * constraint declarativa expressa. Então a reserva trava a linha do ambiente
 * (`SELECT ... FOR UPDATE`) e só depois soma quem já está lá: duas pessoas
 * disputando o último lugar do sábado entram em fila, e a segunda vê o salão
 * já com a primeira dentro. Sem janela de corrida entre a conta e o INSERT.
 */

export type ReservationStatus =
  | 'pending'
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'declined'

/** Os status que seguram lugar no ambiente. `pending` segura: o dono pode aprovar. */
export const LIVE_STATUSES: readonly ReservationStatus[] = ['pending', 'scheduled', 'confirmed', 'arrived']
const LIVE = `('pending', 'scheduled', 'confirmed', 'arrived')`

export interface Reservation {
  id: string
  tenantId: string
  contactId: string
  areaId: string
  partySize: number
  startsAt: Date
  endsAt: Date
  status: ReservationStatus
}

export interface ReservationDetail extends Reservation {
  areaName: string
  contactWaId: string
  contactName: string
}

interface ReservationRow {
  id: string
  tenant_id: string
  contact_id: string
  area_id: string
  party_size: number
  starts_at: Date
  ends_at: Date
  status: ReservationStatus
}

interface DetailRow extends ReservationRow {
  area_name: string
  contact_wa_id: string
  contact_name: string
}

const COLUMNS = 'id, tenant_id, contact_id, area_id, party_size, starts_at, ends_at, status'

const toReservation = (row: ReservationRow): Reservation => ({
  id: row.id,
  tenantId: row.tenant_id,
  contactId: row.contact_id,
  areaId: row.area_id,
  partySize: row.party_size,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
})

const toDetail = (row: DetailRow): ReservationDetail => ({
  ...toReservation(row),
  areaName: row.area_name,
  contactWaId: row.contact_wa_id,
  contactName: row.contact_name,
})

const DETAIL_SELECT = `
  SELECT r.id, r.tenant_id, r.contact_id, r.area_id, r.party_size,
         r.starts_at, r.ends_at, r.status,
         a.name AS area_name,
         c.wa_id AS contact_wa_id, c.name AS contact_name
  FROM reservations r
  JOIN areas    a ON a.id = r.area_id
  JOIN contacts c ON c.id = r.contact_id
`

export interface AreaOccupancy {
  reservations: Occupancy[]
  blocks: BusyInterval[]
}

/**
 * Tudo que tira lugar de um ambiente num intervalo: as reservas vivas (com o
 * tamanho de cada grupo) e os bloqueios. Bloqueio sem ambiente fecha o
 * restaurante inteiro.
 */
export async function areaOccupancy(
  tenantId: string,
  areaId: string,
  from: Date,
  to: Date,
): Promise<AreaOccupancy> {
  const [reservations, blocks] = await Promise.all([
    query<{ starts_at: Date; ends_at: Date; party_size: number }>(
      `SELECT starts_at, ends_at, party_size FROM reservations
        WHERE tenant_id = $1 AND area_id = $2 AND status IN ${LIVE}
          AND starts_at < $4 AND ends_at > $3`,
      [tenantId, areaId, from, to],
    ),
    query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at FROM time_blocks
        WHERE tenant_id = $1 AND (area_id = $2 OR area_id IS NULL)
          AND starts_at < $4 AND ends_at > $3`,
      [tenantId, areaId, from, to],
    ),
  ])
  return {
    reservations: reservations.map((row) => ({
      start: row.starts_at,
      end: row.ends_at,
      partySize: row.party_size,
    })),
    blocks: blocks.map((row) => ({ start: row.starts_at, end: row.ends_at })),
  }
}

export interface CreateReservationInput {
  tenantId: string
  contactId: string
  areaId: string
  partySize: number
  startsAt: Date
  endsAt: Date
  /** `pending` quando o grupo passa do limite de aprovação automática. */
  status: 'pending' | 'scheduled'
}

/**
 * Reserva a mesa. Devolve `null` quando o ambiente encheu entre a hora em que
 * o cliente viu a lista e a hora em que ele confirmou — caso comum, não é erro.
 */
export async function createReservation(input: CreateReservationInput): Promise<Reservation | null> {
  return transaction(async (client) => {
    // A trava. Enquanto esta transação não terminar, nenhuma outra reserva
    // deste ambiente passa daqui — e as de outros ambientes seguem livres.
    const area = await client.query<{ capacity: number }>(
      'SELECT capacity FROM areas WHERE id = $1 AND tenant_id = $2 AND active FOR UPDATE',
      [input.areaId, input.tenantId],
    )
    const capacity = area.rows[0]?.capacity
    if (capacity === undefined) return null

    const taken = await client.query<{ starts_at: Date; ends_at: Date; party_size: number }>(
      `SELECT starts_at, ends_at, party_size FROM reservations
        WHERE area_id = $1 AND status IN ${LIVE}
          AND starts_at < $3 AND ends_at > $2`,
      [input.areaId, input.startsAt, input.endsAt],
    )
    const occupancy = taken.rows.map((row) => ({
      start: row.starts_at,
      end: row.ends_at,
      partySize: row.party_size,
    }))
    if (!fits(occupancy, input.startsAt.getTime(), input.endsAt.getTime(), input.partySize, capacity)) {
      return null
    }

    const blocked = await client.query(
      `SELECT 1 FROM time_blocks
        WHERE tenant_id = $1 AND (area_id = $2 OR area_id IS NULL)
          AND starts_at < $4 AND ends_at > $3
        LIMIT 1`,
      [input.tenantId, input.areaId, input.startsAt, input.endsAt],
    )
    if (blocked.rows.length > 0) return null

    const inserted = await client.query<ReservationRow>(
      `INSERT INTO reservations (tenant_id, contact_id, area_id, party_size, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.tenantId,
        input.contactId,
        input.areaId,
        input.partySize,
        input.startsAt,
        input.endsAt,
        input.status,
      ],
    )
    const row = inserted.rows[0]
    return row ? toReservation(row) : null
  })
}

/** Reservas futuras do cliente, para a tela "Minhas reservas". Inclui as pendentes. */
export async function listUpcomingByContact(contactId: string, now: Date = new Date()): Promise<ReservationDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE r.contact_id = $1 AND r.status IN ${LIVE} AND r.starts_at > $2
     ORDER BY r.starts_at`,
    [contactId, now],
  )
  return rows.map(toDetail)
}

export async function countUpcomingByContact(contactId: string, now: Date = new Date()): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM reservations
     WHERE contact_id = $1 AND status IN ${LIVE} AND starts_at > $2`,
    [contactId, now],
  )
  return row?.count ?? 0
}

export async function findReservation(reservationId: string): Promise<ReservationDetail | null> {
  const row = await queryOne<DetailRow>(`${DETAIL_SELECT} WHERE r.id = $1`, [reservationId])
  return row ? toDetail(row) : null
}

/**
 * Cancela e devolve a reserva cancelada.
 *
 * O `WHERE status IN (...)` deixa a operação idempotente: cancelar duas vezes
 * (o cliente tocou duas vezes no botão) não gera dois avisos ao dono.
 */
export async function cancelReservation(reservationId: string, reason: string): Promise<ReservationDetail | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE reservations
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
     WHERE id = $1 AND status IN ('pending', 'scheduled', 'confirmed')
     RETURNING id`,
    [reservationId, reason],
  )
  return row ? findReservation(row.id) : null
}

/** Cliente respondeu "Confirmo" no lembrete de 24h. */
export async function confirmAttendance(reservationId: string): Promise<void> {
  await query(`UPDATE reservations SET status = 'confirmed' WHERE id = $1 AND status = 'scheduled'`, [
    reservationId,
  ])
}

/**
 * O dono aprovou o pedido de um grupo grande. Só sai de `pending`: aprovar uma
 * reserva que o cliente já cancelou, ou que já foi recusada, não ressuscita
 * nada — e devolve `null`, que é o que avisa o dono.
 *
 * Filtra por `tenant_id` também: o id vem de um botão, e um botão é texto que
 * qualquer um pode mandar.
 */
export async function approveReservation(tenantId: string, reservationId: string): Promise<ReservationDetail | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE reservations SET status = 'scheduled'
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING id`,
    [reservationId, tenantId],
  )
  return row ? findReservation(row.id) : null
}

/** O dono recusou o pedido. Os lugares voltam para a lotação na hora. */
export async function declineReservation(tenantId: string, reservationId: string): Promise<ReservationDetail | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE reservations
     SET status = 'declined', cancelled_at = now(), cancel_reason = 'recusada pelo dono'
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING id`,
    [reservationId, tenantId],
  )
  return row ? findReservation(row.id) : null
}

/** Pedidos esperando o dono, do mais próximo ao mais distante. */
export async function listPending(tenantId: string, now: Date = new Date()): Promise<ReservationDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE r.tenant_id = $1 AND r.status = 'pending' AND r.starts_at > $2
     ORDER BY r.starts_at`,
    [tenantId, now],
  )
  return rows.map(toDetail)
}

/**
 * A recepção marcou a chegada (ou a falta) de um grupo.
 *
 * Só vale para reserva viva do mesmo restaurante: o id vem do botão, e é aqui
 * que um id de outro restaurante, ou de uma reserva cancelada, morre.
 * Marcar de novo corrige — tocou "Faltou" por engano e o grupo apareceu, toca
 * "Chegou" e pronto.
 */
export async function markArrival(
  tenantId: string,
  reservationId: string,
  arrived: boolean,
): Promise<ReservationDetail | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE reservations
     SET status = $3::text, arrived_at = CASE WHEN $3::text = 'arrived' THEN now() ELSE NULL END
     WHERE id = $1 AND tenant_id = $2
       AND status IN ('scheduled', 'confirmed', 'arrived', 'no_show', 'completed')
     RETURNING id`,
    [reservationId, tenantId, arrived ? 'arrived' : 'no_show'],
  )
  return row ? findReservation(row.id) : null
}

/**
 * As reservas de um intervalo — o que o dono e a recepção veem ("Reservas de
 * hoje"). Inclui as pendentes, marcadas como tal na tela, e as que já chegaram
 * ou faltaram: a recepção precisa ver a noite inteira, não só quem falta chegar.
 */
export async function agendaBetween(tenantId: string, from: Date, to: Date): Promise<ReservationDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE r.tenant_id = $1
       AND r.status IN ('pending', 'scheduled', 'confirmed', 'arrived', 'completed', 'no_show')
       AND r.starts_at >= $2 AND r.starts_at < $3
     ORDER BY r.starts_at, r.created_at`,
    [tenantId, from, to],
  )
  return rows.map(toDetail)
}

export interface ResumoPeriodo {
  reservas: number
  pessoas: number
  compareceram: number
  faltaram: number
}

export interface Resumo {
  hoje: ResumoPeriodo
  ontem: ResumoPeriodo
  semana: ResumoPeriodo
  mes: ResumoPeriodo
}

/**
 * O relatório do dono e da recepção: reservas, pessoas, comparecimento e
 * faltas de hoje, ontem, dos últimos 7 dias (`semana`) e do mês. Uma consulta só.
 *
 * `count(*)` e `sum()` são `int8`, e o driver do Postgres entrega `bigint` como
 * STRING — sem o `::int`, "12" + 1 daria "121" no texto do bot. Daí os casts.
 *
 * O que conta como "compareceu": `arrived` (a recepção marcou) ou `completed`
 * (passou e ninguém marcou falta). Quem não usa o painel da recepção vê todo
 * mundo como presente — é o comportamento honesto: sem marcação, não há como
 * saber quem faltou.
 */
export async function resumo(
  tenantId: string,
  janelas: { ontem: Date; hoje: Date; amanha: Date; semana: Date; mes: Date },
): Promise<Resumo> {
  const row = await queryOne<Record<string, number>>(
    `SELECT
       ${periodo('hoje', '$3', '$4')},
       ${periodo('ontem', '$2', '$3')},
       ${periodo('semana', '$5', '$4')},
       ${periodo('mes', '$6', '$4')}
     FROM reservations
     WHERE tenant_id = $1
       AND status IN ('scheduled', 'confirmed', 'arrived', 'completed', 'no_show')
       AND starts_at >= LEAST($2::timestamptz, $5::timestamptz, $6::timestamptz)
       AND starts_at < $4`,
    [tenantId, janelas.ontem, janelas.hoje, janelas.amanha, janelas.semana, janelas.mes],
  )

  const pick = (nome: string): ResumoPeriodo => ({
    reservas: row?.[`${nome}_reservas`] ?? 0,
    pessoas: row?.[`${nome}_pessoas`] ?? 0,
    compareceram: row?.[`${nome}_compareceram`] ?? 0,
    faltaram: row?.[`${nome}_faltaram`] ?? 0,
  })
  return { hoje: pick('hoje'), ontem: pick('ontem'), semana: pick('semana'), mes: pick('mes') }
}

function periodo(nome: string, de: string, ate: string): string {
  const janela = `starts_at >= ${de} AND starts_at < ${ate}`
  return `
       count(*) FILTER (WHERE ${janela})::int AS ${nome}_reservas,
       COALESCE(sum(party_size) FILTER (WHERE ${janela}), 0)::int AS ${nome}_pessoas,
       count(*) FILTER (WHERE ${janela} AND status IN ('arrived', 'completed'))::int AS ${nome}_compareceram,
       count(*) FILTER (WHERE ${janela} AND status = 'no_show')::int AS ${nome}_faltaram`
}

/** Visitas concluídas num intervalo — base do pós-visita. */
export async function completedBetween(tenantId: string, from: Date, to: Date): Promise<ReservationDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE r.tenant_id = $1 AND r.status = 'completed' AND r.ends_at >= $2 AND r.ends_at < $3
     ORDER BY r.ends_at`,
    [tenantId, from, to],
  )
  return rows.map(toDetail)
}

/**
 * Quantas reservas futuras dependem de cada ambiente.
 *
 * É o que o estúdio pergunta antes de deixar remover um ambiente: sair do config
 * desativa a linha e ela some do menu, mas quem já reservou continua reservado —
 * e o dono precisa saber que vai ter gente para avisar.
 */
export async function usoFuturo(tenantId: string, now: Date = new Date()): Promise<{ areas: Record<string, number> }> {
  const rows = await query<{ slug: string; total: number }>(
    `SELECT a.slug, count(*)::int AS total
       FROM reservations r JOIN areas a ON a.id = r.area_id
      WHERE r.tenant_id = $1 AND r.starts_at >= $2 AND r.status IN ${LIVE}
      GROUP BY a.slug`,
    [tenantId, now],
  )

  const areas: Record<string, number> = {}
  for (const row of rows) areas[row.slug] = row.total
  return { areas }
}

export async function createTimeBlock(
  tenantId: string,
  areaId: string | null,
  startsAt: Date,
  endsAt: Date,
  reason: string,
): Promise<void> {
  await query(
    'INSERT INTO time_blocks (tenant_id, area_id, starts_at, ends_at, reason) VALUES ($1, $2, $3, $4, $5)',
    [tenantId, areaId, startsAt, endsAt, reason],
  )
}

/**
 * Fecha o dia que passou. Roda no job diário e é o que alimenta o pós-visita e
 * a régua de reativação:
 *
 *  · reserva viva que já terminou vira `completed`;
 *  · pedido que o dono nunca respondeu e cuja hora já passou vira `declined` —
 *    ele não pode ficar segurando lugar nem aparecendo como pendente para sempre.
 */
export async function markPastAsCompleted(tenantId: string, now: Date = new Date()): Promise<number> {
  const completed = await query<{ id: string }>(
    `UPDATE reservations SET status = 'completed'
     WHERE tenant_id = $1 AND status IN ('scheduled', 'confirmed', 'arrived') AND ends_at < $2
     RETURNING id`,
    [tenantId, now],
  )
  await query(
    `UPDATE reservations
     SET status = 'declined', cancelled_at = now(), cancel_reason = 'expirou sem resposta do dono'
     WHERE tenant_id = $1 AND status = 'pending' AND starts_at < $2`,
    [tenantId, now],
  )
  return completed.length
}

/** Data da última visita de cada cliente — base da reativação. */
export async function contactsWithoutVisitSince(
  tenantId: string,
  since: Date,
): Promise<{ contactId: string; waId: string; name: string; lastVisit: Date }[]> {
  const rows = await query<{ contact_id: string; wa_id: string; name: string; last_visit: Date }>(
    `
    SELECT c.id AS contact_id, c.wa_id, c.name, MAX(r.ends_at) AS last_visit
    FROM contacts c
    JOIN reservations r ON r.contact_id = c.id AND r.status = 'completed'
    WHERE c.tenant_id = $1
      AND NOT c.opted_out
      AND c.marketing_opt_in
      -- Sem nada reservado para o futuro: quem já vai voltar não precisa de convite.
      AND NOT EXISTS (
        SELECT 1 FROM reservations f
        WHERE f.contact_id = c.id AND f.status IN ${LIVE} AND f.starts_at > now()
      )
    GROUP BY c.id, c.wa_id, c.name
    HAVING MAX(r.ends_at) < $2
    `,
    [tenantId, since],
  )
  return rows.map((row) => ({
    contactId: row.contact_id,
    waId: row.wa_id,
    name: row.name,
    lastVisit: row.last_visit,
  }))
}
