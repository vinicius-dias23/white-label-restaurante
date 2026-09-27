import { useMemo, useState } from 'react'
import { config, hasMenu } from '../config'
import type { MenuItem } from '@restaurante/shared/config'
import { FoodPattern } from './FoodPattern'
import { ArrowRightIcon, BookOpenIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { SmartImage } from './SmartImage'

const ALL = 'Todos'

/** Categorias na ordem em que aparecem no config — é a ordem de um cardápio. */
function categoriesOf(items: MenuItem[]): string[] {
  const seen: string[] = []
  for (const item of items) {
    if (item.category && !seen.includes(item.category)) seen.push(item.category)
  }
  return seen
}

function DishCard({ item, index }: { item: MenuItem; index: number }) {
  return (
    <Reveal delay={Math.min(index, 5) * 70} className="h-full">
      <article
        className={`card group flex h-full flex-col ${
          item.highlight ? 'border-accent/60 shadow-[0_0_40px_-18px_var(--bb-brand-glow)]' : ''
        }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <SmartImage
            src={item.imageUrl}
            alt={item.name}
            width={520}
            ratio={4 / 3}
            seed={item.name}
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />

          {item.highlight && (
            <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 font-label text-[0.625rem] font-medium uppercase tracking-[0.18em] text-on-brand">
              Destaque
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-5">
          {item.category && (
            <p className="font-label text-[0.625rem] uppercase tracking-[0.22em] text-muted">{item.category}</p>
          )}

          <div className="flex items-start justify-between gap-4">
            <h3 className="min-w-0 text-2xl leading-tight">{item.name}</h3>
            {item.price && (
              // Preço é texto livre ("a partir de R$ 29"): o `text-right` segura
              // os preços compridos quando quebram em duas linhas.
              <span className="max-w-[45%] shrink-0 text-right font-display text-2xl leading-none text-accent">
                {item.price}
              </span>
            )}
          </div>

          {item.description && <p className="text-sm leading-relaxed text-muted">{item.description}</p>}
        </div>
      </article>
    </Reveal>
  )
}

/**
 * Cardápio: os pratos em destaque, com foto e preço, e o link para o cardápio
 * completo. O site não tenta ser o cardápio inteiro — o dono já tem um PDF ou
 * um link, e manter dois cardápios em dia é pedir para eles divergirem.
 *
 * Com mais de uma categoria, uma fileira de filtros no topo. No celular ela
 * rola de lado, sem quebrar em várias linhas.
 */
export function Menu() {
  const { menu } = config
  const categories = useMemo(() => categoriesOf(menu.items), [menu.items])
  const [active, setActive] = useState(ALL)

  if (!hasMenu()) return null

  const visible = active === ALL ? menu.items : menu.items.filter((item) => item.category === active)

  return (
    <Section
      id="cardapio"
      kicker="Da nossa cozinha"
      title="Cardápio"
      className="relative overflow-hidden"
      background={<FoodPattern />}
    >
      {categories.length > 1 && (
        <div
          role="tablist"
          aria-label="Filtrar por categoria"
          className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {[ALL, ...categories].map((category) => {
            const selected = category === active
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(category)}
                className={`h-10 shrink-0 rounded-full border px-4 font-label text-xs uppercase tracking-[0.14em] transition-colors ${
                  selected
                    ? 'border-transparent bg-brand text-on-brand'
                    : 'border-line-strong text-muted hover:border-accent hover:text-ink'
                }`}
              >
                {category}
              </button>
            )
          })}
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item, index) => (
            // A chave inclui o filtro para a animação de entrada rodar de novo
            // a cada troca de categoria.
            <DishCard key={`${active}-${item.slug || item.name}-${index}`} item={item} index={index} />
          ))}
        </div>
      )}

      {menu.url && (
        <Reveal className="mt-8 flex justify-center">
          <a href={menu.url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost w-full sm:w-auto">
            <BookOpenIcon className="size-5" />
            Ver cardápio completo
            <ArrowRightIcon className="size-4" />
          </a>
        </Reveal>
      )}
    </Section>
  )
}
