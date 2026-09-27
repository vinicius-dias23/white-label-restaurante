# Módulo 2 — WhatsApp (automação do atendimento)

Atendimento oficial pela **WhatsApp Business Platform (Cloud API)**, só com
botões fixos, **sem nenhuma IA**. O cliente marca o horário sozinho e recebe
confirmação e lembretes; o dono acompanha tudo pelo próprio WhatsApp.

**Stack:** Node + Fastify + PostgreSQL + WhatsApp Cloud API.

```bash
npm install            # na raiz do repositório, uma vez

cd whatsapp
cp .env.example .env   # os segredos do servidor
docker compose up -d   # Postgres local
npm run db:migrate     # cria as tabelas
npm run tenant:sync    # carrega o config das barbearias
npm run dev            # API + worker das mensagens programadas
```

Da raiz do repositório: `npm run <script> -w @barbearia/whatsapp`.

> **Começando do zero?** [`docs/setup.md`](docs/setup.md) leva da criação da
> conta na Meta até o bot respondendo no seu celular, em 1 a 2 horas, usando o
> número de teste gratuito. Os textos dos templates estão em
> [`docs/templates.md`](docs/templates.md), prontos para colar no WhatsApp
> Manager.

---

## Como o atendimento funciona

Texto livre nunca é interpretado — o bot responde com o menu. É mais previsível
que qualquer modelo, não erra preço, não inventa horário e dá para testar
inteiro.

```
Menu ─┬─ Agendar horário → serviço → barbeiro → dia → horário → confirmar
      ├─ Meus agendamentos → remarcar / cancelar
      ├─ Serviços e preços
      ├─ Horário de funcionamento   (calcula "aberto agora")
      ├─ Onde ficamos               (endereço + rota)
      ├─ Formas de pagamento
      └─ Falar com atendente        (cala o bot e avisa o dono)
```

**O dono não precisa de painel:** ele manda qualquer coisa para o próprio número
da barbearia e recebe um menu com "Agenda de hoje", "Agenda de amanhã",
"Próximos 7 dias", "Bloquear horário" e "Pausar o bot". Também recebe um aviso a
cada agendamento e cancelamento.

### Mensagens programadas

A confirmação do agendamento **não** entra nesta lista: ela é a própria resposta
ao toque em "Confirmar", sai na hora com todos os detalhes e não passa pela fila.

| Mensagem | Quando | Padrão |
|---|---|---|
| Lembrete de 24h | véspera, com botões Confirmar/Cancelar | ✅ ligada |
| Lembrete de 2h | 2h antes | ✅ ligada |
| Pós-atendimento | dia seguinte, com botão de avaliação | ⚙️ desligada |
| Reativação | quem sumiu há N dias | ⚙️ desligada |
| Aniversário | no dia | ⚙️ desligada |

As três últimas estão implementadas e testadas; ligar é decisão de negócio, e
depende do template estar aprovado na Meta. As duas últimas são de **marketing**:
só vão para quem deu opt-in, e é por isso que nascem desligadas.

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
   conferi-la, qualquer pessoa agendaria e cancelaria horários alheios.

---

## Configuração da barbearia

O bot lê a mesma configuração do site: nome, contato, serviços, equipe e
horários saem do `barbearia.config.json`. Os campos visuais estão documentados
em [`../site/README.md`](../site/README.md); aqui ficam os **dois blocos que só
este módulo usa**.

### `booking` — regras da agenda

Todos os campos são opcionais.

| Campo | Padrão | O que faz |
|---|---|---|
| `slotStepMin` | `15` | Passo da grade: 15 gera 09:00, 09:15, 09:30... |
| `leadTimeMin` | `60` | Antecedência mínima. Ninguém marca para daqui a 5 minutos. |
| `horizonDays` | `21` | Até quantos dias à frente dá para marcar. |
| `bufferMin` | `0` | Folga entre um atendimento e o próximo. |
| `maxPerContact` | `2` | Agendamentos futuros simultâneos por cliente. |
| `cancelDeadlineHours` | `3` | Até quantas horas antes o cliente cancela sozinho. Depois disso, cai no atendente. |
| `defaultDurationMin` | `40` | Duração de quem não informa a dele. |

