import { allAreas, anchorsAfterMove, AREA_HEADER, AREA_PAD, areaForCard, fanRow, settleLayout, slidesUnder, spotPlace, spotPlaces, spotsOf, stacksOnSpot, turnedSpot, upsideDownSpot } from './areas'
import { CARD_H, CARD_W, compareCards, family, isLandscape, TOKEN_SIZE } from './cards'
import { DECK_SPECS, deckStack, homeDeck, storySlot, type DeckKind } from './decks'
import type { CardDef, CardRef, Rotation, Stack, Table, Token } from './types'

// Pure table transformations. Each returns a new Table (or the same one when
// nothing changes) so they can be passed straight to store.update().

function newId(t: Table, prefix: string): [string, number] {
  return [`${prefix}${t.nextId}`, t.nextId + 1]
}

function setStack(t: Table, s: Stack): Table {
  return { ...t, stacks: { ...t.stacks, [s.id]: s } }
}

function removeStack(t: Table, id: string): Table {
  const stacks = { ...t.stacks }
  delete stacks[id]
  return { ...t, stacks, z: t.z.filter((z) => z !== id), dock: t.dock?.filter((d) => d !== id) }
}

export function isDocked(t: Table, id: string): boolean {
  return !!t.dock?.includes(id)
}

/**
 * A deck (in the sidebar or on the table), a storybook place, an Encounter Deck place or the Damage Card's: it stays where
 * it is, even when empty.
 */
export function isFixed(s: Stack): boolean {
  return !!s.deck || !!s.slot || !!s.place
}

/**
 * How many cards at the bottom of a pile never leave it: the 'Time Passes' or 'Next Chapter' card on its place. They
 * can't be taken, and shuffling, sorting or adding cards underneath leaves them at the bottom.
 */
export function pinned(s: Stack): number {
  return (s.place === 'time-passes' || s.place === 'next-chapter') && s.cards.length ? 1 : 0
}

/**
 * How many cards at the top of a pile never leave it: the Damage Card on its place. The cards under it can (they go
 * back to the hand once healed), but dragging the pile doesn't take them, nor does drawing; its grip moves them all.
 */
export function pinnedOnTop(s: Stack): number {
  return s.place === 'damage' && s.cards.length ? 1 : 0
}

/** Whether the card at `index` (bottom = 0) is pinned to its pile. */
function isPinned(s: Stack, index: number): boolean {
  return index < pinned(s) || index >= s.cards.length - pinnedOnTop(s)
}

/** The cards of a pile that may leave it: all but its pinned ones, in pile order. */
export function unpinned(s: Stack): CardRef[] {
  return s.cards.filter((_, i) => !isPinned(s, i))
}

/** A pile's cards with `fn` applied to those between its pinned ones. */
function abovePinned(s: Stack, fn: (cards: CardRef[]) => CardRef[]): CardRef[] {
  const lo = pinned(s)
  const hi = s.cards.length - pinnedOnTop(s)
  return [...s.cards.slice(0, lo), ...fn(s.cards.slice(lo, hi)), ...s.cards.slice(hi)]
}

/** A pile's cards with `cards` slid underneath, just above its pinned ones. */
function underneath(s: Stack, cards: CardRef[]): CardRef[] {
  return abovePinned(s, (rest) => [...cards, ...rest])
}

/** Every stack, on the table or in the sidebar. */
function allStacks(t: Table): Stack[] {
  return [...t.z, ...(t.dock ?? [])].map((id) => t.stacks[id])
}

/** Put cards on the table as a new stack (on top of everything). */
export function addStack(t: Table, x: number, y: number, cards: CardRef[], extra: Partial<Stack> = {}): [Table, string] {
  const [id, nextId] = newId(t, 's')
  const stack: Stack = { id, x, y, rot: 0, cards, ...extra }
  return [{ ...t, nextId, stacks: { ...t.stacks, [id]: stack }, z: [...t.z, id] }, id]
}

