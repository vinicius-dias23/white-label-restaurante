import type { SiteConfig } from '@restaurante/shared/config'
import { DAY_KEYS, DAY_LABELS } from '@restaurante/shared/config'
import { slugify } from '../tenants/slug.js'

/**
 * O conteúdo editável pelo estúdio: o que está ATRÁS de cada opção do menu.
 *
 * Os textos dizem como o bot fala; isto aqui é o que ele fala sobre — cardápio,
 * ambientes, equipe, horários, endereço e as regras que decidem o que o cliente
 * pode reservar. Tudo mora no mesmo `restaurante.config.json`, e o mesmo arquivo
 * alimenta a landing page: mudou o preço aqui, mudou no site.
 *
 * O `slug` é o que amarra ambiente e colaborador às linhas do banco. O estúdio
 * carimba um na criação e nunca mais mexe — é isso que faz "renomear" ser
 * renomear de verdade, em vez de criar um item novo e órfão.
 */

export interface PratoEditavel {
  slug: string
  name: string
  category: string
  price: string
  description: string
  imageUrl: string
  highlight: boolean
}

export interface AmbienteEditavel {
  slug: string
  name: string
  description: string
  /** Pessoas ao mesmo tempo. É a lotação que o bot respeita. */
  capacity: number
  imageUrl: string
  bookable: boolean
}

export interface ColaboradorEditavel {
  slug: string
  name: string
  role: string
  photoUrl: string
  instagram: string
  /** WhatsApp do colaborador: é o que abre o painel da recepção no bot. */
  phone: string
}

export interface Conteudo {
  menu: { url: string; items: PratoEditavel[] }
  areas: AmbienteEditavel[]
  team: ColaboradorEditavel[]
  hours: Record<string, [string, string][]>
  brand: { name: string; tagline: string }
  contact: {
    whatsapp: string
    phone: string
    email: string
    address: string
    mapsUrl: string
  }
  booking: SiteConfig['booking']
  whatsapp: {
    paymentMethods: string
    reviewUrl: string
    handoffMinutes: number
    quietHours: [string, string]
    reativacaoDias: number
    messages: SiteConfig['whatsapp']['messages']
    owner: SiteConfig['whatsapp']['owner']
  }
}

/** Os dias da semana com o rótulo, para a UI não repetir a tabela. */
export const DIAS = DAY_KEYS.map((key) => ({ key, label: DAY_LABELS[key] }))

export function lerConteudo(config: SiteConfig): Conteudo {
  return {
    menu: {
      url: config.menu.url,
      items: config.menu.items.map((item) => ({
        slug: item.slug,
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        imageUrl: item.imageUrl,
        highlight: item.highlight,
      })),
    },
    areas: config.areas.map((area) => ({
      slug: area.slug,
      name: area.name,
      description: area.description,
      capacity: area.capacity,
      imageUrl: area.imageUrl,
      bookable: area.bookable,
    })),
    team: config.team.map((member) => ({
      slug: member.slug,
      name: member.name,
      role: member.role,
      photoUrl: member.photoUrl,
      instagram: member.instagram,
      phone: member.phone,
    })),
    hours: Object.fromEntries(DAY_KEYS.map((day) => [day, config.hours[day]])),
    brand: { name: config.brand.name, tagline: config.brand.tagline },
    contact: {
      whatsapp: config.contact.whatsapp,
      phone: config.contact.phone,
      email: config.contact.email,
      address: config.contact.address,
      mapsUrl: config.contact.mapsUrl,
    },
    booking: config.booking,
    whatsapp: {
      paymentMethods: config.whatsapp.paymentMethods,
      reviewUrl: config.whatsapp.reviewUrl,
      handoffMinutes: config.whatsapp.handoffMinutes,
      quietHours: config.whatsapp.quietHours,
      reativacaoDias: config.whatsapp.reativacaoDias,
      messages: config.whatsapp.messages,
      owner: config.whatsapp.owner,
    },
  }
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')
const inteiro = (valor: unknown, padrao: number): number => {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n) : padrao
}

/**
 * Carimba o slug de quem chegou sem ele.
 *
 * Item novo criado pela UI vem com `slug` vazio; aqui ele ganha o seu, derivado
 * do nome e sem colidir com os que já existem. Depois disso o slug é imutável:
 * o dono renomeia à vontade e a linha do banco continua a mesma.
 */
