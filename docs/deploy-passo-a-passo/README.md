# Deploy passo a passo

Este é o **caminho executável**: da máquina limpa até os restaurantes no ar, em
ordem, sem decisões pendentes. Cada documento é uma etapa, e cada etapa termina
com uma verificação — se ela passa, você segue; se não passa, o problema está
naquela etapa e não na seguinte.

> **Aqui não se discute o porquê.** As decisões de arquitetura (por que o site
> decide o tenant no build, por que o WhatsApp é um servidor só, uma WABA ou
> várias) estão em [`../arquitetura.md`](../arquitetura.md),
> [`../deploy-site.md`](../deploy-site.md) e
> [`../deploy-whatsapp.md`](../deploy-whatsapp.md). Se um comando daqui parecer
> arbitrário, a explicação está lá.

---

## As ferramentas, e o que cada uma faz

| Ferramenta | Papel neste projeto | Onde aparece |
|---|---|---|
| **GitHub** | Guarda o código e **dispara os deploys**: os dois workflows em `.github/workflows/` e o auto-deploy da Render | [Etapa 2](02-github.md) |
| **GitHub Actions** | Roda CI em todo PR e publica os **sites** no push para `master` (o servidor quem publica é a Render) | [Etapa 2](02-github.md) |
| **Postgres gerenciado** (Render Postgres, Neon, Supabase ou RDS) | **Um banco para todos** os restaurantes. Guarda `tenants`, ambientes, reservas, clientes e a fila de mensagens | [Etapa 3](03-banco-de-dados.md) |
| **Meta / WhatsApp Cloud API** | O canal de conversa. **Um aplicativo** para todos; um número (`phone_number_id`) por restaurante | [Etapa 4](04-meta-whatsapp.md) |
| **Render** | Hospeda o **servidor do WhatsApp** em container, 24h por dia (o worker de lembretes precisa de processo vivo) | [Etapa 5](05-render.md) |
| **Cloudflare Pages** | Hospeda os **sites estáticos** — um projeto e um domínio por restaurante, com TLS automático | [Etapa 6](06-cloudflare-pages.md) |
| **Registrador de domínio** (Registro.br, GoDaddy…) | O DNS de cada domínio aponta para o Pages | [Etapa 6](06-cloudflare-pages.md) |

Duas metades que escalam diferente, e é de propósito: **o site é um build por
restaurante**, o **WhatsApp é um servidor para todos**.

---

## A ordem, e por que ela é esta

```
  1. Pré-requisitos          contas, CLIs, dados do cliente
        │
        ├──────────────▶  4. Meta / WhatsApp        ← COMECE EM PARALELO. A Meta
        │                    (número, tokens,          aprova templates em horas
        │                     templates)               ou dias, e não depende de você
        ▼
  2. GitHub (repo + secrets)
        │
        ▼
  3. Banco de dados  ──────────┐
        │                      │
        ▼                      ▼
  5. Render (servidor)    6. Cloudflare Pages (sites)
        │                      │
        └──────────┬───────────┘
                   ▼
  7. Cadastrar os restaurantes   (tenant:add / tenant:sync)
                   │
                   ▼
  8. Verificação final         (aceite: bot + site, do celular)
                   │
                   ▼
  9. Rotina depois do deploy   (atualizar, reverter, diagnosticar)
```

**A etapa 4 é a única que tem espera de terceiro.** Abra o aplicativo na Meta e
envie os templates para aprovação **antes** de fazer o resto — enquanto eles são
analisados, você monta a infraestrutura.

---

## Os documentos

| # | Documento | O que você termina com |
|---|---|---|
| 1 | [`01-pre-requisitos.md`](01-pre-requisitos.md) | Contas conferidas, CLIs instaladas, dados do restaurante coletados |
| 2 | [`02-github.md`](02-github.md) | Repositório com os secrets certos e o CI verde |
| 3 | [`03-banco-de-dados.md`](03-banco-de-dados.md) | `DATABASE_URL` de produção e as tabelas criadas |
| 4 | [`04-meta-whatsapp.md`](04-meta-whatsapp.md) | App, número, `phone_number_id`, token permanente e templates aprovados |
| 5 | [`05-render.md`](05-render.md) | `https://…/health` respondendo `{"ok":true}` |
| 6 | [`06-cloudflare-pages.md`](06-cloudflare-pages.md) | `https://dominio-do-restaurante` no ar com HTTPS |
| 7 | [`07-cadastro-restaurantes.md`](07-cadastro-restaurantes.md) | Restaurantes no banco, roteando pelo número certo |
| 8 | [`08-verificacao-final.md`](08-verificacao-final.md) | Aceite assinado: bot conversa, site abre, lembrete chega |
| 9 | [`09-rotina-pos-deploy.md`](09-rotina-pos-deploy.md) | Saber atualizar, reverter e diagnosticar sem improvisar |

---

## Quanto tempo leva

| Etapa | Seu tempo | Espera de terceiro |
|---|---|---|
| 1 a 3 | ~40 min | — |
| 4 (Meta) | ~30 min | **horas a dias** (aprovação de template, verificação do número) |
| 5 (Render) | ~20 min | — |
| 6 (Cloudflare + DNS) | ~15 min por restaurante | minutos a **horas** (propagação de DNS) |
| 7 a 8 | ~20 min por restaurante | 24h para conferir o lembrete |

**Primeiro restaurante: um dia de trabalho, espalhado por dois ou três dias de
calendário.** Do segundo em diante, com a infraestrutura de pé, são os ~30
minutos do [`../onboarding-tenant.md`](../onboarding-tenant.md).
