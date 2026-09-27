import { describe, expect, it } from 'vitest'
import { ACTION, decide, isSessionExpired, type BotContext, type Screen } from '../bot/machine.js'

/**
 * Percorre o menu inteiro tocando nos botões, sem banco nem rede.
 *
 * É o teste que garante que o cliente nunca fica preso numa tela sem saída —
 * o pior defeito possível num atendimento por WhatsApp, porque ele não tem
 * "voltar" nem F5.
 */

const tap = (action: string, screen: Screen = 'MENU', context: BotContext = {}) =>
  decide({ action, text: '', screen, context })

const type = (text: string, screen: Screen = 'MENU', context: BotContext = {}) =>
  decide({ action: null, text, screen, context })

describe('texto livre', () => {
  it('qualquer frase cai no menu, sem tentar adivinhar', () => {
    expect(type('quero uma mesa pra 4 amanhã à noite').screen).toBe('NAO_ENTENDI')
    expect(type('vcs abrem domingo?').screen).toBe('NAO_ENTENDI')
    expect(type('👍').screen).toBe('NAO_ENTENDI')
  })

  it('reconhece as poucas palavras-chave que valem', () => {
    expect(type('menu').screen).toBe('MENU')
    expect(type('Oi').screen).toBe('MENU')
    expect(type('  BOM DIA  ').screen).toBe('MENU')
    expect(type('reservar').screen).toBe('ESCOLHER_PESSOAS')
    expect(type('Cardápio').screen).toBe('CARDAPIO')
  })

  it('reconhece a mensagem que o próprio site monta', () => {
    // É o texto que sai de bookingMessage/areaMessage em @restaurante/shared/lib/whatsapp.
    const geral = type('Olá, Cantina Bella Nonna! Gostaria de reservar uma mesa.')
    expect(geral.screen).toBe('ESCOLHER_PESSOAS')
    expect(geral.context.areaHint).toBeUndefined()

    const varanda = type('Olá, Cantina Bella Nonna! Gostaria de reservar uma mesa na Varanda.')
    expect(varanda.screen).toBe('ESCOLHER_PESSOAS')
    expect(varanda.context.areaHint).toBe('Varanda')
  })

  it('trata o pedido de saída em qualquer grafia', () => {
    expect(type('sair').screen).toBe('OPT_OUT')
    expect(type('PARAR').screen).toBe('OPT_OUT')
    expect(type('cancelar inscrição').screen).toBe('OPT_OUT')
  })

  it('não confunde "cancelar" no meio de uma frase com opt-out', () => {
    // Cliente escrevendo "quero cancelar minha reserva" não pode sair da lista.
    expect(type('quero cancelar minha reserva').screen).toBe('NAO_ENTENDI')
  })
})

