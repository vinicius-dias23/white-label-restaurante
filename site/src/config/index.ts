import rawConfig from '../../../restaurante.config.json'
import { normalizeConfig } from '@restaurante/shared/config'

/**
 * Configuração do site, já validada e com os padrões preenchidos.
 *
 * O caminho acima é o config de demonstração da raiz, que é o que você vê no
 * `npm run dev`. Em produção ele não chega a ser lido: com `TENANT=<slug>`, o
 * `site/vite.config.ts` intercepta este import e aponta para o
 * `whatsapp/tenants/<slug>/restaurante.config.json` — o mesmo arquivo que alimenta
 * o atendimento no WhatsApp, para que cardápio e horário nunca divirjam.
 *
 * O `phone` de cada membro da `team` já chega aqui removido: o mesmo plugin do
 * `vite.config.ts` tira o campo antes de o JSON entrar no bundle, porque é o
 * telefone pessoal do colaborador. O `normalizeConfig` devolve `phone: ''`.
 */
export const config = normalizeConfig(rawConfig as unknown)

/**
 * A seção de cardápio aparece com pratos em destaque OU só com o link do
 * cardápio completo — tem restaurante que prefere não repetir preço no site.
 * Função única porque o menu do topo e o botão do hero seguem a mesma regra.
 */
export function hasMenu(): boolean {
  const { features, menu } = config
  return features.menu && (menu.items.length > 0 || menu.url !== '')
}

export * from '@restaurante/shared/config'
