import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../env.js'

/**
 * Criptografia dos tokens da Meta guardados no banco (AES-256-GCM).
 *
 * Um banco vazado não pode virar uma conta de WhatsApp sequestrada: o token só
 * é legível com a APP_ENCRYPTION_KEY, que mora no .env e nunca no banco.
 *
 * Formato: [ IV (12 bytes) | tag de autenticação (16 bytes) | texto cifrado ]
 * A tag é o que denuncia adulteração — decifrar um byte trocado lança erro.
 */

const IV_BYTES = 12
const TAG_BYTES = 16

export function encryptSecret(plaintext: string): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', env.encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

export function decryptSecret(packed: Buffer): string {
  if (packed.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('token criptografado está truncado ou corrompido')
  }
  const iv = packed.subarray(0, IV_BYTES)
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES)

  const decipher = createDecipheriv('aes-256-gcm', env.encryptionKey, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Erro de autenticação quase sempre é APP_ENCRYPTION_KEY trocada.
    throw new Error(
      'não foi possível decifrar o token da barbearia — a APP_ENCRYPTION_KEY mudou? ' +
        'Recadastre com: npm run tenant:add',
    )
  }
}
