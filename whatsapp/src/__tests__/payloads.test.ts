import { describe, expect, it } from 'vitest'
import { fit, fitBody, LIMITS } from '../whatsapp/limits.js'
import {
  buttonMessage,
  ctaUrlMessage,
  listMessage,
  templateMessage,
  textMessage,
} from '../whatsapp/payloads.js'
import { DEFAULT_CONFIG } from '@barbearia/shared/config'
import { escolherHorarioScreen } from '../bot/screens.js'
import { makeT } from '../bot/textos.js'

/**
 * Os limites da Meta são recusa da mensagem INTEIRA, não corte silencioso.
 * Um nome de serviço comprido derrubaria o menu do cliente — por isso tudo
 * passa por `fit()`, e por isso este teste existe.
 */

describe('fit', () => {
  it('deixa em paz o texto que já cabe', () => {
    expect(fit('Corte + Barba', 24)).toBe('Corte + Barba')
  })

  it('corta preservando a palavra quando dá', () => {
    const result = fit('Corte Degradê com Navalha Premium', 24)
    expect(result.length).toBeLessThanOrEqual(24)
    expect(result.endsWith('…')).toBe(true)
    expect(result).not.toMatch(/\s…$/) // sem espaço antes das reticências
  })

  it('corta no meio da palavra quando ela é longa demais', () => {
    const result = fit('Superhipermegacortemodernissimo', 12)
    expect(result.length).toBeLessThanOrEqual(12)
  })

  it('normaliza espaços e quebras de linha', () => {
    expect(fit('  Corte    +\n Barba  ', 40)).toBe('Corte + Barba')
  })

  it('fitBody preserva parágrafos', () => {
    expect(fitBody('Linha 1\n\nLinha 2', 100)).toBe('Linha 1\n\nLinha 2')
  })
})

describe('mensagem de texto', () => {
  it('monta o payload que a Cloud API espera', () => {
    const message = textMessage('5511999999999', 'Olá!')
    expect(message).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5511999999999',
      type: 'text',
      text: { body: 'Olá!', preview_url: false },
    })
  })

  it('respeita o limite de 4096 caracteres', () => {
    const message = textMessage('5511999999999', 'a'.repeat(5000))
    expect((message.text as { body: string }).body.length).toBeLessThanOrEqual(LIMITS.text)
  })
})

describe('botões', () => {
  it('monta até três botões, cortando títulos longos', () => {
    const message = buttonMessage('5511999999999', 'Confirma?', [
      { id: 'ok:sim', title: 'Confirmar' },
      { id: 'ok:trocar', title: 'Trocar horário para outro dia' },
      { id: 'ok:nao', title: 'Cancelar' },
    ])

    const buttons = (message.interactive as { action: { buttons: { reply: { title: string } }[] } }).action.buttons
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(button.reply.title.length).toBeLessThanOrEqual(LIMITS.buttonTitle)
    }
  })

  it('recusa o quarto botão em vez de deixar a Meta recusar', () => {
    expect(() =>
      buttonMessage('5511999999999', 'Escolha', [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
        { id: 'd', title: 'D' },
      ]),
    ).toThrow(/no máximo 3/)
  })
})

describe('lista', () => {
  it('corta título e descrição de cada linha nos limites da Meta', () => {
    const message = listMessage('5511999999999', 'Escolha', 'Ver serviços', [
      {
        title: 'Serviços da barbearia com nome bem comprido',
        rows: [
          {
            id: 'svc:1',
            title: 'Corte Degradê com Navalha e Toalha Quente',
            description: 'Uma descrição bastante longa que passa dos setenta e dois caracteres permitidos pela Meta',
          },
        ],
      },
    ])

    const action = (message.interactive as {
      action: { button: string; sections: { title: string; rows: { title: string; description?: string }[] }[] }
    }).action

    expect(action.button.length).toBeLessThanOrEqual(LIMITS.listButton)
    expect(action.sections[0]!.title.length).toBeLessThanOrEqual(LIMITS.sectionTitle)
    expect(action.sections[0]!.rows[0]!.title.length).toBeLessThanOrEqual(LIMITS.rowTitle)
    expect(action.sections[0]!.rows[0]!.description!.length).toBeLessThanOrEqual(LIMITS.rowDescription)
  })

  it('recusa mais de dez linhas', () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ id: `r${index}`, title: `Opção ${index}` }))
    expect(() => listMessage('5511999999999', 'Escolha', 'Ver', [{ title: 'Tudo', rows }])).toThrow(
      /no máximo 10/,
    )
  })

  it('recusa lista vazia', () => {
    expect(() => listMessage('5511999999999', 'Escolha', 'Ver', [{ title: 'Vazio', rows: [] }])).toThrow(
      /sem nenhuma linha/,
    )
  })
})

