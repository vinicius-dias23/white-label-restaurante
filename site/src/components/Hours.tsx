import { config, DAY_KEYS, DAY_LABELS } from '../config'
import { useNow } from '../hooks/useNow'
import { formatRanges, getOpenState } from '@barbearia/shared/lib/hours'
import { OpenBadge } from './OpenBadge'
import { Reveal } from './Reveal'
import { Section } from './Section'

/**
 * Tabela de horários com o dia de hoje destacado na cor da marca e o
 * selo de aberto/fechado calculado na hora.
 */
export function Hours() {
  const now = useNow()
  const { today } = getOpenState(config.hours, now)

  if (!config.features.hours) return null

  return (
    <Section id="horarios" kicker="Quando abrimos" title="Horários">
      <Reveal>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-line p-5">
            <p className="font-label text-xs uppercase tracking-[0.2em] text-muted">Atendimento</p>
            <OpenBadge withNext />
          </div>

          <ul className="divide-y divide-line">
            {DAY_KEYS.map((day) => {
              const ranges = config.hours[day]
              const isToday = day === today
              const closed = ranges.length === 0

              return (
                <li
                  key={day}
                  className={`flex items-center justify-between gap-4 px-5 py-3.5 ${isToday ? 'bg-soft' : ''}`}
                >
                  <span className="flex items-center gap-2.5">
                    {isToday && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
                    <span
                      className={`font-label text-sm uppercase tracking-[0.12em] ${
                        isToday ? 'text-ink' : 'text-muted'
                      }`}
                    >
                      {DAY_LABELS[day]}
                      {isToday && <span className="ml-2 text-[0.625rem] text-accent">hoje</span>}
                    </span>
                  </span>

                  <span
                    className={`text-right text-sm tabular-nums ${
                      closed ? 'text-muted/60' : isToday ? 'text-ink' : 'text-ink/80'
                    }`}
                  >
                    {formatRanges(ranges)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </Reveal>
    </Section>
  )
}
