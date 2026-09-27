import { useEffect, useState } from 'react'
import { config } from '../config'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useScrolledPast } from '../hooks/useScrollProgress'
import { bookingMessage, whatsappUrl } from '@barbearia/shared/lib/whatsapp'
import { CloseIcon, MenuIcon, WhatsAppIcon } from './Icons'
import { Logo } from './Logo'

interface NavItem {
  href: string
  label: string
}

function navItems(): NavItem[] {
  const { features, services, gallery, team } = config
  const items: NavItem[] = []
  if (services.length) items.push({ href: '#servicos', label: 'Serviços' })
  if (features.gallery && gallery.length) items.push({ href: '#galeria', label: 'Galeria' })
  if (features.team && team.length) items.push({ href: '#equipe', label: 'Equipe' })
  if (features.hours) items.push({ href: '#horarios', label: 'Horários' })
  items.push({ href: '#contato', label: 'Contato' })
  return items
}

/**
 * Cabeçalho fixo. Nasce transparente sobre a foto do hero e ganha fundo
 * sólido depois da primeira rolagem. No celular o menu vira uma gaveta
 * de tela cheia — links grandes, fáceis de acertar com o polegar.
 */
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const scrolled = useScrolledPast(24)
  const items = navItems()

  useLockBodyScroll(menuOpen)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const whatsapp = whatsappUrl(config.contact.whatsapp, bookingMessage(config.brand.name))

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled || menuOpen ? 'border-b border-line bg-scrim backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <a href="#topo" aria-label={config.brand.name} className="shrink-0">
            <Logo size="sm" />
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="font-label text-xs font-medium uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-brand h-11 min-h-11 px-4 text-xs sm:px-5"
            >
              <WhatsAppIcon className="size-[1.125rem]" />
              <span className="hidden sm:inline">Agendar</span>
              <span className="sr-only sm:hidden">Agendar no WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              className="grid size-11 place-items-center rounded-full border border-line-strong text-ink lg:hidden"
            >
              {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Gaveta de navegação do celular */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${menuOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-bg/95 backdrop-blur-xl transition-opacity duration-300 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <nav
          className={`absolute inset-x-0 top-16 px-5 transition-all duration-300 ${
            menuOpen ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
          }`}
        >
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {items.map((item, index) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  tabIndex={menuOpen ? 0 : -1}
                  className="flex items-baseline gap-4 py-5 font-display text-3xl tracking-wide"
                >
                  <span className="font-sans text-xs text-accent">{String(index + 1).padStart(2, '0')}</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
