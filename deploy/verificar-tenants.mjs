#!/usr/bin/env node
/**
 * Confere o `deploy/tenants.json` antes de qualquer deploy.
 *
 * O manifesto é o que o CI lê para decidir o que buildar e para onde mandar. Um
 * slug com erro de digitação aqui não quebra nada na hora: o build sai, o deploy
 * sai, e o cliente é que descobre que o site dele nunca subiu. Por isso a
 * verificação roda no CI, antes.
 *
 *   node deploy/verificar-tenants.mjs      (ou: npm run deploy:check)
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFESTO = resolve(REPO_ROOT, 'deploy/tenants.json')
const TENANTS_DIR = resolve(REPO_ROOT, 'whatsapp/tenants')

/** Mesma forma que o `slugify` de whatsapp/src/tenants/slug.ts produz. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const erros = []
const avisos = []

function erro(mensagem) {
  erros.push(mensagem)
}

let tenants
try {
  tenants = JSON.parse(readFileSync(MANIFESTO, 'utf8'))
} catch (causa) {
  console.error(`✖ deploy/tenants.json não é um JSON válido: ${causa.message}`)
  process.exit(1)
}

if (!Array.isArray(tenants)) {
  console.error('✖ deploy/tenants.json precisa ser uma lista de restaurantes')
  process.exit(1)
}

const slugs = []
const dominios = []

for (const [i, t] of tenants.entries()) {
  const onde = t?.slug ? `"${t.slug}"` : `entrada #${i + 1}`

  if (typeof t?.slug !== 'string' || !t.slug) {
    erro(`${onde}: falta o campo "slug"`)
    continue
  }
  if (typeof t.dominio !== 'string' || !t.dominio) erro(`${onde}: falta o campo "dominio"`)
  if (typeof t.ativo !== 'boolean') erro(`${onde}: "ativo" precisa ser true ou false`)

  if (!SLUG_RE.test(t.slug)) {
    erro(`${onde}: slug inválido — só minúsculas, números e hífen (nunca no começo ou no fim)`)
  }

  slugs.push(t.slug)
  if (t.dominio) dominios.push(t.dominio.toLowerCase())

  // Um restaurante desligado pode estar sendo montado ainda: a pasta pode não
  // existir, e isso não é erro. O que não pode é um ATIVO sem config, porque é
  // ele que vai para o ar.
  const dir = join(TENANTS_DIR, t.slug)
  const config = join(dir, 'restaurante.config.json')

  if (!existsSync(config)) {
    const mensagem = `${onde}: falta whatsapp/tenants/${t.slug}/restaurante.config.json`
    if (t.ativo) erro(mensagem)
    else avisos.push(`${mensagem} (inativo, então não impede o deploy)`)
  } else if (t.ativo) {
    try {
      JSON.parse(readFileSync(config, 'utf8'))
    } catch (causa) {
      erro(`${onde}: restaurante.config.json não é um JSON válido — ${causa.message}`)
    }
  }

  if (t.ativo && !existsSync(join(dir, 'public'))) {
    // Sem public/, o build usa o site/public/ de demonstração e as fotos do
    // config viram retângulos escuros. Aviso, não erro: dá para subir sem foto.
    avisos.push(`${onde}: sem whatsapp/tenants/${t.slug}/public/ — as fotos do config vão faltar`)
  }
}

for (const lista of [
  { nome: 'slug', valores: slugs },
  { nome: 'domínio', valores: dominios },
]) {
  const repetidos = [...new Set(lista.valores.filter((v, i) => lista.valores.indexOf(v) !== i))]
  if (repetidos.length) erro(`${lista.nome} repetido no manifesto: ${repetidos.join(', ')}`)
}

for (const aviso of avisos) console.warn(`⚠ ${aviso}`)
for (const e of erros) console.error(`✖ ${e}`)

if (erros.length) process.exit(1)

const ativos = tenants.filter((t) => t.ativo).length
console.log(`✔ ${tenants.length} restaurante(s) no manifesto, ${ativos} ativo(s) — tudo no lugar`)
