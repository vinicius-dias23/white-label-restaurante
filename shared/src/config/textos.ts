/**
 * Catálogo dos textos do atendimento no WhatsApp.
 *
 * Toda frase que o bot manda nasce aqui: o padrão, o grupo em que ela aparece
 * na UI de edição, as variáveis que aceita e o limite de tamanho da Meta.
 *
 * O restaurante sobrescreve o que quiser em `whatsapp.textos` do
 * `restaurante.config.json`; o que ela não escrever continua saindo com o padrão
 * desta tabela. Nenhum texto visível ao cliente ou ao dono deve ficar escrito
 * direto no código do bot — o teste de completude reprova quem tentar.
 *
 * `{variavel}` é substituída em tempo de envio por `renderTexto`.
 */

export type GrupoTexto = 'cliente' | 'dono' | 'recepcao' | 'rotulos' | 'templates'

export const GRUPO_LABELS: Record<GrupoTexto, string> = {
  cliente: 'Cliente',
  dono: 'Dono',
  recepcao: 'Recepção',
  rotulos: 'Botões e listas',
  templates: 'Templates da Meta',
}

export interface TextoMeta {
  grupo: GrupoTexto
  /** Nome curto do texto na UI. */
  rotulo: string
  /** Contexto: quando essa mensagem sai. */
  ajuda?: string
  /** Variáveis aceitas, sem as chaves. */
  variaveis: readonly string[]
  /** Limite de caracteres imposto pela Cloud API, quando existe. */
  limite?: number
  multilinha: boolean
  padrao: string
}

const meta = (m: TextoMeta): TextoMeta => m

// Limites da Cloud API que valem para este catálogo. Os números completos, e o
// corte automático, estão em whatsapp/src/whatsapp/limits.ts.
const CORPO = 1024
const TEXTO_LIVRE = 4096
const BOTAO = 20
const LINHA = 24
const DESCRICAO = 72
const SECAO = 24

