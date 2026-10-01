import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flipTop, mergeStacks, moveStack, moveToken, settleSpots, stackTargetAt, takeTop } from './actions'
import {
  acceptsText,
  allAreas,
  coveredSide,
  drawOrder,
  ENEMY_COLS,
  enemyOrigin,
  fanHasPlace,
  fanRow,
  placement,
  SPOTS,
  spotPlaces,
  stacksOnSpot,
  turnedSpot,
  type Area,
  type Side,
} from './areas'
import { CARD_H, CARD_W, cardBox, cardImage, cardLabel, clampScale, isLandscape, landscapeClass, TOKEN_SIZE, turnedClass, type Turn } from './cards'
import { CardGhost } from './CardGhost'
import { update } from './store'
import type { CardDef, CardRef, Stack, StorySlot, Table as TableState, Token, View } from './types'
import { useFlip } from './useFlip'

export type Selection = { kind: 'stack' | 'token'; id: string } | null

/** Places outside the table that accept cards: a sidebar deck, or the sidebar itself. */
export type Zone = { kind: 'deck'; id: string } | { kind: 'dock' }

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
  onZoneHover: (zone: Zone | null, cardIds: string[]) => void
  /** A pile (or its top card) was dropped onto a zone. */
  onZoneDrop: (zone: Zone, stackId: string, whole: boolean) => void
  onClearBattlefield: () => void
  /** A drop was refused because the cards don't belong in that area. */
  onRefuse: (message: string) => void
  /** A tap on the storybook (reveal) or on its revealed cards (put back). */
  onSlotTap: (slot: StorySlot) => void
  /** The ⓘ of an area: open the rules about it. */
  onAreaRules: (areaId: string) => void
}

