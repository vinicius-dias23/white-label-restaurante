# Módulo 1 — Site: um domínio por barbearia

Objetivo: `barbeariadoze.com.br`, `studiomaxbarber.com.br`,
`barbeariaana.com.br`... cada uma com a sua marca, saindo do mesmo código.

**Como funciona:** um build estático por barbearia, cada um com o config daquele
slug embutido. Nada é decidido em tempo de execução — [o porquê está na
arquitetura](arquitetura.md#3-site-a-decisão-é-no-build).

---

## 1. O build multi-tenant

**Já está feito** — esta seção é a explicação de como funciona, não um passo a
executar. `site/src/config/index.ts` continua fazendo:

```ts
import rawConfig from '../../../barbearia.config.json'
```

Um caminho fixo, que sozinho faria todo build sair igual. O `site/vite.config.ts`
intercepta esse import e o aponta para o tenant escolhido — **sem tocar em nenhum
componente**.

### Uma pasta por barbearia

Cada barbearia passa a ter tudo num lugar só:

```
whatsapp/tenants/studio-max/
  barbearia.config.json      ← já existe: marca, preços, equipe, horários
  public/                    ← novo: as fotos desta barbearia
    fotos/
      hero.jpg
      combo.jpg
    logo.svg
```

O que estiver em `public/` é copiado para a raiz do site daquela barbearia — no
config você continua escrevendo `"imageUrl": "/fotos/hero.jpg"`, exatamente como
no README do módulo.

### `site/vite.config.ts`

O arquivo, na íntegra:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Qual barbearia este build atende.
 *
 *   TENANT=studio-max npm run build   →  site/dist/studio-max/
 *   npm run dev                       →  barbearia.config.json da raiz (demo)
 *
 * Sem TENANT, cai no config da raiz: é o modo de desenvolvimento, para mexer no
 * layout sem escolher cliente nenhum.
 */
const TENANT = process.env.TENANT?.trim() ?? ''

const tenantDir = TENANT ? resolve(REPO_ROOT, 'whatsapp/tenants', TENANT) : ''

const configPath = TENANT
  ? resolve(tenantDir, 'barbearia.config.json')
  : resolve(REPO_ROOT, 'barbearia.config.json')

if (TENANT && !existsSync(configPath)) {
  // Falhar aqui, alto e claro. O contrário é publicar o site de um cliente com
  // o conteúdo de demonstração e só descobrir pelo telefone.
  throw new Error(
    `TENANT="${TENANT}" não existe: ${configPath} não foi encontrado.\n` +
      `Crie a pasta whatsapp/tenants/${TENANT}/ com o barbearia.config.json.`,
  )
}

/** As fotos da barbearia; sem a pasta, o build sai sem arquivos estáticos. */
const publicDir = TENANT && existsSync(resolve(tenantDir, 'public'))
  ? resolve(tenantDir, 'public')
  : resolve(REPO_ROOT, 'site/public')

const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, any>
const nome: string = raw.brand?.name || 'Barbearia'
const tagline: string = raw.brand?.tagline || ''
const corDeFundo: string = raw.colors?.background || '#0A0A0B'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Redireciona o import do config para o da barbearia deste build.
      // Um plugin em vez de um alias porque o alias por regex reescreveria só o
      // trecho casado do caminho relativo, e o resultado seria um caminho torto.
      name: 'barbearia-tenant-config',
      enforce: 'pre',
      resolveId(source) {
        if (source !== configPath && source.endsWith('barbearia.config.json')) {
          return configPath
        }
        return null
      },
    },
    {
      // Título e descrição no HTML entregue, não só depois do JavaScript rodar.
      // O main.tsx já ajusta o title no navegador; o Google e o WhatsApp leem o
      // HTML cru, antes disso.
      name: 'barbearia-tenant-html',
      transformIndexHtml(html) {
        const titulo = tagline ? `${nome} — ${tagline}` : nome
        const descricao = `${nome}. Veja serviços, preços e horários e agende pelo WhatsApp.`
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
    // Um diretório por barbearia: o build de uma nunca sobrescreve o da outra,
    // e o CI pode rodar os cinco em paralelo.
    //
    // O build de demonstração vai para dist/_dev/ de propósito: com `emptyOutDir`
    // apontando para dist/, um `npm run build` sem TENANT apagaria o build de
    // TODAS as barbearias antes de gerar o seu.
    outDir: TENANT ? `dist/${TENANT}` : 'dist/_dev',
    emptyOutDir: true,
  },
  server: {
    // O config e a base compartilhada vivem fora de site/.
    fs: { allow: ['..'] },
  },
})
```

### Conferir

```bash
# a demonstração continua funcionando como antes
npm run dev

