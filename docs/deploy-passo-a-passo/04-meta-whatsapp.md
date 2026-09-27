# Etapa 4 — Meta: aplicativo, números e templates

Esta é a etapa **mais lenta e menos previsível**, porque parte dela depende da
análise da Meta. Comece por ela cedo: enquanto os templates são aprovados, você
monta o resto da infraestrutura.

**A regra que organiza tudo:** um **aplicativo** na Meta atende **todos** os
restaurantes. O que muda de um para outro é o **número** — o `phone_number_id` —
e ele fica no banco, não no `.env`.

> Se você nunca subiu o bot nem para um restaurante, o caminho do zero (criar
> conta na Meta, número de teste grátis, primeiro "oi" respondido) está em
> [`../../whatsapp/docs/setup.md`](../../whatsapp/docs/setup.md). Este documento
> continua de lá.

---

## 4.1 Decida antes: uma WABA ou uma por restaurante

WABA é a *WhatsApp Business Account* — a conta que segura os números **e os
templates**. É a decisão mais consequente desta etapa, porque mudar depois dá
trabalho.

**Para começar, use uma WABA para todos.** Templates aprovados uma vez só valem
para todos os números, e é uma economia enorme de tempo. Passe para uma WABA por
restaurante quando você passar de ~20 números, quando um cliente exigir ser dono do
número dele, ou quando um restaurante com qualidade ruim começar a ameaçar os
outros.

