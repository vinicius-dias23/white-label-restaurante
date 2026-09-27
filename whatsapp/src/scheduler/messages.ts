import { env } from '../env.js'
import { formatDateTime, formatTime } from '../lib/datetime.js'
import type { Tenant } from '../tenants/types.js'
import { ACTION } from '../bot/machine.js'
import { ctaUrlMessage, templateMessage, textMessage, type OutgoingMessage } from '../whatsapp/payloads.js'
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
 * A confirmação do agendamento não está aqui: ela é a resposta imediata ao
 * toque em "Confirmar" e mora em `bot/screens.ts` (`agendadoScreen`).
 *
 * O JSON de cada template está em docs/templates.md, com as variáveis
 * na mesma ordem usada aqui. Ordem trocada = erro 132000 e mensagem não enviada.
 *
 * O texto livre daqui — o pós-atendimento dentro da janela e os avisos ao dono —
 * vem do catálogo pelo `t()`, como o resto do bot. O corpo dos templates NÃO:
 * quem manda ali é o que está aprovado no WhatsApp Manager.
 */

export interface AppointmentMessageData {
  contactName: string
  serviceName: string
  barberName: string
  startsAt: Date
  appointmentId: string
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
 * mais reduz falta: o cliente confirma ou cancela com um toque, e o horário
 * cancelado volta para a agenda a tempo de outra pessoa pegar.
 */
export function lembrete24hMessage(to: string, tenant: Tenant, data: AppointmentMessageData): OutgoingMessage {
  return templateMessage(to, env.templates.lembrete24h, env.defaultLocale, {
    bodyParams: [
      firstName(data.contactName),
      tenant.config.brand.name,
      data.serviceName,
      formatDateTime(data.startsAt, tenant.timezone),
    ],
    quickReplyPayloads: [
      `${ACTION.presencaOk}${data.appointmentId}`,
      `${ACTION.presencaCancel}${data.appointmentId}`,
    ],
  })
}

export function lembrete2hMessage(to: string, tenant: Tenant, data: AppointmentMessageData): OutgoingMessage {
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
 * fixo por barbearia — então quando o cliente ainda está dentro da janela de
 * 24h (respondeu o lembrete, por exemplo) mandamos a versão interativa, que não
 * gasta template nem custo.
 */
export function posAtendimentoMessage(
  to: string,
  tenant: Tenant,
  data: AppointmentMessageData,
  withinWindow: boolean,
): OutgoingMessage {
  const reviewUrl = tenant.config.whatsapp.reviewUrl

  if (withinWindow && reviewUrl) {
    const t = makeT(tenant.config)
    return ctaUrlMessage(
      to,
      t('cliente.posAtendimento.corpo', {
        nome: firstName(data.contactName),
        servico: data.serviceName.toLowerCase(),
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
// Avisos para o dono da barbearia
// ---------------------------------------------------------------------------

export function avisoNovoAgendamento(to: string, tenant: Tenant, data: AppointmentMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  return textMessage(
    to,
    t('dono.aviso.novoAgendamento', {
      data: formatDateTime(data.startsAt, tenant.timezone),
      servico: data.serviceName,
      barbeiro: data.barberName,
      cliente: data.contactName || t('dono.semNome'),
    }),
  )
}

export function avisoCancelamento(to: string, tenant: Tenant, data: AppointmentMessageData): OutgoingMessage {
  const t = makeT(tenant.config)
  return textMessage(
    to,
    t('dono.aviso.cancelamento', {
      data: formatDateTime(data.startsAt, tenant.timezone),
      servico: data.serviceName,
      barbeiro: data.barberName,
      cliente: data.contactName || t('dono.semNome'),
    }),
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
  posAtendimento: 'pós-atendimento',
  reativacao: 'reativação',
  aniversario: 'aniversário',
  avisoDono: 'aviso ao dono',
}
