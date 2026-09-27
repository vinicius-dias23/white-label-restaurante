import { useEffect, useState } from 'react'

/** `true` depois que a página passa de `offset` pixels de rolagem. */
export function useScrolledPast(offset: number): boolean {
  const [past, setPast] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      setPast(window.scrollY > offset)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [offset])

  return past
}
