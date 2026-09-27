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
    expect(type('quero cortar o cabelo amanhã de tarde').screen).toBe('NAO_ENTENDI')
    expect(type('vcs atendem sábado?').screen).toBe('NAO_ENTENDI')
    expect(type('👍').screen).toBe('NAO_ENTENDI')
  })

  it('reconhece as poucas palavras-chave que valem', () => {
    expect(type('menu').screen).toBe('MENU')
    expect(type('Oi').screen).toBe('MENU')
    expect(type('  BOM DIA  ').screen).toBe('MENU')
    expect(type('agendar').screen).toBe('ESCOLHER_SERVICO')
  })

  it('reconhece a mensagem que o próprio site monta', () => {
    // É o texto que sai de bookingMessage/serviceMessage em @barbearia/shared/lib/whatsapp.
    expect(type('Olá, Barbearia do Zé! Gostaria de agendar um horário.').screen).toBe('ESCOLHER_SERVICO')
    expect(type('Olá, Barbearia do Zé! Gostaria de agendar: Corte + Barba (R$ 75).').screen).toBe(
      'ESCOLHER_SERVICO',
    )
  })

  it('trata o pedido de saída em qualquer grafia', () => {
    expect(type('sair').screen).toBe('OPT_OUT')
    expect(type('PARAR').screen).toBe('OPT_OUT')
    expect(type('cancelar inscrição').screen).toBe('OPT_OUT')
  })

  it('não confunde "cancelar" no meio de uma frase com opt-out', () => {
    // Cliente escrevendo "quero cancelar meu horário" não pode sair da lista.
    expect(type('quero cancelar meu horário').screen).toBe('NAO_ENTENDI')
  })
})

describe('fluxo de agendamento', () => {
  it('vai do menu até a confirmação guardando cada escolha', () => {
    let step = tap(ACTION.agendar)
    expect(step.screen).toBe('ESCOLHER_SERVICO')

    step = tap(`${ACTION.service}svc-1`, step.screen, step.context)
    expect(step.screen).toBe('ESCOLHER_BARBEIRO')
    expect(step.context.serviceId).toBe('svc-1')

    step = tap(`${ACTION.barber}brb-1`, step.screen, step.context)
    expect(step.screen).toBe('ESCOLHER_DIA')
    expect(step.context.barberId).toBe('brb-1')

    step = tap(`${ACTION.day}2026-08-22`, step.screen, step.context)
    expect(step.screen).toBe('ESCOLHER_HORARIO')
    expect(step.context.day).toBe('2026-08-22')

    step = tap(`${ACTION.time}2026-08-22T17:00:00.000Z`, step.screen, step.context)
    expect(step.screen).toBe('CONFIRMAR')

    step = tap(ACTION.confirm, step.screen, step.context)
    expect(step.screen).toBe('AGENDADO')
    // O contexto chega inteiro no efeito que reserva o horário.
    expect(step.context).toMatchObject({
      serviceId: 'svc-1',
      barberId: 'brb-1',
      day: '2026-08-22',
      slot: '2026-08-22T17:00:00.000Z',
    })
  })

  it('"sem preferência" segue como qualquer outro barbeiro', () => {
    const step = tap(ACTION.barberAny, 'ESCOLHER_BARBEIRO', { serviceId: 'svc-1' })
    expect(step.screen).toBe('ESCOLHER_DIA')
    expect(step.context.barberId).toBe('any')
  })

  it('"trocar horário" volta para os dias sem perder o serviço', () => {
    const context = { serviceId: 'svc-1', barberId: 'brb-1', day: '2026-08-22', slot: 'x' }
    const step = tap(ACTION.changeTime, 'CONFIRMAR', context)

    expect(step.screen).toBe('ESCOLHER_DIA')
    expect(step.context.serviceId).toBe('svc-1')
    expect(step.context.slot).toBeUndefined()
  })

  it('paginação de dias e horários guarda a posição', () => {
    expect(tap(`${ACTION.dayMore}:8`, 'ESCOLHER_DIA').context.dayOffset).toBe(8)
    expect(tap(`${ACTION.timeMore}:8`, 'ESCOLHER_HORARIO').context.timeOffset).toBe(8)
  })

  it('cancelar no meio do fluxo limpa tudo e volta ao menu', () => {
    const step = tap(ACTION.abort, 'CONFIRMAR', { serviceId: 'svc-1', slot: 'x' })
    expect(step.screen).toBe('MENU')
    expect(step.context).toEqual({})
  })
})

describe('meus agendamentos', () => {
  it('abre as ações do agendamento escolhido', () => {
    const step = tap(`${ACTION.appointment}apt-9`, 'MEUS_AGENDAMENTOS')
    expect(step.screen).toBe('ACOES_AGENDAMENTO')
    expect(step.context.appointmentId).toBe('apt-9')
  })

  it('cancelamento sempre passa por uma confirmação', () => {
    const step = tap(`${ACTION.cancel}apt-9`, 'ACOES_AGENDAMENTO')
    expect(step.screen).toBe('CONFIRMAR_CANCELAMENTO')

    expect(tap(ACTION.cancelNo, step.screen, step.context).screen).toBe('MEUS_AGENDAMENTOS')
    expect(tap(`${ACTION.cancelYes}apt-9`, step.screen, step.context).screen).toBe('CANCELADO')
  })

  it('remarcar recomeça o fluxo lembrando qual horário será substituído', () => {
    const step = tap(`${ACTION.reschedule}apt-9`, 'ACOES_AGENDAMENTO')
    expect(step.screen).toBe('ESCOLHER_SERVICO')
    expect(step.context.appointmentId).toBe('apt-9')
    expect(step.context.slot).toBeUndefined()
  })
})

describe('botões do lembrete (template)', () => {
  it('confirma a presença do agendamento certo', () => {
    // A resposta a um template não traz contexto nenhum: o ID vem no payload.
    const step = tap(`${ACTION.presencaOk}apt-42`, 'MENU')
    expect(step.screen).toBe('PRESENCA_CONFIRMADA')
    expect(step.context.appointmentId).toBe('apt-42')
  })

  it('cancelar pelo lembrete cai direto na confirmação daquele horário', () => {
    const step = tap(`${ACTION.presencaCancel}apt-42`, 'MENU')
    expect(step.screen).toBe('CONFIRMAR_CANCELAMENTO')
    expect(step.context.appointmentId).toBe('apt-42')
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