A duração de cada serviço sai do texto de `duration` (`"40 min"`, `"1h 10"`,
`"1 hora e meia"`). Quando ele for criativo demais, escreva o número direto:

```json
{ "name": "Platinado", "duration": "a combinar", "durationMin": 120 }
```

O `npm run tenant:sync` avisa quais serviços caíram no padrão.

Em `team`, `"bookable": false` mantém o barbeiro no site e tira ele da agenda do
WhatsApp.

### `whatsapp` — atendimento e mensagens

| Campo | Padrão | O que faz |
|---|---|---|
| `greeting` | gerada | Primeira linha do menu. Vazio = "Olá! Aqui é a *nome* 💈". |
| `paymentMethods` | Pix, dinheiro... | Resposta pronta do botão "Formas de pagamento". |
| `reviewUrl` | `""` | Link de avaliação no Google. Vazio desliga o pós-atendimento. |
| `handoffMinutes` | `30` | Quanto tempo o bot fica calado depois de chamar um atendente. |
| `quietHours` | `["21:00","08:00"]` | Silêncio noturno: nada programado sai nessa faixa. |
| `reativacaoDias` | `40` | Dias sem voltar até entrar na régua de reativação. |
| `textos` | `{}` | O que o bot fala, chave a chave. Veja abaixo. |
| `owner` | ver abaixo | O que os botões do painel do dono fazem. |

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
`.env` (`FEATURE_*`). A trava do `.env` é do operador do servidor; esta é da
barbearia.

---

### `whatsapp.owner` — o painel do dono

| Campo | Padrão | O que faz |
|---|---|---|
| `pauseMinutes` | `60` | Quanto tempo o botão "Pausar o bot" cala o atendimento. |
| `afternoonStartHour` | `12` | Hora em que a tarde começa, no bloqueio rápido. |
| `eveningStartHour` | `18` | Hora em que a noite começa, no bloqueio rápido. |
| `phones` | `[]` | Os números que abrem o painel. O primeiro recebe os avisos. |

O `phones` vence o `TENANT_OWNER_PHONE` do `.env` no próximo `tenant:sync`.
Lista vazia **não** apaga o número que já está no banco.

---

## Quem fala com o bot: cliente, barbeiro e dono

O telefone de quem escreve decide o que ele vê. A ordem está no
`handleInbound` (`bot/handler.ts`):

| Quem | Reconhecido por | O que vê |
|---|---|---|
| Dono | `tenants.owner_phone` | a casa inteira: agenda, bloqueio, pausar o bot |
| Barbeiro | `barbers.phone` | só o dele: agenda, cortes, folga |
| Cliente | qualquer outro número | o menu de atendimento |

### O painel do barbeiro

Cinco opções, todas recortadas nele: **agenda de hoje**, **de amanhã**, **a
semana**, **meus cortes** (hoje, ontem e no mês) e **tirar folga**, que fecha
só a agenda dele — a barbearia continua atendendo com os outros.

O que ele **não** tem, de propósito: agenda dos colegas, faturamento, bloqueio
da casa e o botão de pausar o bot. A separação é de dado, não só de menu — toda
consulta do painel filtra por `tenant_id` **e** `barber_id`, e o `barber_id` vem
da identificação pelo telefone, nunca do payload da mensagem.

O número vem do `team[].phone` do config, editável na aba Equipe do estúdio.
Barbeiro sem telefone não tem painel: escreve para a barbearia e é atendido como
cliente.

Dois detalhes que valem saber:

- **Dono ganha.** Na barbearia pequena o dono também corta, e o mesmo número
  está nos dois lugares. Ele cai no painel do dono, que já mostra tudo.
- **Quem tem painel não agenda como cliente** pelo próprio número — vale para o
  dono desde sempre, e agora para o barbeiro também.

---

## Identidade de serviços e barbeiros

Cada serviço e cada membro da equipe pode ter um `slug` no config:

```json
"services": [
  { "slug": "corte-barba", "name": "Corte + Barba Premium", "price": "R$ 89" }
]
```

O slug é a **ponte com o banco**: é ele que casa no `ON CONFLICT (tenant_id,
slug)` do `tenant:sync`, e é a linha de `services` que os `appointments`
referenciam. Fixá-lo é o que faz **renomear ser renomear**: sem ele o slug sai
do nome, e trocar o nome criaria um serviço novo, desativaria o antigo e
deixaria os agendamentos apontando para um item que sumiu do menu.

