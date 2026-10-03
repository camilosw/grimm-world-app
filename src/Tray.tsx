import { useRef, useState } from 'react'
import { cardImage, cardLabel, isLandscape, landscapeClass } from './cards'
import { CardGhost } from './CardGhost'
import type { CardDef, CardRef, Stack } from './types'
import { useDragOut, type DragOut } from './useDragOut'
import { useFlip } from './useFlip'

const WIDTH_KEY = 'grimm-world:tray-width'
const DEFAULT_WIDTH = 220
const MIN_WIDTH = 120
/** The table keeps at least this much room beside the sidebar. */
const MIN_TABLE = 200
const DOUBLE_TAP_MS = 300

function savedTrayWidth(): number {
  try {
    return Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

interface Props {
  piles: Stack[]
  defs: Record<string, CardDef>
  /** Only a narrow bar with the number of cards; a tap opens it again. */
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
  selectedId: string | null
  /** Cards dragged over it go here (before this pile, else last), or null: not over it. */
  hover: { before: string | null } | null
  onTap: (stackId: string) => void
  onDoubleTap: (stackId: string) => void
  onInspect: (card: CardRef) => void
  /** A set-aside pile is being dragged, by its id (null: the drag ended). */
  onDragHover: (drag: DragOut<string> | null) => void
  /** A set-aside pile was dragged and released at this screen point. */
  onDrop: (stackId: string, clientX: number, clientY: number) => void
}

/**
 * The right sidebar: cards set aside (the setup cards, say) to keep at hand while moving about the table. It appears
 * when a card is dragged to the right edge of the table and goes away when its last card leaves. Its width follows its
 * left edge, dragged, and the cards fill it.
 */
export function Tray({ piles, defs, collapsed, onCollapse, selectedId, hover, onTap, onDoubleTap, onInspect, onDragHover, onDrop }: Props) {
  const [width, setWidth] = useState(savedTrayWidth)
  const panelRef = useRef<HTMLElement>(null)
  const resizing = useRef(false)
  const lastTap = useRef<{ id: string; time: number } | null>(null)
  const top = (stackId: string) => piles.find((s) => s.id === stackId)?.cards.at(-1)
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
    onHover: onDragHover,
    onDrop,
  })
  const dragged = drag && top(drag.item)
  const draggedPile = drag && piles.find((s) => s.id === drag.item)
  const count = piles.reduce((n, s) => n + s.cards.length, 0)

  /** Dragging the left edge: the sidebar's width follows the finger, leaving the table room. */
  const resize = {
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      resizing.current = true
    },
    onPointerMove: (e: React.PointerEvent) => {
      const panel = panelRef.current
      const table = panel?.parentElement?.querySelector('.table-area')
      if (!resizing.current || !panel || !table) return
      const right = panel.getBoundingClientRect().right
      const room = right - table.getBoundingClientRect().left - MIN_TABLE
      setWidth(Math.round(Math.max(MIN_WIDTH, Math.min(room, right - e.clientX))))
    },
    onPointerUp: () => {
      resizing.current = false
      try {
        localStorage.setItem(WIDTH_KEY, String(width))
      } catch {
        // Only a convenience.
      }
    },
  }

  if (collapsed)
    return (
      <aside className={`tray collapsed${hover ? ' drop-hint' : ''}`} data-tray aria-label="Cards set aside">
        <button className="tray-open" onClick={() => onCollapse(false)} aria-label={`Show the ${count} cards set aside`}>
          <span aria-hidden>‹</span>
          <span className="tray-count">{count}</span>
          <span className="tray-title">Set aside</span>
        </button>
      </aside>
    )

  // Large enough images for the width the cards are shown at.
  const size = width * (window.devicePixelRatio || 1) > 330 ? 'lg' : 'sm'
  return (
    <aside
      ref={panelRef}
      className={`tray${hover ? ' drop-hint' : ''}`}
      data-tray
      aria-label="Cards set aside"
      style={{ '--tray-width': `${width}px` } as React.CSSProperties}
    >
      <div className="tray-resize" {...resize} onPointerCancel={resize.onPointerUp} role="separator" aria-orientation="vertical" aria-label="Resize" />
      <header className="tray-bar">
        <h2>
          Set aside <span className="muted">{count}</span>
        </h2>
        {piles.length > 0 && (
          <button className="icon" onClick={() => onCollapse(true)} aria-label="Minimize">
            ›
          </button>
        )}
      </header>
      <div className="tray-list">
        {piles.map((s) => (
          <TrayPile
            key={s.id}
            stack={s}
            defs={defs}
            size={size}
            selected={selectedId === s.id}
            dragging={drag?.item === s.id}
            insertBefore={hover?.before === s.id}
            bind={bind(s.id)}
          />
        ))}
        <div className={`tray-drop${hover && !hover.before ? ' on' : ''}`}>{piles.length ? 'Drop here to add at the end' : 'Drop cards here to keep them at hand'}</div>
      </div>
      {dragged && drag && (
        <CardGhost
          src={cardImage(dragged.id, dragged.faceUp, 'sm')}
          x={drag.x}
          y={drag.y}
          count={draggedPile?.cards.length}
          frame={landscapeClass(isLandscape(defs[dragged.id]), dragged.faceUp)}
        />
      )}
    </aside>
  )
}

interface PileProps {
  stack: Stack
  defs: Record<string, CardDef>
  size: 'sm' | 'lg'
  selected: boolean
  dragging: boolean
  /** Cards dragged here would go before it. */
  insertBefore: boolean
  /** Pointer handlers from `useDragOut`. */
  bind: React.HTMLAttributes<HTMLDivElement>
}

/** One set-aside pile, its top card as wide as the sidebar. */
function TrayPile({ stack, defs, size, selected, dragging, insertBefore, bind }: PileProps) {
  const top = stack.cards[stack.cards.length - 1]
  const landscape = isLandscape(defs[top.id])
  const cardRef = useRef<HTMLDivElement>(null)
  const faceUp = useFlip(cardRef, top, landscape ? 'x' : 'y')
  const classes = ['tray-pile', selected && 'selected', dragging && 'dragging', insertBefore && 'insert-before'].filter(Boolean)
  return (
    <div className={classes.join(' ')} data-tray-pile={stack.id} {...bind}>
      <div ref={cardRef} className={`tray-card${landscapeClass(landscape, faceUp)}`}>
        <img src={cardImage(top.id, faceUp, size)} alt={cardLabel(defs[top.id])} draggable={false} />
        {stack.cards.length > 1 && <span className="deck-count">{stack.cards.length}</span>}
      </div>
      {stack.label && <div className="tray-name">{stack.label}</div>}
    </div>
  )
}
