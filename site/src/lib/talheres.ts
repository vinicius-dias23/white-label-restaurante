/**
 * Garfo e faca cruzados — a marca padrão do site.
 *
 * É o mesmo desenho dos talheres do Table Zap (o produto que entrega este
 * site), sem o balão do WhatsApp e sem nome nenhum: aqui a marca é a do
 * restaurante. Os dois caminhos são desenhados em torno da origem, com 18 de
 * comprimento, e cada uso gira ±40° e posiciona onde precisar.
 *
 * Mora num arquivo próprio, em texto puro, porque três lugares desenham os
 * talheres: o ícone da logo (React), o favicon e o placeholder de imagem
 * quebrada (ambos SVG em string, montados antes de qualquer componente).
 */

export const FORK_PATH =
  'M-2.3 -9h1.1v4h0.6v-4h1.2v4h0.6v-4h1.1v5.2c0 1.3-0.8 2.2-1.9 2.4V8.2a0.8 0.8 0 0 1-1.6 0V-1.4c-1.1-0.2-1.9-1.1-1.9-2.4Z'

export const KNIFE_PATH =
  'M0.9 -9c-1.9 1.2-2.7 4-2.7 7.3 0 1.2 0.4 1.9 0.9 2.2V8.2a0.8 0.8 0 0 0 1.6 0V0.5l0.2-0.1Z'

/**
 * Os talheres cruzados como um `<g>` de SVG em string, centrados em (cx, cy).
 * `scale` 1 dá 18 unidades de comprimento em cada talher.
 */
export function talheresSvg(cx: number, cy: number, scale: number, fill: string, opacity = 1): string {
  return (
    `<g fill="${fill}" fill-opacity="${opacity}">` +
    `<path transform="translate(${cx} ${cy}) rotate(-40) scale(${scale})" d="${FORK_PATH}"/>` +
    `<path transform="translate(${cx} ${cy}) rotate(40) scale(${scale})" d="${KNIFE_PATH}"/>` +
    `</g>`
  )
}
