import { config } from '../config'
import { RazorIcon } from './Icons'

interface LogoProps {
  className?: string
  /** Altura da logo em rem — a mesma medida vale para imagem e marca padrão. */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * A logo do cliente pode ser um brasão quadrado ou um letreiro bem largo.
 * A altura é fixa e a largura tem teto: um letreiro largo encolhe dentro
 * da faixa (graças ao `object-contain`) em vez de atravessar a tela.
 */
const SIZES = {
  sm: { img: 'h-9 max-w-[9.5rem]', icon: 'size-5', text: 'text-xl' },
  md: { img: 'h-12 max-w-[12rem]', icon: 'size-7', text: 'text-3xl' },
  lg: {
    img: 'h-20 max-w-[min(17rem,72vw)] sm:h-24 sm:max-w-[20rem]',
    icon: 'size-12 sm:size-14',
    text: 'text-5xl sm:text-6xl',
  },
} as const

/**
 * Logo da barbearia: a imagem do config quando existe, senão a marca
 * padrão — navalha na cor de acento + nome em caixa alta. Como a marca
 * padrão é montada com o nome configurado, o site nunca fica sem identidade.
 */
export function Logo({ className = '', size = 'md' }: LogoProps) {
  const { logoUrl, name } = config.brand
  const s = SIZES[size]

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${s.img} w-auto object-contain object-left ${className}`}
      />
    )
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <RazorIcon className={`${s.icon} shrink-0 text-accent`} />
      <span className={`font-display ${s.text} leading-none tracking-wide`}>{name}</span>
    </span>
  )
}
