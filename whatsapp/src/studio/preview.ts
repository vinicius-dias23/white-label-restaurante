import type { SiteConfig } from '@restaurante/shared/config'
import { isTextoKey, TEXTOS, type TextoKey } from '@restaurante/shared/config'
import { renderTexto } from '@restaurante/shared/lib/texto'
import {
  acoesReservaScreen,
  aguardandoAprovacaoScreen,
  atendenteScreen,
  canceladoScreen,
  cancelamentoTardeScreen,
  cardapioScreen,
  confirmarCancelamentoScreen,
  confirmarScreen,
  digitarPessoasScreen,
  enderecoScreen,
  escolherAmbienteScreen,
  escolherDiaScreen,
  escolherHorarioScreen,
  escolherPessoasScreen,
  grupoGrandeScreen,
  horarioOcupadoScreen,
  horariosScreen,
  limiteReservasScreen,
  menuScreen,
  minhasReservasScreen,
  naoEntendiScreen,
  optInScreen,
  optOutScreen,
  pagamentoScreen,
  presencaConfirmadaScreen,
  reservadoScreen,
  semHorarioScreen,
} from '../bot/screens.js'
import { makeT } from '../bot/textos.js'
import { resolveSlugs } from '../tenants/slug.js'
import {
  avisoAtendente,
  avisoCancelamento,
  avisoNovaReserva,
  pedidoAprovacao,
  reservaAprovadaMessage,
  reservaRecusadaMessage,
} from '../scheduler/messages.js'
import type { AreaRecord, Tenant } from '../tenants/types.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'

/**
 * O preview do estúdio.
 *
 * Monta a mensagem pelos MESMOS construtores que o bot usa, com dados de
 * exemplo. É o único jeito de o dono ver antes de salvar o que a Meta vai
 * cortar, e que o rótulo de 22 caracteres não cabe no botão.
 *
 * As telas dos painéis do dono e da recepção tocam o banco, então só os avisos
 * entram aqui: para o resto o estúdio mostra o texto com as variáveis
 * preenchidas, que é o que dá para garantir sem inventar uma noite falsa.
 */

const TO = '5511988887777'
const AGORA = new Date('2026-08-28T12:00:00.000Z')
const SLOT = new Date('2026-08-28T23:00:00.000Z')

/**
 * Os ambientes do preview saem do config do restaurante, não de uma lista
 * inventada.
 *
 * Em produção esses registros vêm do banco, gravados pelo `syncCatalog` a
 * partir do mesmo config — então derivar aqui mostra exatamente o que o cliente
 * vai ver, inclusive o ambiente que o dono acabou de digitar e ainda não salvou.
 */
function ambientesDe(config: SiteConfig): AreaRecord[] {
  const reservaveis = config.areas.filter((area) => area.bookable && area.capacity > 0)
  const lista = reservaveis.length > 0 ? reservaveis : [{ slug: '', name: config.brand.name, capacity: 40 }]
  const slugs = resolveSlugs(lista, 'ambiente')
  return lista.map((area, index) => ({
    id: `amb-${index}`,
    slug: slugs[index]!,
    name: area.name,
    capacity: area.capacity,
    active: true,
    sortOrder: index,
  }))
}

function descricoesDe(config: SiteConfig): Record<string, string> {
  return Object.fromEntries(config.areas.map((area) => [area.name, area.description]))
}

const RESERVA = {
  id: 'res-1',
  partySize: 4,
  areaName: 'Varanda',
  startsAt: SLOT,
  pending: false,
}

const RESUMO = {
  partySize: 4,
  areaName: 'Varanda',
  slot: SLOT,
}

const DIAS = Array.from({ length: 5 }, (_, i) => ({
  day: `2026-08-${28 + i}`,
  date: new Date(SLOT.getTime() + i * 24 * 60 * 60 * 1000),
}))

const HORARIOS = Array.from({ length: 6 }, (_, i) => new Date(SLOT.getTime() + i * 30 * 60 * 1000))

const DADOS_AVISO = {
  contactName: 'Marina Souza',
  contactWaId: TO,
  partySize: 4,
  areaName: 'Varanda',
  startsAt: SLOT,
  reservationId: 'res-1',
}

const DADOS_GRUPO = { ...DADOS_AVISO, partySize: 12, areaName: 'Salão' }

/** Uma cena: as chaves que ela mostra e a mensagem que ela monta. */
interface Cena {
  keys: TextoKey[]
  monta: (tenant: Tenant) => OutgoingMessage
}

