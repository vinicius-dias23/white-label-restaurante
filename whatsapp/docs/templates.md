# Templates da Meta

Fora da janela de 24 horas — ou seja, quando o cliente não te manda uma mensagem
há mais de um dia — a Cloud API **só aceita template aprovado**. Todo lembrete
deste projeto é template; só a confirmação, que sai no instante em que o cliente
toca em "Confirmar" — como resposta na própria conversa, não pela fila —, é texto
livre (e por isso não é cobrada).

Cadastre os templates em **WhatsApp Manager → Modelos de mensagem → Criar
modelo**. A aprovação costuma sair em minutos, mas pode levar até 24 horas — e
pode ser recusada. Faça isso **antes** de ligar a mensagem correspondente.

Depois de cadastrar, confira o que está valendo:

```bash
npm run templates:check
```

> **O corpo de cada template também está no catálogo de textos**, em
> `template.*` — dá para ver e editar pelo `npm run textos:studio`. Só que ali é
> **referência**: quem manda de verdade é o que está aprovado no WhatsApp
> Manager, e o texto novo só passa a valer depois de você reenviar o template
> para aprovação.

> **A ordem das variáveis importa.** O código manda `{{1}}`, `{{2}}`... na ordem
> descrita aqui. Trocar a ordem no WhatsApp Manager não dá erro de cadastro —
> dá erro **132000** na hora do envio, com o cliente esperando.

---

## 1. `lembrete_24h` — véspera da reserva

| | |
|---|---|
| **Nome** | `lembrete_24h` |
| **Categoria** | Utilidade (*Utility*) |
| **Idioma** | Português (BR) — `pt_BR` |
| **Ligado por padrão** | ✅ sim |

**Corpo:**

```
Oi, {{1}}! Passando para lembrar da sua reserva na {{2}} 🍽️

👥 {{3}}
📅 {{4}}

Vocês vêm?
```

**Botões** (resposta rápida, exatamente nesta ordem):

1. `Confirmo`
2. `Cancelar`

**Exemplos para a aprovação** (a Meta exige preencher):

| Variável | Exemplo |
|---|---|
| `{{1}}` | Marina |
| `{{2}}` | Cantina Bella Nonna |
| `{{3}}` | 4 pessoas |
| `{{4}}` | sexta, 22/08 às 20:30 |

> Os dois botões voltam para o bot já sabendo de qual reserva se trata.
> "Confirmo" marca a reserva como `confirmed` — é o que a recepção vê como
> "confirmada" na lista do dia — e "Cancelar" cai direto na tela de confirmação
> de cancelamento. É a mensagem que mais reduz mesa vazia: os lugares liberados
> na véspera ainda dão tempo de outro grupo reservar.
>
> O `{{3}}` já chega escrito ("4 pessoas", "1 pessoa"), com o texto de
> `rotulos.pessoa.*` do catálogo.

---

## 2. `lembrete_2h` — em cima da hora

| | |
|---|---|
| **Nome** | `lembrete_2h` |
| **Categoria** | Utilidade (*Utility*) |
| **Idioma** | `pt_BR` |
| **Ligado por padrão** | ✅ sim |

**Corpo:**

```
{{1}}, sua mesa na {{2}} é hoje às {{3}} ⏰

Te esperamos!
```

| Variável | Exemplo |
|---|---|
| `{{1}}` | Marina |
| `{{2}}` | Cantina Bella Nonna |
| `{{3}}` | 20:30 |

> Sem botões, de propósito: a essa altura não dá mais tempo de outro grupo
> ocupar a mesa, e quem precisar falar responde a mensagem normalmente.
> Este lembrete **não** é adiado pelo silêncio noturno — um lembrete de 2h
> adiado não serve para nada. Se ele cairia de madrugada, simplesmente não vai.

---

## 3. `pos_atendimento` — pós-visita: agradecimento e avaliação

| | |
|---|---|
| **Nome** | `pos_atendimento` |
| **Categoria** | Utilidade (*Utility*) |
| **Idioma** | `pt_BR` |
| **Ligado por padrão** | ⚙️ **não** — `FEATURE_POS_ATENDIMENTO=false` |

**Corpo:**

```
Oi, {{1}}! Obrigado por vir à {{2}} 🍷

Se gostou, uma avaliação ajuda demais a gente a aparecer para mais gente.
```

