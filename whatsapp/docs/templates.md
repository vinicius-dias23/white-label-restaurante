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

## 1. `lembrete_24h` — véspera do atendimento

| | |
|---|---|
| **Nome** | `lembrete_24h` |
| **Categoria** | Utilidade (*Utility*) |
| **Idioma** | Português (BR) — `pt_BR` |
| **Ligado por padrão** | ✅ sim |

**Corpo:**

```
Oi, {{1}}! Passando para lembrar do seu horário na {{2}} 💈

{{3}}
📅 {{4}}

Vai conseguir vir?
```

**Botões** (resposta rápida, exatamente nesta ordem):

1. `Confirmo presença`
2. `Preciso cancelar`

**Exemplos para a aprovação** (a Meta exige preencher):

| Variável | Exemplo |
|---|---|
| `{{1}}` | João |
| `{{2}}` | Barbearia do Zé |
| `{{3}}` | Corte + Barba |
| `{{4}}` | sexta, 22/08 às 14:30 |

> Os dois botões voltam para o bot já sabendo de qual agendamento se trata, e
> "Preciso cancelar" cai direto na tela de confirmação de cancelamento. É a
> mensagem que mais reduz falta: o horário desmarcado na véspera ainda dá tempo
> de ser ocupado por outra pessoa.

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
{{1}}, seu horário na {{2}} é hoje às {{3}} ⏰

Te esperamos!
```

| Variável | Exemplo |
|---|---|
| `{{1}}` | João |
| `{{2}}` | Barbearia do Zé |
| `{{3}}` | 14:30 |

> Sem botões, de propósito: a essa altura não dá mais tempo de preencher o
> horário vago, e quem precisar falar responde a mensagem normalmente.
> Este lembrete **não** é adiado pelo silêncio noturno — um lembrete de 2h
> adiado não serve para nada. Se ele cairia de madrugada, simplesmente não vai.

---

## 3. `pos_atendimento` — agradecimento e avaliação

| | |
|---|---|
| **Nome** | `pos_atendimento` |
| **Categoria** | Utilidade (*Utility*) |
| **Idioma** | `pt_BR` |
| **Ligado por padrão** | ⚙️ **não** — `FEATURE_POS_ATENDIMENTO=false` |

**Corpo:**

```
Opa, {{1}}! Tudo certo com o corte? 💈

Se curtiu, uma avaliação ajuda demais a {{2}} a aparecer para mais gente.
```

**Botão** (visitar site):

- Texto: `Avaliar`
- URL: o link de avaliação da barbearia (o mesmo de `whatsapp.reviewUrl`)

| Variável | Exemplo |
|---|---|
| `{{1}}` | João |
| `{{2}}` | Barbearia do Zé |

> Quando o cliente ainda está dentro da janela de 24h — respondeu o lembrete, por
> exemplo — o sistema manda a versão interativa com o botão de link em vez do
> template. Mesma mensagem, sem gastar template e sem custo.
>
> Exige `whatsapp.reviewUrl` preenchido no `barbearia.config.json`.

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
{{1}}, faz {{3}} dias que a gente não te vê aqui na {{2}} 💈

Bora marcar um horário? É só responder esta mensagem.
```

**Rodapé** (obrigatório em marketing):

```
Responda SAIR para não receber mais
```

| Variável | Exemplo |
|---|---|
| `{{1}}` | João |
| `{{2}}` | Barbearia do Zé |
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

A {{2}} deseja um ótimo dia. Passa aqui para comemorar com um corte novo!
```

**Rodapé:**

```
Responda SAIR para não receber mais
```

| Variável | Exemplo |
|---|---|
| `{{1}}` | João |
| `{{2}}` | Barbearia do Zé |

> Só funciona para quem tem data de nascimento cadastrada. O menu do bot **não**
> pergunta isso — seria mais um passo no meio do agendamento. Preencha pela rota
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
