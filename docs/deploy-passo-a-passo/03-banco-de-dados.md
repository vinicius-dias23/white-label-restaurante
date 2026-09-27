# Etapa 3 — Banco de dados

**Um Postgres para todos os restaurantes.** A separação não é por banco nem por
schema: é a coluna `tenant_id` nas tabelas. Um restaurante novo não cria banco
nenhum — cria uma linha em `tenants`.

Serve qualquer Postgres 14+ gerenciado: **Render Postgres**, **Neon**,
**Supabase**, **Railway** ou **RDS**. Este guia não recomenda um — recomenda os
requisitos abaixo.

---

## 3.1 O que o banco precisa ter

| Requisito | Por quê |
|---|---|
| **Postgres 14 ou superior** | É o que as migrações assumem |
| **Backup automático diário** | O banco guarda as reservas de todos os clientes. Perder é o pior cenário do projeto |
| **SSL obrigatório** | O servidor se conecta pela internet pública |
| **A mesma região do serviço na Render** (`virginia`) | Cada toque no bot faz várias consultas; o que soma não é o salto do celular até o servidor, é o servidor conversar com um banco longe |
| **Pelo menos 20 conexões** no plano | O `DATABASE_POOL_MAX=10` mais folga para migração e CLI |

> ⚠️ **Não use um banco que hiberna** por inatividade (alguns planos gratuitos
> fazem isso). O worker de lembretes acorda a cada 30 segundos, e um banco
> dormindo às 2h da manhã é um lembrete que não sai. A regra vale para o
> servidor também: o plano `free` da Render hiberna, e por isso o `render.yaml`
> fixa `plan: starter` ([etapa 5](05-render.md#51-o-que-já-está-no-repositório)).

> **Sobre a região.** A Render não tem região no Brasil — a mais próxima é
> `virginia`. Escolher o banco em São Paulo "porque o cliente é brasileiro" é o
> erro caro aqui: cada mensagem viraria dezenas de idas e vindas atravessando o
> continente. Banco e servidor juntos, e o único salto longo é o do celular até
> a Render.

---

## 3.2 As variáveis de conexão

Do painel do provedor, copie a *connection string*. As três variáveis que o
servidor usa:

```
DATABASE_URL=postgres://usuario:senha@host:5432/banco
DATABASE_SSL=true          # praticamente todo banco gerenciado exige
DATABASE_POOL_MAX=10       # 10 aguenta bem 5 restaurantes
```

Guarde a `DATABASE_URL` no seu gerenciador de senhas **agora**. Ela vai para o
ambiente do serviço na Render, na [etapa 5](05-render.md) — e alguns provedores só mostram a senha
uma vez.

> Alguns provedores (Neon, por exemplo) já entregam a URL com `?sslmode=require`.
> Manter `DATABASE_SSL=true` junto não faz mal.

---

## 3.3 Rodar as migrações

A migração cria `tenants`, os ambientes (`areas`), a equipe (`staff`), as
reservas, os bloqueios (`time_blocks`), os clientes e a `outbox` (a fila de
mensagens programadas). O script é o `db:migrate`.

**A primeira vez, rode da sua máquina** — é mais simples do que esperar o servidor
existir:

```bash
cd whatsapp
cp .env.example .env      # se ainda não existir
```

No `whatsapp/.env`, preencha **só o necessário para migrar**:

```
DATABASE_URL=postgres://...   # a de produção
DATABASE_SSL=true
```

E rode:

```bash
npm run db:migrate -w @restaurante/whatsapp
```

> ⚠️ **`npm run db:reset` apaga tudo.** Ele existe para desenvolvimento. Nunca o
> aponte para a `DATABASE_URL` de produção — não há confirmação, não há desfazer.

Depois da [etapa 5](05-render.md), o caminho passa a ser de dentro do servidor, e é
o preferido (a senha nunca sai de lá):

```bash
render ssh restaurante-whatsapp -- 'npm run db:migrate -w @restaurante/whatsapp'
```

---

## 3.4 Confira que as tabelas existem

```bash
psql "$DATABASE_URL" -c '\dt'
```

Você deve ver, entre outras, `tenants`, `areas`, `reservations` e `outbox`. A
que importa agora é a `tenants` — é ela que a [etapa 7](07-cadastro-restaurantes.md)
vai preencher:

```bash
psql "$DATABASE_URL" -c 'SELECT slug, phone_number_id, active FROM tenants;'
# (0 rows)   ← certo. Ainda não cadastramos ninguém.
```

Sem `psql` instalado, dá para conferir pelo console web do provedor — todos têm um.

---

## 3.5 A chave de criptografia

Os tokens da Meta de cada restaurante ficam **criptografados** no banco
(AES-256-GCM). A chave não fica no banco: fica no ambiente do servidor. Gere-a
agora, junto do banco, porque as duas coisas precisam ser guardadas juntas:

```bash
openssl rand -base64 32     # APP_ENCRYPTION_KEY
```

> ⚠️ **É o segredo mais delicado do projeto.** Perdeu ou trocou a chave, os
> tokens salvos viram lixo e **todos os restaurantes precisam ser cadastrados de
> novo**. Guarde-a **junto do backup do banco**, e nunca rode dois ambientes com
> chaves diferentes contra o mesmo banco.

Guarde os outros dois segredos do servidor no mesmo lugar, de uma vez:

```bash
openssl rand -hex 32        # META_VERIFY_TOKEN  (o mesmo valor vai no painel da Meta)
openssl rand -hex 32        # ADMIN_API_TOKEN    (protege as rotas /admin/*)
```

---

## ✅ Antes de seguir

- [ ] O banco é Postgres 14+, com SSL e backup diário, e **não hiberna**
- [ ] Você tem a `DATABASE_URL` guardada no gerenciador de senhas
- [ ] `npm run db:migrate` rodou sem erro
- [ ] `SELECT ... FROM tenants` responde (com 0 linhas)
- [ ] `APP_ENCRYPTION_KEY`, `META_VERIFY_TOKEN` e `ADMIN_API_TOKEN` gerados e guardados

**Próximo:** [`04-meta-whatsapp.md`](04-meta-whatsapp.md) — a etapa com espera de
terceiro. Comece por ela assim que possível.
