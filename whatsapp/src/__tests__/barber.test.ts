import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@barbearia/shared/config'
import { findBarber } from '../bot/barber.js'
import { isOwner } from '../bot/owner.js'
import type { TenantContext } from '../tenants/registry.js'
import type { Barber, Tenant } from '../tenants/types.js'

/**
 * Quem é quem na porta de entrada.
 *
 * O `handleInbound` decide o painel pelo telefone de quem escreveu, e erra aqui
 * tem duas caras, as duas ruins: o barbeiro não alcança o painel dele (e acha
 * que o bot quebrou), ou alcança o painel de outra pessoa. O segundo é um
 * vazamento da agenda e da carteira de clientes do colega.
 */

const barbeiro = (name: string, phone: string, sortOrder = 0): Barber => ({
  id: `brb-${name}`,
  slug: name.toLowerCase(),
  name,
  phone,
  active: true,
  sortOrder,
})

function fakeCtx(barbers: Barber[], ownerPhone = ''): TenantContext {
  const tenant = {
    id: 't1',
    slug: 'teste',
    displayName: 'Barbearia Teste',
    phoneNumberId: '123',
    wabaId: '456',
    ownerPhone,
    timezone: 'America/Sao_Paulo',
    active: true,
    botPausedUntil: null,
    config: DEFAULT_CONFIG,
  } satisfies Tenant

  return { tenant, barbers, services: [], client: {} } as unknown as TenantContext
}

describe('findBarber', () => {
  it('encontra pelo número, com ou sem máscara', () => {
    const ctx = fakeCtx([barbeiro('Rafael', '5511988887766')])
    expect(findBarber(ctx, '5511988887766')?.name).toBe('Rafael')
  })

  /**
   * O caso que morde de verdade em produção: a Meta entrega o `wa_id` de
   * número brasileiro no formato antigo, sem o nono dígito. Sem normalizar os
   * dois lados, o barbeiro escreve e o bot o trata como cliente.
   */
  it('casa o wa_id sem o nono dígito com o número gravado com ele', () => {
    const ctx = fakeCtx([barbeiro('Rafael', '5511988887766')])
    expect(findBarber(ctx, '551188887766')?.name).toBe('Rafael')
  })

  it('aceita o número gravado cru, caso o sync ainda não tenha rodado', () => {
    const ctx = fakeCtx([barbeiro('Rafael', '(11) 98888-7766')])
    expect(findBarber(ctx, '5511988887766')?.name).toBe('Rafael')
  })

  it('devolve null para quem não é da equipe', () => {
    const ctx = fakeCtx([barbeiro('Rafael', '5511988887766')])
    expect(findBarber(ctx, '5511977776655')).toBeNull()
  })

  /**
   * Barbeiro sem telefone não pode casar com nada — nem com o número vazio, nem
   * com um `wa_id` que normalize para vazio. Seria o painel dele abrindo para
   * um desconhecido.
   */
  it('barbeiro sem telefone nunca casa', () => {
    const ctx = fakeCtx([barbeiro('Rafael', ''), barbeiro('Diego', '')])
    expect(findBarber(ctx, '')).toBeNull()
    expect(findBarber(ctx, '5511988887766')).toBeNull()
  })

  it('não confunde dois barbeiros da mesma equipe', () => {
    const ctx = fakeCtx([
      barbeiro('Rafael', '5511988887766', 0),
      barbeiro('Diego', '5511977776655', 1),
    ])
    expect(findBarber(ctx, '5511977776655')?.name).toBe('Diego')
  })

  it('número repetido cai sempre no mesmo, o primeiro da ordem', () => {
    const ctx = fakeCtx([
      barbeiro('Rafael', '5511988887766', 0),
      barbeiro('Diego', '5511988887766', 1),
    ])
    expect(findBarber(ctx, '5511988887766')?.name).toBe('Rafael')
  })
})

describe('dono que também corta', () => {
  /**
   * Na barbearia pequena o dono é um dos barbeiros, e o mesmo número está nos
   * dois lugares. Os dois casam — e é o `handleInbound` que desempata, testando
   * `isOwner` primeiro. O painel do dono já mostra a agenda da casa inteira,
   * então ele não perde nada; o contrário, sim.
   */
  it('casa como dono e como barbeiro, e o dono é quem vem primeiro no handler', () => {
    const ctx = fakeCtx([barbeiro('Zé', '5511988887766')], '5511988887766')
    expect(isOwner(ctx.tenant, '5511988887766')).toBe(true)
    expect(findBarber(ctx, '5511988887766')?.name).toBe('Zé')
  })
})
