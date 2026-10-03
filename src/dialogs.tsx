import { useEffect, useMemo, useRef, useState } from 'react'
import { extractCard, locateCard, playCards, type TerrainSlot } from './actions'
import { cardImage, cardLabel, compareCards, isLandscape, landscapeClass, matchesQuery, queryTerms } from './cards'
import { CardGhost } from './CardGhost'
import { update } from './store'
import type { CardDef, CardRef, Table } from './types'
import { useDragOut } from './useDragOut'
import { useFlip } from './useFlip'

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

/** A card's picture in a list; a Region Card lies landscape. */
function Thumb({ id, faceUp, def }: { id: string; faceUp: boolean; def?: CardDef }) {
  const img = <img src={cardImage(id, faceUp, 'sm')} alt={cardLabel(def)} loading="lazy" draggable={false} />
  return isLandscape(def) ? <div className={landscapeClass(true, faceUp).trim()}>{img}</div> : img
}

/** Full-size view of one card, with its other side one tap away. */
export function CardViewer({ card, def, onClose, onRules }: { card: CardRef; def?: CardDef; onClose: () => void; onRules?: () => void }) {
  const [faceUp, setFaceUp] = useState(card.faceUp)
  const [rot, setRot] = useState(0)
  // A Region Card lies landscape, doesn't rotate, and turns over about its horizontal axis.
  const landscape = isLandscape(def)
  const imgRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const shownFace = useFlip(landscape ? frameRef : imgRef, { id: card.id, faceUp }, landscape ? 'x' : 'y')
  const flip = () => setFaceUp((f) => !f)
  return (
    <div className="viewer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      {landscape ? (
        <div ref={frameRef} className={`viewer-card${landscapeClass(true, shownFace)}`} onClick={flip}>
          <img src={cardImage(card.id, shownFace, 'lg')} alt={cardLabel(def)} draggable={false} />
        </div>
      ) : (
        <img
          ref={imgRef}
          src={cardImage(card.id, shownFace, 'lg')}
          alt={cardLabel(def)}
          style={{ rotate: `${rot}deg` }}
          className={rot % 180 ? 'sideways' : ''}
          onClick={flip}
          draggable={false}
        />
      )}
      <div className="viewer-bar">
        <span className="viewer-title">{cardLabel(def)}</span>
        <button onClick={flip}>⟲ Other side</button>
        {!landscape && <button onClick={() => setRot((r) => (r + 90) % 360)}>↻ Rotate</button>}
        {onRules && <button onClick={onRules}>📖 Rules</button>}
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
  dropAt: (cardIds: string[]) => { x: number; y: number } | null
  onInspect: (card: CardRef) => void
  /** Cards were dragged out of the panel and released at this screen point. */
  onDrop: (cardIds: string[], clientX: number, clientY: number) => void
  /** "Put under…" the selected cards: the player then taps the pile or deck to put them under. */
  onPutUnder: (cardIds: string[]) => void
  onClose: () => void
}

/**
 * Look through a pile and pull cards out. Sits in the bottom half of the
 * screen so the table stays in use: tap cards to select them, then take them
 * out, or drag a card's ⠿ grip (with the other selected cards) onto the table.
 */
