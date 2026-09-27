import {
  cancelReservation,
  confirmAttendance,
  findReservation,
  listUpcomingByContact,
  type ReservationDetail,
} from '../db/repositories/reservations.js'
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
import { cancelPendingForReservation } from '../db/repositories/outbox.js'
import { ANY_AREA, areasForParty, availability, book, canCancel, needsApproval, slotsForDate } from '../booking/book.js'
import { env } from '../env.js'
import { errorMessage, log } from '../lib/logger.js'
import { avisoAtendente } from '../scheduler/messages.js'
import {
  notifyOwner,
  notifyOwnerApprovalRequest,
  notifyOwnerCancellation,
  notifyOwnerNewReservation,
  scheduleReservationMessages,
} from '../scheduler/schedule.js'
import type { TenantContext } from '../tenants/registry.js'
import type { AreaRecord } from '../tenants/types.js'
import { sendWithRetry } from '../whatsapp/client.js'
import type { NormalizedInbound } from '../whatsapp/types.js'
import type { OutgoingMessage } from '../whatsapp/payloads.js'
import { ACTION, decide, isSessionExpired, type BotContext, type Screen } from './machine.js'
import { findStaff, handleStaffMessage, STAFF_ACTION } from './recepcao.js'
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

  // O dono tem um menu próprio. Os botões da recepção também chegam a ele:
  // em restaurante pequeno quem recebe o cliente na porta é o próprio dono, e o
  // menu dele tem o atalho para marcar chegadas.
  if (isOwner(tenant, inbound.from)) {
    if (inbound.action?.startsWith(STAFF_ACTION.prefix)) {
      await handleStaffMessage(ctx, contact, { name: 'Dono', isOwner: true }, inbound, now)
      return
    }
    await handleOwnerMessage(ctx, contact, inbound, now)
    return
  }

  // A recepção também — as reservas do dia, quem chegou, quem faltou.
  //
  // ANTES da pausa do bot de propósito: a pausa é para calar o atendimento
  // automático dos clientes. Calar a recepção junto tiraria a lista da noite da
  // mão dela exatamente quando o dono pausou tudo para resolver alguma coisa.
  const staff = findStaff(ctx, inbound.from)
  if (staff) {
    await handleStaffMessage(ctx, contact, { name: staff.name, isOwner: false }, inbound, now)
    return
  }

  // O dono pausou o atendimento automático do restaurante inteiro.
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
 * Algumas telas mudam de ideia no meio: "RESERVADO" vira "HORARIO_OCUPADO" se o
 * ambiente encher, ou "AGUARDANDO_APROVACAO" se o grupo for grande; e
 * "ESCOLHER_AMBIENTE" é pulada quando só um ambiente serve. Por isso o retorno
 * traz a tela final, e não a que foi pedida.
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
  // Os textos deste restaurante, montados uma vez por resposta.
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

    case 'CARDAPIO':
      return done(screens.cardapioScreen(to, tenant))

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

    // --- Reserva -----------------------------------------------------------

    case 'ESCOLHER_PESSOAS':
      if (ctx.areas.length === 0) return done(screens.semHorarioScreen(to, t), 'SEM_HORARIO')
      return done(screens.escolherPessoasScreen(to, t, tenant.config.booking.maxPartySize))

    case 'DIGITAR_PESSOAS':
      return done(screens.digitarPessoasScreen(to, t, tenant.config.booking.maxPartySize))

    case 'ESCOLHER_AMBIENTE': {
      const partySize = context.partySize
      if (!partySize || partySize < 1) return renderScreen(ctx, contact, 'ESCOLHER_PESSOAS', context, now)

      // Grupo acima do que o bot aceita, ou maior que qualquer ambiente: é
      // conversa para gente, não para botão.
      const areas = areasForParty(ctx, partySize)
      if (partySize > tenant.config.booking.maxPartySize || areas.length === 0) {
        return done(screens.grupoGrandeScreen(to, t, partySize), 'GRUPO_GRANDE', {
          reservationId: context.reservationId,
        })
      }

      // Veio do botão "Reservar aqui" de um ambiente no site.
      const hinted = context.areaHint ? matchArea(areas, context.areaHint) : null
      // Um ambiente só serve: perguntar "onde?" seria toque à toa.
      const only = areas.length === 1 ? areas[0]! : null
      const chosen = hinted ?? only
      if (chosen) {
        return renderScreen(
          ctx,
          contact,
          'ESCOLHER_DIA',
          { ...context, areaHint: undefined, areaId: chosen.id, dayOffset: 0 },
          now,
        )
      }

      const descriptions = Object.fromEntries(
        tenant.config.areas.map((area) => [area.name, area.description]),
      )
      return done(screens.escolherAmbienteScreen(to, t, areas, descriptions, partySize), 'ESCOLHER_AMBIENTE', {
        ...context,
        areaHint: undefined,
      })
    }

    case 'ESCOLHER_DIA': {
      if (!context.partySize) return restart(ctx, contact, now)

      const days = await availability(ctx, context.partySize, context.areaId ?? ANY_AREA, now)
      if (days.length === 0) return done(screens.semHorarioScreen(to, t), 'SEM_HORARIO')

      const options = days.map((day) => ({ day: day.day, date: day.slots[0]! }))
      return done(
        screens.escolherDiaScreen(to, t, options, tenant.timezone, context.dayOffset ?? 0, now),
        'ESCOLHER_DIA',
      )
    }

    case 'ESCOLHER_HORARIO': {
      if (!context.partySize || !context.day) return restart(ctx, contact, now)

      const slots = await slotsForDate(ctx, context.partySize, context.areaId ?? ANY_AREA, context.day, now)

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
      if (!context.partySize || !context.slot) return restart(ctx, contact, now)

      const area = ctx.areas.find((entry) => entry.id === context.areaId)
      return done(
        screens.confirmarScreen(
          to,
          t,
          {
            partySize: context.partySize,
            areaName: area?.name ?? t('rotulos.ambienteQualquer'),
            slot: new Date(context.slot),
          },
          tenant.timezone,
          needsApproval(ctx, context.partySize),
          now,
        ),
      )
    }

    case 'RESERVADO': {
      if (!context.partySize || !context.slot) return restart(ctx, contact, now)

      // Remarcar = cancelar a antiga e reservar a nova. A antiga só sai depois
      // que a nova entra, para o cliente nunca ficar sem mesa por um erro.
      const previousId = context.reservationId

      const result = await book(
        ctx,
        contact,
        context.partySize,
        context.areaId ?? ANY_AREA,
        new Date(context.slot),
        now,
      )

      if (!result.ok) {
        if (result.reason === 'limite') {
          return done(
            screens.limiteReservasScreen(to, t, tenant.config.booking.maxPerContact),
            'LIMITE_RESERVAS',
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
        contactWaId: contact.waId,
        partySize: result.reservation.partySize,
        areaName: result.area.name,
        startsAt: result.reservation.startsAt,
        reservationId: result.reservation.id,
      }
      const summary = {
        partySize: result.reservation.partySize,
        areaName: result.area.name,
        slot: result.reservation.startsAt,
      }

      // Pedido de grupo grande: os lugares já estão seguros, mas os lembretes
      // só entram quando o dono aprovar — lembrar de uma reserva que pode ser
      // recusada seria prometer o que ninguém confirmou.
      if (result.pending) {
        await notifyOwnerApprovalRequest(tenant, data)
        return done(screens.aguardandoAprovacaoScreen(to, summary, tenant, now), 'AGUARDANDO_APROVACAO', {})
      }

      await scheduleReservationMessages(tenant, contact, data, now)
      await notifyOwnerNewReservation(tenant, data)

      return done(screens.reservadoScreen(to, summary, tenant, now), 'RESERVADO', {})
    }

    // --- Reservas do cliente -----------------------------------------------

    case 'MINHAS_RESERVAS': {
      const reservations = await listUpcomingByContact(contact.id, now)
      return done(
        screens.minhasReservasScreen(to, t, reservations.map(toSummary), tenant.timezone, now),
      )
    }

    case 'ACOES_RESERVA':
    case 'CONFIRMAR_CANCELAMENTO': {
      const reservation = context.reservationId ? await findReservation(context.reservationId) : null
      if (!reservation || reservation.contactId !== contact.id) {
        return renderScreen(ctx, contact, 'MINHAS_RESERVAS', {}, now)
      }

      const summary = toSummary(reservation)

      if (screen === 'ACOES_RESERVA') {
        return done(screens.acoesReservaScreen(to, t, summary, tenant.timezone, now))
      }

      const deadline = tenant.config.booking.cancelDeadlineHours
      // Pedido ainda pendente pode ser retirado a qualquer hora: ele nem foi
      // aprovado, não tem mesa preparada esperando ninguém.
      if (reservation.status !== 'pending' && !canCancel(reservation.startsAt, deadline, now)) {
        return done(screens.cancelamentoTardeScreen(to, t, deadline), 'CANCELAMENTO_TARDE')
      }
      return done(screens.confirmarCancelamentoScreen(to, t, summary, tenant.timezone, now))
    }

    case 'CANCELADO': {
      if (!context.reservationId) return renderScreen(ctx, contact, 'MINHAS_RESERVAS', {}, now)

      const reservation = await findReservation(context.reservationId)
      if (!reservation || reservation.contactId !== contact.id) {
        return renderScreen(ctx, contact, 'MINHAS_RESERVAS', {}, now)
      }

      const cancelled = await cancelReservation(context.reservationId, 'cancelada pelo cliente')
      if (cancelled) {
        await cancelPendingForReservation(cancelled.id)
        await notifyOwnerCancellation(tenant, messageData(cancelled))
      }
      return done(screens.canceladoScreen(to, t), 'CANCELADO', {})
    }

    case 'PRESENCA_CONFIRMADA': {
      if (context.reservationId) await confirmAttendance(context.reservationId)
      return done(screens.presencaConfirmadaScreen(to, t), 'PRESENCA_CONFIRMADA', {})
    }

    // Telas de aviso não têm efeito próprio: só são alcançadas a partir de
    // outra tela, que já montou a mensagem.
    case 'SEM_HORARIO':
      return done(screens.semHorarioScreen(to, t))

    case 'HORARIO_OCUPADO':
      return done(screens.horarioOcupadoScreen(to, t))

    case 'LIMITE_RESERVAS':
      return done(screens.limiteReservasScreen(to, t, tenant.config.booking.maxPerContact))

    case 'GRUPO_GRANDE':
      return done(screens.grupoGrandeScreen(to, t, context.partySize ?? tenant.config.booking.maxPartySize))

    case 'AGUARDANDO_APROVACAO':
      return done(screens.menuScreen(to, tenant), 'MENU', {})

    case 'CANCELAMENTO_TARDE':
      return done(screens.cancelamentoTardeScreen(to, t, tenant.config.booking.cancelDeadlineHours))

    default:
      return done(screens.menuScreen(to, tenant), 'MENU', {})
  }
}

