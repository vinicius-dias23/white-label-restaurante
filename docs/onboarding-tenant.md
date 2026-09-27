# Restaurante novo, do zero ao ar

O checklist que você repete a cada cliente. Com a infraestrutura já de pé
([`deploy-site.md`](deploy-site.md) e [`deploy-whatsapp.md`](deploy-whatsapp.md)),
são **cerca de 30 minutos do seu tempo** — mais a espera da Meta, que não depende
de você.

Neste exemplo: **Sushi Kaze**, slug `sushi-kaze`, domínio
`sushikaze.com.br`.

> **Escolha o slug com cuidado**: só letras minúsculas, números e hífen, e ele é
> o mesmo em **todos** os lugares — pasta, `deploy/tenants.json`, `tenant:add`,
> nome do projeto de hospedagem. Trocar depois dá retrabalho em quatro sistemas.

---

## Antes de começar, colete do cliente

| O que | Para quê |
|---|---|
| Nome, slogan e logo (SVG ou PNG) | Cabeçalho e rodapé do site |
| Cor da marca (hexadecimal) | O site inteiro sai dela |
| 10 a 15 fotos boas | Hero, pratos, ambientes, galeria, equipe |
| Pratos em destaque, com preço, e o link do cardápio completo | Site e botão "Cardápio" do bot |
| Ambientes e **quantas pessoas cabem em cada um** | Site e reservas do bot — **a lotação decide que horário é oferecido** |
| Quanto tempo uma mesa costuma ficar ocupada, a partir de quantas pessoas o dono quer aprovar, e o maior grupo que aceita pelo WhatsApp | O bloco `booking` |
| Equipe: nome, função, foto — e o WhatsApp de quem fica na recepção | Site e painel da recepção |
| Horário de funcionamento (almoço e jantar) | Selo "aberto agora" e os horários disponíveis |
| Endereço completo | Mapa e rota |
| **O número que vai virar bot** | Precisa estar liberado — veja o aviso abaixo |
| Domínio: já tem? de quem é a conta? | DNS |
| WhatsApp do dono | Recebe os avisos, aprova grupos grandes e tem o painel do dono |

> ⚠️ **O número que entra na Cloud API sai do aplicativo WhatsApp.** Se o
> restaurante usa aquele número no celular todo dia, ele **perde** o app —
> conversas antigas incluídas. Deixe isso explícito **por escrito** antes de
> começar. O caminho seguro é um **número novo** (um chip pré-pago resolve), com
> o antigo respondendo "reservas pelo número tal" por algumas semanas.

---

## 1. A pasta do restaurante

```bash
cp -r whatsapp/tenants/cantina-bella-nonna whatsapp/tenants/sushi-kaze
$EDITOR whatsapp/tenants/sushi-kaze/restaurante.config.json
```

Preencha na ordem: `brand` → `colors.brand` → `contact` → `hero` → `menu`
→ `areas` → `team` → `hours` → `booking`. As referências de campo estão em
[`site/README.md`](../site/README.md) (visual) e
[`whatsapp/README.md`](../whatsapp/README.md) (`areas`, `booking` e `whatsapp`).
O caminho mais confortável é o estúdio (`npm run textos:studio -w
@restaurante/whatsapp`), com as abas Cardápio, Ambientes, Equipe e Regras das
reservas.

As fotos:

```bash
mkdir -p whatsapp/tenants/sushi-kaze/public/fotos
cp ~/Downloads/sushi-kaze/*.jpg whatsapp/tenants/sushi-kaze/public/fotos/
```

E no config aponte para `"/fotos/hero.jpg"`. Recomendações: hero em pé (~1200×1600),
pratos, ambientes e galeria com 1200 px de largura, `.jpg` abaixo de 300 KB cada.

**Confira antes de qualquer deploy:**

```bash
cd site && TENANT=sushi-kaze npm run build
npx vite preview --outDir dist/sushi-kaze
```

Se o build reclamar de algum campo, ele diz qual. Se alguma foto aparecer como
um retângulo escuro, o caminho está errado.

---

## 2. O manifesto

Em `deploy/tenants.json`:

```json
{ "slug": "sushi-kaze", "dominio": "sushikaze.com.br", "ativo": true }
```

---

## 3. O número na Meta

1. **WhatsApp → Configuração da API → Adicionar número de telefone**;
2. Verifique por SMS ou ligação;
3. Anote a **"Identificação do número de telefone"** (`phone_number_id`) e a
   **"Identificação da conta do WhatsApp Business"** (`waba_id`);
4. Gere (ou reaproveite) o **token permanente de usuário do sistema**, com
   `whatsapp_business_messaging` e `whatsapp_business_management`;
5. **Se este restaurante tem WABA própria:** assine essa WABA no seu aplicativo
   (`POST /{waba-id}/subscribed_apps`). Sem isso, nenhuma mensagem chega e
   **nenhum erro aparece**;
6. **Se este restaurante tem WABA própria:** cadastre os templates do
   [`templates.md`](../whatsapp/docs/templates.md) nela e espere a aprovação.
   Com WABA compartilhada, pule — já estão aprovados.

---

## 4. O cadastro no servidor

