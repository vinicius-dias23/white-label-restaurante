import rawConfig from '../../../barbearia.config.json'
import { normalizeConfig } from '@barbearia/shared/config'

/**
 * Configuração do site, já validada e com os padrões preenchidos.
 *
 * O caminho acima é o config de demonstração da raiz, que é o que você vê no
 * `npm run dev`. Em produção ele não chega a ser lido: com `TENANT=<slug>`, o
 * `site/vite.config.ts` intercepta este import e aponta para o
 * `whatsapp/tenants/<slug>/barbearia.config.json` — o mesmo arquivo que alimenta
 * o atendimento no WhatsApp, para que preço e horário nunca divirjam.
 */
export const config = normalizeConfig(rawConfig as unknown)

export * from '@barbearia/shared/config'
