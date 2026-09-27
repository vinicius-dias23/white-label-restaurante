import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Caminhos do módulo, resolvidos a partir do próprio arquivo.
 *
 * Os comandos podem ser chamados da raiz do repositório (`npm run -w
 * @barbearia/whatsapp ...`) ou de dentro de `whatsapp/`. Depender do
 * diretório atual faria o `.env` sumir dependendo de onde o comando rodou.
 */
const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** `whatsapp/.env` — segredos do servidor, nunca versionado. */
export const ENV_FILE = join(MODULE_ROOT, '.env')

/** `whatsapp/tenants/<slug>/barbearia.config.json` — uma pasta por barbearia. */
export const TENANTS_DIR = join(MODULE_ROOT, 'tenants')

/** `barbearia.config.example.json`, na raiz: o modelo comum aos dois módulos. */
export const CONFIG_EXAMPLE = resolve(MODULE_ROOT, '..', 'barbearia.config.example.json')
