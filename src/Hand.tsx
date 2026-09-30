import { forwardRef } from 'react'
import { cardImage, cardLabel } from './cards'
import type { CardDef, CardRef } from './types'
import { useDragOut } from './useDragOut'

interface Props {
  cards: CardRef[]
  defs: Record<string, CardDef>
  /** Highlight while a card is dragged over the tray. */
  dropHint: boolean
  onInspect: (card: CardRef) => void
  /** A hand card was dragged and released at this screen point. */
  onDrop: (index: number, clientX: number, clientY: number, slot: number | null) => void
}

/** The player's hand: a strip of cards along the bottom of the screen. */
export const Hand = forwardRef<HTMLDivElement, Props>(function Hand({ cards, defs, dropHint, onInspect, onDrop }, ref) {
  const { drag, bind } = useDragOut<number>({
    onTap: (index) => onInspect(cards[index]),
    onDrop: (index, x, y) => onDrop(index, x, y, slotAt(x, y)),
  })

  /** Position in the hand for a card released at (x, y), or null if outside the tray. */
  function slotAt(x: number, y: number): number | null {
    const tray = (ref as React.RefObject<HTMLDivElement | null>).current
    const r = tray?.getBoundingClientRect()
    if (!tray || !r || y < r.top || y > r.bottom) return null
    const els = [...tray.querySelectorAll<HTMLElement>('.hand-card')]
    const i = els.findIndex((el) => {
      const b = el.getBoundingClientRect()
      return x < b.left + b.width / 2
    })
    return i < 0 ? els.length - 1 : i
  }

  const dragged = drag ? cards[drag.item] : null

  return (
    <div ref={ref} className={`hand${dropHint ? ' drop-hint' : ''}`}>
      <div className="hand-row">
        {cards.map((card, i) => (
          <div key={card.id} className={`hand-card${drag?.item === i ? ' dragging' : ''}`} {...bind(i)}>
            <img src={cardImage(card.id, true, 'sm')} alt={cardLabel(defs[card.id])} draggable={false} />
          </div>
        ))}
        {!cards.length && <p className="hand-empty">Hand — drag cards here</p>}
      </div>
      {dragged && drag && <CardGhost src={cardImage(dragged.id, true, 'sm')} x={drag.x} y={drag.y} />}
    </div>
  )
})

/** Card image following the finger while dragging out of the hand or sidebar. */
export function CardGhost({ src, x, y }: { src: string; x: number; y: number }) {
  return <img className="card-ghost" src={src} alt="" style={{ left: x, top: y }} draggable={false} />
}
