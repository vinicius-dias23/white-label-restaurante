import { isHex, normalizeHex } from '../lib/color.js'
import { normalizePhone } from '../lib/whatsapp.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { isTextoKey, TEXTOS, type TextoKey } from './textos.js'
import { DAY_KEYS } from './types.js'
import type {
  BookingConfig,
  DayKey,
  GalleryImage,
  Service,
  SiteConfig,
  TeamMember,
  Testimonial,
  TimeRange,
  WeeklyHours,
  WhatsAppConfig,
} from './types.js'

/**
 * Converte o JSON cru — que pode ter qualquer coisa dentro, inclusive nada —
 * numa `SiteConfig` completa e segura de renderizar.
 *
 * Regra geral: campo ausente, vazio ou inválido cai no padrão. Um array
 * declarado vazio (`"team": []`) é intencional e some da página; um array
 * ausente herda o conteúdo de demonstração.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type WarnHandler = (message: string) => void

/**
 * `import.meta.env` só existe quando o Vite compila. No servidor (Node) ele é
 * `undefined`, então a leitura precisa ser defensiva — este mesmo arquivo valida
 * o config do site e o config que o bot do WhatsApp carrega.
 */
function isDev(): boolean {
  const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env
  return env?.DEV === true
}

function defaultWarn(message: string): void {
  if (isDev()) console.warn(`[barbearia.config.json] ${message}`)
}

let warnHandler: WarnHandler = defaultWarn

/**
 * Redireciona os avisos de validação. O servidor usa isto para mandar os
 * problemas do config para o log dele, em vez do console do navegador.
 */
export function setConfigWarnHandler(handler: WarnHandler | null): void {
  warnHandler = handler ?? defaultWarn
}

const warn = (message: string) => warnHandler(message)

/** Texto não-vazio, ou o padrão. */
function str(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? fallback : trimmed
  }
  warn(`"${field}" deveria ser texto — usando o padrão.`)
  return fallback
}

/** Texto que pode ser propositalmente vazio (campos opcionais). */
function optionalStr(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback
  if (typeof value === 'string') return value.trim()
  warn(`"${field}" deveria ser texto — usando o padrão.`)
  return fallback
}

function bool(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  warn(`"${field}" deveria ser true ou false — usando ${fallback}.`)
  return fallback
}

/**
 * Número inteiro dentro de uma faixa. Fora dela ou não-numérico cai no padrão —
 * um `slotStepMin: 0` geraria horários infinitos, então não passa.
 */
function num(value: unknown, fallback: number, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) {
    warn(`"${field}" deveria ser um número entre ${min} e ${max} — usando ${fallback}.`)
    return fallback
  }
  return Math.round(n)
}

function color(value: unknown, fallback: string, field: string): string {
  if (value === undefined || value === '') return fallback
  if (isHex(value)) return normalizeHex(value)
  warn(`"${field}" não é uma cor hexadecimal válida (ex.: "#1E3A5F") — usando ${fallback || 'o padrão'}.`)
  return fallback
}

/**
 * Lista tipada: ausente herda o padrão, presente é filtrada item a item.
 * Itens que não são objeto são descartados com aviso.
 */
