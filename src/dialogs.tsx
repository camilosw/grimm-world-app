import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { extractCard, inTray, isPinned, locateCard, playCards, shuffled } from './actions'
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
  /** Cards were dragged out of the panel and released at this screen point (face down: picked at random, unseen). */
  onDrop: (cardIds: string[], clientX: number, clientY: number, faceUp: boolean) => void
  /** Cards are being dragged out of the panel, to this screen point (null: the drag ended). */
  onDragHover: (cardIds: string[], at: { x: number; y: number } | null) => void
  /** "Put under…" the selected cards: the player then taps the pile or deck to put them under. */
  onPutUnder: (cardIds: string[], faceUp: boolean) => void
  onClose: () => void
  /** On a phone, where the actions for the selected cards go instead of a row of their own: the column at the screen's right edge. */
  actionsSlot?: HTMLElement | null
}

/** The cards a Browse panel's group grip drags: those picked at random, or the selected ones. */
type Group = 'unseen' | 'chosen'

const HEIGHT_KEY = 'grimm-world:browse-height'
/** The panel keeps its bar and a row of cards. */
const MIN_BROWSE = 200
/** The toolbar and the table keep at least this much room above the panel (`.workspace` in styles.css). */
const MIN_TABLE = 180
// The height dragged last (null: half the screen), kept when the panel opens on another pile.
let browseHeight: number | null = (() => {
  try {
    return Number(localStorage.getItem(HEIGHT_KEY)) || null
  } catch {
    return null
  }
})()

/**
 * Look through a pile and pull cards out. Sits in the bottom half of the
 * screen so the table stays in use: tap cards to select them, then take them
 * out, or drag a card's ⠿ grip (with the other selected cards) onto the table.
 * Selected cards move in the order they were selected, the first one on top.
 * Random picks some of the shown cards unseen, in random order: nothing marks
 * them, they move face down by the bar's own grip, and the panel shows backs.
 * The selected cards have such a grip too, in the same row of actions.
 */
