import type { SiteConfig } from './types'

/**
 * Fotos de demonstração (Unsplash). Substitua pelas fotos reais do restaurante
 * em `restaurante.config.json` — qualquer imagem que não carregar cai
 * automaticamente num placeholder escuro gerado pelo próprio site.
 */
const DEMO = {
  hero: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
  menu: [
    'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9',
    'https://images.unsplash.com/photo-1551183053-bf91a1d81141',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38',
    'https://images.unsplash.com/photo-1600891964599-f61ba0e24092',
    'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9',
    'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3',
  ],
  areas: [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de',
  ],
  gallery: [
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b',
    'https://images.unsplash.com/photo-1473093295043-cdd812d0e601',
    'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17',
  ],
  team: [
    'https://images.unsplash.com/photo-1577219491135-ce391730fb2c',
    'https://images.unsplash.com/photo-1583394293214-28ded15ee548',
  ],
} as const

/**
 * Configuração padrão. Tudo que faltar em `restaurante.config.json` cai aqui:
 * fundo escuro com bordô vinho, e o conteúdo de demonstração de uma cantina.
 */
export const DEFAULT_CONFIG: SiteConfig = {
  brand: {
    name: 'Restaurante',
    tagline: 'Cozinha italiana de família',
    logoUrl: '',
    faviconUrl: '',
  },

  colors: {
    background: '#140B0C',
    surface: '#1F1214',
    text: '#F7F1EE',
    muted: '#B8A9A6',
    brand: '#8E1B24',
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
    headline: 'Sua mesa\nestá esperando',
    subheadline: 'Massa fresca, forno a lenha e vinho da casa',
    ctaLabel: 'Reservar mesa no WhatsApp',
  },

  menu: {
    url: '',
    items: [
      {
        slug: '',
        name: 'Fettuccine alla Nonna',
        description: 'Massa fresca, ragù de costela cozido por 8 horas',
        category: 'Massas',
        price: 'R$ 68',
        imageUrl: DEMO.menu[0],
        highlight: true,
      },
      {
        slug: '',
        name: 'Ravioli de Burrata',
        description: 'Molho de tomate San Marzano e manjericão',
        category: 'Massas',
        price: 'R$ 72',
        imageUrl: DEMO.menu[1],
        highlight: false,
      },
      {
        slug: '',
        name: 'Pizza Margherita',
        description: 'Forno a lenha, mozzarella de búfala',
        category: 'Pizzas',
        price: 'R$ 59',
        imageUrl: DEMO.menu[2],
        highlight: false,
      },
      {
        slug: '',
        name: 'Filé ao Barolo',
        description: 'Redução de vinho tinto e risoto de parmesão',
        category: 'Carnes',
        price: 'R$ 98',
        imageUrl: DEMO.menu[3],
        highlight: false,
      },
      {
        slug: '',
        name: 'Tiramisù da Casa',
        description: 'Receita da nonna, com café coado na hora',
        category: 'Sobremesas',
        price: 'R$ 32',
        imageUrl: DEMO.menu[4],
        highlight: false,
      },
      {
        slug: '',
        name: 'Vinho da Casa',
        description: 'Taça ou garrafa — pergunte pela uva do mês',
        category: 'Bebidas',
        price: 'a partir de R$ 29',
        imageUrl: DEMO.menu[5],
        highlight: false,
      },
    ],
  },

  areas: [
    {
      slug: '',
      name: 'Salão',
      description: 'Climatizado, perto do forno a lenha',
      capacity: 40,
      imageUrl: DEMO.areas[0],
      bookable: true,
    },
    {
      slug: '',
      name: 'Varanda',
      description: 'Ao ar livre, ótima para o fim de tarde',
      capacity: 20,
      imageUrl: DEMO.areas[1],
      bookable: true,
    },
  ],

  gallery: [
    { url: DEMO.gallery[0], alt: 'Mesa posta para o jantar' },
    { url: DEMO.gallery[1], alt: 'Salão do restaurante' },
    { url: DEMO.gallery[2], alt: 'Prato da casa' },
    { url: DEMO.gallery[3], alt: 'Balcão de drinks' },
    { url: DEMO.gallery[4], alt: 'Massa fresca' },
    { url: DEMO.gallery[5], alt: 'Ambiente à noite' },
  ],

  // `phone` vazio de propósito na demonstração: telefone de colaborador é dado
  // pessoal, e quem preenche é cada restaurante no estúdio.
  team: [
    { slug: '', name: 'Giulia', role: 'Chef', photoUrl: DEMO.team[0], instagram: '', phone: '' },
    { slug: '', name: 'Marco', role: 'Sommelier', photoUrl: DEMO.team[1], instagram: '', phone: '' },
  ],

  testimonials: [
    { name: 'Marina L.', rating: 5, text: 'Reservei pelo WhatsApp em um minuto e a mesa estava pronta quando chegamos.', photoUrl: '' },
    { name: 'Carlos P.', rating: 5, text: 'O fettuccine é o melhor da cidade. Voltamos toda sexta.', photoUrl: '' },
    { name: 'Júlia R.', rating: 5, text: 'Comemoramos o aniversário da minha mãe na varanda. Atendimento impecável.', photoUrl: '' },
  ],

  hours: {
    mon: [],
    tue: [['18:00', '23:00']],
    wed: [['18:00', '23:00']],
    thu: [['18:00', '23:00']],
    fri: [['12:00', '15:00'], ['18:00', '23:30']],
    sat: [['12:00', '16:00'], ['18:00', '23:30']],
    sun: [['12:00', '17:00']],
  },

  features: {
    menu: true,
    areas: true,
    gallery: true,
    team: true,
    testimonials: true,
    hours: true,
    map: true,
  },

  booking: {
    slotStepMin: 30,
    leadTimeMin: 60,
    horizonDays: 30,
    durationMin: 120,
    lastSeatingMin: 60,
    maxPerContact: 2,
    cancelDeadlineHours: 2,
    maxPartySize: 20,
    approvalAbovePartySize: 8,
  },

  whatsapp: {
    greeting: '',
    paymentMethods: 'Pix, dinheiro, débito, crédito e vale-refeição',
    reviewUrl: '',
    handoffMinutes: 30,
    quietHours: ['23:30', '09:00'],
    reativacaoDias: 45,
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
    // `config/textos.ts`. O restaurante sobrescreve só o que quiser mudar.
    textos: {},
    owner: {
      phones: [],
      pauseMinutes: 60,
      afternoonStartHour: 11,
      eveningStartHour: 17,
    },
  },
}
