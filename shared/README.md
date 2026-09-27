# Base comum (`@barbearia/shared`)

O que os **dois módulos** — [`site/`](../site/) e [`whatsapp/`](../whatsapp/) —
precisam ler do mesmo jeito. Nada aqui conhece React, Fastify ou banco de dados,
e este pacote não importa nenhum dos dois módulos.

```
shared/src/
  config/types.ts       # o formato do barbearia.config.json
  config/defaults.ts    # os padrões: o que aparece com um config vazio
  config/normalize.ts   # validação — campo inválido volta ao padrão, com aviso
  lib/color.ts          # contraste, mistura e derivação de tons
  lib/hours.ts          # "aberto agora", próxima abertura, faixas de horário
  lib/whatsapp.ts       # normalização de telefone e links de WhatsApp/mapa
```

**Zero dependências.** É TypeScript puro, consumido direto do código-fonte pelos
dois módulos (o Vite compila para o site, o `tsx` para o servidor).

---

## Por que isto existe

O `barbearia.config.json` é o contrato entre os dois módulos. Se cada lado
tivesse a sua leitura dele, um preço mudado no site continuaria antigo no
WhatsApp — e a divergência só apareceria na frente do cliente.

Então a regra é: **quem interpreta o arquivo é este pacote**; os módulos só
consomem o resultado já validado.

```
        barbearia.config.json  (na raiz)
                  │
         @barbearia/shared     (valida e preenche os padrões)
            ┌─────┴─────┐
          site       whatsapp
```

| Bloco do config | Quem usa | Documentado em |
|---|---|---|
| `brand`, `colors`, `hero`, `gallery`, `testimonials`, `features` | site | [`site/README.md`](../site/README.md) |
| `booking`, `whatsapp` | WhatsApp | [`whatsapp/README.md`](../whatsapp/README.md) |
| `contact`, `services`, `team`, `hours` | **os dois** | [`site/README.md`](../site/README.md) descreve os campos; [`whatsapp/README.md`](../whatsapp/README.md) explica o que a agenda faz com `duration` e `bookable` |

---

## Como importar

```ts
import { normalizeConfig, DAY_KEYS } from '@barbearia/shared/config'
import type { SiteConfig, WeeklyHours } from '@barbearia/shared/config'
import { getOpenState, formatRanges } from '@barbearia/shared/lib/hours'
import { normalizePhone, whatsappUrl } from '@barbearia/shared/lib/whatsapp'
import { ensureContrast } from '@barbearia/shared/lib/color'
```

O `normalizeConfig` nunca lança: campo ausente, vazio ou inválido cai no padrão
e gera um aviso. Onde o aviso sai depende de quem está chamando — o site manda
para o console do navegador em desenvolvimento; o servidor usa
`setConfigWarnHandler` para redirecioná-lo ao log dele e mostrar os problemas no
`npm run tenant:sync`.

```bash
npm run test -w @barbearia/shared        # 57 testes, sem rede e sem banco
npm run typecheck -w @barbearia/shared
```

---

## O que **não** entra aqui

Se um símbolo serve a um módulo só, ele pertence ao módulo:

- renderização, componentes, tema em CSS → `site/`
- Cloud API, banco, agenda, filas → `whatsapp/`

A pergunta que decide: *"os dois lados precisam concordar sobre isto?"* Se a
resposta for não, não é comum.
