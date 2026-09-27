# Módulo 2 — WhatsApp (automação do atendimento)

Atendimento oficial pela **WhatsApp Business Platform (Cloud API)**, só com
botões fixos, **sem nenhuma IA**. O cliente reserva a mesa sozinho, escolhe o
ambiente e recebe lembretes; o dono aprova grupos grandes e acompanha tudo pelo
próprio WhatsApp; a recepção marca quem chegou e quem faltou.

**Stack:** Node + Fastify + PostgreSQL + WhatsApp Cloud API.

```bash
npm install            # na raiz do repositório, uma vez

cd whatsapp
cp .env.example .env   # os segredos do servidor
docker compose up -d   # Postgres local
npm run db:migrate     # cria as tabelas
npm run tenant:sync    # carrega o config dos restaurantes
npm run dev            # API + worker das mensagens programadas
```

Da raiz do repositório: `npm run <script> -w @restaurante/whatsapp`.

> **Começando do zero?** [`docs/setup.md`](docs/setup.md) leva da criação da
> conta na Meta até o bot respondendo no seu celular, em 1 a 2 horas, usando o
> número de teste gratuito. Os textos dos templates estão em
> [`docs/templates.md`](docs/templates.md), prontos para colar no WhatsApp
> Manager.

---

## Como o atendimento funciona

Texto livre não é interpretado — o bot responde com o menu. É mais previsível
que qualquer modelo, não erra preço, não inventa mesa e dá para testar inteiro.

```
Menu ─┬─ Reservar mesa → pessoas → ambiente → dia → horário → confirmar
      ├─ Minhas reservas → remarcar / cancelar
      ├─ Cardápio                  (destaques com preço + link do completo)
      ├─ Horário de funcionamento  (calcula "aberto agora")
      ├─ Endereço                  (endereço + rota)
      ├─ Formas de pagamento
      └─ Falar com atendente       (cala o bot e avisa o dono)
```

O que o bot **reconhece** quando o cliente digita, em vez de tocar:

| Digitado | O que acontece |
|---|---|
| `menu`, `oi`, `olá`, `bom dia`, `voltar`… | abre o menu |
| `reservar`, `reserva`, `mesa` | começa a reserva |
| `cardápio`, `pratos` | mostra o cardápio |
| `sair`, `parar` | opt-out: corta toda mensagem programada (LGPD) |
| a frase do site: *"Gostaria de reservar…"* | começa a reserva; com *"…uma mesa na Varanda"*, já com a Varanda escolhida |
| um número, na tela "9 ou mais" | o tamanho do grupo |

Qualquer outra coisa recebe "Não entendi" e o menu de novo.

### A reserva, passo a passo

1. **Quantas pessoas?** Lista de 1 a 8 e uma linha "9 ou mais", que pede para
   digitar o número. Aceita até `booking.maxPartySize`. Acima disso — ou um
   grupo maior do que qualquer ambiente comporta — o bot não tenta encaixar:
   oferece **falar com um atendente**, porque grupo desse tamanho é evento, não
   reserva.
2. **Qual ambiente?** "Tanto faz" e os ambientes em que o grupo cabe. Quando só
   um serve, a pergunta nem aparece.
3. **Qual dia?** Só os dias que ainda têm lugar para o grupo — o cliente nunca
   escolhe um dia para descobrir depois que está lotado.
4. **Qual horário?** Separados em *Almoço* e *Jantar*.
5. **Confirmar** → **Reservado**, com o resumo e o endereço.

**Remarcar** é uma reserva nova do começo: a antiga só é cancelada depois que a
nova é confirmada. Se o cliente desistir no meio, ele continua com a mesa que
já tinha.

### Lotação: por que ninguém fica sem mesa

A unidade da lotação é o **ambiente** (`areas[]` no config). Cada um aceita até
`capacity` **pessoas** ao mesmo tempo — pessoas, não mesas. Uma reserva ocupa os
lugares do grupo do horário marcado até `booking.durationMin` depois; aí os
lugares voltam.

