import { describe, expect, it } from 'vitest'
import { areaMessage, bookingMessage, mapsUrl, normalizePhone, telUrl, whatsappUrl } from '../whatsapp.js'

describe('normalizePhone', () => {
  it('acrescenta o DDI quando o número vem só com DDD', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('5511912345678')
    expect(normalizePhone('11 3456-7890')).toBe('551134567890')
  })

  it('mantém o número que já tem DDI', () => {
    expect(normalizePhone('+55 11 91234-5678')).toBe('5511912345678')
    expect(normalizePhone('5511912345678')).toBe('5511912345678')
  })

  it('acrescenta o nono dígito no wa_id de celular que a Meta manda sem ele', () => {
    expect(normalizePhone('553195013271')).toBe('5531995013271')
    expect(normalizePhone('551181234567')).toBe('5511981234567')
  })

  it('não mexe em fixo nem em número que já tem o nono dígito', () => {
    expect(normalizePhone('551134567890')).toBe('551134567890')
    expect(normalizePhone('5531995013271')).toBe('5531995013271')
  })

  it('devolve vazio quando não há dígitos', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('sem número')).toBe('')
  })
})

describe('whatsappUrl', () => {
  it('monta o link sem mensagem', () => {
    expect(whatsappUrl('11912345678')).toBe('https://wa.me/5511912345678')
  })

  it('codifica a mensagem na query', () => {
    const url = whatsappUrl('11912345678', 'Olá! Reservar?')
    expect(url).toBe('https://wa.me/5511912345678?text=Ol%C3%A1!%20Reservar%3F')
  })
})

describe('mensagens', () => {
  it('tem uma mensagem genérica de reserva para o botão flutuante', () => {
    expect(bookingMessage('Cantina Bella Nonna')).toBe('Olá, Cantina Bella Nonna! Gostaria de reservar uma mesa.')
  })

  it('o card do ambiente já diz onde o cliente quer sentar', () => {
    expect(areaMessage('Varanda', 'Cantina')).toBe('Olá, Cantina! Gostaria de reservar uma mesa na Varanda.')
  })

  it('as duas carregam a frase que o bot reconhece', () => {
    expect(bookingMessage('X').toLowerCase()).toContain('gostaria de reservar')
    expect(areaMessage('Salão', 'X').toLowerCase()).toContain('uma mesa na ')
  })
})

describe('links auxiliares', () => {
  it('monta o tel: com DDI', () => {
    expect(telUrl('(11) 3456-7890')).toBe('tel:+551134567890')
  })

  it('usa o link do Maps quando o config traz um', () => {
    expect(mapsUrl('Rua X, 1', 'https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc')
  })

  it('gera a busca no Maps a partir do endereço', () => {
    expect(mapsUrl('Rua X, 1')).toBe('https://www.google.com/maps/search/?api=1&query=Rua%20X%2C%201')
  })
})
