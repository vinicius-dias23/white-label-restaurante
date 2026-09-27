import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../env.js'
import { closePool, query, queryOne } from '../db/pool.js'
import { migrate } from '../db/migrate.js'
import {
  agendaBetween,
  busyIntervals,
  cortesDoBarbeiro,
  createAppointment,
  createTimeBlock,
} from '../db/repositories/appointments.js'
import { listBarbers } from '../db/repositories/tenants.js'

/**
 * O painel do barbeiro, contra o banco de verdade.
 *
 * O que está em jogo aqui não é formatação de mensagem: é o recorte dos dados.
 * Um `WHERE` sem o `barber_id` faz o painel de um barbeiro listar os clientes
 * do colega — nome, horário e serviço. Isso não aparece em teste de unidade com
 * banco fingido, e em produção só aparece quando alguém reclama.
 *
 * Rodam só com DATABASE_URL_TEST preenchida no .env. Sem ela, são pulados.
 */

const temBanco = Boolean(env.databaseUrl)

describe.skipIf(!temBanco)('painel do barbeiro', () => {
  let tenantId: string
  let rafaelId: string
  let diegoId: string
  let serviceId: string
  let joaoId: string
  let pedroId: string

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

    rafaelId = (await queryOne<{ id: string }>(
      `INSERT INTO barbers (tenant_id, slug, name, phone) VALUES ($1, 'rafael', 'Rafael', '5511988887766') RETURNING id`,
      [tenantId],
    ))!.id

    diegoId = (await queryOne<{ id: string }>(
      `INSERT INTO barbers (tenant_id, slug, name, phone) VALUES ($1, 'diego', 'Diego', '5511977776655') RETURNING id`,
      [tenantId],
    ))!.id

    serviceId = (await queryOne<{ id: string }>(
      `INSERT INTO services (tenant_id, slug, name, duration_min) VALUES ($1, 'corte', 'Corte', 40) RETURNING id`,
      [tenantId],
    ))!.id

    joaoId = (await queryOne<{ id: string }>(
      `INSERT INTO contacts (tenant_id, wa_id, name) VALUES ($1, '5511900000001', 'João') RETURNING id`,
      [tenantId],
    ))!.id

    pedroId = (await queryOne<{ id: string }>(
      `INSERT INTO contacts (tenant_id, wa_id, name) VALUES ($1, '5511900000002', 'Pedro') RETURNING id`,
      [tenantId],
    ))!.id
  })

  const marcar = (startsAt: string, barberId: string, contactId: string) =>
    createAppointment({
      tenantId,
      contactId,
      barberId,
      serviceId,
      startsAt: at(startsAt),
      endsAt: new Date(at(startsAt).getTime() + 40 * 60_000),
    })

  const concluir = (startsAt: string, barberId: string, status = 'completed') =>
    query(
      `INSERT INTO appointments (tenant_id, contact_id, barber_id, service_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantId,
        joaoId,
        barberId,
        serviceId,
        at(startsAt),
        new Date(at(startsAt).getTime() + 40 * 60_000),
        status,
      ],
    )

  // -------------------------------------------------------------------------

  describe('a agenda de cada um é só dela', () => {
    it('NÃO mostra ao barbeiro o cliente do colega', async () => {
      await marcar('2026-08-22T13:00:00Z', rafaelId, joaoId)
      await marcar('2026-08-22T15:00:00Z', diegoId, pedroId)

      const doRafael = await agendaBetween(
        tenantId,
        at('2026-08-22T00:00:00Z'),
        at('2026-08-23T00:00:00Z'),
        rafaelId,
      )

      expect(doRafael).toHaveLength(1)
      expect(doRafael[0]!.contactName).toBe('João')
      // O teste que importa: o cliente do Diego não pode aparecer aqui.
      expect(doRafael.map((a) => a.contactName)).not.toContain('Pedro')
    })

    it('sem barbeiro informado, continua trazendo a barbearia inteira (menu do dono)', async () => {
      await marcar('2026-08-22T13:00:00Z', rafaelId, joaoId)
      await marcar('2026-08-22T15:00:00Z', diegoId, pedroId)

      const daCasa = await agendaBetween(
        tenantId,
        at('2026-08-22T00:00:00Z'),
        at('2026-08-23T00:00:00Z'),
      )

      expect(daCasa).toHaveLength(2)
    })
  })

  describe('cortes do barbeiro', () => {
    const janelas = {
      ontem: at('2026-08-21T03:00:00Z'),
      hoje: at('2026-08-22T03:00:00Z'),
      amanha: at('2026-08-23T03:00:00Z'),
      mes: at('2026-08-01T03:00:00Z'),
    }

    it('conta hoje, ontem e o mês, só os dele', async () => {
      await concluir('2026-08-22T13:00:00Z', rafaelId) // hoje
      await concluir('2026-08-21T13:00:00Z', rafaelId) // ontem
      await concluir('2026-08-05T13:00:00Z', rafaelId) // no mês
      await concluir('2026-08-22T17:00:00Z', diegoId) // do colega, não conta

      expect(await cortesDoBarbeiro(tenantId, rafaelId, janelas)).toEqual({
        hoje: 1,
        ontem: 1,
        mes: 3,
      })
    })

    it('ignora cancelado e no-show', async () => {
      await concluir('2026-08-22T13:00:00Z', rafaelId, 'cancelled')
      await concluir('2026-08-22T14:00:00Z', rafaelId, 'no_show')

      expect(await cortesDoBarbeiro(tenantId, rafaelId, janelas)).toEqual({
        hoje: 0,
        ontem: 0,
        mes: 0,
      })
    })

    /**
     * O `completed` só é carimbado pelo job diário, de manhã. Sem contar também
     * o que já terminou e continua `confirmed`, o barbeiro olharia os próprios
     * números às 18h e veria zero.
     */
    it('conta o corte que já terminou mesmo antes de o job diário carimbar', async () => {
      await concluir('2026-08-22T13:00:00Z', rafaelId, 'confirmed')

      const { mes } = await cortesDoBarbeiro(tenantId, rafaelId, {
        ...janelas,
        // "amanhã" no futuro para a janela pegar o registro; o now() do SQL é
        // quem decide se ele já terminou.
        amanha: at('2099-01-01T00:00:00Z'),
      })
      expect(mes).toBe(1)
    })

    it('devolve zeros para quem não atendeu ninguém', async () => {
      expect(await cortesDoBarbeiro(tenantId, diegoId, janelas)).toEqual({
        hoje: 0,
        ontem: 0,
        mes: 0,
      })
    })
  })

  describe('folga', () => {
    it('fecha a agenda de um sem fechar a do outro', async () => {
      await createTimeBlock(
        tenantId,
        rafaelId,
        at('2026-08-22T12:00:00Z'),
        at('2026-08-23T00:00:00Z'),
        'folga de Rafael',
      )

      const rafael = await busyIntervals(
        tenantId,
        rafaelId,
        at('2026-08-22T00:00:00Z'),
        at('2026-08-23T00:00:00Z'),
      )
      const diego = await busyIntervals(
        tenantId,
        diegoId,
        at('2026-08-22T00:00:00Z'),
        at('2026-08-23T00:00:00Z'),
      )

      expect(rafael).toHaveLength(1)
      // A barbearia continua aberta com o Diego: é o que separa a folga do
      // bloqueio do dono, que passa barber_id nulo e fecha para todo mundo.
      expect(diego).toHaveLength(0)
    })
  })

  describe('telefone da equipe', () => {
    it('chega ao contexto do bot pelo listBarbers', async () => {
      const barbeiros = await listBarbers(tenantId)
      expect(barbeiros.find((b) => b.slug === 'rafael')?.phone).toBe('5511988887766')
      expect(barbeiros.find((b) => b.slug === 'diego')?.phone).toBe('5511977776655')
    })
  })
})
