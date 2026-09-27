/**
 * Textura de fundo com ícones de restaurante (talheres, cloche, taça, prato)
 * em opacidade muito baixa — a mesma do site do Table Zap, para o cliente
 * reconhecer a família. Pinta com o acento da marca, então acompanha qualquer
 * paleta do config. Puramente decorativa: escondida de leitores de tela.
 */
export function FoodPattern({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <defs>
        <pattern id="bb-food-pattern" width="170" height="170" patternUnits="userSpaceOnUse">
          <g
            stroke="var(--bb-brand-accent)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* garfo e faca */}
            <g transform="translate(18 14) rotate(-12)">
              <path d="M2 0v9a4 4 0 0 0 8 0V0M6 0v30" />
              <path d="M20 30V0c5 3 7 9 7 15h-7" />
            </g>
            {/* cloche */}
            <g transform="translate(92 36)">
              <path d="M2 22a18 18 0 0 1 36 0Z" />
              <path d="M0 26h40M20 4V1" />
            </g>
            {/* taça de vinho */}
            <g transform="translate(34 104) rotate(-10)">
              <path d="M2 0h18c0 10-4 16-9 16S2 10 2 0ZM11 16v12M5 28h12" />
            </g>
            {/* prato */}
            <g transform="translate(112 112)">
              <circle cx="14" cy="14" r="14" />
              <circle cx="14" cy="14" r="8" />
            </g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bb-food-pattern)" opacity="0.07" />
    </svg>
  )
}
