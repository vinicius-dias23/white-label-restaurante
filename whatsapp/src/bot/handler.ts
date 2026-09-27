import {
  cancelAppointment,
  confirmAttendance,
  findAppointment,
  listUpcomingByContact,
} from '../db/repositories/appointments.js'
import {
  isWithinServiceWindow,
  setMarketingOptIn,
  setOptedOut,
  upsertContact,
  type Contact,
} from '../db/repositories/contacts.js'
import {
  getConversation,
  isInHandoff,
  saveConversation,
  startHandoff,
} from '../db/repositories/conversations.js'
import { countRecentInbound, logOutbound, registerInbound } from '../db/repositories/messages.js'
import { cancelPendingForAppointment } from '../db/repositories/outbox.js'
import { ANY_BARBER, availability, book, canCancel, slotsForDate } from '../booking/book.js'
import { env } from '../env.js'
import { errorMessage, log } from '../lib/logger.js'
import { avisoAtendente } from '../scheduler/messages.js'
import {
  notifyOwner,
  notifyOwnerCancellation,
  notifyOwnerNewAppointment,
  scheduleAppointmentMessages,
} from '../scheduler/schedule.js'
import type { TenantContext } from '../tenants/registry.js'
import { sendWithRetry } from '../whatsapp/client.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'
import { ACTION, decide, isSessionExpired, type BotContext, type Screen } from './machine.js'
import { findBarber, handleBarberMessage } from './barber.js'
import { botPausedNotice, handleOwnerMessage, isBotPaused, isOwner } from './owner.js'
import * as screens from './screens.js'
import { makeT } from './textos.js'

/**
 * Orquestra uma mensagem recebida: carrega o estado, decide a próxima tela,
 * busca os dados dela, executa o efeito (reservar, cancelar, chamar atendente)
 * e responde.
 *
 * A decisão de para onde ir é da máquina de estados, que é pura. Aqui fica só
 * o que precisa tocar o mundo — banco, relógio e Meta.
 */

export async function handleInbound(ctx: TenantContext, inbound: NormalizedInbound): Promise<void> {
  const now = new Date()
  const { tenant } = ctx

  const contact = await upsertContact(tenant.id, inbound.from, inbound.profileName, inbound.timestamp)

  // Idempotência: a Meta reenvia o webhook quando não recebe 200 rápido.
  // Sem isto o cliente seria atendido duas vezes pela mesma mensagem.
  const isNew = await registerInbound(
    tenant.id,
    contact.id,
    inbound.messageId,
    inbound.mediaType ?? (inbound.action ? 'interactive' : 'text'),
    { action: inbound.action, text: inbound.text },
  )
  if (!isNew) {
    log.debug('mensagem repetida ignorada', { messageId: inbound.messageId })
    return
  }

  // Freio contra enxurrada — número travado mandando dezenas de mensagens.
  const recent = await countRecentInbound(contact.id, 60)
  if (recent > env.conversation.rateLimitPerMin) {
    log.warn('cliente acima do limite de mensagens por minuto', { waId: contact.waId, recent })
    return
  }

  await ctx.client.markRead(inbound.messageId)

  // O dono tem um menu próprio.
  if (isOwner(tenant, inbound.from)) {
    await handleOwnerMessage(ctx, contact, inbound, now)
    return
  }

  // O barbeiro também — a agenda dele, os cortes dele, a folga dele.
  //
  // Depois do dono de propósito: na barbearia pequena o dono também corta, e o
  // mesmo número está nos dois lugares. Quem é os dois vê o painel completo.
  //
  // E ANTES da pausa do bot: a pausa é para calar o atendimento automático dos
  // clientes. Calar o barbeiro junto tiraria a agenda dele da mão exatamente
  // quando o dono pausou tudo para resolver alguma coisa.
  const barber = findBarber(ctx, inbound.from)
  if (barber) {
    await handleBarberMessage(ctx, contact, barber, inbound, now)
    return
  }

  // O dono pausou o atendimento automático da barbearia inteira.
  if (isBotPaused(tenant, now)) {
    // Avisa uma vez só: quem manda cinco mensagens seguidas não recebe cinco
    // respostas automáticas dizendo a mesma coisa.
    const inboundNaUltimaMeiaHora = await countRecentInbound(contact.id, 1800)
    if (inboundNaUltimaMeiaHora <= 1) await send(ctx, contact, botPausedNotice(contact.waId, tenant))
    return
  }

  const conversation = await getConversation(tenant.id, contact.id)

  // Enquanto um humano atende, o bot fica calado — a menos que o cliente peça
  // o menu de volta explicitamente.
  const askedForMenu = inbound.action === ACTION.menu || inbound.text.trim().toLowerCase() === 'menu'
  if (isInHandoff(conversation, now) && !askedForMenu) {
    log.debug('conversa em atendimento humano, bot em silêncio', { waId: contact.waId })
    return
  }

  // Sumiu no meio do fluxo e voltou muito depois: recomeça do menu.
  const screen: Screen = isSessionExpired(
    conversation.stateUpdatedAt,
    env.conversation.sessionTimeoutMin,
    now,
  )
    ? 'MENU'
    : conversation.screen

  const decision = decide({
    action: inbound.action,
    text: inbound.text,
    screen,
    context: conversation.context,
  })

  const rendered = await renderScreen(ctx, contact, decision.screen, decision.context, now)

  await send(ctx, contact, rendered.message)
  await saveConversation(conversation.id, rendered.screen, rendered.context)
}

