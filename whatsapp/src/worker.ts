import { closePool } from './db/pool.js'
import { assertEnv } from './env.js'
import { log } from './lib/logger.js'
import { startWorker, stopWorker } from './scheduler/worker.js'

/**
 * Worker em processo separado.
 *
 * Use quando o volume crescer e você quiser que uma rajada de lembretes não
 * concorra com o webhook — que precisa responder rápido, senão a Meta reenvia.
 * Lembre de deixar `WORKER_IN_PROCESS=false` no processo da API.
 */

async function main(): Promise<void> {
  assertEnv()
  await startWorker()
  log.info('worker rodando sozinho — encerre com Ctrl+C')

  const shutdown = async (): Promise<void> => {
    stopWorker()
    await closePool()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())
}

main().catch((error: unknown) => {
  log.fatal('o worker não subiu', { reason: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
