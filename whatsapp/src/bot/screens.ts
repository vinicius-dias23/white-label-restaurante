import { DAY_KEYS, DAY_LABELS, type SiteConfig } from '@barbearia/shared/config'
import { formatRanges } from '@barbearia/shared/lib/hours'
import { mapsUrl } from '@barbearia/shared/lib/whatsapp'
import { formatDuration } from '../booking/duration.js'
import { openStateInZone } from '../booking/open-state.js'
import { groupByPeriod, PERIOD_LABELS, type Period } from '../booking/slots.js'
import { formatDateTime, formatDayLabel, formatDayShort, formatTime } from '../lib/datetime.js'
import type { Barber, ServiceRecord, Tenant } from '../tenants/types.js'
import {
  buttonMessage,
  listMessage,
  textMessage,
  type ListRow,
  type ListSection,
  type OutgoingMessage,
} from '../whatsapp/payloads.js'
import { ACTION } from './machine.js'
import { makeT, type T } from './textos.js'

/**
 * As telas do atendimento: dados → payload do WhatsApp.
 *
 * Também são funções puras, então o teste consegue percorrer o menu inteiro e
 * conferir que nada estoura os limites da Meta — que é onde a integração
 * costuma quebrar em produção, com o cliente olhando.
 *
 * Nenhuma frase mora aqui: todo texto vem do catálogo (`config/textos.ts`) pelo
 * `t()`, e a barbearia sobrescreve o que quiser em `whatsapp.textos`. O que
 * sobra nestas funções é a montagem do payload e as regras de quando cada
 * pedaço aparece.
 *
 * Por isso toda tela recebe o `t` da barbearia — inclusive as que não usam mais
 * nenhum outro dado dela.
 */

/** Quantas linhas sobram para conteúdo depois de reservar a de "voltar ao menu". */
const ROWS_WITH_BACK = 9

const backRow = (t: T): ListRow => ({ id: ACTION.menu, title: t('rotulos.linha.voltarMenu') })

/** Atalho para as telas que recebem o tenant inteiro. */
const tenantT = (tenant: Tenant): T => makeT(tenant.config)

function greeting(t: T, config: SiteConfig): string {
  return t('cliente.menu.saudacao', { marca: config.brand.name })
}

// ---------------------------------------------------------------------------
// Menu principal
// ---------------------------------------------------------------------------

export function menuScreen(to: string, tenant: Tenant, prefix = ''): OutgoingMessage {
  const { config } = tenant
  const t = tenantT(tenant)

  const rows: ListRow[] = [
    {
      id: ACTION.agendar,
      title: t('rotulos.menu.agendar'),
      description: t('rotulos.menu.agendarDesc'),
    },
    { id: ACTION.meus, title: t('rotulos.menu.meus'), description: t('rotulos.menu.meusDesc') },
    {
      id: ACTION.servicos,
      title: t('rotulos.menu.servicos'),
      description: t('rotulos.menu.servicosDesc'),
    },
    { id: ACTION.horarios, title: t('rotulos.menu.horarios') },
  ]

  if (config.contact.address) {
    rows.push({
      id: ACTION.endereco,
      title: t('rotulos.menu.endereco'),
      description: t('rotulos.menu.enderecoDesc'),
    })
  }
  if (config.whatsapp.paymentMethods) {
    rows.push({ id: ACTION.pagamento, title: t('rotulos.menu.pagamento') })
  }
  rows.push({
    id: ACTION.atendente,
    title: t('rotulos.menu.atendente'),
    description: t('rotulos.menu.atendenteDesc'),
  })

  const corpo = t('cliente.menu.corpo', {
    saudacao: greeting(t, config),
    marca: config.brand.name,
  })
  const body = prefix ? `${prefix}\n\n${corpo}` : corpo

  return listMessage(to, body, t('rotulos.lista.verOpcoes'), [
    { title: t('rotulos.secao.atendimento'), rows },
  ])
}

export function naoEntendiScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  return menuScreen(to, tenant, t('cliente.menu.naoEntendi'))
}

// ---------------------------------------------------------------------------
// Telas informativas
// ---------------------------------------------------------------------------

