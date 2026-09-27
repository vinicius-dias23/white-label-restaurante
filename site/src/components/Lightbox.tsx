import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TouchEvent } from 'react'
import type { GalleryImage } from '@barbearia/shared/config'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from './Icons'
import { SmartImage } from './SmartImage'

interface LightboxProps {
  images: GalleryImage[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

const SWIPE_THRESHOLD = 50

/**
 * Visualizador de tela cheia. Pensado primeiro para o toque — arrastar
 * para o lado troca a foto — e depois para o teclado (setas e Esc).
 */
export function Lightbox({ images, index, onClose, onNavigate }: LightboxProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const image = images[index]

  useLockBodyScroll(true)

  const go = useCallback(
    (step: number) => {
      onNavigate((index + step + images.length) % images.length)
    },
    [index, images.length, onNavigate],
  )

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (!image) return null

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    // Só conta como swipe se o movimento foi mais horizontal que vertical.
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || 'Foto ampliada'}
      tabIndex={-1}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[60] flex flex-col bg-bg/97 backdrop-blur-xl"
      style={{ animation: 'bb-fade-in 0.25s ease-out both' }}
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <span className="font-label text-xs uppercase tracking-[0.2em] text-muted">
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid size-11 place-items-center rounded-full border border-line-strong"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="flex min-h-0 flex-1 cursor-zoom-out items-center justify-center p-4"
      >
        <SmartImage
          key={image.url}
          src={image.url}
          alt={image.alt || ''}
          width={1100}
          seed={image.url}
          priority
          className="max-h-full w-auto max-w-full rounded-lg object-contain"
        />
      </button>

      {images.length > 1 && (
        <div className="flex items-center justify-center gap-4 px-5 pb-safe pt-2">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Foto anterior"
            className="grid size-12 place-items-center rounded-full border border-line-strong"
          >
            <ArrowLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próxima foto"
            className="grid size-12 place-items-center rounded-full border border-line-strong"
          >
            <ArrowRightIcon className="size-5" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