const CENAS: Cena[] = [
  {
    keys: [
      'cliente.menu.saudacao',
      'cliente.menu.corpo',
      'rotulos.lista.verOpcoes',
      'rotulos.secao.atendimento',
      'rotulos.menu.reservar',
      'rotulos.menu.reservarDesc',
      'rotulos.menu.minhas',
      'rotulos.menu.minhasDesc',
      'rotulos.menu.cardapio',
      'rotulos.menu.cardapioDesc',
      'rotulos.menu.horarios',
      'rotulos.menu.endereco',
      'rotulos.menu.enderecoDesc',
      'rotulos.menu.pagamento',
      'rotulos.menu.atendente',
      'rotulos.menu.atendenteDesc',
    ],
    monta: (tenant) => menuScreen(TO, tenant),
  },
  { keys: ['cliente.menu.naoEntendi'], monta: (tenant) => naoEntendiScreen(TO, tenant) },
  {
    keys: ['cliente.cardapio.titulo', 'cliente.cardapio.link', 'rotulos.botao.reservar', 'rotulos.botao.voltarMenu'],
    monta: (tenant) => cardapioScreen(TO, tenant),
  },
  {
    keys: [
      'cliente.horarios.titulo',
      'cliente.horarios.aberto',
      'cliente.horarios.fechado',
      'cliente.horarios.fechadoComProxima',
    ],
    monta: (tenant) => horariosScreen(TO, tenant, AGORA),
  },
  { keys: ['cliente.endereco.corpo'], monta: (tenant) => enderecoScreen(TO, tenant) },
  { keys: ['cliente.pagamento.corpo'], monta: (tenant) => pagamentoScreen(TO, tenant) },
  {
    keys: ['cliente.atendente.corpo', 'cliente.atendente.pausa'],
    monta: (tenant) => atendenteScreen(TO, tenant),
  },
  {
    keys: [
      'cliente.escolherPessoas.corpo',
      'rotulos.lista.escolher',
      'rotulos.secao.pessoas',
      'rotulos.pessoa.uma',
      'rotulos.pessoa.varias',
      'rotulos.linha.maisPessoas',
      'rotulos.linha.maisPessoasDesc',
      'rotulos.linha.voltarMenu',
    ],
    monta: (tenant) => escolherPessoasScreen(TO, makeT(tenant.config), tenant.config.booking.maxPartySize),
  },
  {
    keys: ['cliente.digitarPessoas.corpo'],
    monta: (tenant) => digitarPessoasScreen(TO, makeT(tenant.config), tenant.config.booking.maxPartySize),
  },
  {
    keys: ['cliente.grupoGrande.corpo', 'rotulos.botao.atendente'],
    monta: (tenant) => grupoGrandeScreen(TO, makeT(tenant.config), tenant.config.booking.maxPartySize + 5),
  },
  {
    keys: [
      'cliente.escolherAmbiente.corpo',
      'rotulos.secao.ambientes',
      'rotulos.linha.tantoFaz',
      'rotulos.linha.tantoFazDesc',
    ],
    monta: (tenant) =>
      escolherAmbienteScreen(
        TO,
        makeT(tenant.config),
        ambientesDe(tenant.config),
        descricoesDe(tenant.config),
        4,
      ),
  },
  {
    keys: ['cliente.escolherDia.corpo', 'rotulos.lista.escolherDia', 'rotulos.secao.dias', 'rotulos.linha.maisDias'],
    monta: (tenant) => escolherDiaScreen(TO, makeT(tenant.config), DIAS, tenant.timezone, 0, AGORA),
  },
  {
    keys: [
      'cliente.escolherHorario.corpo',
      'rotulos.lista.verHorarios',
      'rotulos.secao.outrasOpcoes',
      'rotulos.linha.maisHorarios',
    ],
    monta: (tenant) =>
      escolherHorarioScreen(TO, makeT(tenant.config), SLOT, HORARIOS, tenant.timezone, 0, AGORA),
  },
  {
    keys: [
      'cliente.confirmar.corpo',
      'rotulos.botao.confirmar',
      'rotulos.botao.trocarHorario',
      'rotulos.botao.cancelar',
    ],
    monta: (tenant) => confirmarScreen(TO, makeT(tenant.config), RESUMO, tenant.timezone, false, AGORA),
  },
  {
    keys: ['cliente.confirmar.aprovacao', 'rotulos.ambienteQualquer'],
    monta: (tenant) => {
      const t = makeT(tenant.config)
      return confirmarScreen(
        TO,
        t,
        { partySize: 12, areaName: t('rotulos.ambienteQualquer'), slot: SLOT },
        tenant.timezone,
        true,
        AGORA,
      )
    },
  },
  {
    keys: ['cliente.reservado.corpo', 'cliente.reservado.endereco'],
    monta: (tenant) => reservadoScreen(TO, RESUMO, tenant, AGORA),
  },
  {
    keys: ['cliente.aguardandoAprovacao.corpo'],
    monta: (tenant) => aguardandoAprovacaoScreen(TO, { ...RESUMO, partySize: 12 }, tenant, AGORA),
  },
  {
    keys: ['cliente.aprovada.corpo'],
    monta: (tenant) => reservaAprovadaMessage(TO, tenant, DADOS_GRUPO),
  },
  {
    keys: ['cliente.recusada.corpo', 'rotulos.botao.outroHorario'],
    monta: (tenant) => reservaRecusadaMessage(TO, tenant, DADOS_GRUPO),
  },
  {
    keys: ['cliente.semHorario.corpo'],
    monta: (tenant) => semHorarioScreen(TO, makeT(tenant.config)),
  },
  {
    keys: ['cliente.horarioOcupado.corpo', 'rotulos.botao.verOutrosHorarios'],
    monta: (tenant) => horarioOcupadoScreen(TO, makeT(tenant.config)),
  },
  {
    keys: [
      'cliente.limiteReservas.corpo',
      'cliente.limiteReservas.um',
      'cliente.limiteReservas.varios',
      'rotulos.botao.minhas',
    ],
    monta: (tenant) => limiteReservasScreen(TO, makeT(tenant.config), tenant.config.booking.maxPerContact),
  },
  {
    keys: ['cliente.minhasReservas.titulo', 'rotulos.lista.verReservas', 'rotulos.secao.reservas', 'rotulos.status.pendente'],
    monta: (tenant) =>
      minhasReservasScreen(
        TO,
        makeT(tenant.config),
        [RESERVA, { ...RESERVA, id: 'res-2', partySize: 12, areaName: 'Salão', pending: true }],
        tenant.timezone,
        AGORA,
      ),
  },
  {
    keys: ['cliente.minhasReservas.vazio', 'rotulos.botao.reservarMesa'],
    monta: (tenant) => minhasReservasScreen(TO, makeT(tenant.config), [], tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.acoesReserva.corpo', 'cliente.acoesReserva.pendente', 'rotulos.botao.remarcar'],
    monta: (tenant) =>
      acoesReservaScreen(TO, makeT(tenant.config), { ...RESERVA, pending: true }, tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.confirmarCancelamento.corpo', 'rotulos.botao.simCancelar', 'rotulos.botao.naoManter'],
    monta: (tenant) => confirmarCancelamentoScreen(TO, makeT(tenant.config), RESERVA, tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.cancelado.corpo', 'rotulos.botao.reservarOutra'],
    monta: (tenant) => canceladoScreen(TO, makeT(tenant.config)),
  },
  {
    keys: ['cliente.cancelamentoTarde.corpo'],
    monta: (tenant) =>
      cancelamentoTardeScreen(TO, makeT(tenant.config), tenant.config.booking.cancelDeadlineHours),
  },
  {
    keys: ['cliente.presencaConfirmada.corpo'],
    monta: (tenant) => presencaConfirmadaScreen(TO, makeT(tenant.config)),
  },
  { keys: ['cliente.optOut.corpo'], monta: (tenant) => optOutScreen(TO, makeT(tenant.config)) },
  {
    keys: ['cliente.optIn.corpo'],
    monta: (tenant) => optInScreen(TO, makeT(tenant.config), tenant.config.brand.name),
  },
  {
    keys: ['dono.aviso.novaReserva'],
    monta: (tenant) => avisoNovaReserva(TO, tenant, DADOS_AVISO),
  },
  {
    keys: ['dono.aviso.pedidoAprovacao', 'rotulos.dono.aprovar', 'rotulos.dono.recusar'],
    monta: (tenant) => pedidoAprovacao(TO, tenant, DADOS_GRUPO),
  },
  {
    keys: ['dono.aviso.cancelamento', 'dono.semNome'],
    monta: (tenant) => avisoCancelamento(TO, tenant, DADOS_AVISO),
  },
  {
    keys: ['dono.aviso.atendente', 'dono.semNomeInicio'],
    monta: (tenant) => avisoAtendente(TO, tenant, 'Marina Souza', TO),
  },
]

const PORCHAVE = new Map<TextoKey, Cena>()
for (const cena of CENAS) {
  for (const key of cena.keys) if (!PORCHAVE.has(key)) PORCHAVE.set(key, cena)
}

/** As chaves que o estúdio consegue desenhar como mensagem de verdade. */
export const PREVIEW_KEYS: ReadonlySet<TextoKey> = new Set(PORCHAVE.keys())

/** Valores de exemplo para a prévia por substituição, quando não há cena. */
const EXEMPLOS: Record<string, string> = {
  marca: 'Cantina Bella Nonna',
  saudacao: 'Olá! Aqui é a Cantina Bella Nonna 🍝',
  cliente: 'Marina Souza',
  pessoas: '4 pessoas',
  ambiente: 'Varanda',
  data: 'sexta, 28/08 às 20:00',
  dia: 'sexta, 28/08',
  hora: '20:00',
  horas: '2',
  endereco: 'Rua Exemplo, 123 — Centro',
  link: 'https://maps.google.com/?q=Rua+Exemplo,+123',
  formas: 'Pix, dinheiro, débito e crédito',
  minutos: '30',
  pausa: ' por 30 minutos',
  limite: '2',
  maximo: '20',
  quantos: '2 reservas',
  total: '3',
  reservas: '12',
  compareceram: '10',
  faltaram: '1',
  periodo: 'Hoje',
  aviso: '',
  status: ' ✅',
  aprovacao: '',
  de: '11',
  ate: '17',
  nome: 'Marina',
  waId: '5511988887777',
  '1': 'Marina',
  '2': 'Cantina Bella Nonna',
  '3': '4 pessoas',
  '4': 'sexta, 28/08 às 20:00',
}

export type Preview =
  | { tipo: 'payload'; payload: OutgoingMessage }
  | { tipo: 'texto'; texto: string }

/**
 * Aplica os textos que estão na tela (ainda não salvos) sobre o config do
 * restaurante — é o que faz o preview mostrar a edição, e não o que está no disco.
 */
function comEdicoes(config: SiteConfig, editados: Record<string, string>): SiteConfig {
  const textos = { ...config.whatsapp.textos }
  for (const [key, valor] of Object.entries(editados)) {
    if (!isTextoKey(key)) continue
    const texto = valor.trim()
    if (texto === '') delete textos[key]
    else textos[key] = texto
  }
  return { ...config, whatsapp: { ...config.whatsapp, textos } }
}

const TENANT_EXEMPLO = (config: SiteConfig): Tenant => ({
  id: 'preview',
  slug: 'preview',
  displayName: config.brand.name,
  phoneNumberId: 'preview',
  wabaId: 'preview',
  ownerPhone: TO,
  timezone: 'America/Sao_Paulo',
  config,
  active: true,
  botPausedUntil: null,
})

/**
 * A tela que cada aba de conteúdo produz.
 *
 * Serve para o dono ver o efeito de mexer no catálogo: mudou o preço, o
 * cardápio do WhatsApp muda junto; tirou um ambiente, a lista de escolha encolhe.
 */
const TELA_DA_SECAO: Record<string, (tenant: Tenant) => OutgoingMessage> = {
  menu: (tenant) => cardapioScreen(TO, tenant),
  areas: (tenant) =>
    escolherAmbienteScreen(
      TO,
      makeT(tenant.config),
      ambientesDe(tenant.config),
      descricoesDe(tenant.config),
      4,
    ),
  team: (tenant) => menuScreen(TO, tenant),
  hours: (tenant) => horariosScreen(TO, tenant, AGORA),
  brand: (tenant) => menuScreen(TO, tenant),
  contact: (tenant) => enderecoScreen(TO, tenant),
  booking: (tenant) => escolherPessoasScreen(TO, makeT(tenant.config), tenant.config.booking.maxPartySize),
  whatsapp: (tenant) => pagamentoScreen(TO, tenant),
}

export const SECOES_COM_PREVIEW = Object.keys(TELA_DA_SECAO)

/** Preview de uma aba de conteúdo, montado sobre o config que está na tela. */
export function previewConteudo(secao: string, config: SiteConfig): Preview | null {
  const monta = TELA_DA_SECAO[secao]
  if (!monta) return null
  return { tipo: 'payload', payload: monta(TENANT_EXEMPLO(config)) }
}

export function previewDe(
  key: TextoKey,
  config: SiteConfig,
  editados: Record<string, string>,
): Preview {
  const comTextos = comEdicoes(config, editados)
  const cena = PORCHAVE.get(key)

  if (cena) {
    return { tipo: 'payload', payload: cena.monta(TENANT_EXEMPLO(comTextos)) }
  }

  // Sem cena: mostra o texto com as variáveis preenchidas por exemplos.
  const template = comTextos.whatsapp.textos[key] ?? TEXTOS[key].padrao
  return { tipo: 'texto', texto: renderTexto(template, EXEMPLOS) }
}
