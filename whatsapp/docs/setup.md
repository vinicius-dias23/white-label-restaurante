# Colocar o bot de WhatsApp no ar — passo a passo

Da criação da conta na Meta até o bot respondendo no seu celular.

**Leia isto antes de qualquer coisa:** não comece pelo número do restaurante.
A Meta dá um **número de teste grátis**, e com ele você monta e testa o bot
inteiro — menu, reserva, cancelamento, lembretes — sem gastar nada e sem
arriscar o atendimento que já funciona. Só depois de tudo rodando é que você
migra o seu número. As seções 1 a 9 usam o número de teste; a seção 10 trata do
seu.

Tempo: **1 a 2 horas** até o primeiro "oi" respondido.

> 📁 **Todos os comandos deste guia rodam de dentro de `whatsapp/`.** É o módulo
> da automação: `cd whatsapp` depois do `npm install` na raiz e siga daqui.
> Da raiz do repositório, o mesmo comando vira
> `npm run <script> -w @restaurante/whatsapp`.

---

## Índice

| | |
|---|---|
| [0. O que você vai montar](#0-o-que-você-vai-montar) | [8. Primeiro teste](#8-primeiro-teste-oi) |
| [1. Antes de começar](#1-antes-de-começar) | [9. Testar os lembretes](#9-testar-os-lembretes-sem-esperar-um-dia) |
| [2. Escolher o número](#2-escolher-o-número) | [10. Colocar o seu número](#10-colocar-o-seu-número-de-verdade) |
| [3. Conta na Meta, do zero](#3-conta-na-meta-do-zero) | [11. Quanto custa](#11-quanto-custa-de-verdade) |
| [4. Número de teste grátis](#4-número-de-teste-grátis) | [12. Verificação do negócio](#12-quando-você-vai-precisar-da-verificação) |
| [5. Rodar no seu computador](#5-rodar-no-seu-computador) | [13. Ir para produção](#13-ir-para-produção) |
| [6. O `.env`, variável por variável](#6-o-env-variável-por-variável) | [14. Diagnóstico](#14-diagnóstico) |
| [7. Ligar o webhook](#7-ligar-o-webhook) | [15. O que pode ter mudado](#15-o-que-pode-ter-mudado) |

---

## 0. O que você vai montar

```
Cliente no WhatsApp
        │
        ▼
   Meta (Cloud API)  ──── webhook ───▶  seu servidor  ──▶  PostgreSQL
        ▲                                    │              (reservas,
        └──────── resposta ──────────────────┘             conversas)
```

O cliente manda mensagem para o número do restaurante. A Meta entrega no seu
servidor, o bot decide o que responder e devolve pela mesma API. As reservas, a
lotação de cada ambiente e o estado da conversa ficam no seu banco — nada mora na Meta.

**O que o cliente vê:**

```
Menu ─┬─ Reservar mesa → pessoas → ambiente → dia → horário → confirmar
      ├─ Minhas reservas → remarcar / cancelar
      ├─ Cardápio
      ├─ Horário de funcionamento
      ├─ Endereço
      ├─ Formas de pagamento
      └─ Falar com atendente
```

Só botões. O bot não tenta interpretar texto livre — fora umas poucas palavras
(`menu`, `reservar`, `cardápio`, `sair`) e a frase que o botão do site já deixa
escrita, qualquer frase devolve o menu.

**O que você paga:** nada pela API em si (a Cloud API não tem mensalidade) e
nada por servidor enquanto testar no seu computador. As mensagens têm custo, e
esse custo **muda em 1º de outubro de 2026** — a seção 11 detalha.

---

## 1. Antes de começar

| Precisa | Como conferir | Se não tiver |
|---|---|---|
| **Conta no Facebook** | Você consegue entrar em facebook.com | Crie uma. A Meta exige — não existe caminho sem ela |
| **Node.js 22 ou maior** | `node -v` | [nodejs.org](https://nodejs.org) |
| **Docker** | `docker --version` | [docker.com](https://docker.com). Serve só para subir o Postgres; se você já tem um Postgres, pode pular |
| **Um celular com WhatsApp** | — | É onde você vai testar |

**Não precisa:** CNPJ, verificação do negócio, servidor, domínio ou cartão de
crédito para chegar até a seção 9.

Baixe o projeto e instale:

```bash
git clone <url-do-repositorio>
cd white-label-restaurante
npm install
```

---

## 2. Escolher o número

Esta é a decisão que mais dói se for tomada errado, então leia os três cenários
antes de mexer em qualquer coisa.

> ⚠️ **O aviso mais importante deste documento:** migrar um número para a Cloud
> API faz o aplicativo WhatsApp (comum ou Business) **parar de funcionar naquele
> aparelho**. As conversas somem do celular e todo o atendimento passa a ser
> pela API. Não dá para "testar e voltar" sem trabalho.

| Seu caso | O que acontece | Recomendação |
|---|---|---|
| **A. Chip novo, sem WhatsApp** | Caminho limpo. Migra direto, não perde nada. | ✅ O melhor cenário. Um chip pré-pago resolve |
| **B. Número no app WhatsApp Business, usado todo dia** | Migrar derruba o app e a equipe perde o aplicativo. Existe o modo **coexistência** (app + API no mesmo número), mas a disponibilidade por país ainda é irregular | ⚠️ Confira a coexistência no painel antes. Se não estiver disponível, pense duas vezes |
| **C. Número no WhatsApp comum (pessoal)** | Dá para migrar, mas você precisa **apagar a conta** no aplicativo antes, e perde o histórico daquele número | ⚠️ Só se você não usa esse número para conversar |

### Sobre a coexistência

A Meta lançou em maio de 2025 um modo em que o **aplicativo WhatsApp Business e
a Cloud API funcionam no mesmo número ao mesmo tempo**: a equipe continua
respondendo pelo celular e o bot roda em paralelo, com as mensagens sincronizadas
nos dois lados. Dá até para importar até 6 meses de histórico.

É a resposta ideal para o cenário **B** — quando está disponível. A liberação
vem acontecendo por país e por número, então **não conte com ela antes de ver a
opção no seu painel** (você vai chegar nessa tela na seção 10).

### O que fazer agora

Nada. Siga para a seção 3 e monte tudo com o **número de teste grátis**. A
decisão sobre o seu número fica para a seção 10, quando o bot já estiver
funcionando e você souber exatamente o que está ganhando.

---

## 3. Conta na Meta, do zero

São três coisas diferentes, e é normal se perder entre elas:

| O quê | Onde | Para quê |
|---|---|---|
| **Conta do Facebook** | facebook.com | Sua identidade. Tudo pendura nela |
| **Portfólio empresarial** | business.facebook.com | A "empresa" dentro da Meta |
| **Aplicativo de desenvolvedor** | developers.facebook.com | O que fala com a API |

### 3.1 Portfólio empresarial

1. Entre em [business.facebook.com](https://business.facebook.com) com sua conta
   do Facebook.
2. **Criar portfólio empresarial** (ou "Criar conta").
3. Preencha: nome do negócio (ex.: `Cantina Bella Nonna`), seu nome e um e-mail.

> Sem CNPJ? Sem problema por enquanto. O portfólio é criado assim mesmo. A
> verificação — que pede documento — só é necessária mais para a frente, e a
> seção 12 diz quando.

### 3.2 Aplicativo de desenvolvedor

1. Entre em [developers.facebook.com](https://developers.facebook.com) → **Meus
   aplicativos** → **Criar aplicativo**.
2. Caso de uso: **Outro** → tipo: **Empresa**.
3. Nome (ex.: `Restaurante Bot`) e vincule ao portfólio que você acabou de criar.
4. No painel do app, procure **WhatsApp** na lista de produtos → **Configurar**.

### 3.3 Guardar as duas primeiras variáveis

Vá em **Configurações do app → Básico**:

```dotenv
META_APP_ID=1234567890123456      # "ID do aplicativo"
META_APP_SECRET=abc123...          # "Chave secreta do aplicativo" → Mostrar
```

Anote num rascunho — você vai colar tudo no `.env` na seção 6.

> 🔒 A **chave secreta** é o que prova que o webhook veio mesmo da Meta. Quem
> tiver ela consegue forjar mensagens no seu servidor. Trate como senha.

---

## 4. Número de teste grátis

Ao ativar o WhatsApp no passo anterior, a Meta já criou um número de teste para
você. Em **WhatsApp → Configuração da API**:

### 4.1 O que copiar

| Campo na tela | Variável |
|---|---|
| **Identificação do número de telefone** | `TENANT_PHONE_NUMBER_ID` |
| **Identificação da conta do WhatsApp Business** | `TENANT_WABA_ID` |
| **Token de acesso temporário** | `TENANT_ACCESS_TOKEN` |

> ⚠️ **A pegadinha mais comum:** "Identificação do número de telefone" **não é o
> telefone**. É um número longo, tipo `123456789012345`. Se você colar o
> `+55 11 9...` ali, nada funciona.

### 4.2 Cadastre o seu celular

Ainda nessa tela, em **Para**, clique em **Gerenciar lista de números de
telefone** e adicione o seu celular. Ele vai receber um código por WhatsApp para
confirmar.

O número de teste só conversa com **até 5 números cadastrados aqui**. É o
suficiente para você, um sócio e alguns amigos testarem.

### 4.3 Sobre o token temporário

O token dessa tela **expira em 24 horas**. Para testar hoje, serve. Quando ele
vencer, o bot para de responder e o log mostra erro **190** — é só voltar aqui e
copiar um novo.

O token permanente fica para a seção 13, quando você for para produção.

---

## 5. Rodar no seu computador

### 5.1 Subir o banco

```bash
docker compose up -d
```

O `whatsapp/docker-compose.yml` já sobe um Postgres com usuário, senha e banco
batendo com o `DATABASE_URL` padrão do `.env.example` — não precisa configurar
nada.

### 5.2 Criar o `.env`

```bash
cp .env.example .env
```

Gere os três segredos que só você define:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY (criptografa os tokens no banco)
openssl rand -hex 32      # ADMIN_API_TOKEN    (senha das rotas /admin)
openssl rand -hex 32      # META_VERIFY_TOKEN  (senha do webhook)
```

Agora abra o `.env` e preencha. A seção 6 explica cada variável; para começar,
só estas seis importam:

```dotenv
META_APP_ID=              # da seção 3.3
META_APP_SECRET=          # da seção 3.3
META_VERIFY_TOKEN=        # o openssl rand -hex 32 que você acabou de gerar
APP_ENCRYPTION_KEY=       # o openssl rand -base64 32
ADMIN_API_TOKEN=          # o outro openssl rand -hex 32

TENANT_SLUG=cantina-bella-nonna
TENANT_PHONE_NUMBER_ID=   # da seção 4.1
TENANT_WABA_ID=           # da seção 4.1
TENANT_ACCESS_TOKEN=      # da seção 4.1
TENANT_OWNER_PHONE=       # seu celular, o mesmo que você cadastrou em 4.2
```

O `.env` **não vai para o git** — já está no `.gitignore`.

### 5.3 Criar as tabelas

```bash
npm run db:migrate
```

```
✔ 001_init.sql
✔ 1 migration(s) aplicada(s).
```

### 5.4 Cadastrar o restaurante

O bot lê cardápio, ambientes, equipe e horários de um arquivo por restaurante.

O projeto já vem com um de exemplo, `tenants/cantina-bella-nonna/`, com todos os
campos preenchidos. Renomeie a pasta para o slug do seu restaurante e edite o
conteúdo:

```bash
mv tenants/cantina-bella-nonna tenants/<seu-slug>
```

> 🔴 **O nome da pasta precisa ser idêntico ao `TENANT_SLUG` do `.env`.** Se um
> for `cantina-bella-nonna` e o outro `cantina_bella_nonna`, o comando abaixo
> avisa `⚠ não cadastrado` e segue em frente — o restaurante simplesmente não
> entra no banco, e o bot não responde nada depois.

> 💡 **Vai renomear depois?** Se você já sincronizou com um nome e quiser trocar,
> renomeie a pasta **e** o `TENANT_SLUG` juntos. Trocar só um deixa dois
> restaurantes disputando o mesmo número, e o comando recusa dizendo qual já está
> com ele.

Edite o arquivo com os dados reais: nome, cardápio, ambientes com a lotação de
cada um, equipe e horário de funcionamento (almoço e jantar). O
[`README.md`](../README.md) do módulo explica os campos das reservas e do
atendimento; os campos visuais estão no
[`site/README.md`](../../site/README.md).

```bash
npm run tenant:sync
```

```
✔ cantina-bella-nonna — Cantina Bella Nonna
   número (phone_number_id): 123456789012345
   fuso: America/Sao_Paulo
```

Campo com valor que o sistema não entendeu — uma lotação escrita como texto, um
horário fora do formato `"HH:MM"`, uma chave de texto que não existe — aparece
aqui como aviso, com o nome do campo. O valor inválido volta ao padrão; o resto
do config entra normalmente.

### 5.5 Subir o servidor

```bash
npm run dev
```

```
[info] servidor no ar {"porta":3333,"webhook":"http://localhost:3333/webhook","ambiente":"development"}
[info] worker no ar {"intervalo":"30s","id":"5234-a022f129"}
```

Em outro terminal:

```bash
curl localhost:3333/health
# {"ok":true,"servico":"restaurante-whatsapp"}
```

> Esse `/health` consulta o banco de verdade. Se ele responder, servidor e
> Postgres estão conversando.

---

## 6. O `.env`, variável por variável

Tudo está explicado também dentro do próprio `.env.example`. Aqui está a
referência completa, em tabela.

**Legenda:** 🔴 obrigatória · 🟡 mexa se precisar · ⚪ deixe como está

### 6.1 Servidor

| Variável | Padrão | | O que faz |
|---|---|---|---|
| `NODE_ENV` | `development` | 🟡 | `production` no servidor de verdade. Em produção o servidor recusa subir com configuração insegura |
| `PORT` | `3333` | ⚪ | Porta em que a API escuta |
| `PUBLIC_URL` | — | 🟡 | Endereço HTTPS público. Obrigatória só quando `NODE_ENV=production`. No teste, é a URL do túnel |
| `LOG_LEVEL` | `info` | 🟡 | `debug` mostra o payload das mensagens — útil quando algo não bate |

### 6.2 Banco de dados

| Variável | Padrão | | O que faz |
|---|---|---|---|
| `DATABASE_URL` | `postgres://restaurante:restaurante@localhost:5432/restaurante` | 🔴 | Conexão. O padrão já bate com o `docker compose` do projeto |
| `DATABASE_SSL` | `false` | 🟡 | `true` na maioria dos bancos gerenciados (Neon, Supabase, Railway, RDS) |
| `DATABASE_POOL_MAX` | `10` | ⚪ | Conexões simultâneas. Aguenta vários restaurantes |
| `DATABASE_URL_TEST` | vazia | ⚪ | Banco dos testes de integração. Vazia = esses testes são pulados |

### 6.3 Aplicativo da Meta

Um aplicativo atende **todos** os seus restaurantes. O que muda de um para outro
é o número, que fica no banco.

| Variável | Onde achar | | O que faz |
|---|---|---|---|
| `META_APP_ID` | App → Configurações → Básico | 🔴 | Identifica o aplicativo |
| `META_APP_SECRET` | App → Configurações → Básico → Mostrar | 🔴 | Confere a assinatura do webhook. **Errada = nenhuma mensagem entra** (log: `assinatura inválida`) |
| `META_VERIFY_TOKEN` | você inventa | 🔴 | Senha do webhook. Precisa ser **idêntica** aqui e no painel da Meta |
| `META_GRAPH_VERSION` | `v21.0` | ⚪ | Versão da API. Suba de propósito, testando |
| `META_API_BASE_URL` | `https://graph.facebook.com` | ⚪ | Só mude para apontar para um simulador |
| `META_TIMEOUT_MS` | `15000` | ⚪ | Tempo limite de cada chamada à Meta |

### 6.4 Segurança

| Variável | Como gerar | | O que faz |
|---|---|---|---|
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` | 🔴 | Criptografa os tokens da Meta no banco. **Perdeu ou trocou = todos os restaurantes precisam ser cadastrados de novo.** Guarde junto do backup |
| `ADMIN_API_TOKEN` | `openssl rand -hex 32` | 🔴 | Senha das rotas `/admin/*`, enviada como `Authorization: Bearer ...` |

### 6.5 Padrões regionais

| Variável | Padrão | | O que faz |
|---|---|---|---|
| `DEFAULT_TIMEZONE` | `America/Sao_Paulo` | 🟡 | Fuso das reservas e dos lembretes |
| `DEFAULT_LOCALE` | `pt_BR` | ⚪ | Idioma dos templates. **Precisa bater exatamente com o cadastrado na Meta**, senão dá erro 132001 |
| `DEFAULT_COUNTRY_CODE` | `55` | ⚪ | DDI acrescentado a números escritos sem código do país |

### 6.6 Worker das mensagens programadas

É ele que envia confirmações e lembretes. **Sem worker rodando, o bot conversa
normalmente mas nenhum lembrete sai.**

| Variável | Padrão | | O que faz |
|---|---|---|---|
| `WORKER_ENABLED` | `true` | 🟡 | Liga o worker |
| `WORKER_IN_PROCESS` | `true` | 🟡 | `true` = worker junto da API (um processo só, mais barato). `false` = processo separado, iniciado com `npm run worker` |
| `WORKER_INTERVAL_MS` | `30000` | ⚪ | De quanto em quanto tempo procura mensagens vencidas |
| `WORKER_BATCH_SIZE` | `20` | ⚪ | Quantas envia por rodada |
| `OUTBOX_MAX_ATTEMPTS` | `5` | ⚪ | Tentativas antes de desistir. Erros definitivos não são retentados de qualquer forma |
| `DAILY_JOBS_AT` | `09:00` | 🟡 | Hora das rotinas diárias (fechar as reservas que passaram, expirar pedidos sem resposta, pós-visita, reativação, aniversário) |

### 6.7 Liga e desliga das mensagens

Trava **geral** do servidor. Cada restaurante ainda pode desligar a dele em
`whatsapp.messages` no `restaurante.config.json`. **Uma mensagem só sai se estiver
ligada nos dois lugares.**

| Variável | Padrão | O que é |
|---|---|---|
| `FEATURE_LEMBRETE_24H` | `true` | Lembrete da véspera, com botões Confirmo/Cancelar. **Precisa de template aprovado** |
| `FEATURE_LEMBRETE_2H` | `true` | Lembrete 2h antes. **Precisa de template aprovado** |
| `FEATURE_POS_ATENDIMENTO` | `false` | Pós-visita: agradecimento + avaliação no dia seguinte |
| `FEATURE_REATIVACAO` | `false` | Convite para quem sumiu. **Marketing** — exige opt-in |
| `FEATURE_ANIVERSARIO` | `false` | Parabéns no dia. **Marketing** |

As três de baixo estão implementadas e desligadas de propósito. Ligue uma de
cada vez, depois que o template estiver aprovado.

### 6.8 Nomes dos templates

Precisam bater **letra por letra** com o cadastrado no WhatsApp Manager.

| Variável | Padrão |
|---|---|
| `TEMPLATE_LEMBRETE_24H` | `lembrete_24h` |
| `TEMPLATE_LEMBRETE_2H` | `lembrete_2h` |
| `TEMPLATE_POS_ATENDIMENTO` | `pos_atendimento` |
| `TEMPLATE_REATIVACAO` | `reativacao_cliente` |
| `TEMPLATE_ANIVERSARIO` | `aniversario_cliente` |

### 6.9 Comportamento da conversa

| Variável | Padrão | | O que faz |
|---|---|---|---|
| `HANDOFF_MINUTES` | `30` | 🟡 | Quanto tempo o bot fica calado depois que o cliente pede um atendente |
| `SESSION_TIMEOUT_MIN` | `20` | 🟡 | Cliente que some no meio da reserva e volta depois disso recomeça do menu |
| `QUIET_HOURS_START` | `21:00` | 🟡 | Início do silêncio noturno |
| `QUIET_HOURS_END` | `08:00` | 🟡 | Fim. Nada programado sai nessa faixa |
| `RATE_LIMIT_PER_CONTACT_PER_MIN` | `40` | ⚪ | Freio contra enxurrada. Uma reserva leva ~7 toques; não desça muito |
| `MESSAGE_RETENTION_DAYS` | `180` | 🟡 | Dias até apagar o conteúdo das mensagens (LGPD). `0` = nunca apagar |

### 6.10 O primeiro restaurante

| Variável | | O que faz |
|---|---|---|
| `TENANT_SLUG` | 🔴 | **Precisa ser igual ao nome da pasta** em `tenants/` |
| `TENANT_PHONE_NUMBER_ID` | 🔴 | O ID longo da seção 4.1 — não é o telefone |
| `TENANT_WABA_ID` | 🟡 | Usado para conferir os templates |
| `TENANT_ACCESS_TOKEN` | 🔴 | Token da Meta. Vai criptografado para o banco |
| `TENANT_OWNER_PHONE` | 🟡 | Seu WhatsApp. Recebe os avisos, os pedidos de grupo grande e o painel do dono. Qualquer formato serve |
| `TENANT_TIMEZONE` | ⚪ | Vazia = usa o `DEFAULT_TIMEZONE` |

Do segundo restaurante em diante, use `npm run tenant:add` — o `.env` continua
enxuto e as credenciais vão criptografadas para o banco.

---

## 7. Ligar o webhook

A Meta precisa alcançar o seu servidor por **HTTPS**. Ela não aceita `http://`
nem endereço de IP. O túnel resolve isso de graça.

### 7.1 Abrir o túnel

Num terminal novo (deixe o servidor rodando no outro):

```bash
npx cloudflared tunnel --url http://localhost:3333
```

Vai aparecer algo como:

```
https://algo-aleatorio-qualquer.trycloudflare.com
```

Copie essa URL e coloque no `.env`:

```dotenv
PUBLIC_URL=https://algo-aleatorio-qualquer.trycloudflare.com
```

> ⚠️ A URL do túnel gratuito **muda toda vez que você reinicia o `cloudflared`**.
> Quando isso acontecer, atualize também no painel da Meta (passo 7.2). Se o bot
> parar de responder do nada, essa é a primeira coisa a conferir.

### 7.2 Cadastrar na Meta

Em **WhatsApp → Configuração → Webhook → Editar**:

| Campo | Valor |
|---|---|
| URL de retorno de chamada | `https://sua-url-do-tunel/webhook` |
| Verificar token | exatamente o valor de `META_VERIFY_TOKEN` |

Clique em **Verificar e salvar**. No log do servidor:

```
[info] webhook verificado pela Meta
```

Deu errado?

```
[warn] verificação do webhook recusada — META_VERIFY_TOKEN não confere
```

O token que você digitou no painel está diferente do `.env`. Copie e cole, não
digite.

### 7.3 O passo que todo mundo esquece

Logo abaixo, em **Campos do webhook**, clique em **Gerenciar** e assine o campo
**`messages`**.

> 🔴 **Sem isso o webhook fica verificado e nunca recebe nada.** É o erro de
> configuração mais comum, e o sintoma é o pior possível: nenhum log, nenhum
> erro, só silêncio.

---

## 8. Primeiro teste ("oi")

Mande **"oi"** do seu celular (aquele que você cadastrou em 4.2) para o número
de teste da Meta.

O menu deve chegar em segundos:

```
Olá! Aqui é a Cantina Bella Nonna 🍝
Como posso ajudar?

[ Ver opções ]
```

Toque em **Ver opções → Reservar mesa** e vá até o fim: escolha quantas
pessoas, o ambiente, o dia e o horário, e confirme. Você deve receber a
confirmação.

> Com o seu número como `TENANT_OWNER_PHONE`, quem escreve é o **dono**, e o que
> chega é o painel do dono, não o menu do cliente. Para testar como cliente,
> use outro número da lista de teste — ou o `npm run bot:sim -- --from=...`,
> que não passa pela Meta. E para ver o pedido de aprovação chegar ao dono,
> reserve para um grupo maior que `booking.approvalAbovePartySize` (8 no
> exemplo).

Confira que a reserva entrou de verdade:

```bash
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  localhost:3333/admin/cantina-bella-nonna/reservas
```

### Não chegou nada?

Olhe o log do servidor **nesta ordem**:

| O log mostra | Significa | O que fazer |
|---|---|---|
| **nada, silêncio total** | A Meta não está chamando você | O campo `messages` não foi assinado (7.3). Ou o túnel caiu / mudou de URL |
| `webhook com assinatura inválida foi recusado` | A chamada chegou, mas não bate | `META_APP_SECRET` errado no `.env` |
| `mensagem para um número que não é de nenhum restaurante cadastrado` | Chegou e foi validada, mas o número não é conhecido | `TENANT_PHONE_NUMBER_ID` errado, ou faltou rodar `npm run tenant:sync` |
| `falha ao responder o cliente` com **190** | Token expirado | O token da seção 4.1 dura 24h. Pegue um novo |
| `falha ao responder o cliente` com **131047** | Passou de 24h desde a sua última mensagem | Mande "oi" de novo do celular |
| `falha ao responder o cliente` com **131030** | Número não está na lista de teste | Cadastre em 4.2 |

Teste também um envio solto:

```bash
npm run wa:send -- --to="(11) 91234-5678" --text="teste"
```

---

## 9. Testar os lembretes sem esperar um dia

A confirmação já funciona (é texto livre, dentro da janela de 24h). Os lembretes
**precisam de template aprovado pela Meta**.

### 9.1 Cadastrar os templates

Abra [`templates.md`](templates.md) — ele traz o texto pronto
de cada um, com as variáveis na ordem certa. Cadastre em **WhatsApp Manager →
Modelos de mensagem → Criar modelo**.

Comece por **`lembrete_24h`** e **`lembrete_2h`**, que são os ligados por padrão.
A aprovação costuma sair em minutos.

### 9.2 Conferir

```bash
npm run templates:check
```

```
━━ Cantina Bella Nonna (cantina-bella-nonna)
   ✔ lembrete_24h            APPROVED     lembrete de 24h (ligado)
   ⏳ lembrete_2h             PENDING      lembrete de 2h (ligado)
   · pos_atendimento         NÃO EXISTE   pós-atendimento (desligado)
```

Se um template ligado não estiver `APPROVED`, o comando avisa em destaque — essas
mensagens vão falhar.

### 9.3 Adiantar o relógio

Reserve uma mesa pelo bot para **daqui a três dias**. O lembrete de 24h fica na
fila esperando a véspera. Em vez de esperar:

```bash
npm run outbox:run -- --now=2026-08-23T14:00
```

Use uma data que já passe do momento do lembrete. A mensagem sai na hora, no seu
celular.

Para ver o que está na fila:

```bash
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  localhost:3333/admin/cantina-bella-nonna/fila
# {"fila":{"pending":2,"sent":1}}
```

> 💡 **Como testar sem gastar:** enquanto você estiver com o número de teste, as
> mensagens não são cobradas. Aproveite para exercitar tudo — inclusive as
> mensagens desligadas, ligando uma de cada vez no `.env`.

---

## 10. Colocar o seu número de verdade

Só chegue aqui depois de o bot funcionar com o número de teste. Agora você sabe
exatamente o que está ganhando — e o que perde.

### 10.1 Se o número está no app WhatsApp Business (cenário B)

**Antes de qualquer coisa, procure a coexistência.** Em **WhatsApp →
Configuração da API → Adicionar número**, veja se aparece a opção de conectar um
número que já está no aplicativo WhatsApp Business (pode aparecer como
"coexistência", "conectar app existente" ou similar).

- **Apareceu:** siga por ela. A equipe continua respondendo pelo celular, o bot
  roda junto, e você pode importar o histórico recente. É o melhor dos mundos.
- **Não apareceu:** a coexistência ainda não chegou para o seu número. Você tem
  duas opções honestas: usar um chip novo para o bot (recomendado) ou migrar e
  aceitar que o aplicativo para de funcionar.

### 10.2 Se o número está no WhatsApp comum (cenário C)

No celular, abra o WhatsApp → **Configurações → Conta → Apagar minha conta**.
Confirme com o número. Só depois disso a Meta aceita registrá-lo na API.

> Isso apaga suas conversas daquele número. Faça backup antes se quiser guardá-las.

### 10.3 Registrar o número

Em **WhatsApp → Configuração da API → Adicionar número de telefone**:

1. Nome de exibição: **o nome real do restaurante**. Nome genérico
   ("Reservas", "Atendimento") costuma ser recusado.
2. Categoria e descrição curta.
3. Confirme o número por **SMS** ou **ligação**.

### 10.4 Trocar no `.env`

O número novo tem um `phone_number_id` próprio:

```dotenv
TENANT_PHONE_NUMBER_ID=<o novo>
```

```bash
npm run tenant:sync
```

Mande "oi" do celular. Agora é o número do restaurante respondendo.

---

## 11. Quanto custa de verdade

A Cloud API **não tem mensalidade**. Você paga por mensagem, e o preço depende
da categoria e do país.

### Hoje (até 30 de setembro de 2026)

| Tipo | Quando acontece | Custo |
|---|---|---|
| **Serviço** (texto livre dentro da janela de 24h) | Todo o menu do bot: cliente manda algo, bot responde | **Grátis** |
| **Utilidade dentro da janela** | Confirmação logo após o cliente reservar | **Grátis** |
| **Utilidade fora da janela** | Lembretes de 24h e 2h | Centavos por mensagem |
| **Marketing** | Reativação, aniversário | Mais caro |

### A partir de 1º de outubro de 2026

> 🔴 **Isto muda a conta.** A Meta passa a cobrar as **mensagens de serviço** e os
> **templates de utilidade dentro da janela**, que hoje são gratuitos. O preço
> por mensagem de serviço será o mesmo dos templates de utilidade em cada país. A
> Meta publica as tabelas até 1º de setembro de 2026.

O que isso significa para o bot:

- **Antes:** um cliente percorrendo o menu inteiro (8 respostas do bot) custava
  zero; só os dois lembretes eram cobrados.
- **Depois:** cada uma dessas 8 respostas passa a ser cobrada.

Duas consequências práticas no desenho deste bot, que continuam valendo:

1. **Menus curtos economizam dinheiro.** Cada toque a menos é uma mensagem a
   menos. É mais um motivo para o fluxo ter 7 passos e não 15.
2. **A janela de 24h continua existindo** — ela não muda, só deixa de ser
   gratuita. Fora dela, você ainda precisa de template.

**Exceção que vale conhecer:** conversas que começam por um **anúncio
clique-para-WhatsApp** ou pelo botão de uma página no Facebook mantêm uma janela
gratuita de 72 horas. Se o restaurante anuncia, vale usar esse caminho.

### Estimativa

Um restaurante com **200 reservas por mês**, cada cliente trocando ~10
mensagens com o bot, com confirmação e dois lembretes:

- Hoje: só os 400 lembretes são cobrados.
- Depois de outubro: ~2.400 mensagens cobradas.

Como as tabelas do Brasil ainda não estão publicadas para as mensagens de
serviço, não dá para fechar o valor aqui com honestidade. **Confira em WhatsApp
Manager → Insights**, que mostra o preço em reais e o seu gasto real.

---

## 12. Quando você vai precisar da verificação

**Boa notícia: não precisa agora.** Uma conta nova, sem verificação nenhuma,
já envia para **250 destinatários únicos a cada 24 horas**.

Importante entender o que conta para esse limite: são as conversas que **você
inicia** (os lembretes). **Responder cliente não conta** — isso é ilimitado. Um
restaurante dificilmente encosta em 250 lembretes por dia.

| Nível | Destinatários novos / 24h | Precisa de |
|---|---|---|
| Inicial | 250 | nada |
| Seguinte | 1.000 | verificação do negócio |
| Depois | 10.000 → 100.000 → ilimitado | verificação + histórico de qualidade |

### Quando a hora chegar

A verificação fica em **Meta Business → Configurações → Centro de Segurança →
Verificação do negócio**, e pede **CNPJ, comprovante de endereço e contrato
social**. A análise leva de 1 a 5 dias úteis.

Como hoje você tem só CPF, o caminho é: **opere no limite de 250/dia**, e quando
o volume pedir (ou quando quiser o selo de conta oficial), abra o CNPJ e faça a
verificação.

---

## 13. Ir para produção

O túnel é ótimo para testar e ruim para produção: a URL muda e o processo morre
junto com o seu terminal.

### 13.1 Token permanente

O token de 24h não serve. Crie um de usuário do sistema:

1. **Meta Business → Configurações do negócio → Usuários → Usuários do sistema**
2. **Adicionar** → nome (ex.: `bot-restaurante`) → função **Administrador**
3. **Adicionar ativos** → seu aplicativo → **Controle total**
4. **Gerar novo token** → escolha o aplicativo → marque:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. **Sem expiração** → copie

```bash
npm run tenant:add -- --slug=cantina-bella-nonna \
  --phone-number-id=... --waba-id=... --token=EAAG... --owner="(11) 91234-5678"
```

### 13.2 O mínimo do servidor

| Item | Por quê |
|---|---|
| **HTTPS estável** | Render e Railway dão domínio com certificado. Numa VPS, Nginx + Let's Encrypt |
| `NODE_ENV=production` | Ativa as checagens de configuração insegura |
| `PUBLIC_URL` definitivo | E atualizar o webhook no painel da Meta |
| **Backup do banco** | É onde moram as reservas |

```bash
pg_dump "$DATABASE_URL" | gzip > backup-$(date +%F).sql.gz
```

> ⚠️ Guarde a `APP_ENCRYPTION_KEY` junto do backup. Sem ela, os tokens salvos
> viram lixo.

### 13.3 Manutenção do dia a dia

```bash
npm run tenant:sync       # depois de mudar cardápio, ambiente, horário ou equipe
npm run tenant:list       # o que está cadastrado
npm run templates:check   # situação dos templates
```

E lembre: o dono não precisa de sistema nenhum. Ele manda qualquer coisa para o
número do restaurante e recebe o painel do dono — pedidos de grupo grande,
reservas do dia, relatório, fechar agenda, pausar o bot. A recepção, com o
telefone em `team[].phone`, recebe o painel dela para marcar quem chegou.

---

## 14. Diagnóstico

### Erros da Meta que aparecem de verdade

| Código | Significa | Como sair |
|---|---|---|
| **190** | Token expirado ou inválido | Você está usando o token de 24h. Pegue um novo, ou crie o permanente (13.1) |
| **131047** | Passou de 24h desde a última mensagem do cliente | Não é bug: a Meta exige template fora da janela. Se for uma resposta do bot, o cliente precisa escrever de novo |
| **131030** | Destinatário não está na lista de teste | Cadastre o número em 4.2 (só vale para o número de teste) |
| **132000** | Número de variáveis do template não bate | O template cadastrado tem quantidade diferente de `{{1}}`, `{{2}}`... Confira em `docs/templates.md` |
| **132001** | Template não existe nesse idioma | O nome ou o idioma no `.env` não bate com o cadastrado. Rode `npm run templates:check` |
| **133010** | Número não registrado | O número ainda não terminou o cadastro na Cloud API |
| **100** | Parâmetro inválido | Quase sempre `TENANT_PHONE_NUMBER_ID` errado — conferiu se não colou o telefone no lugar do ID? |

### Sintomas sem erro

| Sintoma | Causa provável |
|---|---|
| Bot mudo, log sem nada | Campo `messages` não assinado (7.3), ou túnel com URL nova |
| Bot responde, lembrete não chega | Worker desligado (`WORKER_ENABLED`), ou template não aprovado, ou mensagem desligada nos dois lugares (6.7) |
| `tenant:sync` diz `⚠ não cadastrado` | `TENANT_SLUG` diferente do nome da pasta em `tenants/` |
| `tenant:sync` diz que o número já está em outro restaurante | Você renomeou o slug sem renomear a pasta (ou sobrou a `cantina-bella-nonna` que vem no projeto). A mensagem diz qual restaurante está com o número |
| Ambiente faltando na reserva | Está com `"bookable": false`, sem `name`, ou o grupo é maior que o `capacity` dele — o bot só lista os ambientes em que o grupo cabe |
| "Sem horário" com o restaurante vazio | `lastSeatingMin` ou `durationMin` maiores que a faixa do dia, `leadTimeMin` alto demais, ou um "Fechar agenda" esquecido (`time_blocks`) |
| Horários estranhos | `DEFAULT_TIMEZONE` ou `TENANT_TIMEZONE` errado |

### Comandos de socorro

```bash
curl localhost:3333/health                       # servidor e banco estão de pé?
npm run tenant:list                              # o restaurante está cadastrado?
npm run templates:check                          # os templates estão aprovados?
LOG_LEVEL=debug npm run dev               # ver o payload de cada mensagem
```

---

## 15. O que pode ter mudado

A Meta muda regras e preços com frequência. As informações voláteis deste guia
foram conferidas em **agosto de 2026** — se você está lendo bem depois disso,
vale reconferir estas três:

| Assunto | O que este guia afirma | Confira em |
|---|---|---|
| **Cobrança de mensagens de serviço a partir de 1/out/2026** | Serviço e utilidade dentro da janela deixam de ser grátis | WhatsApp Manager → Insights, e o anúncio oficial da Meta |
| **250 destinatários/24h sem verificação** | Dá para operar sem CNPJ | WhatsApp Manager → o painel mostra o seu limite atual |
| **Coexistência (app + API no mesmo número)** | Existe desde maio/2025, liberação irregular por país | A própria tela de **Adicionar número** no painel |

Os passos de painel (nomes de menus e botões) mudam de lugar sem aviso. Se um
nome não bater, procure pelo conceito — "adicionar número", "webhook", "usuário
do sistema" — que a função continua lá.

**Fontes consultadas em agosto/2026:**

- [WhatsApp API Pricing 2026: Free 24-Hour Window Ends in October](https://blog.peppercloud.com/whatsapp-api-pricing-everything-you-need-to-know/)
- [WhatsApp Business API Pricing Is Changing on October 1, 2026](https://turbodev.ai/blog/whatsapp-business-api-pricing-change-october-2026)
- [WhatsApp Service vs Utility Messages: What Gets Charged After October 1, 2026](https://www.unifyport.ai/blog/whatsapp-service-vs-utility-messages-october-2026/)
- [Can You Use the WhatsApp API Without Meta Business Verification? (2026)](https://blueticks.co/blog/whatsapp-api-without-meta-verification)
- [WhatsApp Business Message Limits 2026](https://www.uptail.ai/blog/how-many-messages-can-you-send-on-whatsapp-business-limits-explained-for-2026)
- [WhatsApp Coexistence: App + API on One Number (2026)](https://whautomate.com/whatsapp-coexistence)
- [What is WhatsApp Business App Coexistence?](https://www.ycloud.com/blog/whatsapp-business-app-coexistence-meta-update)

A documentação oficial da Meta fica em
[developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)
— é sempre a palavra final.
