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
  | 'CARDAPIO'
  | 'HORARIOS'
  | 'ENDERECO'
  | 'PAGAMENTO'
  | 'ATENDENTE'
  // Reserva
  | 'ESCOLHER_PESSOAS'
  | 'DIGITAR_PESSOAS'
  | 'GRUPO_GRANDE'
  | 'ESCOLHER_AMBIENTE'
  | 'ESCOLHER_DIA'
  | 'ESCOLHER_HORARIO'
  | 'CONFIRMAR'
  | 'RESERVADO'
  | 'AGUARDANDO_APROVACAO'
  | 'SEM_HORARIO'
  | 'HORARIO_OCUPADO'
  | 'LIMITE_RESERVAS'
  // Reservas do cliente
  | 'MINHAS_RESERVAS'
  | 'ACOES_RESERVA'
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
  /** Quantas pessoas no grupo. */
  partySize?: number
  /** ID do ambiente, ou "any" quando o cliente não tem preferência. */
  areaId?: string
  /**
   * Ambiente que veio escrito na mensagem do site ("...uma mesa na Varanda").
   * Só uma dica: o handler usa se existir um ambiente com esse nome e o grupo
   * couber nele; senão, pergunta normalmente.
   */
  areaHint?: string
  /** Dia local escolhido, "2026-08-22". */
  day?: string
  /** Horário escolhido, em ISO/UTC. */
  slot?: string
  reservationId?: string
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
  reservar: 'menu:reservar',
  minhas: 'menu:minhas',
  cardapio: 'menu:cardapio',
  horarios: 'menu:horarios',
  endereco: 'menu:endereco',
  pagamento: 'menu:pagamento',
  atendente: 'menu:atendente',
  party: 'pes:',
  partyMore: 'pes:mais',
  area: 'amb:',
  areaAny: 'amb:any',
  day: 'day:',
  dayMore: 'day:mais',
  time: 'hor:',
  timeMore: 'hor:mais',
  confirm: 'ok:sim',
  changeTime: 'ok:trocar',
  abort: 'ok:nao',
  reservation: 'res:',
  cancel: 'res:cancelar:',
  reschedule: 'res:remarcar:',
  cancelYes: 'del:sim:',
  cancelNo: 'del:nao',
  /**
   * Botões que vêm dos templates de lembrete. Chegam com o ID da reserva
   * grudado ("lembrete:confirmo:<id>"), porque a resposta a um template não
   * traz nenhum outro contexto — o cliente pode ter duas reservas.
   */
  presencaOk: 'lembrete:confirmo:',
  presencaCancel: 'lembrete:cancelar:',
  optOut: 'optout',
  optIn: 'optin',
} as const

/**
 * Os botões "Aprovar" e "Recusar" do aviso de grupo grande que vai para o dono.
 *
 * Moram aqui, e não em `owner.ts`, porque quem monta o aviso é a fila de
 * mensagens (`scheduler/messages.ts`) — que o `owner.ts` também importa, e o
 * ciclo entre os dois não vale a pena.
 */
export const OWNER_DECISION = {
  aprovar: 'dono:aprovar:',
  recusar: 'dono:recusar:',
} as const

