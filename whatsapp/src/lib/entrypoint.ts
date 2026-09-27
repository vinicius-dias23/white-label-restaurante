import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * `true` quando o módulo foi chamado direto na linha de comando
 * (`tsx arquivo.ts`), `false` quando alguém apenas o importou. É o equivalente
 * ao `if __name__ == "__main__"` para ESM.
 */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(entry)
  } catch {
    return false
  }
}