function list<T>(
  value: unknown,
  fallback: T[],
  field: string,
  parse: (raw: Record<string, unknown>, index: number) => T | null,
): T[] {
  if (value === undefined) return fallback
  if (!Array.isArray(value)) {
    warn(`"${field}" deveria ser uma lista — usando o padrão.`)
    return fallback
  }
  const items: T[] = []
  value.forEach((raw, index) => {
    if (!isObject(raw)) {
      warn(`"${field}[${index}]" deveria ser um objeto — item ignorado.`)
      return
    }
    const parsed = parse(raw, index)
    if (parsed) items.push(parsed)
  })
  return items
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function parseRanges(value: unknown, day: DayKey): TimeRange[] | null {
  if (value === undefined) return null
  if (!Array.isArray(value)) {
    warn(`"hours.${day}" deveria ser uma lista de faixas, ex.: [["09:00","19:00"]].`)
    return null
  }
  const ranges: TimeRange[] = []
  value.forEach((range, index) => {
    if (!Array.isArray(range) || range.length !== 2) {
      warn(`"hours.${day}[${index}]" deveria ser ["HH:MM","HH:MM"] — faixa ignorada.`)
      return
    }
    const [open, close] = range
    if (typeof open !== 'string' || typeof close !== 'string' || !TIME_RE.test(open) || !TIME_RE.test(close)) {
      warn(`"hours.${day}[${index}]" tem horário inválido — faixa ignorada.`)
      return
    }
    ranges.push([open, close])
  })
  return ranges
}

function parseHours(value: unknown): WeeklyHours {
  if (value === undefined) return DEFAULT_CONFIG.hours
  if (!isObject(value)) {
    warn('"hours" deveria ser um objeto com os dias da semana — usando o padrão.')
    return DEFAULT_CONFIG.hours
  }
  const hours = {} as WeeklyHours
  for (const day of DAY_KEYS) {
    hours[day] = parseRanges(value[day], day) ?? DEFAULT_CONFIG.hours[day]
  }
  return hours
}

/**
 * Slug fixo de um serviço ou barbeiro.
 *
 * Vazio (o normal) = derivado do nome na hora do sync. Preenchido, ele é a
 * identidade da linha no banco e não pode virar qualquer coisa: só letras,
 * números e hífen, senão o `ON CONFLICT (tenant_id, slug)` casaria errado.
 */
function slugFixo(value: unknown, field: string): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') {
    warn(`"${field}" deveria ser texto — ignorando.`)
    return ''
  }
  const slug = value.trim().toLowerCase()
  if (slug === '') return ''
  if (!/^[a-z0-9-]+$/.test(slug)) {
    warn(`"${field}" só aceita letras, números e hífen — ignorando "${value}".`)
    return ''
  }
  return slug
}

/**
 * Telefone do painel — do dono ou de um barbeiro.
 *
 * O valor fica CRU, do jeito que foi digitado: é assim que "(11) 91234-5678" se
 * lê no diff do pull request, e a heurística do nono dígito do `normalizePhone`
 * não fica congelada dentro do arquivo. Quem normaliza é o `tenant:sync`, na
 * hora de gravar no banco, onde existe o DEFAULT_COUNTRY_CODE.
 *
 * Aqui só conferimos se sobrou número suficiente para o painel abrir — um
 * telefone digitado pela metade some sem aviso nenhum, e o barbeiro passa a
 * semana achando que o bot está quebrado.
 */
function parseTelefone(value: unknown, field: string): string {
  const cru = optionalStr(value, '', field)
  if (cru !== '' && normalizePhone(cru).length < 12) {
    warn(`"${field}" não parece um número com DDD ("${cru}") — o painel não vai abrir para ele.`)
  }
  return cru
}

function parseService(raw: Record<string, unknown>, index: number, fallback: Service): Service | null {
  const name = str(raw.name, '', `services[${index}].name`)
  if (!name) {
    warn(`"services[${index}]" está sem "name" — item ignorado.`)
    return null
  }
  return {
    slug: slugFixo(raw.slug, `services[${index}].slug`),
    name,
    description: optionalStr(raw.description, '', `services[${index}].description`),
    price: optionalStr(raw.price, '', `services[${index}].price`),
    duration: optionalStr(raw.duration, '', `services[${index}].duration`),
    durationMin: num(raw.durationMin, 0, `services[${index}].durationMin`, 0, 8 * 60),
    imageUrl: optionalStr(raw.imageUrl, fallback.imageUrl, `services[${index}].imageUrl`),
    highlight: bool(raw.highlight, false, `services[${index}].highlight`),
  }
}

function parseRating(value: unknown, index: number): number {
  if (value === undefined) return 5
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    warn(`"testimonials[${index}].rating" deveria ser um número de 1 a 5 — usando 5.`)
    return 5
  }
  return Math.round(n)
}