export const TEXTOS = {
  // -------------------------------------------------------------------------
  // Cliente — menu e telas informativas
  // -------------------------------------------------------------------------

  'cliente.menu.saudacao': meta({
    grupo: 'cliente',
    rotulo: 'Saudação do menu',
    ajuda: 'Primeira linha do menu principal. O campo "whatsapp.greeting", se preenchido, vence este texto.',
    variaveis: ['marca'],
    limite: CORPO,
    multilinha: false,
    padrao: 'Olá! Aqui é a {marca} 🍝',
  }),

  'cliente.menu.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Menu principal',
    ajuda: 'O corpo do menu, logo abaixo da saudação.',
    variaveis: ['saudacao', 'marca'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '{saudacao}',
      'Como posso ajudar?',
    ].join('\n'),
  }),

  'cliente.menu.naoEntendi': meta({
    grupo: 'cliente',
    rotulo: 'Não entendi',
    ajuda: 'Aparece acima do menu quando o cliente escreve algo que o bot não reconhece.',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Não entendi 🙂 Toque numa das opções abaixo:',
  }),

  'cliente.cardapio.titulo': meta({
    grupo: 'cliente',
    rotulo: 'Cardápio — título',
    ajuda: 'Os pratos em destaque, com preço, são montados logo abaixo a partir do config.',
    variaveis: ['marca'],
    limite: CORPO,
    multilinha: false,
    padrao: '*Destaques do cardápio da {marca}* 🍽️',
  }),

  'cliente.cardapio.link': meta({
    grupo: 'cliente',
    rotulo: 'Cardápio — link do completo',
    ajuda: 'Só aparece quando o config tem "menu.url".',
    variaveis: ['link'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '📖 Cardápio completo:',
      '{link}',
    ].join('\n'),
  }),

  'cliente.horarios.titulo': meta({
    grupo: 'cliente',
    rotulo: 'Horários — título',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '*Horário de funcionamento*',
  }),

  'cliente.horarios.aberto': meta({
    grupo: 'cliente',
    rotulo: 'Horários — aberto agora',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '🟢 *Aberto agora*',
  }),

  'cliente.horarios.fechadoComProxima': meta({
    grupo: 'cliente',
    rotulo: 'Horários — fechado, com a próxima abertura',
    variaveis: ['dia', 'hora'],
    limite: CORPO,
    multilinha: false,
    padrao: '🔴 *Fechado agora* — abrimos {dia} às {hora}',
  }),

  'cliente.horarios.fechado': meta({
    grupo: 'cliente',
    rotulo: 'Horários — fechado, sem próxima abertura',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '🔴 *Fechado agora*',
  }),

  'cliente.endereco.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Endereço',
    variaveis: ['marca', 'endereco', 'link'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      '*{marca}*',
      '',
      '📍 {endereco}',
      '',
      'Traçar rota:',
      '{link}',
    ].join('\n'),
  }),

  'cliente.pagamento.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Formas de pagamento',
    variaveis: ['formas'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*Formas de pagamento*',
      '',
      '{formas}',
    ].join('\n'),
  }),

  'cliente.atendente.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Falar com atendente',
    ajuda: 'O bot fica em silêncio nessa conversa depois desta mensagem.',
    variaveis: ['pausa'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      'Já avisei a equipe 👍',
      '',
      'Alguém responde por aqui assim que puder.',
      'Enquanto isso o atendimento automático fica parado nesta conversa{pausa}.',
      '',
      'Se preferir voltar ao menu, é só escrever *menu*.',
    ].join('\n'),
  }),

  'cliente.atendente.pausa': meta({
    grupo: 'cliente',
    rotulo: 'Falar com atendente — trecho do tempo de pausa',
    variaveis: ['minutos'],
    multilinha: false,
    padrao: ' por {minutos} minutos',
  }),

  'cliente.botPausado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Bot pausado pelo dono',
    variaveis: ['marca'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: 'Recebemos sua mensagem! A equipe da {marca} responde por aqui em instantes 👋',
  }),

  // -------------------------------------------------------------------------
  // Cliente — reserva
  // -------------------------------------------------------------------------

  'cliente.escolherPessoas.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Quantas pessoas',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Vamos reservar sua mesa! 🍽️',
      'Para quantas pessoas?',
    ].join('\n'),
  }),

  'cliente.digitarPessoas.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Grupo grande — digitar o número',
    ajuda: 'Aparece depois do toque em "9 ou mais". É a única tela em que o bot lê o que o cliente digita.',
    variaveis: ['maximo'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Quantas pessoas vêm? Escreva só o número, por exemplo *12*.',
      '',
      'Pelo WhatsApp reservamos para até {maximo} pessoas.',
    ].join('\n'),
  }),

  'cliente.grupoGrande.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Grupo acima do limite',
    ajuda: 'Grupo maior que "booking.maxPartySize", ou maior que qualquer ambiente.',
    variaveis: ['pessoas'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Para {pessoas} a gente prefere combinar direitinho com você 🙂',
      '',
      'Toque em *Falar com atendente* que a equipe organiza o espaço.',
    ].join('\n'),
  }),

  'cliente.escolherAmbiente.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Escolher o ambiente',
    ajuda: 'Pulada quando só um ambiente comporta o grupo.',
    variaveis: ['pessoas'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Mesa para *{pessoas}*.',
      'Onde vocês preferem sentar?',
    ].join('\n'),
  }),

  'cliente.escolherDia.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Escolher o dia',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Para que dia?',
  }),

  'cliente.escolherHorario.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Escolher o horário',
    variaveis: ['dia'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*{dia}*',
      'Escolha o horário:',
    ].join('\n'),
  }),

  'cliente.confirmar.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Conferir antes de confirmar',
    variaveis: ['pessoas', 'ambiente', 'data', 'aprovacao'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Confere a reserva:',
      '',
      '👥 {pessoas}',
      '📍 {ambiente}',
      '📅 *{data}*{aprovacao}',
      '',
      'Posso confirmar?',
    ].join('\n'),
  }),

  'cliente.confirmar.aprovacao': meta({
    grupo: 'cliente',
    rotulo: 'Conferir — aviso de grupo grande',
    ajuda: 'Entra no {aprovacao} quando o grupo passa de "booking.approvalAbovePartySize".',
    variaveis: [],
    multilinha: true,
    padrao: '\n\nComo o grupo é grande, a casa confirma o pedido por aqui em seguida.',
  }),

  'cliente.reservado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Reserva confirmada',
    ajuda: 'É a única confirmação que o cliente recebe — sai na hora, como resposta ao "Confirmar".',
    variaveis: ['marca', 'pessoas', 'ambiente', 'data', 'endereco'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '✅ *Mesa reservada!*',
      '',
      '👥 {pessoas}',
      '📍 {ambiente}',
      '📅 *{data}*{endereco}',
      '',
      'Te lembro antes. Até lá! 🍷',
    ].join('\n'),
  }),

  'cliente.reservado.endereco': meta({
    grupo: 'cliente',
    rotulo: 'Reserva confirmada — linha do endereço',
    variaveis: ['endereco'],
    multilinha: false,
    padrao: '\n📍 {endereco}',
  }),

  'cliente.aguardandoAprovacao.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Pedido de grupo grande enviado',
    variaveis: ['marca', 'pessoas', 'ambiente', 'data'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '📨 *Pedido enviado!*',
      '',
      '👥 {pessoas}',
      '📍 {ambiente}',
      '📅 *{data}*',
      '',
      'Os lugares já estão guardados. A equipe da {marca} confirma por aqui em breve.',
    ].join('\n'),
  }),

  'cliente.aprovada.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Pedido aprovado pelo dono',
    ajuda: 'Sai quando o dono toca em "Aprovar". Só chega se o cliente falou com o bot nas últimas 24h.',
    variaveis: ['marca', 'pessoas', 'ambiente', 'data', 'endereco'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '🎉 *Reserva confirmada pela {marca}!*',
      '',
      '👥 {pessoas}',
      '📍 {ambiente}',
      '📅 *{data}*{endereco}',
      '',
      'Te lembro antes. Até lá!',
    ].join('\n'),
  }),

  'cliente.recusada.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Pedido recusado pelo dono',
    ajuda: 'Sai quando o dono toca em "Recusar".',
    variaveis: ['marca', 'pessoas', 'data'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Poxa, não vamos conseguir receber {pessoas} em *{data}* 😕',
      '',
      'Quer tentar outro horário, ou falar com a equipe da {marca}?',
    ].join('\n'),
  }),

  'cliente.semHorario.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Sem mesa disponível',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Poxa, não achei mesa livre para esse grupo nos próximos dias 😕',
      '',
      'Fale com a gente que a equipe tenta encaixar.',
    ].join('\n'),
  }),

  'cliente.horarioOcupado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Ambiente lotou antes de confirmar',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Ih, esse horário acabou de lotar 😅',
      '',
      'Escolha outro, rapidinho:',
    ].join('\n'),
  }),

  'cliente.limiteReservas.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Limite de reservas atingido',
    variaveis: ['quantos'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Você já tem {quantos}.',
      '',
      'Para reservar mais, cancele ou remarque uma delas em *Minhas reservas*.',
    ].join('\n'),
  }),

  'cliente.limiteReservas.um': meta({
    grupo: 'cliente',
    rotulo: 'Limite — no singular',
    variaveis: [],
    multilinha: false,
    padrao: 'uma reserva',
  }),

  'cliente.limiteReservas.varios': meta({
    grupo: 'cliente',
    rotulo: 'Limite — no plural',
    variaveis: ['limite'],
    multilinha: false,
    padrao: '{limite} reservas',
  }),

  // -------------------------------------------------------------------------
  // Cliente — reservas já feitas
  // -------------------------------------------------------------------------

  'cliente.minhasReservas.titulo': meta({
    grupo: 'cliente',
    rotulo: 'Minhas reservas — título',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '*Suas reservas*',
  }),

  'cliente.minhasReservas.vazio': meta({
    grupo: 'cliente',
    rotulo: 'Minhas reservas — nenhuma',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Você não tem nenhuma reserva no momento.',
  }),

  'cliente.acoesReserva.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Ações de uma reserva',
    variaveis: ['data', 'pessoas', 'ambiente', 'status'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '📅 *{data}*',
      '👥 {pessoas}',
      '📍 {ambiente}{status}',
      '',
      'O que você quer fazer?',
    ].join('\n'),
  }),

  'cliente.acoesReserva.pendente': meta({
    grupo: 'cliente',
    rotulo: 'Ações — pedido ainda pendente',
    variaveis: [],
    multilinha: false,
    padrao: '\n⏳ Esperando a confirmação da casa',
  }),

  'cliente.confirmarCancelamento.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Confirmar cancelamento',
    variaveis: ['data', 'pessoas', 'ambiente'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Cancelar a reserva de *{data}*?',
      '',
      '{pessoas} · {ambiente}',
    ].join('\n'),
  }),

  'cliente.cancelado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Cancelado',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '✅ Reserva cancelada. A mesa já está livre para outro grupo.',
  }),

  'cliente.cancelamentoTarde.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Cancelamento fora do prazo',
    variaveis: ['horas'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Pelo WhatsApp dá para cancelar até {horas}h antes 🙏',
      '',
      'Como está em cima da hora, fale com a gente por aqui que a equipe resolve.',
    ].join('\n'),
  }),

  'cliente.presencaConfirmada.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Presença confirmada',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '👍 Presença confirmada, sua mesa está garantida! Até já.',
  }),

  'cliente.posVisita.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Pós-visita (dentro da janela de 24h)',
    variaveis: ['nome', 'marca'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Oi, {nome}! Obrigado por vir à {marca} ontem 🍷',
      '',
      'Se gostou, uma avaliação ajuda demais a gente a aparecer para mais gente.',
    ].join('\n'),
  }),

  'cliente.optOut.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Saiu da lista (LGPD)',
    variaveis: [],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      'Pronto ✅',
      '',
      'Você não vai mais receber nossas mensagens automáticas — nem lembretes, nem promoções.',
      '',
      'Suas reservas continuam valendo. Para voltar a receber, escreva *quero receber*.',
    ].join('\n'),
  }),

  'cliente.optIn.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Voltou para a lista (LGPD)',
    variaveis: ['marca'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      'Combinado! Você volta a receber os lembretes e novidades da {marca} 👍',
      'Escreva *menu* quando quiser reservar uma mesa.',
    ].join('\n'),
  }),

  // -------------------------------------------------------------------------
  // Dono — painel no WhatsApp
  // -------------------------------------------------------------------------

  'dono.menu.titulo': meta({
    grupo: 'dono',
    rotulo: 'Painel do dono — título',
    variaveis: ['marca', 'status'],
    limite: CORPO,
    multilinha: false,
    padrao: '*{marca} — painel*{status}',
  }),

  'dono.menu.statusPausado': meta({
    grupo: 'dono',
    rotulo: 'Painel — aviso de bot pausado',
    variaveis: ['hora'],
    multilinha: true,
    padrao: '\n\n🔇 Bot pausado até {hora}.',
  }),

  'dono.pausar.corpo': meta({
    grupo: 'dono',
    rotulo: 'Bot pausado',
    variaveis: ['hora'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '🔇 Atendimento automático pausado até {hora}.',
      '',
      'Os clientes que escreverem recebem um aviso de que a equipe já vai responder.',
    ].join('\n'),
  }),

  'dono.retomar.corpo': meta({
    grupo: 'dono',
    rotulo: 'Bot religado',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '🔊 Atendimento automático religado.',
  }),

  'dono.agenda.titulo': meta({
    grupo: 'dono',
    rotulo: 'Reservas do dia — título',
    variaveis: ['dia', 'total', 'pessoas'],
    limite: CORPO,
    multilinha: false,
    padrao: '📅 *{dia}* — {total} reserva(s), {pessoas}',
  }),

  'dono.agenda.vazia': meta({
    grupo: 'dono',
    rotulo: 'Reservas do dia — vazia',
    variaveis: ['dia'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '📅 *{dia}*',
      '',
      'Nenhuma reserva.',
    ].join('\n'),
  }),

  'dono.semana.titulo': meta({
    grupo: 'dono',
    rotulo: 'Próximos 7 dias — título',
    variaveis: ['total', 'pessoas'],
    limite: CORPO,
    multilinha: false,
    padrao: '📊 *Próximos 7 dias* — {total} reserva(s), {pessoas}',
  }),

  'dono.semana.linha': meta({
    grupo: 'dono',
    rotulo: 'Próximos 7 dias — um dia',
    variaveis: ['dia', 'reservas', 'pessoas'],
    multilinha: false,
    padrao: '{dia}  {reservas} reserva(s) · {pessoas}',
  }),

  'dono.semana.vazia': meta({
    grupo: 'dono',
    rotulo: 'Próximos 7 dias — vazio',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Nenhuma reserva nos próximos 7 dias.',
  }),

  'dono.pendentes.corpo': meta({
    grupo: 'dono',
    rotulo: 'Pedidos pendentes — lista',
    variaveis: ['total'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '⏳ *{total} pedido(s) de grupo grande* esperando sua resposta.',
      '',
      'Toque num pedido para aprovar ou recusar.',
    ].join('\n'),
  }),

  'dono.pendentes.vazio': meta({
    grupo: 'dono',
    rotulo: 'Pedidos pendentes — nenhum',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Nenhum pedido esperando resposta 👍',
  }),

  'dono.pedido.jaResolvido': meta({
    grupo: 'dono',
    rotulo: 'Pedido já resolvido',
    ajuda: 'Aparece quando o dono toca num botão de um pedido antigo.',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Esse pedido já foi resolvido — aprovado, recusado ou cancelado pelo cliente.',
  }),

  'dono.aprovada.corpo': meta({
    grupo: 'dono',
    rotulo: 'Pedido aprovado',
    variaveis: ['cliente', 'pessoas'],
    limite: CORPO,
    multilinha: false,
    padrao: '✅ Reserva de {cliente} ({pessoas}) aprovada. O cliente foi avisado e recebe os lembretes.',
  }),

  'dono.recusada.corpo': meta({
    grupo: 'dono',
    rotulo: 'Pedido recusado',
    variaveis: ['cliente'],
    limite: CORPO,
    multilinha: false,
    padrao: 'Pedido de {cliente} recusado. Os lugares voltaram para a agenda e o cliente foi avisado.',
  }),

  'dono.relatorio.titulo': meta({
    grupo: 'dono',
    rotulo: 'Relatório — título',
    variaveis: ['marca'],
    limite: CORPO,
    multilinha: false,
    padrao: '📈 *Relatório da {marca}*',
  }),

  'dono.relatorio.hoje': meta({
    grupo: 'dono',
    rotulo: 'Relatório — hoje',
    variaveis: [],
    multilinha: false,
    padrao: 'Hoje',
  }),

  'dono.relatorio.ontem': meta({
    grupo: 'dono',
    rotulo: 'Relatório — ontem',
    variaveis: [],
    multilinha: false,
    padrao: 'Ontem',
  }),

  'dono.relatorio.semana': meta({
    grupo: 'dono',
    rotulo: 'Relatório — 7 dias',
    variaveis: [],
    multilinha: false,
    padrao: 'Últimos 7 dias',
  }),

  'dono.relatorio.mes': meta({
    grupo: 'dono',
    rotulo: 'Relatório — mês',
    variaveis: [],
    multilinha: false,
    padrao: 'No mês',
  }),

  'dono.bloquear.corpo': meta({
    grupo: 'dono',
    rotulo: 'Fechar agenda — menu',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Qual período fechar?',
      '',
      'Ninguém mais consegue reservar nele. Quem já reservou continua reservado.',
    ].join('\n'),
  }),

  'dono.bloqueado.corpo': meta({
    grupo: 'dono',
    rotulo: 'Agenda fechada',
    variaveis: ['dia', 'periodo', 'aviso'],
    limite: CORPO,
    multilinha: false,
    padrao: '🚫 Fechado para reservas: *{dia}*, {periodo}.{aviso}',
  }),

  'dono.bloqueado.aviso': meta({
    grupo: 'dono',
    rotulo: 'Agenda fechada — reservas afetadas',
    variaveis: ['total'],
    multilinha: true,
    padrao: '\n\n⚠️ Atenção: já existem {total} reserva(s) nesse período. Avise cada cliente.',
  }),

  'dono.bloqueado.periodoDia': meta({
    grupo: 'dono',
    rotulo: 'Fechar — o dia todo',
    variaveis: [],
    multilinha: false,
    padrao: 'o dia todo',
  }),

  'dono.bloqueado.periodoFaixa': meta({
    grupo: 'dono',
    rotulo: 'Fechar — faixa de horas',
    variaveis: ['de', 'ate'],
    multilinha: false,
    padrao: 'das {de}h às {ate}h',
  }),

  'dono.aviso.novaReserva': meta({
    grupo: 'dono',
    rotulo: 'Aviso — nova reserva',
    variaveis: ['data', 'pessoas', 'ambiente', 'cliente', 'waId'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      '🍽️ *Nova reserva*',
      '',
      '{data}',
      '{pessoas} · {ambiente}',
      'Cliente: {cliente}',
    ].join('\n'),
  }),

  'dono.aviso.pedidoAprovacao': meta({
    grupo: 'dono',
    rotulo: 'Aviso — pedido de grupo grande',
    ajuda: 'Vai com os botões "Aprovar" e "Recusar".',
    variaveis: ['data', 'pessoas', 'ambiente', 'cliente', 'waId'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '⏳ *Pedido de grupo grande*',
      '',
      '{data}',
      '{pessoas} · {ambiente}',
      'Cliente: {cliente} (+{waId})',
      '',
      'Os lugares ficam guardados até você responder.',
    ].join('\n'),
  }),

  'dono.aviso.cancelamento': meta({
    grupo: 'dono',
    rotulo: 'Aviso — cancelamento',
    variaveis: ['data', 'pessoas', 'ambiente', 'cliente', 'waId'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      '❌ *Reserva cancelada*',
      '',
      '{data}',
      '{pessoas} · {ambiente}',
      'Cliente: {cliente}',
      '',
      'Os lugares voltaram para a agenda.',
    ].join('\n'),
  }),

  'dono.aviso.atendente': meta({
    grupo: 'dono',
    rotulo: 'Aviso — cliente pediu atendimento humano',
    variaveis: ['cliente', 'waId'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      '🙋 *{cliente} quer falar com alguém*',
      '',
      'WhatsApp: +{waId}',
      '',
      'O bot ficou em silêncio nessa conversa. Responda direto pelo WhatsApp Business.',
    ].join('\n'),
  }),

  'dono.semNomeInicio': meta({
    grupo: 'dono',
    rotulo: 'Cliente sem nome (começo de frase)',
    variaveis: [],
    multilinha: false,
    padrao: 'Sem nome',
  }),

  'dono.semNome': meta({
    grupo: 'dono',
    rotulo: 'Cliente sem nome',
    variaveis: [],
    multilinha: false,
    padrao: 'sem nome',
  }),

  // -------------------------------------------------------------------------
  // Recepção — painel no WhatsApp
  // -------------------------------------------------------------------------

  'recepcao.menu.titulo': meta({
    grupo: 'recepcao',
    rotulo: 'Painel da recepção — título',
    variaveis: ['nome', 'marca'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*{marca}*',
      'Oi, {nome} 👋',
    ].join('\n'),
  }),

  'recepcao.agenda.titulo': meta({
    grupo: 'recepcao',
    rotulo: 'Reservas do dia — título',
    variaveis: ['dia', 'total', 'pessoas'],
    limite: CORPO,
    multilinha: false,
    padrao: '📅 *{dia}* — {total} reserva(s), {pessoas}',
  }),

  'recepcao.agenda.vazia': meta({
    grupo: 'recepcao',
    rotulo: 'Reservas do dia — vazia',
    variaveis: ['dia'],
    limite: CORPO,
    multilinha: false,
    padrao: 'Nenhuma reserva em {dia}.',
  }),

  'recepcao.agenda.linha': meta({
    grupo: 'recepcao',
    rotulo: 'Reservas do dia — uma linha',
    ajuda: 'Usada também na lista do dono.',
    variaveis: ['hora', 'cliente', 'pessoas', 'ambiente', 'status'],
    multilinha: false,
    padrao: '{hora}  {cliente} · {pessoas} · {ambiente}{status}',
  }),

  'recepcao.chegadas.corpo': meta({
    grupo: 'recepcao',
    rotulo: 'Marcar chegada — lista',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Quem chegou? Toque na reserva para marcar.',
  }),

  'recepcao.chegadas.vazio': meta({
    grupo: 'recepcao',
    rotulo: 'Marcar chegada — sem reservas hoje',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Nenhuma reserva para hoje.',
  }),

  'recepcao.reserva.corpo': meta({
    grupo: 'recepcao',
    rotulo: 'Marcar chegada — uma reserva',
    variaveis: ['hora', 'cliente', 'pessoas', 'ambiente', 'status', 'waId'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*{hora} — {cliente}*{status}',
      '👥 {pessoas}',
      '📍 {ambiente}',
      '📱 +{waId}',
    ].join('\n'),
  }),

  'recepcao.marcar.chegou': meta({
    grupo: 'recepcao',
    rotulo: 'Chegada registrada',
    variaveis: ['cliente', 'pessoas', 'ambiente'],
    limite: CORPO,
    multilinha: false,
    padrao: '🟢 {cliente} chegou — {pessoas}, {ambiente}.',
  }),

  'recepcao.marcar.faltou': meta({
    grupo: 'recepcao',
    rotulo: 'Falta registrada',
    variaveis: ['cliente'],
    limite: CORPO,
    multilinha: false,
    padrao: '❌ Falta de {cliente} registrada.',
  }),

  'recepcao.marcar.naoEncontrada': meta({
    grupo: 'recepcao',
    rotulo: 'Reserva não encontrada',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Essa reserva não está mais na lista (foi cancelada?).',
  }),

  'recepcao.resumo.bloco': meta({
    grupo: 'recepcao',
    rotulo: 'Resumo — um período',
    ajuda: 'Usado também no relatório do dono.',
    variaveis: ['periodo', 'reservas', 'pessoas', 'compareceram', 'faltaram'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*{periodo}* — {reservas} reserva(s), {pessoas}',
      '🟢 {compareceram} vieram · ❌ {faltaram} faltaram',
    ].join('\n'),
  }),

  // -------------------------------------------------------------------------
  // Botões e listas — limites da Meta: botão 20, linha 24, descrição 72, seção 24
  // -------------------------------------------------------------------------

  'rotulos.lista.verOpcoes': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre o menu principal',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver opções',
  }),

  'rotulos.lista.escolher': meta({
    grupo: 'rotulos',
    rotulo: 'Botão das listas de escolha',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Escolher',
  }),

  'rotulos.lista.escolherDia': meta({
    grupo: 'rotulos',
    rotulo: 'Botão da lista de dias',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Escolher dia',
  }),

  'rotulos.lista.verHorarios': meta({
    grupo: 'rotulos',
    rotulo: 'Botão da lista de horários',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver horários',
  }),

  'rotulos.lista.verReservas': meta({
    grupo: 'rotulos',
    rotulo: 'Botão da lista de reservas',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver reservas',
  }),

  'rotulos.secao.atendimento': meta({
    grupo: 'rotulos',
    rotulo: 'Seção do menu principal',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Atendimento',
  }),

  'rotulos.secao.pessoas': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — pessoas',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Pessoas',
  }),

  'rotulos.secao.ambientes': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — ambientes',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Ambientes',
  }),

  'rotulos.secao.dias': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — dias',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Dias com mesa',
  }),

  'rotulos.secao.outrasOpcoes': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — outras opções',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Outras opções',
  }),

  'rotulos.secao.reservas': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — reservas do cliente',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Suas reservas',
  }),

  'rotulos.secao.administracao': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — painel do dono',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Administração',
  }),

  'rotulos.secao.pedidos': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — pedidos pendentes',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Pedidos',
  }),

  'rotulos.secao.bloqueios': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — fechar agenda',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Fechar agenda',
  }),

  'rotulos.secao.recepcao': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — painel da recepção',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Recepção',
  }),

  'rotulos.secao.hoje': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — reservas de hoje',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Hoje',
  }),

  'rotulos.menu.reservar': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — reservar',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Reservar mesa',
  }),

  'rotulos.menu.reservarDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — reservar, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Escolha dia, horário e ambiente',
  }),

  'rotulos.menu.minhas': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — minhas reservas',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Minhas reservas',
  }),

  'rotulos.menu.minhasDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — minhas reservas, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Ver, remarcar ou cancelar',
  }),

  'rotulos.menu.cardapio': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — cardápio',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Cardápio',
  }),

  'rotulos.menu.cardapioDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — cardápio, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Pratos da casa e preços',
  }),

  'rotulos.menu.horarios': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — horários',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Horário de funcionamento',
  }),

  'rotulos.menu.endereco': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — endereço',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Endereço',
  }),

  'rotulos.menu.enderecoDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — endereço, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Como chegar',
  }),

  'rotulos.menu.pagamento': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — pagamento',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Formas de pagamento',
  }),

  'rotulos.menu.atendente': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — atendente',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Falar com atendente',
  }),

  'rotulos.menu.atendenteDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — atendente, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Eventos, grupos e dúvidas',
  }),

  'rotulos.botao.reservar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — reservar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Reservar mesa',
  }),

  'rotulos.botao.reservarMesa': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — reservar (sem reservas)',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Reservar agora',
  }),

  'rotulos.botao.reservarOutra': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — reservar outra',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Reservar outra',
  }),

  'rotulos.botao.outroHorario': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — tentar outro horário',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Outro horário',
  }),

  'rotulos.botao.voltarMenu': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — voltar ao menu',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Menu',
  }),

  'rotulos.linha.voltarMenu': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — voltar ao menu',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: '↩️ Voltar ao menu',
  }),

  'rotulos.botao.confirmar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — confirmar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: '✅ Confirmar',
  }),

  'rotulos.botao.trocarHorario': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — trocar horário',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Trocar horário',
  }),

  'rotulos.botao.cancelar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — cancelar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Cancelar',
  }),

  'rotulos.botao.atendente': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — atendente',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Falar com atendente',
  }),

  'rotulos.botao.minhas': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — minhas reservas',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Minhas reservas',
  }),

  'rotulos.botao.verOutrosHorarios': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — ver outros horários',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver outros horários',
  }),

  'rotulos.botao.remarcar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — remarcar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Remarcar',
  }),

  'rotulos.botao.simCancelar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — sim, cancelar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Sim, cancelar',
  }),

  'rotulos.botao.naoManter': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — não, manter',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Não, manter',
  }),

  'rotulos.botao.avaliar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — avaliar no Google',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Avaliar',
  }),

  'rotulos.linha.maisPessoas': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — grupo grande',
    variaveis: ['total'],
    limite: LINHA,
    multilinha: false,
    padrao: '{total} ou mais',
  }),

  'rotulos.linha.maisPessoasDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — grupo grande, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Você digita o número',
  }),

  'rotulos.linha.tantoFaz': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — qualquer ambiente',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Tanto faz',
  }),

  'rotulos.linha.tantoFazDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — qualquer ambiente, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Onde tiver lugar primeiro',
  }),

  'rotulos.linha.maisDias': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — mais dias',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Ver mais dias',
  }),

  'rotulos.linha.maisHorarios': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — mais horários',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Ver mais horários',
  }),

  'rotulos.linha.maisReservas': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — mais reservas',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Ver mais reservas',
  }),

  'rotulos.pessoa.uma': meta({
    grupo: 'rotulos',
    rotulo: 'Pessoas — singular',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: '1 pessoa',
  }),

  'rotulos.pessoa.varias': meta({
    grupo: 'rotulos',
    rotulo: 'Pessoas — plural',
    variaveis: ['total'],
    limite: LINHA,
    multilinha: false,
    padrao: '{total} pessoas',
  }),

  'rotulos.ambienteQualquer': meta({
    grupo: 'rotulos',
    rotulo: 'Ambiente — sem preferência',
    ajuda: 'Aparece na conferência quando o cliente escolheu "Tanto faz".',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Onde tiver lugar',
  }),

  'rotulos.status.pendente': meta({
    grupo: 'rotulos',
    rotulo: 'Status — pedido pendente',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'aguardando a casa',
  }),

  'rotulos.status.marcaPendente': meta({
    grupo: 'rotulos',
    rotulo: 'Marca — pendente',
    ajuda: 'Vai grudada no fim da linha da reserva.',
    variaveis: [],
    multilinha: false,
    padrao: ' ⏳',
  }),

  'rotulos.status.marcaConfirmada': meta({
    grupo: 'rotulos',
    rotulo: 'Marca — cliente confirmou',
    variaveis: [],
    multilinha: false,
    padrao: ' ✅',
  }),

  'rotulos.status.marcaChegou': meta({
    grupo: 'rotulos',
    rotulo: 'Marca — chegou',
    variaveis: [],
    multilinha: false,
    padrao: ' 🟢',
  }),

  'rotulos.status.marcaFaltou': meta({
    grupo: 'rotulos',
    rotulo: 'Marca — faltou',
    variaveis: [],
    multilinha: false,
    padrao: ' ❌',
  }),

  'rotulos.dono.pendentes': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — pedidos pendentes',
    variaveis: ['total'],
    limite: LINHA,
    multilinha: false,
    padrao: '⏳ Pedidos ({total})',
  }),

  'rotulos.dono.pendentesDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — pedidos, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Grupos grandes esperando você',
  }),

  'rotulos.dono.hoje': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — reservas de hoje',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Reservas de hoje',
  }),

  'rotulos.dono.amanha': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — reservas de amanhã',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Reservas de amanhã',
  }),

  'rotulos.dono.semana': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — próximos 7 dias',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Próximos 7 dias',
  }),

  'rotulos.dono.chegadas': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — marcar chegadas',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Marcar chegadas',
  }),

  'rotulos.dono.chegadasDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — marcar chegadas, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Abre o painel da recepção',
  }),

  'rotulos.dono.relatorio': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — relatório',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Relatório',
  }),

  'rotulos.dono.relatorioDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — relatório, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Pessoas, comparecimento e faltas',
  }),

  'rotulos.dono.bloquear': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — fechar agenda',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Fechar agenda',
  }),

  'rotulos.dono.bloquearDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — fechar agenda, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Feriado, evento, dia de folga',
  }),

  'rotulos.dono.pausar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — pausar bot',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Pausar o bot',
  }),

  'rotulos.dono.religar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — religar bot',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Religar o bot',
  }),

  'rotulos.dono.retomarAgora': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — religar agora',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Religar agora',
  }),

  'rotulos.dono.menu': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — menu',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Menu do dono',
  }),

  'rotulos.dono.voltar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — voltar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Voltar',
  }),

  'rotulos.dono.voltarLista': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — voltar (linha)',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: '↩️ Voltar',
  }),

  'rotulos.dono.aprovar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — aprovar pedido',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: '✅ Aprovar',
  }),

  'rotulos.dono.recusar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — recusar pedido',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Recusar',
  }),

  'rotulos.dono.outrosPedidos': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — outros pedidos',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Outros pedidos',
  }),

  'rotulos.dono.bloqHojeAlmoco': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — hoje, almoço',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje, almoço',
  }),

  'rotulos.dono.bloqHojeJantar': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — hoje, jantar',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje, jantar',
  }),

  'rotulos.dono.bloqHojeDia': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — hoje inteiro',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje, o dia todo',
  }),

  'rotulos.dono.bloqAmanhaAlmoco': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — amanhã, almoço',
    variaveis: ['data'],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã ({data}), almoço',
  }),

  'rotulos.dono.bloqAmanhaJantar': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — amanhã, jantar',
    variaveis: ['data'],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã ({data}), jantar',
  }),

  'rotulos.dono.bloqAmanhaDia': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — amanhã inteiro',
    variaveis: ['data'],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã ({data}), tudo',
  }),

  'rotulos.dono.bloqAlmocoDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — almoço, descrição',
    variaveis: ['de', 'ate'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Das {de}h às {ate}h',
  }),

  'rotulos.dono.bloqJantarDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Fechar — jantar, descrição',
    variaveis: ['hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Das {hora}h até fechar',
  }),

  'rotulos.recepcao.hoje': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — reservas de hoje',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Reservas de hoje',
  }),

  'rotulos.recepcao.amanha': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — reservas de amanhã',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Reservas de amanhã',
  }),

  'rotulos.recepcao.chegadas': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — marcar chegada',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Marcar chegada',
  }),

  'rotulos.recepcao.chegadasDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — marcar chegada, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Quem chegou e quem faltou',
  }),

  'rotulos.recepcao.resumo': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — resumo',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Resumo',
  }),

  'rotulos.recepcao.resumoDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — resumo, descrição',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Hoje e ontem: pessoas e faltas',
  }),

  'rotulos.recepcao.marcar': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — botão marcar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Marcar chegada',
  }),

  'rotulos.recepcao.chegou': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — chegou',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: '🟢 Chegou',
  }),

  'rotulos.recepcao.faltou': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — faltou',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: '❌ Faltou',
  }),

  'rotulos.recepcao.proxima': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — próxima',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Próxima',
  }),

  'rotulos.recepcao.menu': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — menu',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Menu',
  }),

  'rotulos.recepcao.voltar': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — voltar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Voltar',
  }),

  'rotulos.recepcao.voltarLista': meta({
    grupo: 'rotulos',
    rotulo: 'Recepção — voltar (linha)',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: '↩️ Voltar',
  }),

  // -------------------------------------------------------------------------
  // Templates da Meta — o texto vale só depois de aprovado no WhatsApp Manager
  // -------------------------------------------------------------------------

  'template.lembrete24h.corpo': meta({
    grupo: 'templates',
    rotulo: 'lembrete_24h — corpo',
    ajuda: 'Variáveis na ordem que o servidor envia: {{1}} nome, {{2}} marca, {{3}} pessoas ("4 pessoas"), {{4}} data e hora.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Oi, {{1}}! Passando para lembrar da sua reserva na {{2}} 🍽️',
      '',
      '👥 {{3}}',
      '📅 {{4}}',
      '',
      'Vocês vêm?',
    ].join('\n'),
  }),

  'template.lembrete2h.corpo': meta({
    grupo: 'templates',
    rotulo: 'lembrete_2h — corpo',
    ajuda: '{{1}} nome, {{2}} marca, {{3}} hora.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '{{1}}, sua mesa na {{2}} é hoje às {{3}} ⏰',
      '',
      'Te esperamos!',
    ].join('\n'),
  }),

  'template.posAtendimento.corpo': meta({
    grupo: 'templates',
    rotulo: 'pos_visita — corpo',
    ajuda: '{{1}} nome, {{2}} marca. Tem um botão de URL com o link de avaliação.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Oi, {{1}}! Obrigado por vir à {{2}} 🍷',
      '',
      'Se gostou, uma avaliação ajuda demais a gente a aparecer para mais gente.',
    ].join('\n'),
  }),

  'template.reativacao.corpo': meta({
    grupo: 'templates',
    rotulo: 'reativacao_cliente — corpo',
    ajuda: '{{1}} nome, {{2}} marca, {{3}} dias sem vir. Categoria marketing: exige rodapé de opt-out.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '{{1}}, faz {{3}} dias que a gente não te vê aqui na {{2}} 🍝',
      '',
      'Bora reservar uma mesa? É só responder esta mensagem.',
    ].join('\n'),
  }),

  'template.aniversario.corpo': meta({
    grupo: 'templates',
    rotulo: 'aniversario_cliente — corpo',
    ajuda: '{{1}} nome, {{2}} marca. Categoria marketing: exige rodapé de opt-out.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Parabéns, {{1}}! 🎉',
      '',
      'A {{2}} deseja um ótimo dia. Que tal comemorar com a gente? Reserve sua mesa por aqui!',
    ].join('\n'),
  }),

  'template.rodapeMarketing': meta({
    grupo: 'templates',
    rotulo: 'Rodapé dos templates de marketing',
    ajuda: 'Obrigatório pela Meta em reativacao_cliente e aniversario_cliente.',
    variaveis: [],
    limite: 60,
    multilinha: false,
    padrao: 'Responda SAIR para não receber mais',
  }),
} as const

export type TextoKey = keyof typeof TEXTOS

export const TEXTO_KEYS = Object.keys(TEXTOS) as TextoKey[]

/** Só os padrões, para quem quer comparar o que foi customizado. */
export const TEXTOS_PADRAO: Record<TextoKey, string> = Object.fromEntries(
  TEXTO_KEYS.map((key) => [key, TEXTOS[key].padrao]),
) as Record<TextoKey, string>

export function isTextoKey(value: string): value is TextoKey {
  return Object.prototype.hasOwnProperty.call(TEXTOS, value)
}
