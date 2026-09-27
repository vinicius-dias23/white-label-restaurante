# Etapa 9 — Rotina depois do deploy

O que você faz na semana seguinte, e no ano seguinte. Atualizar, reverter e
diagnosticar sem improvisar.

---

## 9.1 O que dispara o quê

A pergunta que mais aparece é "isso precisa de deploy?". A resposta:

| Você mudou | Dispara | Precisa de deploy? |
|---|---|---|
| `whatsapp/tenants/<slug>/barbearia.config.json` | `deploy-site.yml` | **Site sim** (rebuild). **Bot não** — `tenant:sync`, vale em 60s |
| Fotos em `whatsapp/tenants/<slug>/public/` | `deploy-site.yml` | Sim, rebuild daquele tenant |
| `deploy/tenants.json` | `deploy-site.yml` | Sim |
| `site/**` ou `shared/**` | `deploy-site.yml` | Sim, **todas** as barbearias ativas |
| `whatsapp/src/**`, `Dockerfile`, `render.yaml` | o auto-deploy da Render (`buildFilter`) | Sim, o servidor |
| **Barbearia nova** | nada, no servidor | **Não.** `tenant:add` + criar o projeto no Pages |
| Token da Meta expirou | nada | Não. `tenant:add` de novo, mesmo slug (é upsert) |
| Migração de banco | nada | **Manual e deliberado**, por `render ssh` |

A migração ser manual é de propósito: uma migração que apaga coluna, disparada
por um merge distraído, é irreversível.

---

## 9.2 Mudança de preço, horário ou equipe

O caminho completo, sem pular passo:

```bash
# 1. editar
$EDITOR whatsapp/tenants/studio-max/barbearia.config.json

# 2. o bot — vale em até 60 segundos, sem deploy
render ssh barbearia-whatsapp -- 'npm run tenant:sync -w @barbearia/whatsapp'

# 3. o site — precisa de rebuild
git add whatsapp/tenants/studio-max/barbearia.config.json
git commit -m "Atualiza os preços da Studio Max"
git push
```

### Quando o deploy traz uma migration

Deploy que inclui migration tem uma ordem obrigatória, e ela é o contrário da
intuição: **a migration vem ANTES do push.**

```bash
render ssh barbearia-whatsapp -- 'npm run db:migrate -w @barbearia/whatsapp'
git push
```

O motivo: o `Dockerfile` termina em `npm run start`, e não roda migration
nenhuma. Se o código novo subir primeiro, ele consulta uma coluna que ainda não
existe — e como o `getTenantContext` é o caminho de TODA mensagem, o bot cai
para todas as barbearias de uma vez. A migration é compatível com o código
antigo (coluna nova com valor padrão), então rodá-la antes não quebra nada.

**Fazer o 2 e esquecer o 3** deixa o site anunciando um preço que o bot não
pratica. É a inconsistência mais comum, e o cliente descobre antes de você.

---

## 9.3 Reverter

### O site

O Cloudflare Pages guarda todos os deploys. O caminho rápido é o painel:

> Workers & Pages → `barbearia-<slug>` → **Deployments** → o deploy anterior →
> **Rollback to this deployment**

Vale em segundos, e não depende do git. Depois, conserte o código e publique
normalmente — senão o próximo push traz o problema de volta.

### O servidor

> painel da Render → serviço `barbearia-whatsapp` → **Deploys** → o deploy
> anterior → **Rollback to this deploy**

Ela reusa a imagem já construída, então volta em segundos e não depende do git.

Ou, mais simples e quase sempre suficiente: `git revert` do commit ruim e push. A
Render republica sozinha e só promove a versão nova depois que o `/health` passa
— um deploy quebrado não substitui o que está no ar.

> ⚠️ **Reverter código não reverte migração.** Se a versão ruim rodou uma
> migração, voltar o código deixa o banco à frente. Por isso migração é manual.

### Uma barbearia

Para tirar uma do ar sem mexer nas outras:

```bash
# o bot para de atender aquele número
psql "$DATABASE_URL" -c "UPDATE tenants SET active = false WHERE slug = 'studio-max';"
```