function carimbarSlugs<T extends { slug: string; name: string }>(itens: T[], fallback: string): T[] {
  const usados = new Set(itens.map((item) => texto(item.slug)).filter(Boolean))

  return itens.map((item) => {
    const slug = texto(item.slug)
    if (slug) return { ...item, slug }

    const base = slugify(item.name, fallback)
    let candidato = base
    for (let n = 2; usados.has(candidato); n += 1) candidato = `${base}-${n}`
    usados.add(candidato)
    return { ...item, slug: candidato }
  })
}

export interface ConteudoRecebido {
  menu?: unknown
  areas?: unknown
  team?: unknown
  hours?: unknown
  brand?: unknown
  contact?: unknown
  booking?: unknown
  whatsapp?: unknown
}

/**
 * O que vai ser gravado, por caminho do JSON.
 *
 * Devolve só as seções que vieram no corpo da requisição — a UI manda a aba que
 * o dono mexeu, e o resto do arquivo nem é tocado. A validação de verdade é a
 * do `normalizeConfig`, que roda depois da gravação e devolve os avisos; aqui a
 * conversão só garante o formato (número é número, lista é lista).
 *
 * `bruto` é o JSON como está no arquivo, e é sobre ELE que os campos não
 * editados são preservados. Usar o config normalizado como base reescreveria
 * coisas que ninguém tocou — o normalize tira o "@" do Instagram, preenche
 * padrão em campo ausente — e o dono veria no diff mudanças que não fez.
 */
