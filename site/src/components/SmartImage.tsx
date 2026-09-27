import { useMemo, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { config } from '../config'
import { buildSrcSet, placeholderImage, sizedUrl } from '../lib/image'

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string
  alt: string
  /** Largura de exibição em CSS pixels — define o tamanho que se pede ao CDN. */
  width: number
  /** Proporção largura/altura do recorte. */
  ratio?: number
  /** Semente do placeholder, para cada foto quebrada ter um gradiente próprio. */
  seed?: string
  priority?: boolean
}

/**
 * `<img>` com três cuidados que o site inteiro depende:
 * pede a imagem no tamanho certo, aparece com fade quando carrega e —
 * o principal para um template white-label — cai num placeholder da
 * marca se a URL do config estiver quebrada, em vez de mostrar o
 * ícone de imagem cortada do navegador.
 */
export function SmartImage({
  src,
  alt,
  width,
  ratio,
  seed,
  priority = false,
  className = '',
  style,
  ...rest
}: SmartImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const fallback = useMemo(
    () => placeholderImage(seed ?? alt ?? src, config.colors.brandAccent || config.colors.brand, config.colors.surface),
    [seed, alt, src],
  )

  const broken = failed || !src
  const resolved = broken ? fallback : sizedUrl(src, { width, ratio })
  const srcSet = broken ? undefined : buildSrcSet(src, { width, ratio })

  return (
    <img
      {...rest}
      src={resolved}
      srcSet={srcSet}
      sizes={srcSet ? `${width}px` : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      className={`transition-opacity duration-700 ${loaded || broken ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={{ backgroundColor: 'var(--bb-surface-2)', ...style }}
    />
  )
}
