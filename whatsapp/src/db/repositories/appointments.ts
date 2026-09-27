import type { BusyInterval } from '../../booking/slots.js'
import { query, queryOne } from '../pool.js'

/**
 * A agenda.
 *
 * O ponto central aqui é `createAppointment`: a checagem de conflito não é
 * feita com um SELECT antes do INSERT — isso teria uma janela de corrida entre
 * as duas consultas, e é exatamente nela que dois clientes pegam o mesmo
 * horário no sábado de manhã. Quem decide é a constraint EXCLUDE do banco: o
 * INSERT simplesmente falha com 23P01 e devolvemos "esse horário acabou de ser
 * preenchido".
 */

/** Código do Postgres para violação de constraint EXCLUDE. */
const EXCLUSION_VIOLATION = '23P01'

export interface Appointment {
  id: string
  tenantId: string
  contactId: string
  barberId: string
  serviceId: string
  startsAt: Date
  endsAt: Date
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
}

export interface AppointmentDetail extends Appointment {
  serviceName: string
  barberName: string
  contactWaId: string
  contactName: string
}

interface AppointmentRow {
  id: string
  tenant_id: string
  contact_id: string
  barber_id: string
  service_id: string
  starts_at: Date
  ends_at: Date
  status: Appointment['status']
}

interface DetailRow extends AppointmentRow {
  service_name: string
  barber_name: string
  contact_wa_id: string
  contact_name: string
}

const toAppointment = (row: AppointmentRow): Appointment => ({
  id: row.id,
  tenantId: row.tenant_id,
  contactId: row.contact_id,
  barberId: row.barber_id,
  serviceId: row.service_id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
})

const toDetail = (row: DetailRow): AppointmentDetail => ({
  ...toAppointment(row),
  serviceName: row.service_name,
  barberName: row.barber_name,
  contactWaId: row.contact_wa_id,
  contactName: row.contact_name,
})

const DETAIL_SELECT = `
  SELECT a.id, a.tenant_id, a.contact_id, a.barber_id, a.service_id,
         a.starts_at, a.ends_at, a.status,
         s.name AS service_name, b.name AS barber_name,
         c.wa_id AS contact_wa_id, c.name AS contact_name
  FROM appointments a
  JOIN services s ON s.id = a.service_id
  JOIN barbers  b ON b.id = a.barber_id
  JOIN contacts c ON c.id = a.contact_id
`

/**
 * Tudo que ocupa a agenda de um barbeiro num intervalo: agendamentos vivos e
 * bloqueios manuais (folga, feriado, almoço extra). Bloqueio sem barbeiro
 * definido fecha para a barbearia inteira.
 */
export async function busyIntervals(
  tenantId: string,
  barberId: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const rows = await query<{ starts_at: Date; ends_at: Date }>(
    `
    SELECT starts_at, ends_at FROM appointments
     WHERE tenant_id = $1 AND barber_id = $2
       AND status IN ('scheduled', 'confirmed')
       AND starts_at < $4 AND ends_at > $3
    UNION ALL
    SELECT starts_at, ends_at FROM time_blocks
     WHERE tenant_id = $1
       AND (barber_id = $2 OR barber_id IS NULL)
       AND starts_at < $4 AND ends_at > $3
    `,
    [tenantId, barberId, from, to],
  )
  return rows.map((row) => ({ start: row.starts_at, end: row.ends_at }))
}

export interface CreateAppointmentInput {
  tenantId: string
  contactId: string
  barberId: string
  serviceId: string
  startsAt: Date
  endsAt: Date
}

/**
 * Reserva o horário. Devolve `null` quando o horário foi pego por outra pessoa
 * entre a hora em que o cliente viu a lista e a hora em que ele confirmou —
 * caso comum, não é erro.
 */
export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment | null> {
  try {
    const row = await queryOne<AppointmentRow>(
      `
      INSERT INTO appointments (tenant_id, contact_id, barber_id, service_id, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, tenant_id, contact_id, barber_id, service_id, starts_at, ends_at, status
      `,
      [input.tenantId, input.contactId, input.barberId, input.serviceId, input.startsAt, input.endsAt],
    )
    return row ? toAppointment(row) : null
  } catch (error) {
    if ((error as { code?: string }).code === EXCLUSION_VIOLATION) return null
    throw error
  }
}

