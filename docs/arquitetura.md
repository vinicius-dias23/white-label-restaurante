# A arquitetura com N restaurantes

O que muda, o que não muda, e por quê.

---

## 1. Uma fonte da verdade por restaurante

Hoje existem **dois** lugares com config:

| Arquivo | Quem lê | Papel a partir de agora |
|---|---|---|
| `restaurante.config.json` (raiz) | site (import fixo) | **desenvolvimento e demonstração** — o que você vê no `npm run dev` |
| `whatsapp/tenants/<slug>/restaurante.config.json` | WhatsApp (`tenant:sync`) | **produção, uma pasta por restaurante** — passa a alimentar os **dois** módulos |

A regra fica: **produção lê sempre de `whatsapp/tenants/<slug>/`.**

```
whatsapp/tenants/
  cantina-bella-nonna/restaurante.config.json
  sushi-kaze/restaurante.config.json
  boteco-do-ze/restaurante.config.json
  bistro-lume/restaurante.config.json
  churrascaria-fogo-alto/restaurante.config.json
```

Mesmo arquivo, mesmo schema (`shared/src/config/types.ts`), mesmo `normalizeConfig`.
Mudou o preço do "Fettuccine alla Nonna" ou a lotação da Varanda → muda no site e no bot, sem divergir.

> **Por que não mover para `tenants/` na raiz?** Dá para fazer, e é mais bonito.
> Mas `whatsapp/src/lib/paths.ts` aponta para `whatsapp/tenants/`, o
> `tenant:sync` já funciona, e mover não muda nada de comportamento. Fica onde
> está; o site é que vai buscar lá.

### O que é config e o que é segredo

| Vai no git (`restaurante.config.json`) | **Nunca** vai no git |
|---|---|
| marca, cores, fotos, textos | `TENANT_ACCESS_TOKEN` (token da Meta) |
| cardápio, preços, ambientes e lotação | `META_APP_SECRET`, `META_VERIFY_TOKEN` |
| equipe, horários, endereço | `APP_ENCRYPTION_KEY`, `ADMIN_API_TOKEN` |
| número de WhatsApp **exibido** ao cliente | `DATABASE_URL` |
| telefone do dono (`whatsapp.owner.phones`) e da equipe (`team[].phone`) | |

> **Os telefones dos painéis são config, não segredo — mas são dado pessoal.**
> Eles decidem quem abre o painel do dono e o da recepção, e o estúdio os edita
> como edita preço e horário. Duas consequências que valem saber:
>
> 1. O build do site **remove** esses campos do bundle (`site/vite.config.ts`,
>    `configPublico`). Sem isso, o telefone da recepção iria parar no JavaScript
>    da landing page — o `restaurante.config.json` inteiro é entregue ao navegador.
> 2. Eles ficam no histórico do git, que não se apaga. Mantenha o repositório
>    privado.

Os segredos por restaurante (token, `phone_number_id`) entram pelo
`npm run tenant:add` e ficam **criptografados no banco** com AES-256-GCM
(`whatsapp/src/lib/crypto.ts`). O `.env` só guarda o segredo do servidor, que é
um só para todos.

---

## 2. Um manifesto de deploy

O `restaurante.config.json` descreve o restaurante para o **cliente final**. Ele não
sabe em que domínio o site vai morar nem em que projeto ele publica — isso é
assunto de infraestrutura. Vai num arquivo separado:

**`deploy/tenants.json`**

```json
[
  { "slug": "cantina-bella-nonna",    "dominio": "cantinabellanonna.com.br", "ativo": true },
  { "slug": "sushi-kaze",             "dominio": "sushikaze.com.br",         "ativo": true },
  { "slug": "boteco-do-ze",           "dominio": "botecodoze.com.br",        "ativo": true },
  { "slug": "bistro-lume",            "dominio": "bistrolume.com.br",        "ativo": true },
  { "slug": "churrascaria-fogo-alto", "dominio": "fogoalto.com.br",          "ativo": false }
]
```

É este arquivo que o CI lê para saber **o que buildar e para onde mandar**.
`"ativo": false` tira o restaurante da fila de deploy sem apagar nada — útil para
quem ainda está montando o conteúdo, ou para quem cancelou o contrato.

O `phone_number_id` **não** entra aqui: ele vive no banco, cadastrado pelo
`tenant:add`. Um lugar só por informação.

---

## 3. Site: a decisão é no build

O site é HTML/CSS/JS estático. Não há processo rodando para olhar o `Host` da
requisição e escolher o restaurante — quando o navegador pede a página, o build já
aconteceu faz tempo.

Então: **um build por restaurante**, cada um com o config daquele slug embutido.

```
TENANT=sushi-kaze npm run build     →   site/dist/sushi-kaze/
TENANT=boteco-do-ze npm run build   →   site/dist/boteco-do-ze/
```