type Target =
  | { kind: 'stack'; id: string; whole: boolean }
  | { kind: 'slot'; id: string; slot: StorySlot }
  | { kind: 'token'; id: string }
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
    let target: Target = { kind: 'bg' }
    if (tokenEl) target = { kind: 'token', id: tokenEl.dataset.token! }
    else if (stackEl) {
      const id = stackEl.dataset.stack!
      const slot = table.stacks[id]?.slot
      const whole = !!el.closest('[data-grip]') || (table.stacks[id]?.cards.length ?? 0) <= 1
      target = slot ? { kind: 'slot', id, slot } : { kind: 'stack', id, whole }
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
        onZoneHover(zone, (g2.target.whole ? s.cards : s.cards.slice(-1)).map((c) => c.id))
      }
      let area: Drag['area'] = null
      let spot: string | null = null
      let to: Drag['to'] = null
      if (g2.target.kind === 'stack' && !zone) {
        const dest = destination(g2.target, x, y, dropOn)
        dropOn = dest.onto
        if (dest.area) area = { id: dest.area.id, ok: !dest.refused }
        spot = dest.spot?.id ?? null
        to = { x: dest.x, y: dest.y }
      }
      setDrag({ target: g2.target, x, y, dropOn, zone, clientX: e.clientX, clientY: e.clientY, area, spot, to })
    }
  }

  function onTap(target: Target) {
    if (target.kind === 'bg') return onSelect(null)
    if (target.kind === 'slot') return onPickTarget ? onPickTarget(target.id) : props.onSlotTap(target.slot)
    if (target.kind === 'token') return onSelect({ kind: 'token', id: target.id })
    if (onPickTarget) return onPickTarget(target.id)
    const now = Date.now()
    const last = lastTap.current
    if (last && last.id === target.id && now - last.time < DOUBLE_TAP_MS) {
      lastTap.current = null
      const fixed = turnedSpot(table, target.id)
      if (fixed) return props.onRefuse(`The ${fixed.label} card lies face up`)
      update((t) => flipTop(t, target.id))
      return
    }
    lastTap.current = { id: target.id, time: now }
    onSelect({ kind: 'stack', id: target.id })
  }

  /** Where a dragged pile (or its top card) would really land, and why it can't go there. */
  function destination(target: { id: string; whole: boolean }, x: number, y: number, dropOn: string | null) {
    const s = table.stacks[target.id]
    const cards = (target.whole ? s.cards : s.cards.slice(-1)).map((c) => c.id)
    return placement(table, cards, defs, x, y, dropOn, target.whole ? target.id : null)
  }

  function commitDrag(d: Drag) {
    const { target, x, y, dropOn, zone } = d
    if (target.kind === 'token') return update((t) => moveToken(t, target.id, x, y))
    if (target.kind !== 'stack') return
    if (zone) return onZoneDrop(zone, target.id, target.whole)
    const dest = destination(target, x, y, dropOn)
    if (dest.refused) return props.onRefuse(dest.refused)
    const onto = dest.onto
    update((t) => {
      if (target.whole) return onto ? mergeStacks(t, target.id, onto, 'top') : moveStack(t, target.id, dest.x, dest.y)
      const [t2, newId] = takeTop(t, target.id, dest.x, dest.y)
      return onto && newId ? mergeStacks(t2, newId, onto, 'top') : t2
    })
    if (!onto && (target.whole || table.stacks[target.id]?.cards.length === 1)) onSelect({ kind: 'stack', id: target.id })
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
  const fanTo = dragStack?.whole && drag?.to && drag.area?.ok && SPOTS.some((s) => s.fan && s.id === drag.spot) ? drag.to : null
  const shownTable = fanTo && dragStack ? settleSpots(moveStack(table, dragStack.id, fanTo.x, fanTo.y)) : table
  const sliding = new Set(SPOTS.filter((s) => s.fan).flatMap((s) => fanRow(shownTable, s)))
  const covered = new Map(SPOTS.filter((s) => s.under).flatMap((s) => stacksOnSpot(shownTable, s).map((id) => [id, coveredSide(s)])))
  const turned = new Map(SPOTS.flatMap((s) => (s.turn ? stacksOnSpot(shownTable, s).map((id) => [id, s.turn!] as const) : [])))

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
        {allAreas(table).map((area) => (
          <AreaView
            key={area.id}
            area={area}
            state={drag?.area?.id === area.id ? (drag.area.ok ? 'accept' : 'refuse') : null}
            onClear={area.id === 'battlefield' ? props.onClearBattlefield : undefined}
            onRules={() => props.onAreaRules(area.id)}
          />
        ))}
        {table.battlefield && (
          <div
            className="enemy-slots"
            style={{ left: enemyOrigin(table.battlefield).x, top: enemyOrigin(table.battlefield).y, width: ENEMY_COLS * CARD_W }}
          >
            Enemies
          </div>
        )}
        {SPOTS.map((spot) => {
          // A fanned spot shows its next free place, none when full (or, unlimited, closing up).
          const next = spot.fan ? fanRow(shownTable, spot).length : 0
          if (spot.fan && !fanHasPlace(shownTable, spot)) return null
          const at = spotPlaces(spot, next + 1)[next]
          // A covered spot only shows the part beside the card lying on it.
          const side = coveredSide(spot)
          const state = drag?.spot === spot.id ? (drag.area?.ok ? ' accept' : ' refuse') : ''
          const box = cardBox(at.x, at.y, !!spot.landscape)
          const hidden = 1 - (spot.shows ?? 0.5)
          if (side === 'left') box.left += hidden * box.width
          if (side === 'top') box.top += hidden * box.height
          if (side === 'left' || side === 'right') box.width *= 1 - hidden
          if (side === 'top' || side === 'bottom') box.height *= 1 - hidden
          return (
            <div key={spot.id} className={`card-spot${side ? ` covered covered-${side}` : ''}${box.width > box.height ? ' wide' : ''}${Math.min(box.width, box.height) < NARROW_SPOT ? ' narrow' : ''}${state}`} style={box}>
              <span>
                {spot.label}
                {spot.hint && <small>{spot.hint}</small>}
              </span>
            </div>
          )
        })}
        {drawOrder(shownTable).map((id) => {
          const s = shownTable.stacks[id]
          let shown = s
          if (dragStack?.id === id) {
            // A pile moved as a whole is drawn above everything (below).
            if (dragStack.whole) return null
            shown = { ...s, cards: s.cards.slice(0, -1) }
          }
          if (s.slot) return <SlotView key={id} stack={shown} defs={defs} size={imgSize} />
          if (!shown.cards.length) return null
          return (
            <StackView
              key={id}
              stack={shown}
              defs={defs}
              size={imgSize}
              selected={selection?.kind === 'stack' && selection.id === id}
              dropTarget={drag?.dropOn === id}
              lifted={false}
              covered={covered.get(id) ?? null}
              turn={turned.get(id) ?? null}
              sliding={sliding.has(id)}
            />
          )
        })}
        {dragStack?.whole && drag && !ghost && table.stacks[dragStack.id] && (
          <StackView
            stack={{ ...table.stacks[dragStack.id], x: drag.x, y: drag.y }}
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
        {table.tokens.map((tok) => (
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
function SlotView({ stack, defs, size }: { stack: Stack; defs: Record<string, CardDef>; size: 'sm' | 'lg' }) {
  const top = stack.cards[stack.cards.length - 1]
  const depth = Math.min(8, Math.ceil(Math.log2(stack.cards.length + 1)))
  const shadow = Array.from({ length: depth }, (_, i) => `${i + 1}px ${(i + 1) * 1.5}px 0 ${i % 2 ? '#3a2e24' : '#d8cdb8'}`)
  return (
    <div className="stack slot" data-stack={stack.id} style={{ left: stack.x, top: stack.y, width: CARD_W, height: CARD_H }}>
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
  state: 'accept' | 'refuse' | null
  onClear?: () => void
  onRules: () => void
}

function AreaView({ area, state, onClear, onRules }: AreaViewProps) {
  return (
    <div
      className={`area area-${area.id}${state ? ` ${state}` : ''}`}
      style={{ left: area.x, top: area.y, width: area.w, height: area.h }}
    >
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
  /** Lies landscape, face up, turned a quarter to this side by its place (Market Prices). */
  turn?: Turn | null
  /** Lies in a row of Money Cards or Goods, whose cards slide when it rearranges. */
  sliding: boolean
}

function StackView({ stack, defs, size, selected, dropTarget, lifted, covered, turn, sliding }: StackViewProps) {
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
      {count > 1 && (
        <div className="grip" data-grip title="Drag here to move the whole pile">
          ⠿ {count}
        </div>
      )}
      {stack.label && <div className="stack-label">{stack.label}</div>}
    </div>
  )
}

function TokenView({ token, selected }: { token: Token; selected: boolean }) {
  return (
    <div
      className={`token ${token.shape}${selected ? ' selected' : ''}`}
      data-token={token.id}
      style={{ left: token.x, top: token.y, width: TOKEN_SIZE, height: TOKEN_SIZE, background: token.color }}
    />
  )
}