```bash
render ssh restaurante-whatsapp -- 'npm run tenant:add -w @restaurante/whatsapp -- \
  --slug=sushi-kaze \
  --phone-number-id=109876543210988 \
  --waba-id=987654321098765 \
  --token=EAAG... \
  --owner="(11) 91234-5678"'
```

Confira:

```bash
render ssh restaurante-whatsapp -- 'npm run tenant:list -w @restaurante/whatsapp'
```

### Os telefones dos painéis

O `--owner` acima é o **bootstrap**: ele cadastra o dono para o restaurante já
nascer com painel. Dali em diante quem manda é o config, editável no estúdio
sem SSH e sem deploy:

```jsonc
{
  "team": [
    // Este telefone abre o painel da recepção: as reservas do dia, quem
    // chegou, quem faltou. Vazio = ela só existe no site.
    { "name": "Aline", "role": "Recepção", "phone": "(11) 97777-0001" }
  ],
  "whatsapp": {
    "owner": {
      // Abrem o painel do dono. O PRIMEIRO recebe os avisos automáticos.
      "phones": ["(11) 91234-5678"]
    }
  }
}
```

Vale no próximo `tenant:sync` (e o estúdio já roda um ao Salvar). A ordem de
precedência é **config › `TENANT_OWNER_PHONE` › o que já está no banco**:
publicar um config sem os números nunca tira o painel de quem já tinha.

> **São dados pessoais em arquivo versionado.** O histórico do git não se apaga
> — mantenha o repositório privado. O build do site remove esses campos do
> bundle, então eles não vão para a landing page.

---

## 5. O site no ar

```bash
# projeto de hospedagem (uma vez, no caminho A)
npx wrangler pages project create restaurante-sushi-kaze --production-branch=master

# commit dispara o CI; ou publique só este pelo painel do GitHub Actions
git add whatsapp/tenants/sushi-kaze deploy/tenants.json
git commit -m "Adiciona o Sushi Kaze"
git push
```

O domínio: painel do projeto → *Custom domains* → `sushikaze.com.br`, e o
DNS conforme [`deploy-site.md`](deploy-site.md#caminho-a--um-projeto-por-restaurante-recomendado-até-20).
O certificado sai em alguns minutos; a propagação de DNS pode levar horas.

---

## 6. Aceite

Do celular, no número do restaurante:

- [ ] "oi" → menu **com o nome do Sushi Kaze**
- [ ] "Cardápio" → os destaques com preço e o link do cardápio completo
- [ ] Reservar mesa → pessoas → ambiente → dia → horário → confirmar
- [ ] A confirmação chega na hora, com pessoas, ambiente, dia, horário e endereço certos
- [ ] O dono recebeu o aviso da reserva
- [ ] Um grupo acima de `approvalAbovePartySize` vira pedido, e o dono aprova pelo WhatsApp
- [ ] "Minhas reservas" → remarcar e cancelar funcionam
- [ ] Os lugares cancelados voltam para a lotação (o horário reaparece)
- [ ] Um grupo maior que qualquer ambiente cai em "falar com atendente"
- [ ] Fora do horário de funcionamento, o bot não oferece horário
- [ ] O telefone da recepção abre o painel dela, e "Marcar chegada" funciona

No navegador:

- [ ] `https://sushikaze.com.br` abre com HTTPS
- [ ] É a marca e as cores do Sushi Kaze
- [ ] O título da aba tem o nome dele
- [ ] O botão do WhatsApp abre conversa **com o número dele**
- [ ] O "Reservar aqui" de cada ambiente chega ao bot com o ambiente já escolhido
- [ ] Nenhuma foto quebrada
- [ ] **Aberto de verdade num celular**, não só na janela estreita do navegador
- [ ] Preços e ambientes do site batem com os do bot (é o mesmo arquivo, mas confira)

E o lembrete, no dia seguinte:

- [ ] O lembrete de 24h chegou (`/admin/sushi-kaze/fila` mostra a fila)

---

## 7. Entregue ao cliente

- O número que atende, e o aviso de que **não** dá para usar o app do WhatsApp
  nele;
- O WhatsApp do dono já recebe os avisos e tem o painel do dono — mostre os
  pedidos de grupo grande, as reservas do dia, o relatório, o "Fechar agenda" e
  o "pausar o bot";
- O WhatsApp da recepção tem o painel dela — mostre o "Marcar chegada", que é o
  que alimenta o "compareceram / faltaram" do relatório;
- Como pedir mudança de cardápio, lotação ou horário (e que o site leva um deploy);
- Quem chamar quando parar de funcionar.

---

## Resumo em um cartão

```
1. cp -r whatsapp/tenants/<modelo> whatsapp/tenants/<slug>   e editar
2. fotos em whatsapp/tenants/<slug>/public/fotos/
3. TENANT=<slug> npm run build                    → conferir local
4. deploy/tenants.json                            → slug + domínio + ativo
5. Meta: número → phone_number_id + waba_id + token permanente
   (WABA própria? assinar no app + cadastrar templates)
6. npm run tenant:add -- --slug=... --phone-number-id=... --token=...
7. criar o projeto de hospedagem + apontar o domínio
8. git push                                       → CI publica
9. aceite: menu, reserva, confirmação, lembrete, site no celular
```