export function BrowsePanel({ table, stackId, defs, dropAt, onInspect, onDrop, onDragHover, onPutUnder, onClose, actionsSlot }: BrowseProps) {
  const stack = table.stacks[stackId]
  const [query, setQuery] = useState('')
  const [fronts, setFronts] = useState(false)
  // Selected cards, in the order they were selected (the first goes on top).
  const [picked, setPicked] = useState<string[]>([])
  // Cards picked at random, unseen, in that order; picking by tap drops them.
  const [blind, setBlind] = useState<string[]>([])
  // How many of the shown cards Random picks (null: all of them, i.e. shuffle them).
  const [count, setCount] = useState<number | null>(null)
  const [height, setHeight] = useState(browseHeight)
  const resizing = useRef(false)
  // Selected cards that are still in the pile, bottom → top, as the actions take them.
  const inPile = new Set(stack?.cards.map((c) => c.id))
  const chosen = picked.filter((id) => inPile.has(id)).reverse()
  const unseen = blind.filter((id) => inPile.has(id)).reverse()
  /** A dragged card takes the other selected cards along. */
  const draggedWith = (cardId: string) => (picked.includes(cardId) ? chosen : [cardId])
  // A card pinned to the pile (the Damage Card, the Training and Banned Cards cards) can't be picked or taken out.
  const pinnedIds = new Set(stack?.cards.filter((_, i) => isPinned(stack, i)).map((c) => c.id))
  const togglePick = (cardId: string) => {
    if (pinnedIds.has(cardId)) return
    setBlind([])
    setPicked((p) => (p.includes(cardId) ? p.filter((id) => id !== cardId) : [...p, cardId]))
  }
  const view = (cardId: string) => onInspect({ id: cardId, faceUp: fronts })
  // Swipes on a card scroll the list; only the grip drags.
  const thumb = useDragOut<string>({ onTap: togglePick, onLongPress: view })
  const grip = useDragOut<string>({
    onTap: togglePick,
    onDrop: (cardId, x, y) => onDrop(draggedWith(cardId), x, y, fronts),
    onHover: (d) => onDragHover(d ? draggedWith(d.item) : [], d),
  })
  // The cards picked at random go by the bar's grip, so the grid doesn't show which they are
  // (face down); the selected ones may go by a grip of their own too. Dragged cards land
  // showing the side the panel shows.
  const group = (kind: Group) => (kind === 'unseen' ? unseen : chosen)
  const groupGrip = useDragOut<Group>({
    onTap: () => {},
    onDrop: (kind, x, y) => onDrop(group(kind), x, y, kind === 'chosen' && fronts),
    onHover: (d) => onDragHover(d ? group(d.item) : [], d),
  })
  /** Take cards out onto the table, as one pile. */
  const takeOut = (cardIds: string[], faceUp: boolean) => {
    const at = dropAt(cardIds)
    if (!at) return
    const indices = cardIds.map((id) => stack.cards.findIndex((c) => c.id === id))
    update((t) => playCards(t, stackId, indices, at.x, at.y, null, defs, faceUp))
  }

  /** Dragging the top edge: the panel's height follows the finger, leaving the table room. */
  const resize = {
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      resizing.current = true
    },
    onPointerMove: (e: React.PointerEvent) => {
      const panel = (e.currentTarget as HTMLElement).parentElement
      const above = panel?.previousElementSibling
      if (!resizing.current || !panel || !above) return
      const bottom = panel.getBoundingClientRect().bottom
      const room = bottom - above.getBoundingClientRect().top - MIN_TABLE
      setHeight(Math.round(Math.max(MIN_BROWSE, Math.min(room, bottom - e.clientY))))
    },
    onPointerUp: () => {
      resizing.current = false
      browseHeight = height
      try {
        if (height) localStorage.setItem(HEIGHT_KEY, String(height))
      } catch {
        // Only a convenience.
      }
    },
  }

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
  // The shown cards Random may pick, and how many it picks.
  const pickable = entries.map((e) => e.card.id).filter((id) => !pinnedIds.has(id))
  const randomCount = Math.min(count ?? pickable.length, pickable.length)
  /** Select every shown card not selected yet, after the ones already selected, top first (so they keep the pile's order). */
  const selectAll = () => {
    setBlind([])
    setPicked((p) => [...p, ...pickable.filter((id) => !p.includes(id))])
  }
  const dragged = new Set(grip.drag ? draggedWith(grip.drag.item) : groupGrip.drag?.item === 'chosen' ? chosen : [])
  // The group dragged by its grip, and the card its ghost shows (the top one).
  const groupDragged = groupGrip.drag ? group(groupGrip.drag.item) : []
  const groupTop = groupDragged[groupDragged.length - 1]
  const groupFaceUp = groupGrip.drag?.item === 'chosen' && fronts

  // The cards picked at random or selected, and what to do with them.
  const actions = (unseen.length > 0 || chosen.length > 0) && (
    <div className="browse-actions">
      {unseen.length > 0 && (
        <>
          <span
            className={`group-grip${groupGrip.drag ? ' dragging' : ''}`}
            aria-label="Drag the cards picked at random"
            {...groupGrip.bind('unseen')}
          >
            ⠿ {unseen.length} random card{unseen.length > 1 ? 's' : ''}
          </span>
          <button onClick={() => takeOut(unseen, false)}>Take out face down</button>
          <button onClick={() => takeOut(unseen, true)}>Take out face up</button>
          <button onClick={() => onPutUnder(unseen, false)}>⤵ Put under…</button>
          <button onClick={() => setBlind([])}>Clear</button>
        </>
      )}
      {chosen.length > 0 && (
        <>
          <span
            className={`group-grip${groupGrip.drag ? ' dragging' : ''}`}
            aria-label="Drag the selected cards"
            {...groupGrip.bind('chosen')}
          >
            ⠿ {chosen.length} card{chosen.length > 1 ? 's' : ''}
          </span>
          <button onClick={() => takeOut(chosen, false)}>Take out face down</button>
          <button onClick={() => takeOut(chosen, true)}>Take out face up</button>
          <button onClick={() => onPutUnder(chosen, true)}>⤵ Put under…</button>
          <button onClick={() => setPicked([])}>Clear</button>
        </>
      )}
    </div>
  )

  return (
    <section
      className="browse"
      aria-label={`Browse ${stack.label ?? 'pile'}`}
      style={height ? ({ '--browse-height': `${height}px` } as React.CSSProperties) : undefined}
    >
      <div className="browse-resize" {...resize} onPointerCancel={resize.onPointerUp} role="separator" aria-orientation="horizontal" aria-label="Resize" />
      <header className="browse-bar">
        <h2>
          {stack.label ?? 'Pile'}
          {/* Left out on a phone, where the bar has to fit on one line. */}
          <span className="browse-detail">
            {' '}
            — {stack.cards.length} cards <span className="muted">(top first)</span>
          </span>
        </h2>
        <input
          type="search"
          placeholder="Filter…"
          title="Filter: Y003, B12, Terrain…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCount(null)
          }}
        />
        <div className="segmented compact" role="group" aria-label="Card side">
          <button className={fronts ? '' : 'on'} aria-pressed={!fronts} onClick={() => setFronts(false)}>
            Backs
          </button>
          <button className={fronts ? 'on' : ''} aria-pressed={fronts} onClick={() => setFronts(true)}>
            Fronts
          </button>
        </div>
        {pickable.length > 0 && (
          <button disabled={pickable.every((id) => picked.includes(id))} onClick={selectAll} aria-label="Select all">
            {/* Just "All" on a phone, where the bar has to fit on one line. */}
            <span className="long-label">Select all</span>
            <span className="short-label">All</span>
          </button>
        )}
        {pickable.length > 1 && (
          <div className="random-pick" role="group" aria-label="Pick at random">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={pickable.length}
              value={randomCount}
              aria-label="How many cards"
              onChange={(e) => setCount(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              onFocus={(e) => e.target.select()}
            />
            <button
              aria-label="Random"
              onClick={() => {
                setPicked([])
                setBlind(shuffled(pickable).slice(0, randomCount))
                setFronts(false)
              }}
            >
              ⚄ <span>Random</span>
            </button>
          </div>
        )}
        <button className="icon" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      {actions && (actionsSlot ? createPortal(actions, actionsSlot) : actions)}
      <div className="card-grid">
        {entries.map(({ card, def }) => (
          <div
            key={card.id}
            className={`grid-card${picked.includes(card.id) ? ' picked' : ''}${dragged.has(card.id) ? ' dragging' : ''}`}
          >
            <div className="grid-caption">
              <span className="grid-label">{cardLabel(def)}</span>
            </div>
            <div className="thumb" role="button" aria-pressed={picked.includes(card.id)} {...thumb.bind(card.id)}>
              <Thumb id={card.id} faceUp={fronts} def={def} />
              {chosen.includes(card.id) && (
                <span className="pick-badge">{chosen.length > 1 ? chosen.length - chosen.indexOf(card.id) : '✓'}</span>
              )}
            </div>
            <div className="card-tools">
              {pinnedIds.has(card.id) ? (
                <span className="card-grip" style={{ visibility: 'hidden' }} aria-hidden />
              ) : (
                <span className="card-grip" aria-label={`Drag ${cardLabel(def)} onto the table`} {...grip.bind(card.id)}>
                  ⠿
                </span>
              )}
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
      {groupGrip.drag && groupTop && (
        <CardGhost
          src={cardImage(groupTop, groupFaceUp, 'sm')}
          x={groupGrip.drag.x}
          y={groupGrip.drag.y}
          count={groupDragged.length}
          frame={landscapeClass(isLandscape(defs[groupTop]), groupFaceUp)}
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
          // Storybook cards stay in the storybook; a deck is a pile even with one card left. A card set aside can be
          // taken onto the table too.
          const aside = inTray(table, stack.id)
          const inPile = (stack.cards.length > 1 || !!stack.deck || aside) && !stack.slot
          return (
            <div key={def.id} className="grid-card">
              <button className="thumb" onClick={() => onInspect({ id: def.id, faceUp: true })}>
                <Thumb id={def.id} faceUp def={def} />
              </button>
              <div className="grid-caption">
                <span>{cardLabel(def)}</span>
                <span className="muted">{stack.slot ? 'in the Storybook' : aside ? 'set aside' : inPile ? `in ${stack.label ?? 'pile'}` : 'on table'}</span>
              </div>
              <div className="card-actions">
                {/* A card pinned to its pile (the Damage Card, the Training and Banned Cards cards) stays there. */}
                {inPile && !isPinned(stack, index) && (
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

/** Who made the game, and which version of the app this is. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About" onClose={onClose}>
      <div className="about">
        <img src={cardImage('001', true, 'sm')} alt="Grimm World" draggable={false} />
        <div>
          <h3>Grimm World</h3>
          <p>
            A solo print-and-play card game by <strong>Raoul Schaupp</strong>.
          </p>
          <p>
            <a href="https://raoulschaupp.itch.io/grimm-world" target="_blank" rel="noopener noreferrer">
              raoulschaupp.itch.io/grimm-world ↗
            </a>
          </p>
          <p className="muted small">
            An unofficial companion app for playing the game on a tablet.
            <br />
            <a href="https://github.com/camilosw/grimm-world-app" target="_blank" rel="noopener noreferrer">
              github.com/camilosw/grimm-world-app ↗
            </a>
            <br />
            Game version 1.3 · App version {__APP_VERSION__}
          </p>
        </div>
      </div>
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