- **Vazio ou ausente** — derivado do nome, exatamente como antes. Nada muda para
  quem já tinha config.
- **Preenchido** — manda, e não deve mais ser alterado. O estúdio carimba um na
  criação do item e nunca mais mexe.
- Só letras, números e hífen; o que fugir disso é ignorado com aviso.

Remover um item do config **desativa** a linha (`active = false`): ele some do
menu e do site, e os agendamentos que já existiam continuam válidos e legíveis —
o `service_id` é `ON DELETE RESTRICT` justamente para isso.

---

## Os textos do bot

Nenhuma frase que o cliente ou o dono lê está escrita no meio do código. Todas
vivem num catálogo — [`shared/src/config/textos.ts`](../shared/src/config/textos.ts) —
com o padrão, as variáveis que aceitam e o limite de tamanho da Meta. Cada
barbearia sobrescreve o que quiser em `whatsapp.textos`:

```json
"whatsapp": {
  "textos": {
    "cliente.menu.saudacao": "Fala! Aqui é a {marca} 💈",
    "cliente.cancelado.corpo": "Cancelado. O horário já voltou para a agenda.",
    "rotulos.botao.agendar": "Marcar"
  }
}
```

Chave ausente = o padrão do catálogo. Chave desconhecida é ignorada com aviso no
`tenant:sync`. `{variavel}` é trocada na hora do envio; variável sem valor sai
vazia, e nunca vaza `{assim}` para o cliente.

As chaves seguem o caminho na conversa, em quatro grupos:

| Prefixo | O que é |
|---|---|
| `cliente.` | as telas do atendimento — menu, agendamento, cancelamento, LGPD |
| `dono.` | o painel do dono e os avisos que ele recebe |
| `barbeiro.` | o painel do barbeiro — a agenda dele, os cortes dele, a folga dele |
| `rotulos.` | títulos de botão e de linha de lista, onde os limites da Meta apertam |
| `template.` | o corpo dos templates aprovados na Meta — **referência**, não é o que é enviado |

Editar isso à mão funciona, mas o caminho normal é o estúdio, que mostra a
prévia e confere os limites — e que também edita **serviços, equipe, horários,
contato e as regras da agenda**, com o resultado indo para o banco no
salvamento:

```bash
npm run textos:studio    # http://localhost:4321
```

Ele grava no `barbearia.config.json`, sincroniza com o banco e invalida o cache —
o texto novo vale na mensagem seguinte, sem reiniciar o servidor. Roda em
`127.0.0.1`, não tem login e **não vai para produção**: não está no `index.ts`,
nem no `Dockerfile`, nem no `render.yaml`.

> Dois testes seguram esse contrato: chave do catálogo que ninguém usa reprova, e
> `t()` apontando para chave inexistente também.

---

## Várias barbearias no mesmo servidor

Cada uma tem sua pasta, dentro deste módulo:

```
whatsapp/tenants/
  barbearia-do-ze/barbearia.config.json
  studio-navalha/barbearia.config.json
```

O aplicativo da Meta é **um só**; o que muda é o número de cada barbearia. O
webhook descobre de quem é a mensagem pelo `phone_number_id` que vem no evento.

```bash
npm run tenant:add -- --slug=studio-navalha --phone-number-id=... --token=... --owner="(11) 91234-5678"
npm run tenant:sync    # depois de mudar preço, horário ou equipe
npm run tenant:list
```

Cada arquivo usa exatamente o mesmo formato do `barbearia.config.json` da raiz —
use o `barbearia.config.example.json` como base. O arquivo continua sendo a
fonte da verdade, versionado no git; o banco é só o espelho que o servidor lê
rápido.

Os tokens vão **criptografados** (AES-256-GCM) para o banco — o `.env` guarda só
a chave e as credenciais do aplicativo da Meta.