/**
 * Replace a stack's cards. A pile on the table disappears when it becomes
 * empty; a deck stays as an empty slot so cards can go back into it.
 */
function withCards(t: Table, s: Stack, cards: CardRef[]): Table {
  let next = t
  // Remember which deck the cards came out of, so they can find their way back.
  if (s.deck && !s.slot) {
    const kept = new Set(cards.map((c) => c.id))
    const left = s.cards.filter((c) => !kept.has(c.id))
    if (left.length) next = { ...t, origin: { ...t.origin, ...Object.fromEntries(left.map((c) => [c.id, s.deck!])) } }
  }
  return cards.length || isFixed(s) ? setStack(next, { ...s, cards }) : removeStack(next, s.id)
}


export function moveStack(t: Table, id: string, x: number, y: number): Table {
  const s = t.stacks[id]
  if (!s || isFixed(s) || (s.x === x && s.y === y)) return t
  return bringToFront(setStack(t, { ...s, x, y }), id)
}

/** Lift the top card off a stack and drop it at (x, y) as its own stack. */
export function takeTop(t: Table, id: string, x: number, y: number): [Table, string | null] {
  const s = t.stacks[id]
  if (!s || s.cards.length <= pinned(s) || pinnedOnTop(s)) return [t, null]
  if (s.cards.length === 1 && !isFixed(s)) return [moveStack(t, id, x, y), id]
  const top = s.cards[s.cards.length - 1]
  return addStack(withCards(t, s, s.cards.slice(0, -1)), x, y, [top], { rot: s.rot })
}

/**
 * Move a whole pile to (x, y). A fixed one (an Encounter Deck place, the Damage Card's) stays: its unpinned cards move, as a
 * new pile. Returns the moved pile's id (null: nothing to move).
 */
export function liftPile(t: Table, id: string, x: number, y: number): [Table, string | null] {
  const s = t.stacks[id]
  if (!s) return [t, null]
  if (!isFixed(s)) return [moveStack(t, id, x, y), id]
  const moved = unpinned(s)
  if (!moved.length) return [t, null]
  return addStack(withCards(t, s, s.cards.filter((_, i) => isPinned(s, i))), x, y, moved, { rot: s.rot })
}

/**
 * Put a pile on top of another (under it, on the Damage Card's place), or into a deck lying on the table at the place
 * its rules say (`insertIntoDeck()`: on top of the Quest Deck, under the Enemy, Training and Banned Cards).
 */
export function dropOnto(t: Table, sourceId: string, targetId: string, defs: Record<string, CardDef>): Table {
  const dst = t.stacks[targetId]
  if (!dst?.deck || sourceId === targetId) return mergeStacks(t, sourceId, targetId, slidesUnder(t, targetId) ? 'bottom' : 'top')
  const [t2, cards] = takeCards(t, sourceId)
  return insertIntoDeck(t2, t2.stacks[targetId], cards, defs)
}

/** Move all cards of `sourceId` (but its pinned ones) onto (or under) `targetId`. */
export function mergeStacks(t: Table, sourceId: string, targetId: string, where: 'top' | 'bottom'): Table {
  if (!t.stacks[sourceId] || !t.stacks[targetId] || sourceId === targetId) return t
  const [t2, moved] = takeCards(t, sourceId)
  const dst = t2.stacks[targetId]
  if (!moved.length) return t
  if (where === 'top') return setStack(t2, { ...dst, cards: [...dst.cards, ...moved] })
  // Cards slid under a pile take on the facing of that pile's bottom card (above its pinned ones).
  const faceUp = dst.cards[pinned(dst)]?.faceUp ?? moved[0].faceUp
  return setStack(t2, { ...dst, cards: underneath(dst, moved.map((c) => ({ ...c, faceUp }))) })
}