/** Palavras digitadas que o bot reconhece — as únicas, de propósito. */
const KEYWORDS_MENU = ['menu', 'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'início', 'inicio', 'voltar']
const KEYWORDS_OPT_OUT = ['sair', 'parar', 'pare', 'stop', 'descadastrar', 'cancelar inscricao', 'cancelar inscrição']
const KEYWORDS_OPT_IN = ['quero receber', 'aceito', 'voltar a receber']
const KEYWORDS_RESERVAR = ['reservar', 'reserva', 'mesa', 'agendar', 'marcar']
const KEYWORDS_CARDAPIO = ['cardapio', 'cardápio', 'pratos']

/**
 * Frase que o próprio site coloca no link do WhatsApp (`@restaurante/shared/lib/whatsapp`):
 * "Olá, Cantina Bella Nonna! Gostaria de reservar uma mesa na Varanda."
 *
 * Não é interpretação de texto livre — é reconhecer a nossa própria mensagem.
 * Sem isto, quem toca em "Reservar mesa no WhatsApp" no site é recebido com um
 * "Não entendi", que é a pior primeira impressão possível.
 */
const FRASE_DO_SITE = 'gostaria de reservar'
const FRASE_DO_SITE_AMBIENTE = 'uma mesa na '

/**
 * Número digitado na tela "Quantas pessoas?", depois de tocar em "9 ou mais".
 * É a única tela que aceita texto — e aceita só isto: "12", "12 pessoas".
 */
const NUMERO_DE_PESSOAS = /^(\d{1,3})(\s*pessoas?)?$/

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

/** Reinicia o fluxo de reserva sem perder o resto do contexto. */
function clearBooking(context: BotContext): BotContext {
  const { reservationId } = context
  return reservationId ? { reservationId } : {}
}

/** "Olá, X! Gostaria de reservar uma mesa na Varanda." → "Varanda". */
function areaHintFrom(rawText: string): string | undefined {
  const lower = rawText.toLowerCase()
  const at = lower.indexOf(FRASE_DO_SITE_AMBIENTE)
  if (at < 0) return undefined
  const hint = rawText.slice(at + FRASE_DO_SITE_AMBIENTE.length).replace(/[.!]+\s*$/, '').trim()
  return hint || undefined
}

export function decide(input: Input): Decision {
  const { action, context } = input

  // --- Texto digitado: nunca interpretado, sempre traduzido para uma tela ----
  if (!action) {
    const text = normalizeText(input.text)

    if (input.screen === 'DIGITAR_PESSOAS') {
      const match = NUMERO_DE_PESSOAS.exec(text)
      if (match?.[1]) {
        return {
          screen: 'ESCOLHER_AMBIENTE',
          context: { ...context, partySize: Number(match[1]) },
        }
      }
    }

    if (KEYWORDS_OPT_OUT.some((word) => text === word)) {
      return { screen: 'OPT_OUT', context: clearBooking(context) }
    }
    if (KEYWORDS_OPT_IN.some((word) => text.includes(word))) {
      return { screen: 'OPT_IN', context }
    }
    if (KEYWORDS_MENU.some((word) => text === word)) {
      return { screen: 'MENU', context: clearBooking(context) }
    }
    if (text.includes(FRASE_DO_SITE)) {
      const areaHint = areaHintFrom(input.text)
      return {
        screen: 'ESCOLHER_PESSOAS',
        context: areaHint ? { ...clearBooking(context), areaHint } : clearBooking(context),
      }
    }
    if (KEYWORDS_RESERVAR.some((word) => text === word)) {
      return { screen: 'ESCOLHER_PESSOAS', context: clearBooking(context) }
    }
    if (KEYWORDS_CARDAPIO.some((word) => text === normalizeText(word))) {
      return { screen: 'CARDAPIO', context }
    }
    // Esperava o número de pessoas e veio outra coisa: pergunta de novo, em vez
    // de jogar o cliente de volta para o menu no meio da reserva.
    if (input.screen === 'DIGITAR_PESSOAS') {
      return { screen: 'DIGITAR_PESSOAS', context }
    }
    // Qualquer outra coisa — inclusive áudio, foto e figurinha — cai aqui.
    return { screen: 'NAO_ENTENDI', context }
  }

  // --- Toques de botão -------------------------------------------------------
  switch (true) {
    case action === ACTION.menu:
      return { screen: 'MENU', context: clearBooking(context) }

    case action === ACTION.reservar:
      return { screen: 'ESCOLHER_PESSOAS', context: clearBooking(context) }

    case action === ACTION.minhas:
      return { screen: 'MINHAS_RESERVAS', context: clearBooking(context) }

    case action === ACTION.cardapio:
      return { screen: 'CARDAPIO', context }

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

    // "9 ou mais" → o cliente digita o número
    case action === ACTION.partyMore:
      return { screen: 'DIGITAR_PESSOAS', context }

    // Número de pessoas escolhido → escolhe o ambiente
    case action.startsWith(ACTION.party):
      return {
        screen: 'ESCOLHER_AMBIENTE',
        context: { ...context, partySize: Number(suffix(action, ACTION.party)) || undefined },
      }

    // Ambiente escolhido → escolhe o dia
    case action.startsWith(ACTION.area):
      return {
        screen: 'ESCOLHER_DIA',
        context: { ...context, areaId: suffix(action, ACTION.area), dayOffset: 0 },
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
      // O handler tenta reservar de verdade; se o ambiente tiver enchido, ele
      // troca esta tela por HORARIO_OCUPADO — e, para grupo grande, por
      // AGUARDANDO_APROVACAO.
      return { screen: 'RESERVADO', context }

    case action === ACTION.changeTime:
      return { screen: 'ESCOLHER_DIA', context: { ...context, day: undefined, slot: undefined, dayOffset: 0 } }

    case action === ACTION.abort:
      return { screen: 'MENU', context: clearBooking(context) }

    case action.startsWith(ACTION.cancel):
      return {
        screen: 'CONFIRMAR_CANCELAMENTO',
        context: { ...context, reservationId: suffix(action, ACTION.cancel) },
      }

    case action.startsWith(ACTION.reschedule):
      // Remarcar é cancelar + reservar de novo: começa um fluxo limpo,
      // guardando qual reserva sai quando a nova for confirmada.
      return {
        screen: 'ESCOLHER_PESSOAS',
        context: { reservationId: suffix(action, ACTION.reschedule) },
      }

    case action.startsWith(ACTION.cancelYes):
      return {
        screen: 'CANCELADO',
        context: { ...context, reservationId: suffix(action, ACTION.cancelYes) },
      }

    case action === ACTION.cancelNo:
      return { screen: 'MINHAS_RESERVAS', context: clearBooking(context) }

    case action.startsWith(ACTION.reservation):
      return {
        screen: 'ACOES_RESERVA',
        context: { ...context, reservationId: suffix(action, ACTION.reservation) },
      }

    // Botões do template de lembrete
    case action.startsWith(ACTION.presencaOk):
      return {
        screen: 'PRESENCA_CONFIRMADA',
        context: { ...context, reservationId: suffix(action, ACTION.presencaOk) },
      }

    case action.startsWith(ACTION.presencaCancel):
      return {
        screen: 'CONFIRMAR_CANCELAMENTO',
        context: { ...context, reservationId: suffix(action, ACTION.presencaCancel) },
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
