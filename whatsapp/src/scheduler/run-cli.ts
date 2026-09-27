import { closePool } from '../db/pool.js'
import { assertEnv } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { runDailyJobs } from './jobs.js'
import { runOnce } from './worker.js'

/**
 * Dispara a fila na mão, sem esperar o worker.
 *
 *   npm run outbox:run                          envia o que já venceu
 *   npm run outbox:run -- --now=2026-08-22T10:00  finge que agora é outra hora
 *   npm run outbox:run -- --diarios              roda as rotinas diárias
 *
 * O `--now` é o jeito de testar um lembrete de 24h sem esperar um dia: crie a
 * reserva, depois rode com a data de véspera.
 */

function flag(name: string): string {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? ''
}

async function main(): Promise<void> {
  assertEnv()

  const rawNow = flag('now')
  const now = rawNow ? new Date(rawNow) : new Date()
  if (Number.isNaN(now.getTime())) {
    console.error('--now inválido. Use ISO: --now=2026-08-22T10:00')
    process.exitCode = 1
    return
  }

  if (process.argv.includes('--diarios')) {
    await runDailyJobs(now)
    console.log('✔ rotinas diárias executadas')
    return
  }

  const processed = await runOnce(now)
  console.log(processed === 0 ? '· nada vencido na fila' : `✔ ${processed} mensagem(ns) processada(s)`)
}

if (isMain(import.meta.url)) {
  main()
    .catch((error: unknown) => {
      console.error(`\n✖ ${error instanceof Error ? error.message : error}\n`)
      process.exitCode = 1
    })
    .finally(() => closePool())
}
