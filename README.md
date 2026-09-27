# Barbearia — white-label

Dois módulos independentes, um arquivo de configuração em comum.

| Módulo | O que é | Onde fica |
|---|---|---|
| 🖥️ **Site** | Landing page white-label de página única, feita para o celular primeiro. Fotos grandes, pouco texto e um caminho curto até o WhatsApp. | [`site/`](site/) |
| 💬 **WhatsApp** | Automação do atendimento pela **WhatsApp Business Platform (Cloud API)**: agendamento por botões fixos, sem nenhuma IA, com confirmação e lembretes. | [`whatsapp/`](whatsapp/) |

Cada módulo roda, é testado e vai para produção sozinho. Dá para publicar só o
site, só a automação, ou os dois — e times diferentes podem tocar cada um sem
esbarrar no outro.

Para publicar uma nova barbearia você **não mexe em código**: edita o
`barbearia.config.json` e faz o build.

---

## O que é comum

Na raiz do repositório fica **só o que os dois módulos usam**:

```
barbearia.config.json          # a barbearia: marca, cores, serviços, equipe, horários
barbearia.config.example.json  # o exemplo, com todos os campos preenchidos
shared/                        # a base comum: schema do config + utilitários
tsconfig.base.json             # opções de TypeScript comuns
package.json                   # os workspaces npm
```

O mesmo `barbearia.config.json` alimenta os dois lados — **mudou o preço no
site, mudou no WhatsApp**. Ele pode até estar vazio (`{}`): nesse caso tudo sobe
com a identidade padrão, e cada campo preenchido substitui o seu padrão.

```bash
cp barbearia.config.example.json barbearia.config.json
```

A referência de cada campo está no módulo que o consome:

- campos visuais — marca, cores, fotos, seções: [`site/README.md`](site/README.md)
- campos de agenda e atendimento — `booking` e `whatsapp`: [`whatsapp/README.md`](whatsapp/README.md)

E o que os dois leem do mesmo jeito (`contact`, `services`, `team`, `hours`)
está descrito em [`shared/README.md`](shared/README.md), com o link para o lado
que usa cada pedaço.

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
npm run tenant:sync    # carrega o config das barbearias
npm run dev            # API + worker das mensagens programadas
```

O passo a passo completo, da conta na Meta até o bot respondendo no celular,
está em [`whatsapp/docs/setup.md`](whatsapp/docs/setup.md).

---

## Customizar o atendimento

O **estúdio** edita as duas metades do atendimento: o que o bot **fala** (os
textos) e aquilo sobre o que ele fala (serviços, equipe, horários, endereço e as
regras da agenda). Tudo vai para o `barbearia.config.json` da barbearia e é
sincronizado com o banco na hora.

```bash
npm run textos:studio -w @barbearia/whatsapp   # http://localhost:4321
```

Ele roda **só na sua máquina** — não vai para o deploy, não pede login e escuta
em `127.0.0.1`. O seletor no topo escolhe a barbearia; as abas dividem o
trabalho:

| Aba | O que edita |
|---|---|
| **Textos** | as frases do bot, em cinco grupos: *Cliente*, *Dono*, *Barbeiro*, *Botões e listas* e *Templates da Meta* |
| **Serviços** | nome, preço, duração — e os campos que só a landing page usa (descrição, foto, destaque) |
| **Equipe** | quem é barbeiro, quem aceita agendamento pelo WhatsApp e **o WhatsApp de cada um** — é ele que abre o painel do barbeiro |
| **Horários** | as faixas de cada dia; sem faixa, o dia é fechado |
| **Marca e contato** | nome da barbearia, endereço, mapa, telefones |
| **Regras da agenda** | passo da grade, antecedência, limite por cliente, prazo de cancelamento |
| **Atendimento** | formas de pagamento, link de avaliação, **os números do dono**, o painel do dono e as mensagens programadas |

Em qualquer aba:

| | |
|---|---|
| **Prévia** | monta a mensagem pelos mesmos construtores que o bot usa, já com a sua edição — inclusive o serviço que você acabou de digitar |
| **Variáveis** | nos textos, os chips (`{marca}`, `{servico}`, `{data}`…) entram onde o cursor estiver |
| **Contador** | mostra o limite da Cloud API — passou, a Meta corta, e a prévia mostra o corte |
| **Salvar** | grava no `barbearia.config.json`, sincroniza com o Postgres e invalida o cache — **a próxima mensagem do cliente já sai com o conteúdo novo, sem reiniciar nada** |
| **Publicar** | mostra o diff, pede a mensagem do commit e faz `add`, `commit` e `push` na branch atual (recusa na `master`) |

> **Renomear é seguro.** Cada serviço e cada barbeiro tem um identificador fixo
> (`slug`) gravado no config, e é ele — não o nome — que liga o item às linhas do
> banco. Trocar "Corte Degradê" por "Corte na Máquina" renomeia o mesmo serviço;
> os agendamentos que já existiam continuam apontando para ele. **Remover** um
> item o tira do menu e do site e desativa a linha no banco, mas os agendamentos
> futuros continuam valendo — o estúdio avisa quantos são antes de confirmar.

O estúdio precisa do banco de pé (`docker compose up -d`) só para aplicar na
hora; sem ele, o arquivo é gravado do mesmo jeito e o rodapé avisa que a
sincronização não rolou.

Só o que você mudou vai para o arquivo: texto igual ao padrão não é gravado,
*voltar ao padrão* remove a chave, e seção que não mudou não é reescrita — o
diff do commit mostra as linhas que você mexeu, e nada além. A referência das
chaves de texto está em
[`whatsapp/README.md`](whatsapp/README.md#os-textos-do-bot).

**Serviços e equipe também alimentam o site.** É o mesmo
`barbearia.config.json`: mudou o preço no estúdio, mudou na landing page no
próximo build.

> **Templates da Meta** (lembretes, reativação, aniversário) são a exceção:
> editar no estúdio **não muda o que a Meta envia**. Eles são aprovados no
> WhatsApp Manager, e o texto novo só vale depois da reaprovação — a aba avisa
> isso e serve para gerar o corpo que você cola lá.

**Os dois de uma vez, da raiz:**

```bash
npm run test        # a suíte inteira: base comum + WhatsApp
npm run typecheck   # TypeScript dos três workspaces
```

Cada módulo também aceita os comandos dele direto:
`npm run <script> -w @barbearia/site` ou `-w @barbearia/whatsapp`.

---

## Mapa do repositório

```
barbearia.config.json          # comum aos dois módulos
barbearia.config.example.json
tsconfig.base.json

