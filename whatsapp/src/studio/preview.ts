import type { SiteConfig } from '@barbearia/shared/config'
import { isTextoKey, TEXTOS, type TextoKey } from '@barbearia/shared/config'
import { renderTexto } from '@barbearia/shared/lib/texto'
import {
  acoesAgendamentoScreen,
  agendadoScreen,
  atendenteScreen,
  canceladoScreen,
  cancelamentoTardeScreen,
  confirmarCancelamentoScreen,
  confirmarScreen,
  enderecoScreen,
  escolherBarbeiroScreen,
  escolherDiaScreen,
  escolherHorarioScreen,
  escolherServicoScreen,
  horarioOcupadoScreen,
  horariosScreen,
  limiteAgendamentosScreen,
  menuScreen,
  meusAgendamentosScreen,
  naoEntendiScreen,
  optInScreen,
  optOutScreen,
  pagamentoScreen,
  presencaConfirmadaScreen,
  semHorarioScreen,
  servicosScreen,
} from '../bot/screens.js'
import { makeT } from '../bot/textos.js'
import { resolveDuration } from '../booking/duration.js'
import { resolveSlugs } from '../tenants/slug.js'
import { avisoAtendente, avisoCancelamento, avisoNovoAgendamento } from '../scheduler/messages.js'
import type { Barber, ServiceRecord, Tenant } from '../tenants/types.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'

/**
 * O preview do estúdio.
 *
 * Monta a mensagem pelos MESMOS construtores que o bot usa, com dados de
 * exemplo. É o único jeito de o dono ver antes de salvar o que a Meta vai
 * cortar, e que o rótulo de 22 caracteres não cabe no botão.
 *
 * As telas do painel do dono tocam o banco, então não entram aqui: para elas o
 * estúdio mostra o texto com as variáveis preenchidas, que é o que dá para
 * garantir sem inventar uma agenda falsa.
 */

const TO = '5511988887777'
const AGORA = new Date('2026-08-28T12:00:00.000Z')
const SLOT = new Date('2026-08-28T17:00:00.000Z')

/**
 * O catálogo do preview sai do config da barbearia, não de uma lista inventada.
 *
 * Em produção esses registros vêm do banco, gravados pelo `syncCatalog` a
 * partir do mesmo config — então derivar aqui mostra exatamente o que o cliente
 * vai ver, inclusive o serviço que o dono acabou de digitar e ainda não salvou.
 */
function servicosDe(config: SiteConfig): ServiceRecord[] {
  const slugs = resolveSlugs(config.services, 'servico')
  return config.services.map((service, index) => ({
    id: `svc-${index}`,
    slug: slugs[index]!,
    name: service.name,
    priceLabel: service.price,
    durationMin: resolveDuration(service, config.booking.defaultDurationMin).minutes,
    active: true,
    sortOrder: index,
  }))
}

function barbeirosDe(config: SiteConfig): Barber[] {
  const equipe = config.team.filter((member) => member.bookable)
  const time = equipe.length > 0 ? equipe : [{ slug: '', name: config.brand.name }]
  const slugs = resolveSlugs(time, 'barbeiro')
  return time.map((member, index) => ({
    id: `brb-${index}`,
    slug: slugs[index]!,
    name: member.name,
    // O preview não identifica ninguém: as telas que ele desenha são as do
    // cliente, e nenhuma delas olha o telefone do barbeiro.
    phone: '',
    active: true,
    sortOrder: index,
  }))
}

const AGENDAMENTO = {
  id: 'apt-1',
  serviceName: 'Corte + Barba',
  barberName: 'Zé',
  startsAt: SLOT,
}

const RESUMO = {
  serviceName: 'Corte + Barba',
  priceLabel: 'R$ 75',
  durationMin: 60,
  barberName: 'Zé',
  slot: SLOT,
}

const DIAS = Array.from({ length: 5 }, (_, i) => ({
  day: `2026-08-${28 + i}`,
  date: new Date(SLOT.getTime() + i * 24 * 60 * 60 * 1000),
}))

const HORARIOS = Array.from({ length: 6 }, (_, i) => new Date(SLOT.getTime() + i * 60 * 60 * 1000))

