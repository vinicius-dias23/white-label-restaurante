import { closePool } from '../db/pool.js'
import { findTenantBySlug, getAccessToken, listTenants } from '../db/repositories/tenants.js'
import { assertEnv } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { normalizePhone } from '@restaurante/shared/lib/whatsapp'
import { WhatsAppClient } from './client.js'
import { textMessage } from './payloads.js'

/**
 * Envio manual, para provar que a ligação com a Meta está de pé.
 *
 *   npm run wa:send -- --to="(11) 91234-5678" --text="teste"
 *
 * Lembre da regra da janela de 24h: para um número que nunca falou com o
 * restaurante, este envio FALHA com erro 131047 — e isso é a integração
 * funcionando, não um bug. Mande "oi" do celular para o número primeiro.
 */

function flag(name: string): string {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? ''
}

async function main(): Promise<void> {
  assertEnv()

  const to = flag('to')
  const text = flag('text') || 'Teste de integração 👋'
  const slug = flag('slug')

  if (!to) {
    console.error('\nUso: npm run wa:send -- --to="(11) 91234-5678" [--text="mensagem"] [--slug=restaurante]\n')
    process.exitCode = 1
    return
  }

  const tenant = slug ? await findTenantBySlug(slug) : (await listTenants())[0]
  if (!tenant) {
    console.error('Nenhum restaurante cadastrado. Rode: npm run tenant:sync')
    process.exitCode = 1
    return
  }

  const client = new WhatsAppClient(tenant.phoneNumberId, await getAccessToken(tenant.id))
  const result = await client.send(textMessage(normalizePhone(to), text))

  console.log(`\n✔ Enviada por ${tenant.displayName}`)
  console.log(`  id: ${result.messageId}\n`)
}

if (isMain(import.meta.url)) {
  main()
    .catch((error: unknown) => {
      console.error(`\n✖ ${error instanceof Error ? error.message : error}\n`)
      process.exitCode = 1
    })
    .finally(() => closePool())
}
