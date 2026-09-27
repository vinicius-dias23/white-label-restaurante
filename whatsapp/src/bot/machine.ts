/**
 * Máquina de estados do atendimento.
 *
 * Sem IA, por decisão de projeto: o cliente toca em botões e cada toque leva a
 * uma tela conhecida. Texto livre nunca é interpretado — vira o menu de volta.
 * Isso é mais previsível que qualquer modelo, não erra preço nem inventa
 * horário, e é o que dá para testar de ponta a ponta.
 *
 * Esta função é PURA: entra (estado, contexto, toque), sai (próxima tela,
 * contexto novo). Quem busca dados no banco e envia a mensagem é o handler.
 * Todo o mapa de navegação fica testável sem subir nada.
 */

export type Screen =
  // Informativas
  | 'MENU'
  | 'SERVICOS'
  | 'HORARIOS'
  | 'ENDERECO'
  | 'PAGAMENTO'
  | 'ATENDENTE'
  // Agendamento
  | 'ESCOLHER_SERVICO'
  | 'ESCOLHER_BARBEIRO'
  | 'ESCOLHER_DIA'
  | 'ESCOLHER_HORARIO'
  | 'CONFIRMAR'
  | 'AGENDADO'
  | 'SEM_HORARIO'
  | 'HORARIO_OCUPADO'
  | 'LIMITE_AGENDAMENTOS'
  // Agendamentos do cliente
  | 'MEUS_AGENDAMENTOS'
  | 'ACOES_AGENDAMENTO'
  | 'CONFIRMAR_CANCELAMENTO'
  | 'CANCELADO'
  | 'CANCELAMENTO_TARDE'
  | 'PRESENCA_CONFIRMADA'
  // Conversa
  | 'NAO_ENTENDI'
  | 'OPT_OUT'
  | 'OPT_IN'

/** O que o cliente já escolheu dentro do fluxo. Vive na coluna `context`. */
export interface BotContext {
  serviceId?: string
  /** ID do barbeiro, ou "any" quando o cliente não tem preferência. */
  barberId?: string
  /** Dia local escolhido, "2026-08-22". */
  day?: string
  /** Horário escolhido, em ISO/UTC. */
  slot?: string
  appointmentId?: string
  /** Paginação: quantos dias/horários já foram pulados. */
  dayOffset?: number
  timeOffset?: number
}

export interface Decision {
  screen: Screen
  context: BotContext
}

export interface Input {
  /** ID do botão ou da linha tocada. `null` quando o cliente digitou. */
  action: string | null
  /** Texto digitado. */
  text: string
  screen: Screen
  context: BotContext
}

/** Prefixos dos IDs de botão. Mudá-los quebra conversas em andamento. */
export const ACTION = {
  menu: 'menu',
  agendar: 'menu:agendar',
  meus: 'menu:meus',
  servicos: 'menu:servicos',
  horarios: 'menu:horarios',
  endereco: 'menu:endereco',
  pagamento: 'menu:pagamento',
  atendente: 'menu:atendente',
  service: 'svc:',
  barber: 'brb:',
  barberAny: 'brb:any',
  day: 'day:',
  dayMore: 'day:mais',
  time: 'hor:',
  timeMore: 'hor:mais',
  confirm: 'ok:sim',
  changeTime: 'ok:trocar',
  abort: 'ok:nao',
  appointment: 'apt:',
  cancel: 'apt:cancelar:',
  reschedule: 'apt:remarcar:',
  cancelYes: 'del:sim:',
  cancelNo: 'del:nao',
  /**
   * Botões que vêm dos templates de lembrete. Chegam com o ID do agendamento
   * grudado ("lembrete:confirmo:<id>"), porque a resposta a um template não
   * traz nenhum outro contexto — o cliente pode ter dois horários marcados.
   */
  presencaOk: 'lembrete:confirmo:',
  presencaCancel: 'lembrete:cancelar:',
  optOut: 'optout',
  optIn: 'optin',
} as const