shared/                        # base comum (@barbearia/shared)
  src/config/                  # tipos, padrões e validação do JSON
  src/config/textos.ts         # o catálogo de tudo que o bot fala
  src/lib/                     # cores, horários, textos e links de WhatsApp/mapa

site/                          # MÓDULO 1 — landing page (@barbearia/site)
  index.html
  vite.config.ts
  src/config/                  # carrega o barbearia.config.json da raiz
  src/components/              # Header, Hero, Services, Gallery, Team, ...
  src/hooks/                   # scroll, relógio, animação de entrada
  src/lib/                     # tema (variáveis CSS) e imagens
  src/styles/index.css
  README.md                    # documentação do site

whatsapp/                      # MÓDULO 2 — automação (@barbearia/whatsapp)
  .env.example                 # segredos do servidor, campo a campo
  docker-compose.yml           # Postgres de desenvolvimento
  tenants/<slug>/              # config de cada barbearia atendida
  src/whatsapp/                # cliente, webhook, assinatura, payloads, limites
  src/bot/                     # máquina de estados, telas, menu do dono
  src/booking/                 # horários livres, duração, reserva
  src/scheduler/               # fila de saída, worker, rotinas diárias
  src/db/                      # migrations e repositórios
  src/tenants/                 # cadastro e cache das barbearias
  src/studio/                  # o estúdio dos textos (local, fora do deploy)
  docs/setup.md                # do zero até o bot no ar
  docs/templates.md            # templates prontos para a Meta
  README.md                    # documentação da automação
```

**Como os módulos se falam:** eles não se falam. Nenhum dos dois importa o
outro; os dois importam `@barbearia/shared`, que só conhece o formato do
`barbearia.config.json`. É a única dependência entre eles, e é de leitura.

```
        barbearia.config.json
                  │
         @barbearia/shared
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

A lógica que erra caro é testada sem rede e sem banco: geração de horários,
a máquina de estados do menu inteira, a assinatura do webhook, os limites de
tamanho da Meta e a validação do config. Os testes que precisam de Postgres são
pulados quando não há banco configurado — veja
[`whatsapp/README.md`](whatsapp/README.md#testes).