> **Rodando uma barbearia só?** Você ainda precisa de uma pasta em `tenants/`
> com o slug dela. O `barbearia.config.json` da raiz é o que o site publica; o
> bot lê o de `tenants/<slug>/`. Manter os dois iguais é o caminho mais simples.

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
> salvos viram lixo e cada barbearia precisa ser cadastrada de novo.

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
| `npm run tenant:add` | Cadastra uma barbearia com as credenciais dela |
| `npm run tenant:list` | Mostra o que está cadastrado |
| `npm run bot:sim` | Conversa com o bot pelo terminal, sem passar pela Meta |
| `npm run bot:sim -- --dono` | O mesmo, entrando pelo número do dono |
| `npm run bot:sim -- --barbeiro=<slug>` | O mesmo, entrando pelo número de um barbeiro |
| `npm run textos:studio` | Abre o estúdio dos textos em http://localhost:4321 |
| `npm run templates:check` | Situação dos templates na Meta |
| `npm run wa:send` | Manda uma mensagem de teste |
| `npm run outbox:run` | Roda a fila de saída na mão, com data simulada |

---

## Como o módulo está organizado

```
whatsapp/
  .env.example         # segredos do servidor, campo a campo
  docker-compose.yml   # Postgres de desenvolvimento
  tenants/<slug>/      # config de cada barbearia atendida
  src/
    index.ts           # API (webhook + /health + /admin)
    worker.ts          # worker das mensagens programadas
    env.ts             # leitura e validação do .env
    whatsapp/          # cliente, webhook, assinatura, payloads, limites
    bot/               # máquina de estados, telas, painéis do dono e do barbeiro, textos
    booking/           # horários livres, duração, reserva
    scheduler/         # fila de saída, worker, rotinas diárias
    db/                # migrations e repositórios
    tenants/           # cadastro e cache das barbearias
    studio/            # estúdio dos textos — local, fora do deploy
    lib/               # log, datas, criptografia, caminhos
  docs/
    setup.md           # do zero até o bot no ar
    templates.md       # templates prontos para a Meta
```

O que vem da base comum (`@barbearia/shared`): o schema do
`barbearia.config.json`, o catálogo de textos (`config/textos`) com o
substituidor de variáveis (`lib/texto`), o cálculo de horários (`lib/hours`) que
alimenta a grade da agenda e a normalização de telefone (`lib/whatsapp`). Nada aqui importa
o módulo do site.

---

## Testes

```bash
npm run test
```

A lógica que erra caro é testada sem rede e sem banco: geração de horários
(almoço, folga, virada de dia, conflito), a máquina de estados do menu inteira,
a assinatura do webhook, os limites de tamanho da Meta e as travas das mensagens
programadas.

Os testes que precisam de Postgres — a trava contra dupla marcação, a fila de
mensagens e a conversa de ponta a ponta — rodam quando `DATABASE_URL_TEST` está
no `.env`, e são pulados quando não está:

```bash
docker compose up -d
psql "$DATABASE_URL" -c "CREATE DATABASE barbearia_test"
echo 'DATABASE_URL_TEST=postgres://barbearia:barbearia@localhost:5432/barbearia_test' >> .env
npm run test
```

---

## Conversar com o bot pelo terminal

```bash
npm run bot:sim                                   # um cliente qualquer
npm run bot:sim -- --from=5511988887777 --reset   # outro cliente, do zero
npm run bot:sim -- --dono                         # o painel do dono
npm run bot:sim -- --barbeiro=rafael              # o painel de um barbeiro
```

É o bot inteiro — máquina de estados, banco, regras de horário, agendamento de
verdade. A única peça trocada é o envio: em vez de sair pela Cloud API, a
mensagem é desenhada no terminal, com as opções numeradas. Você responde `3` e o
bot recebe o **id** daquela linha, como se você tivesse tocado nela no aplicativo.

É o jeito de ver o atendimento pela ótica do cliente sem gastar conversa, sem
depender de webhook e sem precisar de um segundo número na lista de permitidos —
`--from` te faz outra pessoa, o que também é a saída para quem tem o próprio
número cadastrado como dono.

Aceita entrada por *pipe*, então dá para escrever um roteiro de fumaça:

```bash
printf 'oi\n1\n1\n1\n1\n1\n1\n' | npm run bot:sim -- --from=5511988887777 --reset
```

`/reset` reinicia a conversa sem apagar agendamentos, `/sair` encerra.

O que ele **não** cobre: como a Meta renderiza a lista dentro do aplicativo, e o
envio de verdade (token, template aprovado, janela de 24h). Para isso, o número
de teste continua sendo a palavra final.