/** Palavras digitadas que o bot reconhece — as únicas, de propósito. */
const KEYWORDS_MENU = ['menu', 'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'início', 'inicio', 'voltar']
const KEYWORDS_OPT_OUT = ['sair', 'parar', 'pare', 'stop', 'descadastrar', 'cancelar inscricao', 'cancelar inscrição']
const KEYWORDS_OPT_IN = ['quero receber', 'aceito', 'voltar a receber']
const KEYWORDS_AGENDAR = ['agendar', 'marcar', 'horario', 'horário']

/**
 * Frase que o próprio site coloca no link do WhatsApp (`@barbearia/shared/lib/whatsapp`):
 * "Olá, Barbearia do Zé! Gostaria de agendar: Corte + Barba (R$ 75)."
 *
 * Não é interpretação de texto livre — é reconhecer a nossa própria mensagem.
 * Sem isto, quem toca em "Agendar no WhatsApp" no site é recebido com um
 * "Não entendi", que é a pior primeira impressão possível.
 */
const FRASE_DO_SITE = 'gostaria de agendar'

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function suffix(action: string, prefix: string): string {
  return action.slice(prefix.length)
}

/** Reinicia o fluxo de agendamento sem perder o resto do contexto. */
function clearBooking(context: BotContext): BotContext {
  const { appointmentId } = context
  return appointmentId ? { appointmentId } : {}
}

export function decide(input: Input): Decision {
  const { action, context } = input

  // --- Texto digitado: nunca interpretado, sempre traduzido para uma tela ----
  if (!action) {
    const text = normalizeText(input.text)

    if (KEYWORDS_OPT_OUT.some((word) => text === word)) {
      return { screen: 'OPT_OUT', context: clearBooking(context) }
    }
    if (KEYWORDS_OPT_IN.some((word) => text.includes(word))) {
      return { screen: 'OPT_IN', context }
    }
    if (KEYWORDS_MENU.some((word) => text === word)) {
      return { screen: 'MENU', context: clearBooking(context) }
    }
    if (KEYWORDS_AGENDAR.some((word) => text === word) || text.includes(FRASE_DO_SITE)) {
      return { screen: 'ESCOLHER_SERVICO', context: clearBooking(context) }
    }
    // Qualquer outra coisa — inclusive áudio, foto e figurinha — cai aqui.
    return { screen: 'NAO_ENTENDI', context }
  }

  // --- Toques de botão -------------------------------------------------------
  switch (true) {
    case action === ACTION.menu:
      return { screen: 'MENU', context: clearBooking(context) }

    case action === ACTION.agendar:
      return { screen: 'ESCOLHER_SERVICO', context: clearBooking(context) }

    case action === ACTION.meus:
      return { screen: 'MEUS_AGENDAMENTOS', context: clearBooking(context) }

    case action === ACTION.servicos:
      return { screen: 'SERVICOS', context }

    case action === ACTION.horarios:
      return { screen: 'HORARIOS', context }

    case action === ACTION.endereco:
      return { screen: 'ENDERECO', context }

    case action === ACTION.pagamento:
      return { screen: 'PAGAMENTO', context }

    case action === ACTION.atendente:
      return { screen: 'ATENDENTE', context }

    case action === ACTION.optOut:
      return { screen: 'OPT_OUT', context }

    case action === ACTION.optIn:
      return { screen: 'OPT_IN', context }

    // Serviço escolhido → escolhe o barbeiro
    case action.startsWith(ACTION.service):
      return {
        screen: 'ESCOLHER_BARBEIRO',
        context: { ...clearBooking(context), serviceId: suffix(action, ACTION.service) },
      }

    // Barbeiro escolhido → escolhe o dia
    case action.startsWith(ACTION.barber):
      return {
        screen: 'ESCOLHER_DIA',
        context: { ...context, barberId: suffix(action, ACTION.barber), dayOffset: 0 },
      }

    // "Ver mais dias" — avança a página sem mudar de tela
    case action.startsWith(ACTION.dayMore):
      return {
        screen: 'ESCOLHER_DIA',
        context: { ...context, dayOffset: Number(suffix(action, `${ACTION.dayMore}:`)) || 0 },
      }

    case action.startsWith(ACTION.day):
      return {
        screen: 'ESCOLHER_HORARIO',
        context: { ...context, day: suffix(action, ACTION.day), timeOffset: 0 },
      }

    case action.startsWith(ACTION.timeMore):
      return {
        screen: 'ESCOLHER_HORARIO',
        context: { ...context, timeOffset: Number(suffix(action, `${ACTION.timeMore}:`)) || 0 },
      }

    case action.startsWith(ACTION.time):
      return { screen: 'CONFIRMAR', context: { ...context, slot: suffix(action, ACTION.time) } }

    case action === ACTION.confirm:
      // O handler tenta reservar de verdade; se o horário já tiver sido pego,
      // ele troca esta tela por HORARIO_OCUPADO.
      return { screen: 'AGENDADO', context }

    case action === ACTION.changeTime:
      return { screen: 'ESCOLHER_DIA', context: { ...context, day: undefined, slot: undefined, dayOffset: 0 } }

    case action === ACTION.abort:
      return { screen: 'MENU', context: clearBooking(context) }

    case action.startsWith(ACTION.cancel):
      return {
        screen: 'CONFIRMAR_CANCELAMENTO',
        context: { ...context, appointmentId: suffix(action, ACTION.cancel) },
      }

    case action.startsWith(ACTION.reschedule):
      // Remarcar é cancelar + agendar de novo: começa um fluxo limpo,
      // guardando qual agendamento sai quando o novo for confirmado.
      return {
        screen: 'ESCOLHER_SERVICO',
        context: { appointmentId: suffix(action, ACTION.reschedule) },
      }

    case action.startsWith(ACTION.cancelYes):
      return {
        screen: 'CANCELADO',
        context: { ...context, appointmentId: suffix(action, ACTION.cancelYes) },
      }

    case action === ACTION.cancelNo:
      return { screen: 'MEUS_AGENDAMENTOS', context: clearBooking(context) }

    case action.startsWith(ACTION.appointment):
      return {
        screen: 'ACOES_AGENDAMENTO',
        context: { ...context, appointmentId: suffix(action, ACTION.appointment) },
      }

    // Botões do template de lembrete
    case action.startsWith(ACTION.presencaOk):
      return {
        screen: 'PRESENCA_CONFIRMADA',
        context: { ...context, appointmentId: suffix(action, ACTION.presencaOk) },
      }

    case action.startsWith(ACTION.presencaCancel):
      return {
        screen: 'CONFIRMAR_CANCELAMENTO',
        context: { ...context, appointmentId: suffix(action, ACTION.presencaCancel) },
      }

    default:
      // Botão de uma conversa antiga, de antes de um deploy que mudou os IDs.
      return { screen: 'NAO_ENTENDI', context }
  }
}

/**
 * O cliente sumiu no meio do fluxo e voltou muito depois: recomeçar do menu é
 * melhor que continuar de um passo que ele já não lembra qual era.
 */
export function isSessionExpired(stateUpdatedAt: Date, timeoutMinutes: number, now: Date = new Date()): boolean {
  return now.getTime() - stateUpdatedAt.getTime() > timeoutMinutes * 60_000
}