function parseBooking(value: unknown): BookingConfig {
  const d = DEFAULT_CONFIG.booking
  if (value === undefined) return d
  if (!isObject(value)) {
    warn('"booking" deveria ser um objeto — usando o padrão.')
    return d
  }
  return {
    slotStepMin: num(value.slotStepMin, d.slotStepMin, 'booking.slotStepMin', 5, 120),
    leadTimeMin: num(value.leadTimeMin, d.leadTimeMin, 'booking.leadTimeMin', 0, 7 * 24 * 60),
    horizonDays: num(value.horizonDays, d.horizonDays, 'booking.horizonDays', 1, 180),
    bufferMin: num(value.bufferMin, d.bufferMin, 'booking.bufferMin', 0, 120),
    maxPerContact: num(value.maxPerContact, d.maxPerContact, 'booking.maxPerContact', 1, 20),
    cancelDeadlineHours: num(value.cancelDeadlineHours, d.cancelDeadlineHours, 'booking.cancelDeadlineHours', 0, 72),
    defaultDurationMin: num(value.defaultDurationMin, d.defaultDurationMin, 'booking.defaultDurationMin', 5, 8 * 60),
  }
}

/** Faixa ["21:00","08:00"] do silêncio noturno — pode atravessar a meia-noite. */
function parseQuietHours(value: unknown, fallback: TimeRange): TimeRange {
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.length !== 2) {
    warn('"whatsapp.quietHours" deveria ser ["HH:MM","HH:MM"] — usando o padrão.')
    return fallback
  }
  const [start, end] = value
  if (typeof start !== 'string' || typeof end !== 'string' || !TIME_RE.test(start) || !TIME_RE.test(end)) {
    warn('"whatsapp.quietHours" tem horário inválido — usando o padrão.')
    return fallback
  }
  return [start, end]
}

/**
 * Textos customizados do bot.
 *
 * Chave desconhecida é descartada com aviso — normalmente é erro de digitação
 * no estúdio ou um texto que existia numa versão anterior. Passar do limite da
 * Meta não invalida o texto: o `fit()` do módulo WhatsApp corta na hora do
 * envio, mas o aviso aparece para o dono saber que vai sair cortado.
 */
function parseTextos(value: unknown): Partial<Record<TextoKey, string>> {
  if (value === undefined) return {}
  if (!isObject(value)) {
    warn('"whatsapp.textos" deveria ser um objeto — ignorando.')
    return {}
  }

  const textos: Partial<Record<TextoKey, string>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!isTextoKey(key)) {
      warn(`"whatsapp.textos.${key}" não é um texto conhecido do bot — ignorando.`)
      continue
    }
    if (typeof raw !== 'string') {
      warn(`"whatsapp.textos.${key}" deveria ser texto — usando o padrão.`)
      continue
    }
    const texto = raw.trim()
    // Texto vazio é o jeito de dizer "volta para o padrão".
    if (texto === '') continue

    const limite = TEXTOS[key].limite
    if (limite && texto.length > limite) {
      warn(`"whatsapp.textos.${key}" tem ${texto.length} caracteres e a Meta corta em ${limite}.`)
    }
    textos[key] = texto
  }
  return textos
}

/**
 * Os números do painel do dono. Ausente vira lista vazia — e lista vazia NÃO
 * apaga o número que já está no banco (veja `syncTenant`).
 */
function parseTelefones(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warn(`"${field}" deveria ser uma lista de telefones — usando o padrão.`)
    return []
  }
  return value
    .map((item, i) => parseTelefone(item, `${field}[${i}]`))
    .filter((phone) => phone !== '')
}

