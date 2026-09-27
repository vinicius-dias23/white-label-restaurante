import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig, type SiteConfig } from '@barbearia/shared/config'
import { paraGravar } from '../studio/conteudo.js'
import { resolveSlugs } from '../tenants/slug.js'

/**
 * O que este teste protege: a identidade dos itens do catálogo.
 *
 * O slug é a ponte entre o config e as linhas de `services` e `barbers` — e
 * `appointments` aponta para elas. Se o estúdio deixar o slug mudar num
 * renomear, o serviço vira outro, o antigo é desativado e o histórico do
 * cliente passa a falar de um serviço que sumiu do menu.
 */

const mudanca = (recebido: object, config: SiteConfig = DEFAULT_CONFIG, bruto = {}) =>
  Object.fromEntries(
    paraGravar(recebido, config, bruto).map(({ caminho, valor }) => [caminho.join('.'), valor]),
  )

describe('resolveSlugs', () => {
  it('respeita o slug já fixado e deriva só o que falta', () => {
    expect(
      resolveSlugs([
        { slug: 'corte-barba', name: 'Corte + Barba Premium' },
        { slug: '', name: 'Pezinho' },
      ]),
    ).toEqual(['corte-barba', 'pezinho'])
  })

  it('não rouba o slug de quem já o fixou', () => {
    // O segundo item derivaria "pezinho", que já é de outro — vai para -2.
    expect(
      resolveSlugs([
        { slug: 'pezinho', name: 'Outra coisa' },
        { slug: '', name: 'Pezinho' },
      ]),
    ).toEqual(['pezinho', 'pezinho-2'])
  })

  it('desempata nomes iguais sem slug', () => {
    expect(
      resolveSlugs([
        { slug: '', name: 'Corte' },
        { slug: '', name: 'Corte' },
      ]),
    ).toEqual(['corte', 'corte-2'])
  })
})

describe('paraGravar — serviços', () => {
  it('carimba o slug do serviço novo a partir do nome', () => {
    const { services } = mudanca({ services: [{ slug: '', name: 'Pezinho', price: 'R$ 20' }] })
    expect(services).toEqual([
      expect.objectContaining({ slug: 'pezinho', name: 'Pezinho', price: 'R$ 20' }),
    ])
  })

  it('renomear NÃO mexe no slug — é o mesmo serviço no banco', () => {
    const { services } = mudanca({
      services: [{ slug: 'corte-barba', name: 'Corte + Barba Premium', price: 'R$ 89' }],
    })
    expect(services).toEqual([
      expect.objectContaining({ slug: 'corte-barba', name: 'Corte + Barba Premium' }),
    ])
  })

  it('descarta o item sem nome, em vez de gravar um serviço fantasma', () => {
    const { services } = mudanca({ services: [{ slug: '', name: '   ', price: 'R$ 10' }] })
    expect(services).toEqual([])
  })

  it('não deixa dois serviços com o mesmo slug', () => {
    const { services } = mudanca({
      services: [
        { slug: 'corte', name: 'Corte' },
        { slug: '', name: 'Corte' },
      ],
    })
    expect((services as { slug: string }[]).map((s) => s.slug)).toEqual(['corte', 'corte-2'])
  })
})

describe('paraGravar — seções preservadas', () => {
  it('mexe só nos campos do estúdio e mantém o resto do JSON como estava', () => {
    const bruto = {
      contact: { whatsapp: '11999', address: 'Rua A', social: { instagram: '@barbearia' } },
    }
    const { contact } = mudanca({ contact: { address: 'Rua B' } }, DEFAULT_CONFIG, bruto)

    // O "@" do Instagram é do arquivo, não do estúdio: sai intacto.
    expect(contact).toEqual(
      expect.objectContaining({ address: 'Rua B', social: { instagram: '@barbearia' } }),
    )
  })

  it('não devolve seção que o dono não mandou', () => {
    expect(Object.keys(mudanca({ services: [] }))).toEqual(['services'])
  })

  it('grava as horas do painel do dono, e o normalize as aceita', () => {
    const { whatsapp } = mudanca({
      whatsapp: { owner: { pauseMinutes: 30, afternoonStartHour: 13, eveningStartHour: 19 } },
    })
    const config = normalizeConfig({ whatsapp })
    expect(config.whatsapp.owner).toEqual({
      phones: [],
      pauseMinutes: 30,
      afternoonStartHour: 13,
      eveningStartHour: 19,
    })
  })

  /**
   * Os telefones do painel, que o estúdio passou a editar.
   *
   * O risco que estes três testes cobrem é o mesmo: o objeto `owner` é montado
   * campo a campo no `paraGravar`, sem o `secaoBruta` que protege as outras
   * seções. Um campo esquecido ali não dá erro — ele simplesmente some do
   * arquivo no primeiro Salvar, e o dono perde o acesso ao próprio painel.
   */
  it('grava os telefones do dono e mantém a ordem (o primeiro recebe os avisos)', () => {
    const { whatsapp } = mudanca({
      whatsapp: { owner: { phones: ['(11) 91111-1111', '(11) 92222-2222'] } },
    })
    expect((whatsapp as { owner: { phones: string[] } }).owner.phones).toEqual([
      '(11) 91111-1111',
      '(11) 92222-2222',
    ])
  })

  it('não deixa um Salvar da aba de atendimento apagar os telefones do dono', () => {
    const atual = normalizeConfig({ whatsapp: { owner: { phones: ['(11) 91111-1111'] } } })
    // A UI manda a seção inteira; o que importa é que `phones` sobreviva ao
    // round-trip completo, arquivo → normalize → arquivo.
    const { whatsapp } = mudanca({ whatsapp: { owner: { phones: ['(11) 91111-1111'] } } }, atual)
    expect(normalizeConfig({ whatsapp }).whatsapp.owner.phones).toEqual(['(11) 91111-1111'])
  })

  it('descarta número vazio da lista do dono', () => {
    const { whatsapp } = mudanca({ whatsapp: { owner: { phones: ['', '  ', '(11) 93333-3333'] } } })
    expect((whatsapp as { owner: { phones: string[] } }).owner.phones).toEqual(['(11) 93333-3333'])
  })

  it('grava o telefone do barbeiro cru, do jeito que foi digitado', () => {
    const { team } = mudanca({
      team: [{ slug: 'rafael', name: 'Rafael', phone: '(11) 98888-7766' }],
    })
    expect((team as { phone: string }[])[0]!.phone).toBe('(11) 98888-7766')
  })

  it('barbeiro sem telefone continua válido — ele só não tem painel', () => {
    const { team } = mudanca({ team: [{ slug: 'rafael', name: 'Rafael' }] })
    expect((team as { phone: string }[])[0]!.phone).toBe('')
  })

  it('dia sem faixa nenhuma é fechado, e não o padrão de volta', () => {
    const { hours } = mudanca({ hours: { mon: [], tue: [['09:00', '18:00']] } })
    expect((hours as Record<string, unknown[]>).mon).toEqual([])
    expect((hours as Record<string, unknown[]>).tue).toEqual([['09:00', '18:00']])
  })
})
