import type { Service } from '../config/types.js'

const DEFAULT_COUNTRY_CODE = '55'

/**
 * Devolve o celular brasileiro com o nono dígito.
 *
 * A Meta manda o `wa_id` de números brasileiros no formato ANTIGO, sem o 9:
 * quem escreve do 55 31 99501-3271 chega como "553195013271". Mandar a resposta
 * de volta para esse número é o erro 131030 no número de teste ("not in allowed
 * list") e, em produção, mensagem entregue ao número errado ou a ninguém.
 *
 * A regra: celular tem 9 dígitos e começa com 9; fixo tem 8 e começa com 2-5.
 * Um local de 8 dígitos começando em 6-9 é celular no formato antigo — ganha o 9.
 */
function withBrazilNinthDigit(digits: string): string {
  if (!digits.startsWith('55') || digits.length !== 12) return digits
  const local = digits.slice(4)
  if (!/^[6-9]/.test(local)) return digits // fixo, não mexe
  return `${digits.slice(0, 4)}9${local}`
}

/**
 * Normaliza o número para o formato que o wa.me e a Cloud API esperam: só
 * dígitos, com DDI. Aceita "(11) 91234-5678", "+55 11 91234-5678",
 * "5511912345678" e o `wa_id` da Meta sem o nono dígito.
 */
export function normalizePhone(raw: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  // 10 ou 11 dígitos = número brasileiro sem DDI (DDD + linha).
  const withCountry = digits.length <= 11 ? `${countryCode}${digits}` : digits
  return withBrazilNinthDigit(withCountry)
}

/** Link do WhatsApp com mensagem opcional já preenchida. */
export function whatsappUrl(phone: string, message = ''): string {
  const number = normalizePhone(phone)
  const base = `https://wa.me/${number}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/** "Olá! Gostaria de agendar: Corte + Barba (R$ 75)." */
export function serviceMessage(service: Service, brandName: string): string {
  const price = service.price ? ` (${service.price})` : ''
  return `Olá, ${brandName}! Gostaria de agendar: ${service.name}${price}.`
}

/** Mensagem genérica do botão flutuante e do hero. */
export function bookingMessage(brandName: string): string {
  return `Olá, ${brandName}! Gostaria de agendar um horário.`
}

/** Link `tel:` a partir de qualquer formatação de telefone. */
export function telUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `tel:+${digits.length <= 11 ? DEFAULT_COUNTRY_CODE + digits : digits}`
}

/** Link de rota no Google Maps a partir do endereço. */
export function mapsUrl(address: string, override = ''): string {
  if (override) return override
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** Endereço embutido no iframe do mapa (sem chave de API). */
export function mapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
}
