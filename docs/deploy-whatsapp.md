# Módulo 2 — WhatsApp: um número por barbearia

Objetivo: cinco barbearias, cinco números de WhatsApp, **um servidor só**.

A boa notícia: isso **já está implementado**. O roteamento por número, o token
criptografado por barbearia, o cache, o CLI de cadastro — tudo pronto. Este
documento é sobre colocar no ar e cadastrar as cinco.

> Antes de qualquer coisa, se você ainda não subiu o bot para **uma** barbearia,
> comece por [`../whatsapp/docs/setup.md`](../whatsapp/docs/setup.md). Ele leva
> do zero (criar conta na Meta) até o primeiro "oi" respondido, com número de
> teste grátis. Este documento continua de lá.

---

## 1. Como um servidor atende cinco números

```
POST /webhook
{
  "entry": [{
    "changes": [{
      "value": {
        "metadata": { "phone_number_id": "109876543210987" },   ← a chave
        "messages": [ ... ]
      }
    }]
  }]
}
```

Todo webhook diz **para qual número** a mensagem foi. O
[`registry.ts`](../whatsapp/src/tenants/registry.ts) troca esse ID pela
barbearia — dados, serviços, barbeiros e o **token dela** — com cache de 60
segundos. Número que não está na tabela `tenants` cai num aviso no log e a
mensagem é descartada.

O que isso significa na prática:

| | |
|---|---|
| URL de webhook | **uma só**, cadastrada uma vez |
| `.env` | **um só**; o que é por barbearia está no banco |
| Deploy para adicionar barbearia | **nenhum** — é `tenant:add` + `tenant:sync` |
| Aplicativo na Meta | **um só** para todas |

---

## 2. Decida antes: uma WABA ou uma por barbearia

WABA é a *WhatsApp Business Account* — a conta que segura os números e **os
templates**. É a decisão mais consequente deste documento, porque mexer nela
depois dá trabalho.

| | **Uma WABA para todas** | **Uma WABA por barbearia** |
|---|---|---|
| Templates | aprovados **uma vez**, valem para todos os números | aprovados **em cada WABA**, uma por uma |
| De quem é o número | seu Business Manager | do cliente (ele é o dono) |
| Cliente sai da sua carteira | você precisa devolver o número | ele leva a WABA dele, e pronto |
| Qualidade / bloqueio | uma barbearia com muita denúncia **afeta a WABA inteira** | o problema fica na barbearia que o causou |
| Números por WABA | há um teto (por volta de 25 — confirme no seu painel) | não se aplica |
| Onboarding | você cria tudo | Embedded Signup, o cliente autoriza |

**Recomendação:** comece com **uma WABA para as cinco**. Templates aprovados uma
vez só é uma economia enorme de tempo, e no começo os números provavelmente serão
seus mesmo. Passe para uma WABA por barbearia quando **alguma** destas for
verdade:

- você passou de ~20 números (o teto por WABA chega);
- algum cliente exige ser dono do número dele;
- uma barbearia com qualidade ruim começou a ameaçar as outras.

O código não muda: `wabaId` já é uma coluna por barbearia
(`whatsapp/src/db/repositories/tenants.ts`), e o `templates:check` já confere na
WABA de cada uma.

> **Detalhe que derruba gente:** a assinatura do webhook é **por WABA**. A URL é
> cadastrada uma vez no aplicativo, mas cada WABA nova precisa ser assinada por
> aquele app — `POST /{waba-id}/subscribed_apps`, ou pelo botão do painel. WABA
> nova sem assinatura = mensagens que nunca chegam, sem nenhum erro visível.

---

## 3. Empacotar em container

O **`whatsapp/Dockerfile`** já está no repositório:

```dockerfile
# O build precisa do repositório inteiro: o módulo depende de @barbearia/shared
# e lê os configs em whatsapp/tenants/. Construa da RAIZ:
#     docker build -f whatsapp/Dockerfile -t barbearia-whatsapp .
FROM node:22-alpine

WORKDIR /app

# Dependências primeiro: o cache do Docker só é invalidado quando elas mudam.
COPY package.json package-lock.json ./
COPY shared/package.json  shared/
COPY site/package.json    site/
COPY whatsapp/package.json whatsapp/
RUN npm ci --omit=dev --workspace=@barbearia/whatsapp --include-workspace-root

COPY tsconfig.base.json ./
COPY shared/   shared/
COPY whatsapp/ whatsapp/

ENV NODE_ENV=production
EXPOSE 3333

# tsx roda o TypeScript direto — é assim que o módulo já roda hoje.
CMD ["npm", "run", "start", "-w", "@barbearia/whatsapp"]
```

