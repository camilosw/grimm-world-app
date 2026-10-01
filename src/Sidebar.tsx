import { useRef } from 'react'
import { cardImage, cardLabel, isLandscape, landscapeClass } from './cards'
import { CardGhost } from './CardGhost'
import { DECK_SPECS } from './decks'
import type { CardDef, CardRef, Stack } from './types'
import { useDragOut } from './useDragOut'

interface Props {
  decks: Stack[]
  defs: Record<string, CardDef>
  selectedId: string | null
  /** Decks a card dragged over the sidebar would go back to. */
  hoverIds: string[]
  onTap: (deckId: string) => void
  onDoubleTap: (deckId: string) => void
  onInspect: (card: CardRef) => void
  /** The top card of a deck was dragged and released at this screen point. */
  onDrop: (deckId: string, clientX: number, clientY: number) => void
}

const DOUBLE_TAP_MS = 300

/** The decks, kept out of the way on the left side of the screen. */
export function Sidebar({ decks, defs, selectedId, hoverIds, onTap, onDoubleTap, onInspect, onDrop }: Props) {
  const lastTap = useRef<{ id: string; time: number } | null>(null)
  const top = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    return deck?.cards[deck.cards.length - 1]
  }
  const { drag, bind } = useDragOut<string>({
    onTap: (id) => {
      const now = Date.now()
      if (lastTap.current?.id === id && now - lastTap.current.time < DOUBLE_TAP_MS) {
        lastTap.current = null
        return onDoubleTap(id)
      }
      lastTap.current = { id, time: now }
      onTap(id)
    },
    onLongPress: (id) => {
      const card = top(id)
      if (card) onInspect(card)
    },
    onDrop,
  })
  const dragged = drag && top(drag.item)

  return (
    <aside className={`sidebar${hoverIds.length ? ' drop-hint' : ''}`} data-dock>
      {decks.map((deck) => {
        const card = deck.cards[deck.cards.length - 1]
        const classes = ['deck', selectedId === deck.id && 'selected', hoverIds.includes(deck.id) && 'drop-target'].filter(Boolean)
        // The Regions deck lies landscape, like its cards.
        const landscape = card ? isLandscape(defs[card.id]) : deck.deck === 'regions'
        return (
          <div key={deck.id} className={classes.join(' ')} data-deck={deck.id} {...bind(deck.id)}>
            <div className={`deck-card${landscapeClass(landscape, card?.faceUp ?? false)}`} style={{ '--depth': Math.min(6, Math.ceil(Math.log2(deck.cards.length + 1))) } as React.CSSProperties}>
              {card ? (
                <img
                  src={cardImage(card.id, card.faceUp, 'sm')}
                  alt={cardLabel(defs[card.id])}
                  draggable={false}
                  className={drag?.item === deck.id && deck.cards.length === 1 ? 'dragging' : ''}
                />
              ) : (
                <span className="deck-empty">{(deck.deck && DECK_SPECS[deck.deck].emptyHint) ?? 'empty'}</span>
              )}
              {deck.cards.length > 0 && <span className="deck-count">{deck.cards.length}</span>}
            </div>
            <div className="deck-name">{deck.label ?? 'Deck'}</div>
          </div>
        )
      })}
      <p className="sidebar-hint">Drop a card anywhere here to put it back into its deck</p>
      {dragged && drag && (
        <CardGhost src={cardImage(dragged.id, dragged.faceUp, 'sm')} x={drag.x} y={drag.y} frame={landscapeClass(isLandscape(defs[dragged.id]), dragged.faceUp)} />
      )}
    </aside>
  )
}
