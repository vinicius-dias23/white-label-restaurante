import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../defaults.js'
import { normalizeConfig } from '../normalize.js'

/** Silencia os avisos de config inválida durante os testes. */
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('config vazia', () => {
  it('cai inteira no padrão', () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG)
  })

  it('sobrevive a undefined, null e a um JSON que não é objeto', () => {
    quiet()
    expect(normalizeConfig(undefined).brand.name).toBe(DEFAULT_CONFIG.brand.name)
    expect(normalizeConfig(null).colors.brand).toBe(DEFAULT_CONFIG.colors.brand)
    expect(normalizeConfig('nada disso').areas).toHaveLength(DEFAULT_CONFIG.areas.length)
  })
})

describe('merge parcial', () => {
  it('mistura o que veio com o padrão, campo a campo', () => {
    const config = normalizeConfig({
      brand: { name: 'Boteco do Zé' },
      colors: { brand: '#B8860B' },
    })

    expect(config.brand.name).toBe('Boteco do Zé')
    expect(config.brand.tagline).toBe(DEFAULT_CONFIG.brand.tagline)
    expect(config.colors.brand).toBe('#b8860b')
    expect(config.colors.background).toBe(DEFAULT_CONFIG.colors.background)
  })

  it('lista vazia é intenção: some da página', () => {
    expect(normalizeConfig({ team: [] }).team).toEqual([])
  })

  it('lista ausente herda a demonstração', () => {
    expect(normalizeConfig({}).team).toEqual(DEFAULT_CONFIG.team)
  })
})

describe('valores inválidos', () => {
  it('cor fora do formato cai no padrão', () => {
    quiet()
    expect(normalizeConfig({ colors: { brand: 'azul marinho' } }).colors.brand).toBe(DEFAULT_CONFIG.colors.brand)
  })

  it('flag que não é booleana cai no padrão', () => {
    quiet()
    expect(normalizeConfig({ features: { team: 'sim' } as never }).features.team).toBe(true)
  })

  it('prato sem nome é descartado', () => {
    quiet()
    const items = normalizeConfig({
      menu: { items: [{ name: 'Lasanha' }, { price: 'R$ 10' } as never] },
    }).menu.items
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe('Lasanha')
  })

  it('ambiente sem nome é descartado', () => {
    quiet()
    const areas = normalizeConfig({ areas: [{ name: 'Salão', capacity: 30 }, { capacity: 10 } as never] }).areas
    expect(areas).toHaveLength(1)
    expect(areas[0]?.name).toBe('Salão')
  })

  it('horário mal formatado é ignorado sem derrubar o dia', () => {
    quiet()
    const hours = normalizeConfig({
      hours: { mon: [['9h', '19h'], ['09:00', '18:00']] as never },
    }).hours
    expect(hours.mon).toEqual([['09:00', '18:00']])
  })

  it('dia ausente mantém o horário padrão', () => {
    const hours = normalizeConfig({ hours: { sun: [['10:00', '14:00']] } }).hours
    expect(hours.sun).toEqual([['10:00', '14:00']])
    expect(hours.mon).toEqual(DEFAULT_CONFIG.hours.mon)
  })

  it('nota fora da escala vira 5', () => {
    quiet()
    const testimonials = normalizeConfig({
      testimonials: [{ name: 'A', text: 'Bom', rating: 9 } as never],
    }).testimonials
    expect(testimonials[0]?.rating).toBe(5)
  })
})

describe('normalizações de conveniência', () => {
  it('tira o @ dos usuários de rede social', () => {
    const config = normalizeConfig({
      contact: { social: { instagram: '@cantina' } },
      team: [{ name: 'Giulia', instagram: '@giulia' }],
    })
    expect(config.contact.social.instagram).toBe('cantina')
    expect(config.team[0]?.instagram).toBe('giulia')
  })

  it('apara espaços em volta dos textos', () => {
    expect(normalizeConfig({ brand: { name: '  Cantina  ' } }).brand.name).toBe('Cantina')
  })

  it('texto vazio num campo obrigatório volta ao padrão', () => {
    expect(normalizeConfig({ brand: { name: '   ' } }).brand.name).toBe(DEFAULT_CONFIG.brand.name)
  })
})

