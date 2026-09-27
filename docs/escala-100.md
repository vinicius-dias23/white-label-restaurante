# De 5 para 100

O que aguenta sem mudar nada, o que trava, e quando mexer.

**A regra:** não implemente nada disto com 5 restaurantes. Cada item aqui existe
para resolver uma dor específica — sem a dor, é complexidade de graça. A tabela
diz quando cada uma aparece.

| | 5 | 20 | 100 |
|---|---|---|---|
| Site: projeto por restaurante | ✅ tranquilo | ⚠️ o painel incomoda | ❌ insustentável |
| Site: buildar todos a cada push | ✅ < 1 min | ⚠️ ~4 min | ❌ builds incrementais |
| Domínios: apontar no painel | ✅ | ⚠️ | ❌ Cloudflare for SaaS, por API |
| WhatsApp: 1 WABA | ✅ | ⚠️ o teto chega | ❌ várias WABAs |
| WhatsApp: worker no processo | ✅ | ✅ | ⚠️ separar |
| Banco: pool 10 | ✅ | ✅ | ⚠️ subir e vigiar |
| Onboarding manual | ✅ 30 min | ⚠️ | ❌ automatizar |
| Verificação do negócio na Meta | opcional | quase certo | obrigatória |

---

## O site com 100 domínios

### O problema

Cem projetos no painel de hospedagem, cem domínios apontados a mão, cem
certificados para renovar. E o CI buildando os cem a cada vírgula trocada.

### A solução: um destino, roteado por `Host`

Todos os builds vão para o **mesmo lugar**, cada um sob o prefixo do seu slug, e
um Worker na frente decide qual servir:

```
dist/
  cantina-bella-nonna/index.html
  sushi-kaze/index.html
  ...  (100 pastas)

cantinabellanonna.com.br  ──▶  Worker  ──▶  dist/cantina-bella-nonna/
sushikaze.com.br          ──▶  Worker  ──▶  dist/sushi-kaze/
```

**`deploy/hosts.json`** — gerado do `tenants.json`, domínio → slug:

```bash
node -e '
  const t = require("./deploy/tenants.json").filter(x => x.ativo)
  const mapa = Object.fromEntries(t.map(x => [x.dominio, x.slug]))
  require("node:fs").writeFileSync("deploy/hosts.json", JSON.stringify(mapa, null, 2))
'
```

**`worker/src/index.ts`**

```ts
import mapa from '../../deploy/hosts.json'

/**
 * Um Worker na frente de todos os sites: olha o domínio pedido e serve a pasta
 * daquele restaurante. Cem sites, um deploy.
 */
export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(request.url)
    const host = url.hostname.replace(/^www\./, '')
    const slug = (mapa as Record<string, string>)[host]

    if (!slug) {
      // Domínio que aponta para cá mas não está no manifesto. Acontece quando o
      // cliente configurou o DNS antes de o restaurante entrar no tenants.json.
      return new Response('Domínio não configurado.', { status: 404 })
    }

    const alvo = new URL(url)
    alvo.pathname = `/${slug}${url.pathname}`

    const resposta = await env.ASSETS.fetch(new Request(alvo, request))
    if (resposta.status !== 404) return resposta

    // O site é de página única: qualquer caminho desconhecido é o index.
    return env.ASSETS.fetch(new Request(new URL(`/${slug}/index.html`, url), request))
  },
}
```

**`worker/wrangler.jsonc`**

```jsonc
{
  "name": "restaurante-sites",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "assets": { "directory": "../site/dist", "binding": "ASSETS" }
}
```

O CI passa a buildar todos os tenants em `site/dist/<slug>/` e fazer **um**
`wrangler deploy`.

### Os 100 certificados

**Cloudflare for SaaS** (*Custom Hostnames*) emite e renova o TLS de cada domínio
de cliente por API. Onboarding vira uma chamada:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/custom_hostnames" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "hostname": "sushikaze.com.br",
        "ssl": { "method": "http", "type": "dv" }
      }'