```bash
docker build -f whatsapp/Dockerfile -t barbearia-whatsapp .
```

O `COPY whatsapp/ whatsapp/` da última camada levaria o `whatsapp/.env` inteiro —
`APP_ENCRYPTION_KEY` e tokens da Meta — para dentro de uma imagem que vai para um
registry. Quem impede isso é o **`.dockerignore` na raiz**, que também tira o
`node_modules` do host (binários compilados para o seu Mac não rodam no Alpine) e
o módulo do site. Confira depois de todo build:

```bash
docker run --rm barbearia-whatsapp sh -c 'ls -a /app/whatsapp | grep -x "\.env" && echo VAZOU || echo "sem .env"'
```

> **O `.env` não vai para a imagem** (está no `.gitignore`, e não deve mesmo).
> Em produção as variáveis vêm da plataforma. O
> [`env.ts`](../whatsapp/src/env.ts) chama o `dotenv` apontando para
> `whatsapp/.env`; sem o arquivo, ele simplesmente não faz nada e as variáveis do
> ambiente valem. É o comportamento certo — não precisa mudar nada.

---

## 4. Subir o servidor

Serve qualquer lugar que rode um container Node 22 **24 horas por dia**. Não use
serverless (Lambda, Vercel Functions) nem plano que hiberna por inatividade: o
worker precisa de um processo vivo para disparar lembrete às 2h da manhã, e
função dormindo não faz isso. Este repositório vem pronto para a **Render**.

### 4.1 O banco

Um Postgres gerenciado, com backup automático, **na mesma região do servidor**.
Render Postgres, Neon, Supabase ou RDS — qualquer um serve. Um banco só para
todas as barbearias; a separação é por `tenant_id` nas tabelas.

```
DATABASE_URL=postgres://usuario:senha@host/banco
DATABASE_SSL=true          # praticamente todo banco gerenciado exige
DATABASE_POOL_MAX=10       # 10 aguenta bem 5 barbearias
```

### 4.2 Os segredos do servidor

Gere agora, uma vez, e guarde no cofre de segredos da plataforma:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY  (criptografa os tokens no banco)
openssl rand -hex 32      # META_VERIFY_TOKEN   (o mesmo valor vai no painel da Meta)
openssl rand -hex 32      # ADMIN_API_TOKEN     (protege as rotas /admin/*)
```

> ⚠️ **A `APP_ENCRYPTION_KEY` é a mais delicada.** Se ela se perder, todos os
> tokens guardados viram lixo e **as cinco barbearias precisam ser cadastradas de
> novo**. Guarde junto do backup do banco, e nunca rode dois ambientes com chaves
> diferentes contra o mesmo banco.

### 4.3 As variáveis de produção

Além dos segredos, no mínimo:

```
NODE_ENV=production
PORT=3333
PUBLIC_URL=https://bot.suaempresa.com.br     # HTTPS, é o que a Meta chama
LOG_LEVEL=info

META_APP_ID=...
META_APP_SECRET=...
META_VERIFY_TOKEN=...

DEFAULT_TIMEZONE=America/Sao_Paulo
DEFAULT_LOCALE=pt_BR
DEFAULT_COUNTRY_CODE=55

