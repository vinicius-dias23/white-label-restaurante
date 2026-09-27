# Restaurante — white-label

Dois módulos independentes, um arquivo de configuração em comum.

| Módulo | O que é | Onde fica |
|---|---|---|
| 🖥️ **Site** | Landing page white-label de página única para o restaurante que não tem site próprio, feita para o celular primeiro. Fotos grandes, cardápio em destaque, ambientes e um caminho curto até a reserva no WhatsApp. | [`site/`](site/) |
| 💬 **WhatsApp** | Automação do atendimento pela **WhatsApp Business Platform (Cloud API)**: reserva de mesa por botões fixos, sem nenhuma IA, com controle de lotação por ambiente, aprovação de grupos grandes e lembretes. | [`whatsapp/`](whatsapp/) |

Cada módulo roda, é testado e vai para produção sozinho. Dá para publicar só o
site, só a automação, ou os dois — e times diferentes podem tocar cada um sem
esbarrar no outro.

Para publicar um novo restaurante você **não mexe em código**: edita o
`restaurante.config.json` e faz o build.

---

## O que é comum

Na raiz do repositório fica **só o que os dois módulos usam**:

```
restaurante.config.json          # o restaurante: marca, cores, cardápio, ambientes, equipe, horários
restaurante.config.example.json  # o exemplo, com todos os campos preenchidos
shared/                          # a base comum: schema do config + utilitários
tsconfig.base.json               # opções de TypeScript comuns
package.json                     # os workspaces npm
```

O mesmo `restaurante.config.json` alimenta os dois lados — **mudou o preço do
prato no site, mudou no WhatsApp; aumentou a varanda, o bot já oferece os
lugares novos**. Ele pode até estar vazio (`{}`): nesse caso tudo sobe com a
identidade padrão (uma cantina de demonstração), e cada campo preenchido
substitui o seu padrão.

```bash
cp restaurante.config.example.json restaurante.config.json
```

A referência de cada campo está no módulo que o consome:

- campos visuais — marca, cores, fotos, seções: [`site/README.md`](site/README.md)
- campos das reservas e do atendimento — `booking` e `whatsapp`: [`whatsapp/README.md`](whatsapp/README.md)

E o que os dois leem do mesmo jeito (`contact`, `menu`, `areas`, `team`,
`hours`) está descrito em [`shared/README.md`](shared/README.md), com o link
para o lado que usa cada pedaço.

---

## Começando

Uma instalação só, na raiz, para os três workspaces:

```bash
npm install
```

**Módulo 1 — site:**

```bash
npm run dev        # http://localhost:5173
npm run build      # gera site/dist/
```

**Módulo 2 — WhatsApp:**

```bash
cd whatsapp
cp .env.example .env   # os segredos do servidor
docker compose up -d   # Postgres local
npm run db:migrate     # cria as tabelas
npm run tenant:sync    # carrega o config dos restaurantes
npm run dev            # API + worker das mensagens programadas
```

O passo a passo completo, da conta na Meta até o bot respondendo no celular,
está em [`whatsapp/docs/setup.md`](whatsapp/docs/setup.md).

---

## Customizar o atendimento

O **estúdio** edita as duas metades do atendimento: o que o bot **fala** (os
textos) e aquilo sobre o que ele fala (cardápio, ambientes, equipe, horários,
endereço e as regras das reservas). Tudo vai para o `restaurante.config.json` do
restaurante e é sincronizado com o banco na hora.

```bash
npm run textos:studio -w @restaurante/whatsapp   # http://localhost:4321
```

Ele roda **só na sua máquina** — não vai para o deploy, não pede login e escuta
em `127.0.0.1`. O seletor no topo escolhe o restaurante; as abas dividem o
trabalho:

| Aba | O que edita |
|---|---|
| **Textos** | as frases do bot, em cinco grupos: *Cliente*, *Dono*, *Recepção*, *Botões e listas* e *Templates da Meta* |
| **Cardápio** | os pratos em destaque (nome, descrição, categoria, preço, foto, destaque) e o link do cardápio completo |
| **Ambientes** | Salão, Varanda, Mezanino…: nome, descrição, **lotação** (quantas pessoas cabem ao mesmo tempo), foto e se aceita reserva pelo WhatsApp |
| **Equipe** | chef, sommelier, recepção — e **o WhatsApp de cada um**: preenchido, é ele que abre o painel da recepção |
| **Horários** | as faixas de cada dia (almoço e jantar); sem faixa, o dia é fechado |
| **Marca e contato** | nome do restaurante, endereço, mapa, telefones |
| **Regras das reservas** | passo da grade, antecedência, quanto tempo a mesa fica com o grupo, última reserva antes de fechar, maior grupo, a partir de quantas pessoas o dono aprova, prazo de cancelamento |
| **Atendimento** | formas de pagamento, link de avaliação, **os números do dono**, o painel do dono e as mensagens programadas |

Em qualquer aba:

| | |
|---|---|
| **Prévia** | monta a mensagem pelos mesmos construtores que o bot usa, já com a sua edição — inclusive o prato ou o ambiente que você acabou de digitar |
| **Variáveis** | nos textos, os chips (`{marca}`, `{pessoas}`, `{ambiente}`, `{data}`…) entram onde o cursor estiver |
| **Contador** | mostra o limite da Cloud API — passou, a Meta corta, e a prévia mostra o corte |
| **Salvar** | grava no `restaurante.config.json`, sincroniza com o Postgres e invalida o cache — **a próxima mensagem do cliente já sai com o conteúdo novo, sem reiniciar nada** |
| **Publicar** | mostra o diff, pede a mensagem do commit e faz `add`, `commit` e `push` na branch atual (recusa na `master`) |

> **Renomear é seguro.** Cada prato, ambiente e colaborador tem um identificador
> fixo (`slug`) gravado no config, e é ele — não o nome — que liga o item às
> linhas do banco. Trocar "Varanda" por "Varanda Coberta" renomeia o mesmo
> ambiente; as reservas que já existiam continuam apontando para ele.
> **Remover** um ambiente o tira do menu e do site e desativa a linha no banco,
> mas as reservas futuras continuam valendo — o estúdio avisa quantas são antes
> de confirmar.

O estúdio precisa do banco de pé (`docker compose up -d`) só para aplicar na
hora; sem ele, o arquivo é gravado do mesmo jeito e o rodapé avisa que a
sincronização não rolou.

Só o que você mudou vai para o arquivo: texto igual ao padrão não é gravado,
*voltar ao padrão* remove a chave, e seção que não mudou não é reescrita — o
diff do commit mostra as linhas que você mexeu, e nada além. A referência das
chaves de texto está em
[`whatsapp/README.md`](whatsapp/README.md#os-textos-do-bot).

**Cardápio, ambientes e equipe também alimentam o site.** É o mesmo
`restaurante.config.json`: mudou o preço no estúdio, mudou na landing page no
próximo build.

> **Templates da Meta** (lembretes, pós-visita, reativação, aniversário) são a
> exceção: editar no estúdio **não muda o que a Meta envia**. Eles são aprovados
> no WhatsApp Manager, e o texto novo só vale depois da reaprovação — a aba
> avisa isso e serve para gerar o corpo que você cola lá.

**Os dois de uma vez, da raiz:**

```bash
npm run test        # a suíte inteira: base comum + WhatsApp
npm run typecheck   # TypeScript dos três workspaces
```

Cada módulo também aceita os comandos dele direto:
`npm run <script> -w @restaurante/site` ou `-w @restaurante/whatsapp`.

---

## Mapa do repositório

```
restaurante.config.json          # comum aos dois módulos
restaurante.config.example.json
tsconfig.base.json

shared/                        # base comum (@restaurante/shared)
  src/config/                  # tipos, padrões e validação do JSON
  src/config/textos.ts         # o catálogo de tudo que o bot fala
  src/lib/                     # cores, horários, textos e links de WhatsApp/mapa

site/                          # MÓDULO 1 — landing page (@restaurante/site)
  index.html
  vite.config.ts
  src/config/                  # carrega o restaurante.config.json da raiz
  src/components/              # Header, Hero, Menu, Areas, Team, Gallery, ...
  src/hooks/                   # scroll, relógio, animação de entrada
  src/lib/                     # tema (variáveis CSS) e imagens
  src/styles/index.css
  README.md                    # documentação do site

whatsapp/                      # MÓDULO 2 — automação (@restaurante/whatsapp)
  .env.example                 # segredos do servidor, campo a campo
  docker-compose.yml           # Postgres de desenvolvimento
  tenants/<slug>/              # config de cada restaurante atendido
  src/whatsapp/                # cliente, webhook, assinatura, payloads, limites
  src/bot/                     # máquina de estados, telas, painel do dono e da recepção
  src/booking/                 # horários livres, lotação, reserva
  src/scheduler/               # fila de saída, worker, rotinas diárias
  src/db/                      # migrations e repositórios
  src/tenants/                 # cadastro e cache dos restaurantes
  src/studio/                  # o estúdio dos textos (local, fora do deploy)
  docs/setup.md                # do zero até o bot no ar
  docs/templates.md            # templates prontos para a Meta
  README.md                    # documentação da automação
```

**Como os módulos se falam:** eles não se falam. Nenhum dos dois importa o
outro; os dois importam `@restaurante/shared`, que só conhece o formato do
`restaurante.config.json`. É a única dependência entre eles, e é de leitura.

```
        restaurante.config.json
                  │
         @restaurante/shared
            ┌─────┴─────┐
          site       whatsapp
```

---

## Stack

- **Site:** Vite + React 19 + TypeScript + Tailwind CSS v4 → build estático
  (`site/dist/`), sobe em qualquer hospedagem.
- **WhatsApp:** Node + Fastify + PostgreSQL + WhatsApp Cloud API.
- **Base comum:** TypeScript puro, sem dependências.

## Testes

```bash
npm run test
```

A lógica que erra caro é testada sem rede e sem banco: geração de horários e
da lotação, a máquina de estados do menu inteira, a assinatura do webhook, os
limites de tamanho da Meta e a validação do config. Os testes que precisam de
Postgres (a trava da lotação, a fila de mensagens, a idempotência do webhook)
são pulados quando não há banco configurado — veja
[`whatsapp/README.md`](whatsapp/README.md#testes).