/** Turn the top card over; a card lying turned on its place stays as it lies (Market Prices face up, the Encounter Bar face down). */
export function flipTop(t: Table, id: string): Table {
  const s = t.stacks[id]
  if (!s?.cards.length || turnedSpot(t, id)) return t
  const cards = [...s.cards]
  const top = cards[cards.length - 1]
  cards[cards.length - 1] = { ...top, faceUp: !top.faceUp }
  return setStack(t, { ...s, cards })
}

/** Turn the whole pile over, like flipping a real deck (but its pinned cards). */
export function flipStack(t: Table, id: string): Table {
  const s = t.stacks[id]
  if (!s || !unpinned(s).length || turnedSpot(t, id)) return t
  return setStack(t, { ...s, cards: abovePinned(s, (cards) => cards.map((c) => ({ ...c, faceUp: !c.faceUp })).reverse()) })
}

/**
 * Turn a pile on the table; a Region Card in it never turns, nor a card lying turned on its place (Market Prices,
 * Encounter Bar) or upside down on it (Actions area).
 */
export function rotateStack(t: Table, id: string, delta: number, defs: Record<string, CardDef>): Table {
  const s = t.stacks[id]
  if (!s || s.cards.some((c) => isLandscape(defs[c.id])) || turnedSpot(t, id) || upsideDownSpot(t, id)) return t
  return setStack(t, { ...s, rot: ((((s.rot + delta) % 360) + 360) % 360) as Rotation })
}

/** Whether a pile has at least two cards to reorder (between its pinned ones). */
function reorders(s: Stack | undefined): s is Stack {
  return !!s && unpinned(s).length >= 2
}

export function shuffleStack(t: Table, id: string): Table {
  const s = t.stacks[id]
  if (!reorders(s)) return t
  const cards = abovePinned(s, (rest) => {
    const out = [...rest]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  })
  return setStack(t, { ...s, cards })
}

export function sortStack(t: Table, id: string, defs: Record<string, CardDef>): Table {
  const s = t.stacks[id]
  if (!reorders(s)) return t
  // Top of the pile (end of the array) holds the lowest number.
  const cards = abovePinned(s, (rest) => [...rest].sort((a, b) => compareCards(defs[b.id], defs[a.id])))
  return setStack(t, { ...s, cards })
}

/** Place the top card at the bottom of the pile, above its pinned cards (e.g. after reading a Fate Number). */
export function topToBottom(t: Table, id: string): Table {
  const s = t.stacks[id]
  if (!reorders(s) || pinnedOnTop(s)) return t
  const top = s.cards[s.cards.length - 1]
  return setStack(t, { ...s, cards: underneath({ ...s, cards: s.cards.slice(0, -1) }, [{ ...top, faceUp: s.cards[pinned(s)].faceUp }]) })
}

/**
 * Draw the top card face up next to the pile (onto a pile already lying there).
 * Decks draw to `at` instead.
 */
export function drawTop(t: Table, id: string, at?: { x: number; y: number }): Table {
  const s = t.stacks[id]
  if (!s || pinnedOnTop(s) || s.cards.length - pinned(s) < (isFixed(s) ? 1 : 2)) return t
  const x = at?.x ?? s.x + CARD_W + 40
  const y = at?.y ?? s.y
  const top = { ...s.cards[s.cards.length - 1], faceUp: true }
  const t2 = withCards(t, s, s.cards.slice(0, -1))
  const there = t2.z.map((z) => t2.stacks[z]).find((o) => o.x === x && o.y === y)
  if (there) return setStack(t2, { ...there, cards: [...there.cards, top] })
  return addStack(t2, x, y, [top], { rot: s.rot })[0]
}

/** Pull one card (by index, bottom = 0) out of a pile onto the table. */
export function extractCard(t: Table, id: string, index: number, x: number, y: number, faceUp = true): Table {
  const s = t.stacks[id]
  if (!s || !s.cards[index] || isPinned(s, index)) return t
  const card = { ...s.cards[index], faceUp }
  const rest = s.cards.filter((_, i) => i !== index)
  return addStack(withCards(t, s, rest), x, y, [card])[0]
}