A comparação completa está em
[`../deploy-whatsapp.md`](../deploy-whatsapp.md#2-decida-antes-uma-waba-ou-uma-por-restaurante).
O código não muda: `wabaId` já é uma coluna por restaurante.

> ⚠️ **A assinatura do webhook é por WABA.** A URL é cadastrada uma vez no
> aplicativo, mas **cada WABA nova precisa ser assinada por aquele app**
> (`POST /{waba-id}/subscribed_apps`, ou o botão no painel). WABA nova sem
> assinatura = mensagens que nunca chegam, **sem nenhum erro visível**.

---

## 4.2 O aplicativo, e os dois segredos dele

> developers.facebook.com → **Meus aplicativos** → seu app → **Configurações → Básico**

| Campo no painel | Variável |
|---|---|
| ID do aplicativo | `META_APP_ID` |
| Chave secreta do aplicativo (→ *Mostrar*) | `META_APP_SECRET` |

O `META_APP_SECRET` é o que permite ao servidor conferir a assinatura
`X-Hub-Signature-256` e garantir que o webhook veio mesmo da Meta. Em
`NODE_ENV=production` o servidor **recusa subir** sem ele — e é o comportamento
certo.

O `META_VERIFY_TOKEN` você já gerou na [etapa 3](03-banco-de-dados.md#35-a-chave-de-criptografia).
Ele é uma senha que **você inventa** e digita nos dois lados.

---

## 4.3 O número de cada restaurante

Para **cada** restaurante:

> WhatsApp → **Configuração da API** → **Adicionar número de telefone**

1. Cadastre o número e **verifique por SMS ou ligação**;
2. Anote a **"Identificação do número de telefone"** — é o `phone_number_id`, um
   número longo tipo `109876543210987`. **Não é o telefone**, é o ID;
3. Anote a **"Identificação da conta do WhatsApp Business"** — o `waba_id`;
4. Se este restaurante tem **WABA própria**, assine essa WABA no seu aplicativo
   (o aviso da seção 4.1).

Monte a tabela enquanto faz — você vai precisar dela na
[etapa 7](07-cadastro-restaurantes.md):

| slug | telefone | `phone_number_id` | `waba_id` |
|---|---|---|---|
| `cantina-bella-nonna` | +55 11 9… | `109876543210987` | `987654321098765` |
| `sushi-kaze` | +55 11 9… | `109876543210988` | `987654321098765` |

> ⚠️ **O erro mais comum de multi-tenant é trocar dois `phone_number_id`.** O
> cliente de um restaurante vê o menu e o cardápio do outro. Confira a tabela duas
> vezes; a [etapa 8](08-verificacao-final.md) tem o teste que pega isso.

---

## 4.4 O token permanente

> Meta Business → **Configurações** → **Usuários do sistema** → *Gerar novo token*

Permissões necessárias:

- `whatsapp_business_messaging`
- `whatsapp_business_management`

> ⚠️ **O token que aparece no painel de teste expira em 24 horas.** Se você usar
> ele, o bot para de responder amanhã — e o sintoma é silêncio, não erro. Use o
> token de **usuário do sistema**, que é permanente.

Com WABA compartilhada, um token de sistema pode atender todos os restaurantes. Com
WABA por restaurante, é um token por WABA. De qualquer forma, o token é guardado
**criptografado no banco**, por restaurante, pelo `tenant:add` — nunca no `.env` do
servidor.

---

## 4.5 Os templates

Fora da janela de 24 horas, a Meta **só aceita template aprovado**. Todo lembrete
deste projeto é template. (A confirmação da reserva não é: ela sai na hora,
como resposta a um toque do cliente, e por isso é texto livre.)

Os JSONs prontos para colar estão em
[`../../whatsapp/docs/templates.md`](../../whatsapp/docs/templates.md).

> WhatsApp Manager → **Modelos de mensagem** → *Criar modelo*

Cadastre agora os dois que vêm ligados por padrão:

| Template | Variável do `.env` | Categoria |
|---|---|---|
| `lembrete_24h` | `TEMPLATE_LEMBRETE_24H` | UTILITY |
| `lembrete_2h` | `TEMPLATE_LEMBRETE_2H` | UTILITY |

- **Uma WABA para todos:** cadastre **uma vez**. Valem para todos os números.
- **Uma WABA por restaurante:** cadastre em **cada** WABA, com **nomes idênticos** —
  o `.env` tem um nome só para todos.

> ⚠️ **A ordem das variáveis importa.** O código manda `{{1}}`, `{{2}}`… na ordem
> descrita no `templates.md`. Trocar a ordem no WhatsApp Manager **não dá erro de
> cadastro** — dá erro **132000** na hora do envio, com o cliente esperando.

A aprovação leva de minutos a alguns dias. Enquanto espera, siga para a
[etapa 5](05-render.md).

Depois de aprovados (precisa do servidor no ar):

```bash
npm run templates:check -w @restaurante/whatsapp
```

### As mensagens de marketing ficam desligadas

`FEATURE_REATIVACAO` e `FEATURE_ANIVERSARIO` vêm `false` e **é para continuarem
assim** até você ter certeza: são as mais caras, exigem opt-in explícito e são as
que mais geram denúncia — e denúncia derruba a qualidade do número.

---

## 4.6 O webhook — só depois da etapa 5

A URL do webhook precisa existir e responder em HTTPS antes de ser cadastrada. Ou
seja: **este passo acontece depois do servidor estar no ar**, e está descrito em
[`05-render.md`](05-render.md#55-cadastrar-o-webhook-na-meta).

Deixe anotado aqui o que ele vai pedir:

| Campo | Valor |
|---|---|
| URL de callback | `https://<seu-servidor>/webhook` |
| Token de verificação | o mesmo `META_VERIFY_TOKEN` |
| Campos assinados | `messages` |

---

## ✅ Antes de seguir

- [ ] Decidiu: uma WABA para todos (ou por restaurante, com o custo entendido)
- [ ] `META_APP_ID` e `META_APP_SECRET` guardados
- [ ] Cada número cadastrado e **verificado**, com `phone_number_id` e `waba_id` anotados numa tabela
- [ ] Token **permanente** de usuário do sistema gerado, com as duas permissões
- [ ] `lembrete_24h` e `lembrete_2h` **enviados para aprovação**
- [ ] Toda WABA que não é a principal foi **assinada no aplicativo**

**Próximo:** [`05-render.md`](05-render.md)