Um horário só é oferecido se, **durante todo o tempo da mesa**, o pico de
ocupação do ambiente mais o grupo novo couber no `capacity`. Não basta olhar o
minuto da chegada: um grupo de 6 às 20:00 no Salão de 40 precisa que haja 6
lugares livres às 20:00, às 20:30, às 21:00 e às 21:30.

A garantia final é do banco. O `createReservation` abre uma transação, **trava a
linha do ambiente** (`SELECT … FOR UPDATE`), soma de novo quem já está lá e só
então insere. Dois clientes confirmando o último lugar no mesmo segundo: um
entra, o outro volta para a lista de horários com o aviso de que acabou de
lotar. Não existe *overbooking* por corrida.

"Tanto faz" escolhe o **primeiro ambiente, na ordem do config, que tiver lugar**.
Ponha primeiro o ambiente que você prefere encher.

### Grupos grandes: o dono aprova

Com `booking.approvalAbovePartySize` acima de zero, um grupo **maior** que esse
número não confirma sozinho:

1. A reserva é criada como `pending` — e **já segura os lugares**, para ninguém
   ocupar a mesa enquanto o dono decide.
2. O cliente vê "Pedido enviado".
3. O dono recebe uma mensagem com os botões **Aprovar** e **Recusar**.
4. *Aprovar* agenda os lembretes e avisa o cliente. *Recusar* devolve os
   lugares e avisa o cliente, já com as opções de reservar outro horário ou
   falar com alguém.

Pedido que passou do horário sem resposta é **expirado como recusado** pela
rotina diária.

> ⚠️ O aviso ao dono é texto livre, então só chega se o dono tiver mandado
> alguma mensagem para o bot nas últimas 24h (a regra da janela, abaixo). Por
> isso a lista nunca depende do aviso: enquanto houver pedido esperando, o
> **"⏳ Pedidos (N)"** é a primeira linha do menu do dono.

`0` desliga a aprovação: tudo confirma na hora.

### O painel do dono

O dono manda qualquer coisa para o próprio número do restaurante e recebe o
menu dele:

| Opção | O que faz |
|---|---|
| **⏳ Pedidos (N)** | só aparece quando há grupo grande esperando: aprovar ou recusar |
| **Reservas de hoje / de amanhã** | a lista, com pessoas, ambiente e status |
| **Próximos 7 dias** | reservas e pessoas por dia |
| **Marcar chegadas** | abre o painel da recepção — em restaurante pequeno, quem recebe na porta é o dono |
| **Relatório** | hoje, ontem, últimos 7 dias e o mês: reservas, pessoas, quantos compareceram e quantos faltaram |
| **Fechar agenda** | hoje ou amanhã — almoço, jantar ou o dia todo, para o restaurante inteiro. As reservas que já existiam **continuam valendo**, e o bot diz quantas são para o dono avisar cada cliente |
| **Pausar / Religar o bot** | cala o atendimento automático por `owner.pauseMinutes` |

Ele também recebe um aviso a cada reserva nova, cancelamento e pedido de
atendente — com a mesma ressalva da janela de 24h.

### Mensagens programadas

A confirmação da reserva **não** entra nesta lista: ela é a própria resposta ao
toque em "Confirmar", sai na hora com todos os detalhes e não passa pela fila.

| Mensagem | Quando | Padrão |
|---|---|---|
| Lembrete de 24h | véspera, com botões Confirmo/Cancelar | ✅ ligada |
| Lembrete de 2h | 2h antes | ✅ ligada |
| Pós-visita | dia seguinte à visita, com botão de avaliação | ⚙️ desligada |
| Reativação | quem sumiu há N dias | ⚙️ desligada |
| Aniversário | no dia | ⚙️ desligada |

As três últimas estão implementadas e testadas; ligar é decisão de negócio, e
depende do template estar aprovado na Meta. As duas últimas são de **marketing**:
só vão para quem deu opt-in, e é por isso que nascem desligadas.

Reserva pendente não recebe lembrete: os lembretes só entram na fila quando o
dono aprova.

### Os status de uma reserva

