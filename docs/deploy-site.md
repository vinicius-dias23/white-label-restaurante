# Módulo 1 — Site: um domínio por restaurante

Objetivo: `cantinabellanonna.com.br`, `sushikaze.com.br`,
`botecodoze.com.br`... cada um com a sua marca, saindo do mesmo código.

**Como funciona:** um build estático por restaurante, cada um com o config daquele
slug embutido. Nada é decidido em tempo de execução — [o porquê está na
arquitetura](arquitetura.md#3-site-a-decisão-é-no-build).

---

## 1. O build multi-tenant

**Já está feito** — esta seção é a explicação de como funciona, não um passo a
executar. `site/src/config/index.ts` continua fazendo:

```ts
import rawConfig from '../../../restaurante.config.json'
```

Um caminho fixo, que sozinho faria todo build sair igual. O `site/vite.config.ts`
intercepta esse import e o aponta para o tenant escolhido — **sem tocar em nenhum
componente**.

### Uma pasta por restaurante

Cada restaurante passa a ter tudo num lugar só:

```
whatsapp/tenants/sushi-kaze/
  restaurante.config.json    ← marca, cardápio, ambientes, equipe, horários
  public/                    ← as fotos deste restaurante
    fotos/
      hero.jpg
      omakase.jpg
      salao.jpg
    logo.svg
```

O que estiver em `public/` é copiado para a raiz do site daquele restaurante — no
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
```

### Conferir

```bash
# a demonstração continua funcionando como antes
npm run dev

# o build de um restaurante de verdade
cd site
TENANT=cantina-bella-nonna npm run build     # → site/dist/cantina-bella-nonna/
npx vite preview --outDir dist/cantina-bella-nonna
```

Abra e confira **três coisas**: as cores são as do restaurante, o título da aba
tem o nome dele, e o botão "Reservar mesa no WhatsApp" leva para o número dele.

Confira também que o bundle não carrega o que é do bot: nenhum telefone da
equipe e nenhum texto do atendimento.

```bash
grep -r "98888-7766" dist/cantina-bella-nonna/ || echo "✔ telefone da recepção fora do site"
```

E confira também o que deve falhar:

```bash
TENANT=nao-existe npm run build
# ✖ TENANT="nao-existe" não existe: .../whatsapp/tenants/nao-existe/restaurante.config.json
```

---

## 2. O manifesto de deploy

**`deploy/tenants.json`** — quem existe, em que domínio, ligado ou não. Já está
criado, com os cinco restaurantes de exemplo (só a Cantina Bella Nonna ativa;
os outros quatro esperam o conteúdo de verdade). Com todos ligados, fica assim:

```json
[
  { "slug": "cantina-bella-nonna",    "dominio": "cantinabellanonna.com.br", "ativo": true },
  { "slug": "sushi-kaze",             "dominio": "sushikaze.com.br",         "ativo": true },
  { "slug": "boteco-do-ze",           "dominio": "botecodoze.com.br",        "ativo": true },
  { "slug": "bistro-lume",            "dominio": "bistrolume.com.br",        "ativo": true },
  { "slug": "churrascaria-fogo-alto", "dominio": "fogoalto.com.br",          "ativo": true }
]
```

Uma regra que evita muita dor de cabeça: **o `slug` aqui é o mesmo nome da pasta
em `whatsapp/tenants/` e o mesmo `--slug` do `tenant:add`.** Um identificador só,
do site ao banco.

A conferência está no `deploy/verificar-tenants.mjs`, e o `ci.yml` a roda em todo
PR. Da sua máquina:

```bash
npm run deploy:check
# ✔ 5 restaurante(s) no manifesto, 5 ativo(s) — tudo no lugar
```

Ela recusa o deploy quando um slug ativo não tem `restaurante.config.json`, quando
o JSON de um deles está quebrado, quando o slug tem caractere inválido ou quando
dois domínios se repetem. Em resumo, é isto:

```bash
node -e '
  const fs = require("node:fs")
  const tenants = JSON.parse(fs.readFileSync("deploy/tenants.json", "utf8"))
  let erros = 0
  for (const t of tenants) {
    const dir = `whatsapp/tenants/${t.slug}`
    if (!fs.existsSync(`${dir}/restaurante.config.json`)) {
      console.error(`✖ ${t.slug}: falta ${dir}/restaurante.config.json`); erros++
    }
  }
  const dominios = tenants.map(t => t.dominio)
  const repetidos = dominios.filter((d, i) => dominios.indexOf(d) !== i)
  if (repetidos.length) { console.error(`✖ domínio repetido: ${repetidos}`); erros++ }
  if (erros) process.exit(1)
  console.log(`✔ ${tenants.length} restaurante(s), tudo no lugar`)
'
```

---

## 3. Publicar os cinco

Escolha um dos dois caminhos. Para 5, o A. Para 50 ou mais, o B — e a migração
de A para B não muda uma linha do build.

### Caminho A — um projeto por restaurante (recomendado até ~20)

Vale para **Cloudflare Pages**, **Vercel** ou **Netlify**. Cada restaurante vira um
projeto, com o seu domínio no painel. Isolado: derrubar um não encosta nos
outros.

Criando um projeto (exemplo com Cloudflare Pages, uma vez por restaurante):

```bash
npx wrangler pages project create restaurante-sushi-kaze --production-branch=master
```

E o deploy do build já pronto:

```bash
cd site
TENANT=sushi-kaze npm run build
npx wrangler pages deploy dist/sushi-kaze --project-name=restaurante-sushi-kaze
```

**Domínio custom.** No painel do projeto → *Custom domains* → *Set up a domain*
→ `sushikaze.com.br`. O TLS é emitido sozinho em alguns minutos.

No DNS do domínio (que costuma estar com o cliente, no Registro.br ou GoDaddy):

| Tipo | Nome | Valor |
|---|---|---|
| `CNAME` | `www` | `restaurante-sushi-kaze.pages.dev` |
| `CNAME` (ou `ALIAS`/`ANAME`) | `@` | `restaurante-sushi-kaze.pages.dev` |

> `CNAME` na raiz (`@`) não é permitido no DNS clássico. Se o registrador não
> oferecer `ALIAS`/`ANAME`, o caminho limpo é **transferir o DNS do domínio para
> a Cloudflare** (só o DNS, o domínio continua do cliente) — que suporta o
> achatamento de CNAME na raiz. Para 5 restaurantes isso é meia hora de trabalho e
> resolve o problema de vez.

Configure também o redirecionamento de `www` para a raiz (ou o contrário) — o
importante é **escolher um** e mandar o outro para ele, senão o Google indexa os
dois como sites diferentes.

### Caminho B — um projeto só, roteando por domínio

Todos os builds vão para **o mesmo lugar**, cada um sob o prefixo do seu slug:

```
_sites/cantina-bella-nonna/index.html
_sites/sushi-kaze/index.html
_sites/boteco-do-ze/index.html
```

E um **Worker na frente** olha o `Host` e serve o prefixo certo. Isso, mais o
Cloudflare for SaaS para emitir o certificado de cada domínio por API, é o que
torna 100 restaurantes administrável. Está detalhado em
[`escala-100.md`](escala-100.md#o-site-com-100-domínios) — comece pelo A, migre
quando o painel começar a incomodar.

---

## 4. CI: buildar e publicar todos

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
        description: 'Publicar só este restaurante (vazio = todos)'
        required: false

jobs:
  # Lê o deploy/tenants.json e monta a lista do que vai ser publicado.
  listar:
    runs-on: ubuntu-latest
    outputs:
      tenants: ${{ steps.ler.outputs.tenants }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Conferir o manifesto
        run: node deploy/verificar-tenants.mjs
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
      # Um restaurante com config quebrado não impede os outros de subirem.
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
        run: npm run build -w @restaurante/site
        env:
          TENANT: ${{ matrix.tenant.slug }}
      - name: Publicar
        run: |
          npx wrangler pages deploy "site/dist/${{ matrix.tenant.slug }}" \
            --project-name="restaurante-${{ matrix.tenant.slug }}" \
            --branch=master
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Duas coisas que valem o cuidado:

- **`fail-fast: false`.** Sem isso, um JSON com vírgula sobrando no restaurante A
  cancela o deploy dos outros quatro.
- **`workflow_dispatch` com `tenant`.** É como você publica um restaurante só,
  pelo painel do GitHub, sem esperar os demais.

> Trocou o preço de um restaurante? O push mexe em
> `whatsapp/tenants/<slug>/restaurante.config.json`, o workflow dispara e **todos**
> os ativos são reconstruídos. Com 5 isso é rápido e não incomoda. Com 100,
> passe a buildar só o que mudou —
> [`escala-100.md`](escala-100.md#builds-incrementais).

---

## 5. Depois de publicar

Uma passada rápida por restaurante, sempre a mesma:

| Confira | Como |
|---|---|
| Domínio abre com HTTPS | `curl -sI https://sushikaze.com.br \| head -1` → `HTTP/2 200` |
| É o restaurante certo | O nome no cabeçalho e as cores |
| Título da aba | Nome do restaurante, não "Restaurante" |
| Botão do WhatsApp | Abre uma conversa com **o número daquele restaurante**, já com a frase "Gostaria de reservar…" — e o "Reservar aqui" de cada ambiente, com o nome do ambiente na frase |
| Fotos | Nenhum placeholder escuro (link quebrado) |
| Celular | Abra de verdade num telefone: o hero ocupa a tela, o botão flutuante não fica atrás da barra de gestos |

O último item é o que mais pega. O site é feito para o celular primeiro, e é do
celular que os clientes vão abrir.
