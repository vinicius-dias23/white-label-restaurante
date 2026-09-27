import { env } from '../env.js'
import { formatDateTime, formatTime } from '../lib/datetime.js'
import type { Tenant } from '../tenants/types.js'
import { ACTION, OWNER_DECISION } from '../bot/machine.js'
import { buttonMessage, ctaUrlMessage, templateMessage, textMessage, type OutgoingMessage } from '../whatsapp/payloads.js'
import type { OutboxKind } from '../db/repositories/outbox.js'
import { makeT } from '../bot/textos.js'

/**
 * Conteúdo de cada mensagem programada.
 *
 * A regra que decide o formato de cada uma é a janela de 24 horas: a Cloud API
 * só aceita texto livre nas 24h seguintes à última mensagem DO CLIENTE. Depois
 * disso, só template aprovado pela Meta.
 *
 *   · lembretes    → saem na véspera ou horas antes, quase sempre fora da
 *                    janela. Template obrigatório.
 *   · avisos ao dono → texto livre, e por isso só saem se ele tiver falado com
 *                    o bot nas últimas 24h.
 *
 * A confirmação da reserva não está aqui: ela é a resposta imediata ao toque
 * em "Confirmar" e mora em `bot/screens.ts` (`reservadoScreen`).
 *
 * O JSON de cada template está em docs/templates.md, com as variáveis
 * na mesma ordem usada aqui. Ordem trocada = erro 132000 e mensagem não enviada.
 *
 * O texto livre daqui — o pós-visita dentro da janela e os avisos ao dono —
 * vem do catálogo pelo `t()`, como o resto do bot. O corpo dos templates NÃO:
 * quem manda ali é o que está aprovado no WhatsApp Manager.
 */

export interface ReservationMessageData {
  contactName: string
  contactWaId: string
  partySize: number
  areaName: string
  startsAt: Date
  reservationId: string
}

/** "4 pessoas", no texto do restaurante. */
function pessoas(tenant: Tenant, total: number): string {
  const t = makeT(tenant.config)
  return total === 1 ? t('rotulos.pessoa.uma') : t('rotulos.pessoa.varias', { total })
}

/** Primeiro nome, para a mensagem não soar como cadastro de banco. */
function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first || 'tudo bem'
}

// ---------------------------------------------------------------------------
// Lembretes — template aprovado
// ---------------------------------------------------------------------------

/**
 * Lembrete da véspera, com dois botões de resposta rápida. É a mensagem que
 * mais reduz mesa vazia: o cliente confirma ou cancela com um toque, e os
 * lugares cancelados voltam para a lotação a tempo de outro grupo reservar.
 */
export function lembrete24hMessage(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  return templateMessage(to, env.templates.lembrete24h, env.defaultLocale, {
    bodyParams: [
      firstName(data.contactName),
      tenant.config.brand.name,
      pessoas(tenant, data.partySize),
      formatDateTime(data.startsAt, tenant.timezone),
    ],
    quickReplyPayloads: [
      `${ACTION.presencaOk}${data.reservationId}`,
      `${ACTION.presencaCancel}${data.reservationId}`,
    ],
  })
}

export function lembrete2hMessage(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  return templateMessage(to, env.templates.lembrete2h, env.defaultLocale, {
    bodyParams: [
      firstName(data.contactName),
      tenant.config.brand.name,
      formatTime(data.startsAt, tenant.timezone),
    ],
  })
}

/**
 * Agradecimento no dia seguinte, com botão para avaliar no Google.
 *
 * O template tem um botão de URL com sufixo dinâmico, mas o link de avaliação é
 * fixo por restaurante — então quando o cliente ainda está dentro da janela de
 * 24h (respondeu o lembrete, por exemplo) mandamos a versão interativa, que não
 * gasta template nem custo.
 */
export function posAtendimentoMessage(
  to: string,
  tenant: Tenant,
  data: ReservationMessageData,
  withinWindow: boolean,
): OutgoingMessage {
  const reviewUrl = tenant.config.whatsapp.reviewUrl

  if (withinWindow && reviewUrl) {
    const t = makeT(tenant.config)
    return ctaUrlMessage(
      to,
      t('cliente.posVisita.corpo', {
        nome: firstName(data.contactName),
        marca: tenant.config.brand.name,
      }),
      t('rotulos.botao.avaliar'),
      reviewUrl,
    )
  }

  return templateMessage(to, env.templates.posAtendimento, env.defaultLocale, {
    bodyParams: [firstName(data.contactName), tenant.config.brand.name],
  })
}

