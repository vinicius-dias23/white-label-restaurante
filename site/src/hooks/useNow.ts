import { useEffect, useState } from 'react'

/** Relógio que atualiza a cada minuto — mantém o selo "aberto agora" correto. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
