import { config } from '../config'
import { areaMessage, whatsappUrl } from '@restaurante/shared/lib/whatsapp'
import type { Area } from '@restaurante/shared/config'
import { UsersIcon, WhatsAppIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { SmartImage } from './SmartImage'

function AreaCard({ area, index }: { area: Area; index: number }) {
  const href = whatsappUrl(config.contact.whatsapp, areaMessage(area.name, config.brand.name))

  return (
    <Reveal delay={Math.min(index, 4) * 90} className="h-full">
      <article className="card group flex h-full flex-col">
        <div className="relative aspect-[16/10] overflow-hidden">
          <SmartImage
            src={area.imageUrl}
            alt={area.name}
            width={640}
            ratio={16 / 10}
            seed={area.name}
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />
          <h3 className="absolute inset-x-5 bottom-4 text-3xl leading-none sm:text-4xl">{area.name}</h3>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5 pt-3">
          {area.description && <p className="text-[0.9375rem] leading-relaxed text-muted">{area.description}</p>}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
            {area.capacity > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-label text-xs uppercase tracking-[0.14em] text-muted">
                <UsersIcon className="size-4 text-accent" />
                Até {area.capacity} pessoas
              </span>
            ) : (
              <span />
            )}

            {/* `bookable: false` tira o ambiente das reservas do WhatsApp — o
                card continua aqui para o cliente conhecer o espaço, mas sem o
                botão, que levaria a um pedido que o bot recusaria. */}
            {area.bookable && (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn-brand h-11 min-h-11 px-5 text-xs"
                aria-label={`Reservar mesa na ${area.name} pelo WhatsApp`}
              >
                <WhatsAppIcon className="size-4" />
                Reservar aqui
              </a>
            )}
          </div>
        </div>
      </article>
    </Reveal>
  )
}

/**
 * Os ambientes da casa (Salão, Varanda...): foto grande, uma linha sobre o
 * espaço, a lotação e um botão que já pede a mesa naquele ambiente.
 */
export function Areas() {
  const { areas, features } = config
  if (!features.areas || areas.length === 0) return null

  return (
    <Section id="ambientes" kicker="Escolha seu lugar" title="Ambientes">
      <div className={`grid gap-4 sm:grid-cols-2 ${areas.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
        {areas.map((area, index) => (
          <AreaCard key={`${area.slug || area.name}-${index}`} area={area} index={index} />
        ))}
      </div>
    </Section>
  )
}
