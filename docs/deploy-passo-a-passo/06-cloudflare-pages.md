# Etapa 6 — Cloudflare Pages: os sites

**Um projeto e um domínio por restaurante.** Cada site é um build estático
diferente, com o config daquele restaurante embutido — o site não decide nada em
tempo de execução, porque não há servidor para decidir.

Esta etapa se repete **por restaurante**. O exemplo usa `sushi-kaze` /
`sushikaze.com.br`.

---

## 6.1 Confira o build antes de publicar

Nunca crie um projeto no painel sem antes ver o site rodando na sua máquina:

```bash
cd site
TENANT=sushi-kaze npm run build       # → site/dist/sushi-kaze/
npx vite preview --outDir dist/sushi-kaze
```

Abra e confira **três coisas**:

- [ ] As cores são as do restaurante (não o bordô da demonstração)
- [ ] O título da aba tem o nome dele, não "Restaurante"
- [ ] O botão "Reservar mesa no WhatsApp" leva para **o número dele**

E confira o que **deve** falhar:

```bash
TENANT=nao-existe npm run build
# ✖ TENANT="nao-existe" não existe: .../whatsapp/tenants/nao-existe/restaurante.config.json
```

Essa trava é o que impede publicar o site de um cliente com o conteúdo de
demonstração — e o `ci.yml` a verifica em todo PR.

> Se alguma foto aparecer como um retângulo escuro, o caminho no config está
> errado. As fotos vivem em `whatsapp/tenants/<slug>/public/fotos/` e o config
> aponta para `"/fotos/hero.jpg"` — sem o `public/`.

---

## 6.2 O manifesto de deploy

`deploy/tenants.json` é quem existe, em que domínio, ligado ou não. **É o
workflow que lê este arquivo** para saber o que publicar.

```json
{ "slug": "sushi-kaze", "dominio": "sushikaze.com.br", "ativo": true }
```

Regra que evita muita dor de cabeça: **o `slug` aqui é o mesmo nome da pasta em
`whatsapp/tenants/` e o mesmo `--slug` do `tenant:add`.** Um identificador só, do
site ao banco.

```bash
npm run deploy:check
# ✔ 5 restaurante(s) no manifesto, 2 ativo(s) — tudo no lugar
```

Ele recusa quando um slug ativo não tem `restaurante.config.json`, quando o JSON
está quebrado, quando o slug tem caractere inválido ou quando dois domínios se
repetem.

> **`"ativo": false` é o interruptor.** Um restaurante com o config ainda em
> preenchimento fica `false` e o workflow simplesmente o ignora — nada quebra.

---

## 6.3 Criar o projeto no Cloudflare Pages

Uma vez por restaurante, da raiz do repositório:

```bash
npx wrangler pages project create restaurante-sushi-kaze --production-branch=master
```

**O nome do projeto é sempre `restaurante-<slug>`** — é exatamente o que o
`deploy-site.yml` monta:

```yaml
--project-name="restaurante-${{ matrix.tenant.slug }}"
```

Errar o nome aqui é o motivo nº 1 de "o workflow ficou verde mas o site não
mudou": o wrangler cria um projeto novo em vez de publicar no que tem o domínio.

Publique uma vez à mão, para conferir a ponta a ponta:

```bash
cd site
TENANT=sushi-kaze npm run build
npx wrangler pages deploy dist/sushi-kaze --project-name=restaurante-sushi-kaze
```

Ele devolve uma URL `.pages.dev`. Abra: é o site do restaurante, sem domínio ainda.

---

## 6.4 O domínio

> Painel do Cloudflare → **Workers & Pages** → `restaurante-sushi-kaze` →
> **Custom domains** → *Set up a domain* → `sushikaze.com.br`

O TLS é emitido sozinho em alguns minutos, sem você fazer nada.

No DNS do domínio (que costuma estar com o cliente, no Registro.br ou GoDaddy):

| Tipo | Nome | Valor |
|---|---|---|
| `CNAME` | `www` | `restaurante-sushi-kaze.pages.dev` |
| `CNAME` (ou `ALIAS`/`ANAME`) | `@` | `restaurante-sushi-kaze.pages.dev` |

> ⚠️ **`CNAME` na raiz (`@`) não é permitido no DNS clássico.** Se o registrador
> não oferecer `ALIAS`/`ANAME`, o caminho limpo é **transferir o DNS do domínio
> para a Cloudflare** — só o DNS; o domínio continua sendo do cliente. A
> Cloudflare achata CNAME na raiz. Para poucos restaurantes é meia hora de trabalho
> e resolve o problema de vez.

Escolha também **um** endereço canônico e mande o outro para ele (`www` → raiz,
ou o contrário). Sem isso, o Google indexa os dois como sites diferentes.

Verificação:

```bash
curl -sI https://sushikaze.com.br | head -1
# HTTP/2 200
```

A propagação de DNS pode levar horas. Enquanto isso, o `.pages.dev` já funciona.

---

## 6.5 Daqui em diante, quem publica é o GitHub

Com os dois secrets da Cloudflare no repositório, o `deploy-site.yml` cuida de
tudo:

```bash
git add whatsapp/tenants/sushi-kaze deploy/tenants.json
git commit -m "Adiciona o Sushi Kaze"
git push
```

O que ele faz, nesta ordem: roda o `deploy:check` → lê o manifesto → monta uma
matriz com os restaurantes **ativos** → builda cada um com o seu `TENANT` → publica
com o wrangler. Até cinco em paralelo, com `fail-fast: false`.

Para publicar **um só**, sem esperar os demais:

> Actions → **Deploy site** → *Run workflow* → campo `tenant`: `sushi-kaze`

> **Trocou o preço de um prato?** O push mexe em
> `whatsapp/tenants/<slug>/restaurante.config.json`, o workflow dispara e **todos**
> os ativos são reconstruídos. Com poucos restaurantes isso é rápido e não incomoda;
> com muitos, o caminho é buildar só o que mudou —
> [`../escala-100.md`](../escala-100.md#builds-incrementais).

---

## 6.6 Quando o painel começar a incomodar

Um projeto por restaurante é o caminho recomendado **até ~20**. Acima disso, o
caminho é um projeto só, com todos os builds sob o prefixo do seu slug e um
Worker na frente roteando por `Host` — mais o Cloudflare for SaaS para emitir os
certificados por API. Está em
[`../escala-100.md`](../escala-100.md#o-site-com-100-domínios).

A migração **não muda uma linha do build**. Comece pelo simples.

---

## ✅ Antes de seguir (por restaurante)

- [ ] `TENANT=<slug> npm run build` roda, e o preview mostra a marca certa
- [ ] `TENANT=nao-existe npm run build` **falha**
- [ ] O restaurante está em `deploy/tenants.json` com `"ativo": true`
- [ ] `npm run deploy:check` passa
- [ ] O projeto no Pages se chama exatamente `restaurante-<slug>`
- [ ] `curl -sI https://<dominio>` devolve `HTTP/2 200`
- [ ] `www` e raiz apontam para o mesmo lugar, com um redirecionando para o outro

**Próximo:** [`07-cadastro-restaurantes.md`](07-cadastro-restaurantes.md)