export function reativacaoMessage(
  to: string,
  tenant: Tenant,
  contactName: string,
  diasSemVir: number,
): OutgoingMessage {
  return templateMessage(to, env.templates.reativacao, env.defaultLocale, {
    bodyParams: [firstName(contactName), tenant.config.brand.name, String(diasSemVir)],
  })
}

export function aniversarioMessage(to: string, tenant: Tenant, contactName: string): OutgoingMessage {
  return templateMessage(to, env.templates.aniversario, env.defaultLocale, {
    bodyParams: [firstName(contactName), tenant.config.brand.name],
  })
}

// ---------------------------------------------------------------------------
// Avisos para o dono do restaurante
// ---------------------------------------------------------------------------

function avisoVars(tenant: Tenant, data: ReservationMessageData): Record<string, string> {
  const t = makeT(tenant.config)
  return {
    data: formatDateTime(data.startsAt, tenant.timezone),
    pessoas: pessoas(tenant, data.partySize),
    ambiente: data.areaName,
    cliente: data.contactName || t('dono.semNome'),
    waId: data.contactWaId,
  }
}

export function avisoNovaReserva(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  return textMessage(to, t('dono.aviso.novaReserva', avisoVars(tenant, data)))
}

export function avisoCancelamento(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  return textMessage(to, t('dono.aviso.cancelamento', avisoVars(tenant, data)))
}

/**
 * Pedido de grupo grande, com os botões que decidem. É o único aviso ao dono
 * que pede resposta — e por isso vai com o telefone do cliente: às vezes a
 * decisão depende de uma ligação ("é aniversário? querem bolo?").
 */
export function pedidoAprovacao(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  return buttonMessage(to, t('dono.aviso.pedidoAprovacao', avisoVars(tenant, data)), [
    { id: `${OWNER_DECISION.aprovar}${data.reservationId}`, title: t('rotulos.dono.aprovar') },
    { id: `${OWNER_DECISION.recusar}${data.reservationId}`, title: t('rotulos.dono.recusar') },
  ])
}

// ---------------------------------------------------------------------------
// Respostas ao cliente quando o dono decide
// ---------------------------------------------------------------------------

/**
 * Texto livre, e não template: o cliente acabou de pedir a reserva, então quase
 * sempre ainda está na janela de 24h quando o dono responde. Quem manda é o
 * `send()` do handler, que descarta (e registra) se a janela tiver fechado.
 */
export function reservaAprovadaMessage(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  const endereco = tenant.config.contact.address
    ? t('cliente.reservado.endereco', { endereco: tenant.config.contact.address })
    : ''
  return buttonMessage(
    to,
    t('cliente.aprovada.corpo', {
      marca: tenant.config.brand.name,
      pessoas: pessoas(tenant, data.partySize),
      ambiente: data.areaName,
      data: formatDateTime(data.startsAt, tenant.timezone),
      endereco,
    }),
    [{ id: ACTION.menu, title: t('rotulos.botao.voltarMenu') }],
  )
}

export function reservaRecusadaMessage(to: string, tenant: Tenant, data: ReservationMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  return buttonMessage(
    to,
    t('cliente.recusada.corpo', {
      marca: tenant.config.brand.name,
      pessoas: pessoas(tenant, data.partySize),
      data: formatDateTime(data.startsAt, tenant.timezone),
    }),
    [
      { id: ACTION.reservar, title: t('rotulos.botao.outroHorario') },
      { id: ACTION.atendente, title: t('rotulos.botao.atendente') },
    ],
  )
}

export function avisoAtendente(
  to: string,
  tenant: Tenant,
  contactName: string,
  waId: string,
): OutgoingMessage {
  const t = makeT(tenant.config)
  return textMessage(
    to,
    t('dono.aviso.atendente', { cliente: contactName || t('dono.semNomeInicio'), waId }),
  )
}

/** Todas as mensagens programadas, com o rótulo que aparece no log. */
export const KIND_LABELS: Record<OutboxKind, string> = {
  lembrete24h: 'lembrete de 24h',
  lembrete2h: 'lembrete de 2h',
  posAtendimento: 'pós-visita',
  reativacao: 'reativação',
  aniversario: 'aniversário',
  avisoDono: 'aviso ao dono',
}
