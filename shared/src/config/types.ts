import type { TextoKey } from './textos.js'

/**
 * Tipos da configuração white-label.
 *
 * `SiteConfig` é o formato final, já normalizado e com todos os campos
 * preenchidos. `SiteConfigInput` é o que o dono da barbearia escreve em
 * `barbearia.config.json`: tudo opcional, qualquer profundidade.
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

export interface Service {
  /**
   * Identificador estável do serviço, a ponte com a linha do banco.
   *
   * Vazio = derivado do nome, como sempre foi. Preenchido, ele fixa a
   * identidade: renomear passa a ser só renomear, sem criar um serviço novo e
   * sem deixar os agendamentos antigos apontando para o item velho. O estúdio
   * grava isso ao criar um serviço, e nunca mais mexe.
   */
  slug: string
  name: string
  description: string
  /** Texto livre: "45", "R$ 45", "a partir de R$ 45". */
  price: string
  /** Texto livre: "30 min", "1h". */
  duration: string
  /**
   * Duração em minutos, usada pelo bot do WhatsApp para montar a agenda.
   * 0 = deduz de `duration` e, se não der, usa `booking.defaultDurationMin`.
   */
  durationMin: number
  imageUrl: string
  /** Marca o serviço como destaque (borda e selo na cor da marca). */
  highlight: boolean
}

export interface GalleryImage {
  url: string
  alt: string
}

export interface TeamMember {
  /** Igual ao `slug` do serviço: fixa a identidade do barbeiro na agenda. */
  slug: string
  name: string
  role: string
  photoUrl: string
  /** Usuário do Instagram, com ou sem @. */
  instagram: string
  /**
   * WhatsApp do barbeiro. Preenchido, dá a ele o painel dele no bot: a agenda
   * dele, os cortes dele, a folga dele. Vazio = ele só existe no site e na
   * agenda, e escrever para a barbearia o atende como cliente.
   *
   * Fica CRU aqui, como foi digitado — quem normaliza é o `tenant:sync`. E o
   * build do site remove este campo do bundle: é telefone pessoal.
   */
  phone: string
  /** `false` mantém o barbeiro no site, mas tira ele da agenda do WhatsApp. */
  bookable: boolean
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
  gallery: boolean
  team: boolean
  testimonials: boolean
  hours: boolean
  map: boolean
}

/** Regras da agenda usadas pelo bot do WhatsApp. */
export interface BookingConfig {
  /** Passo da grade de horários, em minutos: 15 gera 09:00, 09:15, 09:30... */
  slotStepMin: number
  /** Antecedência mínima para agendar, em minutos. */
  leadTimeMin: number
  /** Até quantos dias à frente o cliente pode marcar. */
  horizonDays: number
  /** Folga entre um atendimento e o próximo, em minutos. */
  bufferMin: number
  /** Quantos agendamentos futuros um mesmo cliente pode ter ao mesmo tempo. */
  maxPerContact: number
  /** Até quantas horas antes o cliente ainda pode cancelar sozinho. */
  cancelDeadlineHours: number
  /** Duração aplicada ao serviço que não informa a dele. */
  defaultDurationMin: number
}

/** Liga e desliga cada mensagem programada, por barbearia. */
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
 * Estavam fixos no código, e são decisão da barbearia: a que horas começa a
 * tarde de quem abre às 7h não é a mesma de quem abre ao meio-dia.
 */
export interface OwnerPanelConfig {
  /**
   * Os WhatsApps que abrem o painel do dono. Mais de um porque barbearia tem
   * sócio e gerente; o PRIMEIRO é quem recebe os avisos automáticos (novo
   * agendamento, cancelamento, cliente pedindo atendente).
   *
   * Preenchido, vence o `TENANT_OWNER_PHONE` do .env. Vazio, o número que já
   * está no banco continua valendo — publicar um config sem isto não tira o
   * painel de ninguém.
   */
  phones: string[]
  /** Quanto tempo o bot fica calado no botão "Pausar o bot". */
  pauseMinutes: number
  /** Hora em que a tarde começa, no bloqueio rápido. A manhã vai de 0 até aqui. */
  afternoonStartHour: number
  /** Hora em que a noite começa, no bloqueio rápido. */
  eveningStartHour: number
}

/** Textos e regras do atendimento no WhatsApp. */
export interface WhatsAppConfig {
  /** Primeira linha do menu. Vazio = gerada com o nome da barbearia. */
  greeting: string
  /** Resposta pronta do botão "Formas de pagamento". */
  paymentMethods: string
  /** Link de avaliação no Google. Vazio desliga o pós-atendimento. */
  reviewUrl: string
  /** Quanto tempo o bot fica calado depois de chamar um atendente. */
  handoffMinutes: number
  /** Faixa de silêncio: nada programado sai nesse intervalo. */
  quietHours: TimeRange
  /** Dias sem voltar até o cliente entrar na régua de reativação. */
  reativacaoDias: number
  messages: ScheduledMessages
  /**
   * Textos do bot que esta barbearia sobrescreve. Chave ausente = o padrão do
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
  services: Service[]
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
