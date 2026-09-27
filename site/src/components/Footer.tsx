import { config } from '../config'
import { Logo } from './Logo'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-line px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
        <Logo size="sm" />

        {config.brand.tagline && (
          <p className="font-label text-[0.6875rem] uppercase tracking-[0.24em] text-muted">
            {config.brand.tagline}
          </p>
        )}

        <p className="text-xs text-muted/70">
          © {year} {config.brand.name}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
