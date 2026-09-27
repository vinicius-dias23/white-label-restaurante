# Módulo 1 — Site (landing page white-label)

Landing page de página única para o restaurante que não tem site próprio:
fotos grandes, pouco texto e um caminho curto até a reserva no WhatsApp. Feita para o celular primeiro.

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

Tudo vem do **`restaurante.config.json` na raiz do repositório** — o mesmo arquivo
que alimenta o módulo do WhatsApp. Este README documenta os campos que **o site**
usa; os campos `booking` e `whatsapp` estão em
[`../whatsapp/README.md`](../whatsapp/README.md).

O arquivo pode até estar vazio (`{}`): nesse caso o site sobe inteiro com a
identidade padrão — fundo escuro com bordô vinho, logo padrão e o conteúdo
de demonstração de uma cantina. Cada campo que você preenche substitui o padrão; o que faltar
continua no padrão.

```bash
cp restaurante.config.example.json restaurante.config.json
```

> Escreveu algo errado? O site não quebra: o campo inválido volta ao padrão e,
> rodando `npm run dev`, aparece um aviso no console do navegador dizendo
> exatamente qual campo está com problema.

### `brand` — identidade

| Campo | O que é |
|---|---|
| `name` | Nome do restaurante. Aparece no cabeçalho, no rodapé e nas mensagens do WhatsApp. |
| `tagline` | Frase curta, tipo "Cozinha italiana de família". |
| `logoUrl` | URL ou caminho da logo (`/logo.svg`, `/logo.png` ou um endereço completo). **Vazio = logo padrão**: garfo e faca cruzados ao lado do nome, já na cor da marca. |
| `faviconUrl` | Ícone da aba. Vazio = ícone gerado automaticamente com a cor da marca. |

### `colors` — cores

Todas em hexadecimal (`"#8E1B24"` ou `"#fff"`).

| Campo | Padrão | O que pinta |
|---|---|---|
| `background` | `#140B0C` | Fundo da página |
| `surface` | `#1F1214` | Fundo dos cards |
| `text` | `#F7F1EE` | Texto principal |
| `muted` | `#B8A9A6` | Textos secundários |
| `brand` | `#8E1B24` | Botões, selos e destaques |
| `brandAccent` | derivado | Preços, ícones e títulos pequenos |

Na prática você só precisa mexer em **`brand`**. O `brandAccent` é calculado
sozinho: se a cor da marca for escura demais para ser lida sobre o fundo (é o
caso de um bordô sobre o fundo quase preto), o site clareia essa cor até garantir
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
| `ctaLabel` | Texto do botão principal (padrão: "Reservar mesa no WhatsApp"). Abre o WhatsApp com *"Olá, Cantina! Gostaria de reservar uma mesa."* |

### `menu` — cardápio

O site mostra os **pratos em destaque** e um botão para o **cardápio completo**.
Não tente pôr o cardápio inteiro aqui: o restaurante já tem um PDF ou um link,
e dois cardápios para manter em dia é pedir para eles divergirem.

```json
"menu": {
  "url": "/cardapio.pdf",
  "items": [
    {
      "name": "Fettuccine alla Nonna",
      "description": "Massa fresca, ragù de costela cozido por 8 horas",
      "category": "Massas",
      "price": "R$ 68",
      "imageUrl": "/fotos/fettuccine.jpg",
      "highlight": true
    }
  ]
}
```

| Campo | Observação |
|---|---|
| `url` | Cardápio completo: PDF em `site/public/`, site, iFood... Preenchido, aparece o botão **"Ver cardápio completo"**. Vazio = só os destaques. |
| `items[].name` / `description` | Nome do prato e uma linha sobre ele. |
| `items[].category` | Agrupa os pratos. Com mais de uma categoria, o site mostra filtros ("Todos", "Massas", "Sobremesas"...) na ordem em que aparecem no arquivo. |
| `items[].price` | Texto livre — dá para escrever `"a partir de R$ 29"` ou `"R$ 120 (serve 2)"`. |
| `items[].imageUrl` | Foto do prato, de preferência deitada (4:3). |
| `items[].highlight` | `true` põe o selo **"Destaque"** e a borda na cor da marca. |
| `items[].slug` | Identidade estável do prato, usada pelo estúdio e pelo bot. Pode ficar de fora: é derivada do nome. |

Os mesmos destaques aparecem, com preço, no atendimento do WhatsApp.

### `areas` — ambientes

Os espaços da casa: Salão, Varanda, Área externa, Mezanino.

```json
"areas": [
  {
    "name": "Varanda",
    "description": "Ao ar livre, ótima para o fim de tarde",
    "capacity": 20,
    "imageUrl": "/fotos/varanda.jpg",
    "bookable": true
  }
]
```