/** Agendamentos futuros do cliente, para a tela "Meus agendamentos". */
export async function listUpcomingByContact(contactId: string, now: Date = new Date()): Promise<AppointmentDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE a.contact_id = $1 AND a.status IN ('scheduled', 'confirmed') AND a.starts_at > $2
     ORDER BY a.starts_at`,
    [contactId, now],
  )
  return rows.map(toDetail)
}

export async function countUpcomingByContact(contactId: string, now: Date = new Date()): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM appointments
     WHERE contact_id = $1 AND status IN ('scheduled', 'confirmed') AND starts_at > $2`,
    [contactId, now],
  )
  return Number(row?.count ?? 0)
}

export async function findAppointment(appointmentId: string): Promise<AppointmentDetail | null> {
  const row = await queryOne<DetailRow>(`${DETAIL_SELECT} WHERE a.id = $1`, [appointmentId])
  return row ? toDetail(row) : null
}

/**
 * Cancela e devolve o agendamento cancelado.
 *
 * O `WHERE status IN (...)` deixa a operação idempotente: cancelar duas vezes
 * (o cliente tocou duas vezes no botão) não gera dois avisos ao dono.
 */
export async function cancelAppointment(
  appointmentId: string,
  reason: string,
): Promise<AppointmentDetail | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE appointments
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
     WHERE id = $1 AND status IN ('scheduled', 'confirmed')
     RETURNING id`,
    [appointmentId, reason],
  )
  return row ? findAppointment(row.id) : null
}

/** Cliente respondeu "Confirmo" no lembrete de 24h. */
export async function confirmAttendance(appointmentId: string): Promise<void> {
  await query(`UPDATE appointments SET status = 'confirmed' WHERE id = $1 AND status = 'scheduled'`, [
    appointmentId,
  ])
}

/** Agenda de um intervalo — usada no menu do dono ("Agenda de hoje"). */
/**
 * A agenda de um intervalo.
 *
 * `barberId` nulo devolve a barbearia inteira — é o menu do dono. Preenchido,
 * recorta em um barbeiro só: é o que faz o painel do barbeiro nunca mostrar o
 * cliente do colega.
 */
export async function agendaBetween(
  tenantId: string,
  from: Date,
  to: Date,
  barberId: string | null = null,
): Promise<AppointmentDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE a.tenant_id = $1 AND a.status IN ('scheduled', 'confirmed')
       AND a.starts_at >= $2 AND a.starts_at < $3
       AND ($4::uuid IS NULL OR a.barber_id = $4)
     ORDER BY a.starts_at`,
    [tenantId, from, to, barberId],
  )
  return rows.map(toDetail)
}

export interface CortesResumo {
  hoje: number
  ontem: number
  mes: number
}

/**
 * Quantos cortes o barbeiro fez: hoje, ontem e no mês. Uma consulta só.
 *
 * Duas decisões que não são óbvias:
 *
 * `count(*)` é `int8`, e o driver do Postgres entrega `bigint` como STRING —
 * sem o `::int`, "12" + 1 daria "121" no texto do bot. Daí o cast.
 *
 * E o que conta como corte feito: `completed` só é carimbado pelo job diário
 * (`markPastAsCompleted`), que roda de manhã. Sem a segunda metade do OR, o
 * barbeiro olharia "cortes de hoje" às 18h e veria zero — todos os cortes do
 * dia ainda estão `confirmed`. Cancelado e no-show ficam de fora dos dois lados.
 */
export async function cortesDoBarbeiro(
  tenantId: string,
  barberId: string,
  janelas: { ontem: Date; hoje: Date; amanha: Date; mes: Date },
): Promise<CortesResumo> {
  const row = await queryOne<CortesResumo>(
    `SELECT
       count(*) FILTER (WHERE ends_at >= $4 AND ends_at < $5)::int AS hoje,
       count(*) FILTER (WHERE ends_at >= $3 AND ends_at < $4)::int AS ontem,
       count(*) FILTER (WHERE ends_at >= $6 AND ends_at < $5)::int AS mes
     FROM appointments
     WHERE tenant_id = $1 AND barber_id = $2
       AND (status = 'completed'
            OR (status IN ('scheduled', 'confirmed') AND ends_at < now()))
       AND ends_at >= LEAST($3, $6) AND ends_at < $5`,
    [tenantId, barberId, janelas.ontem, janelas.hoje, janelas.amanha, janelas.mes],
  )
  return row ?? { hoje: 0, ontem: 0, mes: 0 }
}

