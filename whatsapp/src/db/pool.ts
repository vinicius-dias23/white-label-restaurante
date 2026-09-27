import pg from 'pg'
import { env } from '../env.js'

/**
 * Pool de conexões com o Postgres.
 *
 * `timestamptz` volta como `Date` do Node, sempre em UTC. A conversão para o
 * fuso do restaurante acontece na borda, ao formatar texto para o cliente — nunca
 * no meio de uma conta.
 */

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.databasePoolMax,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  application_name: 'restaurante-whatsapp',
})

pool.on('error', (error) => {
  console.error('[db] conexão ociosa caiu:', error.message)
})

export type QueryParam = string | number | boolean | Date | Buffer | null | object

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params)
  return result.rows
}

/** Primeira linha, ou `null`. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/**
 * Roda tudo numa transação: qualquer erro desfaz o que já foi feito.
 * É o que garante que reservar um horário e agendar os lembretes acontecem
 * juntos — ou não acontecem.
 */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function closePool(): Promise<void> {
  await pool.end()
}