/**
 * Pull cards (by index, bottom = 0) out of a pile, face up and in their pile
 * order, onto the table at (x, y) or onto the pile `ontoId` (into a table deck:
 * `dropOnto()`); onto their own pile they move to its top.
 */
export function playCards(
  t: Table,
  id: string,
  indices: number[],
  x: number,
  y: number,
  ontoId: string | null,
  defs: Record<string, CardDef>,
): Table {
  const s = t.stacks[id]
  if (!s) return t
  const set = new Set(indices.filter((i) => !isPinned(s, i)))
  const picked = s.cards.filter((_, i) => set.has(i)).map((c) => ({ ...c, faceUp: true }))
  if (!picked.length) return t
  const rest = s.cards.filter((_, i) => !set.has(i))
  if (ontoId === id) return setStack(t, { ...s, cards: [...rest, ...picked] })
  const [t2, newId] = addStack(withCards(t, s, rest), x, y, picked)
  return ontoId && t2.stacks[ontoId] ? dropOnto(t2, newId, ontoId, defs) : t2
}

export function bringToFront(t: Table, id: string): Table {
  if (!t.z.includes(id) || t.z[t.z.length - 1] === id) return t
  return { ...t, z: [...t.z.filter((z) => z !== id), id] }
}

export function sendToBack(t: Table, id: string): Table {
  if (!t.z.includes(id) || t.z[0] === id) return t
  return { ...t, z: [id, ...t.z.filter((z) => z !== id)] }
}

export function renameStack(t: Table, id: string, label: string): Table {
  const s = t.stacks[id]
  if (!s) return t
  return setStack(t, { ...s, label: label.trim() || undefined })
}

/** Find which stack holds a card, and where. */
export function locateCard(t: Table, cardId: string): { stack: Stack; index: number } | null {
  for (const stack of allStacks(t)) {
    const index = stack.cards.findIndex((c) => c.id === cardId)
    if (index >= 0) return { stack, index }
  }
  return null
}

export function addToken(t: Table, x: number, y: number, color: string, shape: Token['shape']): Table {
  const [id, nextId] = newId(t, 't')
  return { ...t, nextId, tokens: [...t.tokens, { id, x, y, color, shape }] }
}

export function moveToken(t: Table, id: string, x: number, y: number): Table {
  const tok = t.tokens.find((k) => k.id === id)
  if (!tok || (tok.x === x && tok.y === y)) return t
  // Moved token goes last so it renders on top.
  return { ...t, tokens: [...t.tokens.filter((k) => k.id !== id), { ...tok, x, y }] }
}

export function removeToken(t: Table, id: string): Table {
  return { ...t, tokens: t.tokens.filter((k) => k.id !== id) }
}

/** Topmost stack whose center is close enough to (cx, cy) to stack onto it. */
export function stackTargetAt(t: Table, cx: number, cy: number, exclude: string | null): Stack | null {
  const reach = CARD_W * 0.4
  for (let i = t.z.length - 1; i >= 0; i--) {
    const s = t.stacks[t.z[i]]
    if (s.id === exclude || s.slot) continue
    if (Math.hypot(s.x + CARD_W / 2 - cx, s.y + CARD_H / 2 - cy) < reach) return s
  }
  return null
}

// ---------- battlefield ----------

/** Take a card out of whatever pile holds it. */
export function takeCard(t: Table, cardId: string): [Table, CardRef | null] {
  const where = locateCard(t, cardId)
  if (!where || isPinned(where.stack, where.index)) return [t, null]
  const { stack, index } = where
  return [withCards(t, stack, stack.cards.filter((_, i) => i !== index)), stack.cards[index]]
}

export interface TerrainSlot {
  code: string
  down: boolean
}