export function servicosScreen(to: string, tenant: Tenant, services: ServiceRecord[]): OutgoingMessage {
  const t = tenantT(tenant)

  const lines = services.map((service) => {
    const price = service.priceLabel ? ` — ${service.priceLabel}` : ''
    return `• *${service.name}*${price}\n  ${formatDuration(service.durationMin)}`
  })

  const body = [t('cliente.servicos.titulo', { marca: tenant.config.brand.name }), '', ...lines].join('\n')

  return buttonMessage(to, body, [
    { id: ACTION.agendar, title: t('rotulos.botao.agendar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function horariosScreen(to: string, tenant: Tenant, now: Date = new Date()): OutgoingMessage {
  const { hours } = tenant.config
  const t = tenantT(tenant)
  const state = openStateInZone(hours, tenant.timezone, now)

  const table = DAY_KEYS.map((day) => `${DAY_LABELS[day].padEnd(8)} ${formatRanges(hours[day])}`)

  const status = state.open
    ? t('cliente.horarios.aberto')
    : state.nextOpening
      ? t('cliente.horarios.fechadoComProxima', {
          dia: state.nextOpening.label,
          hora: state.nextOpening.time,
        })
      : t('cliente.horarios.fechado')

  const body = [status, '', t('cliente.horarios.titulo'), ...table].join('\n')

  return buttonMessage(to, body, [
    { id: ACTION.agendar, title: t('rotulos.botao.agendar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function enderecoScreen(to: string, tenant: Tenant): OutgoingMessage {
  const { contact, brand } = tenant.config
  const link = mapsUrl(contact.address, contact.mapsUrl)

  const t = tenantT(tenant)
  const body = t('cliente.endereco.corpo', {
    marca: brand.name,
    endereco: contact.address,
    link,
  })

  // preview_url ligado: o WhatsApp mostra o cartão do mapa embaixo da mensagem.
  return textMessage(to, body, true)
}

export function pagamentoScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  const body = t('cliente.pagamento.corpo', { formas: tenant.config.whatsapp.paymentMethods })

  return buttonMessage(to, body, [
    { id: ACTION.agendar, title: t('rotulos.botao.agendar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function atendenteScreen(to: string, tenant: Tenant): OutgoingMessage {
  const t = tenantT(tenant)
  const minutes = tenant.config.whatsapp.handoffMinutes
  const pausa = minutes > 0 ? t('cliente.atendente.pausa', { minutos: minutes }) : ''

  return textMessage(to, t('cliente.atendente.corpo', { pausa }))
}

// ---------------------------------------------------------------------------
// Fluxo de agendamento
// ---------------------------------------------------------------------------

export function escolherServicoScreen(to: string, t: T, services: ServiceRecord[]): OutgoingMessage {
  const rows: ListRow[] = services.slice(0, ROWS_WITH_BACK).map((service) => ({
    id: `${ACTION.service}${service.id}`,
    title: service.name,
    description: [service.priceLabel, formatDuration(service.durationMin)].filter(Boolean).join(' · '),
  }))
  rows.push(backRow(t))

  return listMessage(to, t('cliente.escolherServico.corpo'), t('rotulos.lista.verServicos'), [
    { title: t('rotulos.secao.servicos'), rows },
  ])
}

export function escolherBarbeiroScreen(
  to: string,
  t: T,
  barbers: Barber[],
  serviceName: string,
): OutgoingMessage {
  // Uma pessoa só na equipe: perguntar "com quem?" seria perda de tempo — mas
  // quem chama já pula esta tela, então aqui só montamos o que veio.
  const rows: ListRow[] = [
    {
      id: ACTION.barberAny,
      title: t('rotulos.linha.semPreferencia'),
      description: t('rotulos.linha.semPreferenciaDesc'),
    },
    ...barbers.slice(0, ROWS_WITH_BACK - 1).map((barber) => ({
      id: `${ACTION.barber}${barber.id}`,
      title: barber.name,
    })),
  ]
  rows.push(backRow(t))

  return listMessage(
    to,
    t('cliente.escolherBarbeiro.corpo', { servico: serviceName }),
    t('rotulos.lista.escolher'),
    [{ title: t('rotulos.secao.barbeiros'), rows }],
  )
}

export interface DayOption {
  day: string
  date: Date
}

export function escolherDiaScreen(
  to: string,
  t: T,
  days: DayOption[],
  timezone: string,
  offset: number,
  now: Date = new Date(),
): OutgoingMessage {
  const page = days.slice(offset, offset + 8)
  const hasMore = days.length > offset + page.length

  const rows: ListRow[] = page.map((option) => ({
    id: `${ACTION.day}${option.day}`,
    title: formatDayShort(option.date, timezone, now),
  }))

  if (hasMore) {
    rows.push({ id: `${ACTION.dayMore}:${offset + page.length}`, title: t('rotulos.linha.maisDias') })
  }
  rows.push(backRow(t))

  return listMessage(to, t('cliente.escolherDia.corpo'), t('rotulos.lista.escolherDia'), [
    { title: t('rotulos.secao.dias'), rows },
  ])
}

export function escolherHorarioScreen(
  to: string,
  t: T,
  date: Date,
  slots: Date[],
  timezone: string,
  offset: number,
  now: Date = new Date(),
): OutgoingMessage {
  const page = slots.slice(offset, offset + 8)
  const hasMore = slots.length > offset + page.length

  // As linhas saem agrupadas por turno: o dia inteiro cabe numa lista só, e o
  // cliente ainda enxerga "manhã" e "tarde" sem precisar de uma pergunta extra.
  const groups = groupByPeriod(page, timezone)
  const sections: ListSection[] = (Object.keys(groups) as Period[])
    .filter((period) => groups[period].length > 0)
    .map((period) => ({
      title: PERIOD_LABELS[period],
      rows: groups[period].map((slot) => ({
        id: `${ACTION.time}${slot.toISOString()}`,
        title: formatTime(slot, timezone),
      })),
    }))

  const extra: ListRow[] = []
  if (hasMore) {
    extra.push({
      id: `${ACTION.timeMore}:${offset + page.length}`,
      title: t('rotulos.linha.maisHorarios'),
    })
  }
  extra.push(backRow(t))
  sections.push({ title: t('rotulos.secao.outrasOpcoes'), rows: extra })

  return listMessage(
    to,
    t('cliente.escolherHorario.corpo', { dia: formatDayLabel(date, timezone, now) }),
    t('rotulos.lista.verHorarios'),
    sections,
  )
}

export interface BookingSummary {
  serviceName: string
  priceLabel: string
  durationMin: number
  barberName: string
  slot: Date
}

export function confirmarScreen(
  to: string,
  t: T,
  summary: BookingSummary,
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  const body = t('cliente.confirmar.corpo', {
    servico: summary.serviceName,
    preco: summary.priceLabel ? ` — ${summary.priceLabel}` : '',
    barbeiro: summary.barberName,
    data: formatDateTime(summary.slot, timezone, now),
    duracao: formatDuration(summary.durationMin),
  })

  return buttonMessage(to, body, [
    { id: ACTION.confirm, title: t('rotulos.botao.confirmar') },
    { id: ACTION.changeTime, title: t('rotulos.botao.trocarHorario') },
    { id: ACTION.abort, title: t('rotulos.botao.cancelar') },
  ])
}

/**
 * Confirmação do agendamento — a ÚNICA que o cliente recebe.
 *
 * Ela é a resposta ao toque em "Confirmar", então sai na hora e traz tudo:
 * serviço, preço, barbeiro, data, duração e endereço. Não existe uma segunda
 * confirmação saindo pela fila; duas mensagens iguais em sequência só poluem a
 * conversa. Os lembretes de 24h e 2h continuam vindo pela fila.
 */
export function agendadoScreen(
  to: string,
  summary: BookingSummary,
  tenant: Tenant,
  now: Date = new Date(),
): OutgoingMessage {
  const t = tenantT(tenant)
  const endereco = tenant.config.contact.address
    ? t('cliente.agendado.endereco', { endereco: tenant.config.contact.address })
    : ''

  const body = t('cliente.agendado.corpo', {
    marca: tenant.config.brand.name,
    servico: summary.serviceName,
    preco: summary.priceLabel ? ` — ${summary.priceLabel}` : '',
    barbeiro: summary.barberName,
    data: formatDateTime(summary.slot, tenant.timezone, now),
    duracao: formatDuration(summary.durationMin),
    endereco,
  })

  return buttonMessage(to, body, [{ id: ACTION.menu, title: t('rotulos.botao.voltarMenu') }])
}

export function semHorarioScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.semHorario.corpo'), [
    { id: ACTION.atendente, title: t('rotulos.botao.atendente') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function horarioOcupadoScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.horarioOcupado.corpo'), [
    { id: ACTION.changeTime, title: t('rotulos.botao.verOutrosHorarios') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function limiteAgendamentosScreen(to: string, t: T, limite: number): OutgoingMessage {
  const quantos =
    limite === 1
      ? t('cliente.limiteAgendamentos.um')
      : t('cliente.limiteAgendamentos.varios', { limite })

  return buttonMessage(to, t('cliente.limiteAgendamentos.corpo', { quantos }), [
    { id: ACTION.meus, title: t('rotulos.botao.meus') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

// ---------------------------------------------------------------------------
// Agendamentos do cliente
// ---------------------------------------------------------------------------

export interface AppointmentSummary {
  id: string
  serviceName: string
  barberName: string
  startsAt: Date
}

export function meusAgendamentosScreen(
  to: string,
  t: T,
  appointments: AppointmentSummary[],
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  if (appointments.length === 0) {
    return buttonMessage(to, t('cliente.meusAgendamentos.vazio'), [
      { id: ACTION.agendar, title: t('rotulos.botao.agendarHorario') },
      { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
    ])
  }

  const rows: ListRow[] = appointments.slice(0, ROWS_WITH_BACK).map((appointment) => ({
    id: `${ACTION.appointment}${appointment.id}`,
    title: formatDayShort(appointment.startsAt, timezone, now),
    description: `${formatTime(appointment.startsAt, timezone)} · ${appointment.serviceName} · ${appointment.barberName}`,
  }))
  rows.push(backRow(t))

  return listMessage(to, t('cliente.meusAgendamentos.titulo'), t('rotulos.lista.verAgendamentos'), [
    { title: t('rotulos.secao.agendamentos'), rows },
  ])
}

export function acoesAgendamentoScreen(
  to: string,
  t: T,
  appointment: AppointmentSummary,
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  const body = t('cliente.acoesAgendamento.corpo', {
    data: formatDateTime(appointment.startsAt, timezone, now),
    servico: appointment.serviceName,
    barbeiro: appointment.barberName,
  })

  return buttonMessage(to, body, [
    { id: `${ACTION.reschedule}${appointment.id}`, title: t('rotulos.botao.remarcar') },
    { id: `${ACTION.cancel}${appointment.id}`, title: t('rotulos.botao.cancelar') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function confirmarCancelamentoScreen(
  to: string,
  t: T,
  appointment: AppointmentSummary,
  timezone: string,
  now: Date = new Date(),
): OutgoingMessage {
  const body = t('cliente.confirmarCancelamento.corpo', {
    data: formatDateTime(appointment.startsAt, timezone, now),
    servico: appointment.serviceName,
    barbeiro: appointment.barberName,
  })

  return buttonMessage(to, body, [
    { id: `${ACTION.cancelYes}${appointment.id}`, title: t('rotulos.botao.simCancelar') },
    { id: ACTION.cancelNo, title: t('rotulos.botao.naoManter') },
  ])
}

export function canceladoScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.cancelado.corpo'), [
    { id: ACTION.agendar, title: t('rotulos.botao.marcarOutro') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function cancelamentoTardeScreen(to: string, t: T, deadlineHours: number): OutgoingMessage {
  return buttonMessage(to, t('cliente.cancelamentoTarde.corpo', { horas: deadlineHours }), [
    { id: ACTION.atendente, title: t('rotulos.botao.atendente') },
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

export function presencaConfirmadaScreen(to: string, t: T): OutgoingMessage {
  return buttonMessage(to, t('cliente.presencaConfirmada.corpo'), [
    { id: ACTION.menu, title: t('rotulos.botao.voltarMenu') },
  ])
}

// ---------------------------------------------------------------------------
// LGPD
// ---------------------------------------------------------------------------

export function optOutScreen(to: string, t: T): OutgoingMessage {
  return textMessage(to, t('cliente.optOut.corpo'))
}

export function optInScreen(to: string, t: T, brandName: string): OutgoingMessage {
  return textMessage(to, t('cliente.optIn.corpo', { marca: brandName }))
}
