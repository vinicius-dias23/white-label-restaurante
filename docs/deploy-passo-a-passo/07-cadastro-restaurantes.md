# Etapa 7 — Cadastrar os restaurantes

A infraestrutura está de pé. Falta ligar as duas pontas: dizer ao servidor que o
número `109876543210988` é o Sushi Kaze, com o cardápio, os ambientes, a
lotação de cada um e os horários dele.

**Isto não é deploy.** É um comando contra o banco. O servidor descobre o
restaurante novo sozinho, em até 60 segundos, sem reiniciar.

---

## 7.1 Como o servidor sabe de quem é a mensagem

Todo webhook da Meta diz **para qual número** a mensagem foi:

```json
{ "entry": [{ "changes": [{ "value": {
  "metadata": { "phone_number_id": "109876543210987" },
  "messages": [ ... ]
} }] }] }
```

O [`registry.ts`](../../whatsapp/src/tenants/registry.ts) troca esse ID pelo
restaurante — dados, ambientes, equipe e o **token dele** — com cache de 60
segundos. Número que não está na tabela `tenants` vira um aviso no log e a
mensagem é descartada.

Por isso: **uma URL de webhook, um `.env`, nenhum deploy por restaurante.**

---

## 7.2 A pasta do restaurante

Se ainda não fez na etapa 6:

```bash
cp -r whatsapp/tenants/cantina-bella-nonna whatsapp/tenants/sushi-kaze
$EDITOR whatsapp/tenants/sushi-kaze/restaurante.config.json
```

Preencha na ordem: `brand` → `colors.brand` → `contact` → `hero` → `menu` →
`areas` → `team` → `hours` → `booking`. As referências de campo estão em
[`../../site/README.md`](../../site/README.md) (visual) e
[`../../whatsapp/README.md`](../../whatsapp/README.md) (`areas`, `booking` e
`whatsapp`).

**Este mesmo arquivo alimenta o site e o bot.** É o que garante que o preço da
landing page é o preço que o bot mostra no cardápio, e que o ambiente com
"Reservar aqui" no site é o mesmo que o bot oferece.

> **A lotação de cada ambiente (`areas[].capacity`) é o número que mais importa
> aqui.** É em pessoas, não em mesas, e é ele que decide se um horário aparece.
> Pergunte ao dono quantas pessoas ele senta **de verdade** em cada ambiente
> numa noite cheia — não a capacidade do alvará.

---

## 7.3 `tenant:add` — o restaurante novo

O comando cria o restaurante e guarda o token **criptografado** no banco:

```bash
npm run tenant:add -w @restaurante/whatsapp -- \
  --slug=sushi-kaze \
  --phone-number-id=109876543210988 \
  --waba-id=987654321098765 \
  --token='EAAG...' \
  --owner='(11) 91234-5678' \
  --timezone=America/Sao_Paulo
```

**Em produção, rode de dentro do servidor** — assim a `APP_ENCRYPTION_KEY` e a
`DATABASE_URL` nunca saem de lá:

```bash
render ssh restaurante-whatsapp -- 'npm run tenant:add -w @restaurante/whatsapp -- \
  --slug=sushi-kaze \
  --phone-number-id=109876543210988 \
  --waba-id=987654321098765 \
  --token=EAAG... \
  --owner="(11) 91234-5678"'
```

> A alternativa é rodar da sua máquina com a `DATABASE_URL` e a
> `APP_ENCRYPTION_KEY` de produção no ambiente. Funciona, mas coloca a chave de
> criptografia no seu terminal e no histórico do shell. Prefira o `render ssh`.

O `--token` é o **permanente**, de usuário do sistema, da
[etapa 4](04-meta-whatsapp.md#44-o-token-permanente). O do painel de teste expira
em 24h.

Ele confirma o que leu do config:

```
✔ Sushi Kaze cadastrado (sushi-kaze)
   2 ambiente(s), 2 pessoa(s) na equipe
```

Repita para cada restaurante. Depois:

```bash
render ssh restaurante-whatsapp -- 'npm run tenant:list -w @restaurante/whatsapp'
```

```
2 restaurante(s):

  cantina-bella-nonna      Cantina Bella Nonna          109876543210987  [ativo]
  sushi-kaze               Sushi Kaze                   109876543210988  [ativo]
```

**Confira os `phone_number_id` contra a tabela da etapa 4, um por um.** Trocar
dois é o erro clássico, e o sintoma é o cliente de um restaurante vendo o cardápio
do outro.

---

## 7.4 `tenant:sync` — quando o config muda

Mudou cardápio, ambiente, lotação, horário ou equipe:

```bash
$EDITOR whatsapp/tenants/sushi-kaze/restaurante.config.json
render ssh restaurante-whatsapp -- 'npm run tenant:sync -w @restaurante/whatsapp'
```

O `tenant:sync` lê **todas** as pastas em `whatsapp/tenants/` e grava no banco.
Ele **não precisa de token**: restaurante que já existe tem o config atualizado e o
número preservado.

O cache do registry expira em 60 segundos, e o menu novo passa a valer sozinho —
**sem deploy, sem reiniciar**.

> ⚠️ **O bot atualiza sozinho; o site não.** O mesmo arquivo alimenta os dois, e o
> site é estático — ele **precisa de rebuild**. Preço mudado só no bot e não no
> site é o tipo de coisa que o cliente descobre antes de você. Faça o `git push`
> junto: ele dispara o `deploy-site.yml` (o `paths` inclui `whatsapp/tenants/**`).

```bash
git add whatsapp/tenants/sushi-kaze/restaurante.config.json
git commit -m "Atualiza o cardápio do Sushi Kaze"
git push
```

---

## 7.5 As duas formas de conferir

Pelo CLI, de dentro do servidor:

```bash
render ssh restaurante-whatsapp -- 'npm run tenant:list -w @restaurante/whatsapp'
```

Pela API administrativa, de qualquer lugar:

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://restaurante-whatsapp.onrender.com/admin/tenants
```

Outras rotas úteis, por restaurante:

```bash
# as reservas de hoje (ou ?dia=2026-08-22)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://restaurante-whatsapp.onrender.com/admin/sushi-kaze/reservas

# a fila de mensagens programadas (deve estar vazia ou pequena)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://restaurante-whatsapp.onrender.com/admin/sushi-kaze/fila
```

---

## 7.6 Templates, agora que o servidor conhece as WABAs

Com os restaurantes cadastrados, dá para conferir que os templates da
[etapa 4](04-meta-whatsapp.md#45-os-templates) foram aprovados **em cada WABA**:

```bash
render ssh restaurante-whatsapp -- 'npm run templates:check -w @restaurante/whatsapp'
```

Se algum aparecer como reprovado ou ausente, o lembrete daquele restaurante não vai
sair — e o sintoma é silêncio, não erro.

---

## ✅ Antes de seguir

- [ ] `tenant:list` mostra todos os restaurantes como `[ativo]`
- [ ] Cada `phone_number_id` bate com a tabela da etapa 4 (conferido **um por um**)
- [ ] `/admin/tenants` responde com o `ADMIN_API_TOKEN`
- [ ] `templates:check` não aponta template faltando
- [ ] O `git push` do config disparou o `deploy-site.yml`

**Próximo:** [`08-verificacao-final.md`](08-verificacao-final.md)
