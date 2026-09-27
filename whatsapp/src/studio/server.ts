import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import {
  GRUPO_LABELS,
  isTextoKey,
  normalizeConfig,
  setConfigWarnHandler,
  TEXTOS,
  TEXTO_KEYS,
  type TextoKey,
} from '@barbearia/shared/config'
import { env } from '../env.js'
import { isMain } from '../lib/entrypoint.js'
import { log } from '../lib/logger.js'
import { TENANTS_DIR } from '../lib/paths.js'
import { listTenantSlugs, readTenantFile, syncTenant } from '../tenants/sync.js'
import { findTenantBySlug } from '../db/repositories/tenants.js'
import { usoFuturo } from '../db/repositories/appointments.js'
import { DIAS, lerConteudo, paraGravar, type ConteudoRecebido } from './conteudo.js'
import { editarCaminho } from './json-edit.js'
import { closePool } from '../db/pool.js'
import { previewConteudo, previewDe, PREVIEW_KEYS, SECOES_COM_PREVIEW } from './preview.js'

/**
 * Estúdio dos textos: a UI local para editar o que o bot fala.
 *
 * Roda **só na sua máquina** e nunca vai para produção — não está no
 * `index.ts`, nem no Dockerfile, nem no render.yaml. Por isso não tem login: quem
 * alcança 127.0.0.1 já é você. Se um dia isso for exposto, precisa de auth de
 * verdade antes.
 *
 * O arquivo `tenants/<slug>/barbearia.config.json` continua sendo a fonte da
 * verdade — o estúdio grava nele, sincroniza para o Postgres e invalida o cache
 * do bot. O commit é seu, pelo botão Publicar.
 */

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public')
const REPO_ROOT = resolve(TENANTS_DIR, '..', '..')
const CONFIGS_GLOB = 'whatsapp/tenants/*/barbearia.config.json'

const run = promisify(execFile)

/** git, sempre a partir da raiz do repositório e sem shell no meio. */
async function git(...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: REPO_ROOT, maxBuffer: 4 * 1024 * 1024 })
  return stdout
}

interface TextoResposta {
  key: TextoKey
  grupo: string
  rotulo: string
  ajuda: string
  variaveis: readonly string[]
  limite: number | null
  multilinha: boolean
  padrao: string
  valor: string
  customizado: boolean
  temPreview: boolean
}

async function lerTextos(slug: string): Promise<{ nome: string; textos: TextoResposta[]; avisos: string[] }> {
  const file = await readTenantFile(slug)
  const salvos = file.config.whatsapp.textos

  return {
    nome: file.config.brand.name,
    avisos: file.warnings,
    textos: TEXTO_KEYS.map((key) => {
      const meta = TEXTOS[key]
      const valor = salvos[key]
      return {
        key,
        grupo: meta.grupo,
        rotulo: meta.rotulo,
        ajuda: meta.ajuda ?? '',
        variaveis: meta.variaveis,
        limite: meta.limite ?? null,
        multilinha: meta.multilinha,
        padrao: meta.padrao,
        valor: valor ?? meta.padrao,
        customizado: valor !== undefined,
        temPreview: PREVIEW_KEYS.has(key),
      }
    }),
  }
}

/**
 * Grava os textos preservando todo o resto do arquivo.
 *
 * O config é escrito à mão e revisado em pull request, então a troca é
 * cirúrgica: só o bloco `whatsapp.textos` muda, e o resto do arquivo — ordem,
 * recuo, linhas em branco — fica igual. Se a troca cirúrgica não bater com o
 * que deveria ter sido gravado, o arquivo é regravado inteiro: diff feio é
 * melhor que arquivo corrompido.
 */
