# Etapa 8 — Verificação final

Tudo está no ar. Esta etapa é o **aceite**: o que você confere antes de dizer ao
cliente que está pronto.

Faça **do celular**, com o número da barbearia salvo nos contatos. Nenhum teste
de `curl` substitui isto — é assim que o cliente dela vai usar.

---

## 8.1 Infraestrutura (30 segundos, do terminal)

```bash
# o servidor está de pé e o banco responde
curl -s https://barbearia-whatsapp.onrender.com/health
# {"ok":true,"servico":"barbearia-whatsapp"}

# as barbearias estão cadastradas
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://barbearia-whatsapp.onrender.com/admin/tenants

# o site de cada uma responde com HTTPS
curl -sI https://studiomaxbarber.com.br | head -1
# HTTP/2 200
```

---

## 8.2 O bot, do celular — por barbearia

Mande mensagem para **cada número**, um por um:

- [ ] "oi" → o menu aparece **com o nome daquela barbearia**
- [ ] Agendar → serviço → barbeiro → dia → horário → confirmar
- [ ] A confirmação chega **na hora**, com dia, horário, serviço e endereço certos
- [ ] O dono (`--owner`) recebeu o aviso do agendamento
- [ ] "Meus agendamentos" → remarcar funciona
- [ ] Cancelar funciona, e o horário **volta a aparecer como livre**
- [ ] Fora do horário de funcionamento, o bot **não oferece** horário

> ⚠️ **O passo 1 em *todos* os números é o teste que mais importa.** É como se
> descobre o erro clássico de multi-tenant: dois `phone_number_id` trocados no
> `tenant:add`. O sintoma é o cliente de uma barbearia vendo o menu, os preços e
> os barbeiros da outra — e ninguém percebe até o cliente reclamar.

---

## 8.3 O site, do celular — por barbearia

- [ ] `https://<dominio>` abre com HTTPS, sem aviso de certificado
- [ ] É a marca e as cores daquela barbearia
- [ ] O título da aba tem o nome dela
- [ ] O botão do WhatsApp abre conversa **com o número dela**
- [ ] Nenhuma foto quebrada (retângulo escuro = caminho errado no config)
- [ ] **Aberto de verdade num celular**, não só na janela estreita do navegador:
      o hero ocupa a tela e o botão flutuante não fica atrás da barra de gestos
- [ ] Os preços do site batem com os do bot

O último item do celular é o que mais pega. O site é feito para o celular
primeiro, e é do celular que os clientes vão abrir.

> Sobre os preços: é o **mesmo arquivo** alimentando os dois, mas confira mesmo
> assim. Se divergirem, o `tenant:sync` rodou e o rebuild do site não —
> [etapa 7](07-cadastro-barbearias.md#74-tenantsync--quando-o-config-muda).

---

## 8.4 O lembrete — no dia seguinte

Este é o único item que não fecha hoje. Agende um horário para o dia seguinte e
confira que a mensagem entrou na fila:

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://barbearia-whatsapp.onrender.com/admin/studio-max/fila
```

E amanhã:

- [ ] O lembrete de 24h chegou
- [ ] O lembrete de 2h chegou
- [ ] Os botões "Confirmar presença" e "Cancelar" funcionam

Se a fila estiver **cheia e parada**, o worker morreu. Se estiver **vazia**, é
template não aprovado ou flag desligada — veja
[`09-rotina-pos-deploy.md`](09-rotina-pos-deploy.md#quando-algo-para-de-funcionar).

---

## 8.5 Entregue ao cliente

O aceite técnico passou. O que falta é a conversa:

- **O número que atende**, e o aviso de que **não** dá para usar o app do WhatsApp
  nele (as conversas antigas se foram);
- **O WhatsApp do dono** já recebe os avisos e tem o menu de administração —
  mostre a agenda do dia, o bloqueio de horário e o "pausar o bot";
- **Como pedir mudança** de preço, horário ou equipe (e que passa por você);
- **Quem chamar** quando parar de funcionar, e em que horário.

---

## Resumo em um cartão

```
Terminal:   /health  ·  /admin/tenants  ·  curl -sI no domínio
Celular:    "oi" em CADA número  →  o nome certo aparece?
            agendar → confirmar → remarcar → cancelar
            o dono recebeu o aviso?
Navegador:  domínio com HTTPS · marca certa · fotos ok
            aberto NUM CELULAR de verdade
Amanhã:     o lembrete de 24h chegou
```

**Próximo:** [`09-rotina-pos-deploy.md`](09-rotina-pos-deploy.md)
