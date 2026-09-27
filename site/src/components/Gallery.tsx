import { useState } from 'react'
import { config } from '../config'
import { Lightbox } from './Lightbox'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { SmartImage } from './SmartImage'

/**
 * Mosaico de fotos da casa: pratos, salão, mesa posta. Usa colunas CSS em vez de grade: com alturas
 * alternadas, a grade deixaria buracos no fim de cada linha, enquanto as
 * colunas encaixam as fotos como num feed. Cada toque abre o lightbox.
 */
export function Gallery() {
  const [openAt, setOpenAt] = useState<number | null>(null)
  const { gallery } = config

  if (!config.features.gallery || gallery.length === 0) return null

  return (
    <>
      <Section id="galeria" kicker="Da cozinha ao salão" title="Galeria">
        <div className="columns-2 gap-2.5 sm:columns-3 sm:gap-3 lg:columns-4">
          {gallery.map((image, index) => (
            <Reveal key={`${image.url}-${index}`} delay={Math.min(index, 8) * 50} className="mb-2.5 break-inside-avoid sm:mb-3">
              <button
                type="button"
                onClick={() => setOpenAt(index)}
                aria-label={image.alt ? `Ampliar: ${image.alt}` : `Ampliar foto ${index + 1}`}
                className={`group relative block w-full overflow-hidden rounded-xl border border-line ${
                  index % 3 === 0 ? 'aspect-[3/4]' : 'aspect-square'
                }`}
              >
                <SmartImage
                  src={image.url}
                  alt={image.alt || ''}
                  width={420}
                  ratio={index % 3 === 0 ? 3 / 4 : 1}
                  seed={image.url}
                  className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </button>
            </Reveal>
          ))}
        </div>
      </Section>

      {openAt !== null && (
        <Lightbox images={gallery} index={openAt} onClose={() => setOpenAt(null)} onNavigate={setOpenAt} />
      )}
    </>
  )
}
