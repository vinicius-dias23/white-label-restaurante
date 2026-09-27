import Fastify from 'fastify'
import { registerAdmin } from './admin.js'
import { closePool, pool } from './db/pool.js'
import { assertEnv, env } from './env.js'
import { log } from './lib/logger.js'
import { startWorker, stopWorker } from './scheduler/worker.js'
import { registerWebhook } from './whatsapp/webhook.js'

/**
 * Entrada do servidor: webhook da Meta + rotas administrativas, e o worker das
 * mensagens programadas junto no mesmo processo quando `WORKER_IN_PROCESS=true`
 * (deploy de um container só, que é o suficiente para a maioria).
 */

async function main(): Promise<void> {
  assertEnv()

  const app = Fastify({
    logger: false,
    // A Meta chama por trás de proxy/CDN: sem isto o IP do log é o do proxy.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  })

  app.get('/health', async () => {
    // Healthcheck que realmente prova que o serviço funciona: sem banco, o bot
    // não atende ninguém, e responder 200 aqui só esconderia o problema.
    await pool.query('SELECT 1')
    return { ok: true, servico: 'restaurante-whatsapp' }
  })

  await registerWebhook(app)
  await registerAdmin(app)

  await app.listen({ port: env.port, host: '0.0.0.0' })

  log.info('servidor no ar', {
    porta: env.port,
    webhook: env.publicUrl ? `${env.publicUrl}/webhook` : `http://localhost:${env.port}/webhook`,
    ambiente: env.nodeEnv,
  })

  if (env.worker.inProcess) await startWorker()

  const shutdown = async (signal: string): Promise<void> => {
    log.info('encerrando', { signal })
    stopWorker()
    await app.close()
    await closePool()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  log.fatal('o servidor não subiu', { reason: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