interface Rendered {
  screen: Screen
  context: BotContext
  message: OutgoingMessage
}

/**
 * Monta a tela e executa o efeito que ela representa.
 *
 * Algumas telas mudam de ideia no meio: "AGENDADO" vira "HORARIO_OCUPADO" se a
 * reserva não passar, e "ESCOLHER_BARBEIRO" é pulada quando só tem um barbeiro.
 * Por isso o retorno traz a tela final, e não a que foi pedida.
 */
async function renderScreen(
  ctx: TenantContext,
  contact: Contact,
  screen: Screen,
  context: BotContext,
  now: Date,
): Promise<Rendered> {
  const { tenant } = ctx
  const to = contact.waId
  // Os textos desta barbearia, montados uma vez por resposta.
  const t = makeT(tenant.config)
  const done = (message: OutgoingMessage, finalScreen = screen, finalContext = context): Rendered => ({
    screen: finalScreen,
    context: finalContext,
    message,
  })

  switch (screen) {
    case 'MENU':
      return done(screens.menuScreen(to, tenant))

    case 'NAO_ENTENDI':
      return done(screens.naoEntendiScreen(to, tenant), 'MENU')

    case 'SERVICOS':
      return done(screens.servicosScreen(to, tenant, ctx.services))

    case 'HORARIOS':
      return done(screens.horariosScreen(to, tenant, now))

    case 'ENDERECO':
      return done(screens.enderecoScreen(to, tenant))

    case 'PAGAMENTO':
      return done(screens.pagamentoScreen(to, tenant))

    case 'ATENDENTE': {
      const conversation = await getConversation(tenant.id, contact.id)
      await startHandoff(conversation.id, tenant.config.whatsapp.handoffMinutes)
      if (tenant.ownerPhone) {
        await notifyOwner(
          tenant,
          avisoAtendente(tenant.ownerPhone, tenant, contact.name, contact.waId),
          `handoff:${contact.id}:${Math.floor(now.getTime() / 60_000)}`,
          now,
        )
      }
      return done(screens.atendenteScreen(to, tenant))
    }

    case 'OPT_OUT':
      await setOptedOut(contact.id, true)
      return done(screens.optOutScreen(to, t))

    case 'OPT_IN':
      await setMarketingOptIn(contact.id, true)
      return done(screens.optInScreen(to, t, tenant.config.brand.name))

    // --- Agendamento -------------------------------------------------------

    case 'ESCOLHER_SERVICO': {
      if (ctx.services.length === 0) return done(screens.semHorarioScreen(to, t), 'SEM_HORARIO')
      // Barbearia com um serviço só: perguntar "qual?" seria toque à toa.
      if (ctx.services.length === 1) {
        const only = ctx.services[0]!
        return renderScreen(ctx, contact, 'ESCOLHER_BARBEIRO', { ...context, serviceId: only.id }, now)
      }
      return done(screens.escolherServicoScreen(to, t, ctx.services))
    }

    case 'ESCOLHER_BARBEIRO': {
      const service = findServiceOrNull(ctx, context.serviceId)
      if (!service) return restart(ctx, contact, now)

      // Um barbeiro só: também não faz sentido perguntar.
      if (ctx.barbers.length <= 1) {
        const barberId = ctx.barbers[0]?.id ?? ANY_BARBER
        return renderScreen(ctx, contact, 'ESCOLHER_DIA', { ...context, barberId, dayOffset: 0 }, now)
      }
      return done(screens.escolherBarbeiroScreen(to, t, ctx.barbers, service.name))
    }

    case 'ESCOLHER_DIA': {
      const service = findServiceOrNull(ctx, context.serviceId)
      if (!service) return restart(ctx, contact, now)

      const days = await availability(ctx, service, context.barberId ?? ANY_BARBER, now)
      if (days.length === 0) return done(screens.semHorarioScreen(to, t), 'SEM_HORARIO')

      const options = days.map((day) => ({ day: day.day, date: day.slots[0]! }))
      return done(
        screens.escolherDiaScreen(to, t, options, tenant.timezone, context.dayOffset ?? 0, now),
        'ESCOLHER_DIA',
      )
    }

    case 'ESCOLHER_HORARIO': {
      const service = findServiceOrNull(ctx, context.serviceId)
      if (!service || !context.day) return restart(ctx, contact, now)

      const slots = await slotsForDate(ctx, service, context.barberId ?? ANY_BARBER, context.day, now)

      // O dia lotou entre a montagem da lista e o toque do cliente.
      if (slots.length === 0) {
        return renderScreen(ctx, contact, 'ESCOLHER_DIA', { ...context, day: undefined }, now)
      }

      return done(
        screens.escolherHorarioScreen(
          to,
          t,
          slots[0]!,
          slots,
          tenant.timezone,
          context.timeOffset ?? 0,
          now,
        ),
      )
    }

    case 'CONFIRMAR': {
      const service = findServiceOrNull(ctx, context.serviceId)
      if (!service || !context.slot) return restart(ctx, contact, now)

      const barber = ctx.barbers.find((entry) => entry.id === context.barberId)
      return done(
        screens.confirmarScreen(
          to,
          t,
          {
            serviceName: service.name,
            priceLabel: service.priceLabel,
            durationMin: service.durationMin,
            barberName: barber?.name ?? t('rotulos.barbeiroQualquer'),
            slot: new Date(context.slot),
          },
          tenant.timezone,
          now,
        ),
      )
    }

    case 'AGENDADO': {
      const service = findServiceOrNull(ctx, context.serviceId)
      if (!service || !context.slot) return restart(ctx, contact, now)

      // Remarcar = cancelar o antigo e marcar o novo. O antigo só sai depois que
      // o novo entra, para o cliente nunca ficar sem horário nenhum por um erro.
      const previousId = context.appointmentId

      const result = await book(
        ctx,
        contact,
        service,
        context.barberId ?? ANY_BARBER,
        new Date(context.slot),
        now,
      )

      if (!result.ok) {
        if (result.reason === 'limite') {
          return done(
            screens.limiteAgendamentosScreen(to, t, tenant.config.booking.maxPerContact),
            'LIMITE_AGENDAMENTOS',
            {},
          )
        }
        return done(screens.horarioOcupadoScreen(to, t), 'HORARIO_OCUPADO', {
          ...context,
          slot: undefined,
        })
      }

      if (previousId) await cancelPrevious(ctx, previousId, now)

      const data = {
        contactName: contact.name,
        serviceName: service.name,
        barberName: result.barber.name,
        startsAt: result.appointment.startsAt,
        appointmentId: result.appointment.id,
      }

      await scheduleAppointmentMessages(tenant, contact, data, now)
      await notifyOwnerNewAppointment(tenant, data)

      return done(
        screens.agendadoScreen(
          to,
          {
            serviceName: service.name,
            priceLabel: service.priceLabel,
            durationMin: service.durationMin,
            barberName: result.barber.name,
            slot: result.appointment.startsAt,
          },
          tenant,
          now,
        ),
        'AGENDADO',
        {},
      )
    }

    // --- Agendamentos do cliente -------------------------------------------

    case 'MEUS_AGENDAMENTOS': {
      const appointments = await listUpcomingByContact(contact.id, now)
      return done(
        screens.meusAgendamentosScreen(
          to,
          t,
          appointments.map((appointment) => ({
            id: appointment.id,
            serviceName: appointment.serviceName,
            barberName: appointment.barberName,
            startsAt: appointment.startsAt,
          })),
          tenant.timezone,
          now,
        ),
      )
    }

    case 'ACOES_AGENDAMENTO':
    case 'CONFIRMAR_CANCELAMENTO': {
      const appointment = context.appointmentId ? await findAppointment(context.appointmentId) : null
      if (!appointment || appointment.contactId !== contact.id) {
        return renderScreen(ctx, contact, 'MEUS_AGENDAMENTOS', {}, now)
      }

      const summary = {
        id: appointment.id,
        serviceName: appointment.serviceName,
        barberName: appointment.barberName,
        startsAt: appointment.startsAt,
      }

      if (screen === 'ACOES_AGENDAMENTO') {
        return done(screens.acoesAgendamentoScreen(to, t, summary, tenant.timezone, now))
      }

      const deadline = tenant.config.booking.cancelDeadlineHours
      if (!canCancel(appointment.startsAt, deadline, now)) {
        return done(screens.cancelamentoTardeScreen(to, t, deadline), 'CANCELAMENTO_TARDE')
      }
      return done(screens.confirmarCancelamentoScreen(to, t, summary, tenant.timezone, now))
    }

    case 'CANCELADO': {
      if (!context.appointmentId) return renderScreen(ctx, contact, 'MEUS_AGENDAMENTOS', {}, now)

      const appointment = await findAppointment(context.appointmentId)
      if (!appointment || appointment.contactId !== contact.id) {
        return renderScreen(ctx, contact, 'MEUS_AGENDAMENTOS', {}, now)
      }

      const cancelled = await cancelAppointment(context.appointmentId, 'cancelado pelo cliente')
      if (cancelled) {
        await cancelPendingForAppointment(cancelled.id)
        await notifyOwnerCancellation(tenant, {
          contactName: contact.name,
          serviceName: cancelled.serviceName,
          barberName: cancelled.barberName,
          startsAt: cancelled.startsAt,
          appointmentId: cancelled.id,
        })
      }
      return done(screens.canceladoScreen(to, t), 'CANCELADO', {})
    }

    case 'PRESENCA_CONFIRMADA': {
      if (context.appointmentId) await confirmAttendance(context.appointmentId)
      return done(screens.presencaConfirmadaScreen(to, t), 'PRESENCA_CONFIRMADA', {})
    }

    // Telas de aviso não têm efeito próprio: só são alcançadas a partir de
    // outra tela, que já montou a mensagem.
    case 'SEM_HORARIO':
      return done(screens.semHorarioScreen(to, t))

    case 'HORARIO_OCUPADO':
      return done(screens.horarioOcupadoScreen(to, t))

    case 'LIMITE_AGENDAMENTOS':
      return done(screens.limiteAgendamentosScreen(to, t, tenant.config.booking.maxPerContact))

    case 'CANCELAMENTO_TARDE':
      return done(screens.cancelamentoTardeScreen(to, t, tenant.config.booking.cancelDeadlineHours))

    default:
      return done(screens.menuScreen(to, tenant), 'MENU', {})
  }
}

