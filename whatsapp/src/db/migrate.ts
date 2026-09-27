import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertEnv } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { closePool, pool } from './pool.js'

/**
 * Runner de migrations. Roda os arquivos `.sql` da pasta `migrations/` em ordem
 * alfabética, uma vez cada, dentro de uma transação.
 *
 *   npm run db:migrate           aplica o que falta
 *   npm run db:reset             APAGA tudo e aplica do zero (só desenvolvimento)
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations')
  return new Set(rows.map((row) => row.name))
}

async function reset(): Promise<void> {
  console.log('⚠  Apagando o schema inteiro (db:reset)')
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
}

export async function migrate({ withReset = false } = {}): Promise<void> {
  if (withReset) await reset()

  await ensureMigrationsTable()
  const done = await appliedMigrations()

  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort()

  let applied = 0
  for (const file of files) {
    if (done.has(file)) continue

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`✔ ${file}`)
      applied += 1
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(`✖ ${file} falhou — nada foi aplicado deste arquivo`)
      throw error
    } finally {
      client.release()
    }
  }

  console.log(applied === 0 ? '✔ Banco já está atualizado.' : `✔ ${applied} migration(s) aplicada(s).`)
}

if (isMain(import.meta.url)) {
  assertEnv()
  migrate({ withReset: process.argv.includes('--reset') })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(() => closePool())
}
