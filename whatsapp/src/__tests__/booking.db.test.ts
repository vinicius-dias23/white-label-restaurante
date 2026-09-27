import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../env.js'
import { closePool, query, queryOne } from '../db/pool.js'
import { migrate } from '../db/migrate.js'
import {
  agendaBetween,
  approveReservation,
  areaOccupancy,
  cancelReservation,
  createReservation,
  createTimeBlock,
  declineReservation,
  listPending,
  listUpcomingByContact,
  markArrival,
  markPastAsCompleted,
  resumo,
} from '../db/repositories/reservations.js'
import { isWithinServiceWindow, upsertContact } from '../db/repositories/contacts.js'
import { cancelPendingForReservation, claimDue, enqueue, markFailed } from '../db/repositories/outbox.js'
import { registerInbound } from '../db/repositories/messages.js'

/**
 * Testes que precisam de Postgres de verdade.
 *
 * A trava da lotação não tem como ser testada com banco fingido: é o
 * `SELECT ... FOR UPDATE` no ambiente que põe na fila duas pessoas disputando
 * o último lugar, e é justamente isso que precisa ser provado — dois clientes
 * confirmando a mesma mesa no mesmo instante.
 *
 * Rodam só com DATABASE_URL_TEST preenchida no .env:
 *
 *   docker compose up -d
 *   psql -h localhost -U restaurante -c "CREATE DATABASE restaurante_test"
 *   npm test
 *
 * Sem ela, são pulados e o resto da suíte roda normalmente.
 */

const temBanco = Boolean(env.databaseUrl)