describe('fluxo de reserva', () => {
  it('vai do menu até a confirmação guardando cada escolha', () => {
    let step = tap(ACTION.reservar)
    expect(step.screen).toBe('ESCOLHER_PESSOAS')

    step = tap(`${ACTION.party}4`, step.screen, step.context)
    expect(step.screen).toBe('ESCOLHER_AMBIENTE')
    expect(step.context.partySize).toBe(4)

    step = tap(`${ACTION.area}amb-1`, step.screen, step.context)
    expect(step.screen).toBe('ESCOLHER_DIA')
    expect(step.context.areaId).toBe('amb-1')

    step = tap(`${ACTION.day}2026-08-22`, step.screen, step.context)
    expect(step.screen).toBe('ESCOLHER_HORARIO')
    expect(step.context.day).toBe('2026-08-22')

    step = tap(`${ACTION.time}2026-08-22T23:00:00.000Z`, step.screen, step.context)
    expect(step.screen).toBe('CONFIRMAR')

    step = tap(ACTION.confirm, step.screen, step.context)
    expect(step.screen).toBe('RESERVADO')
    // O contexto chega inteiro no efeito que reserva a mesa.
    expect(step.context).toMatchObject({
      partySize: 4,
      areaId: 'amb-1',
      day: '2026-08-22',
      slot: '2026-08-22T23:00:00.000Z',
    })
  })

  it('"9 ou mais" pede o número digitado, e só essa tela aceita número', () => {
    const step = tap(ACTION.partyMore, 'ESCOLHER_PESSOAS')
    expect(step.screen).toBe('DIGITAR_PESSOAS')

    const digitado = type('12 pessoas', step.screen, step.context)
    expect(digitado.screen).toBe('ESCOLHER_AMBIENTE')
    expect(digitado.context.partySize).toBe(12)

    // Fora dessa tela, número é texto livre como qualquer outro.
    expect(type('12').screen).toBe('NAO_ENTENDI')
  })

  it('texto que não é número na tela de digitar pergunta de novo', () => {
    expect(type('uns doze', 'DIGITAR_PESSOAS').screen).toBe('DIGITAR_PESSOAS')
    // Mas "menu" continua sendo a saída de emergência.
    expect(type('menu', 'DIGITAR_PESSOAS').screen).toBe('MENU')
  })

  it('a dica de ambiente do site sobrevive até a escolha do grupo', () => {
    const site = type('Olá! Gostaria de reservar uma mesa na Varanda.')
    const step = tap(`${ACTION.party}2`, site.screen, site.context)
    expect(step.context).toMatchObject({ partySize: 2, areaHint: 'Varanda' })
  })

  it('"sem preferência" de ambiente segue como qualquer outro', () => {
    const step = tap(ACTION.areaAny, 'ESCOLHER_AMBIENTE', { partySize: 2 })
    expect(step.screen).toBe('ESCOLHER_DIA')
    expect(step.context.areaId).toBe('any')
  })

  it('"trocar horário" volta para os dias sem perder o grupo e o ambiente', () => {
    const context = { partySize: 4, areaId: 'amb-1', day: '2026-08-22', slot: 'x' }
    const step = tap(ACTION.changeTime, 'CONFIRMAR', context)

    expect(step.screen).toBe('ESCOLHER_DIA')
    expect(step.context).toMatchObject({ partySize: 4, areaId: 'amb-1' })
    expect(step.context.slot).toBeUndefined()
  })

  it('paginação de dias e horários guarda a posição', () => {
    expect(tap(`${ACTION.dayMore}:8`, 'ESCOLHER_DIA').context.dayOffset).toBe(8)
    expect(tap(`${ACTION.timeMore}:8`, 'ESCOLHER_HORARIO').context.timeOffset).toBe(8)
  })

  it('cancelar no meio do fluxo limpa tudo e volta ao menu', () => {
    const step = tap(ACTION.abort, 'CONFIRMAR', { partySize: 4, slot: 'x' })
    expect(step.screen).toBe('MENU')
    expect(step.context).toEqual({})
  })
})

describe('minhas reservas', () => {
  it('abre as ações da reserva escolhida', () => {
    const step = tap(`${ACTION.reservation}res-9`, 'MINHAS_RESERVAS')
    expect(step.screen).toBe('ACOES_RESERVA')
    expect(step.context.reservationId).toBe('res-9')
  })

  it('cancelamento sempre passa por uma confirmação', () => {
    const step = tap(`${ACTION.cancel}res-9`, 'ACOES_RESERVA')
    expect(step.screen).toBe('CONFIRMAR_CANCELAMENTO')
    expect(step.context.reservationId).toBe('res-9')

    expect(tap(ACTION.cancelNo, step.screen, step.context).screen).toBe('MINHAS_RESERVAS')
    expect(tap(`${ACTION.cancelYes}res-9`, step.screen, step.context).screen).toBe('CANCELADO')
  })

  it('remarcar recomeça o fluxo lembrando qual reserva será substituída', () => {
    const step = tap(`${ACTION.reschedule}res-9`, 'ACOES_RESERVA')
    expect(step.screen).toBe('ESCOLHER_PESSOAS')
    expect(step.context.reservationId).toBe('res-9')
    expect(step.context.slot).toBeUndefined()
  })
})

describe('botões do lembrete (template)', () => {
  it('confirma a presença da reserva certa', () => {
    // A resposta a um template não traz contexto nenhum: o ID vem no payload.
    const step = tap(`${ACTION.presencaOk}res-42`, 'MENU')
    expect(step.screen).toBe('PRESENCA_CONFIRMADA')
    expect(step.context.reservationId).toBe('res-42')
  })

  it('cancelar pelo lembrete cai direto na confirmação daquela reserva', () => {
    const step = tap(`${ACTION.presencaCancel}res-42`, 'MENU')
    expect(step.screen).toBe('CONFIRMAR_CANCELAMENTO')
    expect(step.context.reservationId).toBe('res-42')
  })
})

describe('robustez', () => {
  it('botão de uma versão antiga não trava a conversa', () => {
    // Conversa aberta antes de um deploy que renomeou os IDs.
    expect(tap('acao:que:nao:existe:mais', 'ESCOLHER_DIA').screen).toBe('NAO_ENTENDI')
  })

  it('sessão parada há muito tempo é considerada expirada', () => {
    const now = new Date('2026-08-21T12:00:00Z')
    expect(isSessionExpired(new Date('2026-08-21T11:30:00Z'), 20, now)).toBe(true)
    expect(isSessionExpired(new Date('2026-08-21T11:50:00Z'), 20, now)).toBe(false)
  })
})
