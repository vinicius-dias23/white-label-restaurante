import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../env.js'
import { closePool, query, queryOne } from '../db/pool.js'
import { migrate } from '../db/migrate.js'
import {
  busyIntervals,
  cancelAppointment,
  createAppointment,
  createTimeBlock,
  listUpcomingByContact,
} from '../db/repositories/appointments.js'
import { isWithinServiceWindow, upsertContact } from '../db/repositories/contacts.js'
import { cancelPendingForAppointment, claimDue, enqueue, markFailed } from '../db/repositories/outbox.js'
import { registerInbound } from '../db/repositories/messages.js'

/**
 * Testes que precisam de Postgres de verdade.
 *
 * A trava contra dupla marcação não tem como ser testada com banco fingido: é o
 * próprio Postgres que recusa a sobreposição, e é justamente isso que precisa
 * ser provado — dois clientes confirmando o mesmo horário no mesmo instante.
 *
 * Rodam só com DATABASE_URL_TEST preenchida no .env:
 *
 *   docker compose up -d
 *   psql -h localhost -U barbearia -c "CREATE DATABASE barbearia_test"
 *   npm test
 *
 * Sem ela, são pulados e o resto da suíte roda normalmente.
 */

const temBanco = Boolean(env.databaseUrl)

describe.skipIf(!temBanco)('banco de dados', () => {
  let tenantId: string
  let barberId: string
  let outroBarberId: string
  let serviceId: string
  let contactId: string

  const at = (iso: string): Date => new Date(iso)

  beforeAll(async () => {
    await migrate({ withReset: true })
  })

  afterAll(async () => {
    await closePool()
  })

  beforeEach(async () => {
    await query('TRUNCATE tenants CASCADE')

    tenantId = (await queryOne<{ id: string }>(
      `INSERT INTO tenants (slug, display_name, phone_number_id) VALUES ('t', 'Teste', '999') RETURNING id`,
    ))!.id

    barberId = (await queryOne<{ id: string }>(
      `INSERT INTO barbers (tenant_id, slug, name) VALUES ($1, 'rafael', 'Rafael') RETURNING id`,
      [tenantId],
    ))!.id

    outroBarberId = (await queryOne<{ id: string }>(
      `INSERT INTO barbers (tenant_id, slug, name) VALUES ($1, 'diego', 'Diego') RETURNING id`,
      [tenantId],
    ))!.id

    serviceId = (await queryOne<{ id: string }>(
      `INSERT INTO services (tenant_id, slug, name, duration_min) VALUES ($1, 'corte', 'Corte', 40) RETURNING id`,
      [tenantId],
    ))!.id

    contactId = (await queryOne<{ id: string }>(
      `INSERT INTO contacts (tenant_id, wa_id, name) VALUES ($1, '5511999999999', 'João') RETURNING id`,
      [tenantId],
    ))!.id
  })

  const marcar = (startsAt: string, minutos = 40, barbeiro = barberId) =>
    createAppointment({
      tenantId,
      contactId,
      barberId: barbeiro,
      serviceId,
      startsAt: at(startsAt),
      endsAt: new Date(at(startsAt).getTime() + minutos * 60_000),
    })

  // -------------------------------------------------------------------------

  describe('trava contra dupla marcação', () => {
    it('marca um horário livre', async () => {
      const criado = await marcar('2026-08-22T13:00:00Z')
      expect(criado).not.toBeNull()
      expect(criado!.status).toBe('scheduled')
    })

    it('RECUSA dois agendamentos sobrepostos no mesmo barbeiro', async () => {
      expect(await marcar('2026-08-22T13:00:00Z')).not.toBeNull()

      // Começa 20 min depois: invade os 40 minutos do primeiro.
      expect(await marcar('2026-08-22T13:20:00Z')).toBeNull()
      // Começa antes e atravessa o início do primeiro.
      expect(await marcar('2026-08-22T12:40:00Z')).toBeNull()
      // Exatamente o mesmo horário.
      expect(await marcar('2026-08-22T13:00:00Z')).toBeNull()
      // Engloba o primeiro inteiro.
      expect(await marcar('2026-08-22T12:30:00Z', 120)).toBeNull()
    })

    it('permite um começar no minuto em que o outro termina', async () => {
      expect(await marcar('2026-08-22T13:00:00Z')).not.toBeNull()
      expect(await marcar('2026-08-22T13:40:00Z')).not.toBeNull()
    })

    it('o mesmo horário em barbeiros diferentes é permitido', async () => {
      expect(await marcar('2026-08-22T13:00:00Z')).not.toBeNull()
      expect(await marcar('2026-08-22T13:00:00Z', 40, outroBarberId)).not.toBeNull()
    })

    it('cancelar libera o horário na hora', async () => {
      const criado = await marcar('2026-08-22T13:00:00Z')
      expect(await marcar('2026-08-22T13:00:00Z')).toBeNull()

      await cancelAppointment(criado!.id, 'teste')

      expect(await marcar('2026-08-22T13:00:00Z')).not.toBeNull()
    })

    it('cancelar duas vezes não gera dois avisos ao dono', async () => {
      const criado = await marcar('2026-08-22T13:00:00Z')
      expect(await cancelAppointment(criado!.id, 'teste')).not.toBeNull()
      // Cliente tocou duas vezes no botão.
      expect(await cancelAppointment(criado!.id, 'teste')).toBeNull()
    })
  })

  describe('ocupação da agenda', () => {
    it('junta agendamentos e bloqueios manuais', async () => {
      await marcar('2026-08-22T13:00:00Z')
      await createTimeBlock(
        tenantId,
        null, // bloqueio para a barbearia inteira
        at('2026-08-22T18:00:00Z'),
        at('2026-08-22T20:00:00Z'),
        'folga',
      )

      const ocupado = await busyIntervals(
        tenantId,
        barberId,
        at('2026-08-22T00:00:00Z'),
        at('2026-08-23T00:00:00Z'),
      )
      expect(ocupado).toHaveLength(2)
    })

    it('bloqueio de um barbeiro não afeta o outro', async () => {
      await createTimeBlock(tenantId, barberId, at('2026-08-22T18:00:00Z'), at('2026-08-22T20:00:00Z'), 'folga')

      const doOutro = await busyIntervals(
        tenantId,
        outroBarberId,
        at('2026-08-22T00:00:00Z'),
        at('2026-08-23T00:00:00Z'),
      )
      expect(doOutro).toHaveLength(0)
    })

    it('lista só os agendamentos futuros do cliente', async () => {
      await marcar('2020-01-01T13:00:00Z') // passado
      await marcar('2026-08-22T13:00:00Z') // futuro

      const futuros = await listUpcomingByContact(contactId, at('2026-08-01T00:00:00Z'))
      expect(futuros).toHaveLength(1)
      expect(futuros[0]!.serviceName).toBe('Corte')
      expect(futuros[0]!.barberName).toBe('Rafael')
    })
  })

  describe('janela de 24 horas', () => {
    it('conta a partir da última mensagem RECEBIDA', async () => {
      const agora = new Date()
      const recente = await upsertContact(tenantId, '5511777777777', 'Ana', agora)
      expect(isWithinServiceWindow(recente, agora)).toBe(true)

      const ontem = new Date(agora.getTime() - 25 * 60 * 60 * 1000)
      const antigo = await upsertContact(tenantId, '5511666666666', 'Bia', ontem)
      expect(isWithinServiceWindow(antigo, agora)).toBe(false)
    })

    it('não retrocede a janela com um webhook que chega fora de ordem', async () => {
      const agora = new Date()
      await upsertContact(tenantId, '5511555555555', 'Caio', agora)
      const depois = await upsertContact(tenantId, '5511555555555', 'Caio', new Date(agora.getTime() - 60_000))
      expect(depois.lastInboundAt!.getTime()).toBe(agora.getTime())
    })

    it('não apaga o nome quando a Meta manda o perfil vazio', async () => {
      const agora = new Date()
      await upsertContact(tenantId, '5511444444444', 'Duda', agora)
      const depois = await upsertContact(tenantId, '5511444444444', '', agora)
      expect(depois.name).toBe('Duda')
    })
  })

  describe('cadastro de barbearias', () => {
    it('explica quando o número já pertence a outra barbearia', async () => {
      const { upsertTenant } = await import('../db/repositories/tenants.js')
      const { normalizeConfig } = await import('@barbearia/shared/config')
      const config = normalizeConfig({ brand: { name: 'Outra' } })

      // Cenário real: o dono renomeia o slug no .env sem renomear a pasta, e o
      // mesmo phone_number_id acaba disputado por duas barbearias. O erro cru do
      // Postgres não diz nada — este teste garante que a mensagem diz.
      await expect(
        upsertTenant({
          slug: 'barbearia-nova',
          displayName: 'Outra',
          phoneNumberId: '999', // já é da barbearia 't', criada no beforeEach
          wabaId: '',
          accessToken: 'tok',
          ownerPhone: '',
          timezone: 'America/Sao_Paulo',
          config,
        }),
      ).rejects.toThrow(/já está cadastrado na barbearia "t"/)
    })

    it('atualizar a mesma barbearia continua funcionando', async () => {
      const { upsertTenant } = await import('../db/repositories/tenants.js')
      const { normalizeConfig } = await import('@barbearia/shared/config')

      const atualizada = await upsertTenant({
        slug: 't',
        displayName: 'Nome Novo',
        phoneNumberId: '999',
        wabaId: '',
        ownerPhone: '',
        timezone: 'America/Sao_Paulo',
        config: normalizeConfig({ brand: { name: 'Nome Novo' } }),
      })
      expect(atualizada.displayName).toBe('Nome Novo')
    })
  })

  describe('idempotência do webhook', () => {
    it('a mesma mensagem só é atendida uma vez', async () => {
      const primeira = await registerInbound(tenantId, contactId, 'wamid.ABC', 'text', { text: 'oi' })
      const reenvio = await registerInbound(tenantId, contactId, 'wamid.ABC', 'text', { text: 'oi' })

      expect(primeira).toBe(true)
      expect(reenvio).toBe(false)
    })
  })

  describe('fila de mensagens', () => {
    const enfileirar = (dedupeKey: string, scheduledFor: Date, appointmentId?: string) =>
      enqueue({
        tenantId,
        contactId,
        appointmentId: appointmentId ?? null,
        kind: 'lembrete24h',
        payload: { messaging_product: 'whatsapp', to: '5511999999999', type: 'text' },
        scheduledFor,
        dedupeKey,
      })

    it('a mesma chave nunca entra duas vezes', async () => {
      expect(await enfileirar('apt-1:lembrete24h', new Date())).toBe(true)
      // Job rodou de novo, worker reiniciou, deploy repetiu a chamada...
      expect(await enfileirar('apt-1:lembrete24h', new Date())).toBe(false)
    })

    it('só entrega o que já venceu', async () => {
      await enfileirar('venceu', new Date(Date.now() - 60_000))
      await enfileirar('ainda-nao', new Date(Date.now() + 60 * 60_000))

      const lote = await claimDue(10, 'worker-teste')
      expect(lote).toHaveLength(1)
      expect(lote[0]!.attempts).toBe(1)
    })

    it('duas instâncias do worker não pegam a mesma mensagem', async () => {
      await enfileirar('unica', new Date(Date.now() - 60_000))

      const [a, b] = await Promise.all([claimDue(10, 'worker-a'), claimDue(10, 'worker-b')])
      expect(a.length + b.length).toBe(1)
    })

    it('erro temporário volta para a fila com espera maior', async () => {
      await enfileirar('retentar', new Date(Date.now() - 60_000))
      const [item] = await claimDue(1, 'worker-teste')

      await markFailed(item!.id, 'timeout', true, 5)

      const linha = await queryOne<{ status: string; scheduled_for: Date }>(
        'SELECT status, scheduled_for FROM outbox WHERE id = $1',
        [item!.id],
      )
      expect(linha!.status).toBe('pending')
      expect(linha!.scheduled_for.getTime()).toBeGreaterThan(Date.now())
    })

    it('erro definitivo não é retentado', async () => {
      await enfileirar('definitivo', new Date(Date.now() - 60_000))
      const [item] = await claimDue(1, 'worker-teste')

      await markFailed(item!.id, 'template reprovado', false, 5)

      const linha = await queryOne<{ status: string }>('SELECT status FROM outbox WHERE id = $1', [item!.id])
      expect(linha!.status).toBe('failed')
    })

    it('desiste depois de esgotar as tentativas', async () => {
      await enfileirar('desiste', new Date(Date.now() - 60_000))
      const [item] = await claimDue(1, 'worker-teste')

      // attempts já está em 1; com máximo 1, não há retentativa.
      await markFailed(item!.id, 'timeout', true, 1)

      const linha = await queryOne<{ status: string }>('SELECT status FROM outbox WHERE id = $1', [item!.id])
      expect(linha!.status).toBe('failed')
    })

    it('cancelar o corte tira o lembrete da fila antes de ele sair', async () => {
      const agendamento = await marcar('2026-08-22T13:00:00Z')
      await enfileirar(`${agendamento!.id}:lembrete24h`, new Date(Date.now() + 3600_000), agendamento!.id)

      expect(await cancelPendingForAppointment(agendamento!.id)).toBe(1)

      const linha = await queryOne<{ status: string }>(
        'SELECT status FROM outbox WHERE appointment_id = $1',
        [agendamento!.id],
      )
      expect(linha!.status).toBe('skipped')
    })
  })
})
