import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { handleInbound } from '../bot/handler.js'
import { updateDeliveryStatus } from '../db/repositories/messages.js'
import { env } from '../env.js'
import { errorMessage, log } from '../lib/logger.js'
import { getTenantContext } from '../tenants/registry.js'
import { normalizePhone } from '@barbearia/shared/lib/whatsapp'
import { isValidSignature, verifyChallenge } from './signature.js'
import { normalizeInbound, type MessageStatus, type WebhookPayload, type WebhookValue } from './types.js'

/**
 * Endpoint do webhook da Meta.
 *
 * Três coisas mandam no desenho desta rota, todas impostas pela Cloud API:
 *
 *  1. É um endereço PÚBLICO. Qualquer um pode chamar. A assinatura
 *     `X-Hub-Signature-256` é a única prova de que a chamada veio da Meta —
 *     por isso ela é conferida antes de qualquer outra coisa.
 *
 *  2. A resposta precisa ser RÁPIDA. A Meta reenvia o evento se demorar, e
 *     reenvio virou atendimento duplicado. Então respondemos 200 na hora e
 *     processamos depois, fora do ciclo da requisição.
 *
 *  3. O corpo precisa chegar CRU para a assinatura bater. Um parser de JSON no
 *     caminho reordena as chaves e a conferência nunca mais fecha.
 */

interface RequestWithRaw extends FastifyRequest {
  rawBody?: Buffer
}

export async function registerWebhook(app: FastifyInstance): Promise<void> {
  // Guarda o corpo cru ANTES de virar objeto — sem isso não dá para assinar.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    ;(request as RequestWithRaw).rawBody = body as Buffer
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')))
    } catch {
      // Corpo inválido não derruba a rota: o POST responde 200 assim mesmo,
      // para a Meta não ficar reenviando um evento quebrado para sempre.
      done(null, {})
    }
  })

  /**
   * Verificação do webhook. A Meta chama uma vez, quando você cadastra a URL no
   * painel, e espera o desafio de volta em texto puro.
   */
  app.get('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>
    const challenge = verifyChallenge(
      {
        mode: query['hub.mode'],
        token: query['hub.verify_token'],
        challenge: query['hub.challenge'],
      },
      env.meta.verifyToken,
    )

    if (challenge === null) {
      log.warn('verificação do webhook recusada — META_VERIFY_TOKEN não confere')
      return reply.code(403).send('token de verificação inválido')
    }

    log.info('webhook verificado pela Meta')
    return reply.type('text/plain').send(challenge)
  })

  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = (request as RequestWithRaw).rawBody ?? Buffer.alloc(0)
    const signature = request.headers['x-hub-signature-256']

    if (!isValidSignature(raw, typeof signature === 'string' ? signature : undefined, env.meta.appSecret)) {
      log.warn('webhook com assinatura inválida foi recusado', { ip: request.ip })
      return reply.code(401).send({ error: 'assinatura inválida' })
    }

    // 200 primeiro, trabalho depois.
    reply.code(200).send({ received: true })

    const payload = request.body as WebhookPayload
    processPayload(payload).catch((error: unknown) => {
      log.error('falha ao processar o webhook', { reason: errorMessage(error) })
    })
  })
}

/**
 * Um POST pode trazer vários eventos de várias barbearias. Cada um é tratado
 * isolado: uma mensagem que estoura não pode impedir as outras de serem
 * atendidas.
 */
export async function processPayload(payload: WebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (!change.value) continue
      try {
        await processChange(change.value)
      } catch (error) {
        log.error('falha ao processar um evento do webhook', { reason: errorMessage(error) })
      }
    }
  }
}

async function processChange(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return

  // Status de entrega não precisa do contexto da barbearia.
  if (value.statuses?.length) {
    await Promise.all(value.statuses.map(processStatus))
  }

  if (!value.messages?.length) return

  const ctx = await getTenantContext(phoneNumberId)
  if (!ctx) return

  // O nome do perfil vem numa lista à parte, casada pelo wa_id.
  const names = new Map((value.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name ?? '']))

  for (const message of value.messages) {
    const inbound = normalizeInbound(message)
    if (!inbound) continue

    inbound.profileName = names.get(inbound.from) ?? ''
    // O `wa_id` brasileiro vem sem o nono dígito. Se ele entrar assim, o
    // contato é gravado com uma identidade e a resposta sai para outra.
    inbound.from = normalizePhone(inbound.from, env.defaultCountryCode)

    try {
      await handleInbound(ctx, inbound)
    } catch (error) {
      log.error('falha ao atender uma mensagem', {
        tenant: ctx.tenant.slug,
        messageId: inbound.messageId,
        reason: errorMessage(error),
      })
    }
  }
}

/**
 * Status de entrega (enviada, entregue, lida, falhou).
 *
 * O `failed` é o que interessa: é aqui que aparece o número que não existe mais
 * e o template que foi reprovado depois de já estar em uso.
 */
async function processStatus(status: MessageStatus): Promise<void> {
  if (!status.id || !status.status) return

  const error = status.errors?.[0]
  await updateDeliveryStatus(status.id, status.status, error?.code ?? null)

  if (status.status === 'failed') {
    log.warn('mensagem não foi entregue', {
      messageId: status.id,
      to: status.recipient_id,
      code: error?.code,
      motivo: error?.title ?? error?.message,
    })
  }
}
