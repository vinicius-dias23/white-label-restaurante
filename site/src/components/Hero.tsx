import { config, hasMenu } from '../config'
import { bookingMessage, whatsappUrl } from '@restaurante/shared/lib/whatsapp'
import { ArrowDownIcon, WhatsAppIcon } from './Icons'
import { Logo } from './Logo'
import { OpenBadge } from './OpenBadge'
import { SmartImage } from './SmartImage'

/**
 * Primeira tela: foto em tela cheia, logo, uma linha de texto e o botão
 * que pede a mesa no WhatsApp. Usa `100svh` em vez de `100vh` porque no celular a barra
 * do navegador cortaria o botão justamente na hora de tocá-lo.
 */
export function Hero() {
  const { hero, brand, contact } = config
  const whatsapp = whatsappUrl(contact.whatsapp, bookingMessage(brand.name))

  return (
    <section id="topo" className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
      <div className="absolute inset-0">
        <SmartImage
          src={hero.imageUrl}
          alt=""
          width={1200}
          ratio={0.75}
          priority
          seed="hero"
          aria-hidden
          className="size-full object-cover"
        />
        {/* Véu que garante leitura do texto sobre qualquer foto. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, var(--bb-overlay-top) 0%, transparent 25%, var(--bb-scrim) 62%, var(--bb-overlay-bottom) 100%)',
          }}
        />
        <div className="absolute inset-0 opacity-70 vignette" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pb-28">
        <div
          className="flex flex-col items-start gap-6"
          style={{ animation: 'bb-fade-in 1s ease-out both' }}
        >
          <OpenBadge withNext />

          <Logo size="lg" className="drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]" />

          {hero.headline && (
            <h1 className="max-w-[16ch] whitespace-pre-line text-5xl leading-[0.92] text-balance sm:text-7xl lg:text-8xl">
              {hero.headline}
            </h1>
          )}

          {hero.subheadline && (
            <p className="max-w-sm font-label text-base uppercase tracking-[0.14em] text-muted sm:text-lg">
              {hero.subheadline}
            </p>
          )}

          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-brand w-full sm:w-auto"
            >
              <WhatsAppIcon className="size-5" />
              {hero.ctaLabel}
            </a>

            {hasMenu() && (
              <a href="#cardapio" className="btn btn-ghost w-full sm:w-auto">
                Ver cardápio
              </a>
            )}
          </div>
        </div>
      </div>

      <a
        href={hasMenu() ? '#cardapio' : '#contato'}
        aria-label="Rolar para o conteúdo"
        className="absolute inset-x-0 bottom-5 mx-auto hidden w-fit text-muted sm:block"
      >
        <ArrowDownIcon className="size-6" style={{ animation: 'bb-bob 2.4s ease-in-out infinite' }} />
      </a>
    </section>
  )
}
