# Etapa 5 — Render: o servidor do WhatsApp

Um container Node 22, rodando **24 horas por dia**, atendendo **todos** os
restaurantes. Ao fim desta etapa, `https://…/health` responde e a Meta consegue
entregar webhooks.

> **Por que não serverless?** O worker precisa de um processo vivo para disparar
> lembrete às 2h da manhã. Lambda e Vercel Functions hibernam — o bot conversaria
> normalmente e **nenhum lembrete sairia**, sem erro nenhum aparecer.

---

## 5.1 O que já está no repositório

| Arquivo | Papel |
|---|---|
| `whatsapp/Dockerfile` | A imagem. **Construída da raiz** — o módulo depende de `@restaurante/shared` e lê os configs em `whatsapp/tenants/` |
| `.dockerignore` (na raiz) | Impede que `whatsapp/.env` e o `node_modules` do host entrem na imagem |
| `render.yaml` (na raiz) | O *Blueprint*: serviço `restaurante-whatsapp`, região `virginia`, health check em `/health` |

Duas linhas do `render.yaml` que **não devem ser mexidas**:

```yaml
plan: starter
healthCheckPath: /health
```

O `plan` é o que mantém o worker vivo: o plano `free` da Render **hiberna** por
inatividade, e um serviço dormindo de madrugada custa todos os lembretes. O
`healthCheckPath` é o portão do deploy — a Render só promove a versão nova
depois que `/health` responde 200, e o `/health` consulta o banco. Um deploy com
`DATABASE_URL` errada não derruba o servidor que está no ar.

