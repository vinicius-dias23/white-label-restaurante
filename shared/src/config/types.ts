import type { TextoKey } from './textos.js'

/**
 * Tipos da configuração white-label.
 *
 * `SiteConfig` é o formato final, já normalizado e com todos os campos
 * preenchidos. `SiteConfigInput` é o que o dono do restaurante escreve em
 * `restaurante.config.json`: tudo opcional, qualquer profundidade.
 */

export interface ThemeColors {
  /** Fundo principal da pagina. */
  background: string
  /** Fundo de cards e blocos elevados. */
  surface: string
  /** Cor do texto principal. */
  text: string
  /** Cor de textos secundarios. */
  muted: string
  /** Cor da marca: botões, destaques, detalhes. */
  brand: string
  /** Variação clara da marca. Vazio = derivada automaticamente de `brand`. */
  brandAccent: string
}

export interface BrandConfig {
  name: string
  tagline: string
  /** URL da logo. Vazio = usa a marca padrão (ícone + nome). */
  logoUrl: string
  /** URL do favicon. Vazio = favicon gerado com a cor da marca. */
  faviconUrl: string
}

export interface SocialLinks {
  instagram: string
  facebook: string
  tiktok: string
}

export interface ContactConfig {
  /** Número do WhatsApp. Aceita qualquer formato: (11) 91234-5678, +5511912345678... */
  whatsapp: string
  /** Telefone fixo/celular para o botão "Ligar". Vazio = usa o WhatsApp. */
  phone: string
  email: string
  address: string
  /** Link do Google Maps. Vazio = gerado a partir do endereço. */
  mapsUrl: string
}

export interface HeroConfig {
  imageUrl: string
  headline: string
  subheadline: string
  ctaLabel: string
}

/** Um prato ou bebida em destaque. O cardápio completo fica no link `menu.url`. */
export interface MenuItem {
  /**
   * Identificador estável do prato. Vazio = derivado do nome. O estúdio grava
   * isso ao criar um item e nunca mais mexe, para renomear ser só renomear.
   */
  slug: string
  name: string
  description: string
  /** Agrupa no site e no WhatsApp: "Entradas", "Massas", "Sobremesas"... */
  category: string
  /** Texto livre: "R$ 68", "a partir de R$ 45", "R$ 120 (serve 2)". */
  price: string
  imageUrl: string
  /** Marca o prato como destaque (borda e selo na cor da marca). */
  highlight: boolean
}

export interface MenuConfig {
  /**
   * Link do cardápio completo: PDF, site do restaurante, iFood... Vazio = o bot
   * e o site mostram só os destaques.
   */
  url: string
  /** Pratos em destaque. O WhatsApp mostra estes com preço, o site também. */
  items: MenuItem[]
}

/**
 * Um ambiente do restaurante: Salão, Varanda, Área externa, Mezanino.
 *
 * É a unidade da lotação. Cada ambiente aceita até `capacity` PESSOAS ao mesmo
 * tempo, e o bot só oferece um horário se o grupo couber em algum ambiente.
 */
export interface Area {
  /** Igual ao `slug` do prato: fixa a identidade do ambiente na agenda. */
  slug: string
  name: string
  description: string
  /** Quantas pessoas cabem ao mesmo tempo neste ambiente. */
  capacity: number
  imageUrl: string
  /** `false` mantém o ambiente no site, mas tira ele das reservas do WhatsApp. */
  bookable: boolean
}

export interface GalleryImage {
  url: string
  alt: string
}

export interface TeamMember {
  /** Igual ao `slug` do prato: fixa a identidade do colaborador. */
  slug: string
  name: string
  /** "Chef", "Sommelier", "Recepção"... */
  role: string
  photoUrl: string
  /** Usuário do Instagram, com ou sem @. */
  instagram: string
  /**
   * WhatsApp do colaborador. Preenchido, dá a ele o painel da recepção no bot:
   * as reservas do dia, quem chegou, quem faltou. Vazio = ele só existe no site,
   * e escrever para o restaurante o atende como cliente.
   *
   * Fica CRU aqui, como foi digitado — quem normaliza é o `tenant:sync`. E o
   * build do site remove este campo do bundle: é telefone pessoal.
   */
  phone: string
}

