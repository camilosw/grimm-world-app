import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as A from './actions'
import { CARD_H, CARD_W, clampScale, isLandscape, loadManifest, TOKEN_SIZE } from './cards'
import { BattlefieldDialog, BrowsePanel, CardViewer, ChapterDialog, FindDialog, RenameDialog } from './dialogs'
import { allAreas, areaForCard, battlefieldArea, battlefieldOrigin, placement, turnedSpot, type Area } from './areas'
import { DECK_SPECS, homeDeck } from './decks'
import { initialTable, migrateTable, playableCards } from './setup'
import { AREA_RULES, cardRule, DECK_RULES, loadRules, type RulesManifest, type RuleTarget } from './rules'
import { RulesPanel } from './RulesPanel'
import { Sidebar } from './Sidebar'
import { loadSaved, redo, resetTable, undo, update, useHistory, useTable } from './store'
import { TableView, type Selection, type Zone } from './Table'
import type { CardDef, CardManifest, CardRef, Table, Token, View } from './types'

type Dialog =
  | { kind: 'inspect'; card: CardRef }
  | { kind: 'find' }
  | { kind: 'rename'; stackId: string }
  | { kind: 'menu' }
  | { kind: 'tokens' }
  | { kind: 'battle' }
  | { kind: 'areas' }
  | { kind: 'chapter'; stackId: string }
  | null

/** A remembered on/off panel setting (per device). */
function usePanel(key: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== '0'
    } catch {
      return true
    }
  })
  const toggle = () => {
    try {
      localStorage.setItem(key, open ? '0' : '1')
    } catch {
      // Only a convenience.
    }
    setOpen(!open)
  }
  return [open, toggle]
}

const sameZone = (a: Zone | null, b: Zone | null) => JSON.stringify(a) === JSON.stringify(b)

const DECKS_IN_SIDEBAR = (t: Table) => (t.dock ?? []).map((id) => t.stacks[id])

const TOKENS: { label: string; color: string; shape: Token['shape'] }[] = [
  { label: 'Player marker', color: '#e8e2d6', shape: 'cube' },
  { label: 'Character', color: '#8a8f98', shape: 'pawn' },
  { label: 'Ally', color: '#7b4fb5', shape: 'pawn' },
  { label: 'Enemy yellow', color: '#f2c318', shape: 'pawn' },
  { label: 'Enemy turquoise', color: '#1fb5b0', shape: 'pawn' },
  { label: 'Enemy black', color: '#1d1d1f', shape: 'pawn' },
  { label: 'Enemy pink', color: '#e75aa6', shape: 'pawn' },
]

/** Every playable card exactly once (older saves may still hold the title card). */
function isValidTable(t: Table | null, manifest: CardManifest): t is Table {
  if (!t?.stacks || !t.z || !t.tokens) return false
  const ids = [...Object.values(t.stacks).flatMap((s) => s.cards), ...(t.hand ?? [])].map((c) => c.id)
  const known = new Set(manifest.cards.map((c) => c.id))
  const unique = new Set(ids)
  return unique.size === ids.length && ids.every((id) => known.has(id)) && playableCards(manifest).every((c) => unique.has(c.id))
}

