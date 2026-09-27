import { config } from '../config'
import { bookingMessage, mapEmbedUrl, mapsUrl, telUrl, whatsappUrl } from '@barbearia/shared/lib/whatsapp'
import {
  FacebookIcon,
  InstagramIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  RouteIcon,
  TikTokIcon,
  WhatsAppIcon,
} from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'

function SocialLinks() {
  const { instagram, facebook, tiktok } = config.contact.social
  const links = [
    instagram && { href: `https://instagram.com/${instagram}`, label: 'Instagram', Icon: InstagramIcon },
    facebook && { href: facebook, label: 'Facebook', Icon: FacebookIcon },
    tiktok && { href: `https://tiktok.com/@${tiktok}`, label: 'TikTok', Icon: TikTokIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof InstagramIcon }[]

  if (links.length === 0) return null

  return (
    <div className="flex gap-3">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={label}
          className="grid size-12 place-items-center rounded-full border border-line-strong text-muted transition-colors hover:border-accent hover:text-ink"
        >
          <Icon className="size-5" />
        </a>
      ))}
    </div>
  )
}

/**
 * Endereço, rota, telefone e redes. Os botões são grandes de propósito:
 * é a seção que o cliente usa com uma mão só, andando na rua.
 */
export function Contact() {
  const { contact, brand, features } = config
  const phone = contact.phone || contact.whatsapp
  const route = mapsUrl(contact.address, contact.mapsUrl)

  return (
    <Section id="contato" kicker="Onde estamos" title="Venha nos visitar">
      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal className="flex flex-col gap-5">
          {contact.address && (
            <a
              href={route}
              target="_blank"
              rel="noreferrer noopener"
              className="card flex items-start gap-4 p-5 transition-colors hover:border-line-strong"
            >
              <PinIcon className="mt-0.5 size-5 shrink-0 text-accent" />
              <span>
                <span className="block font-label text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
                  Endereço
                </span>
                <span className="mt-1 block text-[0.9375rem] leading-relaxed">{contact.address}</span>
              </span>
            </a>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href={whatsappUrl(contact.whatsapp, bookingMessage(brand.name))}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-brand"
            >
              <WhatsAppIcon className="size-5" />
              WhatsApp
            </a>

            {contact.address && (
              <a href={route} target="_blank" rel="noreferrer noopener" className="btn btn-ghost">
                <RouteIcon className="size-5" />
                Traçar rota
              </a>
            )}

            {phone && (
              <a href={telUrl(phone)} className="btn btn-ghost">
                <PhoneIcon className="size-5" />
                Ligar
              </a>
            )}

            {contact.email && (
              <a href={`mailto:${contact.email}`} className="btn btn-ghost">
                <MailIcon className="size-5" />
                E-mail
              </a>
            )}
          </div>

          <SocialLinks />
        </Reveal>

        {features.map && contact.address && (
          <Reveal delay={120}>
            <div className="card h-64 overflow-hidden lg:h-full lg:min-h-[20rem]">
              <iframe
                title={`Mapa — ${brand.name}`}
                src={mapEmbedUrl(contact.address)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="size-full border-0"
                /* Inverte o mapa (que é claro) para o tom do site — e evita
                   um bloco branco caso o iframe não carregue. */
                style={{ filter: 'invert(0.92) hue-rotate(180deg) saturate(0.55) contrast(0.9)' }}
              />
            </div>
          </Reveal>
        )}
      </div>
    </Section>
  )
}
