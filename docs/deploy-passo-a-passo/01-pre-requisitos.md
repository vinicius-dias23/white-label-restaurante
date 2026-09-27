# Etapa 1 — Pré-requisitos

Nada aqui publica nada. É a etapa que evita descobrir, no meio do deploy, que
falta um acesso ou um dado do cliente.

---

## 1.1 As contas

Você já tem todas — este documento assume isso. O que falta é **conferir que o
acesso é o certo**, porque o plano gratuito de algumas delas não serve.

| Conta | Precisa de | Confira assim |
|---|---|---|
| **GitHub** | Permissão de **admin** no repositório (para criar secrets) | `Settings` aparece no menu do repositório |
| **Cloudflare** | Um **Account ID** e um **API Token** com permissão de Pages | Painel → o Account ID aparece na barra lateral direita |
| **Render** | Cartão cadastrado — o servidor precisa do plano **Starter**, porque o gratuito hiberna | `render whoami` |
| **Postgres gerenciado** | Um banco vazio, com **backup automático** ligado | A `DATABASE_URL` na mão |
| **Meta Business** | Business Manager **verificado**, com acesso de admin | business.facebook.com → sua conta aparece sem aviso de pendência |
| **Registrador do domínio** | Acesso ao **painel de DNS** de cada domínio | Consegue criar um registro `CNAME` |

> ⚠️ **O acesso ao DNS costuma ser o gargalo.** O domínio quase sempre está na
> conta do cliente, e "eu peço para o meu sobrinho que fez o site" vira uma
> semana de atraso. Peça esse acesso **no primeiro dia**, não na etapa 6.

---

## 1.2 As ferramentas na sua máquina

```bash
node --version     # precisa ser 22.x — é a versão do CI e do Dockerfile
npm --version
git --version
docker --version   # só para testar a imagem localmente; o deploy builda remoto
```

Se o Node não for o 22, instale por um gerenciador de versão:

```bash
# com nvm
nvm install 22 && nvm use 22
```

As duas CLIs de deploy: a da Cloudflare roda por `npx`, sem instalar; a da
Render é instalada uma vez:

```bash
# Render
brew install render          # ou: https://render.com/docs/cli
render login

# Cloudflare — via npx, sem instalar
npx wrangler login
```

> A CLI da Render não cria o serviço (isso é o Blueprint, na
> [etapa 5](05-render.md)). Ela serve para o que você faz **depois**: rodar
> migrações e cadastrar restaurantes dentro do container, com `render ssh`, sem
> nenhum segredo passando pela sua máquina.

---

## 1.3 O repositório na sua máquina

```bash
git clone <url-do-repositorio> white-label-restaurante
cd white-label-restaurante
npm ci
```

Confira que o projeto está saudável **antes** de pensar em deploy:

```bash
npm run typecheck
npm test
npm run deploy:check
```

Os três precisam passar. O `deploy:check` lê o `deploy/tenants.json` e confere
que cada restaurante ativo tem o seu `restaurante.config.json`:

```
✔ 5 restaurante(s) no manifesto, 1 ativo(s) — tudo no lugar
```

---

## 1.4 O que coletar do restaurante

Sem isto, você chega na etapa 6 e trava. A lista completa, com o porquê de cada
item, está em [`../onboarding-tenant.md`](../onboarding-tenant.md#antes-de-começar-colete-do-cliente).
O resumo:

| O que | Vira o quê |
|---|---|
| Nome, slogan, logo | `brand` no config; título da aba |
| Cor da marca (hex) | `colors.brand`; o site inteiro sai dela |
| 10 a 15 fotos | `public/fotos/` daquele tenant |
| Pratos em destaque (nome, preço, foto) e o link do cardápio completo | `menu` — site e botão "Cardápio" do bot |
| Ambientes e **quantas pessoas cabem em cada um** | `areas` — a lotação é o que decide que horário o bot oferece |
| Tempo médio de mesa, maior grupo, a partir de quantas pessoas o dono aprova | `booking` |
| Equipe: nome, função, foto — e o WhatsApp da recepção | Site e painel da recepção |
| Horário de funcionamento (almoço e jantar) | Selo "aberto agora" e os horários oferecidos |
| Endereço completo | Mapa e rota |
| **Número que vai virar bot** | O `phone_number_id` da etapa 4 |
| Domínio e acesso ao DNS | Etapa 6 |
| WhatsApp do dono | `--owner` do `tenant:add`; recebe os avisos e aprova grupos grandes |

> ⚠️ **Diga isto ao cliente por escrito, antes de começar:** o número que entra
> na Cloud API **sai do aplicativo WhatsApp** — as conversas antigas incluídas.
> O caminho seguro é um **número novo** (um chip pré-pago resolve), com o antigo
> respondendo "reservas pelo número tal" por algumas semanas.

---

## 1.5 Decida o slug agora

O `slug` é o identificador do restaurante em **quatro lugares**: a pasta em
`whatsapp/tenants/`, o `deploy/tenants.json`, o `--slug` do `tenant:add` e o nome
do projeto no Cloudflare Pages.

Regras: **só letras minúsculas, números e hífen**. Trocar depois dá retrabalho
nos quatro.

```
Cantina Bella Nonna   →  cantina-bella-nonna
Sushi Kaze            →  sushi-kaze
```

---

## ✅ Antes de seguir

- [ ] `node --version` diz 22.x
- [ ] `render whoami` e `npx wrangler whoami` respondem
- [ ] `npm run typecheck`, `npm test` e `npm run deploy:check` passam
- [ ] Você tem a `DATABASE_URL` do Postgres gerenciado
- [ ] Você tem acesso ao painel de DNS do domínio
- [ ] O slug está escolhido e os dados do restaurante, coletados

**Próximo:** [`02-github.md`](02-github.md)