WORKER_ENABLED=true
WORKER_IN_PROCESS=true
```

O `.env.example` explica cada variável, uma por uma — vale ler antes de copiar.

**As variáveis `TENANT_*` do `.env` são só para a primeira barbearia.** Da
segunda em diante o cadastro é por `tenant:add`, e os dados vão criptografados
para o banco. Em produção com cinco barbearias, deixe as `TENANT_*` **vazias** e
cadastre todas pelo CLI: um caminho só, e nenhum segredo de cliente no ambiente
do servidor.

### 4.4 Render (exemplo completo)

O **`render.yaml`** já está na raiz do repositório — ele é o Blueprint que a
Render lê em *New → Blueprint*. Em vez de repetir o arquivo aqui (e ele
envelhecer), vale abrir o de verdade: [`render.yaml`](../render.yaml). O que
importa nele:

| Chave | Por quê |
|---|---|
| `runtime: docker` + `dockerContext: .` | a imagem é construída da **raiz** — o módulo depende de `@barbearia/shared` e lê `whatsapp/tenants/` |
| `plan: starter` | o plano `free` hiberna, e com ele morre o worker: o bot continuaria conversando e nenhum lembrete sairia de madrugada |
| `region: virginia` | a Render não tem região no Brasil; o banco vai na **mesma** região, porque o que soma é o ida-e-volta app↔banco |
| `healthCheckPath: /health` | a rota consulta o banco de verdade, e a Render só promove o deploy novo depois que ela responde 200 |
| `buildFilter.paths` | o que dispara deploy. `whatsapp/tenants/**` está **fora** de propósito: mudar o preço de uma barbearia não pode reiniciar o bot das outras |
| `sync: false` | os sete segredos, que você preenche na aba *Environment* e nunca entram no git |

O passo a passo com os cliques está em
[`deploy-passo-a-passo/05-render.md`](deploy-passo-a-passo/05-render.md).

Migrações, uma vez, depois do primeiro deploy:

```bash
render ssh barbearia-whatsapp -- 'npm run db:migrate -w @barbearia/whatsapp'
curl -s https://bot.suaempresa.com.br/health
# {"ok":true,"servico":"barbearia-whatsapp"}
```

### 4.5 O webhook, uma vez para sempre

No painel da Meta → seu app → **WhatsApp → Configuração → Webhook**:

| Campo | Valor |
|---|---|
| URL de callback | `https://bot.suaempresa.com.br/webhook` |
| Token de verificação | o mesmo `META_VERIFY_TOKEN` |
| Campos assinados | `messages` |

Este passo acontece **uma vez**. Barbearia nova não mexe aqui — só precisa que a
WABA dela esteja assinada no app (a observação da seção 2).

---

## 5. Cadastrar as cinco barbearias

Para **cada uma**, na Meta: adicione o número (**WhatsApp → Configuração da API →
Adicionar número**), verifique por SMS ou ligação e anote a **"Identificação do
número de telefone"** — o `phone_number_id`, um número longo tipo
`109876543210987`. Não é o telefone; é o ID.

O token precisa ser **permanente**, de usuário do sistema (Meta Business →
Configurações → Usuários do sistema → Gerar novo token), com as permissões
`whatsapp_business_messaging` e `whatsapp_business_management`. O token que
aparece no painel de teste **expira em 24 horas** — se você usar ele, o bot para
de responder amanhã.

Depois, o config e o cadastro:

```bash
# 1. a pasta da barbearia (copie de uma que já existe e edite)
cp -r whatsapp/tenants/barbearia-do-ze whatsapp/tenants/studio-max
$EDITOR whatsapp/tenants/studio-max/barbearia.config.json

# 2. o cadastro — os segredos vão criptografados para o banco
cd whatsapp
npm run tenant:add -- \
  --slug=studio-max \
  --phone-number-id=109876543210987 \
  --waba-id=987654321098765 \
  --token='EAAG...' \
  --owner='(11) 91234-5678' \
  --timezone=America/Sao_Paulo
```

Repita para as cinco. Depois:

```bash
npm run tenant:list
```

```
5 barbearia(s):

  barbearia-do-ze          Barbearia do Zé              109876543210987  [ativa]
  studio-max               Studio Max Barber            109876543210988  [ativa]
  barbearia-ana            Barbearia da Ana             109876543210989  [ativa]
  corte-nobre              Corte Nobre                  109876543210990  [ativa]
  navalha-fina             Navalha Fina                 109876543210991  [ativa]
```

> Em produção o `tenant:add` roda **contra o banco de produção**. Duas formas:
> `render ssh barbearia-whatsapp -- '...'` de dentro do container, ou da sua máquina com o
> `DATABASE_URL` e a `APP_ENCRYPTION_KEY` de produção no ambiente. A primeira é
> mais segura — a chave nunca sai do servidor.

### Mudou preço, horário ou equipe

```bash
$EDITOR whatsapp/tenants/studio-max/barbearia.config.json
npm run tenant:sync                # lê todas as pastas e grava no banco
```

O `tenant:sync` **não** precisa de token: barbearia que já existe tem o config
atualizado e o número preservado. O cache do registry expira em 60 segundos, e o
menu novo passa a valer sozinho — **sem deploy, sem reiniciar**.

E lembre: o mesmo arquivo alimenta o site, que **precisa** de rebuild
([`deploy-site.md`](deploy-site.md#4-ci-buildar-e-publicar-todas)). Preço mudado
só no bot e não no site é o tipo de coisa que o cliente descobre antes de você.

---

## 6. Os templates

Fora da janela de 24 horas, a Meta **só aceita template aprovado**. Todo lembrete
deste projeto é template. A confirmação do agendamento não é — ela sai na hora,
como resposta a um toque do cliente, e por isso é texto livre.

Os JSONs prontos para colar estão em
[`../whatsapp/docs/templates.md`](../whatsapp/docs/templates.md).

| Se você escolheu | O que fazer |
|---|---|
| **Uma WABA para todas** | Cadastre `lembrete_24h` e `lembrete_2h` **uma vez**. Valem para os cinco números |
| **Uma WABA por barbearia** | Cadastre em **cada** WABA. Os nomes precisam ser idênticos — o `.env` tem um nome só (`TEMPLATE_LEMBRETE_24H`) para todas |

Confira antes de ligar as mensagens:

```bash
npm run templates:check
```

> **A ordem das variáveis importa.** O código manda `{{1}}`, `{{2}}`... na ordem
> descrita no `templates.md`. Trocar a ordem no WhatsApp Manager não dá erro de
> cadastro — dá erro **132000** na hora do envio, com o cliente esperando.

As mensagens de marketing (`FEATURE_REATIVACAO`, `FEATURE_ANIVERSARIO`) vêm
desligadas e é para continuarem assim até você ter certeza: são as mais caras,
exigem opt-in explícito e são as que mais geram denúncia — e denúncia derruba a
qualidade do número.

---

## 7. Testar as cinco

Da sua máquina, para cada barbearia:

```bash
cd whatsapp

# 1. o servidor está de pé e o banco responde
curl -s https://bot.suaempresa.com.br/health

# 2. as barbearias estão cadastradas
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://bot.suaempresa.com.br/admin/tenants

# 3. a agenda de uma delas
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://bot.suaempresa.com.br/admin/studio-max/agenda

# 4. a fila de mensagens programadas (deve estar vazia ou pequena)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://bot.suaempresa.com.br/admin/studio-max/fila
```

E o teste que realmente importa, **do seu celular, para cada número**:

1. Mande "oi" → o menu aparece **com o nome daquela barbearia**;
2. Agende um horário → a confirmação chega na hora, com os dados certos;
3. O dono (`--owner`) recebe o aviso do agendamento;
4. Cancele → o horário volta a aparecer como livre.

Faça o passo 1 nos cinco números. É como você descobre o erro mais comum de
multi-tenant: `phone_number_id` trocado entre duas barbearias — o cliente de uma
vê o menu da outra, com os preços da outra.

---

## 8. Operação do dia a dia

| Situação | O que fazer |
|---|---|
| Preço, horário ou equipe mudou | Editar o config, `npm run tenant:sync`, e rebuildar o site daquele tenant |
| Barbearia entrou | [`onboarding-tenant.md`](onboarding-tenant.md) |
| Barbearia saiu | `UPDATE tenants SET active = false WHERE slug = '...'` e `"ativo": false` no `deploy/tenants.json` |
| Token de uma barbearia expirou | `npm run tenant:add` de novo, com o mesmo slug e o token novo (é upsert) |
| "O bot não responde" | `/health`, depois o log procurando `mensagem para um número que não é de nenhuma barbearia cadastrada` |
| "O lembrete não chegou" | `/admin/<slug>/fila`. Se estiver cheia, o worker morreu. Se estiver vazia, é template ou flag desligada |

### O que monitorar

Três alarmes cobrem quase tudo:

1. **`/health` falhando** — o servidor caiu, ou o banco caiu junto.
2. **Fila da `outbox` crescendo** — o worker parou. Ninguém recebe lembrete, e
   nenhum erro aparece até o cliente reclamar de horário perdido.
3. **Erros 131026 / 132001 no log** — número inválido ou template reprovado, por
   barbearia. Um pico aqui é uma barbearia inteira parada.

Vale ver também a **qualidade de cada número** no WhatsApp Manager. Ela cai
quando o cliente denuncia ou bloqueia, e derruba o limite diário de mensagens —
é o indicador que avisa **antes** de o número ser restringido.