describe.skipIf(!temBanco)('banco de dados', () => {
  let tenantId: string
  let salaoId: string
  let varandaId: string
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

    salaoId = (await queryOne<{ id: string }>(
      `INSERT INTO areas (tenant_id, slug, name, capacity) VALUES ($1, 'salao', 'Salão', 20) RETURNING id`,
      [tenantId],
    ))!.id

    varandaId = (await queryOne<{ id: string }>(
      `INSERT INTO areas (tenant_id, slug, name, capacity) VALUES ($1, 'varanda', 'Varanda', 10) RETURNING id`,
      [tenantId],
    ))!.id

    contactId = (await queryOne<{ id: string }>(
      `INSERT INTO contacts (tenant_id, wa_id, name) VALUES ($1, '5511999999999', 'João') RETURNING id`,
      [tenantId],
    ))!.id
  })

  const reservar = (
    startsAt: string,
    partySize: number,
    opcoes: { areaId?: string; minutos?: number; status?: 'pending' | 'scheduled' } = {},
  ) =>
    createReservation({
      tenantId,
      contactId,
      areaId: opcoes.areaId ?? salaoId,
      partySize,
      startsAt: at(startsAt),
      endsAt: new Date(at(startsAt).getTime() + (opcoes.minutos ?? 120) * 60_000),
      status: opcoes.status ?? 'scheduled',
    })

  // -------------------------------------------------------------------------

  describe('lotação do ambiente', () => {
    it('reserva uma mesa com lugar livre', async () => {
      const criada = await reservar('2026-08-22T23:00:00Z', 4)
      expect(criada).not.toBeNull()
      expect(criada!.status).toBe('scheduled')
      expect(criada!.partySize).toBe(4)
    })

    it('aceita vários grupos no mesmo horário até encher', async () => {
      expect(await reservar('2026-08-22T23:00:00Z', 8)).not.toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 8)).not.toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 4)).not.toBeNull() // 20/20
      expect(await reservar('2026-08-22T23:00:00Z', 1)).toBeNull()
    })

    it('RECUSA o grupo que passaria da lotação em qualquer momento da mesa', async () => {
      expect(await reservar('2026-08-22T23:00:00Z', 16)).not.toBeNull()
      // Começa 1h depois, mas ainda encontra os 16 sentados.
      expect(await reservar('2026-08-23T00:00:00Z', 6)).toBeNull()
      // Começa antes e atravessa a chegada deles.
      expect(await reservar('2026-08-22T22:00:00Z', 6)).toBeNull()
      // Cabe exatamente.
      expect(await reservar('2026-08-23T00:00:00Z', 4)).not.toBeNull()
    })

    it('a mesa seguinte começa no minuto em que a anterior termina', async () => {
      expect(await reservar('2026-08-22T21:00:00Z', 20)).not.toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 20)).not.toBeNull()
    })

    it('um ambiente cheio não afeta o outro', async () => {
      expect(await reservar('2026-08-22T23:00:00Z', 20)).not.toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 10, { areaId: varandaId })).not.toBeNull()
    })

    it('dois clientes disputando o último lugar: um entra, o outro não', async () => {
      await reservar('2026-08-22T23:00:00Z', 16)
      const [a, b] = await Promise.all([
        reservar('2026-08-22T23:00:00Z', 4),
        reservar('2026-08-22T23:00:00Z', 4),
      ])
      expect([a, b].filter(Boolean)).toHaveLength(1)
    })

    it('pedido pendente segura os lugares enquanto o dono decide', async () => {
      expect(await reservar('2026-08-22T23:00:00Z', 15, { status: 'pending' })).not.toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 6)).toBeNull()
    })

    it('cancelar libera os lugares na hora', async () => {
      const criada = await reservar('2026-08-22T23:00:00Z', 20)
      expect(await reservar('2026-08-22T23:00:00Z', 2)).toBeNull()

      await cancelReservation(criada!.id, 'teste')

      expect(await reservar('2026-08-22T23:00:00Z', 2)).not.toBeNull()
    })

    it('cancelar duas vezes não gera dois avisos ao dono', async () => {
      const criada = await reservar('2026-08-22T23:00:00Z', 2)
      expect(await cancelReservation(criada!.id, 'teste')).not.toBeNull()
      // Cliente tocou duas vezes no botão.
      expect(await cancelReservation(criada!.id, 'teste')).toBeNull()
    })

    it('bloqueio do restaurante inteiro recusa a reserva', async () => {
      await createTimeBlock(tenantId, null, at('2026-08-22T22:00:00Z'), at('2026-08-23T03:00:00Z'), 'evento')
      expect(await reservar('2026-08-22T23:00:00Z', 2)).toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 2, { areaId: varandaId })).toBeNull()
    })

    it('bloqueio de um ambiente não fecha o outro', async () => {
      await createTimeBlock(tenantId, varandaId, at('2026-08-22T22:00:00Z'), at('2026-08-23T03:00:00Z'), 'chuva')
      expect(await reservar('2026-08-22T23:00:00Z', 2, { areaId: varandaId })).toBeNull()
      expect(await reservar('2026-08-22T23:00:00Z', 2)).not.toBeNull()
    })
  })

  describe('ocupação e listas', () => {
    it('junta reservas e bloqueios do ambiente', async () => {
      await reservar('2026-08-22T23:00:00Z', 4)
      await createTimeBlock(tenantId, null, at('2026-08-22T15:00:00Z'), at('2026-08-22T17:00:00Z'), 'folga')
      await createTimeBlock(tenantId, varandaId, at('2026-08-22T18:00:00Z'), at('2026-08-22T19:00:00Z'), 'chuva')

      const salao = await areaOccupancy(tenantId, salaoId, at('2026-08-22T00:00:00Z'), at('2026-08-23T06:00:00Z'))
      expect(salao.reservations).toEqual([expect.objectContaining({ partySize: 4 })])
      expect(salao.blocks).toHaveLength(1) // só o do restaurante inteiro
    })

    it('lista só as reservas futuras do cliente, com o nome do ambiente', async () => {
      await reservar('2020-01-01T23:00:00Z', 2) // passado
      await reservar('2026-08-22T23:00:00Z', 4, { areaId: varandaId }) // futuro

      const futuras = await listUpcomingByContact(contactId, at('2026-08-01T00:00:00Z'))
      expect(futuras).toHaveLength(1)
      expect(futuras[0]!.areaName).toBe('Varanda')
      expect(futuras[0]!.contactName).toBe('João')
    })
  })

  describe('grupo grande: aprovação do dono', () => {
    it('aprovar tira de pendente e mantém os lugares', async () => {
      const pedido = await reservar('2026-08-22T23:00:00Z', 12, { status: 'pending' })
      expect(await listPending(tenantId, at('2026-08-01T00:00:00Z'))).toHaveLength(1)

      const aprovada = await approveReservation(tenantId, pedido!.id)
      expect(aprovada!.status).toBe('scheduled')
      expect(await listPending(tenantId, at('2026-08-01T00:00:00Z'))).toHaveLength(0)
    })

    it('recusar devolve os lugares', async () => {
      const pedido = await reservar('2026-08-22T23:00:00Z', 15, { status: 'pending' })
      expect(await reservar('2026-08-22T23:00:00Z', 6)).toBeNull()

      expect((await declineReservation(tenantId, pedido!.id))!.status).toBe('declined')
      expect(await reservar('2026-08-22T23:00:00Z', 6)).not.toBeNull()
    })

    it('decidir duas vezes não faz nada na segunda', async () => {
      const pedido = await reservar('2026-08-22T23:00:00Z', 12, { status: 'pending' })
      expect(await approveReservation(tenantId, pedido!.id)).not.toBeNull()
      expect(await approveReservation(tenantId, pedido!.id)).toBeNull()
      expect(await declineReservation(tenantId, pedido!.id)).toBeNull()
    })

    it('aprovar um pedido que o cliente já cancelou não ressuscita nada', async () => {
      const pedido = await reservar('2026-08-22T23:00:00Z', 12, { status: 'pending' })
      await cancelReservation(pedido!.id, 'desistiu')
      expect(await approveReservation(tenantId, pedido!.id)).toBeNull()
    })

    it('o id de outro restaurante não aprova nada', async () => {
      const pedido = await reservar('2026-08-22T23:00:00Z', 12, { status: 'pending' })
      const outro = (await queryOne<{ id: string }>(
        `INSERT INTO tenants (slug, display_name, phone_number_id) VALUES ('o', 'Outro', '888') RETURNING id`,
      ))!.id
      expect(await approveReservation(outro, pedido!.id)).toBeNull()
    })

    it('pedido sem resposta que passou da hora é recusado pelo job diário', async () => {
      const pedido = await reservar('2026-08-22T23:00:00Z', 12, { status: 'pending' })
      await markPastAsCompleted(tenantId, at('2026-08-23T12:00:00Z'))
      const linha = await queryOne<{ status: string }>('SELECT status FROM reservations WHERE id = $1', [pedido!.id])
      expect(linha!.status).toBe('declined')
    })
  })

  describe('recepção: chegadas e resumo', () => {
    it('marca chegada e falta, e dá para corrigir', async () => {
      const criada = await reservar('2026-08-22T23:00:00Z', 4)
      expect((await markArrival(tenantId, criada!.id, false))!.status).toBe('no_show')
      expect((await markArrival(tenantId, criada!.id, true))!.status).toBe('arrived')
    })

    it('não marca reserva cancelada nem de outro restaurante', async () => {
      const criada = await reservar('2026-08-22T23:00:00Z', 4)
      const outro = (await queryOne<{ id: string }>(
        `INSERT INTO tenants (slug, display_name, phone_number_id) VALUES ('o', 'Outro', '888') RETURNING id`,
      ))!.id
      expect(await markArrival(outro, criada!.id, true)).toBeNull()

      await cancelReservation(criada!.id, 'teste')
      expect(await markArrival(tenantId, criada!.id, true)).toBeNull()
    })

    it('a lista do dia traz quem chegou e quem faltou, mas não os cancelados', async () => {
      const a = await reservar('2026-08-22T23:00:00Z', 4)
      const b = await reservar('2026-08-22T23:30:00Z', 2)
      const c = await reservar('2026-08-23T00:00:00Z', 2)
      await markArrival(tenantId, a!.id, true)
      await markArrival(tenantId, b!.id, false)
      await cancelReservation(c!.id, 'teste')

      const dia = await agendaBetween(tenantId, at('2026-08-22T03:00:00Z'), at('2026-08-23T03:00:00Z'))
      expect(dia.map((r) => r.status)).toEqual(['arrived', 'no_show'])
    })

    it('o resumo soma reservas, pessoas, presenças e faltas por período', async () => {
      const a = await reservar('2026-08-22T23:00:00Z', 4)
      const b = await reservar('2026-08-22T23:30:00Z', 2)
      await reservar('2026-08-21T23:00:00Z', 6) // ontem
      await reservar('2026-08-22T23:00:00Z', 10, { status: 'pending' }) // pendente não entra
      await markArrival(tenantId, a!.id, true)
      await markArrival(tenantId, b!.id, false)

      const r = await resumo(tenantId, {
        ontem: at('2026-08-21T03:00:00Z'),
        hoje: at('2026-08-22T03:00:00Z'),
        amanha: at('2026-08-23T03:00:00Z'),
        semana: at('2026-08-17T03:00:00Z'),
        mes: at('2026-08-01T03:00:00Z'),
      })
      expect(r.hoje).toEqual({ reservas: 2, pessoas: 6, compareceram: 1, faltaram: 1 })
      expect(r.ontem).toMatchObject({ reservas: 1, pessoas: 6 })
      expect(r.semana).toMatchObject({ reservas: 3, pessoas: 12 })
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

  describe('cadastro de restaurantes', () => {
    it('explica quando o número já pertence a outro restaurante', async () => {
      const { upsertTenant } = await import('../db/repositories/tenants.js')
      const { normalizeConfig } = await import('@restaurante/shared/config')
      const config = normalizeConfig({ brand: { name: 'Outra' } })

      // Cenário real: o dono renomeia o slug no .env sem renomear a pasta, e o
      // mesmo phone_number_id acaba disputado por dois restaurantes. O erro cru do
      // Postgres não diz nada — este teste garante que a mensagem diz.
      await expect(
        upsertTenant({
          slug: 'restaurante-novo',
          displayName: 'Outra',
          phoneNumberId: '999', // já é do restaurante 't', criada no beforeEach
          wabaId: '',
          accessToken: 'tok',
          ownerPhone: '',
          timezone: 'America/Sao_Paulo',
          config,
        }),
      ).rejects.toThrow(/já está cadastrado no restaurante "t"/)
    })

    it('atualizar o mesmo restaurante continua funcionando', async () => {
      const { upsertTenant } = await import('../db/repositories/tenants.js')
      const { normalizeConfig } = await import('@restaurante/shared/config')

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
    const enfileirar = (dedupeKey: string, scheduledFor: Date, reservationId?: string) =>
      enqueue({
        tenantId,
        contactId,
        reservationId: reservationId ?? null,
        kind: 'lembrete24h',
        payload: { messaging_product: 'whatsapp', to: '5511999999999', type: 'text' },
        scheduledFor,
        dedupeKey,
      })

    it('a mesma chave nunca entra duas vezes', async () => {
      expect(await enfileirar('res-1:lembrete24h', new Date())).toBe(true)
      // Job rodou de novo, worker reiniciou, deploy repetiu a chamada...
      expect(await enfileirar('res-1:lembrete24h', new Date())).toBe(false)
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

    it('cancelar a reserva tira o lembrete da fila antes de ele sair', async () => {
      const reserva = await reservar('2026-08-22T23:00:00Z', 2)
      await enfileirar(`${reserva!.id}:lembrete24h`, new Date(Date.now() + 3600_000), reserva!.id)

      expect(await cancelPendingForReservation(reserva!.id)).toBe(1)

      const linha = await queryOne<{ status: string }>(
        'SELECT status FROM outbox WHERE reservation_id = $1',
        [reserva!.id],
      )
      expect(linha!.status).toBe('skipped')
    })
  })
})
