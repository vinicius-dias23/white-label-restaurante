import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@restaurante/shared/config'
import { isOwner } from '../bot/owner.js'
import { agendaLinha, findStaff, resumoTexto } from '../bot/recepcao.js'
import { makeT } from '../bot/textos.js'
import type { ReservationDetail } from '../db/repositories/reservations.js'
import type { TenantContext } from '../tenants/registry.js'
import type { StaffMember, Tenant } from '../tenants/types.js'

/**
 * Quem é quem na porta de entrada.
 *
 * O `handleInbound` decide o painel pelo telefone de quem escreveu, e errar aqui
 * tem duas caras, as duas ruins: a recepcionista não alcança o painel (e acha
 * que o bot quebrou), ou um desconhecido alcança. O segundo é um vazamento da
 * lista de reservas — nome e telefone de cada cliente da casa.
 */

const colaborador = (name: string, phone: string, sortOrder = 0): StaffMember => ({
  id: `stf-${name}`,
  slug: name.toLowerCase(),
  name,
  phone,
  active: true,
  sortOrder,
})

function fakeCtx(staff: StaffMember[], ownerPhone = ''): TenantContext {
  const tenant = {
    id: 't1',
    slug: 'teste',
    displayName: 'Cantina Teste',
    phoneNumberId: '123',
    wabaId: '456',
    ownerPhone,
    timezone: 'America/Sao_Paulo',
    active: true,
    botPausedUntil: null,
    config: DEFAULT_CONFIG,
  } satisfies Tenant

  return { tenant, staff, areas: [], client: {} } as unknown as TenantContext
}

describe('findStaff', () => {
  it('encontra pelo número, com ou sem máscara', () => {
    const ctx = fakeCtx([colaborador('Giulia', '5511988887766')])
    expect(findStaff(ctx, '5511988887766')?.name).toBe('Giulia')
  })

  /**
   * O caso que morde de verdade em produção: a Meta entrega o `wa_id` de
   * número brasileiro no formato antigo, sem o nono dígito. Sem normalizar os
   * dois lados, a recepcionista escreve e o bot o trata como cliente.
   */
  it('casa o wa_id sem o nono dígito com o número gravado com ele', () => {
    const ctx = fakeCtx([colaborador('Giulia', '5511988887766')])
    expect(findStaff(ctx, '551188887766')?.name).toBe('Giulia')
  })

  it('aceita o número gravado cru, caso o sync ainda não tenha rodado', () => {
    const ctx = fakeCtx([colaborador('Giulia', '(11) 98888-7766')])
    expect(findStaff(ctx, '5511988887766')?.name).toBe('Giulia')
  })

  it('devolve null para quem não é da equipe', () => {
    const ctx = fakeCtx([colaborador('Giulia', '5511988887766')])
    expect(findStaff(ctx, '5511977776655')).toBeNull()
  })

  /**
   * Colaborador sem telefone não pode casar com nada — nem com o número vazio,
   * nem com um `wa_id` que normalize para vazio. Seria o painel da recepção
   * abrindo para um desconhecido.
   */
  it('colaborador sem telefone nunca casa', () => {
    const ctx = fakeCtx([colaborador('Giulia', ''), colaborador('Marco', '')])
    expect(findStaff(ctx, '')).toBeNull()
    expect(findStaff(ctx, '5511988887766')).toBeNull()
  })

  it('não confunde duas pessoas da mesma equipe', () => {
    const ctx = fakeCtx([
      colaborador('Giulia', '5511988887766', 0),
      colaborador('Marco', '5511977776655', 1),
    ])
    expect(findStaff(ctx, '5511977776655')?.name).toBe('Marco')
  })

  it('número repetido cai sempre no mesmo, o primeiro da ordem', () => {
    const ctx = fakeCtx([
      colaborador('Giulia', '5511988887766', 0),
      colaborador('Marco', '5511988887766', 1),
    ])
    expect(findStaff(ctx, '5511988887766')?.name).toBe('Giulia')
  })
})

describe('dono que também recebe na porta', () => {
  /**
   * No restaurante pequeno o dono também fica na recepção, e o mesmo número
   * está nos dois lugares. Os dois casam — e é o `handleInbound` que desempata,
   * testando `isOwner` primeiro. O painel do dono já tem tudo que a recepção
   * tem, então ele não perde nada; o contrário, sim.
   */
  it('casa como dono e como recepção, e o dono é quem vem primeiro no handler', () => {
    const ctx = fakeCtx([colaborador('Zé', '5511988887766')], '5511988887766')
    expect(isOwner(ctx.tenant, '5511988887766')).toBe(true)
    expect(findStaff(ctx, '5511988887766')?.name).toBe('Zé')
  })
})

describe('textos do painel', () => {
  const t = makeT(DEFAULT_CONFIG)
  const TZ = 'America/Sao_Paulo'

  const reserva = (overrides: Partial<ReservationDetail> = {}): ReservationDetail => ({
    id: 'res-1',
    tenantId: 't1',
    contactId: 'c1',
    areaId: 'a1',
    partySize: 4,
    startsAt: new Date('2026-08-21T23:00:00.000Z'), // 20:00 em São Paulo
    endsAt: new Date('2026-08-22T01:00:00.000Z'),
    status: 'scheduled',
    areaName: 'Varanda',
    contactWaId: '5511912345678',
    contactName: 'Marina',
    ...overrides,
  })

  it('a linha da lista traz hora local, cliente, grupo e ambiente', () => {
    const linha = agendaLinha(t, reserva(), TZ)
    expect(linha).toContain('20:00')
    expect(linha).toContain('Marina')
    expect(linha).toContain('4 pessoas')
    expect(linha).toContain('Varanda')
  })

  it('cliente sem nome aparece pelo número', () => {
    expect(agendaLinha(t, reserva({ contactName: '' }), TZ)).toContain('5511912345678')
  })

  it('grupo de uma pessoa não vira "1 pessoas"', () => {
    const linha = agendaLinha(t, reserva({ partySize: 1 }), TZ)
    expect(linha).toContain('1 pessoa')
    expect(linha).not.toContain('1 pessoas')
  })

  it('a linha muda com o status: quem chegou fica diferente de quem faltou', () => {
    const chegou = agendaLinha(t, reserva({ status: 'arrived' }), TZ)
    const faltou = agendaLinha(t, reserva({ status: 'no_show' }), TZ)
    expect(chegou).not.toBe(faltou)
  })

  it('o resumo do período soma reservas, pessoas, presenças e faltas', () => {
    const texto = resumoTexto(t, 'Hoje', { reservas: 12, pessoas: 38, compareceram: 10, faltaram: 1 })
    expect(texto).toContain('Hoje')
    expect(texto).toContain('12')
    expect(texto).toContain('38 pessoas')
    expect(texto).toContain('10')
  })
})
