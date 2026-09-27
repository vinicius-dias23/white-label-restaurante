import { config } from '../config'
import { serviceMessage, whatsappUrl } from '@barbearia/shared/lib/whatsapp'
import type { Service } from '@barbearia/shared/config'
import { ClockIcon, WhatsAppIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { SmartImage } from './SmartImage'

function ServiceCard({ service, index }: { service: Service; index: number }) {
  const href = whatsappUrl(config.contact.whatsapp, serviceMessage(service, config.brand.name))

  return (
    <Reveal delay={Math.min(index, 5) * 70} className="h-full">
      <article
        className={`card group flex h-full flex-col ${
          service.highlight ? 'border-accent/60 shadow-[0_0_40px_-18px_var(--bb-brand-glow)]' : ''
        }`}
      >
        <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[4/3]">
          <SmartImage
            src={service.imageUrl}
            alt={service.name}
            width={520}
            ratio={4 / 3}
            seed={service.name}
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />

          {service.highlight && (
            <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 font-label text-[0.625rem] font-medium uppercase tracking-[0.18em] text-on-brand">
              Mais pedido
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-2xl leading-tight">{service.name}</h3>
              {service.description && <p className="mt-1.5 text-sm text-muted">{service.description}</p>}
            </div>

            {service.price && (
              <span className="shrink-0 font-display text-3xl leading-none text-accent">{service.price}</span>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-1">
            {service.duration ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <ClockIcon className="size-4" />
                {service.duration}
              </span>
            ) : (
              <span />
            )}

            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-ghost h-10 min-h-10 px-4 text-xs"
              aria-label={`Agendar ${service.name} no WhatsApp`}
            >
              <WhatsAppIcon className="size-4" />
              Agendar
            </a>
          </div>
        </div>
      </article>
    </Reveal>
  )
}

/** Cardápio de serviços: foto, preço grande e um toque para o WhatsApp. */
export function Services() {
  if (config.services.length === 0) return null

  return (
    <Section id="servicos" kicker="O que fazemos" title="Serviços & preços">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {config.services.map((service, index) => (
          <ServiceCard key={`${service.name}-${index}`} service={service} index={index} />
        ))}
      </div>
    </Section>
  )
}