/**
 * Lay out Terrain Cards edge to edge as drawn on a Conflict Card, inside a
 * battlefield area at (x, y). `rows` holds card codes like "T07" (null = empty
 * cell); down-facing cards are turned 180°. Replaces any earlier battlefield.
 */
export function buildBattlefield(
  t: Table,
  rows: (TerrainSlot | null)[][],
  defs: Record<string, CardDef>,
  x: number,
  y: number,
): Table {
  const idByCode = new Map(Object.values(defs).map((d) => [d.code, d.id]))
  const battlefield = { x, y, cols: Math.max(1, ...rows.map((r) => r.length)), rows: rows.length }
  const x0 = x + AREA_PAD
  const y0 = y + AREA_HEADER
  let next: Table = { ...clearBattlefield(t, defs), battlefield }
  rows.forEach((row, r) =>
    row.forEach((slot, c) => {
      const id = slot && idByCode.get(slot.code)
      if (!id) return
      const [t2, card] = takeCard(next, id)
      if (!card) return
      next = addStack(t2, x0 + c * CARD_W, y0 + r * CARD_H, [{ ...card, faceUp: true }], { rot: slot.down ? 180 : 0 })[0]
    }),
  )
  return next
}

/** Put every Terrain Card lying on the table back into the Terrain deck and remove the battlefield. */
export function clearBattlefield(t: Table, defs: Record<string, CardDef>): Table {
  let next: Table = { ...t, battlefield: null }
  for (const id of t.z) {
    const s = next.stacks[id]
    if (s?.cards.some((c) => defs[c.id]?.type === 'terrain')) {
      const terrain = s.cards.filter((c) => defs[c.id]?.type === 'terrain')
      next = returnToDecks(withCards(next, s, s.cards.filter((c) => !terrain.includes(c))), terrain, defs)
    }
  }
  return next
}

// ---------- decks ----------

/** Put cards (bottom → top, kept in that order) into a deck's pile, at the place its rules say. */
function insertIntoDeck(t: Table, deck: Stack | undefined, cards: CardRef[], defs: Record<string, CardDef>, under = false): Table {
  if (!deck?.deck || !cards.length) return t
  const spec = DECK_SPECS[deck.deck]
  const added = cards.map((c) => ({ ...c, faceUp: spec.faceUp }))
  if (spec.insert === 'sorted') return sortStack(setStack(t, { ...deck, cards: [...deck.cards, ...added] }), deck.id, defs)
  const bottom = under || spec.insert === 'bottom'
  return setStack(t, { ...deck, cards: bottom ? underneath(deck, added) : [...deck.cards, ...added] })
}

/** Send cards (already taken off the table) back to their own decks. */
export function returnToDecks(t: Table, cards: CardRef[], defs: Record<string, CardDef>): Table {
  const groups = new Map<DeckKind, CardRef[]>()
  for (const card of cards) {
    const def = defs[card.id]
    if (!def) continue
    const kind = homeDeck(t, def)
    groups.set(kind, [...(groups.get(kind) ?? []), card])
  }
  let next = t
  for (const [kind, group] of groups) next = insertIntoDeck(next, deckStack(next, kind), group, defs)
  return next
}

/** A table pile (or its top card) goes back to the decks its cards belong to, but its pinned cards (the Damage Card). */
export function stackToDecks(t: Table, id: string, which: 'top' | 'all', defs: Record<string, CardDef>): Table {
  const s = t.stacks[id]
  if (!s?.cards.length || s.deck) return t
  const free = unpinned(s)
  const moved = which === 'top' ? free.slice(-1) : free
  if (!moved.length) return t
  const out = new Set(moved.map((c) => c.id))
  return returnToDecks(withCards(t, s, s.cards.filter((c) => !out.has(c.id))), moved, defs)
}

