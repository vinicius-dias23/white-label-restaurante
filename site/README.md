# Módulo 1 — Site (landing page white-label)

Landing page de página única para a barbearia: fotos grandes, pouco texto e um
caminho curto até o WhatsApp. Feita para o celular primeiro.

**Stack:** Vite + React 19 + TypeScript + Tailwind CSS v4.
**Saída:** `site/dist/`, um site estático que sobe em qualquer hospedagem
(Vercel, Netlify, GitHub Pages, hospedagem compartilhada).

```bash
npm install        # na raiz do repositório, uma vez

cd site
npm run dev        # http://localhost:5173
npm run build      # gera dist/
npm run preview    # serve o dist/ para conferir antes de publicar
```

Da raiz, os mesmos comandos: `npm run dev`, `npm run build`, `npm run preview`.

---

## Configuração

Tudo vem do **`barbearia.config.json` na raiz do repositório** — o mesmo arquivo
que alimenta o módulo do WhatsApp. Este README documenta os campos que **o site**
usa; os campos `booking` e `whatsapp` estão em
[`../whatsapp/README.md`](../whatsapp/README.md).

O arquivo pode até estar vazio (`{}`): nesse caso o site sobe inteiro com a
identidade padrão — preto, branco e azul escuro, logo padrão e conteúdo de
demonstração. Cada campo que você preenche substitui o padrão; o que faltar
continua no padrão.

```bash
cp barbearia.config.example.json barbearia.config.json
```

> Escreveu algo errado? O site não quebra: o campo inválido volta ao padrão e,
> rodando `npm run dev`, aparece um aviso no console do navegador dizendo
> exatamente qual campo está com problema.

### `brand` — identidade

| Campo | O que é |
|---|---|
| `name` | Nome da barbearia. Aparece no cabeçalho, no rodapé e nas mensagens do WhatsApp. |
| `tagline` | Frase curta, tipo "Corte, barba e navalha". |
| `logoUrl` | URL ou caminho da logo (`/logo.svg`, `/logo.png` ou um endereço completo). **Vazio = logo padrão**: uma navalha ao lado do nome, já na cor da marca. |
| `faviconUrl` | Ícone da aba. Vazio = ícone gerado automaticamente com a cor da marca. |

### `colors` — cores

Todas em hexadecimal (`"#16345B"` ou `"#fff"`).

| Campo | Padrão | O que pinta |
|---|---|---|
| `background` | `#0A0A0B` | Fundo da página |
| `surface` | `#141417` | Fundo dos cards |
| `text` | `#F5F5F4` | Texto principal |
| `muted` | `#A1A1AA` | Textos secundários |
| `brand` | `#16345B` | Botões, selos e destaques |
| `brandAccent` | derivado | Preços, ícones e títulos pequenos |

Na prática você só precisa mexer em **`brand`**. O `brandAccent` é calculado
sozinho: se a cor da marca for escura demais para ser lida sobre o fundo (é o
caso de um azul-marinho no preto), o site clareia essa cor até garantir
contraste de 4,5:1 nos textos pequenos, e escolhe entre texto claro e escuro
dentro dos botões. Preencha `brandAccent` só se quiser mandar no tom exato.

### `contact` — contato

| Campo | Observação |
|---|---|
| `whatsapp` | Qualquer formato serve: `(11) 91234-5678`, `+55 11 91234-5678`, `5511912345678`. O DDI 55 é acrescentado quando falta. |
| `phone` | Usado no botão "Ligar". Vazio = usa o WhatsApp. |
| `email` | Vazio esconde o botão de e-mail. |
| `address` | Endereço completo. Alimenta o mapa e o botão "Traçar rota". |
| `mapsUrl` | Link próprio do Google Maps. Vazio = gerado a partir do endereço. |
| `social.instagram` | Usuário, com ou sem `@`. |
| `social.facebook` | URL completa da página. |
| `social.tiktok` | Usuário, com ou sem `@`. |

### `hero` — primeira tela

| Campo | Observação |
|---|---|
| `imageUrl` | Foto de fundo, em pé (retrato) fica melhor no celular. |
| `headline` | Título. Use `\n` para quebrar a linha onde você quiser. |
| `subheadline` | Uma linha curta abaixo do título. |
| `ctaLabel` | Texto do botão principal. |

### `services` — serviços e preços

```json
{
  "name": "Corte + Barba",
  "description": "O combo completo, com toalha quente",
  "price": "R$ 75",
  "duration": "1h 10",
  "imageUrl": "/fotos/combo.jpg",
  "highlight": true
}
```

`price` e `duration` são texto livre — dá para escrever `"a partir de R$ 60"`.
`highlight: true` põe o selo "Mais pedido" e destaca o card.

Cada card tem um botão que abre o WhatsApp com a mensagem já escrita:
*"Olá, Barbearia do Zé! Gostaria de agendar: Corte + Barba (R$ 75)."*

