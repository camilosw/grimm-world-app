import { useEffect, useMemo, useState } from 'react'
import { extractCard, extractCards, locateCard, moveCardInStack, type TerrainSlot } from './actions'
import { cardImage, cardLabel, compareCards, matchesQuery } from './cards'
import { update } from './store'
import type { CardDef, CardRef, Table } from './types'

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Full-size view of one card, with its other side one tap away. */
export function CardViewer({ card, def, onClose }: { card: CardRef; def?: CardDef; onClose: () => void }) {
  const [faceUp, setFaceUp] = useState(card.faceUp)
  const [rot, setRot] = useState(0)
  return (
    <div className="viewer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <img
        src={cardImage(card.id, faceUp, 'lg')}
        alt={cardLabel(def)}
        style={{ transform: `rotate(${rot}deg)` }}
        className={rot % 180 ? 'sideways' : ''}
        onClick={() => setFaceUp((f) => !f)}
        draggable={false}
      />
      <div className="viewer-bar">
        <span className="viewer-title">{cardLabel(def)}</span>
        <button onClick={() => setFaceUp((f) => !f)}>⟲ Other side</button>
        <button onClick={() => setRot((r) => (r + 90) % 360)}>↻ Rotate</button>
        <button onClick={onClose}>✕ Close</button>
      </div>
    </div>
  )
}

interface BrowseProps {
  table: Table
  stackId: string
  defs: Record<string, CardDef>
  /** World position for cards taken out of the pile. */
  dropAt: () => { x: number; y: number }
  onInspect: (card: CardRef) => void
  onClose: () => void
}

/** Look through a pile, pull cards out, or move them to the top/bottom. */
export function BrowseDialog({ table, stackId, defs, dropAt, onInspect, onClose }: BrowseProps) {
  const stack = table.stacks[stackId]
  const [query, setQuery] = useState('')
  const [showFronts, setShowFronts] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<string | null>(null)

  // The pile disappears when its last card is taken out.
  useEffect(() => {
    if (!stack) onClose()
  }, [stack, onClose])
  if (!stack) return null
  // Shown top → bottom; keep the real index for actions.
  const entries = stack.cards
    .map((card, index) => ({ card, index, def: defs[card.id] }))
    .reverse()
    .filter((e) => !e.def || matchesQuery(e.def, query))
  const indexOf = (cardId: string) => stack.cards.findIndex((c) => c.id === cardId)

  const act = (cardId: string, fn: (t: Table, index: number) => Table) => {
    update((t) => fn(t, indexOf(cardId)))
    setActive(null)
  }
  const togglePick = (cardId: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })

  return (
    <Modal title={`${stack.label ?? 'Pile'} — ${stack.cards.length} cards (top first)`} onClose={onClose} wide>
      <div className="dialog-tools">
        <input type="search" placeholder="Filter: Y003, B12, Terrain…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={showFronts} onChange={(e) => setShowFronts(e.target.checked)} /> Show fronts
        </label>
        {picked.size > 0 && (
          <>
            <button
              className="primary"
              onClick={() => {
                const { x, y } = dropAt()
                update((t) => extractCards(t, stackId, [...picked].map(indexOf), x, y))
                setPicked(new Set())
              }}
            >
              Make new pile ({picked.size})
            </button>
            <button onClick={() => setPicked(new Set())}>Clear</button>
          </>
        )}
      </div>
      <div className="card-grid">
        {entries.map(({ card, index, def }) => (
          <div key={card.id} className={`grid-card${picked.has(card.id) ? ' picked' : ''}`}>
            <button className="thumb" onClick={() => setActive(active === card.id ? null : card.id)}>
              <img src={cardImage(card.id, showFronts || card.faceUp, 'sm')} alt={cardLabel(def)} loading="lazy" draggable={false} />
            </button>
            <div className="grid-caption">
              <span>{cardLabel(def)}</span>
              <span className="muted">{stack.cards.length - index}</span>
            </div>
            {active === card.id && (
              <div className="card-menu">
                <button
                  onClick={() => {
                    const { x, y } = dropAt()
                    act(card.id, (t, i) => extractCard(t, stackId, i, x, y))
                  }}
                >
                  Take out
                </button>
                <button onClick={() => act(card.id, (t, i) => moveCardInStack(t, stackId, i, 'top'))}>To top</button>
                <button onClick={() => act(card.id, (t, i) => moveCardInStack(t, stackId, i, 'bottom'))}>To bottom</button>
                <button onClick={() => onInspect({ ...card, faceUp: true })}>View</button>
                <button
                  onClick={() => {
                    togglePick(card.id)
                    setActive(null)
                  }}
                >
                  {picked.has(card.id) ? 'Unselect' : 'Select'}
                </button>
              </div>
            )}
          </div>
        ))}
        {!entries.length && <p className="muted">No matching cards.</p>}
      </div>
    </Modal>
  )
}

