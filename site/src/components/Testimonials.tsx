import { config } from '../config'
import { StarIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { SmartImage } from './SmartImage'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5 text-accent" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} className={`size-4 ${i < rating ? '' : 'opacity-25'}`} />
      ))}
    </span>
  )
}

/** Depoimentos curtos, em carrossel por toque. */
export function Testimonials() {
  const { testimonials } = config
  if (!config.features.testimonials || testimonials.length === 0) return null

  return (
    <Section id="depoimentos" kicker="Quem senta na cadeira" title="O que dizem" bleed>
      <div className="snap-row lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-8">
        {testimonials.map((item, index) => (
          <Reveal
            key={`${item.name}-${index}`}
            delay={Math.min(index, 4) * 90}
            className="w-[82vw] max-w-[24rem] lg:w-auto lg:max-w-none"
          >
            <figure className="card flex h-full flex-col gap-4 p-6">
              <Stars rating={item.rating} />

              <blockquote className="flex-1 text-[0.9375rem] leading-relaxed text-ink/90">
                “{item.text}”
              </blockquote>

              <figcaption className="flex items-center gap-3 border-t border-line pt-4">
                {item.photoUrl ? (
                  <SmartImage
                    src={item.photoUrl}
                    alt={item.name}
                    width={80}
                    ratio={1}
                    seed={item.name}
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-soft font-display text-lg text-accent">
                    {item.name.charAt(0)}
                  </span>
                )}
                <span className="font-label text-xs uppercase tracking-[0.16em] text-muted">{item.name}</span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
