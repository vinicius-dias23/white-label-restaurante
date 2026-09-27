import { config } from '../config'
import { useScrolledPast } from '../hooks/useScrollProgress'
import { bookingMessage, whatsappUrl } from '@restaurante/shared/lib/whatsapp'
import { WhatsAppIcon } from './Icons'

/**
 * Botão flutuante do WhatsApp: aparece depois que o hero sai da tela
 * (antes disso o CTA principal já está visível) e fica acima da barra
 * de gestos do iPhone.
 */
export function WhatsAppFab() {
  const visible = useScrolledPast(520)
  const href = whatsappUrl(config.contact.whatsapp, bookingMessage(config.brand.name))

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Reservar mesa pelo WhatsApp"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`btn btn-brand fixed right-4 bottom-safe z-50 size-14 min-h-14 rounded-full p-0 shadow-lg transition-all duration-300 sm:right-6 ${
        visible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <WhatsAppIcon className="size-7" />
    </a>
  )
}