/** Some cards (by index) of a table pile go back to their decks, but its pinned ones. */
export function cardsToDecks(t: Table, id: string, indices: number[], defs: Record<string, CardDef>): Table {
  const s = t.stacks[id]
  if (!s || s.deck) return t
  const set = new Set(indices.filter((i) => !isPinned(s, i)))
  return returnToDecks(withCards(t, s, s.cards.filter((_, i) => !set.has(i))), s.cards.filter((_, i) => set.has(i)), defs)
}

/** The cards of a pile that may leave it (all but its pinned ones), or only those given (in pile order). */
function cardsOf(t: Table, stackId: string, cardIds?: string[]): CardRef[] {
  const s = t.stacks[stackId]
  const cards = s ? unpinned(s) : []
  if (!cardIds) return cards
  const ids = new Set(cardIds)
  return cards.filter((c) => ids.has(c.id))
}

/** Take cards (all of them if none given, but its pinned ones) out of a pile; an emptied table pile disappears. */
function takeCards(t: Table, stackId: string, cardIds?: string[]): [Table, CardRef[]] {
  const s = t.stacks[stackId]
  const taken = cardsOf(t, stackId, cardIds)
  if (!s || !taken.length) return [t, []]
  const out = new Set(taken.map((c) => c.id))
  return [withCards(t, s, s.cards.filter((c) => !out.has(c.id))), taken]
}

/** Cards of a pile (or those given) that a deck may not hold (empty = they may go under that deck). */
export function notHeldBy(t: Table, stackId: string, kind: DeckKind, defs: Record<string, CardDef>, cardIds?: string[]): CardDef[] {
  return cardsOf(t, stackId, cardIds)
    .map((c) => defs[c.id])
    .filter((d) => d && !DECK_SPECS[kind].holds(d))
}

/**
 * Slide a table pile, or cards picked out of any pile, under the deck `deckId`, as the rules ask (X-cards under the
 * Encounter Deck, enemies under the Enemy Card, banished cards under Banned Cards).
 */
export function putUnderDeck(t: Table, stackId: string, deckId: string, defs: Record<string, CardDef>, cardIds?: string[]): Table {
  const s = t.stacks[stackId]
  const kind = t.stacks[deckId]?.deck
  if (!s || !kind || stackId === deckId || s.slot === 'story' || notHeldBy(t, stackId, kind, defs, cardIds).length) return t
  const [t2, cards] = takeCards(t, stackId, cardIds)
  return insertIntoDeck(t2, t2.stacks[deckId], cards, defs, true)
}

/** Slide cards picked out of a pile (e.g. a sidebar deck) under a table pile, face up as when taken out. */
export function putUnderPile(t: Table, stackId: string, cardIds: string[], targetId: string): Table {
  if (stackId === targetId || !t.stacks[targetId] || t.stacks[stackId]?.slot === 'story') return t
  const [t2, cards] = takeCards(t, stackId, cardIds)
  const target = t2.stacks[targetId]
  if (!cards.length || !target) return t
  return setStack(t2, { ...target, cards: underneath(target, cards.map((c) => ({ ...c, faceUp: true }))) })
}

// ---------- storybook ----------

/**
 * Turn over the top card of the storybook onto the revealed pile. A sub-chapter card (Y-card) on top isn't turned over:
 * it goes unseen into the Encounter Bar, first in its row (rulebook 9.1.2, step 4: the Y-cards on top of the storybook go
 * into the Encounter Bar until the next Chapter Card is visible).
 */
export function revealStory(t: Table, defs: Record<string, CardDef>): Table {
  const deck = storySlot(t, 'story')
  const shown = storySlot(t, 'story-revealed')
  const top = deck?.cards.at(-1)
  if (!deck || !shown || !top) return t
  const t2 = setStack(t, { ...deck, cards: deck.cards.slice(0, -1) })
  const bar = storyToBar(t, defs)
  if (bar) return addStack(t2, bar.x, bar.y, [{ ...top, faceUp: false }])[0]
  return setStack(t2, { ...shown, cards: [...shown.cards, { ...top, faceUp: true }] })
}

