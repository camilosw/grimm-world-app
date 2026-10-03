import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dropOnto, flipTop, isFixed, liftPile, moveArea, moveStack, moveToken, notHeldBy, pinned, pinnedOnTop, settleSpots, stackTargetAt, storyAt, takeTop, unpinned } from './actions'
import {
  acceptsText,
  allAreas,
  BROWSE_DECKS,
  coveredSide,
  deckPlace,
  drawOrder,
  ENCOUNTER_PLACES,
  encounterPlace,
  ENEMY_COLS,
  enemyOrigin,
  fanHasPlace,
  fanRow,
  freeCovered,
  freePlaces,
  placement,
  placeStack,
  PLACE_BUTTON,
  snapArea,
  splitHalves,
  spotsOf,
  stacksOnSpot,
  facedSpot,
  type Area,
  type Side,
  type Spot,
} from './areas'
import { CARD_H, CARD_W, cardBox, cardImage, cardLabel, clampScale, isLandscape, landscapeClass, tokenSize, turnedClass, type Turn } from './cards'
import { CardGhost } from './CardGhost'
import { DECK_SPECS, deckStack, returnsCards, storySlot, type DeckKind } from './decks'
import { update } from './store'
import type { CardDef, CardRef, Stack, StorySlot, Table as TableState, Token, View } from './types'
import { useFlip } from './useFlip'

export type Selection = { kind: 'stack' | 'token'; id: string } | null

/**
 * Places outside the table that accept cards: a sidebar deck, the sidebar itself, or the right sidebar of cards set
 * aside (before the set-aside pile `before`, else last).
 */
export type Zone = { kind: 'deck'; id: string } | { kind: 'dock' } | { kind: 'tray'; before: string | null }

/** Where cards dragged in from outside the table (sidebar, set-aside cards, Browse panel) would land, to light it up. */
export interface Incoming {
  area: { id: string; ok: boolean } | null
  spot: string | null
  dropOn: string | null
}

interface Props {
  table: TableState
  defs: Record<string, CardDef>
  view: View
  onView: (v: View) => void
  selection: Selection
  onSelect: (s: Selection) => void
  /** When set, the next tap on a pile is handed to this callback instead of selecting. */
  onPickTarget: ((stackId: string) => void) | null
  onInspect: (card: CardRef) => void
  /** Drop zone under a screen point, if any. */
  zoneAt: (clientX: number, clientY: number) => Zone | null
  /** The dragged cards are over a drop zone (or left it: null). */
  onZoneHover: (zone: Zone | null, cardIds: string[], from?: DeckKind) => void
  /** A pile (or its top card) was dropped onto a zone. */
  onZoneDrop: (zone: Zone, stackId: string, whole: boolean) => void
  onClearBattlefield: () => void
  /** A drop was refused because the cards don't belong in that area. */
  onRefuse: (message: string) => void
  /** A tap on the storybook (reveal) or on its revealed cards (put back). */
  onSlotTap: (slot: StorySlot) => void
  /** A table pile (or its top card) was dropped on the face-down storybook. */
  onStoryDrop: (stackId: string, whole: boolean) => void
  /** The ⓘ of an area: open the rules about it. */
  onAreaRules: (areaId: string) => void
  /** The Shuffle button below an Encounter Deck place. */
  onShufflePlace: (stackId: string) => void
  /** The Browse button below a table deck's place (`BROWSE_DECKS`). */
  onBrowseDeck: (stackId: string) => void
  /** The pile shown in the browse panel, if any. */
  browsing: string | null
  /** Cards dragged in from outside the table, while over it. */
  incoming?: Incoming | null
  /** The pile just shuffled, shown shuffling (`n` restarts the animation). */
  shuffled: { id: string; n: number } | null
}

type Target =
  | { kind: 'stack'; id: string; whole: boolean }
  | { kind: 'slot'; id: string; slot: StorySlot }
  | { kind: 'token'; id: string }
  /** An area, dragged by the grip in its header. */
  | { kind: 'area'; id: string }
  | { kind: 'bg' }

type Gesture =
  | { type: 'idle' }
  | { type: 'press'; x: number; y: number; target: Target; timer: number }
  | { type: 'pan'; x: number; y: number }
  | { type: 'pinch'; dist: number; mid: { x: number; y: number }; view: View }
  | { type: 'drag'; target: Target; offX: number; offY: number }