describe('template', () => {
  it('monta as variáveis do corpo na ordem informada', () => {
    const message = templateMessage('5511999999999', 'lembrete_24h', 'pt_BR', {
      bodyParams: ['João', 'Barbearia do Zé', 'Corte + Barba', 'sexta, 22/08 às 14:30'],
    })

    const template = message.template as { name: string; language: { code: string }; components: unknown[] }
    expect(template.name).toBe('lembrete_24h')
    expect(template.language.code).toBe('pt_BR')
    const body = template.components[0] as { type: string; parameters: { type: string; text: string }[] }
    expect(body.type).toBe('body')
    expect(body.parameters.map((parameter) => parameter.text)).toEqual([
      'João',
      'Barbearia do Zé',
      'Corte + Barba',
      'sexta, 22/08 às 14:30',
    ])
  })

  it('inclui os botões de resposta rápida com o índice certo', () => {
    const message = templateMessage('5511999999999', 'lembrete_24h', 'pt_BR', {
      bodyParams: ['João'],
      quickReplyPayloads: ['lembrete:confirmo:apt-1', 'lembrete:cancelar:apt-1'],
    })

    const components = (message.template as { components: Record<string, unknown>[] }).components
    const buttons = components.filter((component) => component.type === 'button')

    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toMatchObject({ sub_type: 'quick_reply', index: '0' })
    expect(buttons[1]).toMatchObject({ sub_type: 'quick_reply', index: '1' })
  })

  it('template sem variáveis não manda "components" vazio', () => {
    const message = templateMessage('5511999999999', 'simples', 'pt_BR')
    expect(message.template).not.toHaveProperty('components')
  })
})

describe('botão de link', () => {
  it('monta o cta_url para o pedido de avaliação', () => {
    const message = ctaUrlMessage('5511999999999', 'Avalia a gente?', 'Avaliar', 'https://g.page/r/exemplo')
    expect(message.interactive).toMatchObject({
      type: 'cta_url',
      action: { name: 'cta_url', parameters: { display_text: 'Avaliar', url: 'https://g.page/r/exemplo' } },
    })
  })
})

describe('tela de horários', () => {
  const TZ = 'America/Sao_Paulo'
  const HOJE = new Date('2026-08-28T12:00:00.000Z')
  const t = makeT(DEFAULT_CONFIG)

  /** Grade de hora em hora a partir das 09:00 locais (12:00 UTC). */
  const grade = (quantos: number): Date[] =>
    Array.from({ length: quantos }, (_, i) => new Date(HOJE.getTime() + i * 60 * 60_000))

  it('agrupa os horários por turno numa lista só', () => {
    // A página são 8 horários: 09:00 às 16:00 locais, ou seja, manhã e tarde.
    const message = escolherHorarioScreen('5511999999999', t, HOJE, grade(12), TZ, 0, HOJE)
    const { sections } = (message.interactive as any).action

    expect(sections.map((section: any) => section.title)).toEqual(['Manhã', 'Tarde', 'Outras opções'])

    const rows = sections.flatMap((section: any) => section.rows)
    expect(rows).toHaveLength(LIMITS.maxRows)
    expect(rows.at(-2).id).toMatch(/^hor:mais:/)
    expect(rows.at(-1).id).toBe('menu')
  })

  it('não oferece "ver mais" quando o dia inteiro cabe na página', () => {
    const message = escolherHorarioScreen('5511999999999', t, HOJE, grade(4), TZ, 0, HOJE)
    const { sections } = (message.interactive as any).action

    const rows = sections.flatMap((section: any) => section.rows)
    expect(rows).toHaveLength(5) // 4 horários + voltar ao menu
    expect(rows.some((row: any) => row.id.startsWith('hor:mais'))).toBe(false)
  })
})