/** Where the storybook's top card goes in the Encounter Bar when revealed, if it is a card for the bar (a Y-card). */
export function storyToBar(t: Table, defs: Record<string, CardDef>): { x: number; y: number } | null {
  const top = storySlot(t, 'story')?.cards.at(-1)
  const spot = spotsOf(t).find((s) => s.id === 'bar')
  if (!top || !spot || family(defs[top.id]) !== spot.family) return null
  return spotPlace(t, spot, null, -Infinity, -Infinity)
}

/** Put the top revealed card back on top of the storybook, face down. */
export function unrevealStory(t: Table): Table {
  const deck = storySlot(t, 'story')
  const shown = storySlot(t, 'story-revealed')
  const top = shown?.cards.at(-1)
  if (!deck || !shown || !top) return t
  const t2 = setStack(t, { ...shown, cards: shown.cards.slice(0, -1) })
  return setStack(t2, { ...deck, cards: [...deck.cards, { ...top, faceUp: false }] })
}

/**
 * Put a table pile, or cards picked out of any pile, into the storybook directly under the Storybook card `name`
 * ("Chapter 3", "Epilogue"), face down, so they come up right after it. If that card was already revealed, the cards
 * go on top and come up next.
 */
export function putUnderChapter(t: Table, stackId: string, name: string, defs: Record<string, CardDef>, cardIds?: string[]): Table {
  const s = t.stacks[stackId]
  if (!s || s.slot === 'story' || !storySlot(t, 'story') || notHeldBy(t, stackId, 'storybook', defs, cardIds).length) return t
  const [t2, taken] = takeCards(t, stackId, cardIds)
  const deck = storySlot(t2, 'story')!
  const cards = taken.map((c) => ({ ...c, faceUp: false }))
  const at = deck.cards.findIndex((c) => defs[c.id]?.name === name)
  const next = at < 0 ? [...deck.cards, ...cards] : [...deck.cards.slice(0, at), ...cards, ...deck.cards.slice(at)]
  return setStack(t2, { ...deck, cards: next })
}

/** Names of the Storybook cards already turned over, and the current one (the last turned over). */
export function storyProgress(t: Table, defs: Record<string, CardDef>): { revealed: Set<string>; current: string | null } {
  const names = (storySlot(t, 'story-revealed')?.cards ?? [])
    .map((c) => defs[c.id])
    .filter((d) => d?.type === 'storybook' && d.name)
    .map((d) => d.name!)
  return { revealed: new Set(names), current: names.at(-1) ?? null }
}

/** Whether a table point lies on the face-down storybook. */
export function storyAt(t: Table, x: number, y: number): boolean {
  const s = storySlot(t, 'story')
  return !!s && x >= s.x && x <= s.x + CARD_W && y >= s.y && y <= s.y + CARD_H
}

// ---------- spots ----------

/**
 * Lay the spots out: spread out piles dropped on the hand, close the gaps in fanned spots (Money Cards, Goods), their
 * piles lying on the first places in row order, and lay cards on a spot that turns them straight and face up (Market Prices) or face down (Encounter Bar), or
 * upside down (Actions area), as they must lie there.
 */