| Status | Quando |
|---|---|
| `pending` | grupo grande esperando o dono — já ocupa os lugares |
| `scheduled` | confirmada pelo sistema |
| `confirmed` | o cliente tocou em "Confirmo" no lembrete de 24h |
| `arrived` | a recepção marcou que o grupo chegou |
| `completed` | já passou (a rotina diária carimba) |
| `no_show` | a recepção marcou que o grupo não veio |
| `cancelled` | o cliente ou o dono cancelou |
| `declined` | o dono recusou o pedido, ou ele expirou sem resposta |

Ocupam lugar: `pending`, `scheduled`, `confirmed` e `arrived`.

### Duas regras da Cloud API que explicam quase todo o desenho

1. **Janela de 24 horas.** Texto livre só nas 24h seguintes à última mensagem do
   cliente. Depois disso, só template aprovado. Por isso a confirmação é texto
   (é resposta imediata ao cliente, então nem precisa de template) e todo
   lembrete é template.

   > ⚠️ Até 30/09/2026 as mensagens dentro dessa janela são gratuitas. A partir
   > de **1º de outubro de 2026** a Meta passa a cobrá-las. A janela continua
   > existindo — só deixa de ser de graça. Detalhes em
   > [`docs/setup.md`](docs/setup.md#11-quanto-custa-de-verdade).
2. **O webhook é público.** Qualquer um pode chamar a URL. A assinatura
   `X-Hub-Signature-256` é a única prova de que a chamada veio da Meta — sem
   conferi-la, qualquer pessoa reservaria e cancelaria mesas alheias.

---

## Configuração do restaurante

O bot lê a mesma configuração do site: nome, contato, cardápio, ambientes,
equipe e horários saem do `restaurante.config.json`. Os campos visuais estão
documentados em [`../site/README.md`](../site/README.md); aqui ficam os campos
que mudam o comportamento do bot.

### `areas` — ambientes e lotação

```json
"areas": [
  { "slug": "salao",   "name": "Salão",   "description": "Climatizado, perto do forno a lenha", "capacity": 40, "imageUrl": "/fotos/salao.jpg",   "bookable": true },
  { "slug": "varanda", "name": "Varanda", "description": "Ao ar livre",                          "capacity": 20, "imageUrl": "/fotos/varanda.jpg", "bookable": true }
]
```

| Campo | O que faz no bot |
|---|---|
| `capacity` | Quantas **pessoas** cabem ao mesmo tempo. É o limite da lotação. |
| `bookable` | `false` mantém o ambiente no site e tira ele das reservas do WhatsApp — a sala privativa que só se fecha conversando, por exemplo. |
| a ordem | É a ordem da lista no bot e a preferência do "Tanto faz". |

Sem nenhum ambiente reservável, o `tenant:sync` cria um ambiente único com o
nome do restaurante e 40 lugares, e avisa — é quase certo que falta configurar.

### `menu` — cardápio

`menu.items` são os **destaques** (nome, descrição, categoria, preço), que o
botão "Cardápio" mostra agrupados por categoria. `menu.url` é o link do
cardápio completo — PDF, site, iFood —, que vai no fim da mensagem. Sem itens e
sem link, o botão some do menu.

### `team` — a recepção

Quem tem `phone` preenchido ganha o [painel da recepção](#o-painel-da-recepção).
Sem telefone, a pessoa só aparece no site.

### `booking` — regras das reservas

Todos os campos são opcionais.

| Campo | Padrão | O que faz |
|---|---|---|
| `slotStepMin` | `30` | Passo da grade: 30 gera 19:00, 19:30, 20:00... |
| `leadTimeMin` | `60` | Antecedência mínima. Ninguém reserva para daqui a 5 minutos. |
| `horizonDays` | `30` | Até quantos dias à frente dá para reservar. |
| `durationMin` | `120` | Quanto tempo a mesa fica com o grupo. É o que devolve os lugares à lotação. |
| `lastSeatingMin` | `60` | Última reserva: quantos minutos antes de fechar. Fechando às 23:00, com 60, o último horário é 22:00. |
| `maxPerContact` | `2` | Reservas futuras simultâneas por cliente. |
| `cancelDeadlineHours` | `2` | Até quantas horas antes o cliente cancela sozinho. Depois disso, cai no atendente. |
| `maxPartySize` | `20` | Maior grupo que o bot aceita. Acima disso, fala com um atendente. |
| `approvalAbovePartySize` | `8` | Grupos **maiores** que isto esperam o dono aprovar. `0` = tudo confirma na hora. |

Os horários oferecidos saem das faixas de `hours`: com `[["12:00","15:00"],
["18:00","23:00"]]` o bot oferece o almoço até 14:00 e o jantar até 22:00
(com `lastSeatingMin` de 60). Faixa que termina depois da meia-noite
(`["19:00","01:00"]`) funciona.

### `whatsapp` — atendimento e mensagens

| Campo | Padrão | O que faz |
|---|---|---|
| `greeting` | gerada | Primeira linha do menu. Vazio = "Olá! Aqui é a *nome* 🍝". |
| `paymentMethods` | Pix, dinheiro... | Resposta pronta do botão "Formas de pagamento". |
| `reviewUrl` | `""` | Link de avaliação no Google. Vazio desliga o pós-visita. |
| `handoffMinutes` | `30` | Quanto tempo o bot fica calado depois de chamar um atendente. |
| `quietHours` | `["23:30","09:00"]` | Silêncio noturno: nada programado sai nessa faixa. |
| `reativacaoDias` | `45` | Dias sem voltar até entrar na régua de reativação. |
| `textos` | `{}` | O que o bot fala, chave a chave. Veja abaixo. |
| `owner` | ver abaixo | Quem é o dono e o que os botões do painel dele fazem. |

```json
"whatsapp": {
  "messages": {
    "lembrete24h": true,
    "lembrete2h": true,
    "posAtendimento": false,
    "reativacao": false,
    "aniversario": false
  }
}
```

Uma mensagem só é enviada se estiver ligada **nos dois lugares**: aqui e no
`.env` (`FEATURE_*`). A trava do `.env` é do operador do servidor; esta é do
restaurante. (A chave do pós-visita continua se chamando `posAtendimento`, aqui
e no `.env`, para não quebrar config nenhum.)

---

### `whatsapp.owner` — o painel do dono

| Campo | Padrão | O que faz |
|---|---|---|
| `phones` | `[]` | Os números que abrem o painel. O primeiro recebe os avisos e os pedidos de aprovação. |
| `pauseMinutes` | `60` | Quanto tempo o botão "Pausar o bot" cala o atendimento. |
| `afternoonStartHour` | `11` | Hora em que o **almoço** começa, no "Fechar agenda". |
| `eveningStartHour` | `17` | Hora em que o **jantar** começa, no "Fechar agenda". |

"Fechar o almoço" fecha de `afternoonStartHour` até `eveningStartHour`; "fechar
o jantar", de `eveningStartHour` até o fim do dia.

O `phones` vence o `TENANT_OWNER_PHONE` do `.env` no próximo `tenant:sync`.
Lista vazia **não** apaga o número que já está no banco.

---

## Quem fala com o bot: cliente, recepção e dono

O telefone de quem escreve decide o que ele vê. A ordem está no
`handleInbound` (`bot/handler.ts`):

| Quem | Reconhecido por | O que vê |
|---|---|---|
| Dono | `whatsapp.owner.phones` (`tenants.owner_phone`) | a casa inteira: pedidos, reservas, relatório, fechar agenda, pausar o bot |
| Recepção | `team[].phone` (`staff.phone`) | a lista do dia e a marcação de chegadas |
| Cliente | qualquer outro número | o menu de atendimento |

### O painel da recepção

Pensado para quem fica na porta:

| Opção | O que faz |
|---|---|
| **Reservas de hoje / de amanhã** | a lista, com pessoas e ambiente. Pedidos pendentes não aparecem — ainda não são reserva |
| **Marcar chegada** | a lista de hoje → toca na reserva → **🟢 Chegou** ou **❌ Faltou**. Marcou errado? Marca de novo, e vale a última |
| **Resumo** | hoje e ontem: reservas, pessoas, chegaram, faltaram |

É esse registro que vira o "compareceram / faltaram" do relatório do dono.

O que ela **não** tem, de propósito: aprovar grupo grande, fechar a agenda,
relatório do mês e pausar o bot. A separação é de dado, não só de menu — toda
consulta do painel filtra pelo `tenant_id` resolvido **a partir do número que
recebeu a mensagem**, nunca do payload do botão. Não existe id de botão que
alguém possa forjar para marcar a reserva de outro restaurante.

Três detalhes que valem saber:

- **Dono ganha.** Em restaurante pequeno o dono também fica na porta, e o mesmo
  número pode estar nos dois lugares. Ele cai no painel do dono, que tem o
  atalho "Marcar chegadas".
- **A recepção não é calada pela pausa.** "Pausar o bot" cala o atendimento dos
  clientes; a lista da noite continua na mão de quem está na porta.
- **Quem tem painel não reserva como cliente** pelo próprio número.

---

## Identidade de pratos, ambientes e equipe

Cada prato, ambiente e membro da equipe pode ter um `slug` no config:

```json
"areas": [
  { "slug": "varanda", "name": "Varanda Coberta", "capacity": 24 }
]
```

O slug é a **ponte com o banco**: é ele que casa no `ON CONFLICT (tenant_id,
slug)` do `tenant:sync`, e é a linha de `areas` que as `reservations`
referenciam. Fixá-lo é o que faz **renomear ser renomear**: sem ele o slug sai
do nome, e trocar o nome criaria um ambiente novo, desativaria o antigo e
deixaria as reservas apontando para um ambiente que sumiu do menu.

- **Vazio ou ausente** — derivado do nome.
- **Preenchido** — manda, e não deve mais ser alterado. O estúdio carimba um na
  criação do item e nunca mais mexe.
- Só letras, números e hífen; o que fugir disso é ignorado com aviso.

Remover um ambiente do config **desativa** a linha (`active = false`), nunca a
apaga: ele some do menu e do site, e as reservas que já existiam continuam
válidas e legíveis.

---

## Os textos do bot

Nenhuma frase que o cliente, o dono ou a recepção lê está escrita no meio do
código. Todas vivem num catálogo —
[`shared/src/config/textos.ts`](../shared/src/config/textos.ts) — com o padrão,
as variáveis que aceitam e o limite de tamanho da Meta. Cada restaurante
sobrescreve o que quiser em `whatsapp.textos`:

```json
"whatsapp": {
  "textos": {
    "cliente.menu.saudacao": "Buonasera! Aqui é a {marca} 🍷",
    "cliente.cancelado.corpo": "Reserva cancelada. A mesa já voltou para outro grupo.",
    "rotulos.botao.reservar": "Reservar"
  }
}
```

Chave ausente = o padrão do catálogo. Chave desconhecida é ignorada com aviso no
`tenant:sync`. `{variavel}` é trocada na hora do envio; variável sem valor sai
vazia, e nunca vaza `{assim}` para o cliente.

As chaves seguem o caminho na conversa, em cinco grupos:

| Prefixo | O que é |
|---|---|
| `cliente.` | as telas do atendimento — menu, cardápio, reserva, aprovação, cancelamento, LGPD |
| `dono.` | o painel do dono e os avisos que ele recebe |
| `recepcao.` | o painel da recepção — a lista do dia, chegadas, resumo |
| `rotulos.` | títulos de botão e de linha de lista, onde os limites da Meta apertam |
| `template.` | o corpo dos templates aprovados na Meta — **referência**, não é o que é enviado |

Editar isso à mão funciona, mas o caminho normal é o estúdio, que mostra a
prévia e confere os limites — e que também edita **cardápio, ambientes, equipe,
horários, contato e as regras das reservas**, com o resultado indo para o banco
no salvamento:

```bash
npm run textos:studio    # http://localhost:4321
```

| Aba | O que edita |
|---|---|
| **Textos** | grupos *Cliente*, *Dono*, *Recepção*, *Botões e listas* e *Templates da Meta* |
| **Cardápio** | os pratos em destaque e o link do cardápio completo |
| **Ambientes** | nome, descrição, lotação, foto e se aceita reserva |
| **Equipe** | quem aparece no site e o WhatsApp que abre o painel da recepção |
| **Horários** | as faixas de cada dia |
| **Marca e contato** | nome, endereço, mapa, telefones |
| **Regras das reservas** | o bloco `booking` inteiro |
| **Atendimento** | pagamento, avaliação, números do dono, painel do dono, mensagens programadas |

Ele grava no `restaurante.config.json`, sincroniza com o banco e invalida o
cache — o texto novo vale na mensagem seguinte, sem reiniciar o servidor. Roda
em `127.0.0.1`, não tem login e **não vai para produção**: não está no
`index.ts`, nem no `Dockerfile`, nem no `render.yaml`.

> Dois testes seguram esse contrato: chave do catálogo que ninguém usa reprova, e
> `t()` apontando para chave inexistente também.

---

## Vários restaurantes no mesmo servidor

Cada um tem sua pasta, dentro deste módulo:

```
whatsapp/tenants/
  cantina-bella-nonna/restaurante.config.json
  sushi-kaze/restaurante.config.json
```

O aplicativo da Meta é **um só**; o que muda é o número de cada restaurante. O
webhook descobre de quem é a mensagem pelo `phone_number_id` que vem no evento.

```bash
npm run tenant:add -- --slug=sushi-kaze --phone-number-id=... --token=... --owner="(11) 91234-5678"
npm run tenant:sync    # depois de mudar cardápio, ambiente, horário ou equipe
npm run tenant:list
```

Cada arquivo usa exatamente o mesmo formato do `restaurante.config.json` da
raiz — use o `restaurante.config.example.json` como base. O arquivo continua
sendo a fonte da verdade, versionado no git; o banco é só o espelho que o
servidor lê rápido.

Os tokens vão **criptografados** (AES-256-GCM) para o banco — o `.env` guarda só
a chave e as credenciais do aplicativo da Meta.

> **Rodando um restaurante só?** Você ainda precisa de uma pasta em `tenants/`
> com o slug dele. O `restaurante.config.json` da raiz é o que o site publica
> em desenvolvimento; o bot lê o de `tenants/<slug>/`. Manter os dois iguais é o
> caminho mais simples.

---

## Variáveis de ambiente

Tudo fica no **`whatsapp/.env`**, que **não vai para o git**. O
[`.env.example`](.env.example) explica cada variável: o que é, se é obrigatória,
onde achar o valor no painel da Meta e um exemplo.

```bash
cp .env.example .env
```

As que você precisa gerar:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -hex 32      # ADMIN_API_TOKEN
openssl rand -hex 32      # META_VERIFY_TOKEN
```

> ⚠️ Guarde a `APP_ENCRYPTION_KEY` junto do backup do banco. Sem ela, os tokens
> salvos viram lixo e cada restaurante precisa ser cadastrado de novo.

O `.env` é lido a partir da pasta do módulo, não do diretório onde o comando
rodou — dá na mesma chamar de `whatsapp/` ou da raiz.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API + worker, com recarga automática |
| `npm run start` | Sobe em produção |
| `npm run worker` | Só o worker, em processo separado (`WORKER_IN_PROCESS=false`) |
| `npm run db:migrate` | Aplica as migrations |
| `npm run db:reset` | Apaga o schema e recria (desenvolvimento) |
| `npm run tenant:sync` | Lê `tenants/<slug>/` e grava no banco |
| `npm run tenant:add` | Cadastra um restaurante com as credenciais dele |
| `npm run tenant:list` | Mostra o que está cadastrado |
| `npm run bot:sim` | Conversa com o bot pelo terminal, sem passar pela Meta |
| `npm run bot:sim -- --dono` | O mesmo, entrando pelo número do dono |
| `npm run bot:sim -- --recepcao=<slug>` | O mesmo, entrando pelo número de alguém da equipe |
| `npm run textos:studio` | Abre o estúdio em http://localhost:4321 |
| `npm run templates:check` | Situação dos templates na Meta |
| `npm run wa:send` | Manda uma mensagem de teste |
| `npm run outbox:run` | Roda a fila de saída na mão, com data simulada |

---

## Como o módulo está organizado

```
whatsapp/
  .env.example         # segredos do servidor, campo a campo
  docker-compose.yml   # Postgres de desenvolvimento
  tenants/<slug>/      # config de cada restaurante atendido
  src/
    index.ts           # API (webhook + /health + /admin)
    worker.ts          # worker das mensagens programadas
    env.ts             # leitura e validação do .env
    whatsapp/          # cliente, webhook, assinatura, payloads, limites
    bot/               # máquina de estados, telas, painéis do dono e da recepção, textos
    booking/           # horários livres, lotação, reserva
    scheduler/         # fila de saída, worker, rotinas diárias
    db/                # migrations e repositórios
    tenants/           # cadastro e cache dos restaurantes
    studio/            # estúdio — local, fora do deploy
    lib/               # log, datas, criptografia, caminhos
  docs/
    setup.md           # do zero até o bot no ar
    templates.md       # templates prontos para a Meta
```

O banco tem uma migration só,
[`src/db/migrations/001_init.sql`](src/db/migrations/001_init.sql):

| Tabela | O que guarda |
|---|---|
| `tenants` | cada restaurante: número na Meta, token criptografado, dono, config normalizado |
| `areas` | os ambientes e a lotação de cada um — é a linha travada na reserva |
| `staff` | a equipe; quem tem telefone abre o painel da recepção |
| `contacts` | os clientes, a janela de 24h, opt-in e opt-out |
| `conversations` | em que passo do menu cada cliente está |
| `reservations` | as reservas: grupo, ambiente, início, fim, status |
| `time_blocks` | "Fechar agenda", feriados, eventos. `area_id` NULL = o restaurante inteiro |
| `outbox` | a fila de tudo que sai por iniciativa do servidor, ligada à reserva por `reservation_id` |
| `message_log` | o registro de cada mensagem, com o id da Meta — é o que torna o webhook idempotente |

O que vem da base comum (`@restaurante/shared`): o schema do
`restaurante.config.json`, o catálogo de textos (`config/textos`) com o
substituidor de variáveis (`lib/texto`), o cálculo de horários (`lib/hours`)
que alimenta a grade das reservas e a normalização de telefone
(`lib/whatsapp`). Nada aqui importa o módulo do site.

---

## Testes

```bash
npm run test
```

A lógica que erra caro é testada sem rede e sem banco: geração de horários
(almoço e jantar, última reserva, virada de dia, lotação no meio da mesa), a
máquina de estados do menu inteira, a assinatura do webhook, os limites de
tamanho da Meta e as travas das mensagens programadas.

Os testes que precisam de Postgres — a trava da lotação, a fila de mensagens e
a conversa de ponta a ponta — rodam quando `DATABASE_URL_TEST` está no `.env`,
e são pulados quando não está:

```bash
docker compose up -d
psql "$DATABASE_URL" -c "CREATE DATABASE restaurante_test"
echo 'DATABASE_URL_TEST=postgres://restaurante:restaurante@localhost:5432/restaurante_test' >> .env
npm run test
```

---

## Conversar com o bot pelo terminal

```bash
npm run bot:sim                                   # um cliente qualquer
npm run bot:sim -- --from=5511988887777 --reset   # outro cliente, do zero
npm run bot:sim -- --dono                         # o painel do dono
npm run bot:sim -- --recepcao=renata              # o painel da recepção
```

É o bot inteiro — máquina de estados, banco, regras de horário, lotação,
reserva de verdade. A única peça trocada é o envio: em vez de sair pela Cloud
API, a mensagem é desenhada no terminal, com as opções numeradas. Você responde
`3` e o bot recebe o **id** daquela linha, como se você tivesse tocado nela no
aplicativo.

É o jeito de ver o atendimento pela ótica do cliente sem gastar conversa, sem
depender de webhook e sem precisar de um segundo número na lista de permitidos —
`--from` te faz outra pessoa, o que também é a saída para quem tem o próprio
número cadastrado como dono.

Aceita entrada por *pipe*, então dá para escrever um roteiro de fumaça:

```bash
printf 'oi\n1\n2\n1\n1\n1\n1\n' | npm run bot:sim -- --from=5511988887777 --reset
```

`/reset` reinicia a conversa sem apagar reservas, `/sair` encerra.

O que ele **não** cobre: como a Meta renderiza a lista dentro do aplicativo, e o
envio de verdade (token, template aprovado, janela de 24h). Para isso, o número
de teste continua sendo a palavra final.
