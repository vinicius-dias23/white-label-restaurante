# Etapa 8 — Verificação final

Tudo está no ar. Esta etapa é o **aceite**: o que você confere antes de dizer ao
cliente que está pronto.

Faça **do celular**, com o número do restaurante salvo nos contatos. Nenhum teste
de `curl` substitui isto — é assim que o cliente dele vai usar.

---

## 8.1 Infraestrutura (30 segundos, do terminal)

```bash
# o servidor está de pé e o banco responde
curl -s https://restaurante-whatsapp.onrender.com/health
# {"ok":true,"servico":"restaurante-whatsapp"}

# os restaurantes estão cadastrados
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://restaurante-whatsapp.onrender.com/admin/tenants

# o site de cada um responde com HTTPS
curl -sI https://sushikaze.com.br | head -1
# HTTP/2 200
```

---

## 8.2 O bot, do celular — por restaurante

Mande mensagem para **cada número**, um por um:

- [ ] "oi" → o menu aparece **com o nome daquele restaurante**
- [ ] "Cardápio" → os destaques com preço e o link do cardápio completo
- [ ] Reservar mesa → pessoas → ambiente → dia → horário → confirmar
- [ ] A confirmação chega **na hora**, com pessoas, ambiente, dia, horário e endereço certos
- [ ] O dono (`--owner`) recebeu o aviso da reserva
- [ ] Um grupo maior que `approvalAbovePartySize` vira **pedido**: o cliente vê
      "Pedido enviado", o dono recebe Aprovar/Recusar, e aprovar avisa o cliente
- [ ] "Minhas reservas" → remarcar funciona (a reserva antiga só some depois da nova confirmada)
- [ ] Cancelar funciona, e os lugares **voltam para a lotação**
- [ ] Um grupo maior que qualquer ambiente é mandado para o atendente
- [ ] Fora do horário de funcionamento, o bot **não oferece** horário
- [ ] O telefone da recepção (`team[].phone`) abre o painel da recepção, e
      "Marcar chegada" → 🟢 Chegou funciona

> ⚠️ **O passo 1 em *todos* os números é o teste que mais importa.** É como se
> descobre o erro clássico de multi-tenant: dois `phone_number_id` trocados no
> `tenant:add`. O sintoma é o cliente de um restaurante vendo o menu, o cardápio e
> os ambientes do outro — e ninguém percebe até o cliente reclamar.

---

## 8.3 O site, do celular — por restaurante

- [ ] `https://<dominio>` abre com HTTPS, sem aviso de certificado
- [ ] É a marca e as cores daquele restaurante
- [ ] O título da aba tem o nome dele
- [ ] O botão "Reservar mesa no WhatsApp" abre conversa **com o número dele**
- [ ] O "Reservar aqui" de um ambiente chega no bot com o ambiente já escolhido
- [ ] Nenhuma foto quebrada (retângulo escuro = caminho errado no config)
- [ ] **Aberto de verdade num celular**, não só na janela estreita do navegador:
      o hero ocupa a tela e o botão flutuante não fica atrás da barra de gestos
- [ ] Os preços e os ambientes do site batem com os do bot

O último item do celular é o que mais pega. O site é feito para o celular
primeiro, e é do celular que os clientes vão abrir.

> Sobre os preços: é o **mesmo arquivo** alimentando os dois, mas confira mesmo
> assim. Se divergirem, o `tenant:sync` rodou e o rebuild do site não —
> [etapa 7](07-cadastro-restaurantes.md#74-tenantsync--quando-o-config-muda).

---

## 8.4 O lembrete — no dia seguinte

Este é o único item que não fecha hoje. Reserve uma mesa para o dia seguinte e
confira que a mensagem entrou na fila:

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://restaurante-whatsapp.onrender.com/admin/sushi-kaze/fila
```

E amanhã:

- [ ] O lembrete de 24h chegou
- [ ] O lembrete de 2h chegou
- [ ] Os botões "Confirmo" e "Cancelar" funcionam ("Confirmo" aparece como confirmada na lista da recepção)

Se a fila estiver **cheia e parada**, o worker morreu. Se estiver **vazia**, é
template não aprovado ou flag desligada — veja
[`09-rotina-pos-deploy.md`](09-rotina-pos-deploy.md#quando-algo-para-de-funcionar).

---

## 8.5 Entregue ao cliente

O aceite técnico passou. O que falta é a conversa:

- **O número que atende**, e o aviso de que **não** dá para usar o app do WhatsApp
  nele (as conversas antigas se foram);
- **O WhatsApp do dono** já recebe os avisos e tem o painel do dono — mostre os
  pedidos de grupo grande, as reservas do dia, o relatório, o "Fechar agenda" e
  o "pausar o bot";
- **O WhatsApp da recepção** tem o painel dela — mostre o "Marcar chegada", que
  é o que alimenta o "compareceram / faltaram" do relatório;
- **Como pedir mudança** de cardápio, lotação, horário ou equipe (e que passa por você);
- **Quem chamar** quando parar de funcionar, e em que horário.

---

## Resumo em um cartão

```
Terminal:   /health  ·  /admin/tenants  ·  curl -sI no domínio
Celular:    "oi" em CADA número  →  o nome certo aparece?
            reservar → confirmar → remarcar → cancelar
            grupo grande → o dono aprova pelo WhatsApp?
            recepção → marcar chegada
Navegador:  domínio com HTTPS · marca certa · fotos ok
            aberto NUM CELULAR de verdade
Amanhã:     o lembrete de 24h chegou
```

**Próximo:** [`09-rotina-pos-deploy.md`](09-rotina-pos-deploy.md)