export function settleSpots(t: Table): Table {
  let next = t
  const spots = spotsOf(t)
  // A pile dropped on the hand is spread out, one card per place, in pile order: its other cards just after its bottom
  // one, closer than the next card, which the row's layout below closes up.
  for (const spot of spots.filter((s) => s.takesPiles)) {
    const [a, b] = spotPlaces(spot, 2)
    const dx = Math.sign(b.x - a.x)
    const dy = Math.sign(b.y - a.y)
    for (const id of fanRow(next, spot)) {
      const s = next.stacks[id]
      if (s.cards.length < 2) continue
      next = setStack(next, { ...s, cards: s.cards.slice(0, 1) })
      s.cards.slice(1).forEach((card, i) => {
        const d = ((i + 1) / s.cards.length) * 0.4
        next = addStack(next, s.x + dx * d, s.y + dy * d, [card], { rot: s.rot })[0]
      })
    }
  }
  for (const spot of spots.filter((s) => s.fan)) {
    const row = fanRow(next, spot)
    const places = spotPlaces(spot, row.length)
    row.forEach((id, i) => {
      const s = next.stacks[id]
      const p = places[Math.min(i, places.length - 1)]
      if (s.x !== p.x || s.y !== p.y) next = setStack(next, { ...s, x: p.x, y: p.y })
    })
  }
  for (const spot of spots.filter((s) => s.turn)) {
    const faceUp = !spot.faceDown
    for (const id of stacksOnSpot(next, spot)) {
      const s = next.stacks[id]
      if (s.rot || s.cards.some((c) => c.faceUp !== faceUp)) next = setStack(next, { ...s, rot: 0, cards: s.cards.map((c) => ({ ...c, faceUp })) })
    }
  }
  for (const spot of spots.filter((s) => s.upsideDown)) {
    for (const id of stacksOnSpot(next, spot)) {
      const s = next.stacks[id]
      if (s.rot !== 180) next = setStack(next, { ...s, rot: 180 })
    }
  }
  return next
}

/** Bring the table in order after any change: the spots laid out (`settleSpots()`), then the areas (`settleLayout()`). */
export function settle(t: Table): Table {
  return settleLayout(settleSpots(t))
}

// ---------- area layout ----------

/**
 * Apply a change that moves the areas, and lay the table out (`settle()`). The piles and figures that lay outside the
 * areas and now lie under one move right, past the areas, keeping their places to each other: they don't belong in it.
 */
export function rearrange(t: Table, fn: (t: Table) => Table): Table {
  const outside = (x: number, y: number) => !allAreas(t).some((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
  const piles = t.z.filter((id) => !isFixed(t.stacks[id]) && !areaForCard(t, t.stacks[id].x, t.stacks[id].y))
  const figures = t.tokens.filter((k) => outside(k.x + TOKEN_SIZE / 2, k.y + TOKEN_SIZE / 2)).map((k) => k.id)
  const laid = settle(fn(t))
  const areas = allAreas(laid)
  const covered = (x: number, y: number, w: number, h: number) =>
    areas.some((a) => x < a.x + a.w && x + w > a.x && y < a.y + a.h && y + h > a.y)
  const moved = new Set([
    ...piles.filter((id) => covered(laid.stacks[id].x, laid.stacks[id].y, CARD_W, CARD_H)),
    ...figures.filter((id) => {
      const k = laid.tokens.find((k) => k.id === id)!
      return covered(k.x, k.y, TOKEN_SIZE, TOKEN_SIZE)
    }),
  ])
  if (!moved.size) return laid
  const left = Math.min(...[...Object.values(laid.stacks), ...laid.tokens].filter((p) => moved.has(p.id)).map((p) => p.x))
  const dx = Math.max(...areas.map((a) => a.x + a.w)) + CARD_W / 2 - left
  const stacks = Object.fromEntries(Object.entries(laid.stacks).map(([id, s]) => [id, moved.has(id) ? { ...s, x: s.x + dx } : s]))
  const tokens = laid.tokens.map((k) => (moved.has(k.id) ? { ...k, x: k.x + dx } : k))
  return { ...laid, stacks, tokens }
}

/** Put an area (and everything in it) with its top-left corner at (x, y); the areas in its way are pushed aside. */
export function moveArea(t: Table, id: string, x: number, y: number): Table {
  const anchors = anchorsAfterMove(t, id, x, y)
  return anchors ? rearrange(t, (t) => ({ ...t, anchors })) : t
}

/** Lay the areas out packed together again, as before the player moved any. */
export function resetLayout(t: Table): Table {
  if (!t.anchors) return t
  return rearrange(t, (t) => {
    const packed = { ...t }
    delete packed.anchors
    return packed
  })
}