interface FindProps {
  table: Table
  defs: Record<string, CardDef>
  dropAt: () => { x: number; y: number }
  onShow: (stackId: string) => void
  onInspect: (card: CardRef) => void
  onClose: () => void
}

/** Search every card on the table, e.g. "Take card Y003 and resolve it". */
export function FindDialog({ table, defs, dropAt, onShow, onInspect, onClose }: FindProps) {
  const [query, setQuery] = useState('')
  const all = useMemo(() => Object.values(defs).sort(compareCards), [defs])
  const results = query.trim() ? all.filter((d) => matchesQuery(d, query)).slice(0, 60) : []

  return (
    <Modal title="Find a card" onClose={onClose} wide>
      <div className="dialog-tools">
        <input
          type="search"
          autoFocus
          placeholder="Card number or name, e.g. Y003, B12, Chapter 3"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="card-grid">
        {results.map((def) => {
          const where = locateCard(table, def.id)
          if (!where) {
            if (!table.hand?.some((c) => c.id === def.id)) return null
            return (
              <div key={def.id} className="grid-card">
                <button className="thumb" onClick={() => onInspect({ id: def.id, faceUp: true })}>
                  <img src={cardImage(def.id, true, 'sm')} alt={cardLabel(def)} loading="lazy" draggable={false} />
                </button>
                <div className="grid-caption">
                  <span>{cardLabel(def)}</span>
                  <span className="muted">in hand</span>
                </div>
              </div>
            )
          }
          const { stack, index } = where
          // Storybook cards stay in the storybook.
          const inPile = stack.cards.length > 1 && !stack.slot
          return (
            <div key={def.id} className="grid-card">
              <button className="thumb" onClick={() => onInspect({ id: def.id, faceUp: true })}>
                <img src={cardImage(def.id, true, 'sm')} alt={cardLabel(def)} loading="lazy" draggable={false} />
              </button>
              <div className="grid-caption">
                <span>{cardLabel(def)}</span>
                <span className="muted">{stack.slot ? 'in the Storybook' : inPile ? `in ${stack.label ?? 'pile'}` : 'on table'}</span>
              </div>
              <div className="card-actions">
                {inPile && (
                  <button
                    className="primary"
                    onClick={() => {
                      const { x, y } = dropAt()
                      update((t) => extractCard(t, stack.id, index, x, y))
                      onClose()
                    }}
                  >
                    Take
                  </button>
                )}
                <button
                  onClick={() => {
                    onShow(stack.id)
                    onClose()
                  }}
                >
                  Show
                </button>
              </div>
            </div>
          )
        })}
        {query.trim() && !results.length && <p className="muted">No matching cards.</p>}
        {!query.trim() && <p className="muted">Type a card number. Taken cards are placed face up in the middle of the screen.</p>}
      </div>
    </Modal>
  )
}

/** Small text prompt that works in fullscreen / home-screen web apps. */
export function RenameDialog({ initial, onSave, onClose }: { initial: string; onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial)
  return (
    <Modal title="Pile name" onClose={onClose}>
      <form
        className="dialog-tools"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(value)
          onClose()
        }}
      >
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Encounter Deck" />
        <button className="primary" type="submit">
          Save
        </button>
      </form>
    </Modal>
  )
}