Cinco builds levam menos de um minuto no total, e rodam em paralelo no CI.
Cem levam alguns minutos — e, quando só um restaurante mudou, o CI builda
**só aquele** (veja [`escala-100.md`](escala-100.md#builds-incrementais)).

**A alternativa que eu não recomendo:** um site só que baixa o config por
`fetch()` conforme o domínio. Parece mais elegante e é pior — tela em branco
até o JSON chegar, cores piscando, SEO ruim (o Google indexa o HTML vazio) e
uma dependência de runtime que pode cair. Build estático por tenant não tem
nenhum desses problemas e é mais barato de hospedar.

---

## 4. WhatsApp: a decisão é em tempo de execução

Aqui já está tudo pronto, e o desenho é o oposto do site: **um servidor para
todos os restaurantes**.

```
Cliente da Cantina Bella Nonna ─┐
Cliente do Sushi Kaze          ─┼─▶  Meta Cloud API ─┐
Cliente do Boteco do Zé        ─┘                    │
                                                   │  POST /webhook
                                                   ▼
                                        ┌────────────────────────┐
                                        │  seu servidor (1 só)   │
                                        │                        │
                                        │  entry.changes[].value │
                                        │    .metadata           │
                                        │    .phone_number_id    │
                                        │          │             │
                                        │          ▼             │
                                        │   getTenantContext()   │  cache 60s
                                        │          │             │
                                        │   tenant + ambientes   │
                                        │   + equipe + token     │
                                        └──────────┬─────────────┘
                                                   ▼
                                              PostgreSQL
```

Dentro de um restaurante, quem escreve é reconhecido pelo telefone, nesta ordem
(`whatsapp/src/bot/handler.ts`):

| Quem | Como é reconhecido | O que vê |
|---|---|---|
| Dono | `tenants.owner_phone` | a casa inteira: pedidos de grupo grande, reservas, relatório, fechar agenda, pausar o bot |
| Recepção | `staff.phone` | a lista do dia e a marcação de chegadas |
| Cliente | qualquer outro número | o menu de atendimento |

O dono vem primeiro de propósito: no restaurante pequeno ele também fica na
porta, e o mesmo número pode estar nos dois lugares. O painel dele já mostra as
reservas da casa inteira e tem o atalho "Marcar chegadas", então ele não perde
nada com isso — o contrário, sim. E a recepção é reconhecida **antes** da pausa
do bot: a pausa cala o atendimento dos clientes, não a lista da noite de quem
está na porta.

Todo webhook da Meta traz o `phone_number_id` de destino. O
[`registry.ts`](../whatsapp/src/tenants/registry.ts) troca esse ID pelo
restaurante, seus ambientes, sua equipe e **o token dele** — e responde com o
`WhatsAppClient` daquele restaurante. Número desconhecido cai num `log.warn` e a
mensagem é ignorada.

Consequências práticas:

- **Uma URL de webhook só**, cadastrada uma vez na Meta. Restaurante novo não
  mexe em webhook.
- **Um `.env` só.** As credenciais por restaurante estão no banco.
- **Um deploy só.** Restaurante novo não é deploy: é `tenant:add` + `tenant:sync`.
- Isolamento é por linha no banco. Toda query filtra por `tenant_id`.

---

## 5. Onde cada peça mora

| Peça | Recomendação | Por quê |
|---|---|---|
| Site (5 tenants) | **Cloudflare Pages**, um projeto por restaurante | domínio custom e TLS no painel, plano grátis dá conta, deploy por Actions |
| Site (50+ tenants) | **1 bucket/projeto + Worker roteando por `Host`** + Cloudflare for SaaS | 100 projetos no painel é insustentável; veja [`escala-100.md`](escala-100.md) |
| WhatsApp | **Render**, 1 Web Service em container (plano Starter) | precisa rodar 24/7 com processo vivo (o worker) — serverless e planos que hibernam não servem |
| Banco | **Render Postgres** ou **Neon**, na mesma região do serviço | Postgres gerenciado, backup automático, `DATABASE_SSL=true` — e o ida-e-volta app↔banco é o que mais soma na conversa |
| Worker | dentro do container (`WORKER_IN_PROCESS=true`) até ~20 restaurantes | mais barato; separe depois, é uma variável de ambiente |

Nada disso é obrigatório — o site sobe em qualquer hospedagem estática, e o
servidor em qualquer lugar que rode Node 22 com um Postgres perto. As
recomendações são pelo caminho de menor atrito.

---

## 6. As peças de infraestrutura, e onde elas estão

As peças que faltavam já estão no repositório:

| Peça | Arquivo | O que faz |
|---|---|---|
| Build por tenant | `site/vite.config.ts` | lê `TENANT`, redireciona o import do config e sai em `site/dist/<slug>/` |
| Manifesto | `deploy/tenants.json` | quem existe, em que domínio, ligado ou não — é o que o CI lê |
| Conferência do manifesto | `deploy/verificar-tenants.mjs` | `npm run deploy:check`: slug válido, config presente, domínio único |
| Container | `whatsapp/Dockerfile` + `.dockerignore` | imagem do servidor, **sem** o `.env` dentro |
| Máquina | `render.yaml` | Blueprint da Render: região `virginia`, `plan: starter` (sem hibernar, o worker precisa estar vivo), healthcheck em `/health` e o `buildFilter` que decide o que dispara deploy |
| CI | `.github/workflows/ci.yml` | tipos, testes, manifesto e um build multi-tenant a cada PR |
| Deploy do site | `.github/workflows/deploy-site.yml` | matriz a partir do manifesto, um `wrangler pages deploy` por restaurante |
| Deploy do bot | o próprio `render.yaml` (`autoDeploy`) | a Render publica no push e só promove a versão nova depois que o `/health` passa — não há workflow |

O resto do caminho é configuração de painel: domínio, DNS, número na Meta,
templates — e os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no
GitHub, sem os quais o workflow do site não faz nada. O servidor não precisa de
secret no GitHub: a Render conecta no repositório pelo GitHub App dela.
