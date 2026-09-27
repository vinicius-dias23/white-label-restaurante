import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig, type SiteConfig } from '@restaurante/shared/config'
import { paraGravar } from '../studio/conteudo.js'
import { resolveSlugs } from '../tenants/slug.js'

/**
 * O que este teste protege: a identidade dos itens do catálogo.
 *
 * O slug é a ponte entre o config e as linhas de `areas` e `staff` — e
 * `reservations` aponta para os ambientes. Se o estúdio deixar o slug mudar
 * num renomear, o ambiente vira outro, o antigo é desativado e as reservas já
 * feitas passam a apontar para um ambiente que sumiu do menu.
 */

const mudanca = (recebido: object, config: SiteConfig = DEFAULT_CONFIG, bruto = {}) =>
  Object.fromEntries(
    paraGravar(recebido, config, bruto).map(({ caminho, valor }) => [caminho.join('.'), valor]),
  )

describe('resolveSlugs', () => {
  it('respeita o slug já fixado e deriva só o que falta', () => {
    expect(
      resolveSlugs([
        { slug: 'salao', name: 'Salão Principal' },
        { slug: '', name: 'Varanda' },
      ]),
    ).toEqual(['salao', 'varanda'])
  })

  it('não rouba o slug de quem já o fixou', () => {
    // O segundo item derivaria "varanda", que já é de outro — vai para -2.
    expect(
      resolveSlugs([
        { slug: 'varanda', name: 'Outra coisa' },
        { slug: '', name: 'Varanda' },
      ]),
    ).toEqual(['varanda', 'varanda-2'])
  })

  it('desempata nomes iguais sem slug', () => {
    expect(
      resolveSlugs([
        { slug: '', name: 'Salão' },
        { slug: '', name: 'Salão' },
      ]),
    ).toEqual(['salao', 'salao-2'])
  })
})

describe('paraGravar — ambientes', () => {
  it('carimba o slug do ambiente novo a partir do nome', () => {
    const { areas } = mudanca({ areas: [{ slug: '', name: 'Varanda', capacity: 20 }] })
    expect(areas).toEqual([
      expect.objectContaining({ slug: 'varanda', name: 'Varanda', capacity: 20, bookable: true }),
    ])
  })

  it('renomear NÃO mexe no slug — é o mesmo ambiente no banco', () => {
    const { areas } = mudanca({
      areas: [{ slug: 'salao', name: 'Salão Principal', capacity: 50 }],
    })
    expect(areas).toEqual([expect.objectContaining({ slug: 'salao', name: 'Salão Principal' })])
  })

  it('descarta o item sem nome, em vez de gravar um ambiente fantasma', () => {
    const { areas } = mudanca({ areas: [{ slug: '', name: '   ', capacity: 10 }] })
    expect(areas).toEqual([])
  })

  it('não deixa dois ambientes com o mesmo slug', () => {
    const { areas } = mudanca({
      areas: [
        { slug: 'salao', name: 'Salão' },
        { slug: '', name: 'Salão' },
      ],
    })
    expect((areas as { slug: string }[]).map((a) => a.slug)).toEqual(['salao', 'salao-2'])
  })

  it('lotação inválida vira 0 em vez de número negativo', () => {
    const { areas } = mudanca({ areas: [{ slug: 'adega', name: 'Adega', capacity: -5 }] })
    expect((areas as { capacity: number }[])[0]!.capacity).toBe(0)
  })
})

describe('paraGravar — cardápio', () => {
  it('grava link e pratos, com slug carimbado', () => {
    const { menu } = mudanca({
      menu: {
        url: 'https://exemplo.com/cardapio.pdf',
        items: [{ slug: '', name: 'Tiramisù', category: 'Sobremesas', price: 'R$ 32', highlight: true }],
      },
    })
    expect(menu).toEqual({
      url: 'https://exemplo.com/cardapio.pdf',
      items: [
        expect.objectContaining({ slug: 'tiramisu', name: 'Tiramisù', price: 'R$ 32', highlight: true }),
      ],
    })
  })

  it('prato sem nome não vai para o arquivo', () => {
    const { menu } = mudanca({ menu: { url: '', items: [{ slug: '', name: '' }] } })
    expect((menu as { items: unknown[] }).items).toEqual([])
  })
})

describe('paraGravar — seções preservadas', () => {
  it('mexe só nos campos do estúdio e mantém o resto do JSON como estava', () => {
    const bruto = {
      contact: { whatsapp: '11999', address: 'Rua A', social: { instagram: '@cantina' } },
    }
    const { contact } = mudanca({ contact: { address: 'Rua B' } }, DEFAULT_CONFIG, bruto)

    // O "@" do Instagram é do arquivo, não do estúdio: sai intacto.
    expect(contact).toEqual(
      expect.objectContaining({ address: 'Rua B', social: { instagram: '@cantina' } }),
    )
  })

  it('não devolve seção que o dono não mandou', () => {
    expect(Object.keys(mudanca({ areas: [] }))).toEqual(['areas'])
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

  it('grava o telefone do colaborador cru, do jeito que foi digitado', () => {
    const { team } = mudanca({
      team: [{ slug: 'giulia', name: 'Giulia', phone: '(11) 98888-7766' }],
    })
    expect((team as { phone: string }[])[0]!.phone).toBe('(11) 98888-7766')
  })

  it('colaborador sem telefone continua válido — ele só não tem painel', () => {
    const { team } = mudanca({ team: [{ slug: 'giulia', name: 'Giulia' }] })
    expect((team as { phone: string }[])[0]!.phone).toBe('')
  })

  it('dia sem faixa nenhuma é fechado, e não o padrão de volta', () => {
    const { hours } = mudanca({ hours: { mon: [], tue: [['09:00', '18:00']] } })
    expect((hours as Record<string, unknown[]>).mon).toEqual([])
    expect((hours as Record<string, unknown[]>).tue).toEqual([['09:00', '18:00']])
  })
})