Cada ambiente vira um card com foto, nome, descrição, a linha **"Até 20
pessoas"** (some com `capacity` 0) e o botão **"Reservar aqui"**, que abre o
WhatsApp com *"Olá, Cantina! Gostaria de reservar uma mesa na Varanda."*

`bookable: false` mantém o card no site — o cliente continua conhecendo o
espaço — mas tira o botão, porque o bot não reserva aquele ambiente.

> Para o módulo 2, `capacity` é a lotação: quantas pessoas cabem ao mesmo tempo
> no ambiente. Veja [`../whatsapp/README.md`](../whatsapp/README.md).

### `gallery`, `team`, `testimonials`

```json
"gallery": [{ "url": "/fotos/1.jpg", "alt": "Mesa posta para o jantar" }],
"team": [{ "name": "Giulia", "role": "Chef", "photoUrl": "/fotos/giulia.jpg", "instagram": "@chefgiulia" }],
"testimonials": [{ "name": "Carlos P.", "rating": 5, "text": "O fettuccine é o melhor da cidade.", "photoUrl": "" }]
```

Nos depoimentos, `rating` vai de 1 a 5 e `photoUrl` pode ficar vazio — sem
foto, entra um círculo com a inicial do cliente.

Cada lista some da página quando está vazia. A equipe (chef, sommelier,
recepção) aparece em "Nossa equipe", sem botão de reserva: a mesa é do
restaurante, não de uma pessoa.

Em `team`, o campo `phone` só interessa ao módulo 2 (dá ao colaborador o
painel da recepção no WhatsApp). **Ele nunca chega ao site**: o
`vite.config.ts` remove o campo antes de o config entrar no bundle, porque é o
telefone pessoal do colaborador.

### `hours` — horários

Cada dia é uma lista de faixas `["abre", "fecha"]`:

```json
"hours": {
  "tue": [["18:00", "23:00"]],
  "sat": [["12:00", "16:00"], ["18:00", "23:30"]],
  "mon": []
}
```

- Lista vazia = **fechado** naquele dia.
- Duas faixas = **almoço e jantar**, com a cozinha fechada no meio.
- Faixa que termina antes de começar atravessa a madrugada:
  `["18:00", "02:00"]` fecha às 2h do dia seguinte.

O site calcula sozinho o selo **"Aberto agora" / "Fechado"**, destaca a linha
de hoje e, quando está fechado, mostra quando abre de novo.

### `features` — ligar e desligar seções

```json
"features": {
  "menu": true,
  "areas": true,
  "gallery": true,
  "team": true,
  "testimonials": true,
  "hours": true,
  "map": true
}
```

Coloque `false` para esconder a seção inteira (ela também some do menu).
Uma seção sem conteúdo — `"team": []`, por exemplo — já some sozinha. O
cardápio aparece com pratos em destaque **ou** só com o `menu.url`.

---

## Fotos

O site é visual: as fotos fazem o trabalho pesado. Duas formas de usar:

1. **Arquivos no projeto** — coloque em `site/public/fotos/` e aponte para
   `"/fotos/nome.jpg"`. É a recomendada: carrega mais rápido e não depende
   de ninguém.
2. **URL externa** — cole o endereço completo da imagem.

Recomendações rápidas: hero em pé (por volta de 1200×1600), fotos de pratos,
ambientes e galeria em 1200 px de largura, arquivos `.jpg` abaixo de 300 KB.

Se alguma imagem não carregar — link quebrado, arquivo trocado de lugar —
o site mostra um placeholder escuro na cor da marca, com os talheres, no lugar do ícone de
imagem quebrada do navegador.

> As fotos que vêm por padrão são do Unsplash, só para demonstração.
> Troque pelas fotos reais do restaurante antes de publicar.

---

## Como o módulo está organizado

```
site/
  index.html
  vite.config.ts
  src/
    config/            # carrega o restaurante.config.json da raiz e valida
    components/        # Header, Hero, Menu, Areas, Gallery, Team, Testimonials, ...
    hooks/             # scroll, relógio, animação de entrada
    lib/theme.ts       # cores do config → variáveis CSS
    lib/image.ts       # redimensionamento de imagens remotas
    lib/talheres.ts    # garfo e faca da marca padrão (logo, favicon, placeholder)
    styles/index.css   # tema, fontes e classes base
```

O que vem da base comum (`@restaurante/shared`): o schema do config, o cálculo de
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
- Filtros do cardápio numa fileira que rola de lado, sem quebrar em linhas.
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
| Diretório raiz | a raiz do repositório (o `restaurante.config.json` mora lá) |

O botão flutuante e todos os CTAs levam para o WhatsApp do restaurante — se o
módulo 2 estiver no ar, é ele que atende do outro lado.