export interface Testimonial {
  name: string
  /** Nota de 1 a 5. */
  rating: number
  text: string
  photoUrl: string
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** Faixa de horário no formato ["09:00", "19:00"]. */
export type TimeRange = [string, string]

/** Lista vazia = fechado. Duas faixas = intervalo de almoço. */
export type WeeklyHours = Record<DayKey, TimeRange[]>

export interface Features {
  menu: boolean
  areas: boolean
  gallery: boolean
  team: boolean
  testimonials: boolean
  hours: boolean
  map: boolean
}

/** Regras das reservas usadas pelo bot do WhatsApp. */
export interface BookingConfig {
  /** Passo da grade de horários, em minutos: 30 gera 19:00, 19:30, 20:00... */
  slotStepMin: number
  /** Antecedência mínima para reservar, em minutos. */
  leadTimeMin: number
  /** Até quantos dias à frente o cliente pode reservar. */
  horizonDays: number
  /**
   * Quanto tempo a mesa fica com o grupo, em minutos. É o que decide quando os
   * lugares voltam para a lotação do ambiente.
   */
  durationMin: number
  /**
   * Última reserva: quantos minutos antes de fechar. Com a cozinha fechando às
   * 23:00 e 60 aqui, o último horário oferecido é 22:00.
   */
  lastSeatingMin: number
  /** Quantas reservas futuras um mesmo cliente pode ter ao mesmo tempo. */
  maxPerContact: number
  /** Até quantas horas antes o cliente ainda pode cancelar sozinho. */
  cancelDeadlineHours: number
  /** Maior grupo que o bot aceita. Acima disso, o cliente fala com um atendente. */
  maxPartySize: number
  /**
   * Grupos MAIORES que isto não confirmam sozinhos: a reserva fica pendente e o
   * dono aprova ou recusa pelo WhatsApp. 0 = tudo confirma na hora.
   */
  approvalAbovePartySize: number
}

/** Liga e desliga cada mensagem programada, por restaurante. */
export interface ScheduledMessages {
  lembrete24h: boolean
  lembrete2h: boolean
  posAtendimento: boolean
  reativacao: boolean
  aniversario: boolean
}

/**
 * O que o botão de cada opção do painel do dono faz.
 *
 * Estavam fixos no código, e são decisão do restaurante: a que horas começa o
 * jantar de quem abre para o café da manhã não é a mesma de quem só abre à noite.
 */
export interface OwnerPanelConfig {
  /**
   * Os WhatsApps que abrem o painel do dono. Mais de um porque restaurante tem
   * sócio e gerente; o PRIMEIRO é quem recebe os avisos automáticos (nova
   * reserva, pedido de aprovação, cancelamento, cliente pedindo atendente).
   *
   * Preenchido, vence o `TENANT_OWNER_PHONE` do .env. Vazio, o número que já
   * está no banco continua valendo — publicar um config sem isto não tira o
   * painel de ninguém.
   */
  phones: string[]
  /** Quanto tempo o bot fica calado no botão "Pausar o bot". */
  pauseMinutes: number
  /** Hora em que o almoço começa, no bloqueio rápido. Antes disso é manhã. */
  afternoonStartHour: number
  /** Hora em que o jantar começa, no bloqueio rápido. */
  eveningStartHour: number
}

/** Textos e regras do atendimento no WhatsApp. */
export interface WhatsAppConfig {
  /** Primeira linha do menu. Vazio = gerada com o nome do restaurante. */
  greeting: string
  /** Resposta pronta do botão "Formas de pagamento". */
  paymentMethods: string
  /** Link de avaliação no Google. Vazio desliga o pós-visita. */
  reviewUrl: string
  /** Quanto tempo o bot fica calado depois de chamar um atendente. */
  handoffMinutes: number
  /** Faixa de silêncio: nada programado sai nesse intervalo. */
  quietHours: TimeRange
  /** Dias sem voltar até o cliente entrar na régua de reativação. */
  reativacaoDias: number
  messages: ScheduledMessages
  /**
   * Textos do bot que este restaurante sobrescreve. Chave ausente = o padrão do
   * catálogo em `config/textos.ts`. Editável pelo estúdio (`textos:studio`).
   */
  textos: Partial<Record<TextoKey, string>>
  owner: OwnerPanelConfig
}

export interface SiteConfig {
  brand: BrandConfig
  colors: ThemeColors
  contact: ContactConfig & { social: SocialLinks }
  hero: HeroConfig
  menu: MenuConfig
  areas: Area[]
  gallery: GalleryImage[]
  team: TeamMember[]
  testimonials: Testimonial[]
  hours: WeeklyHours
  features: Features
  booking: BookingConfig
  whatsapp: WhatsAppConfig
}

type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type SiteConfigInput = DeepPartial<SiteConfig>

export const DAY_KEYS: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Segunda',
  tue: 'Terça',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sábado',
  sun: 'Domingo',
}

export const DAY_LABELS_SHORT: Record<DayKey, string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
  sun: 'Dom',
}
