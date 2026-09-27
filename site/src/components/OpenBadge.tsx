import { config, DAY_LABELS_SHORT } from '../config'
import { getOpenState, nextOpening } from '@restaurante/shared/lib/hours'
import { useNow } from '../hooks/useNow'

interface OpenBadgeProps {
  className?: string
  /** Acrescenta "abre sáb. às 08:00" quando estiver fechado. */
  withNext?: boolean
}

/**
 * Selo "Aberto agora / Fechado", calculado a partir dos horários do
 * config e do relógio do visitante — é a informação que o cliente mais
 * procura antes de chamar no WhatsApp.
 */
export function OpenBadge({ className = '', withNext = false }: OpenBadgeProps) {
  const now = useNow()
  const { open } = getOpenState(config.hours, now)
  const next = open ? null : nextOpening(config.hours, now)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line-strong bg-scrim px-3.5 py-1.5 backdrop-blur-md ${className}`}
    >
      <span className="relative flex size-2">
        {open && (
          <span
            className="absolute inline-flex size-full rounded-full bg-emerald-400"
            style={{ animation: 'bb-pulse-ring 2s ease-out infinite' }}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${open ? 'bg-emerald-400' : 'bg-muted'}`} />
      </span>

      <span className="font-label text-[0.6875rem] font-medium uppercase tracking-[0.18em]">
        {open ? 'Aberto agora' : 'Fechado'}
      </span>

      {withNext && next && (
        <span className="font-sans text-[0.6875rem] normal-case tracking-normal text-muted">
          abre {DAY_LABELS_SHORT[next.day].toLowerCase()}. {next.time}
        </span>
      )}
    </span>
  )
}
