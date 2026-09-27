import { DateTime } from 'luxon'
import {
  completedBetween,
  contactsWithoutVisitSince,
  markPastAsCompleted,
} from '../db/repositories/appointments.js'
import { contactsWithBirthday, findContactById, isWithinServiceWindow } from '../db/repositories/contacts.js'
import { purgeOldMessageBodies } from '../db/repositories/messages.js'
import { enqueue } from '../db/repositories/outbox.js'
import { listTenants } from '../db/repositories/tenants.js'
import { env } from '../env.js'
import { errorMessage, log } from '../lib/logger.js'
import type { Tenant } from '../tenants/types.js'
import { aniversarioMessage, posAtendimentoMessage, reativacaoMessage } from './messages.js'
import { isMessageEnabled } from './schedule.js'

/**
 * Rotinas diárias.
 *
 * As três mensagens daqui — pós-atendimento, reativação e aniversário — nascem
 * DESLIGADAS, por `FEATURE_*` no `.env` e por `whatsapp.messages` no config da
 * barbearia. O código está pronto e testado; ligar é decisão de negócio, e
 * depende do template correspondente estar aprovado na Meta.
 *
 * As duas últimas são de MARKETING: só vão para quem deu opt-in, têm limite por
 * pessoa imposto pela Meta e podem derrubar a qualidade do número se muita
 * gente bloquear. Ligue uma de cada vez e acompanhe.
 */

export async function runDailyJobs(now: Date = new Date()): Promise<void> {
  log.info('rodando as rotinas diárias')

  const tenants = await listTenants()
  for (const tenant of tenants) {
    if (!tenant.active) continue
    try {
      await runForTenant(tenant, now)
    } catch (error) {
      log.error('falha nas rotinas diárias da barbearia', {
        tenant: tenant.slug,
        reason: errorMessage(error),
      })
    }
  }

  // LGPD: o conteúdo das conversas antigas é apagado, o registro fica.
  const purged = await purgeOldMessageBodies(env.conversation.messageRetentionDays)
  if (purged > 0) log.info('conteúdo de mensagens antigas apagado', { linhas: purged })
}

async function runForTenant(tenant: Tenant, now: Date): Promise<void> {
  // Sem isto, um corte que já aconteceu continuaria "agendado" para sempre — e
  // as réguas de pós-atendimento e reativação dependem desse estado.
  const completed = await markPastAsCompleted(tenant.id, now)
  if (completed > 0) log.info('atendimentos marcados como concluídos', { tenant: tenant.slug, completed })

  await jobPosAtendimento(tenant, now)
  await jobReativacao(tenant, now)
  await jobAniversario(tenant, now)
}

/** Agradecimento e pedido de avaliação, no dia seguinte ao atendimento. */
async function jobPosAtendimento(tenant: Tenant, now: Date): Promise<void> {
  if (!isMessageEnabled('posAtendimento', tenant)) return

  if (!tenant.config.whatsapp.reviewUrl) {
    log.warn('pós-atendimento ligado mas sem whatsapp.reviewUrl no config', { tenant: tenant.slug })
  }

  const local = DateTime.fromJSDate(now, { zone: tenant.timezone })
  const yesterday = local.startOf('day').minus({ days: 1 })

  const appointments = await completedBetween(
    tenant.id,
    yesterday.toJSDate(),
    yesterday.plus({ days: 1 }).toJSDate(),
  )

  for (const appointment of appointments) {
    const contact = await findContactById(appointment.contactId)
    if (!contact || contact.optedOut) continue

    const payload = posAtendimentoMessage(
      contact.waId,
      tenant,
      {
        contactName: contact.name,
        serviceName: appointment.serviceName,
        barberName: appointment.barberName,
        startsAt: appointment.startsAt,
        appointmentId: appointment.id,
      },
      isWithinServiceWindow(contact, now),
    )

    await enqueue({
      tenantId: tenant.id,
      contactId: contact.id,
      appointmentId: appointment.id,
      kind: 'posAtendimento',
      payload,
      scheduledFor: now,
      dedupeKey: `${appointment.id}:posAtendimento`,
    })
  }
}

/** Convite para voltar, a quem não aparece há um tempo. */
async function jobReativacao(tenant: Tenant, now: Date): Promise<void> {
  if (!isMessageEnabled('reativacao', tenant)) return

  const dias = tenant.config.whatsapp.reativacaoDias
  const since = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000)

  const candidates = await contactsWithoutVisitSince(tenant.id, since)

  for (const candidate of candidates) {
    const diasSemVir = Math.floor((now.getTime() - candidate.lastVisit.getTime()) / (24 * 60 * 60 * 1000))

    await enqueue({
      tenantId: tenant.id,
      contactId: candidate.contactId,
      kind: 'reativacao',
      payload: reativacaoMessage(candidate.waId, tenant, candidate.name, diasSemVir),
      scheduledFor: now,
      // Uma vez por cliente a cada rodada de reativação: a chave carrega o mês,
      // então ninguém recebe convite duas vezes no mesmo período.
      dedupeKey: `${candidate.contactId}:reativacao:${now.toISOString().slice(0, 7)}`,
    })
  }

  if (candidates.length > 0) {
    log.info('convites de reativação enfileirados', { tenant: tenant.slug, total: candidates.length })
  }
}

/**
 * Parabéns no dia.
 *
 * Só funciona para quem tem `contacts.birthday` preenchido — o menu do bot não
 * pergunta a data de nascimento (seria mais um passo no meio do agendamento).
 * Preencha pela rota administrativa `PATCH /admin/contacts/:id` ou importando
 * de onde a barbearia já tem esse dado.
 */
async function jobAniversario(tenant: Tenant, now: Date): Promise<void> {
  if (!isMessageEnabled('aniversario', tenant)) return

  const local = DateTime.fromJSDate(now, { zone: tenant.timezone })
  const contacts = await contactsWithBirthday(tenant.id, local.month, local.day)

  for (const contact of contacts) {
    await enqueue({
      tenantId: tenant.id,
      contactId: contact.id,
      kind: 'aniversario',
      payload: aniversarioMessage(contact.waId, tenant, contact.name),
      scheduledFor: now,
      dedupeKey: `${contact.id}:aniversario:${local.year}`,
    })
  }

  if (contacts.length > 0) {
    log.info('mensagens de aniversário enfileiradas', { tenant: tenant.slug, total: contacts.length })
  }
}
