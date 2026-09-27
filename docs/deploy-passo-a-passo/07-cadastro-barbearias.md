# Etapa 7 — Cadastrar as barbearias

A infraestrutura está de pé. Falta ligar as duas pontas: dizer ao servidor que o
número `109876543210987` é a Studio Max, com os serviços, os barbeiros e os
horários dela.

**Isto não é deploy.** É um comando contra o banco. O servidor descobre a
barbearia nova sozinho, em até 60 segundos, sem reiniciar.

---

## 7.1 Como o servidor sabe de quem é a mensagem

Todo webhook da Meta diz **para qual número** a mensagem foi:

```json
{ "entry": [{ "changes": [{ "value": {
  "metadata": { "phone_number_id": "109876543210987" },
  "messages": [ ... ]
} }] }] }
```

O [`registry.ts`](../../whatsapp/src/tenants/registry.ts) troca esse ID pela
barbearia — dados, serviços, barbeiros e o **token dela** — com cache de 60
segundos. Número que não está na tabela `tenants` vira um aviso no log e a
mensagem é descartada.

Por isso: **uma URL de webhook, um `.env`, nenhum deploy por barbearia.**

---

## 7.2 A pasta da barbearia

Se ainda não fez na etapa 6:

```bash
cp -r whatsapp/tenants/barbearia-do-ze whatsapp/tenants/studio-max
$EDITOR whatsapp/tenants/studio-max/barbearia.config.json
```

Preencha na ordem: `brand` → `colors.brand` → `contact` → `hero` → `services` →
`team` → `hours`. As referências de campo estão em
[`../../site/README.md`](../../site/README.md) (visual) e
[`../../whatsapp/README.md`](../../whatsapp/README.md) (`booking` e `whatsapp`).

**Este mesmo arquivo alimenta o site e o bot.** É o que garante que o preço da
landing page é o preço que o bot cobra.

---

## 7.3 `tenant:add` — a barbearia nova

O comando cria a barbearia e guarda o token **criptografado** no banco:

```bash
npm run tenant:add -w @barbearia/whatsapp -- \
  --slug=studio-max \
  --phone-number-id=109876543210988 \
  --waba-id=987654321098765 \
  --token='EAAG...' \
  --owner='(11) 91234-5678' \
  --timezone=America/Sao_Paulo
```

**Em produção, rode de dentro do servidor** — assim a `APP_ENCRYPTION_KEY` e a
`DATABASE_URL` nunca saem de lá:

```bash
render ssh barbearia-whatsapp -- 'npm run tenant:add -w @barbearia/whatsapp -- \
  --slug=studio-max \
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

Repita para cada barbearia. Depois:

```bash
render ssh barbearia-whatsapp -- 'npm run tenant:list -w @barbearia/whatsapp'
```

```
2 barbearia(s):

  barbearia-do-ze          Barbearia do Zé              109876543210987  [ativa]
  studio-max               Studio Max Barber            109876543210988  [ativa]
```

**Confira os `phone_number_id` contra a tabela da etapa 4, um por um.** Trocar
dois é o erro clássico, e o sintoma é o cliente de uma barbearia vendo os preços
da outra.

---

## 7.4 `tenant:sync` — quando o config muda

Mudou preço, horário ou equipe:

```bash
$EDITOR whatsapp/tenants/studio-max/barbearia.config.json
render ssh barbearia-whatsapp -- 'npm run tenant:sync -w @barbearia/whatsapp'
```

O `tenant:sync` lê **todas** as pastas em `whatsapp/tenants/` e grava no banco.
Ele **não precisa de token**: barbearia que já existe tem o config atualizado e o
número preservado.

O cache do registry expira em 60 segundos, e o menu novo passa a valer sozinho —
**sem deploy, sem reiniciar**.

> ⚠️ **O bot atualiza sozinho; o site não.** O mesmo arquivo alimenta os dois, e o
> site é estático — ele **precisa de rebuild**. Preço mudado só no bot e não no
> site é o tipo de coisa que o cliente descobre antes de você. Faça o `git push`
> junto: ele dispara o `deploy-site.yml` (o `paths` inclui `whatsapp/tenants/**`).

```bash
git add whatsapp/tenants/studio-max/barbearia.config.json
git commit -m "Atualiza os preços da Studio Max"
git push
```

---

## 7.5 As duas formas de conferir

Pelo CLI, de dentro do servidor:

```bash
render ssh barbearia-whatsapp -- 'npm run tenant:list -w @barbearia/whatsapp'
```

Pela API administrativa, de qualquer lugar:

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://barbearia-whatsapp.onrender.com/admin/tenants
```

Outras rotas úteis, por barbearia:

```bash
# a agenda
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://barbearia-whatsapp.onrender.com/admin/studio-max/agenda

# a fila de mensagens programadas (deve estar vazia ou pequena)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://barbearia-whatsapp.onrender.com/admin/studio-max/fila
```

---

## 7.6 Templates, agora que o servidor conhece as WABAs

Com as barbearias cadastradas, dá para conferir que os templates da
[etapa 4](04-meta-whatsapp.md#45-os-templates) foram aprovados **em cada WABA**:

```bash
render ssh barbearia-whatsapp -- 'npm run templates:check -w @barbearia/whatsapp'
```

Se algum aparecer como reprovado ou ausente, o lembrete daquela barbearia não vai
sair — e o sintoma é silêncio, não erro.

---

## ✅ Antes de seguir

- [ ] `tenant:list` mostra todas as barbearias como `[ativa]`
- [ ] Cada `phone_number_id` bate com a tabela da etapa 4 (conferido **um por um**)
- [ ] `/admin/tenants` responde com o `ADMIN_API_TOKEN`
- [ ] `templates:check` não aponta template faltando
- [ ] O `git push` do config disparou o `deploy-site.yml`

**Próximo:** [`08-verificacao-final.md`](08-verificacao-final.md)
