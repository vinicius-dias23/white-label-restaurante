/**
 * Base comum dos dois módulos.
 *
 * Aqui mora só o que o site e a automação do WhatsApp precisam ler do mesmo
 * jeito: o schema do `restaurante.config.json` (com validação e padrões) e os
 * utilitários que derivam informação dele — cores, horários e links.
 *
 * Nada daqui conhece React, Fastify ou banco de dados: se um símbolo só serve
 * a um dos módulos, ele pertence ao módulo, não a esta pasta.
 */
export * from './config/index.js'
export * from './lib/color.js'
export * from './lib/hours.js'
export * from './lib/texto.js'
export * from './lib/whatsapp.js'