const DADOS_AVISO = {
  contactName: 'João Pereira',
  serviceName: 'Corte + Barba',
  barberName: 'Zé',
  startsAt: SLOT,
  appointmentId: 'apt-1',
}

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
      'rotulos.menu.agendar',
      'rotulos.menu.agendarDesc',
      'rotulos.menu.meus',
      'rotulos.menu.meusDesc',
      'rotulos.menu.servicos',
      'rotulos.menu.servicosDesc',
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
    keys: ['cliente.servicos.titulo', 'rotulos.botao.agendar', 'rotulos.botao.voltarMenu'],
    monta: (tenant) => servicosScreen(TO, tenant, servicosDe(tenant.config)),
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
    keys: ['cliente.escolherServico.corpo', 'rotulos.lista.verServicos', 'rotulos.secao.servicos', 'rotulos.linha.voltarMenu'],
    monta: (tenant) => escolherServicoScreen(TO, makeT(tenant.config), servicosDe(tenant.config)),
  },
  {
    keys: [
      'cliente.escolherBarbeiro.corpo',
      'rotulos.lista.escolher',
      'rotulos.secao.barbeiros',
      'rotulos.linha.semPreferencia',
      'rotulos.linha.semPreferenciaDesc',
    ],
    monta: (tenant) =>
      escolherBarbeiroScreen(
        TO,
        makeT(tenant.config),
        barbeirosDe(tenant.config),
        tenant.config.services[0]?.name ?? 'Corte',
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
      'rotulos.barbeiroQualquer',
    ],
    monta: (tenant) => confirmarScreen(TO, makeT(tenant.config), RESUMO, tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.agendado.corpo', 'cliente.agendado.endereco'],
    monta: (tenant) => agendadoScreen(TO, RESUMO, tenant, AGORA),
  },
  {
    keys: ['cliente.semHorario.corpo', 'rotulos.botao.atendente'],
    monta: (tenant) => semHorarioScreen(TO, makeT(tenant.config)),
  },
  {
    keys: ['cliente.horarioOcupado.corpo', 'rotulos.botao.verOutrosHorarios'],
    monta: (tenant) => horarioOcupadoScreen(TO, makeT(tenant.config)),
  },
  {
    keys: [
      'cliente.limiteAgendamentos.corpo',
      'cliente.limiteAgendamentos.um',
      'cliente.limiteAgendamentos.varios',
      'rotulos.botao.meus',
    ],
    monta: (tenant) =>
      limiteAgendamentosScreen(TO, makeT(tenant.config), tenant.config.booking.maxPerContact),
  },
  {
    keys: ['cliente.meusAgendamentos.titulo', 'rotulos.lista.verAgendamentos', 'rotulos.secao.agendamentos'],
    monta: (tenant) =>
      meusAgendamentosScreen(TO, makeT(tenant.config), [AGENDAMENTO], tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.meusAgendamentos.vazio', 'rotulos.botao.agendarHorario'],
    monta: (tenant) => meusAgendamentosScreen(TO, makeT(tenant.config), [], tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.acoesAgendamento.corpo', 'rotulos.botao.remarcar'],
    monta: (tenant) =>
      acoesAgendamentoScreen(TO, makeT(tenant.config), AGENDAMENTO, tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.confirmarCancelamento.corpo', 'rotulos.botao.simCancelar', 'rotulos.botao.naoManter'],
    monta: (tenant) =>
      confirmarCancelamentoScreen(TO, makeT(tenant.config), AGENDAMENTO, tenant.timezone, AGORA),
  },
  {
    keys: ['cliente.cancelado.corpo', 'rotulos.botao.marcarOutro'],
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
    keys: ['dono.aviso.novoAgendamento'],
    monta: (tenant) => avisoNovoAgendamento(TO, tenant, DADOS_AVISO),
  },
  {
    keys: ['dono.aviso.cancelamento', 'dono.semNome'],
    monta: (tenant) => avisoCancelamento(TO, tenant, DADOS_AVISO),
  },
  {
    keys: ['dono.aviso.atendente', 'dono.semNomeInicio'],
    monta: (tenant) => avisoAtendente(TO, tenant, 'João Pereira', TO),
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
  marca: 'Barbearia do Zé',
  saudacao: 'Olá! Aqui é a Barbearia do Zé 💈',
  servico: 'Corte + Barba',
  barbeiro: 'Zé',
  cliente: 'João Pereira',
  data: 'sexta, 28/08 às 14:00',
  dia: 'sexta, 28/08',
  hora: '14:00',
  horas: '2',
  duracao: '1h',
  preco: ' — R$ 75',
  endereco: 'Rua Exemplo, 123 — Centro',
  link: 'https://maps.google.com/?q=Rua+Exemplo,+123',
  formas: 'Pix, dinheiro, débito e crédito',
  minutos: '30',
  pausa: ' por 30 minutos',
  limite: '2',
  quantos: '2 horários marcados',
  total: '3',
  aviso: '',
  status: '',
  confirmado: ' ✅',
  periodo: 'o dia todo',
  de: '12',
  ate: '18',
  nome: 'João',
  waId: '5511988887777',
  '1': 'João',
  '2': 'Barbearia do Zé',
}

export type Preview =
  | { tipo: 'payload'; payload: OutgoingMessage }
  | { tipo: 'texto'; texto: string }

/**
 * Aplica os textos que estão na tela (ainda não salvos) sobre o config da
 * barbearia — é o que faz o preview mostrar a edição, e não o que está no disco.
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
 * Serve para o dono ver o efeito de mexer no catálogo: mudou o preço, a tela de
 * serviços muda junto; tirou um barbeiro, a lista de escolha encolhe.
 */
const TELA_DA_SECAO: Record<string, (tenant: Tenant) => OutgoingMessage> = {
  services: (tenant) => servicosScreen(TO, tenant, servicosDe(tenant.config)),
  team: (tenant) =>
    escolherBarbeiroScreen(
      TO,
      makeT(tenant.config),
      barbeirosDe(tenant.config),
      tenant.config.services[0]?.name ?? 'Corte',
    ),
  hours: (tenant) => horariosScreen(TO, tenant, AGORA),
  brand: (tenant) => menuScreen(TO, tenant),
  contact: (tenant) => enderecoScreen(TO, tenant),
  booking: (tenant) =>
    limiteAgendamentosScreen(TO, makeT(tenant.config), tenant.config.booking.maxPerContact),
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
