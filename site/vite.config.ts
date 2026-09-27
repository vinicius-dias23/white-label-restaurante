import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Qual restaurante este build atende.
 *
 *   TENANT=sushi-kaze npm run build   →  site/dist/sushi-kaze/
 *   npm run dev                       →  restaurante.config.json da raiz (demo)
 *
 * Sem TENANT, cai no config da raiz: é o modo de desenvolvimento, para mexer no
 * layout sem escolher cliente nenhum.
 */
const TENANT = process.env.TENANT?.trim() ?? ''

const tenantDir = TENANT ? resolve(REPO_ROOT, 'whatsapp/tenants', TENANT) : ''

const configPath = TENANT
  ? resolve(tenantDir, 'restaurante.config.json')
  : resolve(REPO_ROOT, 'restaurante.config.json')

if (TENANT && !existsSync(configPath)) {
  // Falhar aqui, alto e claro. O contrário é publicar o site de um cliente com
  // o conteúdo de demonstração e só descobrir pelo telefone.
  throw new Error(
    `TENANT="${TENANT}" não existe: ${configPath} não foi encontrado.\n` +
      `Crie a pasta whatsapp/tenants/${TENANT}/ com o restaurante.config.json.`,
  )
}

/**
 * As fotos do restaurante. A pasta do tenant ganha da de demonstração; se nenhuma
 * das duas existir, o Vite recebe `false` e o build sai sem arquivos estáticos —
 * apontar para um diretório inexistente faz o Vite reclamar a cada rebuild.
 */
const tenantPublic = TENANT ? resolve(tenantDir, 'public') : ''
const demoPublic = resolve(REPO_ROOT, 'site/public')

const publicDir = tenantPublic && existsSync(tenantPublic)
  ? tenantPublic
  : existsSync(demoPublic)
    ? demoPublic
    : (false as const)

/**
 * O config sem o que é do bot.
 *
 * A seção `whatsapp` inteira sai: o site nunca leu nada dela, e ela carrega os
 * ~125 textos do atendimento e os telefones do painel do dono. De `team` sai o
 * `phone` — o site usa nome, função, foto e Instagram, e mais nada.
 *
 * Isto não é otimização de bundle (embora encolha): sem isto, preencher o
 * telefone do chef ou do gerente no estúdio publica o número dele na internet.
 */
function configPublico(caminho: string): Record<string, any> {
  const { whatsapp: _bot, ...resto } = JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, any>

  if (Array.isArray(resto.team)) {
    resto.team = resto.team.map((membro: Record<string, any>) => {
      const { phone: _telefone, ...publico } = membro ?? {}
      return publico
    })
  }

  return resto
}

const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, any>
const nome: string = raw.brand?.name || 'Restaurante'
const tagline: string = raw.brand?.tagline || ''
const corDeFundo: string = raw.colors?.background || '#140B0C'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Redireciona o import do config para o do restaurante deste build, e tira
      // do caminho o que não pode ser servido ao navegador.
      //
      // Um plugin em vez de um alias porque o alias por regex reescreveria só o
      // trecho casado do caminho relativo, e o resultado seria um caminho torto.
      name: 'restaurante-tenant-config',
      enforce: 'pre',
      resolveId(source) {
        if (source !== configPath && source.endsWith('restaurante.config.json')) {
          return configPath
        }
        return null
      },
      load(id) {
        if (id !== configPath) return null
        // Devolvemos JSON, não JavaScript: o plugin `vite-json` roda depois deste
        // e faz `JSON.parse` no que sair daqui — um `export default` aqui quebra
        // o build com "expected value at line 1 column 1".
        return JSON.stringify(configPublico(configPath), null, 2)
      },
    },
    {
      // Título e descrição no HTML entregue, não só depois do JavaScript rodar.
      // O main.tsx já ajusta o title no navegador; o Google e o WhatsApp leem o
      // HTML cru, antes disso.
      name: 'restaurante-tenant-html',
      transformIndexHtml(html) {
        const titulo = tagline ? `${nome} — ${tagline}` : nome
        const descricao = `${nome}. Veja o cardápio, os ambientes e os horários e reserve sua mesa pelo WhatsApp.`
        return html
          .replace(/<title>.*?<\/title>/, `<title>${titulo}</title>`)
          // A meta tag de descrição ocupa várias linhas no index.html —
          // [\s\S] atravessa a quebra, que o "." sozinho não faz.
          .replace(
            /<meta\s+name="description"[\s\S]*?\/>/,
            `<meta name="description" content="${descricao}" />`,
          )
          .replace(
            /<meta name="theme-color" content=".*?"\s*\/>/,
            `<meta name="theme-color" content="${corDeFundo}" />`,
          )
      },
    },
  ],
  publicDir,
  build: {
    // Um diretório por restaurante: o build de um nunca sobrescreve o do outro,
    // e o CI pode rodar os cinco em paralelo.
    //
    // O build de demonstração vai para dist/_dev/ de propósito: com `emptyOutDir`
    // apontando para dist/, um `npm run build` sem TENANT apagaria o build de
    // TODOS os restaurantes antes de gerar o seu.
    outDir: TENANT ? `dist/${TENANT}` : 'dist/_dev',
    emptyOutDir: true,
  },
  server: {
    // O config e a base compartilhada vivem fora de site/.
    fs: { allow: ['..'] },
  },
})
