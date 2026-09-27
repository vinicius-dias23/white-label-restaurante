/**
 * Edição cirúrgica do `restaurante.config.json`.
 *
 * Os configs dos restaurantes são escritos à mão, com linhas em branco separando
 * as seções, e são revisados em pull request. Regravar o arquivo com
 * `JSON.stringify` funcionaria — e transformaria "mudei uma frase" num diff de
 * cem linhas. Então trocamos só o bloco que interessa, no texto mesmo.
 *
 * Toda troca é conferida: o resultado é reparseado e comparado com o objeto que
 * se queria gravar. Se não bater, quem chama volta para a regravação inteira,
 * que é feia mas nunca corrompe o arquivo.
 */

/** Fim do valor que começa em `inicio` (um `{` ou `[`), respeitando strings. */
function fimDoBloco(texto: string, inicio: number): number {
  const abre = texto[inicio]
  const fecha = abre === '{' ? '}' : ']'
  let profundidade = 0
  let emString = false
  let escapado = false

  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i]!
    if (emString) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '"') emString = true
    else if (c === abre) profundidade += 1
    else if (c === fecha) {
      profundidade -= 1
      if (profundidade === 0) return i
    }
  }
  return -1
}

/** Posição da chave `"nome":` dentro de `[de, ate]`, no primeiro nível. */
function acharChave(texto: string, nome: string, de: number, ate: number): number {
  const alvo = `"${nome}"`
  let profundidade = 0
  let emString = false
  let escapado = false

  for (let i = de; i < ate; i += 1) {
    const c = texto[i]!
    if (emString) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '{' || c === '[') profundidade += 1
    else if (c === '}' || c === ']') profundidade -= 1
    else if (c === '"') {
      if (profundidade === 1 && texto.startsWith(alvo, i)) {
        const depois = texto.slice(i + alvo.length).match(/^\s*:/)
        if (depois) return i
      }
      emString = true
    }
  }
  return -1
}

/** Recuo (espaços) da linha onde `posicao` está. */
function recuoDaLinha(texto: string, posicao: number): string {
  const inicioLinha = texto.lastIndexOf('\n', posicao) + 1
  return texto.slice(inicioLinha, posicao).match(/^\s*/)?.[0] ?? ''
}

function serializar(valor: unknown, recuo: string): string {
  return JSON.stringify(valor, null, 2)
    .split('\n')
    .map((linha, i) => (i === 0 ? linha : recuo + linha))
    .join('\n')
}

/**
 * Grava `valor` na chave `caminho` preservando o resto do texto.
 *
 * O caminho tem uma ou duas partes: `['areas']` mexe num campo de primeiro
 * nível, `['whatsapp', 'textos']` num aninhado. `valor` nulo remove a chave.
 *
 * Devolve `null` quando não dá para fazer a troca com segurança — arquivo
 * minificado, chave num formato inesperado, o pai que ainda não existe — e aí
 * quem chama decide o que fazer.
 */
export function editarCaminho(texto: string, caminho: string[], valor: unknown): string | null {
  const [primeiro, segundo] = caminho
  if (!primeiro) return null
  if (!segundo) return editarNoBloco(texto, 0, texto.length, primeiro, valor)

  const posRaiz = acharChave(texto, primeiro, 0, texto.length)

  // A raiz ainda não existe: só sabemos criá-la quando há algo para gravar.
  if (posRaiz === -1) {
    if (valor === null) return texto
    return null
  }

  const abreRaiz = texto.indexOf('{', posRaiz)
  if (abreRaiz === -1) return null
  const fechaRaiz = fimDoBloco(texto, abreRaiz)
  if (fechaRaiz === -1) return null

  return editarNoBloco(texto, abreRaiz, fechaRaiz, segundo, valor)
}

/** Compatibilidade com a primeira versão, que só sabia mexer em dois níveis. */
export function editarChaveAninhada(
  texto: string,
  raiz: string,
  filho: string,
  valor: unknown,
): string | null {
  return editarCaminho(texto, [raiz, filho], valor)
}

/**
 * Troca `filho` dentro do objeto que vai de `abreRaiz` a `fechaRaiz`.
 *
 * Para o nível de cima, `abreRaiz` é 0 e `fechaRaiz` é o fim do texto: o
 * `acharChave` já busca no primeiro nível de aninhamento, que ali é a raiz.
 */
function editarNoBloco(
  texto: string,
  abreRaiz: number,
  fechaRaiz: number,
  filho: string,
  valor: unknown,
): string | null {
  const raizEhArquivo = abreRaiz === 0
  const abre = raizEhArquivo ? texto.indexOf('{') : abreRaiz
  const fecha = raizEhArquivo ? fimDoBloco(texto, abre) : fechaRaiz
  if (abre === -1 || fecha === -1) return null

  const posFilho = acharChave(texto, filho, abre, fecha)

  if (posFilho !== -1) {
    // O valor pode ser objeto ou lista: pega o que abrir primeiro depois do `:`.
    const doisPontos = texto.indexOf(':', posFilho + filho.length + 2)
    const abreObjeto = texto.indexOf('{', doisPontos)
    const abreLista = texto.indexOf('[', doisPontos)
    const abreFilho =
      abreLista !== -1 && (abreObjeto === -1 || abreLista < abreObjeto) ? abreLista : abreObjeto
    if (abreFilho === -1 || abreFilho > fecha) return null
    const fechaFilho = fimDoBloco(texto, abreFilho)
    if (fechaFilho === -1) return null

    if (valor === null) {
      // Sai a linha inteira da chave, mais UMA das duas vírgulas que a
      // prendiam aos irmãos — a de depois quando ela existe, a de antes quando
      // a chave era a última do bloco.
      const antes = texto.slice(0, texto.lastIndexOf('\n', posFilho))
      const resto = texto.slice(fechaFilho + 1)
      const virgulaDepois = resto.match(/^\s*,/)

      if (virgulaDepois) return antes + resto.slice(virgulaDepois[0].length)
      return antes.replace(/,(\s*)$/, '$1') + resto
    }

    const recuo = recuoDaLinha(texto, posFilho)
    const novo = `"${filho}": ${serializar(valor, recuo)}`
    return texto.slice(0, posFilho) + novo + texto.slice(fechaFilho + 1)
  }

  if (valor === null) return texto

  // Chave nova: entra como último campo do bloco, no recuo dos irmãos.
  const conteudo = texto.slice(abre + 1, fecha)
  const primeiraChave = conteudo.search(/\S/)
  if (primeiraChave === -1) return null
  const recuo = recuoDaLinha(texto, abre + 1 + primeiraChave)

  const antes = texto.slice(0, fecha).replace(/\s*$/, '')
  const novo = `,\n${recuo}"${filho}": ${serializar(valor, recuo)}\n${recuoDaLinha(texto, fecha)}`
  return antes + novo + texto.slice(fecha)
}
