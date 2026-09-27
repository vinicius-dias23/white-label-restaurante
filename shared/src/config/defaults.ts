import type { SiteConfig } from './types'

/**
 * Fotos de demonstração (Unsplash). Substitua pelas fotos reais da barbearia
 * em `barbearia.config.json` — qualquer imagem que não carregar cai
 * automaticamente num placeholder escuro gerado pelo próprio site.
 */
const DEMO = {
  hero: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70',
  service: [
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033',
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c',
    'https://images.unsplash.com/photo-1599351431202-1e0f0137899a',
    'https://images.unsplash.com/photo-1517832606299-7ae9b720a186',
    'https://images.unsplash.com/photo-1596728325488-58c87691e9af',
  ],
  gallery: [
    'https://images.unsplash.com/photo-1605497788044-5a32c7078486',
    'https://images.unsplash.com/photo-1567894340315-735d7c361db0',
    'https://images.unsplash.com/photo-1503443207922-dff7d543fd0e',
    'https://images.unsplash.com/photo-1519019121902-7d0eb4a1e14a',
    'https://images.unsplash.com/photo-1521490683712-35a1cb32a41e',
    'https://images.unsplash.com/photo-1614289371518-722f2615943d',
    'https://images.unsplash.com/photo-1583864697784-a0efc8379f70',
    'https://images.unsplash.com/photo-1560066984-138dadb4c035',
  ],
  team: [
    'https://images.unsplash.com/photo-1534959363030-e13d4b6a0b31',
    'https://images.unsplash.com/photo-1618077360395-f3068be8e001',
    'https://images.unsplash.com/photo-1611691546231-1c8bbc4c8f0c',
  ],
} as const

/**
 * Configuração padrão. Tudo que faltar em `barbearia.config.json`
 * cai aqui: preto + branco + azul escuro, com conteúdo de demonstração.
 */
export const DEFAULT_CONFIG: SiteConfig = {
  brand: {
    name: 'Barbearia',
    tagline: 'Corte, barba e navalha',
    logoUrl: '',
    faviconUrl: '',
  },

  colors: {
    background: '#0A0A0B',
    surface: '#141417',
    text: '#F5F5F4',
    muted: '#A1A1AA',
    brand: '#16345B',
    brandAccent: '',
  },

  contact: {
    whatsapp: '5511999999999',
    phone: '',
    email: '',
    address: 'Rua Exemplo, 123 — Centro, São Paulo - SP',
    mapsUrl: '',
    social: {
      instagram: '',
      facebook: '',
      tiktok: '',
    },
  },

  hero: {
    imageUrl: DEMO.hero,
    headline: 'Seu estilo,\nno detalhe',
    subheadline: 'Barbearia clássica com acabamento na navalha',
    ctaLabel: 'Agendar no WhatsApp',
  },

  services: [
    {
      slug: '',
      name: 'Corte Degradê',
      description: 'Máquina e tesoura, acabamento na navalha',
      price: 'R$ 45',
      duration: '40 min',
      durationMin: 0,
      imageUrl: DEMO.service[0],
      highlight: false,
    },
    {
      slug: '',
      name: 'Corte + Barba',
      description: 'O combo completo, com toalha quente',
      price: 'R$ 75',
      duration: '1h 10',
      durationMin: 0,
      imageUrl: DEMO.service[1],
      highlight: true,
    },
    {
      slug: '',
      name: 'Barba Terapia',
      description: 'Toalha quente, óleo e navalha',
      price: 'R$ 40',
      duration: '30 min',
      durationMin: 0,
      imageUrl: DEMO.service[2],
      highlight: false,
    },
    {
      slug: '',
      name: 'Corte Social',
      description: 'Clássico, tesoura e máquina',
      price: 'R$ 40',
      duration: '30 min',
      durationMin: 0,
      imageUrl: DEMO.service[3],
      highlight: false,
    },
    {
      slug: '',
      name: 'Platinado',
      description: 'Descoloração global com tonalizante',
      price: 'R$ 180',
      duration: '2h',
      durationMin: 0,
      imageUrl: DEMO.service[4],
      highlight: false,
    },
    {
      slug: '',
      name: 'Corte Infantil',
      description: 'Até 10 anos, no capricho',
      price: 'R$ 35',
      duration: '30 min',
      durationMin: 0,
      imageUrl: DEMO.service[5],
      highlight: false,
    },
  ],

  gallery: [
    { url: DEMO.gallery[0], alt: 'Degradê finalizado' },
    { url: DEMO.gallery[1], alt: 'Acabamento na navalha' },
    { url: DEMO.gallery[2], alt: 'Barba aparada' },
    { url: DEMO.gallery[3], alt: 'Cadeira da barbearia' },
    { url: DEMO.gallery[4], alt: 'Corte com tesoura' },
    { url: DEMO.gallery[5], alt: 'Ambiente da barbearia' },
    { url: DEMO.gallery[6], alt: 'Detalhe do corte' },
    { url: DEMO.gallery[7], alt: 'Ferramentas do barbeiro' },
  ],

  // `phone` vazio de propósito na demonstração: telefone de barbeiro é dado
  // pessoal, e quem preenche é cada barbearia no estúdio.
  team: [
    { slug: '', name: 'Rafael', role: 'Barbeiro-chefe', photoUrl: DEMO.team[0], instagram: '', phone: '', bookable: true },
    { slug: '', name: 'Diego', role: 'Especialista em barba', photoUrl: DEMO.team[1], instagram: '', phone: '', bookable: true },
    { slug: '', name: 'Bruno', role: 'Colorista', photoUrl: DEMO.team[2], instagram: '', phone: '', bookable: true },
  ],

  testimonials: [
    { name: 'Lucas M.', rating: 5, text: 'Melhor degradê que já fizeram no meu cabelo. Atendimento impecável.', photoUrl: '' },
    { name: 'André S.', rating: 5, text: 'Ambiente top, café bom e barba feita com capricho. Virei cliente fixo.', photoUrl: '' },
    { name: 'Thiago R.', rating: 5, text: 'Marquei pelo WhatsApp e fui atendido na hora marcada. Recomendo demais.', photoUrl: '' },
  ],

  hours: {
    mon: [['09:00', '19:00']],
    tue: [['09:00', '19:00']],
    wed: [['09:00', '19:00']],
    thu: [['09:00', '20:00']],
    fri: [['09:00', '20:00']],
    sat: [['08:00', '18:00']],
    sun: [],
  },

  features: {
    gallery: true,
    team: true,
    testimonials: true,
    hours: true,
    map: true,
  },

  booking: {
    slotStepMin: 15,
    leadTimeMin: 60,
    horizonDays: 21,
    bufferMin: 0,
    maxPerContact: 2,
    cancelDeadlineHours: 3,
    defaultDurationMin: 40,
  },

  whatsapp: {
    greeting: '',
    paymentMethods: 'Pix, dinheiro, débito e crédito',
    reviewUrl: '',
    handoffMinutes: 30,
    quietHours: ['21:00', '08:00'],
    reativacaoDias: 40,
    messages: {
      lembrete24h: true,
      lembrete2h: true,
      // Implementadas e desligadas: ligue uma de cada vez, depois que o
      // template correspondente estiver aprovado na Meta.
      posAtendimento: false,
      reativacao: false,
      aniversario: false,
    },
    // Vazio de propósito: cada texto do bot cai no padrão do catálogo em
    // `config/textos.ts`. A barbearia sobrescreve só o que quiser mudar.
    textos: {},
    owner: {
      phones: [],
      pauseMinutes: 60,
      afternoonStartHour: 12,
      eveningStartHour: 18,
    },
  },
}