function parseWhatsApp(value: unknown): WhatsAppConfig {
  const d = DEFAULT_CONFIG.whatsapp
  const raw = isObject(value) ? value : {}
  if (value !== undefined && !isObject(value)) {
    warn('"whatsapp" deveria ser um objeto — usando o padrão.')
  }
  const messages = isObject(raw.messages) ? raw.messages : {}
  const m = d.messages
  const owner = isObject(raw.owner) ? raw.owner : {}
  const o = d.owner
  return {
    greeting: optionalStr(raw.greeting, d.greeting, 'whatsapp.greeting'),
    paymentMethods: optionalStr(raw.paymentMethods, d.paymentMethods, 'whatsapp.paymentMethods'),
    reviewUrl: optionalStr(raw.reviewUrl, d.reviewUrl, 'whatsapp.reviewUrl'),
    handoffMinutes: num(raw.handoffMinutes, d.handoffMinutes, 'whatsapp.handoffMinutes', 0, 24 * 60),
    quietHours: parseQuietHours(raw.quietHours, d.quietHours),
    reativacaoDias: num(raw.reativacaoDias, d.reativacaoDias, 'whatsapp.reativacaoDias', 7, 365),
    messages: {
      lembrete24h: bool(messages.lembrete24h, m.lembrete24h, 'whatsapp.messages.lembrete24h'),
      lembrete2h: bool(messages.lembrete2h, m.lembrete2h, 'whatsapp.messages.lembrete2h'),
      posAtendimento: bool(messages.posAtendimento, m.posAtendimento, 'whatsapp.messages.posAtendimento'),
      reativacao: bool(messages.reativacao, m.reativacao, 'whatsapp.messages.reativacao'),
      aniversario: bool(messages.aniversario, m.aniversario, 'whatsapp.messages.aniversario'),
    },
    textos: parseTextos(raw.textos),
    owner: {
      phones: parseTelefones(owner.phones, 'whatsapp.owner.phones'),
      pauseMinutes: num(owner.pauseMinutes, o.pauseMinutes, 'whatsapp.owner.pauseMinutes', 5, 24 * 60),
      afternoonStartHour: num(
        owner.afternoonStartHour,
        o.afternoonStartHour,
        'whatsapp.owner.afternoonStartHour',
        1,
        23,
      ),
      eveningStartHour: num(
        owner.eveningStartHour,
        o.eveningStartHour,
        'whatsapp.owner.eveningStartHour',
        1,
        23,
      ),
    },
  }
}