async function gravarTextos(slug: string, textos: Record<string, string>): Promise<string[]> {
  const path = join(TENANTS_DIR, slug, 'barbearia.config.json')
  const original = await readFile(path, 'utf8')
  const raw = JSON.parse(original) as Record<string, unknown>

  const limpos: Record<string, string> = {}
  for (const [key, valor] of Object.entries(textos)) {
    if (!isTextoKey(key)) continue
    const texto = valor.trim()
    // Igual ao padrão não vira customização: o config fica só com o que mudou.
    if (texto === '' || texto === TEXTOS[key].padrao) continue
    limpos[key] = texto
  }

  const temTextos = Object.keys(limpos).length > 0
  const whatsapp = { ...((raw.whatsapp ?? {}) as Record<string, unknown>) }
  if (temTextos) whatsapp.textos = limpos
  else delete whatsapp.textos
  raw.whatsapp = whatsapp

  const cirurgico = editarCaminho(original, ['whatsapp', 'textos'], temTextos ? limpos : null)
  const conferido = cirurgico !== null && iguala(cirurgico, raw)
  const saida = conferido ? cirurgico! : `${JSON.stringify(raw, null, 2)}\n`

  if (!conferido) {
    log.warn('config regravado inteiro: a edição cirúrgica não bateu', { slug })
  }

  await writeFile(path, saida, 'utf8')

  // Confere o que acabou de ser gravado com o mesmo validador do servidor.
  const avisos: string[] = []
  setConfigWarnHandler((message) => avisos.push(message))
  normalizeConfig(JSON.parse(saida))
  setConfigWarnHandler(null)
  return avisos
}

/**
 * Grava as seções de conteúdo que vieram, uma por vez e no texto do arquivo.
 *
 * Mesma regra da gravação dos textos: troca cirúrgica, conferida contra o
 * objeto esperado, com regravação inteira como plano B.
 */
async function gravarConteudo(slug: string, recebido: ConteudoRecebido): Promise<string[]> {
  const path = join(TENANTS_DIR, slug, 'barbearia.config.json')
  const original = await readFile(path, 'utf8')
  const atual = await readTenantFile(slug)

  const esperado = JSON.parse(original) as Record<string, unknown>
  const mudancas = paraGravar(recebido, atual.config, esperado)
  if (mudancas.length === 0) return []

  let texto = original
  let cirurgicoOk = true

  for (const { caminho, valor } of mudancas) {
    const [primeiro, segundo] = caminho

    // Seção que não mudou não é reescrita: a UI manda o rascunho inteiro, e
    // regravar o que está igual só embaralharia a formatação do arquivo.
    const anterior = segundo
      ? ((esperado[primeiro!] ?? {}) as Record<string, unknown>)[segundo]
      : esperado[primeiro!]
    if (JSON.stringify(anterior) === JSON.stringify(valor)) continue

    if (segundo) {
      const pai = (esperado[primeiro!] ?? {}) as Record<string, unknown>
      esperado[primeiro!] = { ...pai, [segundo]: valor }
    } else {
      esperado[primeiro!] = valor
    }

    const proximo = editarCaminho(texto, caminho, valor)
    if (proximo === null) {
      cirurgicoOk = false
      break
    }
    texto = proximo
  }

  const saida = cirurgicoOk && iguala(texto, esperado) ? texto : `${JSON.stringify(esperado, null, 2)}\n`
  if (saida !== texto) log.warn('config regravado inteiro: a edição cirúrgica não bateu', { slug })

  await writeFile(path, saida, 'utf8')

  const avisos: string[] = []
  setConfigWarnHandler((message) => avisos.push(message))
  normalizeConfig(JSON.parse(saida))
  setConfigWarnHandler(null)
  return avisos
}

/** O texto editado descreve exatamente o objeto que se queria gravar? */
function iguala(texto: string, esperado: unknown): boolean {
  try {
    return JSON.stringify(JSON.parse(texto)) === JSON.stringify(esperado)
  } catch {
    return false
  }
}