> O módulo 2 interpreta o mesmo `duration` para montar a agenda — veja
> [`../whatsapp/README.md`](../whatsapp/README.md#booking--regras-da-agenda).

### `gallery`, `team`, `testimonials`

```json
"gallery": [{ "url": "/fotos/1.jpg", "alt": "Degradê finalizado" }],
"team": [{ "name": "Rafael", "role": "Barbeiro-chefe", "photoUrl": "/fotos/rafael.jpg", "instagram": "@rafa" }],
"testimonials": [{ "name": "Lucas M.", "rating": 5, "text": "Melhor degradê da região.", "photoUrl": "" }]
```

Nos depoimentos, `rating` vai de 1 a 5 e `photoUrl` pode ficar vazio — sem
foto, entra um círculo com a inicial do cliente.

Cada lista some da página quando está vazia. Em `team`, o campo `bookable` só
interessa ao módulo 2: `false` mantém o barbeiro no site e tira ele da agenda
do WhatsApp.

### `hours` — horários

Cada dia é uma lista de faixas `["abre", "fecha"]`:

```json
"hours": {
  "mon": [["09:00", "19:00"]],
  "sat": [["08:00", "13:00"], ["14:00", "18:00"]],
  "sun": []
}
```

- Lista vazia = **fechado** naquele dia.
- Duas faixas = **intervalo de almoço**.
- Faixa que termina antes de começar atravessa a madrugada:
  `["18:00", "02:00"]` fecha às 2h do dia seguinte.

O site calcula sozinho o selo **"Aberto agora" / "Fechado"**, destaca a linha
de hoje e, quando está fechado, mostra quando abre de novo.

### `features` — ligar e desligar seções

```json
"features": {
  "gallery": true,
  "team": true,
  "testimonials": true,
  "hours": true,
  "map": true
}
```

Coloque `false` para esconder a seção inteira (ela também some do menu).
Uma seção sem conteúdo — `"team": []`, por exemplo — já some sozinha.

---

## Fotos

O site é visual: as fotos fazem o trabalho pesado. Duas formas de usar:

1. **Arquivos no projeto** — coloque em `site/public/fotos/` e aponte para
   `"/fotos/nome.jpg"`. É a recomendada: carrega mais rápido e não depende
   de ninguém.
2. **URL externa** — cole o endereço completo da imagem.

Recomendações rápidas: hero em pé (por volta de 1200×1600), fotos de serviço
e galeria em 1200 px de largura, arquivos `.jpg` abaixo de 300 KB.

Se alguma imagem não carregar — link quebrado, arquivo trocado de lugar —
o site mostra um placeholder escuro na cor da marca no lugar do ícone de
imagem quebrada do navegador.

> As fotos que vêm por padrão são do Unsplash, só para demonstração.
> Troque pelas fotos reais da barbearia antes de publicar.

---

## Como o módulo está organizado

```
site/
  index.html
  vite.config.ts
  src/
    config/            # carrega o barbearia.config.json da raiz e valida
    components/        # Header, Hero, Services, Gallery, Team, Testimonials, ...
    hooks/             # scroll, relógio, animação de entrada
    lib/theme.ts       # cores do config → variáveis CSS
    lib/image.ts       # redimensionamento de imagens remotas
    styles/index.css   # tema, fontes e classes base
```

O que vem da base comum (`@barbearia/shared`): o schema do config, o cálculo de
"aberto agora" (`lib/hours`), os links de WhatsApp e mapa (`lib/whatsapp`) e as
contas de contraste (`lib/color`). Nada aqui importa o módulo do WhatsApp.

O tema vira variáveis CSS (`--bb-bg`, `--bb-brand`...) aplicadas no `<html>`
antes do primeiro render, e o Tailwind consome essas variáveis. Por isso
trocar as cores no JSON troca o site inteiro, sem tocar em CSS.

---

## Detalhes pensados para o celular

- Hero em `100svh` — o botão não fica escondido atrás da barra do navegador.
- Botões com no mínimo 44 px de altura e o flutuante do WhatsApp acima da
  barra de gestos do iPhone.
- Galeria com toque para ampliar e arrastar para trocar de foto.
- Equipe e depoimentos em carrossel que trava em cada card.
- Fontes servidas junto com o site, sem depender do Google.
- Imagens carregadas sob demanda e no tamanho da tela.
- Animações desligadas para quem usa "reduzir movimento" no sistema.

---

## Publicar

```bash
npm run build
```

`site/dist/` é um site estático. Em serviços como Vercel e Netlify, aponte:

| Campo | Valor |
|---|---|
| Comando de build | `npm run build` |
| Diretório de saída | `site/dist` |
| Diretório raiz | a raiz do repositório (o `barbearia.config.json` mora lá) |

O botão flutuante e todos os CTAs levam para o WhatsApp da barbearia — se o
módulo 2 estiver no ar, é ele que atende do outro lado.
