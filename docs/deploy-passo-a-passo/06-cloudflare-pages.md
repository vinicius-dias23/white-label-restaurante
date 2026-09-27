# Etapa 6 — Cloudflare Pages: os sites

**Um projeto e um domínio por barbearia.** Cada site é um build estático
diferente, com o config daquela barbearia embutido — o site não decide nada em
tempo de execução, porque não há servidor para decidir.

Esta etapa se repete **por barbearia**. O exemplo usa `studio-max` /
`studiomaxbarber.com.br`.

---

## 6.1 Confira o build antes de publicar

Nunca crie um projeto no painel sem antes ver o site rodando na sua máquina:

```bash
cd site
TENANT=studio-max npm run build       # → site/dist/studio-max/
npx vite preview --outDir dist/studio-max
```

Abra e confira **três coisas**:

- [ ] As cores são as da barbearia (não o roxo da demonstração)
- [ ] O título da aba tem o nome dela, não "Barbearia"
- [ ] O botão do WhatsApp leva para **o número dela**

E confira o que **deve** falhar:

```bash
TENANT=nao-existe npm run build
# ✖ TENANT="nao-existe" não existe: .../whatsapp/tenants/nao-existe/barbearia.config.json
```

Essa trava é o que impede publicar o site de um cliente com o conteúdo de
demonstração — e o `ci.yml` a verifica em todo PR.

> Se alguma foto aparecer como um retângulo escuro, o caminho no config está
> errado. As fotos vivem em `whatsapp/tenants/<slug>/public/fotos/` e o config
> aponta para `"/fotos/hero.jpg"` — sem o `public/`.

---

## 6.2 O manifesto de deploy

`deploy/tenants.json` é quem existe, em que domínio, ligada ou não. **É o
workflow que lê este arquivo** para saber o que publicar.

```json
{ "slug": "studio-max", "dominio": "studiomaxbarber.com.br", "ativo": true }
```

Regra que evita muita dor de cabeça: **o `slug` aqui é o mesmo nome da pasta em
`whatsapp/tenants/` e o mesmo `--slug` do `tenant:add`.** Um identificador só, do
site ao banco.

```bash
npm run deploy:check
# ✔ 5 barbearia(s) no manifesto, 2 ativa(s) — tudo no lugar
```

Ele recusa quando um slug ativo não tem `barbearia.config.json`, quando o JSON
está quebrado, quando o slug tem caractere inválido ou quando dois domínios se
repetem.

> **`"ativo": false` é o interruptor.** Uma barbearia com o config ainda em
> preenchimento fica `false` e o workflow simplesmente a ignora — nada quebra.

---

## 6.3 Criar o projeto no Cloudflare Pages

Uma vez por barbearia, da raiz do repositório:

```bash
npx wrangler pages project create barbearia-studio-max --production-branch=master
```

**O nome do projeto é sempre `barbearia-<slug>`** — é exatamente o que o
`deploy-site.yml` monta:

```yaml
--project-name="barbearia-${{ matrix.tenant.slug }}"
```

Errar o nome aqui é o motivo nº 1 de "o workflow ficou verde mas o site não
mudou": o wrangler cria um projeto novo em vez de publicar no que tem o domínio.

Publique uma vez à mão, para conferir a ponta a ponta:

```bash
cd site
TENANT=studio-max npm run build
npx wrangler pages deploy dist/studio-max --project-name=barbearia-studio-max
```

Ele devolve uma URL `.pages.dev`. Abra: é o site da barbearia, sem domínio ainda.

---

## 6.4 O domínio

> Painel do Cloudflare → **Workers & Pages** → `barbearia-studio-max` →
> **Custom domains** → *Set up a domain* → `studiomaxbarber.com.br`

O TLS é emitido sozinho em alguns minutos, sem você fazer nada.

No DNS do domínio (que costuma estar com o cliente, no Registro.br ou GoDaddy):

| Tipo | Nome | Valor |
|---|---|---|
| `CNAME` | `www` | `barbearia-studio-max.pages.dev` |
| `CNAME` (ou `ALIAS`/`ANAME`) | `@` | `barbearia-studio-max.pages.dev` |

> ⚠️ **`CNAME` na raiz (`@`) não é permitido no DNS clássico.** Se o registrador
> não oferecer `ALIAS`/`ANAME`, o caminho limpo é **transferir o DNS do domínio
> para a Cloudflare** — só o DNS; o domínio continua sendo do cliente. A
> Cloudflare achata CNAME na raiz. Para poucas barbearias é meia hora de trabalho
> e resolve o problema de vez.

Escolha também **um** endereço canônico e mande o outro para ele (`www` → raiz,
ou o contrário). Sem isso, o Google indexa os dois como sites diferentes.

Verificação:

```bash
curl -sI https://studiomaxbarber.com.br | head -1
# HTTP/2 200
```

A propagação de DNS pode levar horas. Enquanto isso, o `.pages.dev` já funciona.

---

## 6.5 Daqui em diante, quem publica é o GitHub

Com os dois secrets da Cloudflare no repositório, o `deploy-site.yml` cuida de
tudo:

```bash
git add whatsapp/tenants/studio-max deploy/tenants.json
git commit -m "Adiciona a Studio Max Barber"
git push
```

O que ele faz, nesta ordem: roda o `deploy:check` → lê o manifesto → monta uma
matriz com as barbearias **ativas** → builda cada uma com o seu `TENANT` → publica
com o wrangler. Até cinco em paralelo, com `fail-fast: false`.

Para publicar **uma só**, sem esperar as demais:

> Actions → **Deploy site** → *Run workflow* → campo `tenant`: `studio-max`

> **Trocou o preço de uma barbearia?** O push mexe em
> `whatsapp/tenants/<slug>/barbearia.config.json`, o workflow dispara e **todas**
> as ativas são reconstruídas. Com poucas barbearias isso é rápido e não incomoda;
> com muitas, o caminho é buildar só o que mudou —
> [`../escala-100.md`](../escala-100.md#builds-incrementais).

---

## 6.6 Quando o painel começar a incomodar

Um projeto por barbearia é o caminho recomendado **até ~20**. Acima disso, o
caminho é um projeto só, com todos os builds sob o prefixo do seu slug e um
Worker na frente roteando por `Host` — mais o Cloudflare for SaaS para emitir os
certificados por API. Está em
[`../escala-100.md`](../escala-100.md#o-site-com-100-domínios).

A migração **não muda uma linha do build**. Comece pelo simples.

---

## ✅ Antes de seguir (por barbearia)

- [ ] `TENANT=<slug> npm run build` roda, e o preview mostra a marca certa
- [ ] `TENANT=nao-existe npm run build` **falha**
- [ ] A barbearia está em `deploy/tenants.json` com `"ativo": true`
- [ ] `npm run deploy:check` passa
- [ ] O projeto no Pages se chama exatamente `barbearia-<slug>`
- [ ] `curl -sI https://<dominio>` devolve `HTTP/2 200`
- [ ] `www` e raiz apontam para o mesmo lugar, com um redirecionando para o outro

**Próximo:** [`07-cadastro-barbearias.md`](07-cadastro-barbearias.md)
