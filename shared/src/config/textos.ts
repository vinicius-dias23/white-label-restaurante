/**
 * Catálogo dos textos do atendimento no WhatsApp.
 *
 * Toda frase que o bot manda nasce aqui: o padrão, o grupo em que ela aparece
 * na UI de edição, as variáveis que aceita e o limite de tamanho da Meta.
 *
 * A barbearia sobrescreve o que quiser em `whatsapp.textos` do
 * `barbearia.config.json`; o que ela não escrever continua saindo com o padrão
 * desta tabela. Nenhum texto visível ao cliente ou ao dono deve ficar escrito
 * direto no código do bot — o teste de completude reprova quem tentar.
 *
 * `{variavel}` é substituída em tempo de envio por `renderTexto`.
 */

export type GrupoTexto = 'cliente' | 'dono' | 'barbeiro' | 'rotulos' | 'templates'

export const GRUPO_LABELS: Record<GrupoTexto, string> = {
  cliente: 'Cliente',
  dono: 'Dono',
  barbeiro: 'Barbeiro',
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
    padrao: 'Olá! Aqui é a {marca} 💈',
  }),

  'cliente.menu.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Menu principal',
    ajuda: 'O corpo do menu, logo abaixo da saudação.',
    variaveis: ['saudacao', 'marca'],
    limite: CORPO,
    multilinha: true,
    padrao: '{saudacao}\nComo posso ajudar?',
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

  'cliente.servicos.titulo': meta({
    grupo: 'cliente',
    rotulo: 'Serviços — título',
    ajuda: 'A lista de serviços e preços é montada logo abaixo, a partir do config.',
    variaveis: ['marca'],
    limite: CORPO,
    multilinha: false,
    padrao: '*Serviços da {marca}*',
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
    ajuda: 'Só aparece quando a barbearia está fechada a semana inteira no config.',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '🔴 *Fechado agora*',
  }),

  'cliente.endereco.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Endereço',
    ajuda: 'O WhatsApp mostra o cartão do mapa embaixo desta mensagem.',
    variaveis: ['marca', 'endereco', 'link'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: '*{marca}*\n\n📍 {endereco}\n\nTraçar rota:\n{link}',
  }),

  'cliente.pagamento.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Formas de pagamento',
    ajuda: 'A variável {formas} vem de "whatsapp.paymentMethods" no config.',
    variaveis: ['formas'],
    limite: CORPO,
    multilinha: true,
    padrao: '*Formas de pagamento*\n\n{formas}',
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
    ajuda: 'Encaixado em {pausa}. Some quando "whatsapp.handoffMinutes" é 0.',
    variaveis: ['minutos'],
    multilinha: false,
    padrao: ' por {minutos} minutos',
  }),

  'cliente.botPausado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Bot pausado pelo dono',
    ajuda: 'Resposta de cortesia enquanto o dono está atendendo à mão.',
    variaveis: ['marca'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: 'Recebemos sua mensagem! A equipe da {marca} responde por aqui em instantes 👋',
  }),

  // -------------------------------------------------------------------------
  // Cliente — fluxo de agendamento
  // -------------------------------------------------------------------------

  'cliente.escolherServico.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Escolher serviço',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'O que você quer fazer?',
  }),

  'cliente.escolherBarbeiro.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Escolher barbeiro',
    ajuda: 'Pulada quando a equipe tem uma pessoa só.',
    variaveis: ['servico'],
    limite: CORPO,
    multilinha: true,
    padrao: '*{servico}*\nCom quem você quer marcar?',
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
    padrao: '*{dia}*\nEscolha o horário:',
  }),

  'cliente.confirmar.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Conferir antes de confirmar',
    variaveis: ['servico', 'preco', 'barbeiro', 'data', 'duracao'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*Confere para mim?*',
      '',
      '💈 {servico}{preco}',
      '✂️ Com {barbeiro}',
      '📅 {data}',
      '⏱️ {duracao}',
    ].join('\n'),
  }),

  'cliente.agendado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Agendamento confirmado',
    ajuda: 'A única confirmação que o cliente recebe — sai na hora, não pela fila.',
    variaveis: ['marca', 'servico', 'preco', 'barbeiro', 'data', 'duracao', 'endereco'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '✅ *Agendamento confirmado na {marca}*',
      '',
      '💈 {servico}{preco}',
      '✂️ Com {barbeiro}',
      '📅 {data}',
      '⏱️ {duracao}{endereco}',
      '',
      'Te mando um lembrete antes. Se precisar mudar, é só voltar aqui em *Meus agendamentos*.',
    ].join('\n'),
  }),

  'cliente.agendado.endereco': meta({
    grupo: 'cliente',
    rotulo: 'Agendamento confirmado — linha do endereço',
    ajuda: 'Encaixado em {endereco}. Some quando a barbearia não tem endereço no config.',
    variaveis: ['endereco'],
    multilinha: false,
    padrao: '\n📍 {endereco}',
  }),

  'cliente.semHorario.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Sem horário livre',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Poxa, não encontrei horário livre nos próximos dias 😕',
      '',
      'Pode ser que tenha aberto alguma vaga desde então — vale tentar de novo mais tarde, ou falar com a equipe.',
    ].join('\n'),
  }),

  'cliente.horarioOcupado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Horário acabou de ser preenchido',
    ajuda: 'Duas pessoas confirmaram o mesmo horário no mesmo instante.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '😅 *Esse horário acabou de ser preenchido*',
      '',
      'Alguém confirmou nesse exato momento. Vamos escolher outro?',
    ].join('\n'),
  }),

  'cliente.limiteAgendamentos.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Limite de agendamentos atingido',
    variaveis: ['quantos'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Você já tem {quantos} 👍',
      '',
      'Para marcar mais um, cancele ou remarque um dos que já estão na agenda.',
    ].join('\n'),
  }),

  'cliente.limiteAgendamentos.um': meta({
    grupo: 'cliente',
    rotulo: 'Limite — no singular',
    ajuda: 'Encaixado em {quantos} quando o limite da barbearia é 1.',
    variaveis: [],
    multilinha: false,
    padrao: 'um horário marcado',
  }),

  'cliente.limiteAgendamentos.varios': meta({
    grupo: 'cliente',
    rotulo: 'Limite — no plural',
    ajuda: 'Encaixado em {quantos} quando o limite é maior que 1.',
    variaveis: ['limite'],
    multilinha: false,
    padrao: '{limite} horários marcados',
  }),

  // -------------------------------------------------------------------------
  // Cliente — agendamentos, cancelamento e LGPD
  // -------------------------------------------------------------------------

  'cliente.meusAgendamentos.titulo': meta({
    grupo: 'cliente',
    rotulo: 'Meus agendamentos — título',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '*Seus horários marcados*',
  }),

  'cliente.meusAgendamentos.vazio': meta({
    grupo: 'cliente',
    rotulo: 'Meus agendamentos — nenhum',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Você não tem nenhum horário marcado no momento.',
  }),

  'cliente.acoesAgendamento.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Ações de um agendamento',
    variaveis: ['data', 'servico', 'barbeiro'],
    limite: CORPO,
    multilinha: true,
    padrao: ['📅 *{data}*', '💈 {servico}', '✂️ Com {barbeiro}', '', 'O que você quer fazer?'].join('\n'),
  }),

  'cliente.confirmarCancelamento.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Confirmar cancelamento',
    variaveis: ['data', 'servico', 'barbeiro'],
    limite: CORPO,
    multilinha: true,
    padrao: 'Cancelar o horário de *{data}*?\n\n{servico} com {barbeiro}',
  }),

  'cliente.cancelado.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Cancelado',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '✅ Horário cancelado. O espaço já está liberado para outra pessoa.',
  }),

  'cliente.cancelamentoTarde.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Cancelamento fora do prazo',
    ajuda: 'O prazo vem de "booking.cancelDeadlineHours" no config.',
    variaveis: ['horas'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Esse horário é daqui a pouco — pelo app só dá para cancelar com {horas}h de antecedência.',
      '',
      'Me deixa chamar alguém da equipe para resolver com você.',
    ].join('\n'),
  }),

  'cliente.presencaConfirmada.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Presença confirmada',
    ajuda: 'Resposta ao botão "Confirmo presença" do lembrete de 24h.',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: '👍 Presença confirmada, te esperamos! Até já.',
  }),

  'cliente.posAtendimento.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Pós-atendimento (dentro da janela de 24h)',
    ajuda: 'Versão com botão de link, usada quando o cliente falou com o bot nas últimas 24h. Fora da janela vale o template da Meta.',
    variaveis: ['nome', 'servico', 'marca'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Opa, {nome}! Tudo certo com o {servico}? 💈',
      '',
      'Se curtiu, uma avaliação ajuda demais a {marca} a aparecer para mais gente.',
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
      'Seus agendamentos continuam valendo. Para voltar a receber, escreva *quero receber*.',
    ].join('\n'),
  }),

  'cliente.optIn.corpo': meta({
    grupo: 'cliente',
    rotulo: 'Voltou para a lista (LGPD)',
    variaveis: ['marca'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao:
      'Combinado! Você volta a receber os lembretes e novidades da {marca} 👍\nEscreva *menu* quando quiser marcar um horário.',
  }),
  // -------------------------------------------------------------------------
  // Dono — painel no WhatsApp
  // -------------------------------------------------------------------------

  'dono.menu.titulo': meta({
    grupo: 'dono',
    rotulo: 'Painel do dono — título',
    variaveis: ['marca', 'status'],
    limite: CORPO,
    multilinha: true,
    padrao: '*{marca} — painel*{status}',
  }),

  'dono.menu.statusPausado': meta({
    grupo: 'dono',
    rotulo: 'Painel — aviso de bot pausado',
    ajuda: 'Encaixado em {status}. Some quando o bot está no ar.',
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
      'Nesse tempo as mensagens dos clientes chegam normalmente, mas o bot não responde — quem responde é você.',
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
    rotulo: 'Agenda do dia — título',
    ajuda: 'A lista de horários é montada logo abaixo, a partir da agenda.',
    variaveis: ['dia', 'total'],
    limite: CORPO,
    multilinha: false,
    padrao: '📅 *{dia}* — {total} agendamento(s)',
  }),

  'dono.agenda.vazia': meta({
    grupo: 'dono',
    rotulo: 'Agenda do dia — vazia',
    variaveis: ['dia'],
    limite: CORPO,
    multilinha: true,
    padrao: '📅 *{dia}*\n\nNenhum horário marcado.',
  }),

  'dono.agenda.linha': meta({
    grupo: 'dono',
    rotulo: 'Agenda do dia — uma linha',
    ajuda: 'Repetida para cada horário do dia. {confirmado} é o ✅ de quem confirmou presença.',
    variaveis: ['hora', 'servico', 'confirmado', 'cliente', 'barbeiro'],
    multilinha: true,
    padrao: '{hora}  {servico}{confirmado}\n      {cliente} · {barbeiro}',
  }),

  'dono.semana.titulo': meta({
    grupo: 'dono',
    rotulo: 'Próximos 7 dias — título',
    variaveis: ['total'],
    limite: CORPO,
    multilinha: false,
    padrao: '📊 *Próximos 7 dias* — {total} no total',
  }),

  'dono.semana.vazia': meta({
    grupo: 'dono',
    rotulo: 'Próximos 7 dias — vazio',
    variaveis: [],
    limite: CORPO,
    multilinha: false,
    padrao: 'Nenhum horário marcado nos próximos 7 dias.',
  }),

  'dono.bloquear.corpo': meta({
    grupo: 'dono',
    rotulo: 'Bloquear horário — menu',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*Bloquear horário*',
      'O período fica indisponível para novos agendamentos.',
      '',
      '_Quem já marcou continua marcado — avise essas pessoas._',
    ].join('\n'),
  }),

  'dono.bloqueado.corpo': meta({
    grupo: 'dono',
    rotulo: 'Bloqueio aplicado',
    variaveis: ['dia', 'periodo', 'aviso'],
    limite: CORPO,
    multilinha: true,
    padrao: '🚫 Bloqueado: *{dia}*, {periodo}.{aviso}',
  }),

  'dono.bloqueado.aviso': meta({
    grupo: 'dono',
    rotulo: 'Bloqueio — aviso de agendamentos afetados',
    ajuda: 'Encaixado em {aviso}. Some quando o período estava vazio.',
    variaveis: ['total'],
    multilinha: true,
    padrao:
      '\n\n⚠️ Já havia {total} agendamento(s) nesse período. Eles continuam valendo — avise os clientes.',
  }),

  'dono.bloqueado.periodoDia': meta({
    grupo: 'dono',
    rotulo: 'Bloqueio — o dia todo',
    ajuda: 'Encaixado em {periodo}.',
    variaveis: [],
    multilinha: false,
    padrao: 'o dia todo',
  }),

  'dono.bloqueado.periodoFaixa': meta({
    grupo: 'dono',
    rotulo: 'Bloqueio — faixa de horas',
    ajuda: 'Encaixado em {periodo} quando o bloqueio é de um turno.',
    variaveis: ['de', 'ate'],
    multilinha: false,
    padrao: 'das {de}h às {ate}h',
  }),

  'dono.aviso.novoAgendamento': meta({
    grupo: 'dono',
    rotulo: 'Aviso — novo agendamento',
    ajuda: 'Texto livre: só chega se o dono tiver falado com o bot nas últimas 24h.',
    variaveis: ['data', 'servico', 'barbeiro', 'cliente'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: ['🗓️ *Novo agendamento*', '', '{data}', '{servico} · {barbeiro}', 'Cliente: {cliente}'].join('\n'),
  }),

  'dono.aviso.cancelamento': meta({
    grupo: 'dono',
    rotulo: 'Aviso — cancelamento',
    variaveis: ['data', 'servico', 'barbeiro', 'cliente'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      '❌ *Agendamento cancelado*',
      '',
      '{data}',
      '{servico} · {barbeiro}',
      'Cliente: {cliente}',
      '',
      'O horário já está livre na agenda.',
    ].join('\n'),
  }),

  'dono.aviso.atendente': meta({
    grupo: 'dono',
    rotulo: 'Aviso — cliente pediu atendimento humano',
    variaveis: ['cliente', 'waId'],
    limite: TEXTO_LIVRE,
    multilinha: true,
    padrao: [
      '🙋 *Cliente pediu atendimento humano*',
      '',
      '{cliente} — wa.me/{waId}',
      '',
      'O bot ficou em silêncio nessa conversa para não atropelar você.',
    ].join('\n'),
  }),

  'dono.semNomeInicio': meta({
    grupo: 'dono',
    rotulo: 'Cliente sem nome (começo de frase)',
    ajuda: 'Usado no aviso de atendimento humano, onde o nome abre a linha.',
    variaveis: [],
    multilinha: false,
    padrao: 'Sem nome',
  }),

  'dono.semNome': meta({
    grupo: 'dono',
    rotulo: 'Cliente sem nome',
    ajuda: 'Usado em {cliente} quando o WhatsApp não informou o nome do perfil.',
    variaveis: [],
    multilinha: false,
    padrao: 'sem nome',
  }),

  // -------------------------------------------------------------------------
  // Barbeiro — painel no WhatsApp
  //
  // O painel do barbeiro é o do dono com menos poder: ele vê a agenda DELE,
  // quantos cortes ELE fez e fecha a agenda DELE. Nada aqui fala da barbearia
  // inteira — nem do faturamento, nem do bot, nem do colega do lado.
  // -------------------------------------------------------------------------

  'barbeiro.menu.titulo': meta({
    grupo: 'barbeiro',
    rotulo: 'Painel do barbeiro — título',
    variaveis: ['nome', 'marca'],
    limite: CORPO,
    multilinha: true,
    padrao: '*{marca}*\nOi, {nome} 💈',
  }),

  'barbeiro.agenda.titulo': meta({
    grupo: 'barbeiro',
    rotulo: 'Minha agenda — título',
    variaveis: ['dia', 'total'],
    limite: CORPO,
    multilinha: false,
    padrao: '*Sua agenda — {dia}* ({total})',
  }),

  'barbeiro.agenda.vazia': meta({
    grupo: 'barbeiro',
    rotulo: 'Minha agenda — dia sem ninguém',
    variaveis: ['dia'],
    limite: CORPO,
    multilinha: false,
    padrao: 'Nenhum horário marcado com você em {dia}.',
  }),

  'barbeiro.agenda.linha': meta({
    grupo: 'barbeiro',
    rotulo: 'Minha agenda — uma linha',
    ajuda: 'Uma por horário. {confirmado} vira um ✅ quando o cliente confirmou.',
    variaveis: ['hora', 'servico', 'confirmado', 'cliente'],
    multilinha: true,
    padrao: '{hora}  {servico}{confirmado}\n      {cliente}',
  }),

  'barbeiro.semana.titulo': meta({
    grupo: 'barbeiro',
    rotulo: 'Minha semana — título',
    variaveis: ['total'],
    limite: CORPO,
    multilinha: false,
    padrao: '*Seus próximos 7 dias* — {total} no total',
  }),

  'barbeiro.semana.vazia': meta({
    grupo: 'barbeiro',
    rotulo: 'Minha semana — sem nada',
    variaveis: [],
    multilinha: false,
    padrao: 'Nenhum horário marcado com você nos próximos 7 dias.',
  }),

  'barbeiro.cortes.corpo': meta({
    grupo: 'barbeiro',
    rotulo: 'Meus números',
    ajuda: 'Conta o que já terminou e não foi cancelado. O de hoje sobe durante o dia.',
    variaveis: ['hoje', 'ontem', 'mes'],
    limite: CORPO,
    multilinha: true,
    padrao: [
      '*Seus cortes*',
      '',
      'Hoje:  {hoje}',
      'Ontem: {ontem}',
      'No mês: {mes}',
    ].join('\n'),
  }),

  'barbeiro.folga.corpo': meta({
    grupo: 'barbeiro',
    rotulo: 'Tirar folga — pergunta',
    ajuda: 'Fecha a agenda só do barbeiro. A barbearia continua atendendo com os outros.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: 'Quando você não vai atender?\n\nFecha só a sua agenda — a barbearia continua aberta.',
  }),

  'barbeiro.folga.confirmada': meta({
    grupo: 'barbeiro',
    rotulo: 'Folga registrada',
    variaveis: ['dia', 'periodo', 'aviso'],
    limite: CORPO,
    multilinha: true,
    padrao: '✅ Folga registrada: {dia}, {periodo}.\n\nNinguém mais consegue marcar com você nesse horário.{aviso}',
  }),

  'barbeiro.folga.aviso': meta({
    grupo: 'barbeiro',
    rotulo: 'Folga — aviso de quem já estava marcado',
    ajuda: 'Encaixado em {aviso}. Some quando não havia ninguém marcado.',
    variaveis: ['total'],
    multilinha: true,
    padrao: '\n\n⚠️ Atenção: {total} cliente(s) já tinham horário marcado com você aí. Avise cada um.',
  }),

  'barbeiro.folga.periodoDia': meta({
    grupo: 'barbeiro',
    rotulo: 'Folga — o dia inteiro',
    variaveis: [],
    multilinha: false,
    padrao: 'o dia inteiro',
  }),

  'barbeiro.folga.periodoFaixa': meta({
    grupo: 'barbeiro',
    rotulo: 'Folga — faixa de horas',
    variaveis: ['de', 'ate'],
    multilinha: false,
    padrao: 'das {de}h às {ate}h',
  }),

  // -------------------------------------------------------------------------
  // Rótulos de botões e linhas de lista
  //
  // Os limites aqui são duros: a Meta corta o que passar, e um rótulo cortado
  // no meio é a primeira coisa que o cliente vê.
  // -------------------------------------------------------------------------

  'rotulos.lista.verOpcoes': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre o menu principal',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver opções',
  }),

  'rotulos.lista.verServicos': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre a lista de serviços',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver serviços',
  }),

  'rotulos.lista.escolher': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre a lista de barbeiros',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Escolher',
  }),

  'rotulos.lista.escolherDia': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre a lista de dias',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Escolher o dia',
  }),

  'rotulos.lista.verHorarios': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre a lista de horários',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver horários',
  }),

  'rotulos.lista.verAgendamentos': meta({
    grupo: 'rotulos',
    rotulo: 'Botão que abre a lista de agendamentos',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Ver agendamentos',
  }),

  'rotulos.secao.atendimento': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — atendimento',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Atendimento',
  }),

  'rotulos.secao.servicos': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — serviços',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Serviços',
  }),

  'rotulos.secao.barbeiros': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — barbeiros',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Barbeiros',
  }),

  'rotulos.secao.dias': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — dias disponíveis',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Dias disponíveis',
  }),

  'rotulos.secao.outrasOpcoes': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — outras opções',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Outras opções',
  }),

  'rotulos.secao.agendamentos': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — agendamentos',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Agendamentos',
  }),

  'rotulos.secao.administracao': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — administração (dono)',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Administração',
  }),

  'rotulos.secao.bloqueios': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — bloqueios rápidos (dono)',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Bloqueios rápidos',
  }),

  'rotulos.secao.minhaAgenda': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — painel do barbeiro',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Seu dia a dia',
  }),
  'rotulos.secao.folgas': meta({
    grupo: 'rotulos',
    rotulo: 'Seção — folgas do barbeiro',
    variaveis: [],
    limite: SECAO,
    multilinha: false,
    padrao: 'Sua folga',
  }),
  'rotulos.barbeiro.hoje': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — agenda de hoje',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Minha agenda hoje',
  }),
  'rotulos.barbeiro.amanha': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — agenda de amanhã',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Minha agenda amanhã',
  }),
  'rotulos.barbeiro.semana': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — minha semana',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Minha semana',
  }),
  'rotulos.barbeiro.cortes': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — meus números',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Meus cortes',
  }),
  'rotulos.barbeiro.cortesDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — meus números (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Hoje, ontem e no mês',
  }),
  'rotulos.barbeiro.folga': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — tirar folga',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Tirar folga',
  }),
  'rotulos.barbeiro.folgaDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — tirar folga (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Fecha só a sua agenda',
  }),
  'rotulos.barbeiro.menu': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — voltar ao painel',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Voltar ao painel',
  }),
  'rotulos.barbeiro.voltar': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — botão voltar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Voltar',
  }),
  'rotulos.barbeiro.voltarLista': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — voltar (linha de lista)',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Voltar',
  }),
  'rotulos.barbeiro.folgaHojeTarde': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga hoje à tarde',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje à tarde',
  }),
  'rotulos.barbeiro.folgaHojeTardeDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga hoje à tarde (descrição)',
    variaveis: ['hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'A partir das {hora}h de hoje',
  }),
  'rotulos.barbeiro.folgaHojeNoite': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga hoje à noite',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje à noite',
  }),
  'rotulos.barbeiro.folgaHojeNoiteDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga hoje à noite (descrição)',
    variaveis: ['hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'A partir das {hora}h de hoje',
  }),
  'rotulos.barbeiro.folgaHojeDia': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga o dia de hoje',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje o dia todo',
  }),
  'rotulos.barbeiro.folgaAmanhaManha': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga amanhã de manhã',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã de manhã',
  }),
  'rotulos.barbeiro.folgaAmanhaManhaDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga amanhã de manhã (descrição)',
    variaveis: ['data', 'hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Dia {data}, até as {hora}h',
  }),
  'rotulos.barbeiro.folgaAmanhaDia': meta({
    grupo: 'rotulos',
    rotulo: 'Barbeiro — folga amanhã o dia todo',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã o dia todo',
  }),

  'rotulos.menu.agendar': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — agendar horário',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Agendar horário',
  }),

  'rotulos.menu.agendarDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — agendar horário (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Escolha serviço, dia e hora',
  }),

  'rotulos.menu.meus': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — meus agendamentos',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Meus agendamentos',
  }),

  'rotulos.menu.meusDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — meus agendamentos (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Ver, remarcar ou cancelar',
  }),

  'rotulos.menu.servicos': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — serviços e preços',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Serviços e preços',
  }),

  'rotulos.menu.servicosDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — serviços e preços (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'O que fazemos e quanto custa',
  }),

  'rotulos.menu.horarios': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — horário de funcionamento',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Horário de funcionamento',
  }),

  'rotulos.menu.endereco': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — onde ficamos',
    ajuda: 'Só aparece quando a barbearia tem endereço no config.',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Onde ficamos',
  }),

  'rotulos.menu.enderecoDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — onde ficamos (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Endereço e rota',
  }),

  'rotulos.menu.pagamento': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — formas de pagamento',
    ajuda: 'Só aparece quando "whatsapp.paymentMethods" está preenchido.',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Formas de pagamento',
  }),

  'rotulos.menu.atendente': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — falar com atendente',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Falar com atendente',
  }),

  'rotulos.menu.atendenteDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Menu — falar com atendente (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Chamar alguém da equipe',
  }),

  'rotulos.botao.agendar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — agendar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Agendar',
  }),

  'rotulos.botao.voltarMenu': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — voltar ao menu',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Voltar ao menu',
  }),

  'rotulos.linha.voltarMenu': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — voltar ao menu',
    ajuda: 'A última linha de toda lista do cliente.',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: '← Voltar ao menu',
  }),

  'rotulos.botao.confirmar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — confirmar',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Confirmar',
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
    rotulo: 'Botão — falar com atendente',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Falar com atendente',
  }),

  'rotulos.botao.meus': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — meus agendamentos',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Meus agendamentos',
  }),

  'rotulos.botao.agendarHorario': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — agendar horário',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Agendar horário',
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

  'rotulos.botao.marcarOutro': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — marcar outro',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Marcar outro',
  }),

  'rotulos.botao.avaliar': meta({
    grupo: 'rotulos',
    rotulo: 'Botão — avaliar',
    ajuda: 'Abre o link de "whatsapp.reviewUrl" no pós-atendimento.',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Avaliar',
  }),

  'rotulos.linha.semPreferencia': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — sem preferência de barbeiro',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Sem preferência',
  }),

  'rotulos.linha.semPreferenciaDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — sem preferência (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Quem estiver livre primeiro',
  }),

  'rotulos.linha.maisDias': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — ver mais dias',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Ver mais dias →',
  }),

  'rotulos.linha.maisHorarios': meta({
    grupo: 'rotulos',
    rotulo: 'Linha — ver mais horários',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Ver mais horários →',
  }),

  'rotulos.barbeiroQualquer': meta({
    grupo: 'rotulos',
    rotulo: 'Nome do barbeiro quando não há preferência',
    ajuda: 'Aparece na tela de conferência, antes de o sistema escolher quem atende.',
    variaveis: [],
    multilinha: false,
    padrao: 'quem estiver livre',
  }),

  'rotulos.dono.hoje': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — agenda de hoje',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Agenda de hoje',
  }),

  'rotulos.dono.amanha': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — agenda de amanhã',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Agenda de amanhã',
  }),

  'rotulos.dono.semana': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — próximos 7 dias',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Próximos 7 dias',
  }),

  'rotulos.dono.bloquear': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — bloquear horário',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Bloquear horário',
  }),

  'rotulos.dono.bloquearDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — bloquear horário (descrição)',
    variaveis: [],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'Folga, imprevisto, feriado',
  }),

  'rotulos.dono.pausar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — pausar o bot',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Pausar o bot 1h',
  }),

  'rotulos.dono.religar': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — religar o bot',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Religar o bot',
  }),

  'rotulos.dono.retomarAgora': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — retomar agora',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Retomar agora',
  }),

  'rotulos.dono.menu': meta({
    grupo: 'rotulos',
    rotulo: 'Dono — menu',
    variaveis: [],
    limite: BOTAO,
    multilinha: false,
    padrao: 'Menu',
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
    rotulo: 'Dono — voltar (linha de lista)',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: '← Voltar',
  }),

  'rotulos.dono.bloqHojeTarde': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — hoje à tarde',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje à tarde',
  }),

  'rotulos.dono.bloqHojeTardeDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — hoje à tarde (descrição)',
    ajuda: 'A hora vem de "whatsapp.owner.afternoonStartHour".',
    variaveis: ['hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'A partir das {hora}h',
  }),

  'rotulos.dono.bloqHojeNoite': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — hoje à noite',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje à noite',
  }),

  'rotulos.dono.bloqHojeNoiteDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — hoje à noite (descrição)',
    ajuda: 'A hora vem de "whatsapp.owner.eveningStartHour".',
    variaveis: ['hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: 'A partir das {hora}h',
  }),

  'rotulos.dono.bloqHojeDia': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — hoje o dia todo',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Hoje o dia todo',
  }),

  'rotulos.dono.bloqAmanhaManha': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — amanhã de manhã',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã de manhã',
  }),

  'rotulos.dono.bloqAmanhaManhaDesc': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — amanhã de manhã (descrição)',
    variaveis: ['data', 'hora'],
    limite: DESCRICAO,
    multilinha: false,
    padrao: '{data} até as {hora}h',
  }),

  'rotulos.dono.bloqAmanhaDia': meta({
    grupo: 'rotulos',
    rotulo: 'Bloqueio — amanhã o dia todo',
    variaveis: [],
    limite: LINHA,
    multilinha: false,
    padrao: 'Amanhã o dia todo',
  }),

  // -------------------------------------------------------------------------
  // Templates da Meta
  //
  // ⚠️  Editar aqui NÃO muda o que a Meta envia. Estes textos são a referência
  //     do que está cadastrado no WhatsApp Manager: servem para o estúdio gerar
  //     o JSON de submissão e para a documentação. O envio real usa o template
  //     aprovado, e só passa a valer o texto novo depois da reaprovação.
  // -------------------------------------------------------------------------

  'template.lembrete24h.corpo': meta({
    grupo: 'templates',
    rotulo: 'lembrete_24h — corpo',
    ajuda: 'Variáveis na ordem que o servidor envia: {{1}} nome, {{2}} marca, {{3}} serviço, {{4}} data e hora.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Oi, {{1}}! Passando para lembrar do seu horário na {{2}} 💈',
      '',
      '{{3}}',
      '📅 {{4}}',
      '',
      'Vai conseguir vir?',
    ].join('\n'),
  }),

  'template.lembrete2h.corpo': meta({
    grupo: 'templates',
    rotulo: 'lembrete_2h — corpo',
    ajuda: '{{1}} nome, {{2}} marca, {{3}} hora.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: ['{{1}}, seu horário na {{2}} é hoje às {{3}} ⏰', '', 'Te esperamos!'].join('\n'),
  }),

  'template.posAtendimento.corpo': meta({
    grupo: 'templates',
    rotulo: 'pos_atendimento — corpo',
    ajuda: '{{1}} nome, {{2}} marca. Tem um botão de URL com o link de avaliação.',
    variaveis: [],
    limite: CORPO,
    multilinha: true,
    padrao: [
      'Opa, {{1}}! Tudo certo com o corte? 💈',
      '',
      'Se curtiu, uma avaliação ajuda demais a {{2}} a aparecer para mais gente.',
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
      '{{1}}, faz {{3}} dias que a gente não te vê aqui na {{2}} 💈',
      '',
      'Bora marcar um horário? É só responder esta mensagem.',
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
      'A {{2}} deseja um ótimo dia. Passa aqui para comemorar com um corte novo!',
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