export function paraGravar(
  recebido: ConteudoRecebido,
  atual: SiteConfig,
  bruto: Record<string, unknown> = {},
): { caminho: string[]; valor: unknown }[] {
  const mudancas: { caminho: string[]; valor: unknown }[] = []
  const secaoBruta = (nome: string): Record<string, unknown> => {
    const valor = bruto[nome]
    return valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {}
  }

  if (recebido.menu && typeof recebido.menu === 'object') {
    const raw = recebido.menu as Record<string, unknown>
    const itens = Array.isArray(raw.items) ? raw.items : []
    const pratos = carimbarSlugs(
      itens.map((bruto) => {
        const item = bruto as Record<string, unknown>
        return {
          slug: texto(item.slug),
          name: texto(item.name),
          description: texto(item.description),
          category: texto(item.category),
          price: texto(item.price),
          imageUrl: texto(item.imageUrl),
          highlight: item.highlight === true,
        }
      }),
      'prato',
    ).filter((item) => item.name !== '')

    mudancas.push({ caminho: ['menu'], valor: { url: texto(raw.url), items: pratos } })
  }

  if (Array.isArray(recebido.areas)) {
    const ambientes = carimbarSlugs(
      recebido.areas.map((raw) => {
        const item = raw as Record<string, unknown>
        return {
          slug: texto(item.slug),
          name: texto(item.name),
          description: texto(item.description),
          capacity: Math.max(0, inteiro(item.capacity, 0)),
          imageUrl: texto(item.imageUrl),
          bookable: item.bookable !== false,
        }
      }),
      'ambiente',
    ).filter((area) => area.name !== '')

    mudancas.push({ caminho: ['areas'], valor: ambientes })
  }

  if (Array.isArray(recebido.team)) {
    const equipe = carimbarSlugs(
      recebido.team.map((raw) => {
        const item = raw as Record<string, unknown>
        return {
          slug: texto(item.slug),
          name: texto(item.name),
          role: texto(item.role),
          photoUrl: texto(item.photoUrl),
          // O "@" fica como o dono escreveu: quem tira é o normalize, na leitura.
          instagram: texto(item.instagram),
          // O telefone também: "(11) 91234-5678" é o que se lê no diff. Quem
          // normaliza é o tenant:sync, na hora de gravar no banco.
          phone: texto(item.phone),
        }
      }),
      'colaborador',
    ).filter((member) => member.name !== '')

    mudancas.push({ caminho: ['team'], valor: equipe })
  }

  if (recebido.hours && typeof recebido.hours === 'object') {
    const raw = recebido.hours as Record<string, unknown>
    const hours: Record<string, [string, string][]> = {}
    for (const day of DAY_KEYS) {
      const faixas = Array.isArray(raw[day]) ? (raw[day] as unknown[]) : atual.hours[day]
      hours[day] = faixas
        .filter((faixa): faixa is [string, string] => Array.isArray(faixa) && faixa.length === 2)
        .map(([de, ate]) => [texto(de), texto(ate)] as [string, string])
        .filter(([de, ate]) => de !== '' && ate !== '')
    }
    mudancas.push({ caminho: ['hours'], valor: hours })
  }

  if (recebido.brand && typeof recebido.brand === 'object') {
    const raw = recebido.brand as Record<string, unknown>
    // Só os campos do estúdio: logo, favicon e o resto da marca ficam intactos.
    mudancas.push({
      caminho: ['brand'],
      valor: {
        ...secaoBruta('brand'),
        name: texto(raw.name) || atual.brand.name,
        tagline: texto(raw.tagline),
      },
    })
  }

  if (recebido.contact && typeof recebido.contact === 'object') {
    const raw = recebido.contact as Record<string, unknown>
    mudancas.push({
      caminho: ['contact'],
      valor: {
        ...secaoBruta('contact'),
        whatsapp: texto(raw.whatsapp) || atual.contact.whatsapp,
        phone: texto(raw.phone),
        email: texto(raw.email),
        address: texto(raw.address),
        mapsUrl: texto(raw.mapsUrl),
      },
    })
  }

  if (recebido.booking && typeof recebido.booking === 'object') {
    const raw = recebido.booking as Record<string, unknown>
    const d = atual.booking
    mudancas.push({
      caminho: ['booking'],
      valor: {
        slotStepMin: inteiro(raw.slotStepMin, d.slotStepMin),
        leadTimeMin: inteiro(raw.leadTimeMin, d.leadTimeMin),
        horizonDays: inteiro(raw.horizonDays, d.horizonDays),
        durationMin: inteiro(raw.durationMin, d.durationMin),
        lastSeatingMin: inteiro(raw.lastSeatingMin, d.lastSeatingMin),
        maxPerContact: inteiro(raw.maxPerContact, d.maxPerContact),
        cancelDeadlineHours: inteiro(raw.cancelDeadlineHours, d.cancelDeadlineHours),
        maxPartySize: inteiro(raw.maxPartySize, d.maxPartySize),
        approvalAbovePartySize: inteiro(raw.approvalAbovePartySize, d.approvalAbovePartySize),
      },
    })
  }

  if (recebido.whatsapp && typeof recebido.whatsapp === 'object') {
    const raw = recebido.whatsapp as Record<string, unknown>
    const mensagens = (raw.messages ?? {}) as Record<string, unknown>
    const dono = (raw.owner ?? {}) as Record<string, unknown>
    const d = atual.whatsapp

    const quietHours = Array.isArray(raw.quietHours) && raw.quietHours.length === 2
      ? ([texto(raw.quietHours[0]), texto(raw.quietHours[1])] as [string, string])
      : d.quietHours

    // `textos` e `greeting` são da outra aba do estúdio: passam intactos.
    mudancas.push({
      caminho: ['whatsapp'],
      valor: {
        ...secaoBruta('whatsapp'),
        paymentMethods: texto(raw.paymentMethods),
        reviewUrl: texto(raw.reviewUrl),
        handoffMinutes: inteiro(raw.handoffMinutes, d.handoffMinutes),
        quietHours,
        reativacaoDias: inteiro(raw.reativacaoDias, d.reativacaoDias),
        messages: {
          lembrete24h: mensagens.lembrete24h !== false,
          lembrete2h: mensagens.lembrete2h !== false,
          posAtendimento: mensagens.posAtendimento === true,
          reativacao: mensagens.reativacao === true,
          aniversario: mensagens.aniversario === true,
        },
        owner: {
          // ATENÇÃO: este objeto é reconstruído campo a campo, sem o
          // `secaoBruta` que protege `brand` e `contact`. Campo que não estiver
          // listado aqui é APAGADO do arquivo no primeiro Salvar desta aba.
          phones: Array.isArray(dono.phones)
            ? dono.phones.map(texto).filter((phone) => phone !== '')
            : d.owner.phones,
          pauseMinutes: inteiro(dono.pauseMinutes, d.owner.pauseMinutes),
          afternoonStartHour: inteiro(dono.afternoonStartHour, d.owner.afternoonStartHour),
          eveningStartHour: inteiro(dono.eveningStartHour, d.owner.eveningStartHour),
        },
      },
    })
  }

  return mudancas
}
