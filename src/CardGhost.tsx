import { createPortal } from 'react-dom'

/**
 * Card image following the finger while dragging out of the sidebar or the browse panel; `count` when several go
 * along, `frame` the classes of a landscape card (`landscapeClass()`). Drawn over the whole page, whatever panel it is
 * dragged from or over.
 */
export function CardGhost({ src, x, y, count = 1, frame = '' }: { src: string; x: number; y: number; count?: number; frame?: string }) {
  return createPortal(
    <div className={`card-ghost${frame}`} style={{ left: x, top: y }}>
      <img src={src} alt="" draggable={false} />
      {count > 1 && <span className="deck-count">{count}</span>}
    </div>,
    document.body,
  )
}
