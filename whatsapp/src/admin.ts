import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { DateTime } from 'luxon'
import { agendaBetween, createTimeBlock } from './db/repositories/reservations.js'
import { setBirthday, setMarketingOptIn, setOptedOut } from './db/repositories/contacts.js'
import { outboxStats } from './db/repositories/outbox.js'
import { findTenantBySlug, listTenants } from './db/repositories/tenants.js'
import { env } from './env.js'
import { log } from './lib/logger.js'

/**
 * Rotas administrativas.
 *
 * O dia a dia do restaurante acontece no menu do WhatsApp do dono — isto aqui é o
 * que sobra: consultar de fora, corrigir um dado, ligar um painel no futuro.
 *
 * Protegidas por um token único (`ADMIN_API_TOKEN`). Não é sistema de login com
 * usuários; se um dia virar painel para vários donos, isto precisa virar
 * autenticação de verdade.
 */

function requireToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const header = request.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token || token !== env.adminApiToken) {
    log.warn('acesso administrativo recusado', { ip: request.ip })
    void reply.code(401).send({ error: 'não autorizado' })
    return false
  }
  return true
}

export async function registerAdmin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/admin')) requireToken(request, reply)
  })

  app.get('/admin/tenants', async () => {
    const tenants = await listTenants()
    return tenants.map((tenant) => ({
      slug: tenant.slug,
      nome: tenant.displayName,
      phoneNumberId: tenant.phoneNumberId,
      timezone: tenant.timezone,
      ativa: tenant.active,
      botPausadoAte: tenant.botPausedUntil,
      ambientes: tenant.config.areas.length,
      pratosEmDestaque: tenant.config.menu.items.length,
      mensagens: tenant.config.whatsapp.messages,
    }))
  })

  /** Reservas de um dia. `?dia=2026-08-22`, ou hoje. */
  app.get('/admin/:slug/reservas', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const { dia } = request.query as { dia?: string }

    const tenant = await findTenantBySlug(slug)
    if (!tenant) return reply.code(404).send({ error: 'restaurante não encontrado' })

    const day = dia
      ? DateTime.fromISO(dia, { zone: tenant.timezone })
      : DateTime.now().setZone(tenant.timezone)
    if (!day.isValid) return reply.code(400).send({ error: 'dia inválido, use 2026-08-22' })

    const reservations = await agendaBetween(
      tenant.id,
      day.startOf('day').toJSDate(),
      day.startOf('day').plus({ days: 1 }).toJSDate(),
    )

    return reservations.map((reservation) => ({
      id: reservation.id,
      inicio: reservation.startsAt,
      fim: reservation.endsAt,
      pessoas: reservation.partySize,
      ambiente: reservation.areaName,
      cliente: reservation.contactName || reservation.contactWaId,
      status: reservation.status,
    }))
  })

  /** Fecha um período para reservas (feriado, evento fechado, reforma). */
  app.post('/admin/:slug/bloqueios', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as { inicio?: string; fim?: string; motivo?: string; ambienteId?: string }

    const tenant = await findTenantBySlug(slug)
    if (!tenant) return reply.code(404).send({ error: 'restaurante não encontrado' })

    const inicio = body.inicio ? new Date(body.inicio) : null
    const fim = body.fim ? new Date(body.fim) : null
    if (!inicio || !fim || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim <= inicio) {
      return reply.code(400).send({ error: 'informe inicio e fim válidos, em ISO 8601' })
    }

    await createTimeBlock(tenant.id, body.ambienteId ?? null, inicio, fim, body.motivo ?? 'bloqueio manual')
    return { ok: true }
  })

  /**
   * Ajustes no cadastro do cliente: aniversário e consentimentos.
   * É por aqui que a data de nascimento entra, já que o bot não pergunta.
   */
  app.patch('/admin/contatos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { aniversario?: string | null; marketing?: boolean; optOut?: boolean }

    if (body.aniversario !== undefined) {
      const date = body.aniversario ? new Date(body.aniversario) : null
      if (date && Number.isNaN(date.getTime())) {
        return reply.code(400).send({ error: 'aniversario inválido, use 1990-04-25' })
      }
      await setBirthday(id, date)
    }
    if (body.marketing !== undefined) await setMarketingOptIn(id, body.marketing)
    if (body.optOut !== undefined) await setOptedOut(id, body.optOut)

    return { ok: true }
  })

  /** Situação da fila de mensagens — o primeiro lugar para olhar quando algo não chega. */
  app.get('/admin/:slug/fila', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const tenant = await findTenantBySlug(slug)
    if (!tenant) return reply.code(404).send({ error: 'restaurante não encontrado' })

    return { fila: await outboxStats(tenant.id) }
  })
}