export function BrowsePanel({ table, stackId, defs, dropAt, onInspect, onDrop, onPutUnder, onClose }: BrowseProps) {
  const stack = table.stacks[stackId]
  const [query, setQuery] = useState('')
  const [fronts, setFronts] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // Selected cards that are still in the pile, in pile order.
  const chosen = stack?.cards.filter((c) => picked.has(c.id)).map((c) => c.id) ?? []
  /** A dragged card takes the other selected cards along. */
  const draggedWith = (cardId: string) => (picked.has(cardId) ? chosen : [cardId])
  const togglePick = (cardId: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  const view = (cardId: string) => onInspect({ id: cardId, faceUp: fronts })
  // Swipes on a card scroll the list; only the grip drags.
  const thumb = useDragOut<string>({ onTap: togglePick, onLongPress: view })
  const grip = useDragOut<string>({ onTap: togglePick, onDrop: (cardId, x, y) => onDrop(draggedWith(cardId), x, y) })

  // The pile disappears when its last card is taken out.
  useEffect(() => {
    if (!stack) onClose()
  }, [stack, onClose])
  if (!stack) return null
  // Shown top → bottom.
  const entries = stack.cards
    .map((card, index) => ({ card, index, def: defs[card.id] }))
    .reverse()
    .filter((e) => !e.def || matchesQuery(e.def, query))
  const dragged = new Set(grip.drag ? draggedWith(grip.drag.item) : [])

  return (
    <section className="browse" aria-label={`Browse ${stack.label ?? 'pile'}`}>
      <header className="browse-bar">
        <h2>
          {stack.label ?? 'Pile'} — {stack.cards.length} cards <span className="muted">(top first)</span>
        </h2>
        <input type="search" placeholder="Filter: Y003, B12, Terrain…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented" role="group" aria-label="Card side">
          <button className={fronts ? 'on' : ''} aria-pressed={fronts} onClick={() => setFronts(true)}>
            Fronts
          </button>
          <button className={fronts ? '' : 'on'} aria-pressed={!fronts} onClick={() => setFronts(false)}>
            Backs
          </button>
        </div>
        {chosen.length > 0 && (
          <>
            <button
              className="primary"
              onClick={() => {
                const at = dropAt(chosen)
                if (!at) return
                const indices = chosen.map((id) => stack.cards.findIndex((c) => c.id === id))
                update((t) => playCards(t, stackId, indices, at.x, at.y, null, defs))
              }}
            >
              Take out ({chosen.length})
            </button>
            <button onClick={() => onPutUnder(chosen)}>⤵ Put under…</button>
            <button onClick={() => setPicked(new Set())}>Clear</button>
          </>
        )}
        <button className="icon" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="card-grid">
        {entries.map(({ card, index, def }) => (
          <div
            key={card.id}
            className={`grid-card${picked.has(card.id) ? ' picked' : ''}${dragged.has(card.id) ? ' dragging' : ''}`}
          >
            <div className="grid-caption">
              <span className="grid-label">{cardLabel(def)}</span>
              <span className="muted">{stack.cards.length - index}</span>
            </div>
            <div className="thumb" role="button" aria-pressed={picked.has(card.id)} {...thumb.bind(card.id)}>
              <Thumb id={card.id} faceUp={fronts} def={def} />
              {picked.has(card.id) && <span className="pick-badge">✓</span>}
            </div>
            <div className="card-tools">
              <span className="card-grip" aria-label={`Drag ${cardLabel(def)} onto the table`} {...grip.bind(card.id)}>
                ⠿
              </span>
              <button className="card-view" onClick={() => view(card.id)} aria-label={`View ${cardLabel(def)}`}>
                🔍
              </button>
            </div>
          </div>
        ))}
        {!entries.length && <p className="muted">No matching cards.</p>}
      </div>
      {grip.drag && (
        <CardGhost
          src={cardImage(grip.drag.item, fronts, 'sm')}
          x={grip.drag.x}
          y={grip.drag.y}
          count={dragged.size}
          frame={landscapeClass(isLandscape(defs[grip.drag.item]), fronts)}
        />
      )}
    </section>
  )
}

interface FindProps {
  table: Table
  defs: Record<string, CardDef>
  dropAt: (cardIds: string[]) => { x: number; y: number } | null
  onShow: (stackId: string) => void
  onInspect: (card: CardRef) => void
  onClose: () => void
}

/** Search every card on the table, e.g. "Take card Y003 and resolve it". */
export function FindDialog({ table, defs, dropAt, onShow, onInspect, onClose }: FindProps) {
  const [query, setQuery] = useState('')
  const all = useMemo(() => Object.values(defs).sort(compareCards), [defs])
  const searching = queryTerms(query).length > 0
  const results = searching ? all.filter((d) => matchesQuery(d, query)).slice(0, 60) : []

  return (
    <Modal title="Find a card" onClose={onClose} wide>
      <div className="dialog-tools">
        <input
          type="search"
          autoFocus
          placeholder="Card numbers or names, e.g. Y003, B12, Chapter 3"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="card-grid">
        {results.map((def) => {
          const where = locateCard(table, def.id)
          if (!where) return null
          const { stack, index } = where
          // Storybook cards stay in the storybook; a deck is a pile even with one card left.
          const inPile = (stack.cards.length > 1 || !!stack.deck) && !stack.slot
          return (
            <div key={def.id} className="grid-card">
              <button className="thumb" onClick={() => onInspect({ id: def.id, faceUp: true })}>
                <Thumb id={def.id} faceUp def={def} />
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
                      const at = dropAt([def.id])
                      if (!at) return
                      update((t) => extractCard(t, stack.id, index, at.x, at.y))
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
        {searching && !results.length && <p className="muted">No matching cards.</p>}
        {!searching && <p className="muted">Type a card number. Taken cards are placed face up in the middle of the screen.</p>}
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
  onRules: () => void
  onClose: () => void
}

/** Lay out Terrain Cards as shown in the middle section of a Conflict Card. */
export function BattlefieldDialog({ table, defs, onBuild, onClear, onRules, onClose }: BattlefieldProps) {
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
          <button onClick={onRules}>📖 How to set up a battlefield</button>
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

/** The Storybook cards that cards can be put under: its chapters and the Epilogue, in card order. */
const UNDER_STORY = /^(Chapter \d+|Epilogue)$/

/**
 * Which Storybook card the cards are put under. Their backs are shown at the top, where the white book symbol says
 * which chapter they belong to; chapters already turned over can't be picked.
 */
export function ChapterDialog({
  cards,
  defs,
  progress,
  onPick,
  onClose,
}: {
  cards: string[]
  defs: Record<string, CardDef>
  progress: { revealed: Set<string>; current: string | null }
  onPick: (name: string) => void
  onClose: () => void
}) {
  const names = Object.values(defs)
    .filter((d) => d.type === 'storybook' && d.name && UNDER_STORY.test(d.name))
    .map((d) => d.name!)
  return (
    <Modal title="Put under which chapter?" onClose={onClose}>
      <div className="chapter-cards">
        {cards.map((id) => (
          <Thumb key={id} id={id} faceUp={false} def={defs[id]} />
        ))}
      </div>
      <div className="chapter-grid">
        {names.map((name) => {
          const current = name === progress.current
          const past = progress.revealed.has(name) && !current
          return (
            <button
              key={name}
              className={`${current ? 'current' : ''}${name === 'Epilogue' ? ' wide' : ''}`}
              disabled={past}
              onClick={() => onPick(name)}
            >
              {name.replace(/^Chapter /, '')}
              {current && <small>now</small>}
            </button>
          )
        })}
      </div>
      <p className="dialog-note muted">
        {cards.length > 1 ? `All ${cards.length} cards go` : 'The card goes'} face down directly under that Storybook
        Card, to come up right after it; under the current chapter, on top of the storybook, to come up next.
      </p>
    </Modal>
  )
}