# o build de uma barbearia de verdade
cd site
TENANT=barbearia-do-ze npm run build     # → site/dist/barbearia-do-ze/
npx vite preview --outDir dist/barbearia-do-ze
```

Abra e confira **três coisas**: as cores são as da barbearia, o título da aba
tem o nome dela, e o botão do WhatsApp leva para o número dela.

E confira também o que deve falhar:

```bash
TENANT=nao-existe npm run build
# ✖ TENANT="nao-existe" não existe: .../whatsapp/tenants/nao-existe/barbearia.config.json
```

---

## 2. O manifesto de deploy

**`deploy/tenants.json`** — quem existe, em que domínio, ligada ou não. Já está
criado, com as cinco barbearias de exemplo:

```json
[
  { "slug": "barbearia-do-ze", "dominio": "barbeariadoze.com.br",   "ativo": true },
  { "slug": "studio-max",      "dominio": "studiomaxbarber.com.br", "ativo": true },
  { "slug": "barbearia-ana",   "dominio": "barbeariaana.com.br",    "ativo": true },
  { "slug": "corte-nobre",     "dominio": "cortenobre.com.br",      "ativo": true },
  { "slug": "navalha-fina",    "dominio": "navalhafina.com.br",     "ativo": true }
]
```

Uma regra que evita muita dor de cabeça: **o `slug` aqui é o mesmo nome da pasta
em `whatsapp/tenants/` e o mesmo `--slug` do `tenant:add`.** Um identificador só,
do site ao banco.

A conferência está no `deploy/verificar-tenants.mjs`, e o `ci.yml` a roda em todo
PR. Da sua máquina:

```bash
npm run deploy:check
# ✔ 5 barbearia(s) no manifesto, 4 ativa(s) — tudo no lugar
```

Ela recusa o deploy quando um slug ativo não tem `barbearia.config.json`, quando
o JSON de uma delas está quebrado, quando o slug tem caractere inválido ou quando
dois domínios se repetem. Em resumo, é isto:

```bash
node -e '
  const fs = require("node:fs")
  const tenants = JSON.parse(fs.readFileSync("deploy/tenants.json", "utf8"))
  let erros = 0
  for (const t of tenants) {
    const dir = `whatsapp/tenants/${t.slug}`
    if (!fs.existsSync(`${dir}/barbearia.config.json`)) {
      console.error(`✖ ${t.slug}: falta ${dir}/barbearia.config.json`); erros++
    }
  }
  const dominios = tenants.map(t => t.dominio)
  const repetidos = dominios.filter((d, i) => dominios.indexOf(d) !== i)
  if (repetidos.length) { console.error(`✖ domínio repetido: ${repetidos}`); erros++ }
  if (erros) process.exit(1)
  console.log(`✔ ${tenants.length} barbearia(s), tudo no lugar`)
'
```

---

## 3. Publicar as cinco

Escolha um dos dois caminhos. Para 5, o A. Para 50 ou mais, o B — e a migração
de A para B não muda uma linha do build.

### Caminho A — um projeto por barbearia (recomendado até ~20)

Vale para **Cloudflare Pages**, **Vercel** ou **Netlify**. Cada barbearia vira um
projeto, com o seu domínio no painel. Isolado: derrubar uma não encosta nas
outras.

Criando um projeto (exemplo com Cloudflare Pages, uma vez por barbearia):

```bash
npx wrangler pages project create barbearia-studio-max --production-branch=master
```

E o deploy do build já pronto:

```bash
cd site
TENANT=studio-max npm run build
npx wrangler pages deploy dist/studio-max --project-name=barbearia-studio-max
```

**Domínio custom.** No painel do projeto → *Custom domains* → *Set up a domain*
→ `studiomaxbarber.com.br`. O TLS é emitido sozinho em alguns minutos.

No DNS do domínio (que costuma estar com o cliente, no Registro.br ou GoDaddy):

| Tipo | Nome | Valor |
|---|---|---|
| `CNAME` | `www` | `barbearia-studio-max.pages.dev` |
| `CNAME` (ou `ALIAS`/`ANAME`) | `@` | `barbearia-studio-max.pages.dev` |

> `CNAME` na raiz (`@`) não é permitido no DNS clássico. Se o registrador não
> oferecer `ALIAS`/`ANAME`, o caminho limpo é **transferir o DNS do domínio para
> a Cloudflare** (só o DNS, o domínio continua do cliente) — que suporta o
> achatamento de CNAME na raiz. Para 5 barbearias isso é meia hora de trabalho e
> resolve o problema de vez.

Configure também o redirecionamento de `www` para a raiz (ou o contrário) — o
importante é **escolher um** e mandar o outro para ele, senão o Google indexa os
dois como sites diferentes.

### Caminho B — um projeto só, roteando por domínio

Todos os builds vão para **o mesmo lugar**, cada um sob o prefixo do seu slug:

```
_sites/barbearia-do-ze/index.html
_sites/studio-max/index.html
_sites/barbearia-ana/index.html
```

E um **Worker na frente** olha o `Host` e serve o prefixo certo. Isso, mais o
Cloudflare for SaaS para emitir o certificado de cada domínio por API, é o que
torna 100 barbearias administrável. Está detalhado em
[`escala-100.md`](escala-100.md#o-site-com-100-domínios) — comece pelo A, migre
quando o painel começar a incomodar.

---

## 4. CI: buildar e publicar todas

**`.github/workflows/deploy-site.yml`** — já está no repositório:

```yaml
name: Deploy site

