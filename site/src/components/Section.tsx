import type { ReactNode } from 'react'
import { Reveal } from './Reveal'

interface SectionProps {
  id: string
  kicker?: string
  title: string
  children: ReactNode
  /** Conteúdo que sangra até a borda da tela (carrosséis). */
  bleed?: boolean
  className?: string
}

/**
 * Casca comum das seções: espaçamento vertical, título com kicker e a
 * régua de margem lateral. `bleed` deixa o conteúdo encostar nas bordas
 * — é o que faz os carrosséis funcionarem no celular.
 */
export function Section({ id, kicker, title, children, bleed = false, className = '' }: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-16 py-16 sm:py-24 ${className}`}>
      <Reveal className={bleed ? 'px-5 sm:px-8' : ''}>
        <div className={bleed ? 'mx-auto max-w-6xl' : 'mx-auto max-w-6xl px-5 sm:px-8'}>
          {kicker && <p className="kicker mb-3">{kicker}</p>}
          <h2 className="text-4xl sm:text-5xl lg:text-6xl text-balance">{title}</h2>
        </div>
      </Reveal>

      <div className={bleed ? 'mt-8 sm:mt-10' : 'mx-auto mt-8 max-w-6xl px-5 sm:mt-10 sm:px-8'}>{children}</div>
    </section>
  )
}