describe('booking e whatsapp (config do bot)', () => {
  it('preenche os dois blocos com o padrão quando faltam', () => {
    const config = normalizeConfig({})
    expect(config.booking).toEqual(DEFAULT_CONFIG.booking)
    expect(config.booking.durationMin).toBe(120)
    expect(config.whatsapp.quietHours).toEqual(DEFAULT_CONFIG.whatsapp.quietHours)
  })

  it('as mensagens de marketing nascem desligadas', () => {
    const { messages } = normalizeConfig({}).whatsapp
    expect(messages.lembrete24h).toBe(true)
    expect(messages.lembrete2h).toBe(true)
    expect(messages.posAtendimento).toBe(false)
    expect(messages.reativacao).toBe(false)
    expect(messages.aniversario).toBe(false)
  })

  it('número fora da faixa cai no padrão em vez de quebrar as reservas', () => {
    quiet()
    const d = DEFAULT_CONFIG.booking
    // slotStepMin: 0 geraria horários infinitos.
    expect(normalizeConfig({ booking: { slotStepMin: 0 } }).booking.slotStepMin).toBe(d.slotStepMin)
    expect(normalizeConfig({ booking: { horizonDays: 9999 } }).booking.horizonDays).toBe(d.horizonDays)
    expect(normalizeConfig({ booking: { leadTimeMin: 'logo' } }).booking.leadTimeMin).toBe(d.leadTimeMin)
    expect(normalizeConfig({ booking: { maxPartySize: 0 } }).booking.maxPartySize).toBe(d.maxPartySize)
  })

  it('aceita as regras de grupo do dono', () => {
    const { booking } = normalizeConfig({
      booking: { maxPartySize: 30, approvalAbovePartySize: 10, durationMin: 90, lastSeatingMin: 45 },
    })
    expect(booking.maxPartySize).toBe(30)
    expect(booking.approvalAbovePartySize).toBe(10)
    expect(booking.durationMin).toBe(90)
    expect(booking.lastSeatingMin).toBe(45)
  })

  it('approvalAbovePartySize 0 é válido: confirma tudo direto', () => {
    expect(normalizeConfig({ booking: { approvalAbovePartySize: 0 } }).booking.approvalAbovePartySize).toBe(0)
  })

  it('aceita os valores válidos que o dono escreveu', () => {
    const config = normalizeConfig({
      booking: { slotStepMin: 30, maxPerContact: 1 },
      whatsapp: { paymentMethods: 'Só Pix', messages: { lembrete2h: false } },
    })
    expect(config.booking.slotStepMin).toBe(30)
    expect(config.booking.maxPerContact).toBe(1)
    expect(config.whatsapp.paymentMethods).toBe('Só Pix')
    expect(config.whatsapp.messages.lembrete2h).toBe(false)
    expect(config.whatsapp.messages.lembrete24h).toBe(true)
  })

  it('quietHours mal escrito cai no padrão', () => {
    quiet()
    const padrao = DEFAULT_CONFIG.whatsapp.quietHours
    expect(normalizeConfig({ whatsapp: { quietHours: ['23h', '8h'] } }).whatsapp.quietHours).toEqual(padrao)
    expect(normalizeConfig({ whatsapp: { quietHours: '21:00' } }).whatsapp.quietHours).toEqual(padrao)
  })

  it('ambiente traz lotação e bookable', () => {
    const config = normalizeConfig({
      areas: [{ name: 'Varanda', capacity: 24, bookable: false }],
    })
    expect(config.areas[0]!.capacity).toBe(24)
    expect(config.areas[0]!.bookable).toBe(false)
  })

  it('bookable ausente vale true — o ambiente aparece nas reservas', () => {
    expect(normalizeConfig({ areas: [{ name: 'Salão', capacity: 40 }] }).areas[0]!.bookable).toBe(true)
  })

  it('lotação 0 é aceita: o ambiente fica no site, fora das reservas', () => {
    expect(normalizeConfig({ areas: [{ name: 'Adega', capacity: 0 }] }).areas[0]!.capacity).toBe(0)
  })
})

describe('cardápio', () => {
  it('sem "menu" herda a demonstração', () => {
    expect(normalizeConfig({}).menu).toEqual(DEFAULT_CONFIG.menu)
  })

  it('lê link, categoria, preço e destaque', () => {
    const { menu } = normalizeConfig({
      menu: {
        url: 'https://exemplo.com/cardapio.pdf',
        items: [{ name: 'Tiramisù', category: 'Sobremesas', price: 'R$ 32', highlight: true }],
      },
    })
    expect(menu.url).toBe('https://exemplo.com/cardapio.pdf')
    expect(menu.items[0]).toMatchObject({ name: 'Tiramisù', category: 'Sobremesas', price: 'R$ 32', highlight: true })
  })

  it('"menu" que não é objeto cai no padrão', () => {
    quiet()
    expect(normalizeConfig({ menu: 'pdf' as never }).menu).toEqual(DEFAULT_CONFIG.menu)
  })
})

/**
 * Os telefones do painel — do dono e de cada colaborador.
 *
 * A regra que estes testes fixam: o arquivo guarda o número CRU, do jeito que
 * foi digitado. É o que faz "(11) 91234-5678" se ler no diff do pull request,
 * em vez de "5511912345678". Quem normaliza é o `tenant:sync`, na hora de
 * gravar no banco, onde existe o DEFAULT_COUNTRY_CODE.
 */
describe('telefones do painel', () => {
  it('guarda o telefone do colaborador cru, sem reescrever a máscara', () => {
    const config = normalizeConfig({
      team: [{ slug: 'giulia', name: 'Giulia', phone: '(11) 98888-7766' }],
    })
    expect(config.team[0]!.phone).toBe('(11) 98888-7766')
  })

  it('colaborador sem telefone fica com string vazia — ele só não tem painel', () => {
    const config = normalizeConfig({ team: [{ slug: 'giulia', name: 'Giulia' }] })
    expect(config.team[0]!.phone).toBe('')
  })

  it('avisa quando o número está pela metade, mas não descarta o colaborador', () => {
    const warn = quiet()
    const config = normalizeConfig({
      team: [{ slug: 'giulia', name: 'Giulia', phone: '9888' }],
    })
    expect(config.team[0]!.name).toBe('Giulia')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('team[0].phone'))
  })

  it('avisa quando dois colaboradores dividem o mesmo número', () => {
    const warn = quiet()
    normalizeConfig({
      team: [
        { slug: 'giulia', name: 'Giulia', phone: '(11) 98888-7766' },
        { slug: 'marco', name: 'Marco', phone: '11988887766' },
      ],
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mesmo telefone'))
  })

  it('lê a lista de números do dono e preserva a ordem', () => {
    const config = normalizeConfig({
      whatsapp: { owner: { phones: ['(11) 91111-1111', '(11) 92222-2222'] } },
    })
    expect(config.whatsapp.owner.phones).toEqual(['(11) 91111-1111', '(11) 92222-2222'])
  })

  it('lista de dono ausente vira vazia — e vazia NÃO apaga o número do banco', () => {
    expect(normalizeConfig({}).whatsapp.owner.phones).toEqual([])
  })
})
