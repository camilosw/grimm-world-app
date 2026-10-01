/** Card image following the finger while dragging out of the sidebar or the browse panel; `count` when several go along. */
export function CardGhost({ src, x, y, count = 1 }: { src: string; x: number; y: number; count?: number }) {
  return (
    <div className="card-ghost" style={{ left: x, top: y }}>
      <img src={src} alt="" draggable={false} />
      {count > 1 && <span className="deck-count">{count}</span>}
    </div>
  )
}
