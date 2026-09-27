import { describe, expect, it } from 'vitest'
import { bookingMessage, mapsUrl, normalizePhone, serviceMessage, telUrl, whatsappUrl } from '../whatsapp.js'
import type { Service } from '../../config/types.js'

const service: Service = {
  slug: '',
  name: 'Corte + Barba',
  description: '',
  price: 'R$ 75',
  duration: '1h',
  durationMin: 0,
  imageUrl: '',
  highlight: true,
}

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
    const url = whatsappUrl('11912345678', 'Olá! Agendar?')
    expect(url).toBe('https://wa.me/5511912345678?text=Ol%C3%A1!%20Agendar%3F')
  })
})

describe('mensagens', () => {
  it('inclui nome e preço do serviço', () => {
    expect(serviceMessage(service, 'Barbearia do Zé')).toBe(
      'Olá, Barbearia do Zé! Gostaria de agendar: Corte + Barba (R$ 75).',
    )
  })

  it('omite o preço quando não há', () => {
    expect(serviceMessage({ ...service, price: '' }, 'Barbearia')).toBe(
      'Olá, Barbearia! Gostaria de agendar: Corte + Barba.',
    )
  })

  it('tem uma mensagem genérica para o botão flutuante', () => {
    expect(bookingMessage('Barbearia')).toContain('agendar um horário')
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
