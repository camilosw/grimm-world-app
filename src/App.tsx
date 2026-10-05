import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as A from './actions'
import { CARD_H, CARD_W, clampScale, isLandscape, loadManifest, tokenSize } from './cards'
import { BrowsePanel, CardViewer, ChapterDialog, FindDialog, RenameDialog } from './dialogs'
import { BattlefieldBar } from './BattlefieldBar'
import { AreaIcon } from './AreaIcon'
import { allAreas, areaForCard, battlefieldInUse, COMBAT_AREAS, facedSpot, onGrid, placement, PLAY_AREAS, turnedSpot, upsideDownSpot, type Area } from './areas'
import { DECK_SPECS, homeDeck, returnsCards, storySlot, type DeckKind } from './decks'
import { initialTable, migrateTable, playableCards } from './setup'
import { AREA_RULES, cardRule, DECK_RULES, loadRules, type RulesManifest, type RuleTarget } from './rules'
import { RulesPanel } from './RulesPanel'
import { Sidebar } from './Sidebar'
import { getTable, loadSaved, redo, resetTable, undo, update, useHistory, useTable } from './store'
import { TableView, type Dealt, type Incoming, type Selection, type Zone } from './Table'
import { Tray } from './Tray'
import { useDragOut } from './useDragOut'
import type { CardDef, CardManifest, CardRef, Table, Token, View } from './types'

type Dialog =
  | { kind: 'inspect'; card: CardRef }
  | { kind: 'find' }
  | { kind: 'rename'; stackId: string }
  | { kind: 'menu' }
  | { kind: 'tokens' }
  | { kind: 'chapter'; stackId: string; cardIds?: string[] }
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

/** How long a pile on the table shows being shuffled (see `.shuffle-card` in styles.css). */
const SHUFFLE_MS = 900
/** How long a card dealt by an action shows travelling to its place (see `DEAL_TRAVEL_MS` in Table.tsx). */
const DEAL_MS = 430
/** How long the view glides to an area or a pile it is sent to (see `.world.gliding` in styles.css). */
const GLIDE_MS = 500

/** The area buttons along the left edge of the screen, in the order the areas lie (`packedPlaces()`). */
const RAIL_AREAS = ['bar', 'map', 'encounter', 'storybook', 'storage', 'character', 'hand', 'home', 'battlefield', 'quest', 'enemy', 'training', 'banned']

const DECKS_IN_SIDEBAR = (t: Table) => (t.dock ?? []).map((id) => t.stacks[id])

/** How close to the right edge of the table (screen pixels) a dragged card opens the hidden sidebar of cards set aside. */
const TRAY_EDGE = 48

type FigureKind = { label: string; color: string; shape: Token['shape'] }

const TOKENS: FigureKind[] = [
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
  return (
    unique.size === ids.length &&
    ids.every((id) => known.has(id)) &&
    playableCards(manifest).every((c) => unique.has(c.id)) &&
    (t.tray ?? []).every((id) => t.stacks[id])
  )
}