E no `deploy/tenants.json`, `"ativo": false` — o workflow deixa de publicar o
site dela. O projeto no Pages continua existindo; o site fica no ar como está.

---

## 9.4 Quando algo para de funcionar

| Sintoma | Onde olhar |
|---|---|
| **"O bot não responde"** | `/health` primeiro. Depois `render logs -r barbearia-whatsapp --tail`, procurando `mensagem para um número que não é de nenhuma barbearia cadastrada` |
| **Uma barbearia só não responde** | `tenant:list` — ela está `[ativa]`? O `phone_number_id` bate? A WABA dela está assinada no app? |
| **"O lembrete não chegou"** | `/admin/<slug>/fila`. **Cheia** = o worker morreu. **Vazia** = template não aprovado ou flag desligada |
| **Erro 132000 no log** | A ordem das variáveis do template no WhatsApp Manager não bate com o código |
| **Erro 132001** | Nome ou idioma do template diferente do que está no `.env` |
| **Erro 131026** | Número inválido, ou o destinatário não tem WhatsApp |
| **O bot parou de responder "do nada", ~24h depois de cadastrar** | Você usou o token de teste. Refaça com o **token permanente** |
| **Workflow verde, site não mudou** | O `--project-name` não bate com `barbearia-<slug>`, ou a barbearia está `"ativo": false` |
| **Site com o conteúdo da demonstração** | O build rodou sem `TENANT`. O CI tem uma trava para isso — confira se ela está passando |
| **Domínio não abre** | DNS ainda propagando, ou `CNAME` na raiz não suportado pelo registrador |

---

## 9.5 O que monitorar

Três alarmes cobrem quase tudo:

1. **`/health` falhando** — o servidor caiu, ou o banco caiu junto. É o único que
   derruba todas as barbearias de uma vez.
2. **A fila da `outbox` crescendo** — o worker parou. Ninguém recebe lembrete, e
   **nenhum erro aparece** até o cliente reclamar de horário perdido. É a falha
   mais silenciosa do projeto.
3. **Erros 131026 / 132001 no log** — número inválido ou template reprovado, por
   barbearia. Um pico aqui é uma barbearia inteira parada.

Vale acompanhar também, no WhatsApp Manager, a **qualidade de cada número**. Ela
cai quando o cliente denuncia ou bloqueia, e derruba o limite diário de mensagens
— é o indicador que avisa **antes** de o número ser restringido.

---

## 9.6 Manutenção que tem prazo

| Quando | O quê |
|---|---|
| **Trimestral** | Conferir que o backup do banco **restaura** (backup que nunca foi testado não é backup) |
| **Trimestral** | Subir o `META_GRAPH_VERSION` de propósito, testando. A Meta aposenta versões antigas com aviso prévio |
| **Semestral** | Rodar `npm audit` e atualizar dependências, com o CI como rede |
| **Sempre que trocar** | A `APP_ENCRYPTION_KEY` **nunca** deve ser trocada sem plano: todos os tokens viram lixo e todas as barbearias precisam ser recadastradas |
| **Ao passar de ~20 números** | Reavaliar a decisão de WABA única — [`../deploy-whatsapp.md`](../deploy-whatsapp.md#2-decida-antes-uma-waba-ou-uma-por-barbearia) |
| **Ao passar de ~20 sites** | Migrar para o projeto único com Worker — [`../escala-100.md`](../escala-100.md) |

---

## 9.7 Barbearia nova, daqui em diante

Com a infraestrutura de pé, você **não repete este guia**. O checklist de ~30
minutos está em [`../onboarding-tenant.md`](../onboarding-tenant.md):

```
1. cp -r whatsapp/tenants/<modelo> whatsapp/tenants/<slug>   e editar
2. fotos em whatsapp/tenants/<slug>/public/fotos/
3. TENANT=<slug> npm run build                    → conferir local
4. deploy/tenants.json                            → slug + domínio + ativo
5. Meta: número → phone_number_id + waba_id + token permanente
6. npm run tenant:add -- --slug=... --phone-number-id=... --token=...
7. npx wrangler pages project create barbearia-<slug> + apontar o domínio
8. git push                                       → o CI publica
9. aceite: menu, agendamento, confirmação, lembrete, site no celular
```