/** "varanda" do site casa com o ambiente "Varanda", sem acento nem caixa. */
function matchArea(areas: AreaRecord[], hint: string): AreaRecord | null {
  const clean = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const wanted = clean(hint)
  return areas.find((area) => clean(area.name) === wanted) ?? null
}

function toSummary(reservation: ReservationDetail): screens.ReservationSummary {
  return {
    id: reservation.id,
    partySize: reservation.partySize,
    areaName: reservation.areaName,
    startsAt: reservation.startsAt,
    pending: reservation.status === 'pending',
  }
}

function messageData(reservation: ReservationDetail) {
  return {
    contactName: reservation.contactName,
    contactWaId: reservation.contactWaId,
    partySize: reservation.partySize,
    areaName: reservation.areaName,
    startsAt: reservation.startsAt,
    reservationId: reservation.id,
  }
}

/** Contexto perdido (deploy no meio da conversa, ambiente removido): volta ao menu. */
async function restart(ctx: TenantContext, contact: Contact, now: Date): Promise<Rendered> {
  return renderScreen(ctx, contact, 'MENU', {}, now)
}

async function cancelPrevious(ctx: TenantContext, reservationId: string, now: Date): Promise<void> {
  const cancelled = await cancelReservation(reservationId, 'remarcada pelo cliente')
  if (!cancelled) return
  await cancelPendingForReservation(cancelled.id)
  await notifyOwnerCancellation(ctx.tenant, messageData(cancelled))
  log.info('reserva anterior cancelada ao remarcar', { reservationId, at: now.toISOString() })
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