**Botão** (visitar site):

- Texto: `Avaliar`
- URL: o link de avaliação do restaurante (o mesmo de `whatsapp.reviewUrl`)

| Variável | Exemplo |
|---|---|
| `{{1}}` | Marina |
| `{{2}}` | Cantina Bella Nonna |

> O nome continua `pos_atendimento` (e a chave interna, `posAtendimento`) para
> não obrigar quem já tem o template aprovado a cadastrar outro. No estúdio ele
> aparece como "pos_visita". Se preferir o nome novo, cadastre com ele e ajuste
> `TEMPLATE_POS_ATENDIMENTO` no `.env`.
>
> Sai no dia seguinte, só para reserva concluída: quem a recepção marcou como
> falta (`no_show`) ou quem cancelou não recebe agradecimento.
>
> Quando o cliente ainda está dentro da janela de 24h — respondeu o lembrete, por
> exemplo — o sistema manda a versão interativa com o botão de link em vez do
> template. Mesma mensagem, sem gastar template e sem custo.
>
> Exige `whatsapp.reviewUrl` preenchido no `restaurante.config.json`.

---

## 4. `reativacao_cliente` — quem sumiu

| | |
|---|---|
| **Nome** | `reativacao_cliente` |
| **Categoria** | **Marketing** |
| **Idioma** | `pt_BR` |
| **Ligado por padrão** | ⚙️ **não** — `FEATURE_REATIVACAO=false` |

**Corpo:**

```
{{1}}, faz {{3}} dias que a gente não te vê aqui na {{2}} 🍝

Bora reservar uma mesa? É só responder esta mensagem.
```

**Rodapé** (obrigatório em marketing):

```
Responda SAIR para não receber mais
```

| Variável | Exemplo |
|---|---|
| `{{1}}` | Marina |
| `{{2}}` | Cantina Bella Nonna |
| `{{3}}` | 45 |

> ⚠️ **Leia antes de ligar.** Template de marketing:
> - só vai para quem deu **opt-in explícito** (`contacts.marketing_opt_in`);
> - a Meta limita quantas mensagens de marketing cada pessoa recebe por período;
> - se muita gente bloquear ou denunciar, a qualidade do seu número cai e a Meta
>   chega a **pausar** o template ou reduzir seu limite de envio.
>
> Ligue para um grupo pequeno primeiro e acompanhe a qualidade do número no
> WhatsApp Manager.

---

## 5. `aniversario_cliente` — parabéns

| | |
|---|---|
| **Nome** | `aniversario_cliente` |
| **Categoria** | **Marketing** |
| **Idioma** | `pt_BR` |
| **Ligado por padrão** | ⚙️ **não** — `FEATURE_ANIVERSARIO=false` |

**Corpo:**

```
Parabéns, {{1}}! 🎉

A {{2}} deseja um ótimo dia. Que tal comemorar com a gente? Reserve sua mesa por aqui!
```

**Rodapé:**

```
Responda SAIR para não receber mais
```

| Variável | Exemplo |
|---|---|
| `{{1}}` | Marina |
| `{{2}}` | Cantina Bella Nonna |

> Só funciona para quem tem data de nascimento cadastrada. O menu do bot **não**
> pergunta isso — seria mais um passo no meio da reserva. Preencha pela rota
> administrativa:
>
> ```bash
> curl -X PATCH https://seu-servidor/admin/contatos/<id> \
>   -H "Authorization: Bearer $ADMIN_API_TOKEN" \
>   -H "Content-Type: application/json" \
>   -d '{"aniversario":"1990-04-25","marketing":true}'
> ```

---

## Trocar o nome de um template

Se você cadastrar com outro nome, avise o servidor pelo `.env`:

```dotenv
TEMPLATE_LEMBRETE_24H=lembrete_vespera
```

O `npm run templates:check` passa a conferir o nome novo.

---

## Quando um template é recusado

A Meta recusa principalmente por:

- **conteúdo promocional numa categoria de utilidade** — "aproveite 20% off" num
  template marcado como *Utility* é recusa quase certa;
- **variável no começo ou no fim do corpo**, sem texto em volta;
- **duas variáveis coladas** (`{{1}} {{2}}` logo no início);
- **exemplos não preenchidos** no formulário de cadastro.

Corrija e reenvie: dá para editar um template recusado, não é preciso criar outro
com nome diferente.