export default function App() {
  const [manifest, setManifest] = useState<CardManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const table = useTable()
  const history = useHistory()
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.5 })
  const [rawSelection, setSelection] = useState<Selection>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [putUnder, setPutUnder] = useState<string | null>(null)
  /** Pile shown in the browse panel. */
  const [browseId, setBrowseId] = useState<string | null>(null)
  const closeBrowse = useCallback(() => setBrowseId(null), [])
  const [sidebarOpen, toggleSidebar] = usePanel('grimm-world:sidebar-open')
  const [zoneHover, setZoneHover] = useState<Zone | null>(null)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [rules, setRules] = useState<RulesManifest | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rulesTarget, setRulesTarget] = useState<RuleTarget | null>(null)
  /** Sidebar decks a dragged card would go back to. */
  const [homeHover, setHomeHover] = useState<string[]>([])
  const noticeTimer = useRef<number | undefined>(undefined)
  const areaRef = useRef<HTMLDivElement>(null)

  const defs = useMemo<Record<string, CardDef>>(
    () => Object.fromEntries((manifest ? playableCards(manifest) : []).map((c) => [c.id, c])),
    [manifest],
  )

  /** Zoom and pan so that the given table rectangle fills the screen. */
  const fitRect = useCallback((minX: number, minY: number, maxX: number, maxY: number) => {
    const el = areaRef.current
    if (!el) return
    const pad = 40
    const scale = clampScale(Math.min(1, (el.clientWidth - pad * 2) / (maxX - minX), (el.clientHeight - pad * 2) / (maxY - minY)))
    setView({
      scale,
      x: (el.clientWidth - (maxX - minX) * scale) / 2 - minX * scale,
      y: (el.clientHeight - (maxY - minY) * scale) / 2 - minY * scale,
    })
  }, [])

  const fit = useCallback(
    (t: Table) => {
      const items = [
        ...t.z.map((id) => t.stacks[id]).map((s) => ({ x: s.x, y: s.y - 50, w: CARD_W, h: CARD_H + 90 })),
        ...t.tokens.map((k) => ({ x: k.x, y: k.y, w: TOKEN_SIZE, h: TOKEN_SIZE })),
        ...allAreas(t),
      ]
      fitRect(
        Math.min(...items.map((i) => i.x)),
        Math.min(...items.map((i) => i.y)),
        Math.max(...items.map((i) => i.x + i.w)),
        Math.max(...items.map((i) => i.y + i.h)),
      )
    },
    [fitRect],
  )

  useEffect(() => {
    loadManifest()
      .then((m) => {
        const saved = loadSaved()
        const cardDefs = Object.fromEntries(m.cards.map((c) => [c.id, c]))
        const t = isValidTable(saved, m) ? migrateTable(saved, cardDefs) : initialTable(m)
        setManifest(m)
        resetTable(t)
        requestAnimationFrame(() => fit(t))
      })
      .catch((e: Error) => setError(e.message))
  }, [fit])

  // Keyboard shortcuts for desktop testing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key === 'Escape') {
        setSelection(null)
        setPutUnder(null)
        setBrowseId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A selection goes stale after undo/redo or when a pile is used up.
  const selectedStack = rawSelection?.kind === 'stack' ? table?.stacks[rawSelection.id] : undefined
  const selectedToken = rawSelection?.kind === 'token' ? table?.tokens.find((t) => t.id === rawSelection.id) : undefined
  const selection = selectedStack || selectedToken ? rawSelection : null

  const notify = (text: string, ok = false) => {
    setNotice({ text, ok })
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500)
  }

  /**
   * A free spot near the middle of the screen, in table coordinates, for the
   * given cards: outside the areas if possible, else in an area that takes them.
   * Null (and the player is told why) when they can't go on the table.
   */
  const dropAt = useCallback(
    (cardIds: string[] = []): { x: number; y: number } | null => {
      const el = areaRef.current!
      const cx = (el.clientWidth / 2 - view.x) / view.scale - CARD_W / 2
      const cy = (el.clientHeight / 2 - view.y) / view.scale - CARD_H / 2
      if (!table) return { x: cx, y: cy }
      // Cards with a place of their own (Character, Alignment, Money Cards) always go there.
      const own = placement(table, cardIds, defs, cx, cy, null)
      if (own.spot?.attracts) {
        if (own.refused) notify(own.refused)
        return own.refused ? null : { x: own.x, y: own.y }
      }
      const stacks = table.z.map((id) => table.stacks[id])
      const free = (x: number, y: number) => !stacks.some((s) => Math.abs(s.x - x) < CARD_W + 10 && Math.abs(s.y - y) < CARD_H + 10)
      // Try spots on a half-card grid, nearest to the screen center first.
      const spots: { x: number; y: number; d: number }[] = []
      for (let i = -12; i <= 12; i++) {
        for (let j = -8; j <= 8; j++) spots.push({ x: cx + (i * CARD_W) / 2, y: cy + (j * CARD_H) / 2, d: Math.hypot(i * CARD_W, j * CARD_H) })
      }
      spots.sort((a, b) => a.d - b.d)
      const outside = spots.find((p) => free(p.x, p.y) && !areaForCard(table, p.x, p.y))
      const allowed = spots.map((p) => placement(table, cardIds, defs, p.x, p.y, null)).find((p) => free(p.x, p.y) && !p.refused)
      return outside ?? allowed ?? { x: cx, y: cy }
    },
    [view, table, defs],
  )

  /** Where cards dropped at (x, y) or onto `targetId` really go, or null (and tell the player why) if they can't. */
  const placeAt = (cardIds: string[], x: number, y: number, targetId: string | null) => {
    if (!table) return null
    const p = placement(table, cardIds, defs, x, y, targetId)
    if (p.refused) notify(p.refused)
    return p.refused ? null : p
  }

  /** Open the rulebook beside the table, at a section if given. */
  const openRules = (section?: string | null) => {
    const show = () => {
      setRulesOpen(true)
      if (section) setRulesTarget({ section })
    }
    if (rules) return show()
    loadRules()
      .then((r) => {
        setRules(r)
        show()
      })
      .catch((e: Error) => notify(e.message))
  }

  const showArea = (area: Area) => {
    setDialog(null)
    fitRect(area.x, area.y, area.x + area.w, area.y + area.h)
  }

  const showStack = (stackId: string) => {
    const s = table?.stacks[stackId]
    const el = areaRef.current
    if (!s || !el || !table) return
    if (s.slot) {
      const area = allAreas(table).find((a) => a.id === 'storybook')!
      return showArea(area)
    }
    if (A.isDocked(table, stackId)) {
      if (!sidebarOpen) toggleSidebar()
      document.querySelector(`[data-deck="${stackId}"]`)?.scrollIntoView({ block: 'nearest' })
      return setSelection({ kind: 'stack', id: stackId })
    }
    const scale = Math.max(view.scale, 0.6)
    setView({ scale, x: el.clientWidth / 2 - (s.x + CARD_W / 2) * scale, y: el.clientHeight / 2 - (s.y + CARD_H / 2) * scale })
    setSelection({ kind: 'stack', id: stackId })
  }

  /** Drop zone (sidebar deck, sidebar) under a screen point. */
  const zoneAt = (clientX: number, clientY: number): Zone | null => {
    const el = document.elementFromPoint(clientX, clientY)
    const deck = el?.closest<HTMLElement>('[data-deck]')
    if (deck) return { kind: 'deck', id: deck.dataset.deck! }
    if (el?.closest('[data-dock]')) return { kind: 'dock' }
    return null
  }

  /** Table position for a card dropped at a screen point, or null if outside the table. */
  const worldAt = (clientX: number, clientY: number) => {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null
    return { x: (clientX - r.left - view.x) / view.scale - CARD_W / 2, y: (clientY - r.top - view.y) / view.scale - CARD_H / 2 }
  }

  /** Names of the decks these cards go back to, e.g. "Lost Pages". */
  const homeNames = (cards: CardRef[]) => {
    if (!table) return ''
    const kinds = [...new Set(cards.map((c) => defs[c.id] && homeDeck(table, defs[c.id])).filter(Boolean))]
    return kinds.map((k) => DECK_SPECS[k!].label).join(', ')
  }

  /** A table pile (or its top card) was dropped on the sidebar. */
  const dropOnZone = (stackId: string, whole: boolean) => {
    // Wherever it lands on the sidebar, a card goes back to its own deck.
    const s = table?.stacks[stackId]
    if (!s) return
    notify(`Back to ${homeNames(whole ? s.cards : s.cards.slice(-1))}`, true)
    update((t) => A.stackToDecks(t, stackId, whole ? 'all' : 'top', defs))
  }

  /** Cards dragged out of the browse panel were released at a screen point. */
  const dropFromBrowse = (stackId: string, cardIds: string[], clientX: number, clientY: number) => {
    const stack = table?.stacks[stackId]
    const indices = cardIds.map((id) => stack?.cards.findIndex((c) => c.id === id) ?? -1).filter((i) => i >= 0)
    if (!table || !indices.length) return
    const zone = zoneAt(clientX, clientY)
    if (zone) {
      if (!A.isDocked(table, stackId)) {
        notify(`Back to ${homeNames(cardIds.map((id) => ({ id, faceUp: true })))}`, true)
        return update((t) => A.cardsToDecks(t, stackId, indices, defs))
      }
      if (zone.kind === 'deck' && zone.id !== stackId) notify("Cards can't move from one deck to another")
      return
    }
    const at = worldAt(clientX, clientY)
    if (!at) return
    const target = A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ?? null
    const p = placeAt(cardIds, at.x, at.y, target)
    if (p) update((t) => A.playCards(t, stackId, indices, p.x, p.y, p.onto))
  }


  /** Put the pile waiting in "Put under…" mode under a table pile or a sidebar deck. */
  const putUnderTarget = (targetId: string) => {
    const sourceId = putUnder
    setPutUnder(null)
    if (!table || !sourceId || sourceId === targetId) return
    const target = table.stacks[targetId]
    if (target.slot === 'story-revealed') return notify('Put cards under the storybook itself (the right-hand card)')
    if (target.slot === 'story') {
      const refused = A.notHeldBy(table, sourceId, 'storybook', defs)
      if (refused.length) return notify(`${refused[0].code ?? refused[0].name ?? 'This card'} can't go into the Storybook`)
      return setDialog({ kind: 'chapter', stackId: sourceId })
    }
    if (target.deck) {
      const refused = A.notHeldBy(table, sourceId, target.deck, defs)
      if (refused.length) return notify(`${refused[0].code ?? refused[0].name ?? 'This card'} can't go into the ${target.label}`)
      update((t) => A.putUnderDeck(t, sourceId, target.deck!, defs))
    } else {
      const cards = table.stacks[sourceId].cards.map((c) => c.id)
      const p = placeAt(cards, target.x, target.y, targetId)
      if (!p) return
      if (p.onto !== targetId) return notify(`The ${p.spot?.label ?? 'card'} stays on its place`)
      update((t) => A.mergeStacks(t, sourceId, targetId, 'bottom'))
    }
    setSelection({ kind: 'stack', id: targetId })
  }

  /** The top card of a sidebar deck was released at a screen point. */
  const dropFromDeck = (deckId: string, clientX: number, clientY: number) => {
    const zone = zoneAt(clientX, clientY)
    if (zone?.kind === 'deck' && zone.id !== deckId) return notify("Cards can't move from one deck to another")
    if (zone) return
    const at = worldAt(clientX, clientY)
    const card = table?.stacks[deckId]?.cards.at(-1)
    if (!at || !table || !card) return
    const target = A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ?? null
    const p = placeAt([card.id], at.x, at.y, target)
    if (!p) return
    update((t) => {
      const [t2, newId] = A.takeTop(t, deckId, p.x, p.y)
      return newId && p.onto ? A.mergeStacks(t2, newId, p.onto, 'top') : t2
    })
  }

  const buildBattlefield = (rows: (A.TerrainSlot | null)[][]) => {
    if (!table) return
    // Below the areas as they lie, without the battlefield being replaced.
    const { x, y } = battlefieldOrigin({ ...table, battlefield: null })
    update((t) => A.buildBattlefield(t, rows, defs, x, y))
    setSelection(null)
    showArea(battlefieldArea({ x, y, cols: Math.max(1, ...rows.map((r) => r.length)), rows: rows.length }))
  }

  const exportSave = () => {
    const blob = new Blob([JSON.stringify(table)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `grimm-world-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importSave = (file: File) => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Table
        if (!manifest || !isValidTable(parsed, manifest)) throw new Error('not a Grimm World save')
        const t = migrateTable(parsed, Object.fromEntries(manifest.cards.map((c) => [c.id, c])))
        resetTable(t)
        setSelection(null)
        fit(t)
      } catch (e) {
        alert(`Could not load this file: ${(e as Error).message}`)
      }
    })
  }

  if (error) return <div className="splash">{error}</div>
  if (!manifest || !table) return <div className="splash">Loading cards…</div>

  const act = (fn: (t: Table, id: string) => Table) => selectedStack && update((t) => fn(t, selectedStack.id))
  const count = selectedStack?.cards.length ?? 0
  const topCard = selectedStack?.cards[count - 1]
  const docked = !!selectedStack && A.isDocked(table, selectedStack.id)
  // A card lying turned on its place (Market Prices) stays face up and can't be rotated.
  const fixed = !!selectedStack && !!turnedSpot(table, selectedStack.id)
  /** Decks draw several cards; a pile on the table needs at least two. */
  const many = count > (docked ? 0 : 1)

  return (
    <div className="app">
      <header className="toolbar">
        <button onClick={toggleSidebar} className={sidebarOpen ? 'on' : ''} aria-label="Toggle decks">
          🂠 <span>Decks</span>
        </button>
        <button onClick={undo} disabled={!(history & 1)} aria-label="Undo">
          ↶ <span>Undo</span>
        </button>
        <button onClick={redo} disabled={!(history & 2)} aria-label="Redo">
          ↷ <span>Redo</span>
        </button>
        <span className="spacer" />
        <button onClick={() => setDialog({ kind: 'find' })}>
          🔍 <span>Find card</span>
        </button>
        <button onClick={() => setDialog({ kind: 'tokens' })}>
          ● <span>Figures</span>
        </button>
        <button onClick={() => (rulesOpen ? setRulesOpen(false) : openRules())} className={rulesOpen ? 'on' : ''}>
          📖 <span>Rules</span>
        </button>
        <button onClick={() => setDialog({ kind: 'areas' })}>
          📍 <span>Areas</span>
        </button>
        <button onClick={() => setDialog({ kind: 'battle' })}>
          ⚔ <span>Battle</span>
        </button>
        <button onClick={() => fit(table)} aria-label="Fit table">
          ⤢ <span>Fit</span>
        </button>
        <button onClick={() => setDialog({ kind: 'menu' })} aria-label="Menu">
          ☰
        </button>
      </header>

      <div className="main">
      {sidebarOpen && (
        <Sidebar
          decks={(table.dock ?? []).map((id) => table.stacks[id])}
          defs={defs}
          selectedId={selectedStack && docked ? selectedStack.id : null}
          hoverIds={zoneHover ? homeHover : []}
          onTap={(id) => (putUnder ? putUnderTarget(id) : setSelection({ kind: 'stack', id }))}
          onDoubleTap={(id) => update((t) => A.flipTop(t, id))}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onDrop={dropFromDeck}
        />
      )}
      <div className="table-area" ref={areaRef}>
        <TableView
          table={table}
          defs={defs}
          view={view}
          onView={setView}
          selection={selection}
          onSelect={(s) => {
            setSelection(s)
            setPutUnder(null)
          }}
          onPickTarget={
            putUnder ? putUnderTarget : null
          }
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          zoneAt={zoneAt}
          onZoneHover={(zone, cardIds) => {
            setZoneHover((prev) => (sameZone(prev, zone) ? prev : zone))
            if (zone && table) {
              const kinds = new Set(cardIds.map((id) => defs[id] && homeDeck(table, defs[id])))
              setHomeHover(DECKS_IN_SIDEBAR(table).filter((d) => d.deck && kinds.has(d.deck)).map((d) => d.id))
            }
          }}
          onZoneDrop={(_, stackId, whole) => dropOnZone(stackId, whole)}
          onClearBattlefield={() => update((t) => A.clearBattlefield(t, defs))}
          onRefuse={notify}
          onSlotTap={(slot) => update((t) => (slot === 'story' ? A.revealStory(t) : A.unrevealStory(t)))}
          onAreaRules={(areaId) => openRules(AREA_RULES[areaId])}
        />
        {notice && <div className={`notice${notice.ok ? ' ok' : ''}`}>{notice.text}</div>}
        {putUnder && (
          <div className="banner">
            Tap the pile to slide the card{(table.stacks[putUnder]?.cards.length ?? 0) > 1 ? 's' : ''} under
            <button onClick={() => setPutUnder(null)}>Cancel</button>
          </div>
        )}
      </div>
      {rulesOpen && rules && <RulesPanel rules={rules} target={rulesTarget} onClose={() => setRulesOpen(false)} />}
      </div>

      {browseId && (
        <BrowsePanel
          key={browseId}
          table={table}
          stackId={browseId}
          defs={defs}
          dropAt={dropAt}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onDrop={(cardIds, x, y) => dropFromBrowse(browseId, cardIds, x, y)}
          onClose={closeBrowse}
        />
      )}

      {selectedStack && !putUnder && (
        <footer className="actions">
          {many && (
            <button
              onClick={() => {
                const at = docked && topCard ? dropAt([topCard.id]) : undefined
                if (at !== null) act((t, id) => A.drawTop(t, id, at))
              }}
            >
              🂠 Draw
            </button>
          )}
          {count > 0 && !fixed && <button onClick={() => act(A.flipTop)}>⟲ {count > 1 ? 'Flip top' : 'Flip'}</button>}
          {count > 1 && <button onClick={() => act(A.topToBottom)}>⤓ Top → bottom</button>}
          {count > 1 && (
            <button
              className={browseId === selectedStack.id ? 'on' : ''}
              onClick={() => setBrowseId(browseId === selectedStack.id ? null : selectedStack.id)}
            >
              ☰ Browse
            </button>
          )}
          {count > 1 && <button onClick={() => act(A.shuffleStack)}>⤮ Shuffle</button>}
          {count > 1 && <button onClick={() => act((t, id) => A.sortStack(t, id, defs))}>⇅ Sort</button>}
          {topCard && <button onClick={() => setDialog({ kind: 'inspect', card: topCard })}>🔍 View</button>}
          {!docked && !fixed && !selectedStack.cards.some((c) => isLandscape(defs[c.id])) && (
            <button onClick={() => act((t, id) => A.rotateStack(t, id, 90, defs))}>↻ Rotate</button>
          )}
          {!docked && <button onClick={() => setPutUnder(selectedStack.id)}>⤵ Put under…</button>}
          {count > 1 && <button onClick={() => act(A.flipStack)}>⇵ Turn pile over</button>}
          {!docked && <button onClick={() => act(A.bringToFront)}>▲ Front</button>}
          {!docked && <button onClick={() => act(A.sendToBack)}>▼ Back</button>}
          {!docked && (
            <button
              onClick={() => {
                notify(`Back to ${homeNames(selectedStack.cards)}`, true)
                act((t, id) => A.stackToDecks(t, id, 'all', defs))
              }}
            >
              ↩ Return to deck
            </button>
          )}
          {!docked && <button onClick={() => setDialog({ kind: 'rename', stackId: selectedStack.id })}>✎ Name</button>}
          <button onClick={() => openRules(selectedStack.deck ? DECK_RULES[selectedStack.deck] : cardRule(topCard && defs[topCard.id]))}>
            📖 Rules
          </button>
        </footer>
      )}
      {selectedToken && (
        <footer className="actions">
          <button onClick={() => update((t) => A.removeToken(t, selectedToken.id))}>🗑 Remove figure</button>
        </footer>
      )}

      {dialog?.kind === 'inspect' && (
        <CardViewer
          card={dialog.card}
          def={defs[dialog.card.id]}
          onClose={() => setDialog(null)}
          onRules={
            cardRule(defs[dialog.card.id])
              ? () => {
                  setDialog(null)
                  openRules(cardRule(defs[dialog.card.id]))
                }
              : undefined
          }
        />
      )}
      {dialog?.kind === 'find' && (
        <FindDialog
          table={table}
          defs={defs}
          dropAt={dropAt}
          onShow={showStack}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'battle' && (
        <BattlefieldDialog
          table={table}
          defs={defs}
          onBuild={buildBattlefield}
          onRules={() => {
            setDialog(null)
            openRules('8.1.2')
          }}
          onClear={() => {
            update((t) => A.clearBattlefield(t, defs))
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          initial={table.stacks[dialog.stackId]?.label ?? ''}
          onSave={(label) => update((t) => A.renameStack(t, dialog.stackId, label))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'chapter' && (
        <ChapterDialog
          onPick={(chapter) => {
            update((t) => A.putUnderChapter(t, dialog.stackId, chapter, defs))
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'areas' && (
        <div className="popover" onPointerDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="popover-panel">
            {allAreas(table).map((area) => (
              <button key={area.id} onClick={() => showArea(area)}>
                {area.label}
              </button>
            ))}
            <button
              onClick={() => {
                setDialog(null)
                fit(table)
              }}
            >
              ⤢ Whole table
            </button>
          </div>
        </div>
      )}
      {dialog?.kind === 'tokens' && (
        <div className="popover" onPointerDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="popover-panel">
            {TOKENS.map((tok) => (
              <button
                key={tok.label}
                onClick={() => {
                  const at = dropAt()!
                  let x = at.x + CARD_W / 2 - TOKEN_SIZE / 2
                  const y = at.y + CARD_H / 2 - TOKEN_SIZE / 2
                  while (table.tokens.some((k) => Math.abs(k.x - x) < TOKEN_SIZE && Math.abs(k.y - y) < TOKEN_SIZE)) x += TOKEN_SIZE + 10
                  update((t) => A.addToken(t, x, y, tok.color, tok.shape))
                  setDialog(null)
                }}
              >
                <span className={`swatch ${tok.shape}`} style={{ background: tok.color }} /> {tok.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {dialog?.kind === 'menu' && (
        <div className="popover" onPointerDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="popover-panel">
            <button
              onClick={() => {
                if (!confirm('Start a new game? The current table will be replaced (export it first to keep it).')) return
                const t = initialTable(manifest)
                resetTable(t)
                setSelection(null)
                setDialog(null)
                fit(t)
              }}
            >
              ✦ New game
            </button>
            <button
              onClick={() => {
                exportSave()
                setDialog(null)
              }}
            >
              ⭳ Export save
            </button>
            <label className="button">
              ⭱ Import save
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) importSave(f)
                  setDialog(null)
                }}
              />
            </label>
            {document.fullscreenEnabled && (
              <button
                onClick={() => {
                  if (document.fullscreenElement) document.exitFullscreen()
                  else document.documentElement.requestFullscreen()
                  setDialog(null)
                }}
              >
                ⛶ Full screen
              </button>
            )}
            <p className="muted small">
              Tap: select · Double-tap: flip · Long-press: read card · Drag a card off a pile to draw it · Drag ⠿ to move the whole
              pile · Drop onto a pile to stack · Two fingers: zoom
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