/** Parse "01 07v 15v / 19 30 31" (rows split by "/" or new lines, "-" = empty cell). */
function parseBattlefield(text: string): (TerrainSlot | null)[][] {
  return text
    .split(/[\n/;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.split(/[\s,]+/).map((tok) => {
        const m = /^(\d{1,2})\s*([vVdD↓])?$/.exec(tok)
        return m ? { code: `T${m[1].padStart(2, '0')}`, down: !!m[2] } : null
      }),
    )
}

interface BattlefieldProps {
  table: Table
  defs: Record<string, CardDef>
  onBuild: (rows: (TerrainSlot | null)[][]) => void
  onClear: () => void
  onClose: () => void
}

/** Lay out Terrain Cards as shown in the middle section of a Conflict Card. */
export function BattlefieldDialog({ table, defs, onBuild, onClear, onClose }: BattlefieldProps) {
  const [text, setText] = useState('')
  const rows = parseBattlefield(text)
  const byCode = useMemo(() => new Map(Object.values(defs).map((d) => [d.code, d])), [defs])
  const unknown = rows.flat().filter((s) => s && !byCode.has(s.code))
  const count = rows.flat().filter(Boolean).length
  const cols = Math.max(1, ...rows.map((r) => r.length))
  const looseTerrain = Object.values(table.stacks).filter(
    (s) => s.cards.length === 1 && defs[s.cards[0].id]?.type === 'terrain',
  ).length

  return (
    <Modal title="Battlefield" onClose={onClose} wide>
      <div className="dialog-tools">
        <textarea
          className="battle-input"
          autoFocus
          rows={3}
          placeholder={'Terrain numbers row by row, "v" = pointing down, "-" = empty\ne.g.  01 07v 15v\n       19 30 31'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="battle-buttons">
          <button className="primary" disabled={!count || unknown.length > 0} onClick={() => onBuild(rows)}>
            ⚔ Lay out {count || ''} card{count === 1 ? '' : 's'}
          </button>
          <button disabled={!looseTerrain} onClick={onClear}>
            ↩ Clear battlefield{looseTerrain ? ` (${looseTerrain})` : ''}
          </button>
        </div>
      </div>
      {unknown.length > 0 && (
        <p className="dialog-note warn">Unknown terrain: {unknown.map((s) => s!.code.slice(1)).join(', ')}</p>
      )}
      <div className="battle-preview" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 110px))` }}>
        {rows.flatMap((row, r) =>
          Array.from({ length: cols }, (_, c) => {
            const slot = row[c]
            const def = slot && byCode.get(slot.code)
            return (
              <div key={`${r}-${c}`} className="battle-cell">
                {def && (
                  <img
                    src={cardImage(def.id, true, 'sm')}
                    alt={def.name}
                    style={{ transform: slot!.down ? 'rotate(180deg)' : undefined }}
                    draggable={false}
                  />
                )}
                {slot && <span className="battle-label">{slot.code.slice(1) + (slot.down ? '↓' : '')}</span>}
              </div>
            )
          }),
        )}
      </div>
      {!count && (
        <p className="dialog-note muted">
          The cards are taken from the Terrain deck and laid out edge to edge in the Battlefield area.
          Clear battlefield puts them all back into the Terrain pile.
        </p>
      )}
    </Modal>
  )
}

/** Which chapter of the storybook cards are put into (the white book symbol on the card). */
export function ChapterDialog({ onPick, onClose }: { onPick: (chapter: number) => void; onClose: () => void }) {
  return (
    <Modal title="Put under which chapter?" onClose={onClose}>
      <div className="chapter-grid">
        {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => onPick(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="dialog-note muted">
        The cards go directly under that Chapter Card, so they come up right after it. If that chapter has already been
        revealed, they go on top of the storybook.
      </p>
    </Modal>
  )
}
