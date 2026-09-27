# Deploy — de 1 para 5 restaurantes, com caminho até 100

Como colocar os dois módulos no ar atendendo **vários restaurantes ao mesmo
tempo**: cada uma com o **seu domínio** no site e o **seu número** no WhatsApp.

| Documento | O que resolve |
|---|---|
| [`deploy-passo-a-passo/`](deploy-passo-a-passo/README.md) | **O passo a passo executável**: GitHub, banco, Meta, Render e Cloudflare Pages, uma etapa por documento |
| [`arquitetura.md`](arquitetura.md) | Como fica o desenho com N restaurantes, e o que precisa mudar no código |
| [`deploy-site.md`](deploy-site.md) | Módulo 1 no ar: um build e um domínio por restaurante |
| [`deploy-whatsapp.md`](deploy-whatsapp.md) | Módulo 2 no ar: um servidor, N números |
| [`onboarding-tenant.md`](onboarding-tenant.md) | Checklist do restaurante novo, do zero ao ar |
| [`escala-100.md`](escala-100.md) | O que muda de 5 para 100: limites, custos e automação |

---

## O resumo em uma tela

```
                    ┌──────────────────────────────────────────┐
                    │  whatsapp/tenants/<slug>/                │
                    │      restaurante.config.json             │   ← fonte da verdade
                    │  (marca, cardápio, ambientes, horários)  │     versionada no git
                    └───────────┬──────────────────┬───────────┘
                                │                  │
              build por tenant  │                  │  tenant:sync (lê e grava no banco)
                                ▼                  ▼
        ┌────────────────────────────┐   ┌────────────────────────────────┐
        │  MÓDULO 1 — SITE           │   │  MÓDULO 2 — WHATSAPP           │
        │  N builds estáticos        │   │  1 servidor, N números         │
        │                            │   │                                │
        │  bellanonna.com.br ──┐     │   │  Meta ──webhook──▶ /webhook    │
        │  sushikaze.com.br  ──┼──▶  │   │            roteia por          │
        │  botecodoze.com.br ──┘     │   │            phone_number_id     │
        │                            │   │                 │              │
        │  CDN + TLS por domínio     │   │                 ▼              │
        └────────────────────────────┘   │           PostgreSQL           │
                                         │    (tenants, reservas, outbox) │
                                         └────────────────────────────────┘
```

**As duas metades escalam de jeitos diferentes, e isso é de propósito:**

| | Site | WhatsApp |
|---|---|---|
| Unidade de deploy | **um build estático por restaurante** | **um servidor para todos** |
| Como separa os restaurantes | domínio → build daquele slug | `phone_number_id` → linha na tabela `tenants` |
| Custo de mais um restaurante | +1 build (segundos) e +1 domínio | +1 número na Meta e uma linha no banco |
| Precisa de deploy para mudar preço? | **sim** (rebuild daquele tenant) | **não** (`tenant:sync`, vale em até 60s) |

O site é estático: não existe servidor para decidir "qual restaurante é este", então
a decisão é tomada no build. O WhatsApp é um servidor de verdade e já decide em
tempo de execução — [o registry](../whatsapp/src/tenants/registry.ts) descobre a
restaurante pelo número que recebeu a mensagem.

---

## O estado de hoje, sem enfeite

Antes do passo a passo, o que já está pronto e o que não está:

| | Situação |
|---|---|
| WhatsApp multi-tenant | ✅ **Pronto.** `whatsapp/tenants/<slug>/`, tabela `tenants`, roteamento por `phone_number_id`, token criptografado por restaurante, cache de 60s |
| WhatsApp — cadastro da 2ª em diante | ✅ **Pronto.** `npm run tenant:add -- --slug=...` |
| Site multi-tenant | ✅ **Pronto.** `TENANT=<slug> npm run build` → `site/dist/<slug>/`, com o config daquele restaurante embutido |
| Manifesto de deploy | ✅ **Pronto.** `deploy/tenants.json` + `npm run deploy:check` |
| Dockerfile / `render.yaml` / CI | ✅ **Prontos.** `whatsapp/Dockerfile`, `.dockerignore`, o Blueprint `render.yaml` e dois workflows em `.github/workflows/` |

**O que sobra é configuração de painel, não código:** criar os projetos de
hospedagem, apontar os domínios, adicionar os números na Meta e cadastrar as
restaurantes com `tenant:add`. Os dois segredos do CI (`CLOUDFLARE_API_TOKEN` e
`CLOUDFLARE_ACCOUNT_ID`) precisam existir no repositório antes que o workflow do
site faça alguma coisa; o servidor não usa secret de CI nenhum — quem publica
ele é a Render, direto do push.

As cinco pastas em `whatsapp/tenants/` estão criadas com conteúdo de exemplo —
preencha cada `restaurante.config.json` e as fotos em `public/fotos/` antes de
publicar.

---

## Por onde começar

1. Leia [`arquitetura.md`](arquitetura.md) — 5 minutos, e as decisões dos outros
   documentos passam a fazer sentido.
2. Preencha o config do primeiro restaurante e confira o build:
   `TENANT=<slug> npm run build -w @restaurante/site`.
3. Suba o WhatsApp por [`deploy-whatsapp.md`](deploy-whatsapp.md) — é o mais
   demorado, porque depende de aprovação da Meta.
4. Ponha os secrets no GitHub e crie os projetos de hospedagem
   ([`deploy-site.md`](deploy-site.md#3-publicar-os-cinco)).
5. Do segundo restaurante em diante, siga só o
   [`onboarding-tenant.md`](onboarding-tenant.md).