/** Atendimentos concluídos num intervalo — base do pós-atendimento. */
export async function completedBetween(tenantId: string, from: Date, to: Date): Promise<AppointmentDetail[]> {
  const rows = await query<DetailRow>(
    `${DETAIL_SELECT}
     WHERE a.tenant_id = $1 AND a.status = 'completed' AND a.ends_at >= $2 AND a.ends_at < $3
     ORDER BY a.ends_at`,
    [tenantId, from, to],
  )
  return rows.map(toDetail)
}

/**
 * Quantos agendamentos futuros dependem de cada serviço e de cada barbeiro.
 *
 * É o que o estúdio pergunta antes de deixar remover um item: sair do config
 * desativa a linha e ela some do menu, mas quem já marcou continua marcado — e
 * o dono precisa saber que vai ter gente para avisar.
 */
export async function usoFuturo(
  tenantId: string,
  now: Date = new Date(),
): Promise<{ services: Record<string, number>; barbers: Record<string, number> }> {
  const rows = await query<{ tipo: string; slug: string; total: string }>(
    `
    SELECT 'service' AS tipo, s.slug, count(*)::text AS total
      FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = $1 AND a.starts_at >= $2 AND a.status IN ('scheduled', 'confirmed')
     GROUP BY s.slug
    UNION ALL
    SELECT 'barber' AS tipo, b.slug, count(*)::text AS total
      FROM appointments a JOIN barbers b ON b.id = a.barber_id
     WHERE a.tenant_id = $1 AND a.starts_at >= $2 AND a.status IN ('scheduled', 'confirmed')
     GROUP BY b.slug
    `,
    [tenantId, now],
  )

  const services: Record<string, number> = {}
  const barbers: Record<string, number> = {}
  for (const row of rows) {
    const destino = row.tipo === 'service' ? services : barbers
    destino[row.slug] = Number(row.total)
  }
  return { services, barbers }
}

export async function createTimeBlock(
  tenantId: string,
  barberId: string | null,
  startsAt: Date,
  endsAt: Date,
  reason: string,
): Promise<void> {
  await query(
    'INSERT INTO time_blocks (tenant_id, barber_id, starts_at, ends_at, reason) VALUES ($1, $2, $3, $4, $5)',
    [tenantId, barberId, startsAt, endsAt, reason],
  )
}

/**
 * Marca como concluído tudo que já passou. Roda no job diário e é o que
 * alimenta o pós-atendimento e a régua de reativação.
 */
export async function markPastAsCompleted(tenantId: string, now: Date = new Date()): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE appointments SET status = 'completed'
     WHERE tenant_id = $1 AND status IN ('scheduled', 'confirmed') AND ends_at < $2
     RETURNING id`,
    [tenantId, now],
  )
  return rows.length
}

/** Data do último atendimento concluído de cada cliente — base da reativação. */
export async function contactsWithoutVisitSince(
  tenantId: string,
  since: Date,
): Promise<{ contactId: string; waId: string; name: string; lastVisit: Date }[]> {
  const rows = await query<{ contact_id: string; wa_id: string; name: string; last_visit: Date }>(
    `
    SELECT c.id AS contact_id, c.wa_id, c.name, MAX(a.ends_at) AS last_visit
    FROM contacts c
    JOIN appointments a ON a.contact_id = c.id AND a.status = 'completed'
    WHERE c.tenant_id = $1
      AND NOT c.opted_out
      AND c.marketing_opt_in
      -- Sem nada marcado para o futuro: quem já vai voltar não precisa de convite.
      AND NOT EXISTS (
        SELECT 1 FROM appointments f
        WHERE f.contact_id = c.id AND f.status IN ('scheduled', 'confirmed') AND f.starts_at > now()
      )
    GROUP BY c.id, c.wa_id, c.name
    HAVING MAX(a.ends_at) < $2
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
