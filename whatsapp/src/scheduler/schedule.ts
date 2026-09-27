import { isWithinServiceWindow, upsertContact, type Contact } from '../db/repositories/contacts.js'
import { enqueue, type OutboxKind } from '../db/repositories/outbox.js'
import { env } from '../env.js'
import { isQuietHour, nextAllowedTime } from '../lib/datetime.js'
import { log } from '../lib/logger.js'
import type { Tenant } from '../tenants/types.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'
import {
  avisoCancelamento,
  avisoNovaReserva,
  lembrete24hMessage,
  lembrete2hMessage,
  pedidoAprovacao,
  type ReservationMessageData,
} from './messages.js'

/**
 * Quando cada mensagem programada deve sair.
 *
 * Uma mensagem só é enfileirada se estiver ligada NOS DOIS lugares: na trava
 * geral do `.env` (`FEATURE_*`) e no config do restaurante
 * (`whatsapp.messages.*`). A trava do `.env` é do operador do servidor; a do
 * config é do restaurante. Qualquer uma desligada impede o envio.
 */

type ConfigurableKind = Exclude<OutboxKind, 'avisoDono'>

export function isMessageEnabled(kind: ConfigurableKind, tenant: Tenant): boolean {
  const globalFlag = env.features[kind]
  const tenantFlag = tenant.config.whatsapp.messages[kind]
  return globalFlag && tenantFlag
}

/** Empurra o envio para depois do silêncio noturno. */
function respectQuietHours(when: Date, tenant: Tenant): Date {
  const [start, end] = tenant.config.whatsapp.quietHours
  return nextAllowedTime(when, tenant.timezone, start, end)
}

export function isInQuietHours(when: Date, tenant: Tenant): boolean {
  const [start, end] = tenant.config.whatsapp.quietHours
  return isQuietHour(when, tenant.timezone, start, end)
}

/**
 * Enfileira os lembretes de uma reserva confirmada (na hora, ou quando o dono
 * aprova o pedido de um grupo grande).
 *
 * A confirmação NÃO entra aqui: ela é a própria resposta ao toque em
 * "Confirmar" (`reservadoScreen`), sai na hora e já traz todos os detalhes.
 * Repetir o mesmo texto pela fila só duplicava a mensagem na conversa.
 *
 * O que já passou da hora não é enfileirado: reservar às 11h para o almoço das
 * 13h não gera lembrete de 24h — ele já teria vencido.
 */
export async function scheduleReservationMessages(
  tenant: Tenant,
  contact: Contact,
  data: ReservationMessageData,
  now: Date = new Date(),
): Promise<OutboxKind[]> {
  const scheduled: OutboxKind[] = []
  const to = contact.waId

  const add = async (kind: ConfigurableKind, when: Date, payload: OutgoingMessage): Promise<void> => {
    if (!isMessageEnabled(kind, tenant)) return
    if (contact.optedOut) return
    if (when <= now) return

    const created = await enqueue({
      tenantId: tenant.id,
      contactId: contact.id,
      reservationId: data.reservationId,
      kind,
      payload,
      scheduledFor: when,
      dedupeKey: `${data.reservationId}:${kind}`,
    })
    if (created) scheduled.push(kind)
  }

  const lembrete24h = respectQuietHours(new Date(data.startsAt.getTime() - 24 * 60 * 60 * 1000), tenant)
  // Se o silêncio empurrou o lembrete para depois da própria reserva, não faz
  // sentido enviar — o lembrete de 2h dá conta.
  if (lembrete24h < data.startsAt) {
    await add('lembrete24h', lembrete24h, lembrete24hMessage(to, tenant, data))
  }

  const lembrete2h = new Date(data.startsAt.getTime() - 2 * 60 * 60 * 1000)
  // O de 2h NÃO é adiado pelo silêncio: adiar um lembrete de 2h o tornaria
  // inútil. Se ele cairia de madrugada, simplesmente não vai.
  if (!isInQuietHours(lembrete2h, tenant)) {
    await add('lembrete2h', lembrete2h, lembrete2hMessage(to, tenant, data))
  }

  log.info('lembretes programados', {
    tenant: tenant.slug,
    reservation: data.reservationId,
    kinds: scheduled,
  })

  return scheduled
}

/**
 * Avisa o dono do restaurante.
 *
 * ⚠️  Detalhe da Cloud API que vale entender: o servidor só pode mandar texto
 * livre para quem falou com o número nas últimas 24 horas — e isso vale também
 * para o dono. Se ele não interagir com o bot por um dia, o aviso não sai.
 *
 * Por isso o aviso é descartado (e registrado no log) em vez de tentar e tomar
 * erro 131047. Para avisos garantidos a qualquer hora, crie um template de
 * utilidade e troque esta função pelo envio dele.
 */
export async function notifyOwner(
  tenant: Tenant,
  payload: OutgoingMessage,
  dedupeKey: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!tenant.ownerPhone) return false

  const owner = await upsertContact(tenant.id, tenant.ownerPhone, 'Dono', new Date(0))

  if (!isWithinServiceWindow(owner, now)) {
    log.warn('aviso ao dono não enviado: fora da janela de 24h', {
      tenant: tenant.slug,
      dica: 'peça ao dono para mandar "menu" para o número do restaurante',
    })
    return false
  }

  return enqueue({
    tenantId: tenant.id,
    contactId: owner.id,
    kind: 'avisoDono',
    payload,
    scheduledFor: now,
    dedupeKey,
  })
}

export async function notifyOwnerNewReservation(
  tenant: Tenant,
  data: ReservationMessageData,
): Promise<void> {
  if (!tenant.ownerPhone) return
  await notifyOwner(
    tenant,
    avisoNovaReserva(tenant.ownerPhone, tenant, data),
    `${data.reservationId}:avisoDono:nova`,
  )
}

/**
 * O pedido de um grupo grande. Se o dono estiver fora da janela de 24h, o aviso
 * não sai — mas o pedido continua lá, no "Pedidos pendentes" do menu dele, que
 * é o primeiro item que aparece quando existe algum.
 */
export async function notifyOwnerApprovalRequest(
  tenant: Tenant,
  data: ReservationMessageData,
): Promise<void> {
  if (!tenant.ownerPhone) return
  await notifyOwner(
    tenant,
    pedidoAprovacao(tenant.ownerPhone, tenant, data),
    `${data.reservationId}:avisoDono:pedido`,
  )
}

export async function notifyOwnerCancellation(
  tenant: Tenant,
  data: ReservationMessageData,
): Promise<void> {
  if (!tenant.ownerPhone) return
  await notifyOwner(
    tenant,
    avisoCancelamento(tenant.ownerPhone, tenant, data),
    `${data.reservationId}:avisoDono:cancelada`,
  )
}