function findServiceOrNull(ctx: TenantContext, serviceId: string | undefined) {
  if (!serviceId) return null
  return ctx.services.find((service) => service.id === serviceId) ?? null
}

/** Contexto perdido (deploy no meio da conversa, serviço removido): volta ao menu. */
async function restart(ctx: TenantContext, contact: Contact, now: Date): Promise<Rendered> {
  return renderScreen(ctx, contact, 'MENU', {}, now)
}

async function cancelPrevious(ctx: TenantContext, appointmentId: string, now: Date): Promise<void> {
  const cancelled = await cancelAppointment(appointmentId, 'remarcado pelo cliente')
  if (!cancelled) return
  await cancelPendingForAppointment(cancelled.id)
  await notifyOwnerCancellation(ctx.tenant, {
    contactName: cancelled.contactName,
    serviceName: cancelled.serviceName,
    barberName: cancelled.barberName,
    startsAt: cancelled.startsAt,
    appointmentId: cancelled.id,
  })
  log.info('agendamento anterior cancelado ao remarcar', { appointmentId, at: now.toISOString() })
}

/**
 * Envia e registra.
 *
 * Um envio que falha não pode derrubar o processamento: o estado da conversa já
 * avançou e o cliente pode simplesmente tocar de novo.
 */
export async function send(ctx: TenantContext, contact: Contact, message: OutgoingMessage): Promise<void> {
  // Texto livre fora da janela de 24h a Meta recusa (131047). Chegar aqui
  // nessa situação é sinal de bug — o fluxo do bot é sempre uma RESPOSTA.
  if (!isWithinServiceWindow(contact) && message.type !== 'template') {
    log.warn('resposta fora da janela de 24h foi descartada', { waId: contact.waId })
    return
  }

  try {
    // Duas tentativas: um blip de rede não pode engolir a resposta ao cliente,
    // que ficaria olhando para uma conversa sem retorno. Erro definitivo sobe
    // na primeira, sem insistir — o webhook já respondeu 200 e não convém
    // segurar o processo.
    const result = await sendWithRetry(ctx.client, message, 2)
    await logOutbound(ctx.tenant.id, contact.id, result.messageId, String(message.type ?? ''), message)
  } catch (error) {
    log.error('falha ao responder o cliente', {
      waId: contact.waId,
      reason: errorMessage(error),
    })
  }
}
