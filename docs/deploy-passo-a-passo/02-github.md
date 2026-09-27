# Etapa 2 — GitHub: repositório, secrets e automação

O GitHub é o **gatilho de todo deploy** deste projeto. Nada sobe da sua máquina
em produção: você dá `git push` para `master`, e a publicação acontece — pelos
workflows, no caso do site, e pela própria Render, no caso do servidor. Esta
etapa deixa isso funcionando.

---

## 2.1 O que já existe no repositório

Nenhum destes arquivos precisa ser criado — confira que estão lá:

```bash
ls .github/workflows/
# ci.yml  deploy-site.yml
```

| Workflow | Quando roda | O que faz |
|---|---|---|
| **`ci.yml`** | todo PR e todo push em `master` | `typecheck`, `test`, `deploy:check`, build multi-tenant, e **prova que o build falha com um tenant inexistente** |
| **`deploy-site.yml`** | push em `master` que toque `site/`, `shared/`, `whatsapp/tenants/` ou `deploy/tenants.json` — e sob demanda | Lê o manifesto, builda cada restaurante **ativo** e publica no Cloudflare Pages |

Duas coisas que valem entender antes de confiar neles:

- **Não existe workflow de deploy do servidor.** Quem publica o WhatsApp é a
  Render, direto do push, pelo `render.yaml` na raiz ([etapa 5](05-render.md)).
  Ela conecta no repositório pelo GitHub App dela, e o `buildFilter` do arquivo
  faz o papel dos `paths:` de um workflow — inclusive o de **não** publicar
  quando entra um restaurante novo, que é `tenant:add` no banco e não código.
- **`deploy-site.yml` tem `fail-fast: false`.** Um config quebrado num
  restaurante não cancela a publicação dos outros.

---

## 2.2 Os secrets do repositório

**Sem eles, o workflow do site roda e falha.** No GitHub:

> `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

| Secret | De onde tirar | Usado por |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → ícone do perfil → *API Tokens* → *Create Token* → template **Edit Cloudflare Workers** (inclui a permissão de Pages) | `deploy-site.yml` |
| `CLOUDFLARE_ACCOUNT_ID` | Painel da Cloudflare, barra lateral direita de qualquer domínio (32 caracteres hexadecimais) | `deploy-site.yml` |

São **dois**, os dois da Cloudflare. **A Render não usa secret nenhum aqui**: a
autorização dela é o GitHub App, concedida uma vez na [etapa 5](05-render.md).

> ⚠️ **Estes são secrets do *repositório*, não do servidor.** Os segredos da
> aplicação (`DATABASE_URL`, `APP_ENCRYPTION_KEY`, tokens da Meta) **não** vão
> aqui — vão na aba *Environment* do serviço na Render, na
> [etapa 5](05-render.md#54-os-segredos-e-o-primeiro-deploy). O GitHub só precisa
> saber publicar o site; ele nunca precisa ler o banco.

Confirme, pelo painel, que os dois aparecem na lista. O GitHub não mostra o valor
de novo depois de salvo — se errar, apague e crie outro.

---

## 2.3 Proteja a `master`

`master` é a branch que publica. Um push direto e errado vai para produção.

> `Settings` → `Branches` → `Add branch ruleset`, aplicado a `master`:

- [ ] **Require a pull request before merging**
- [ ] **Require status checks to pass** → selecione o check `verificar` (o job do `ci.yml`)
- [ ] **Block force pushes**

Com isso, nenhum código chega em produção sem `typecheck`, testes e `deploy:check`
verdes.

---

## 2.4 Prove que o CI está de pé

Antes de configurar qualquer plataforma, faça o CI rodar uma vez:

```bash
git checkout -b chore/confere-ci
git commit --allow-empty -m "Confere o CI"
git push -u origin chore/confere-ci
```

Abra o PR e olhe a aba **Actions**. O job `verificar` precisa ficar verde nos
cinco passos — em especial o último, *"O build precisa falhar com um tenant
inexistente"*: é a trava que impede publicar o site de um cliente com o conteúdo
de demonstração.

Se ficar vermelho, resolva **agora**. Um CI vermelho na etapa 2 vira um deploy
misterioso na etapa 6.

---

## 2.5 Como disparar um deploy sob demanda

**O site** publica pelo `workflow_dispatch` do `deploy-site.yml` — você não
precisa de um commit:

> Aba **Actions** → **Deploy site** → **Run workflow**

O campo `tenant` publica **só aquele restaurante**; vazio = todos os ativos.

**O servidor** publica pelo painel da Render:

> serviço `restaurante-whatsapp` → **Manual Deploy** → *Deploy latest commit*

Guarde os dois — são os botões que você usa quando um deploy falhou por rede e
você só quer tentar de novo.

---

## ✅ Antes de seguir

- [ ] Os dois secrets da Cloudflare aparecem em `Settings → Secrets and variables → Actions`
- [ ] A `master` exige PR e status check
- [ ] O job `verificar` do `ci.yml` ficou **verde** numa execução real
- [ ] Você sabe onde ficam o **Run workflow** e o **Manual Deploy**

**Próximo:** [`03-banco-de-dados.md`](03-banco-de-dados.md)