interface Drag {
  target: Target
  x: number
  y: number
  dropOn: string | null
  zone: Zone | null
  /** Screen position, for the floating card shown over the sidebar. */
  clientX: number
  clientY: number
  /** Area under the dragged card and whether it takes the card. */
  area: { id: string; ok: boolean } | null
  /** Spot the card goes to (or is refused from). */
  spot: string | null
  /** Where the card would really land. */
  to: { x: number; y: number } | null
  /** The pointer, in table coordinates (the dragged card lies offset from it, as it was taken). */
  pointer?: { x: number; y: number }
}

/** Below this breadth (world units) a covered place's label is set smaller to fit (Market Prices showing only their price strip). */
const NARROW_SPOT = 70
const TAP_SLOP = 8
const LONG_PRESS_MS = 500
const DOUBLE_TAP_MS = 300

export function TableView(props: Props) {
  const { table, defs, view, onView, selection, onSelect, onPickTarget, onInspect, zoneAt, onZoneHover, onZoneDrop } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture>({ type: 'idle' })
  const lastTap = useRef<{ id: string; time: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  // Latest props for use inside native/async handlers.
  const live = useRef({ table, view, onView, onInspect })
  useLayoutEffect(() => {
    live.current = { table, view, onView, onInspect }
  })

  const toWorld = (x: number, y: number, v = view) => ({ x: (x - v.x) / v.scale, y: (y - v.y) / v.scale })

  const local = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // Wheel zoom (desktop / trackpad) needs a non-passive listener.
  useEffect(() => {
    const el = rootRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { view: v, onView: set } = live.current
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const scale = clampScale(v.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
      const k = scale / v.scale
      set({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k })
    }
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    // Safari pinch gestures would otherwise zoom the whole page.
    el.addEventListener('gesturestart', stop)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', stop)
    }
  }, [])

  function itemPos(target: Target): { x: number; y: number } | null {
    if (target.kind === 'stack') return table.stacks[target.id] ?? null
    if (target.kind === 'token') return table.tokens.find((t) => t.id === target.id) ?? null
    if (target.kind === 'area') return allAreas(table).find((a) => a.id === target.id) ?? null
    return null
  }

  function resetGesture() {
    const g = gesture.current
    if (g.type === 'press') window.clearTimeout(g.timer)
    gesture.current = { type: 'idle' }
  }

  function startPinch() {
    resetGesture()
    setDrag(null)
    const [a, b] = [...pointers.current.values()]
    gesture.current = {
      type: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view,
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // Buttons drawn on the table (battlefield) handle their own clicks.
    if ((e.target as HTMLElement).closest('[data-ui]')) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    try {
      rootRef.current!.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone (e.g. synthetic events); capture is best effort.
    }
    if (pointers.current.size === 2) return startPinch()
    if (pointers.current.size > 2) return

    const el = e.target as HTMLElement
    const stackEl = el.closest<HTMLElement>('[data-stack]')
    const tokenEl = el.closest<HTMLElement>('[data-token]')
    const areaEl = el.closest<HTMLElement>('[data-area-grip]')
    let target: Target = { kind: 'bg' }
    if (areaEl) target = { kind: 'area', id: areaEl.dataset.areaGrip! }
    else if (tokenEl) target = { kind: 'token', id: tokenEl.dataset.token! }
    else if (stackEl) {
      const id = stackEl.dataset.stack!
      const s = table.stacks[id]
      const grip = !!el.closest('[data-grip]')
      // A deck lying on the table stays: dragging it takes its top card. An Encounter Deck place stays too: its grip
      // moves its cards but the time card; so does the Damage Card's, its grip moving the cards under the Damage Card.
      const whole = s?.place ? grip : !s?.deck && (grip || (s?.cards.length ?? 0) <= 1)
      target = s?.slot ? { kind: 'slot', id, slot: s.slot } : { kind: 'stack', id, whole }
    }
    const timer = window.setTimeout(() => {
      // The face-down storybook can't be looked at.
      if (target.kind !== 'stack' && !(target.kind === 'slot' && target.slot === 'story-revealed')) return
      const s = live.current.table.stacks[target.id]
      const top = s?.cards[s.cards.length - 1]
      gesture.current = { type: 'idle' }
      if (top) live.current.onInspect(top)
    }, LONG_PRESS_MS)
    gesture.current = { type: 'press', x: p.x, y: p.y, target, timer }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    const p = local(e)
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, p)
    const g = gesture.current

    if (g.type === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!b) return
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const scale = clampScale((g.view.scale * dist) / g.dist)
      const anchor = toWorld(g.mid.x, g.mid.y, g.view)
      onView({ scale, x: mid.x - anchor.x * scale, y: mid.y - anchor.y * scale })
      return
    }

    if (g.type === 'press') {
      if (Math.hypot(p.x - g.x, p.y - g.y) < TAP_SLOP) return
      window.clearTimeout(g.timer)
      // Only a revealed Y-card may leave the storybook (it goes to the Encounter Bar).
      if (g.target.kind === 'slot') {
        const top = table.stacks[g.target.id]?.cards.at(-1)
        const loose = g.target.slot === 'story-revealed' && top && defs[top.id]?.type !== 'storybook'
        g.target = loose ? { kind: 'stack', id: g.target.id, whole: false } : { kind: 'bg' }
      }
      // A time card alone on its place stays there.
      if (g.target.kind === 'stack' && movedCards(g.target).length === 0) g.target = { kind: 'bg' }
      const pos = itemPos(g.target)
      if (g.target.kind === 'bg' || !pos) {
        gesture.current = { type: 'pan', x: p.x, y: p.y }
      } else {
        const w = toWorld(g.x, g.y)
        gesture.current = { type: 'drag', target: g.target, offX: w.x - pos.x, offY: w.y - pos.y }
      }
    }

    const g2 = gesture.current
    if (g2.type === 'pan') {
      onView({ ...view, x: view.x + p.x - prev.x, y: view.y + p.y - prev.y })
      gesture.current = { type: 'pan', x: p.x, y: p.y }
    } else if (g2.type === 'drag') {
      const w = toWorld(p.x, p.y)
      if (g2.target.kind === 'area') {
        const at = snapArea(table, g2.target.id, w.x - g2.offX, w.y - g2.offY)
        setDrag({ target: g2.target, ...at, dropOn: null, zone: null, clientX: e.clientX, clientY: e.clientY, area: null, spot: null, to: null })
        return
      }
      const x = w.x - g2.offX
      const y = w.y - g2.offY
      let dropOn: string | null = null
      let zone: Zone | null = null
      if (g2.target.kind === 'stack') {
        zone = zoneAt(e.clientX, e.clientY)
        const exclude = g2.target.whole ? g2.target.id : null
        dropOn = zone ? null : (stackTargetAt(table, x + CARD_W / 2, y + CARD_H / 2, exclude)?.id ?? null)
        if (dropOn === g2.target.id) dropOn = null
      }
      if (JSON.stringify(zone) !== JSON.stringify(drag?.zone ?? null) && g2.target.kind === 'stack') {
        const s = table.stacks[g2.target.id]
        // A card taken off a deck doesn't go back to the sidebar (App refuses it), so no deck lights up; but one taken
        // off a deck built during play does, to the deck it came from.
        const cards = s.deck && !returnsCards(s.deck) ? [] : g2.target.whole ? s.cards : pinnedOnTop(s) ? [] : s.cards.slice(-1)
        onZoneHover(zone, cards.map((c) => c.id), s.deck)
      }
      let area: Drag['area'] = null
      let spot: string | null = null
      let to: Drag['to'] = null
      const story = g2.target.kind === 'stack' && !zone ? storyDrop(g2.target, x, y) : undefined
      if (story) {
        dropOn = story.id
        area = { id: 'storybook', ok: true }
      } else if (g2.target.kind === 'stack' && !zone) {
        const dest = destination(g2.target, x, y, dropOn, w)
        dropOn = dest.onto
        if (dest.area) area = { id: dest.area.id, ok: !dest.refused }
        spot = dest.spot?.id ?? null
        to = { x: dest.x, y: dest.y }
      }
      setDrag({ target: g2.target, x, y, dropOn, zone, clientX: e.clientX, clientY: e.clientY, area, spot, to, pointer: w })
    }
  }

  function onTap(target: Target) {
    if (target.kind === 'area') return
    if (target.kind === 'bg') return onSelect(null)
    if (target.kind === 'slot') return onPickTarget ? onPickTarget(target.id) : props.onSlotTap(target.slot)
    if (target.kind === 'token') return onSelect({ kind: 'token', id: target.id })
    if (onPickTarget) return onPickTarget(target.id)
    const now = Date.now()
    const last = lastTap.current
    if (last && last.id === target.id && now - last.time < DOUBLE_TAP_MS) {
      lastTap.current = null
      const fixed = facedSpot(table, target.id)
      if (fixed) return props.onRefuse(`Cards on the ${fixed.label} place lie face ${fixed.faceDown ? 'down' : 'up'}`)
      update((t) => flipTop(t, target.id))
      return
    }
    lastTap.current = { id: target.id, time: now }
    onSelect({ kind: 'stack', id: target.id })
  }

  /**
   * The face-down storybook, if the dragged pile (or its top card) is dropped on it and may go into it: the cards then
   * go under one of its cards (App asks which). Other cards (an Encounter Card for its place below) land as usual.
   */
  function storyDrop(target: { id: string; whole: boolean }, x: number, y: number) {
    if (!storyAt(table, x + CARD_W / 2, y + CARD_H / 2)) return undefined
    return notHeldBy(table, target.id, 'storybook', defs, movedCards(target)).length ? undefined : storySlot(table, 'story')
  }

  /** The cards a drag moves: the whole pile (but its pinned cards), or its top card (none, when that is pinned). */
  function movedCards(target: { id: string; whole: boolean }) {
    const s = table.stacks[target.id]
    if (!s) return []
    const free = unpinned(s)
    const cards = target.whole ? free : pinnedOnTop(s) ? [] : free.slice(-1)
    return cards.map((c) => c.id)
  }

  /** Where a dragged pile (or its top card) would really land, and why it can't go there. */
  function destination(target: { id: string; whole: boolean }, x: number, y: number, dropOn: string | null, pointer?: { x: number; y: number }) {
    // A fixed pile (an Encounter Deck place) stays: its cards leave it as a new pile.
    const moving = target.whole && !isFixed(table.stacks[target.id]) ? target.id : null
    return placement(table, movedCards(target), defs, x, y, dropOn, moving, pointer)
  }

  function commitDrag(d: Drag) {
    const { target, x, y, dropOn, zone } = d
    if (target.kind === 'token') return update((t) => moveToken(t, target.id, x, y))
    if (target.kind === 'area') return update((t) => moveArea(t, target.id, x, y))
    if (target.kind !== 'stack') return
    if (zone) return onZoneDrop(zone, target.id, target.whole)
    if (dropOn && table.stacks[dropOn]?.slot === 'story') return props.onStoryDrop(target.id, target.whole)
    const dest = destination(target, x, y, dropOn, d.pointer)
    if (dest.refused) return props.onRefuse(dest.refused)
    const onto = dest.onto
    // Put back where it came from (a card dropped back on its deck).
    if (onto === target.id) return
    update((t) => {
      if (target.whole && !isFixed(t.stacks[target.id])) return onto ? dropOnto(t, target.id, onto, defs) : moveStack(t, target.id, dest.x, dest.y)
      const [t2, newId] = target.whole ? liftPile(t, target.id, dest.x, dest.y) : takeTop(t, target.id, dest.x, dest.y)
      return onto && newId ? dropOnto(t2, newId, onto, defs) : t2
    })
    const source = table.stacks[target.id]
    if (!onto && !isFixed(source) && (target.whole || source.cards.length === 1)) onSelect({ kind: 'stack', id: target.id })
    else if (onto) onSelect({ kind: 'stack', id: onto })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    if (g.type === 'press') {
      window.clearTimeout(g.timer)
      onTap(g.target)
    } else if (g.type === 'drag' && drag) {
      commitDrag(drag)
    }
    if (drag?.zone) onZoneHover(null, [])
    setDrag(null)
    // After a pinch, wait until all fingers are lifted before starting anything new.
    gesture.current = { type: 'idle' }
  }

  function onPointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    resetGesture()
    if (drag?.zone) onZoneHover(null, [])
    setDrag(null)
  }

  const dpr = window.devicePixelRatio || 1
  const imgSize: 'sm' | 'lg' = view.scale * CARD_W * dpr > 330 ? 'lg' : 'sm'
  const dragStack = drag?.target.kind === 'stack' ? drag.target : null
  const liftedFrom = dragStack && !dragStack.whole ? table.stacks[dragStack.id] : null
  // Over the sidebar the table can't show the card, so it floats above everything.
  const ghost = drag?.zone && dragStack ? table.stacks[dragStack.id]?.cards.at(-1) : null
  // While a card is dragged along a row of Money Cards, the others make room for it.
  const fanTo = dragStack?.whole && drag?.to && drag.area?.ok && spotsOf(table).some((s) => s.fan && s.id === drag.spot) ? drag.to : null
  // While an area is dragged, the table shows it (and the areas it pushes aside) where it would go.
  const movingArea = drag?.target.kind === 'area' ? drag.target.id : null
  const areaPreview = useMemo(
    () => (movingArea && drag ? moveArea(table, movingArea, drag.x, drag.y) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only where the area is dropped matters, not the rest of the drag
    [table, movingArea, drag?.x, drag?.y],
  )
  const shownTable = areaPreview ?? (fanTo && dragStack ? settleSpots(moveStack(table, dragStack.id, fanTo.x, fanTo.y)) : table)
  const spots = spotsOf(shownTable)
  // What a drag lights up: a drag on the table, else cards dragged in from outside it.
  const hl: Incoming | null = drag ?? props.incoming ?? null
  const sliding = new Set(spots.filter((s) => s.fan).flatMap((s) => fanRow(shownTable, s)))
  const covered = new Map(spots.filter((s) => s.under).flatMap((s) => stacksOnSpot(shownTable, s).map((id) => [id, coveredSide(s)])))
  const turned = new Map(spots.flatMap((s) => (s.turn ? stacksOnSpot(shownTable, s).map((id) => [id, s.turn!] as const) : [])))

  /** A spot's placeholders: its free place(s), only the part showing beside a card covering it. */
  const placeholders = (spot: Spot) => {
    // A fanned spot shows its next free place, none when full. The Encounter Bar: left of its cards, and once it
    // has cards, also right of its last one.
    // A row sharing a split placeholder shows no free place of its own: the split one takes its cards, beyond both rows
    // (Titles | Skills above the Character Card, Items over Money right of the Storage Card), all of it once the other
    // row is full.
    if (spots.some((s) => s.split && s.after === spot.id)) return []
    if (spot.split) {
      const halves = splitHalves(shownTable, spot)
      const side = freeCovered(shownTable, spot)
      const across = side === 'top' || side === 'bottom'
      return halves.map((half, i) => {
        const state = hl?.spot === half.spot.id ? (hl.area?.ok ? ' accept' : ' refuse') : ''
        const pos = halves.length === 1 ? 'whole' : across ? (i ? 'right' : 'left') : i ? 'bottom' : 'top'
        return (
          <div
            key={`${spot.id}-${i}`}
            className={`card-spot covered covered-${side} split-${pos}${state}`}
            style={{ left: half.x, top: half.y, width: half.w, height: half.h }}
          >
            <span>
              {half.spot.label}
              {half.spot.hint && <small>{half.spot.hint}</small>}
            </span>
          </div>
        )
      })
    }
    if (spot.fan && !fanHasPlace(shownTable, spot)) return []
    const row = spot.addsFirst ? fanRow(shownTable, spot) : []
    // Where the dragged card goes: after the row's last card (not counting the card itself), else before its first.
    // Taken from the table itself: the preview spreads a dragged pile out into cards that aren't on it.
    const others = spot.addsFirst ? fanRow(table, spot).filter((id) => id !== dragStack?.id) : []
    const toEnd = !!drag?.to && others.length > 0 && drag.to.x > table.stacks[others[others.length - 1]].x
    return freePlaces(shownTable, spot).map((at, i) => {
      const end = i > 0
      // A covered spot only shows the part beside the card lying on it. The Encounter Bar's free place lies under
      // its first card, though the cards put there go on top; its place after the last card lies under that card. So
      // does the hand's place after its last card, though the card put there goes on top.
      const side = end ? 'left' : row.length ? 'right' : freeCovered(shownTable, spot)
      const hover = hl?.spot === spot.id && (!spot.addsFirst || end === toEnd)
      const state = hover ? (hl.area?.ok ? ' accept' : ' refuse') : ''
      const box = cardBox(at.x, at.y, !!spot.landscape)
      const hidden = 1 - (spot.shows ?? 0.5)
      if (side === 'left') box.left += hidden * box.width
      if (side === 'top') box.top += hidden * box.height
      if (side === 'left' || side === 'right') box.width *= 1 - hidden
      if (side === 'top' || side === 'bottom') box.height *= 1 - hidden
      return (
        <div key={end ? `${spot.id}-end` : spot.id} className={`card-spot${side ? ` covered covered-${side}` : ''}${box.width > box.height ? ' wide' : ''}${Math.min(box.width, box.height) < NARROW_SPOT ? ' narrow' : ''}${state}`} style={box}>
          <span>
            {spot.label}
            {spot.hint && <small>{spot.hint}</small>}
          </span>
        </div>
      )
    })
  }

  return (
    <div
      ref={rootRef}
      className={`table${onPickTarget ? ' picking' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {allAreas(shownTable).map((area) => (
          <AreaView
            key={area.id}
            area={area}
            state={movingArea === area.id ? 'moving' : hl?.area?.id === area.id ? (hl.area.ok ? 'accept' : 'refuse') : null}
            onClear={area.id === 'battlefield' ? props.onClearBattlefield : undefined}
            onRules={() => props.onAreaRules(area.id)}
          />
        ))}
        {shownTable.battlefield && (
          <div
            className="enemy-slots"
            style={{ left: enemyOrigin(shownTable.battlefield).x, top: enemyOrigin(shownTable.battlefield).y, width: ENEMY_COLS * CARD_W }}
          >
            Enemies
          </div>
        )}
        {spots.flatMap(placeholders)}
        {allAreas(shownTable).flatMap((area) => {
          // The Encounter Deck area's places, shown while empty (their piles cover them), with a Shuffle button below each
          // time card's (it stays at the bottom).
          if (area.id === 'encounter')
            return ENCOUNTER_PLACES.flatMap(({ place, label, hint }) => {
              const at = encounterPlace(shownTable, place)
              const s = placeStack(shownTable, place)
              const state = s && hl?.dropOn === s.id ? (hl.area?.ok ? ' accept' : ' refuse') : ''
              const spot = (
                <div key={`place-${place}`} className={`card-spot${state}`} style={cardBox(at.x, at.y, false)}>
                  <span>
                    {label}
                    {hint && <small>{hint}</small>}
                  </span>
                </div>
              )
              if (!s || !pinned(s)) return [spot]
              return [
                spot,
                <button
                  key={`shuffle-${place}`}
                  className="place-button"
                  data-ui
                  disabled={s.cards.length - pinned(s) < 2}
                  onClick={() => props.onShufflePlace(s.id)}
                  style={{ left: at.x, top: at.y + CARD_H + PLACE_BUTTON.gap, width: CARD_W, height: PLACE_BUTTON.h }}
                >
                  ⤮ Shuffle
                </button>,
              ]
            })
          // The place of a deck lying on the table, shown while it is empty (its pile covers it), with a Browse button
          // below the Training Deck's (`BROWSE_DECKS`).
          if (!area.deck) return []
          const spec = DECK_SPECS[area.deck]
          const state = hl?.area?.id === area.id ? (hl.area.ok ? ' accept' : ' refuse') : ''
          const at = deckPlace(shownTable, area.deck)
          const s = deckStack(shownTable, area.deck)
          const spot = (
            <div key={`deck-${area.id}`} className={`card-spot${state}`} style={cardBox(at.x, at.y, false)}>
              <span>
                {spec.label}
                {spec.emptyHint && <small>{spec.emptyHint}</small>}
              </span>
            </div>
          )
          if (!s || !BROWSE_DECKS.includes(area.deck)) return [spot]
          return [
            spot,
            <button
              key={`browse-${area.id}`}
              className={`place-button${props.browsing === s.id ? ' on' : ''}`}
              data-ui
              disabled={!unpinned(s).length}
              onClick={() => props.onBrowseDeck(s.id)}
              style={{ left: at.x, top: at.y + CARD_H + PLACE_BUTTON.gap, width: CARD_W, height: PLACE_BUTTON.h }}
            >
              ☰ Browse
            </button>,
          ]
        })}
        {drawOrder(shownTable).map((id) => {
          const s = shownTable.stacks[id]
          let shown = s
          if (dragStack?.id === id) {
            // A pile moved as a whole is drawn above everything (below); a fixed one leaves its pinned cards.
            if (dragStack.whole && !isFixed(s)) return null
            shown = { ...s, cards: dragStack.whole ? s.cards.filter((c) => !unpinned(s).includes(c)) : s.cards.slice(0, -1) }
          }
          if (s.slot) return <SlotView key={id} stack={shown} defs={defs} size={imgSize} dropTarget={hl?.dropOn === id} />
          if (!shown.cards.length) return null
          return (
            <StackView
              key={id}
              stack={shown}
              defs={defs}
              size={imgSize}
              selected={selection?.kind === 'stack' && selection.id === id}
              dropTarget={hl?.dropOn === id}
              lifted={false}
              covered={covered.get(id) ?? null}
              turn={turned.get(id) ?? null}
              sliding={sliding.has(id)}
              fixed={!!s.deck && !s.place}
              shuffle={props.shuffled?.id === id ? props.shuffled.n : null}
            />
          )
        })}
        {dragStack?.whole && drag && !ghost && table.stacks[dragStack.id] && (
          <StackView
            stack={{ ...table.stacks[dragStack.id], x: drag.x, y: drag.y, cards: unpinned(table.stacks[dragStack.id]) }}
            defs={defs}
            size={imgSize}
            selected={selection?.kind === 'stack' && selection.id === dragStack.id}
            dropTarget={false}
            lifted
            covered={null}
            sliding={false}
          />
        )}
        {liftedFrom && drag && !ghost && (
          <StackView
            stack={{ ...liftedFrom, id: 'lifted', x: drag.x, y: drag.y, cards: liftedFrom.cards.slice(-1), label: undefined }}
            defs={defs}
            size={imgSize}
            selected={false}
            dropTarget={false}
            lifted
            covered={null}
            sliding={false}
          />
        )}
        {shownTable.tokens.map((tok) => (
          <TokenView
            key={tok.id}
            token={drag?.target.kind === 'token' && drag.target.id === tok.id ? { ...tok, x: drag.x, y: drag.y } : tok}
            selected={selection?.kind === 'token' && selection.id === tok.id}
          />
        ))}
      </div>
      {ghost && drag && (
        <CardGhost src={cardImage(ghost.id, ghost.faceUp, 'sm')} x={drag.clientX} y={drag.clientY} frame={landscapeClass(isLandscape(defs[ghost.id]), ghost.faceUp)} />
      )}
    </div>
  )
}

/** One of the storybook's two fixed places. */
function SlotView({ stack, defs, size, dropTarget }: { stack: Stack; defs: Record<string, CardDef>; size: 'sm' | 'lg'; dropTarget: boolean }) {
  const top = stack.cards[stack.cards.length - 1]
  const depth = Math.min(8, Math.ceil(Math.log2(stack.cards.length + 1)))
  const shadow = Array.from({ length: depth }, (_, i) => `${i + 1}px ${(i + 1) * 1.5}px 0 ${i % 2 ? '#3a2e24' : '#d8cdb8'}`)
  return (
    <div className={`stack slot${dropTarget ? ' drop-target' : ''}`} data-stack={stack.id} style={{ left: stack.x, top: stack.y, width: CARD_W, height: CARD_H }}>
      {top ? (
        <div className="card" style={{ boxShadow: [...shadow, '0 4px 10px rgba(0,0,0,.45)'].join(', ') }}>
          <img src={cardImage(top.id, top.faceUp, size)} alt={top.faceUp ? cardLabel(defs[top.id]) : 'Storybook'} draggable={false} />
        </div>
      ) : (
        <div className="slot-empty">{stack.slot === 'story' ? 'The story is over' : 'Tap the storybook to turn over its next card'}</div>
      )}
      {stack.cards.length > 1 && <div className="slot-count">{stack.cards.length}</div>}
    </div>
  )
}

interface AreaViewProps {
  area: Area
  /** Cards dragged over it are taken or refused; or it is being moved. */
  state: 'accept' | 'refuse' | 'moving' | null
  onClear?: () => void
  onRules: () => void
}

function AreaView({ area, state, onClear, onRules }: AreaViewProps) {
  return (
    <div
      className={`area area-${area.id}${area.deck ? ' area-deck' : ''}${state ? ` ${state}` : ''}`}
      style={{ left: area.x, top: area.y, width: area.w, height: area.h }}
    >
      <div className="area-grip" data-area-grip={area.id} title="Drag here to move the area">
        ⠿
      </div>
      <div className="area-header">
        <span>
          {area.id === 'battlefield' ? '⚔ ' : ''}
          {area.label}
          <button className="area-info" data-ui onClick={onRules} aria-label={`Rules: ${area.label}`}>
            ⓘ
          </button>
          {acceptsText(area) !== area.label && <small>{acceptsText(area)}</small>}
        </span>
        {onClear && (
          <button data-ui onClick={onClear}>
            ↩ Return to deck
          </button>
        )}
      </div>
    </div>
  )
}

interface StackViewProps {
  stack: Stack
  defs: Record<string, CardDef>
  size: 'sm' | 'lg'
  selected: boolean
  dropTarget: boolean
  lifted: boolean
  /** Part of it lies under another card (the Alignment Card under the Character Card, Money and Goods under the Storage Card). */
  covered: Side | null
  /** Lies landscape, turned a quarter to this side by its place (Market Prices face up, the Encounter Bar face down). */
  turn?: Turn | null
  /** Lies in a row of Money Cards or Goods, whose cards slide when it rearranges. */
  sliding: boolean
  /** A deck lying on its place in its area, named by it: it shows how many cards it holds but can't be moved as a whole. */
  fixed?: boolean
  /** Set while the pile shows being shuffled; a new value restarts it. */
  shuffle?: number | null
}

/** Most cards shown splitting and sliding back together while a pile is shuffled. */
const SHUFFLE_CARDS = 4

function StackView({ stack, defs, size, selected, dropTarget, lifted, covered, turn, sliding, fixed, shuffle }: StackViewProps) {
  const top = stack.cards[stack.cards.length - 1]
  const count = stack.cards.length
  const landscape = isLandscape(defs[top.id]) || !!turn
  const cardRef = useRef<HTMLDivElement>(null)
  const faceUp = useFlip(cardRef, top, landscape ? 'x' : 'y')
  const depth = Math.min(8, Math.ceil(Math.log2(count + 1)))
  const shadow = Array.from({ length: depth }, (_, i) => `${i + 1}px ${(i + 1) * 1.5}px 0 ${i % 2 ? '#3a2e24' : '#d8cdb8'}`)
  const classes = ['stack', selected && 'selected', dropTarget && 'drop-target', lifted && 'lifted', covered && `covered-${covered}`, sliding && 'sliding']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} data-stack={stack.id} style={cardBox(stack.x, stack.y, landscape)}>
      <div
        ref={cardRef}
        className={`card${turn ? turnedClass(turn) : landscapeClass(landscape, faceUp)}`}
        style={{
          rotate: landscape ? undefined : `${stack.rot}deg`,
          boxShadow: [...shadow, lifted ? '0 18px 30px rgba(0,0,0,.55)' : '0 4px 10px rgba(0,0,0,.45)'].join(', '),
        }}
      >
        <img src={cardImage(top.id, faceUp, size)} alt={cardLabel(defs[top.id])} draggable={false} />
      </div>
      {/* Being shuffled: its top cards (not a pinned card) split to both sides and slide back in, one after another. */}
      {shuffle != null &&
        unpinned(stack).slice(-SHUFFLE_CARDS).map((c, i) => (
          <div
            key={`${shuffle}-${i}`}
            className={`card shuffle-card${i % 2 ? ' right' : ''}${turn ? turnedClass(turn) : landscapeClass(landscape, c.faceUp)}`}
            style={{ rotate: landscape ? undefined : `${stack.rot}deg`, animationDelay: `${i * 60}ms` }}
            aria-hidden
          >
            <img src={cardImage(c.id, c.faceUp, size)} alt="" draggable={false} />
          </div>
        ))}
      {fixed ? (
        count > 1 && <div className="slot-count">{count}</div>
      ) : (
        count > 1 && (
          <div className="grip" data-grip title="Drag here to move the whole pile">
            ⠿ {count}
          </div>
        )
      )}
      {stack.label && !fixed && !stack.place && <div className="stack-label">{stack.label}</div>}
    </div>
  )
}

function TokenView({ token, selected }: { token: Token; selected: boolean }) {
  return (
    <div
      className={`token ${token.shape}${selected ? ' selected' : ''}`}
      data-token={token.id}
      style={{ left: token.x, top: token.y, width: tokenSize(token), height: tokenSize(token), background: token.color }}
    />
  )
}