> **Região.** A Render não tem região no Brasil. `virginia` é a mais próxima
> (~110 ms do celular do cliente). O que pesa de verdade não é esse salto único,
> é o servidor conversar com o banco: cada toque no bot faz várias consultas.
> Por isso o requisito é o banco estar na **mesma região** —
> [etapa 3](03-banco-de-dados.md#31-o-que-o-banco-precisa-ter).

---

## 5.2 Confira a imagem localmente (opcional, mas vale)

```bash
docker build -f whatsapp/Dockerfile -t restaurante-whatsapp .
```

E a checagem que importa — que o `.env` **não** vazou para dentro da imagem:

```bash
docker run --rm restaurante-whatsapp \
  sh -c 'ls -a /app/whatsapp | grep -x "\.env" && echo VAZOU || echo "sem .env"'
# sem .env
```

Se disser `VAZOU`, pare: o `.dockerignore` foi alterado e a imagem carrega a
`APP_ENCRYPTION_KEY` e os tokens da Meta para dentro de um registry.

---

## 5.3 Criar o serviço na Render

Não existe `render launch`: o serviço nasce do Blueprint, pelo painel.

> painel da Render → **New +** → **Blueprint**

1. Escolha o repositório (autorize o GitHub App da Render se for a primeira vez).
2. Ela encontra o `render.yaml` na raiz e mostra o que vai criar: **um** Web
   Service chamado `restaurante-whatsapp`.
3. Se ela oferecer criar um **PostgreSQL**, recuse: o banco já existe, da
   [etapa 3](03-banco-de-dados.md).
4. Ela vai pedir os valores das variáveis marcadas `sync: false` — é a
   [seção 5.4](#54-os-segredos-e-o-primeiro-deploy). Dá para preencher agora ou
   depois, na aba **Environment** do serviço.

Confira pela CLI que o serviço nasceu:

```bash
render services --output json | grep restaurante-whatsapp
```

A URL fica sendo `https://restaurante-whatsapp.onrender.com` — o nome do serviço
no `render.yaml` é o que a define, por isso ele é fixo.

---

## 5.4 Os segredos e o primeiro deploy

Todos os segredos da aplicação vivem **aqui**, no ambiente do serviço na
Render — não no GitHub, não em arquivo.

> serviço → **Environment** → *Add Environment Variable*

São **sete**, os mesmos marcados `sync: false` no `render.yaml`:

| Variável | O que é |
|---|---|
| `DATABASE_URL` | a *connection string* da [etapa 3](03-banco-de-dados.md#32-as-variáveis-de-conexão) |
| `META_APP_ID` | da [etapa 4](04-meta-whatsapp.md) |
| `META_APP_SECRET` | idem — é ele que valida a assinatura do webhook |
| `META_VERIFY_TOKEN` | idem — o mesmo que vai no painel da Meta, em [5.5](#55-cadastrar-o-webhook-na-meta) |
| `APP_ENCRYPTION_KEY` | base64 de 32 bytes; criptografa o token de cada restaurante no banco |
| `ADMIN_API_TOKEN` | o *bearer* das rotas `/admin/*` |
| `PUBLIC_URL` | `https://restaurante-whatsapp.onrender.com` |

As outras dez (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `DEFAULT_*`, `DATABASE_SSL`,
`DATABASE_POOL_MAX`, `WORKER_*`) **já vêm do `render.yaml`** — não precisam ser
digitadas, e mudá-las é editar o arquivo e dar push.

> **As variáveis `TENANT_*` do `.env.example` ficam vazias em produção.** Elas
> existem para cadastrar o *primeiro* restaurante numa instalação de restaurante
> único. Aqui, **todos** entram pelo `tenant:add` na
> [etapa 7](07-cadastro-restaurantes.md), com os segredos criptografados no banco e
> nenhum dado de cliente no ambiente do servidor.

O `.env.example` documenta cada variável, uma por uma — vale ler antes de
preencher.

Salvar as variáveis já dispara um deploy. Acompanhe na aba **Logs**; o serviço
fica `live` quando o `/health` passa.

Depois do primeiro deploy, as migrações (se você não as rodou na etapa 3):

```bash
render ssh restaurante-whatsapp -- 'npm run db:migrate -w @restaurante/whatsapp'
```

E a verificação:

```bash
curl -s https://restaurante-whatsapp.onrender.com/health
# {"ok":true,"servico":"restaurante-whatsapp"}
```

Se não responder:

```bash
render logs -r restaurante-whatsapp --tail
```

e a aba **Events** do serviço, que mostra por que um deploy não foi promovido.

---

## 5.5 Cadastrar o webhook na Meta

Agora que a URL existe e responde em HTTPS:

> painel da Meta → seu app → **WhatsApp → Configuração → Webhook** → *Editar*

| Campo | Valor |
|---|---|
| URL de callback | `https://restaurante-whatsapp.onrender.com/webhook` |
| Token de verificação | o mesmo `META_VERIFY_TOKEN` da aba Environment |
| Campos assinados | marque **`messages`** |

A Meta faz um `GET` na URL na hora de salvar e compara o token. Se ela reclamar
que não conseguiu verificar:

1. O `PUBLIC_URL` e o token batem com o que está na aba **Environment**?
2. O `/health` responde de fora da sua rede?
3. `render logs -r restaurante-whatsapp --tail` mostra o `GET /webhook` chegando?

**Este passo acontece uma vez.** Restaurante novo não mexe aqui — só precisa que a
WABA dele esteja assinada no app.

---

## 5.6 Domínio próprio (opcional)

`restaurante-whatsapp.onrender.com` funciona perfeitamente como URL de webhook. Se
preferir um domínio seu:

> serviço → **Settings** → **Custom Domains** → *Add Custom Domain*

Informe `bot.suaempresa.com.br`. A Render mostra o registro de DNS a criar (um
`CNAME` apontando para `restaurante-whatsapp.onrender.com`) e emite o certificado
sozinha assim que o DNS propaga.

Com o certificado no ar, **atualize as duas pontas**: troque `PUBLIC_URL` na aba
Environment para `https://bot.suaempresa.com.br` e troque a URL de callback no
painel da Meta. Mexer só em um dos dois lados é o jeito mais silencioso de
derrubar o bot.

---

## 5.7 Daqui em diante, quem faz deploy é o push

`autoDeploy: true` no `render.yaml`: todo push em `master` publica sozinho, e a
Render só troca o servidor depois que o `/health` da versão nova passa. **Não
existe secret de deploy no GitHub** — quem conecta os dois é o GitHub App da
Render.

O `buildFilter` do `render.yaml` decide o que dispara deploy: `whatsapp/src/`,
`shared/`, o `Dockerfile`, o `package-lock.json` e o próprio `render.yaml`.
Mexer em `whatsapp/tenants/<slug>/` **não** dispara — trocar o preço de um
prato não pode reiniciar o bot de todos os outros restaurantes.

**As migrações continuam manuais e deliberadas.** O deploy não as roda de
propósito: uma migração que apaga coluna, disparada por um merge distraído, é
irreversível.

---

## ✅ Antes de seguir

- [ ] O serviço aparece como **`live`** no painel
- [ ] `curl https://…/health` devolve `{"ok":true,...}`
- [ ] `plan: starter` continua no `render.yaml` (nunca `free`)
- [ ] O banco está na mesma região do serviço (`virginia`)
- [ ] As migrações rodaram (`\dt` mostra as tabelas)
- [ ] O webhook está cadastrado na Meta e foi **verificado com sucesso**
- [ ] A aba **Environment** mostra os sete segredos

**Próximo:** [`06-cloudflare-pages.md`](06-cloudflare-pages.md)