export function buildStudio() {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 })

  app.get('/', async (_request, reply) => {
    const html = await readFile(join(PUBLIC_DIR, 'index.html'), 'utf8')
    return reply.type('text/html; charset=utf-8').send(html)
  })

  app.get('/api/tenants', async () => {
    const slugs = await listTenantSlugs()
    const tenants = []
    for (const slug of slugs) {
      try {
        const file = await readTenantFile(slug)
        tenants.push({ slug, nome: file.config.brand.name })
      } catch (error) {
        log.warn('config da barbearia não pôde ser lido', { slug, reason: String(error) })
        tenants.push({ slug, nome: slug })
      }
    }
    return { tenants, grupos: GRUPO_LABELS }
  })

  app.get('/api/textos/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    try {
      return await lerTextos(slug)
    } catch (error) {
      return reply.code(404).send({ erro: `não consegui ler a barbearia "${slug}": ${String(error)}` })
    }
  })

  /**
   * Grava e aplica. O sync leva para o Postgres e invalida o cache do bot, então
   * a próxima mensagem do cliente já sai com o texto novo — sem reiniciar nada.
   */
  app.put('/api/textos/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as { textos?: Record<string, string> }
    if (!body?.textos || typeof body.textos !== 'object') {
      return reply.code(400).send({ erro: 'mande { "textos": { "chave": "valor" } }' })
    }

    let avisos: string[]
    try {
      avisos = await gravarTextos(slug, body.textos)
    } catch (error) {
      return reply.code(400).send({ erro: `não consegui gravar: ${String(error)}` })
    }

    // Sem banco o estúdio continua útil: edita o arquivo e avisa que não aplicou.
    try {
      const resultado = await syncTenant(slug)
      return {
        ok: true,
        avisos,
        aplicado: resultado.tenant !== null,
        detalhe: resultado.skipped ?? 'texto novo já valendo no bot',
      }
    } catch (error) {
      return {
        ok: true,
        avisos,
        aplicado: false,
        detalhe: `arquivo gravado, mas não sincronizei com o banco: ${String(error)}`,
      }
    }
  })

  /** Como a mensagem fica no WhatsApp, montada pelos payloads de verdade. */
  app.post('/api/preview/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as { key?: string; textos?: Record<string, string> }
    if (!body?.key || !isTextoKey(body.key)) {
      return reply.code(400).send({ erro: 'chave desconhecida' })
    }
    try {
      const file = await readTenantFile(slug)
      return previewDe(body.key, file.config, body.textos ?? {})
    } catch (error) {
      return reply.code(400).send({ erro: String(error) })
    }
  })

  // -------------------------------------------------------------------------
  // Conteúdo: o que está atrás de cada opção do menu
  // -------------------------------------------------------------------------

  app.get('/api/conteudo/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    try {
      const file = await readTenantFile(slug)
      return { conteudo: lerConteudo(file.config), dias: DIAS, avisos: file.warnings }
    } catch (error) {
      return reply.code(404).send({ erro: `não consegui ler a barbearia "${slug}": ${String(error)}` })
    }
  })

  /**
   * Quantos agendamentos futuros usam cada serviço e cada barbeiro.
   *
   * A UI pergunta isto antes de deixar remover: o item sai do menu, mas quem já
   * marcou continua marcado, e o dono é quem vai ter que avisar essas pessoas.
   */
  app.get('/api/conteudo/:slug/uso', async (request) => {
    const { slug } = request.params as { slug: string }
    try {
      const tenant = await findTenantBySlug(slug)
      if (!tenant) return { services: {}, barbers: {}, semBanco: false }
      return { ...(await usoFuturo(tenant.id)), semBanco: false }
    } catch {
      // Sem banco a UI ainda edita; só não consegue avisar sobre a agenda.
      return { services: {}, barbers: {}, semBanco: true }
    }
  })

  app.put('/api/conteudo/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as ConteudoRecebido

    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ erro: 'corpo inválido' })
    }

    let avisos: string[]
    try {
      avisos = await gravarConteudo(slug, body)
    } catch (error) {
      return reply.code(400).send({ erro: `não consegui gravar: ${String(error)}` })
    }

    try {
      const resultado = await syncTenant(slug)
      const fallbacks = resultado.fallbacks.length
        ? [`duração deduzida do padrão em: ${resultado.fallbacks.join(', ')}`]
        : []
      return {
        ok: true,
        avisos: [...avisos, ...fallbacks],
        aplicado: resultado.tenant !== null,
        detalhe: resultado.skipped ?? 'catálogo atualizado no banco e no bot',
      }
    } catch (error) {
      return {
        ok: true,
        avisos,
        aplicado: false,
        detalhe: `arquivo gravado, mas não sincronizei com o banco: ${String(error)}`,
      }
    }
  })

  /**
   * Preview de uma aba de conteúdo, com a edição que ainda não foi salva.
   *
   * O config da tela é montado sobre o do disco pelo mesmo `paraGravar` que a
   * gravação usa — então o que aparece aqui é o que seria gravado, e não uma
   * segunda interpretação dos campos.
   */
  app.post('/api/preview-conteudo/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as { secao?: string; conteudo?: ConteudoRecebido }
    if (!body?.secao || !SECOES_COM_PREVIEW.includes(body.secao)) {
      return reply.code(400).send({ erro: 'seção sem prévia' })
    }

    try {
      const file = await readTenantFile(slug)
      const bruto = JSON.parse(
        await readFile(join(TENANTS_DIR, slug, 'barbearia.config.json'), 'utf8'),
      ) as Record<string, unknown>

      for (const { caminho, valor } of paraGravar(body.conteudo ?? {}, file.config, bruto)) {
        const [primeiro, segundo] = caminho
        if (segundo) {
          const pai = (bruto[primeiro!] ?? {}) as Record<string, unknown>
          bruto[primeiro!] = { ...pai, [segundo]: valor }
        } else {
          bruto[primeiro!] = valor
        }
      }

      // Os avisos do normalize aqui são ruído: a gravação é que os reporta.
      setConfigWarnHandler(() => {})
      const config = normalizeConfig(bruto)
      setConfigWarnHandler(null)

      return previewConteudo(body.secao, config)
    } catch (error) {
      return reply.code(400).send({ erro: String(error) })
    }
  })

  app.get('/api/git/status', async () => {
    const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).trim()
    const status = await git('status', '--porcelain', '--', CONFIGS_GLOB)
    const diff = await git('diff', '--', CONFIGS_GLOB)
    return { branch, alterados: status.trim().split('\n').filter(Boolean), diff }
  })

  /**
   * Publica: add + commit + push na branch atual.
   *
   * Recusa na branch principal de propósito — os textos são revisados em pull
   * request, como o resto do config das barbearias.
   */
  app.post('/api/git/publicar', async (request, reply) => {
    const body = request.body as { mensagem?: string }
    const mensagem = (body?.mensagem ?? '').trim()
    if (!mensagem) return reply.code(400).send({ erro: 'escreva a mensagem do commit' })

    const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).trim()
    if (branch === 'master' || branch === 'main' || branch === 'HEAD') {
      return reply.code(400).send({ erro: `não publico direto na branch "${branch}" — crie uma branch.` })
    }

    const status = (await git('status', '--porcelain', '--', CONFIGS_GLOB)).trim()
    if (!status) return reply.code(400).send({ erro: 'nada mudou nos configs das barbearias.' })

    try {
      await git('add', '--', CONFIGS_GLOB)
      await git('commit', '-m', mensagem)
      await git('push', 'origin', branch)
      const commit = (await git('rev-parse', '--short', 'HEAD')).trim()
      return { ok: true, branch, commit }
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error)
      return reply.code(500).send({ erro: detalhe })
    }
  })

  return app
}

async function main(): Promise<void> {
  const port = Number(process.env.STUDIO_PORT ?? 4321)
  const app = buildStudio()

  // 127.0.0.1, não 0.0.0.0: sem login, isto não pode aparecer na rede local.
  await app.listen({ port, host: '127.0.0.1' })

  log.info('estúdio dos textos no ar', {
    url: `http://localhost:${port}`,
    tenants: TENANTS_DIR,
    ambiente: env.nodeEnv,
  })

  const shutdown = async (): Promise<void> => {
    await app.close()
    await closePool()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('o estúdio não subiu:', error)
    process.exit(1)
  })
}
