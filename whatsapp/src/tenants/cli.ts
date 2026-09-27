import { closePool } from '../db/pool.js'
import { listTenants, upsertTenant } from '../db/repositories/tenants.js'
import { syncCatalog } from '../db/repositories/tenants.js'
import { assertEnv, env } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { CONFIG_EXAMPLE } from '../lib/paths.js'
import { normalizePhone } from '@barbearia/shared/lib/whatsapp'
import { readTenantFile, syncAllTenants, TENANTS_DIR } from './sync.js'

/**
 * Cadastro e sincronização das barbearias.
 *
 *   npm run tenant:sync                 lê todos os tenants/<slug>/ e grava no banco
 *   npm run tenant:list                 mostra o que está cadastrado
 *   npm run tenant:add -- --slug=x ...  cadastra uma barbearia nova
 *
 * O `tenant:add` é o caminho da segunda barbearia em diante: as credenciais vão
 * criptografadas para o banco e o `.env` continua enxuto.
 */

function flag(name: string): string {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length).trim() : ''
}

async function commandSync(): Promise<void> {
  const results = await syncAllTenants()

  for (const result of results) {
    if (result.skipped) {
      console.log(`\n⚠  ${result.slug} — não cadastrada`)
      console.log(`   ${result.skipped}`)
      continue
    }

    console.log(`\n✔ ${result.slug} — ${result.tenant?.displayName}`)
    console.log(`   número (phone_number_id): ${result.tenant?.phoneNumberId}`)
    console.log(`   fuso: ${result.tenant?.timezone}`)

    if (result.warnings.length > 0) {
      console.log(`   ${result.warnings.length} aviso(s) no barbearia.config.json:`)
      for (const warning of result.warnings) console.log(`     · ${warning}`)
    }
    if (result.fallbacks.length > 0) {
      console.log(
        `   ⚠  duração não reconhecida (usando booking.defaultDurationMin): ${result.fallbacks.join(', ')}`,
      )
      console.log('      Corrija com "durationMin" no serviço, ex.: "durationMin": 45')
    }
  }

  if (results.length === 0) {
    console.log(`\nNenhuma barbearia em ${TENANTS_DIR}/.`)
    console.log(`Crie ${TENANTS_DIR}/<slug>/barbearia.config.json`)
    console.log(`Use ${CONFIG_EXAMPLE} como base.`)
  }
}

async function commandList(): Promise<void> {
  const tenants = await listTenants()
  if (tenants.length === 0) {
    console.log('Nenhuma barbearia cadastrada. Rode: npm run tenant:sync')
    return
  }
  console.log(`\n${tenants.length} barbearia(s):\n`)
  for (const tenant of tenants) {
    const status = tenant.active ? 'ativa' : 'INATIVA'
    console.log(`  ${tenant.slug.padEnd(24)} ${tenant.displayName.padEnd(28)} ${tenant.phoneNumberId}  [${status}]`)
  }
  console.log()
}

async function commandAdd(): Promise<void> {
  const slug = flag('slug')
  const phoneNumberId = flag('phone-number-id')
  const accessToken = flag('token')

  const missing = [
    !slug && '--slug',
    !phoneNumberId && '--phone-number-id',
    !accessToken && '--token',
  ].filter(Boolean)

  if (missing.length > 0) {
    console.error(`\n✖ Faltou: ${missing.join(', ')}\n`)
    console.error('Exemplo:')
    console.error('  npm run tenant:add -- \\')
    console.error('    --slug=barbearia-do-ze \\')
    console.error('    --phone-number-id=123456789012345 \\')
    console.error('    --waba-id=987654321098765 \\')
    console.error('    --token=EAAG... \\')
    console.error('    --owner="(11) 91234-5678"\n')
    process.exitCode = 1
    return
  }

  const file = await readTenantFile(slug)

  const tenant = await upsertTenant({
    slug,
    displayName: file.config.brand.name,
    phoneNumberId,
    wabaId: flag('waba-id'),
    accessToken,
    ownerPhone: flag('owner') ? normalizePhone(flag('owner'), env.defaultCountryCode) : '',
    timezone: flag('timezone') || env.defaultTimezone,
    config: file.config,
  })

  const catalog = await syncCatalog(tenant)

  console.log(`\n✔ ${tenant.displayName} cadastrada (${tenant.slug})`)
  console.log(`   ${catalog.barbers} barbeiro(s), ${catalog.services} serviço(s)`)
  console.log(`   O token foi criptografado com a APP_ENCRYPTION_KEY antes de ir para o banco.\n`)
  if (!tenant.ownerPhone) {
    console.log('   ⚠  Sem --owner: o dono não vai receber avisos nem ter o menu de administração.\n')
  }
}

async function main(): Promise<void> {
  assertEnv()
  const command = process.argv[2] ?? 'sync'

  switch (command) {
    case 'sync':
      await commandSync()
      break
    case 'list':
      await commandList()
      break
    case 'add':
      await commandAdd()
      break
    default:
      console.error(`Comando desconhecido: ${command}. Use sync, list ou add.`)
      process.exitCode = 1
  }
}

if (isMain(import.meta.url)) {
  main()
    .catch((error: unknown) => {
      console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
    .finally(() => closePool())
}