export function normalizeConfig(input: unknown): SiteConfig {
  if (input !== undefined && !isObject(input)) {
    warn('o arquivo deveria conter um objeto JSON — usando a configuração padrão.')
  }
  const raw = isObject(input) ? input : {}

  const d = DEFAULT_CONFIG
  const brand = isObject(raw.brand) ? raw.brand : {}
  const colors = isObject(raw.colors) ? raw.colors : {}
  const contact = isObject(raw.contact) ? raw.contact : {}
  const social = isObject(contact.social) ? contact.social : {}
  const hero = isObject(raw.hero) ? raw.hero : {}
  const features = isObject(raw.features) ? raw.features : {}

  const services = list<Service>(raw.services, d.services, 'services', (item, i) =>
    parseService(item, i, d.services[i % d.services.length] ?? d.services[0]!),
  )

  const gallery = list<GalleryImage>(raw.gallery, d.gallery, 'gallery', (item, i) => {
    const url = str(item.url, '', `gallery[${i}].url`)
    if (!url) {
      warn(`"gallery[${i}]" está sem "url" — item ignorado.`)
      return null
    }
    return { url, alt: optionalStr(item.alt, '', `gallery[${i}].alt`) }
  })

  const team = list<TeamMember>(raw.team, d.team, 'team', (item, i) => {
    const name = str(item.name, '', `team[${i}].name`)
    if (!name) {
      warn(`"team[${i}]" está sem "name" — item ignorado.`)
      return null
    }
    return {
      slug: slugFixo(item.slug, `team[${i}].slug`),
      name,
      role: optionalStr(item.role, '', `team[${i}].role`),
      photoUrl: optionalStr(item.photoUrl, '', `team[${i}].photoUrl`),
      instagram: optionalStr(item.instagram, '', `team[${i}].instagram`).replace(/^@/, ''),
      phone: parseTelefone(item.phone, `team[${i}].phone`),
      bookable: bool(item.bookable, true, `team[${i}].bookable`),
    }
  })

  // Dois barbeiros com o mesmo número: o painel abre para um só, e sem isto
  // ninguém descobre qual. Não é erro fatal — o config continua válido.
  const telefonesVistos = new Map<string, string>()
  for (const member of team) {
    const numero = member.phone === '' ? '' : normalizePhone(member.phone)
    if (numero === '') continue
    const anterior = telefonesVistos.get(numero)
    if (anterior !== undefined) {
      warn(`"${member.name}" e "${anterior}" têm o mesmo telefone — o painel vai abrir só para um deles.`)
    } else {
      telefonesVistos.set(numero, member.name)
    }
  }

  const testimonials = list<Testimonial>(raw.testimonials, d.testimonials, 'testimonials', (item, i) => {
    const text = str(item.text, '', `testimonials[${i}].text`)
    if (!text) {
      warn(`"testimonials[${i}]" está sem "text" — item ignorado.`)
      return null
    }
    return {
      name: str(item.name, 'Cliente', `testimonials[${i}].name`),
      rating: parseRating(item.rating, i),
      text,
      photoUrl: optionalStr(item.photoUrl, '', `testimonials[${i}].photoUrl`),
    }
  })

  return {
    brand: {
      name: str(brand.name, d.brand.name, 'brand.name'),
      tagline: optionalStr(brand.tagline, d.brand.tagline, 'brand.tagline'),
      logoUrl: optionalStr(brand.logoUrl, d.brand.logoUrl, 'brand.logoUrl'),
      faviconUrl: optionalStr(brand.faviconUrl, d.brand.faviconUrl, 'brand.faviconUrl'),
    },
    colors: {
      background: color(colors.background, d.colors.background, 'colors.background'),
      surface: color(colors.surface, d.colors.surface, 'colors.surface'),
      text: color(colors.text, d.colors.text, 'colors.text'),
      muted: color(colors.muted, d.colors.muted, 'colors.muted'),
      brand: color(colors.brand, d.colors.brand, 'colors.brand'),
      brandAccent: color(colors.brandAccent, d.colors.brandAccent, 'colors.brandAccent'),
    },
    contact: {
      whatsapp: str(contact.whatsapp, d.contact.whatsapp, 'contact.whatsapp'),
      phone: optionalStr(contact.phone, d.contact.phone, 'contact.phone'),
      email: optionalStr(contact.email, d.contact.email, 'contact.email'),
      address: optionalStr(contact.address, d.contact.address, 'contact.address'),
      mapsUrl: optionalStr(contact.mapsUrl, d.contact.mapsUrl, 'contact.mapsUrl'),
      social: {
        instagram: optionalStr(social.instagram, d.contact.social.instagram, 'contact.social.instagram').replace(/^@/, ''),
        facebook: optionalStr(social.facebook, d.contact.social.facebook, 'contact.social.facebook'),
        tiktok: optionalStr(social.tiktok, d.contact.social.tiktok, 'contact.social.tiktok').replace(/^@/, ''),
      },
    },
    hero: {
      imageUrl: optionalStr(hero.imageUrl, d.hero.imageUrl, 'hero.imageUrl'),
      headline: optionalStr(hero.headline, d.hero.headline, 'hero.headline'),
      subheadline: optionalStr(hero.subheadline, d.hero.subheadline, 'hero.subheadline'),
      ctaLabel: str(hero.ctaLabel, d.hero.ctaLabel, 'hero.ctaLabel'),
    },
    services,
    gallery,
    team,
    testimonials,
    hours: parseHours(raw.hours),
    booking: parseBooking(raw.booking),
    whatsapp: parseWhatsApp(raw.whatsapp),
    features: {
      gallery: bool(features.gallery, d.features.gallery, 'features.gallery'),
      team: bool(features.team, d.features.team, 'features.team'),
      testimonials: bool(features.testimonials, d.features.testimonials, 'features.testimonials'),
      hours: bool(features.hours, d.features.hours, 'features.hours'),
      map: bool(features.map, d.features.map, 'features.map'),
    },
  }
}