export default function App() {
  const [manifest, setManifest] = useState<CardManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const table = useTable()
  const history = useHistory()
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.5 })
  const [rawSelection, setSelection] = useState<Selection>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  // Cards waiting in "Put under…" mode: a whole table pile, or cards picked in the Browse panel.
  const [putUnder, setPutUnder] = useState<{ stackId: string; cardIds?: string[]; faceUp?: boolean } | null>(null)
  /** Pile shown in the browse panel. */
  const [browseId, setBrowseId] = useState<string | null>(null)
  const closeBrowse = useCallback(() => setBrowseId(null), [])
  const [sidebarOpen, toggleSidebar] = usePanel('grimm-world:sidebar-open')
  /** The right sidebar of cards set aside is open, not minimized to a narrow bar. */
  const [trayOpen, toggleTray] = usePanel('grimm-world:tray-open')
  const [zoneHover, setZoneHover] = useState<Zone | null>(null)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [rules, setRules] = useState<RulesManifest | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rulesTarget, setRulesTarget] = useState<RuleTarget | null>(null)
  /** Sidebar decks a dragged card would go back to. */
  const [homeHover, setHomeHover] = useState<string[]>([])
  /** The battlefield being typed in the bar at the top of the table (null: the bar is closed). */
  const [battleText, setBattleText] = useState<string | null>(null)
  /** Screen pixels hidden at the top of the table by that bar and at its bottom by the on-screen keyboard. */
  const [inset, setInset] = useState({ top: 0, bottom: 0 })
  const setBarHeight = useCallback((top: number) => setInset((i) => (i.top === top ? i : { ...i, top })), [])
  // Where cards dragged in from outside the table (sidebar, set-aside cards, Browse panel) would land on it.
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  /** The table pile just shuffled, shown shuffling for a moment (`n` restarts the animation). */
  const [shuffled, setShuffled] = useState<{ id: string; n: number } | null>(null)
  const shuffleTimer = useRef<number | undefined>(undefined)
  /** The card just dealt by an action (a sub-chapter card into the Encounter Bar), shown travelling there. */
  const [dealt, setDealt] = useState<Dealt | null>(null)
  const dealTimer = useRef<number | undefined>(undefined)
  const areaRef = useRef<HTMLDivElement>(null)

  const defs = useMemo<Record<string, CardDef>>(
    () => Object.fromEntries((manifest ? playableCards(manifest) : []).map((c) => [c.id, c])),
    [manifest],
  )

  /** The view in which the given table rectangle fills the screen, but `inset` pixels at its top and bottom. */
  const rectView = useCallback((minX: number, minY: number, maxX: number, maxY: number, inset = { top: 0, bottom: 0 }): View | null => {
    const el = areaRef.current
    if (!el) return null
    const pad = 40
    const h = el.clientHeight - inset.top - inset.bottom
    const scale = clampScale(Math.min(1, (el.clientWidth - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)))
    return {
      scale,
      x: (el.clientWidth - (maxX - minX) * scale) / 2 - minX * scale,
      y: inset.top + (h - (maxY - minY) * scale) / 2 - minY * scale,
    }
  }, [])

  /** Zoom and pan so that the given table rectangle fills the screen (but `inset` pixels at its top and bottom). */
  const fitRect = useCallback(
    (minX: number, minY: number, maxX: number, maxY: number, inset?: { top: number; bottom: number }) => {
      const v = rectView(minX, minY, maxX, maxY, inset)
      if (v) setView(v)
    },
    [rectView],
  )

  /**
   * The view showing the areas used in every round (`PLAY_AREAS`), or in a combat, while Terrain Cards lie on the
   * battlefield, those used in it (`COMBAT_AREAS`); with `whole`, everything on the table.
   */
  const fitView = useCallback(
    (t: Table, whole = false) => {
      const items = whole
        ? [
            ...t.z.map((id) => t.stacks[id]).map((s) => ({ x: s.x, y: s.y - 50, w: CARD_W, h: CARD_H + 90 })),
            ...t.tokens.map((k) => ({ x: k.x, y: k.y, w: tokenSize(k), h: tokenSize(k) })),
            ...allAreas(t),
          ]
        : allAreas(t).filter((a) => (battlefieldInUse(t) ? COMBAT_AREAS : PLAY_AREAS).includes(a.id))
      return rectView(
        Math.min(...items.map((i) => i.x)),
        Math.min(...items.map((i) => i.y)),
        Math.max(...items.map((i) => i.x + i.w)),
        Math.max(...items.map((i) => i.y + i.h)),
      )
    },
    [rectView],
  )

  /** The view moving smoothly to an area or a pile it is sent to, until the player pans or zooms. */
  const [gliding, setGliding] = useState(false)
  const glideTimer = useRef<number | undefined>(undefined)
  const glideTo = (v: View | null) => {
    if (!v) return
    window.clearTimeout(glideTimer.current)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setGliding(!still)
    if (!still) glideTimer.current = window.setTimeout(() => setGliding(false), GLIDE_MS)
    setView(v)
  }
  /** The area just shown by its button, lit up there until the view moves elsewhere. */
  const [shownArea, setShownArea] = useState<string | null>(null)
  /** The view moved by the player (pan, pinch, wheel): it stops gliding where it is headed. */
  const moveView = (v: View) => {
    window.clearTimeout(glideTimer.current)
    setGliding(false)
    setShownArea(null)
    setView(v)
  }

  const fit = useCallback(
    (t: Table, whole = false) => {
      const v = fitView(t, whole)
      if (v) setView(v)
    },
    [fitView],
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
        setBattleText(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A selection goes stale after undo/redo or when a pile is used up.
  const selectedStack = rawSelection?.kind === 'stack' ? table?.stacks[rawSelection.id] : undefined
  const selectedToken = rawSelection?.kind === 'token' ? table?.tokens.find((t) => t.id === rawSelection.id) : undefined
  const selection = selectedStack || selectedToken ? rawSelection : null

  // The battlefield typed in the bar, and the table with it laid out, shown meanwhile.
  const battleLayout = useMemo(() => (battleText === null ? null : A.parseBattlefield(battleText)), [battleText])
  const battlePreview = useMemo(
    () => (battleLayout && table ? A.settle(A.buildBattlefield(table, battleLayout.rows, defs)) : null),
    [battleLayout, table, defs],
  )
  const typing = battleText !== null

  // While it is typed, the battlefield as it would lie fills the table below the bar, above the on-screen keyboard.
  const battleBox = battlePreview && allAreas(battlePreview).find((a) => a.id === 'battlefield')
  const battleFit = battleBox && [battleBox.x, battleBox.y, battleBox.w, battleBox.h, inset.top, inset.bottom].join()
  useEffect(() => {
    if (battleBox) fitRect(battleBox.x, battleBox.y, battleBox.x + battleBox.w, battleBox.y + battleBox.h, inset)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the battlefield or the room for it changes
  }, [battleFit])

  // The on-screen keyboard: where the browser reports it (`visualViewport`), the part of the table it hides.
  useEffect(() => {
    const vv = window.visualViewport
    if (!typing || !vv) return
    const measure = () => {
      const el = areaRef.current
      if (!el) return
      const bottom = Math.max(0, Math.round(el.getBoundingClientRect().bottom - (vv.offsetTop + vv.height)))
      setInset((i) => (i.bottom === bottom ? i : { ...i, bottom }))
    }
    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
      setInset((i) => ({ ...i, bottom: 0 }))
    }
  }, [typing])

  const notify = (text: string, ok = false) => {
    setNotice({ text, ok })
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500)
  }

  const shuffle = (stackId: string) => {
    update((t) => A.shuffleStack(t, stackId))
    setShuffled((prev) => ({ id: stackId, n: (prev?.n ?? 0) + 1 }))
    window.clearTimeout(shuffleTimer.current)
    shuffleTimer.current = window.setTimeout(() => setShuffled(null), SHUFFLE_MS)
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
      // Cards with a place of their own (Character, Alignment, Money Cards) always go there. Dropped in a table deck's
      // area they would go into that deck instead: none is put there on its own.
      const centered = placement(table, cardIds, defs, cx, cy, null)
      const own = centered.area?.deck ? placement(table, cardIds, defs, -Infinity, -Infinity, null) : centered
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
    setShownArea(area.id)
    glideTo(rectView(area.x, area.y, area.x + area.w, area.y + area.h))
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
    if (A.inTray(table, stackId)) {
      if (!trayOpen) toggleTray()
      requestAnimationFrame(() => document.querySelector(`[data-tray-pile="${stackId}"]`)?.scrollIntoView({ block: 'nearest' }))
      return setSelection({ kind: 'stack', id: stackId })
    }
    const scale = Math.max(view.scale, 0.6)
    setShownArea(null)
    glideTo({ scale, x: el.clientWidth / 2 - (s.x + CARD_W / 2) * scale, y: el.clientHeight / 2 - (s.y + CARD_H / 2) * scale })
    setSelection({ kind: 'stack', id: stackId })
  }

  /** Drop zone (sidebar deck, sidebar, the right sidebar of cards set aside) under a screen point. */
  const zoneAt = (clientX: number, clientY: number): Zone | null => {
    const el = document.elementFromPoint(clientX, clientY)
    const pile = el?.closest<HTMLElement>('[data-tray-pile]')
    if (pile) {
      // Before the set-aside pile dropped on, or after it when dropped on its lower half.
      const id = pile.dataset.trayPile!
      const r = pile.getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return { kind: 'tray', before: id }
      const tray = table?.tray ?? []
      return { kind: 'tray', before: tray[tray.indexOf(id) + 1] ?? null }
    }
    if (el?.closest('[data-tray]')) return { kind: 'tray', before: null }
    const deck = el?.closest<HTMLElement>('[data-deck]')
    if (deck) return { kind: 'deck', id: deck.dataset.deck! }
    if (el?.closest('[data-dock]')) return { kind: 'dock' }
    // Hidden while nothing is set aside: it appears when a card is dragged to the right edge of the table.
    const r = areaRef.current?.getBoundingClientRect()
    const edge = r && clientX > r.right - TRAY_EDGE && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    if (edge && !document.querySelector('[data-tray]')) return { kind: 'tray', before: null }
    return null
  }

  /**
   * Cards (by id, taken off the deck `from` if any) dragged over a drop zone (or off it: null): light it up, and the
   * sidebar decks they would go back to.
   */
  const hoverZone = (zone: Zone | null, cardIds: string[], from?: DeckKind) => {
    setZoneHover((prev) => (sameZone(prev, zone) ? prev : zone))
    if (zone && table) {
      const kinds = new Set(cardIds.map((id) => defs[id] && homeDeck(table, defs[id], from)))
      setHomeHover(DECKS_IN_SIDEBAR(table).filter((d) => d.deck && kinds.has(d.deck)).map((d) => d.id))
    }
  }

  /** Tell the player that cards went into the minimized sidebar, where they can't see them. */
  const setAside = (fn: (t: Table) => Table) => {
    if (!trayOpen && table?.tray?.length) notify('Set aside', true)
    update(fn)
  }

  /** Table position for a card dropped at a screen point, or null if outside the table. */
  const worldAt = (clientX: number, clientY: number) => {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null
    return { x: (clientX - r.left - view.x) / view.scale - CARD_W / 2, y: (clientY - r.top - view.y) / view.scale - CARD_H / 2 }
  }

  /**
   * Put a figure from the Figures panel on the table, centered on a screen point (none: the middle of the screen,
   * beside the figures already there). Figures belong to no area or place: they lie on whatever lies there.
   */
  const addFigure = (tok: FigureKind, clientX?: number, clientY?: number) => {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r || !table) return
    const size = tokenSize(tok)
    const dropped = clientX !== undefined && clientY !== undefined
    let x = ((dropped ? clientX - r.left : r.width / 2) - view.x) / view.scale - size / 2
    const y = ((dropped ? clientY - r.top : r.height / 2) - view.y) / view.scale - size / 2
    if (!dropped) {
      const near = (k: Token) => Math.abs(k.x + tokenSize(k) / 2 - x - size / 2) < (tokenSize(k) + size) / 2 && Math.abs(k.y + tokenSize(k) / 2 - y - size / 2) < (tokenSize(k) + size) / 2
      while (table.tokens.some(near)) x += size + 10
    }
    update((t) => A.addToken(t, x, y, tok.color, tok.shape))
    setDialog(null)
  }

  // Figures panel: tap a figure to put it in the middle of the screen, or drag it to where it goes; dropped off the
  // table, it stays in the panel.
  const figureDrag = useDragOut<FigureKind>({
    onTap: (tok) => addFigure(tok),
    onDrop: (tok, clientX, clientY) => {
      const r = areaRef.current?.getBoundingClientRect()
      if (r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) addFigure(tok, clientX, clientY)
    },
  })

  /**
   * Cards dragged in from outside the table, held at a screen point (none: the drag left the table or ended): light up
   * where they would land on the table, as a drag on the table does.
   */
  const hoverTable = (cardIds: string[], clientX = 0, clientY = 0) => {
    const at = table && cardIds.length && !zoneAt(clientX, clientY) ? worldAt(clientX, clientY) : null
    let next: Incoming | null = null
    if (at && table && onStory(at, cardIds)) {
      // They go under one of the storybook's cards (the drop asks which), as a drag on the table does.
      next = { area: { id: 'storybook', ok: true }, spot: null, dropOn: storySlot(table, 'story')?.id ?? null }
    } else if (at && table) {
      const target = A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ?? null
      const p = placement(table, cardIds, defs, at.x, at.y, target)
      next = { area: p.area ? { id: p.area.id, ok: !p.refused } : null, spot: p.spot?.id ?? null, dropOn: p.onto, to: { x: p.x, y: p.y } }
    }
    setIncoming((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }

  /** Names of the decks these cards (taken off the deck `from` if any) go back to, e.g. "Lost Pages". */
  const homeNames = (cards: CardRef[], from?: DeckKind) => {
    if (!table) return ''
    const kinds = [...new Set(cards.map((c) => defs[c.id] && homeDeck(table, defs[c.id], from)).filter(Boolean))]
    return kinds.map((k) => DECK_SPECS[k!].label).join(', ')
  }

  /** A table pile (or its top card) was dropped on the sidebar. */
  const dropOnZone = (zone: Zone, stackId: string, whole: boolean) => {
    // Wherever it lands on the sidebar, a card goes back to its own deck; one taken off the Encounter Deck stays there.
    // One taken off a deck built during play goes back to the deck it came from (Lost Pages).
    const s = table?.stacks[stackId]
    if (!s) return
    if (zone.kind === 'tray') return setAside((t) => A.toTray(t, stackId, whole ? 'all' : 'top', zone.before))
    if (s.deck && !returnsCards(s.deck)) return zone.kind === 'deck' && notify("Cards can't move from one deck to another")
    // A deck's card on top for good (Y013, Y012, Y011) keeps the cards under it.
    if (!whole && A.pinnedOnTop(s)) return
    const moved = whole ? A.unpinned(s) : A.unpinned(s).slice(-1)
    if (!moved.length) return
    notify(`Back to ${homeNames(moved, s.deck)}`, true)
    update((t) => A.stackToDecks(t, stackId, whole ? 'all' : 'top', defs))
  }

  /** Cards dragged out of the browse panel were released at a screen point (face down: picked at random, unseen). */
  const dropFromBrowse = (stackId: string, cardIds: string[], clientX: number, clientY: number, faceUp: boolean) => {
    const stack = table?.stacks[stackId]
    const indices = cardIds.map((id) => stack?.cards.findIndex((c) => c.id === id) ?? -1).filter((i) => i >= 0)
    if (!table || !indices.length) return
    const zone = zoneAt(clientX, clientY)
    if (zone?.kind === 'tray') return setAside((t) => A.toTray(t, stackId, cardIds, zone.before, faceUp))
    if (zone) {
      if (!stack?.deck || returnsCards(stack.deck)) {
        notify(`Back to ${homeNames(cardIds.map((id) => ({ id, faceUp: true })), stack?.deck)}`, true)
        return update((t) => A.cardsToDecks(t, stackId, indices, defs))
      }
      if (zone.kind === 'deck' && zone.id !== stackId) notify("Cards can't move from one deck to another")
      return
    }
    const at = worldAt(clientX, clientY)
    if (!at) return
    if (onStory(at, cardIds)) return setDialog({ kind: 'chapter', stackId, cardIds })
    const target = A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ?? null
    const p = placeAt(cardIds, at.x, at.y, target)
    if (p) update((t) => A.playCards(t, stackId, indices, p.x, p.y, p.onto, defs, faceUp))
  }


  /** Tell the player which card a deck refuses, if any; true when they may all go in. */
  const heldBy = (stackId: string, kind: DeckKind, label: string, cardIds?: string[]) => {
    if (!table) return false
    const refused = A.notHeldBy(table, stackId, kind, defs, cardIds)
    if (refused.length) notify(`${refused[0].code ?? refused[0].name ?? 'This card'} can't go into the ${label}`)
    return !refused.length
  }

  /** Whether cards dropped with their top-left corner at `at` go into the face-down storybook (`intoStory`). */
  const onStory = (at: { x: number; y: number }, cardIds: string[]) => !!table && A.intoStory(table, cardIds, defs, at.x, at.y)

  /** Put the cards waiting in "Put under…" mode under a table pile or a deck. */
  const putUnderTarget = (targetId: string) => {
    const source = putUnder
    setPutUnder(null)
    if (!table || !source) return
    const { stackId: sourceId, cardIds, faceUp = true } = source
    const target = table.stacks[targetId]
    // Cards picked out of the storybook may go under another of its chapters.
    if (sourceId === targetId && !(target.slot === 'story' && cardIds)) return
    if (target.slot === 'story-revealed') return notify('Put cards under the storybook itself (the right-hand card)')
    if (target.slot === 'story') {
      if (heldBy(sourceId, 'storybook', 'Storybook', cardIds)) setDialog({ kind: 'chapter', stackId: sourceId, cardIds })
      return
    }
    if (target.deck) {
      if (!heldBy(sourceId, target.deck, DECK_SPECS[target.deck].label, cardIds)) return
      update((t) => A.putUnderDeck(t, sourceId, targetId, defs, cardIds))
    } else if (A.inTray(table, targetId)) {
      // Set aside, the pile belongs to no area.
      update((t) => (cardIds ? A.putUnderPile(t, sourceId, cardIds, targetId, faceUp) : A.mergeStacks(t, sourceId, targetId, 'bottom')))
    } else {
      const cards = cardIds ?? table.stacks[sourceId].cards.map((c) => c.id)
      const p = placeAt(cards, target.x, target.y, targetId)
      if (!p) return
      if (p.onto !== targetId) return notify(`The ${p.spot?.label ?? 'card'} stays on its place`)
      update((t) => (cardIds ? A.putUnderPile(t, sourceId, cardIds, targetId, faceUp) : A.mergeStacks(t, sourceId, targetId, 'bottom')))
    }
    setSelection({ kind: 'stack', id: targetId })
  }

  /** The top card of a sidebar deck was released at a screen point. */
  const dropFromDeck = (deckId: string, clientX: number, clientY: number) => {
    const zone = zoneAt(clientX, clientY)
    if (zone?.kind === 'tray') return setAside((t) => A.toTray(t, deckId, 'top', zone.before))
    if (zone?.kind === 'deck' && zone.id !== deckId) return notify("Cards can't move from one deck to another")
    if (zone) return
    const at = worldAt(clientX, clientY)
    const card = table?.stacks[deckId]?.cards.at(-1)
    if (!at || !table || !card) return
    if (onStory(at, [card.id])) return setDialog({ kind: 'chapter', stackId: deckId, cardIds: [card.id] })
    const target = A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ?? null
    const p = placeAt([card.id], at.x, at.y, target)
    if (!p) return
    update((t) => {
      const [t2, newId] = A.takeTop(t, deckId, p.x, p.y)
      return newId && p.onto ? A.dropOnto(t2, newId, p.onto, defs) : t2
    })
  }

  /** A set-aside pile was dragged out of the right sidebar and released at a screen point. */
  const dropFromTray = (stackId: string, clientX: number, clientY: number) => {
    const s = table?.stacks[stackId]
    if (!table || !s) return
    const zone = zoneAt(clientX, clientY)
    if (zone?.kind === 'tray') return update((t) => A.toTray(t, stackId, 'all', zone.before))
    if (zone) {
      notify(`Back to ${homeNames(s.cards)}`, true)
      return update((t) => A.stackToDecks(t, stackId, 'all', defs))
    }
    const at = worldAt(clientX, clientY)
    if (!at) return
    const cardIds = s.cards.map((c) => c.id)
    if (onStory(at, cardIds)) return setDialog({ kind: 'chapter', stackId })
    const target = A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ?? null
    const p = placeAt(cardIds, at.x, at.y, target)
    if (!p) return
    update((t) => {
      const t2 = A.fromTray(t, stackId, p.x, p.y)
      return p.onto ? A.dropOnto(t2, stackId, p.onto, defs) : t2
    })
  }

  /** Open the bar for typing the battlefield, filled in with the one lying on the table. */
  const typeBattlefield = () => {
    setBattleText(A.battlefieldText(table!, defs))
    setSelection(null)
    setPutUnder(null)
  }

  const layOutBattlefield = () => {
    if (!battleLayout) return
    update((t) => A.buildBattlefield(t, battleLayout.rows, defs))
    setBattleText(null)
    const area = allAreas(getTable() ?? table!).find((a) => a.id === 'battlefield')
    if (area) showArea(area)
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
  // A pile set aside in the right sidebar lies upright there, in no particular place.
  const aside = !!selectedStack && A.inTray(table, selectedStack.id)
  const trayPiles = (table.tray ?? []).map((id) => table.stacks[id])
  // Decks, in the sidebar or on the table, stay where they are and keep their cards.
  const isDeck = !!selectedStack?.deck
  // The Encounter Deck area's places stay too, and so do the time cards at the bottom of theirs.
  const isPlace = !!selectedStack?.place
  // The Damage Card stays on top of its place for good, the Enemy, Training and Banned Cards cards on top of their decks:
  // nothing is drawn from them, nor their top card moved under the rest.
  const isDamage = selectedStack?.place === 'damage'
  const topPinned = !!selectedStack && A.pinnedOnTop(selectedStack) > 0
  const free = selectedStack ? A.unpinned(selectedStack).length : 0
  // A card lying turned on its place stays as it lies (Market Prices face up, Encounter Bar face down) and can't be rotated.
  const fixed = !!selectedStack && !!turnedSpot(table, selectedStack.id)
  // Nor turned over, nor one lying face up for good (Broken Items, Status Upgrades & Items).
  const faced = !!selectedStack && !!facedSpot(table, selectedStack.id)
  // A Region Card on the Map and a Terrain Card on the battlefield lie face up.
  const onGridPlace = !!selectedStack && onGrid(table, selectedStack.id)
  // A card lying upside down on its place (Actions area, Titles, Skills, Broken Items, Status Upgrades & Items) can't be rotated either.
  const upsideDown = !!selectedStack && !!upsideDownSpot(table, selectedStack.id)
  /** Decks and places draw several cards; a pile on the table needs at least two. */
  const many = free > (isDeck || isPlace ? 0 : 1)

  return (
    <div className="app">
      {/* The rules panel lies beside the toolbar and the table, from the top of the screen. */}
      <div className="workspace">
      <div className="workspace-left">
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
        <button onClick={() => (typing ? setBattleText(null) : typeBattlefield())} className={typing ? 'on' : ''}>
          ⚔ <span>Battle</span>
        </button>
        <button
          onClick={() => {
            // Showing the play areas already: show the whole table.
            const play = fitView(table)
            const same = !!play && Math.abs(play.scale - view.scale) < 1e-3 && Math.abs(play.x - view.x) < 1 && Math.abs(play.y - view.y) < 1
            setShownArea(null)
            glideTo(fitView(table, same))
          }}
          aria-label="Fit the play areas, again for the whole table"
        >
          ⤢ <span>Fit</span>
        </button>
        <button onClick={() => setDialog({ kind: 'menu' })} aria-label="Menu">
          ☰
        </button>
      </header>

      <div className="main">
      {/* Always shown, along the left edge of the screen; it scrolls when the screen is too short for it. */}
      <nav className="area-rail" aria-label="Show an area">
        {RAIL_AREAS.map((id) => allAreas(table).find((a) => a.id === id)).filter((a) => !!a).map((area) => (
          <button
            key={area.id}
            className={shownArea === area.id ? 'on' : ''}
            onClick={() => showArea(area)}
            aria-label={area.label}
            title={area.label}
          >
            <AreaIcon id={area.id} />
          </button>
        ))}
      </nav>
      {sidebarOpen && (
        <Sidebar
          decks={(table.dock ?? []).map((id) => table.stacks[id])}
          defs={defs}
          selectedId={selectedStack && docked ? selectedStack.id : null}
          hoverIds={zoneHover && zoneHover.kind !== 'tray' ? homeHover : []}
          onTap={(id) => {
            if (putUnder) return putUnderTarget(id)
            setSelection({ kind: 'stack', id })
            // An open Browse panel follows the deck tapped.
            if (browseId) setBrowseId(id)
          }}
          onDoubleTap={(id) => update((t) => A.flipTop(t, id))}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onDrop={dropFromDeck}
          onDragHover={(d) => {
            hoverZone(d && zoneAt(d.x, d.y), [])
            const top = d && table.stacks[d.item]?.cards.at(-1)
            hoverTable(top ? [top.id] : [], d?.x, d?.y)
          }}
        />
      )}
      <div className="table-area" ref={areaRef}>
        <TableView
          table={table}
          defs={defs}
          view={view}
          onView={moveView}
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
          onZoneHover={hoverZone}
          onZoneDrop={dropOnZone}
          onClearBattlefield={() => update((t) => A.clearBattlefield(t, defs))}
          onTypeBattlefield={typeBattlefield}
          preview={battlePreview}
          onRefuse={notify}
          onSlotTap={(slot) => {
            const story = storySlot(table, 'story')
            const top = story?.cards.at(-1)
            if (slot === 'story' && story && top && A.storyToBar(table, defs)) {
              notify('Sub-chapter card placed in the Encounter Bar', true)
              setDealt((prev) => ({ cardId: top.id, from: { x: story.x, y: story.y }, n: (prev?.n ?? 0) + 1 }))
              window.clearTimeout(dealTimer.current)
              dealTimer.current = window.setTimeout(() => setDealt(null), DEAL_MS)
            }
            update((t) => (slot === 'story' ? A.revealStory(t, defs) : A.unrevealStory(t)))
          }}
          onStoryDrop={(stackId, whole) => {
            const top = table.stacks[stackId]?.cards.at(-1)
            setDialog({ kind: 'chapter', stackId, cardIds: whole ? undefined : top && [top.id] })
          }}
          onAreaRules={(areaId) => openRules(AREA_RULES[areaId])}
          shuffled={shuffled}
          onShufflePlace={(stackId) => {
            shuffle(stackId)
            notify('Encounter Deck shuffled', true)
          }}
          onBrowseDeck={(stackId) => {
            // The storybook is only turned over, never picked up: browsing it doesn't select it.
            setSelection(table.stacks[stackId]?.slot ? null : { kind: 'stack', id: stackId })
            setPutUnder(null)
            setBrowseId(browseId === stackId ? null : stackId)
          }}
          browsing={browseId}
          incoming={incoming}
          dealt={dealt}
          gliding={gliding}
        />
        {battleLayout && (
          <BattlefieldBar
            text={battleText!}
            layout={battleLayout}
            defs={defs}
            onText={setBattleText}
            onLayOut={layOutBattlefield}
            onClose={() => setBattleText(null)}
            onHeight={setBarHeight}
          />
        )}
        {notice && <div className={`notice${notice.ok ? ' ok' : ''}`}>{notice.text}</div>}
        {putUnder && (
          <div className="banner">
            Tap a pile, a deck or the storybook to slide the card{(putUnder.cardIds ?? table.stacks[putUnder.stackId]?.cards ?? []).length > 1 ? 's' : ''} under
            <button onClick={() => setPutUnder(null)}>Cancel</button>
          </div>
        )}
      </div>
      {(trayPiles.length > 0 || zoneHover?.kind === 'tray') && (
        <Tray
          piles={trayPiles}
          defs={defs}
          collapsed={!trayOpen && trayPiles.length > 0}
          onCollapse={(collapsed) => collapsed === trayOpen && toggleTray()}
          selectedId={aside ? selectedStack!.id : null}
          hover={zoneHover?.kind === 'tray' ? zoneHover : null}
          onTap={(id) => (putUnder ? putUnderTarget(id) : setSelection({ kind: 'stack', id }))}
          onDoubleTap={(id) => update((t) => A.flipTop(t, id))}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onDragHover={(d) => {
            const cardIds = d ? (table.stacks[d.item]?.cards.map((c) => c.id) ?? []) : []
            hoverZone(d && zoneAt(d.x, d.y), cardIds)
            hoverTable(cardIds, d?.x, d?.y)
          }}
          onDrop={dropFromTray}
        />
      )}
      </div>
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
          onDrop={(cardIds, x, y, faceUp) => dropFromBrowse(browseId, cardIds, x, y, faceUp)}
          onDragHover={(cardIds, at) => {
            const deck = table.stacks[browseId]?.deck
            hoverZone(at && zoneAt(at.x, at.y), deck && !returnsCards(deck) ? [] : cardIds, deck)
            hoverTable(at ? cardIds : [], at?.x, at?.y)
          }}
          onPutUnder={(cardIds, faceUp) => setPutUnder({ stackId: browseId, cardIds, faceUp })}
          onClose={closeBrowse}
        />
      )}

      {selectedStack && !putUnder && (
        <footer className="actions">
          {many && !topPinned && (
            <button
              onClick={() => {
                const at = (isDeck || isPlace || aside) && topCard ? dropAt([topCard.id]) : undefined
                if (at !== null) act((t, id) => A.drawTop(t, id, at))
              }}
            >
              🂠 Draw
            </button>
          )}
          {count > 0 && !faced && !onGridPlace && <button onClick={() => act(A.flipTop)}>⟲ {count > 1 ? 'Flip top' : 'Flip'}</button>}
          {free > 1 && !topPinned && <button onClick={() => act(A.topToBottom)}>⤓ Top → bottom</button>}
          {count > 1 && (
            <button
              className={browseId === selectedStack.id ? 'on' : ''}
              onClick={() => setBrowseId(browseId === selectedStack.id ? null : selectedStack.id)}
            >
              ☰ Browse
            </button>
          )}
          {free > 1 && <button onClick={() => shuffle(selectedStack.id)}>⤮ Shuffle</button>}
          {free > 1 && <button onClick={() => act((t, id) => A.sortStack(t, id, defs))}>⇅ Sort</button>}
          {topCard && <button onClick={() => setDialog({ kind: 'inspect', card: topCard })}>🔍 View</button>}
          {!isDeck && !isPlace && !aside && !fixed && !upsideDown && !selectedStack.cards.some((c) => isLandscape(defs[c.id])) && (
            <button onClick={() => act((t, id) => A.rotateStack(t, id, 90, defs))}>↻ Rotate</button>
          )}
          {!aside && selectedStack.cards.every((c) => defs[c.id]?.type === 'terrain') && (
            <button onClick={() => act((t, id) => A.rotateStack(t, id, 180, defs))}>↻ Turn around</button>
          )}
          {(!isDeck || isPlace) && free > 0 && <button onClick={() => setPutUnder({ stackId: selectedStack.id })}>⤵ Put under…</button>}
          {free > 1 && <button onClick={() => act(A.flipStack)}>⇵ Turn pile over</button>}
          {!isDeck && !isPlace && !aside && <button onClick={() => act(A.bringToFront)}>▲ Front</button>}
          {!isDeck && !isPlace && !aside && <button onClick={() => act(A.sendToBack)}>▼ Back</button>}
          {aside && (
            <button
              onClick={() => {
                const at = dropAt(selectedStack.cards.map((c) => c.id))
                if (at) act((t, id) => A.fromTray(t, id, at.x, at.y))
              }}
            >
              ⤴ To table
            </button>
          )}
          {!isDeck && free > 0 && (
            <button
              onClick={() => {
                notify(`Back to ${homeNames(selectedStack.cards)}`, true)
                act((t, id) => A.stackToDecks(t, id, 'all', defs))
              }}
            >
              ↩ Return to deck
            </button>
          )}
          {!isDeck && !isPlace && <button onClick={() => setDialog({ kind: 'rename', stackId: selectedStack.id })}>✎ Name</button>}
          <button
            onClick={() =>
              openRules(selectedStack.deck ? DECK_RULES[selectedStack.deck] : isPlace && !isDamage ? DECK_RULES.encounter : cardRule(topCard && defs[topCard.id]))
            }
          >
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
      {dialog?.kind === 'rename' && (
        <RenameDialog
          initial={table.stacks[dialog.stackId]?.label ?? ''}
          onSave={(label) => update((t) => A.renameStack(t, dialog.stackId, label))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'chapter' && (
        <ChapterDialog
          cards={dialog.cardIds ?? table.stacks[dialog.stackId]?.cards.map((c) => c.id) ?? []}
          defs={defs}
          progress={A.storyProgress(table, defs)}
          onPick={(name) => {
            update((t) => A.putUnderChapter(t, dialog.stackId, name, defs, dialog.cardIds))
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'tokens' && (
        // Hidden while a figure is dragged out of it, so the whole table shows.
        <div className={`popover${figureDrag.drag ? ' dragging' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="popover-panel">
            {TOKENS.map((tok) => (
              <button key={tok.label} className="figure-button" {...figureDrag.bind(tok)}>
                <span className={`swatch ${tok.shape}`} style={{ background: tok.color }} /> {tok.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {figureDrag.drag &&
        createPortal(
          <div
            className={`token ${figureDrag.drag.item.shape} figure-ghost`}
            style={{
              left: figureDrag.drag.x,
              top: figureDrag.drag.y,
              width: tokenSize(figureDrag.drag.item),
              height: tokenSize(figureDrag.drag.item),
              transform: `translate(-50%, -50%) scale(${view.scale})`,
              background: figureDrag.drag.item.color,
            }}
          />,
          document.body,
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
            {table.anchors && (
              <button
                onClick={() => {
                  update(A.resetLayout)
                  setDialog(null)
                  notify('Areas packed together again', true)
                }}
              >
                ↺ Reset layout
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