```

E o cliente aponta o DNS dele uma vez para o seu *fallback origin*:

| Tipo | Nome | Valor |
|---|---|---|
| `CNAME` | `@` e `www` | `sites.suaempresa.com.br` |

Do lado dele isso é um registro só, para sempre. Do seu, uma chamada de API por
restaurante — sem clique de painel, sem renovação manual.

> Cloudflare for SaaS é pago por hostname ativo, e é barato perto do custo de
> administrar 100 domínios a mão. Vercel e Netlify têm o equivalente
> (*Domains API*, *Netlify for Platforms*) — a ideia é a mesma.

### Builds incrementais

Com 100 restaurantes, buildar todos a cada push é desperdício. Builde **só o que
mudou**:

```yaml
- name: Descobrir o que mudou
  id: mudou
  run: |
    # Mudou algo compartilhado? Então é todo mundo mesmo.
    if git diff --name-only ${{ github.event.before }} ${{ github.sha }} \
       | grep -qE '^(site/|shared/|deploy/tenants\.json)'; then
      LISTA=$(node -e 'console.log(JSON.stringify(
        require("./deploy/tenants.json").filter(t => t.ativo)))')
    else
      # Só configs de tenant: apenas os slugs tocados.
      SLUGS=$(git diff --name-only ${{ github.event.before }} ${{ github.sha }} \
        | grep '^whatsapp/tenants/' | cut -d/ -f3 | sort -u | paste -sd, -)
      LISTA=$(node -e '
        const s = new Set((process.argv[1] || "").split(",").filter(Boolean))
        console.log(JSON.stringify(
          require("./deploy/tenants.json").filter(t => t.ativo && s.has(t.slug))))
      ' "$SLUGS")
    fi
    echo "tenants=$LISTA" >> "$GITHUB_OUTPUT"
```

Mexeu no preço de um prato: um build, alguns segundos. Mexeu num componente
do site: os cem, uma vez.

---

## O WhatsApp com 100 números

O servidor não muda de forma — muda de tamanho. Os pontos que travam, em ordem
de chegada:

### 1. O teto de números por WABA

Uma WABA segura um número limitado de telefones (por volta de 25; confirme no seu
painel). Com 100 você **precisa** de várias WABAs.

O código já suporta: `wabaId` é coluna por restaurante. O que passa a doer é
**template**, que é por WABA — os mesmos dois modelos, aprovados em cada uma.
Automatize:

```bash
curl -X POST "https://graph.facebook.com/v21.0/$WABA_ID/message_templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @deploy/templates/lembrete_24h.json
```

Guarde os JSONs de [`templates.md`](../whatsapp/docs/templates.md) em
`deploy/templates/` e rode o `POST` para cada WABA nova. Com `templates:check`
depois, para confirmar a aprovação.

### 2. O worker

Até ~20 restaurantes, `WORKER_IN_PROCESS=true` dá conta: um container só, mais
barato. Acima disso, a varredura da `outbox` começa a competir com o webhook
pela mesma CPU — e o webhook é o que o cliente sente.

Na Render isso é um **segundo serviço no mesmo `render.yaml`**, com a mesma
imagem e outro comando:

```yaml
  - type: worker              # sem porta, sem health check: não atende HTTP
    name: restaurante-worker
    runtime: docker
    region: virginia
    plan: starter
    dockerfilePath: ./whatsapp/Dockerfile
    dockerContext: .
    dockerCommand: npm run worker -w @restaurante/whatsapp
    envVars:
      - key: WORKER_ENABLED
        value: true
      # ... as mesmas variáveis e segredos do serviço web
```

E no serviço web, `WORKER_IN_PROCESS=false` — senão os dois varrem a fila.

Mais de um processo de worker **funciona**: o `claimDue` usa
`FOR UPDATE SKIP LOCKED` ([`outbox.ts`](../whatsapp/src/db/repositories/outbox.ts)),
então dois nunca pegam a mesma linha, e o `releaseStale()` da subida requeue o
que ficou preso num processo que morreu. É a mesma propriedade que faz o deploy
zero-downtime da Render ser seguro, com as duas versões vivas por alguns
segundos. Ainda assim, comece com **um**: o gargalo até 100 restaurantes é a Meta,
não a fila.

A API, essa sim, escala para várias réplicas sem cerimônia: ela é sem estado, e
o estado todo mora no banco.

### 3. O banco

```
DATABASE_POOL_MAX=20        # por réplica da API — some tudo e compare com o teto do banco
MESSAGE_RETENTION_DAYS=90   # 100 restaurantes geram muito texto de mensagem
```

Some `DATABASE_POOL_MAX × réplicas + 1 (worker)` e confira contra o limite de
conexões do seu banco — e mantenha o banco na mesma região da Render, senão cada
consulta a mais custa uma travessia. Neon e Supabase no plano gratuito param em 20 no total —
estourar isso derruba **todos** os restaurantes de uma vez, e o sintoma é um
`/health` intermitente que confunde muito.

O que vale vigiar, nesta ordem: linhas na `outbox` esperando envio, tempo da
consulta de horários livres (a soma da lotação por ambiente), e tamanho da tabela de mensagens.

### 4. Os limites da Meta

| Limite | O que é | Quando aperta |
|---|---|---|
| Qualidade do número | cai com denúncia e bloqueio | por número — um restaurante ruim não contamina os outros |
| Limite diário de conversas | começa baixo e sobe com uso saudável | número novo, nas primeiras semanas |
| Taxa de envio | mensagens por segundo | só em disparo em massa; os lembretes deste projeto são espalhados no dia |
| Verificação do negócio | Meta Business Verification | obrigatória para sair do modo limitado — **comece cedo, leva dias** |

O `WORKER_BATCH_SIZE` e o `WORKER_INTERVAL_MS` controlam o ritmo de saída. Com
100 restaurantes, `20` mensagens a cada `30s` (o padrão) dá 2400 por hora — folgado
para lembretes, que já saem espalhados ao longo do dia.

### 5. Onboarding

Com 100 clientes, os 30 minutos de [`onboarding-tenant.md`](onboarding-tenant.md)
viram 50 horas. O que compensa automatizar, na ordem do retorno:

1. **Um script `onboard.ts`** que cria a pasta a partir de um formulário, escreve
   no `tenants.json`, chama o `tenant:add` e cria o custom hostname. É o maior
   ganho e o mais fácil.
2. **Embedded Signup da Meta** — o cliente autoriza pelo navegador e você recebe
   `phone_number_id`, `waba_id` e token por callback. Elimina o passo mais
   demorado e mais sujeito a erro de digitação.
3. **Um painel para o cliente editar o próprio config.** Aqui o desenho muda: o
   config sai do git e vai para o banco, e o site precisa deixar de ser buildado
   por push. É uma reescrita, não um ajuste — deixe por último, e só se os
   clientes realmente pedirem.

---

## O que **não** muda de 5 para 100

Vale dizer, porque é o que dá confiança para começar simples:

- **O roteamento do WhatsApp.** `phone_number_id` → tenant é uma consulta
  indexada com cache. Cem números não pesam mais que cinco.
- **O schema do config.** O mesmo `restaurante.config.json`, o mesmo
  `normalizeConfig`.
- **O build do site.** `TENANT=<slug> npm run build` é idêntico; o que muda é
  quantas vezes ele roda e para onde o resultado vai.
- **O `.env` do servidor.** Continua um só. Nada por restaurante entra nele.
- **A separação dos módulos.** Site e WhatsApp continuam subindo sozinhos, e
  cada um escala pelo seu lado.

O que muda é **operação**: como você emite certificado, como aprova template,
como cadastra cliente. Nenhuma dessas é uma decisão de arquitetura que precise
ser tomada agora.
