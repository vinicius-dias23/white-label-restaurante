import { config } from '../config'
import { InstagramIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { SmartImage } from './SmartImage'

/**
 * Equipe: chef, sommelier, quem recebe na porta. Carrossel por toque no
 * celular, grade no desktop — o mesmo conteúdo, sem esconder nada em telas
 * pequenas. Não tem botão de reserva por pessoa: a mesa é do restaurante,
 * não de um colaborador.
 */
export function Team() {
  const { team } = config
  if (!config.features.team || team.length === 0) return null

  return (
    <Section id="equipe" kicker="Quem cozinha pra você" title="Nossa equipe" bleed>
      <div className="snap-row sm:mx-auto sm:grid sm:max-w-6xl sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-8">
        {team.map((member, index) => (
          <Reveal
            key={`${member.name}-${index}`}
            delay={Math.min(index, 4) * 90}
            className="w-[70vw] max-w-[17rem] sm:w-auto sm:max-w-none"
          >
            <article className="card group relative h-full">
              <div className="aspect-[3/4] overflow-hidden">
                <SmartImage
                  src={member.photoUrl}
                  alt={member.name}
                  width={420}
                  ratio={3 / 4}
                  seed={member.name}
                  className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/80 to-transparent p-4 pt-12">
                <h3 className="text-2xl leading-none">{member.name}</h3>
                {member.role && (
                  <p className="mt-1.5 font-label text-[0.6875rem] uppercase tracking-[0.2em] text-accent">
                    {member.role}
                  </p>
                )}

                {member.instagram && (
                  <a
                    href={`https://instagram.com/${member.instagram}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
                  >
                    <InstagramIcon className="size-4" />@{member.instagram}
                  </a>
                )}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