on:
  push:
    branches: [master]
    paths:
      - 'site/**'
      - 'shared/**'
      - 'whatsapp/tenants/**'
      - 'deploy/tenants.json'
      - '.github/workflows/deploy-site.yml'
  workflow_dispatch:
    inputs:
      tenant:
        description: 'Publicar só esta barbearia (vazio = todas)'
        required: false

jobs:
  # Lê o deploy/tenants.json e monta a lista do que vai ser publicado.
  listar:
    runs-on: ubuntu-latest
    outputs:
      tenants: ${{ steps.ler.outputs.tenants }}
    steps:
      - uses: actions/checkout@v4
      - id: ler
        run: |
          FILTRO='${{ github.event.inputs.tenant }}'
          LISTA=$(node -e '
            const t = require("./deploy/tenants.json").filter(x => x.ativo)
            const f = process.argv[1]
            console.log(JSON.stringify(f ? t.filter(x => x.slug === f) : t))
          ' "$FILTRO")
          echo "tenants=$LISTA" >> "$GITHUB_OUTPUT"
          echo "Publicando: $LISTA"

  publicar:
    needs: listar
    runs-on: ubuntu-latest
    strategy:
      # Uma barbearia com config quebrado não impede as outras de subirem.
      fail-fast: false
      # Cinco de cada vez. Suba este número conforme a conta cresce.
      max-parallel: 5
      matrix:
        tenant: ${{ fromJson(needs.listar.outputs.tenants) }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Build
        run: npm run build -w @barbearia/site
        env:
          TENANT: ${{ matrix.tenant.slug }}
      - name: Publicar
        run: |
          npx wrangler pages deploy "site/dist/${{ matrix.tenant.slug }}" \
            --project-name="barbearia-${{ matrix.tenant.slug }}" \
            --branch=master
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Duas coisas que valem o cuidado:

- **`fail-fast: false`.** Sem isso, um JSON com vírgula sobrando na barbearia A
  cancela o deploy das outras quatro.
- **`workflow_dispatch` com `tenant`.** É como você publica uma barbearia só,
  pelo painel do GitHub, sem esperar as demais.

> Trocou o preço de uma barbearia? O push mexe em
> `whatsapp/tenants/<slug>/barbearia.config.json`, o workflow dispara e **todas**
> as ativas são reconstruídas. Com 5 isso é rápido e não incomoda. Com 100,
> passe a buildar só o que mudou —
> [`escala-100.md`](escala-100.md#builds-incrementais).

---

## 5. Depois de publicar

Uma passada rápida por barbearia, sempre a mesma:

| Confira | Como |
|---|---|
| Domínio abre com HTTPS | `curl -sI https://studiomaxbarber.com.br \| head -1` → `HTTP/2 200` |
| É a barbearia certa | O nome no cabeçalho e as cores |
| Título da aba | Nome da barbearia, não "Barbearia" |
| Botão do WhatsApp | Abre uma conversa com **o número daquela barbearia** |
| Fotos | Nenhum placeholder escuro (link quebrado) |
| Celular | Abra de verdade num telefone: o hero ocupa a tela, o botão flutuante não fica atrás da barra de gestos |

O último item é o que mais pega. O site é feito para o celular primeiro, e é do
celular que os clientes vão abrir.
