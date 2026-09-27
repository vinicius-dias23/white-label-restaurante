# Barbearia nova, do zero ao ar

O checklist que você repete a cada cliente. Com a infraestrutura já de pé
([`deploy-site.md`](deploy-site.md) e [`deploy-whatsapp.md`](deploy-whatsapp.md)),
são **cerca de 30 minutos do seu tempo** — mais a espera da Meta, que não depende
de você.

Neste exemplo: **Studio Max Barber**, slug `studio-max`, domínio
`studiomaxbarber.com.br`.

> **Escolha o slug com cuidado**: só letras minúsculas, números e hífen, e ele é
> o mesmo em **todos** os lugares — pasta, `deploy/tenants.json`, `tenant:add`,
> nome do projeto de hospedagem. Trocar depois dá retrabalho em quatro sistemas.

---

## Antes de começar, colete do cliente

| O que | Para quê |
|---|---|
| Nome, slogan e logo (SVG ou PNG) | Cabeçalho e rodapé do site |
| Cor da marca (hexadecimal) | O site inteiro sai dela |
| 10 a 15 fotos boas | Hero, serviços, galeria, equipe |
| Serviços com preço e duração | Site e agenda do bot — **a duração monta os horários** |
| Equipe: nome, função, foto | Site e escolha de barbeiro no bot |
| Horário de funcionamento | Selo "aberto agora" e os horários disponíveis |
| Endereço completo | Mapa e rota |
| **O número que vai virar bot** | Precisa estar liberado — veja o aviso abaixo |
| Domínio: já tem? de quem é a conta? | DNS |
| WhatsApp do dono | Recebe os avisos e o menu de administração |

> ⚠️ **O número que entra na Cloud API sai do aplicativo WhatsApp.** Se a
> barbearia usa aquele número no celular todo dia, ela **perde** o app —
> conversas antigas incluídas. Deixe isso explícito **por escrito** antes de
> começar. O caminho seguro é um **número novo** (um chip pré-pago resolve), com
> o antigo respondendo "agende pelo número tal" por algumas semanas.

---

## 1. A pasta da barbearia

```bash
cp -r whatsapp/tenants/barbearia-do-ze whatsapp/tenants/studio-max
$EDITOR whatsapp/tenants/studio-max/barbearia.config.json
```

Preencha na ordem: `brand` → `colors.brand` → `contact` → `hero` → `services`
→ `team` → `hours`. As referências de campo estão em
[`site/README.md`](../site/README.md) (visual) e
[`whatsapp/README.md`](../whatsapp/README.md) (`booking` e `whatsapp`).

As fotos:

```bash
mkdir -p whatsapp/tenants/studio-max/public/fotos
cp ~/Downloads/studio-max/*.jpg whatsapp/tenants/studio-max/public/fotos/
```

E no config aponte para `"/fotos/hero.jpg"`. Recomendações: hero em pé (~1200×1600),
serviços e galeria com 1200 px de largura, `.jpg` abaixo de 300 KB cada.

**Confira antes de qualquer deploy:**

```bash
cd site && TENANT=studio-max npm run build
npx vite preview --outDir dist/studio-max
```

Se o build reclamar de algum campo, ele diz qual. Se alguma foto aparecer como
um retângulo escuro, o caminho está errado.

---

## 2. O manifesto

Em `deploy/tenants.json`:

```json
{ "slug": "studio-max", "dominio": "studiomaxbarber.com.br", "ativo": true }
```

---

## 3. O número na Meta

1. **WhatsApp → Configuração da API → Adicionar número de telefone**;
2. Verifique por SMS ou ligação;
3. Anote a **"Identificação do número de telefone"** (`phone_number_id`) e a
   **"Identificação da conta do WhatsApp Business"** (`waba_id`);
4. Gere (ou reaproveite) o **token permanente de usuário do sistema**, com
   `whatsapp_business_messaging` e `whatsapp_business_management`;
5. **Se esta barbearia tem WABA própria:** assine essa WABA no seu aplicativo
   (`POST /{waba-id}/subscribed_apps`). Sem isso, nenhuma mensagem chega e
   **nenhum erro aparece**;
6. **Se esta barbearia tem WABA própria:** cadastre os templates do
   [`templates.md`](../whatsapp/docs/templates.md) nela e espere a aprovação.
   Com WABA compartilhada, pule — já estão aprovados.

---

## 4. O cadastro no servidor

```bash
render ssh barbearia-whatsapp -- 'npm run tenant:add -w @barbearia/whatsapp -- \
  --slug=studio-max \
  --phone-number-id=109876543210988 \
  --waba-id=987654321098765 \
  --token=EAAG... \
  --owner="(11) 91234-5678"'
```

Confira:

```bash
render ssh barbearia-whatsapp -- 'npm run tenant:list -w @barbearia/whatsapp'
```

### Os telefones dos painéis

O `--owner` acima é o **bootstrap**: ele cadastra o dono para a barbearia já
nascer com painel. Dali em diante quem manda é o config, editável no estúdio
sem SSH e sem deploy:

```jsonc
{
  "team": [
    // Este telefone abre o painel do barbeiro: a agenda dele, os cortes dele,
    // a folga dele. Vazio = ele só existe no site e na agenda.
    { "name": "Rafael", "phone": "(11) 98888-7766", "bookable": true }
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
npx wrangler pages project create barbearia-studio-max --production-branch=master

# commit dispara o CI; ou publique só esta pelo painel do GitHub Actions
git add whatsapp/tenants/studio-max deploy/tenants.json
git commit -m "Adiciona a Studio Max Barber"
git push
```

O domínio: painel do projeto → *Custom domains* → `studiomaxbarber.com.br`, e o
DNS conforme [`deploy-site.md`](deploy-site.md#caminho-a--um-projeto-por-barbearia-recomendado-até-20).
O certificado sai em alguns minutos; a propagação de DNS pode levar horas.

---

## 6. Aceite

Do celular, no número da barbearia:

- [ ] "oi" → menu **com o nome da Studio Max**
- [ ] Agendar → serviço → barbeiro → dia → horário → confirmar
- [ ] A confirmação chega na hora, com dia, horário, serviço e endereço certos
- [ ] O dono recebeu o aviso do agendamento
- [ ] "Meus agendamentos" → remarcar e cancelar funcionam
- [ ] O horário cancelado volta a aparecer como livre
- [ ] Fora do horário de funcionamento, o bot não oferece horário

No navegador:

- [ ] `https://studiomaxbarber.com.br` abre com HTTPS
- [ ] É a marca e as cores da Studio Max
- [ ] O título da aba tem o nome dela
- [ ] O botão do WhatsApp abre conversa **com o número dela**
- [ ] Nenhuma foto quebrada
- [ ] **Aberto de verdade num celular**, não só na janela estreita do navegador
- [ ] Preços do site batem com os do bot (é o mesmo arquivo, mas confira)

E o lembrete, no dia seguinte:

- [ ] O lembrete de 24h chegou (`/admin/studio-max/fila` mostra a fila)

---

## 7. Entregue ao cliente

- O número que atende, e o aviso de que **não** dá para usar o app do WhatsApp
  nele;
- O WhatsApp do dono já recebe os avisos e tem o menu de administração — mostre
  a agenda do dia, o bloqueio de horário e o "pausar o bot";
- Como pedir mudança de preço ou horário (e que leva um deploy);
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
9. aceite: menu, agendamento, confirmação, lembrete, site no celular
```
