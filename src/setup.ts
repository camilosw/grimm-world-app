import { addStack, mergeStacks, returnToDecks, settle, settleSpots, sortStack, takeCard } from './actions'
import { CARD_H, CARD_W, compareCards, TOKEN_SIZE } from './cards'
import { AREA_HEADER, AREA_PAD, AREAS, BATTLEFIELD_ORIGIN, family, SPOTS, spotPlace, spotsOf, stacksOnSpot, STORY_SLOTS } from './areas'
import { DECK_SPECS, DECKS, deckStack, homeDeck, SIDEBAR_DECKS, storySlot, type DeckKind } from './decks'
import type { CardDef, CardManifest, CardRef, Stack, Table } from './types'

function shuffled<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Current version of the area layout (`Table.layout`). */
const LAYOUT = 2

/** Every card used in play: all of them except the title card. */
export function playableCards(manifest: CardManifest): CardDef[] {
  return manifest.cards.filter((c) => c.type !== 'title')
}

/** Starting contents of each deck, bottom → top (rulebook chapter 6.1). */
function deckContents(cards: CardDef[]): Record<DeckKind, CardDef[]> {
  const byType = (...types: string[]) => cards.filter((c) => c.type && types.includes(c.type))
  const sorted = (list: CardDef[]) => [...list].sort((a, b) => compareCards(b, a))
  const inOrder = (list: CardDef[]) => [...list].reverse()
  const timePasses = cards.filter((c) => c.type === 'time' && c.name === 'Time Passes')
  const indexed = cards.some((c) => c.type)
  return {
    // Book Cover on top, then Chapter 1–14, the Epilogue and the Book Back Side.
    storybook: inOrder(byType('storybook')),
    // Shuffled B-Encounter Cards with the 'Time Passes' card underneath.
    encounter: [...timePasses, ...shuffled(byType('encounter-b', 'encounter'))],
    time: cards.filter((c) => c.type === 'time' && c.name === 'Next Chapter'),
    'x-encounters': sorted(byType('encounter-x')),
    // Without card types (scripts/index_cards.py not run) everything lands here.
    'lost-pages': indexed ? sorted(byType('lost-pages')) : inOrder(cards),
    regions: sorted(byType('region')),
    terrain: sorted(byType('terrain')),
    hitpoints: inOrder(byType('hitpoints')),
    character: byType('character'),
    alignment: inOrder(byType('alignment')),
    money: inOrder(byType('money')),
    quest: [],
    enemy: [],
    training: [],
    banned: [],
  }
}

/**
 * Sort the cards into decks as described in the rulebook, chapter 6.1
 * "Game Setup". All decks start in the sidebar; the table itself is empty.
 */
export function initialTable(manifest: CardManifest): Table {
  const contents = deckContents(playableCards(manifest))
  let table: Table = { stacks: {}, z: [], tokens: [], layout: LAYOUT, nextId: 1 }
  for (const spec of SIDEBAR_DECKS) {
    const cards = contents[spec.kind].map((c) => ({ id: c.id, faceUp: spec.faceUp }))
    table = addStack(table, 0, 0, cards, { label: spec.label, deck: spec.kind })[0]
  }
  table = { ...table, dock: table.z, z: [] }
  const story = contents.storybook.map((c) => ({ id: c.id, faceUp: false }))
  return settle(addStorySlots(table, story))
}

/** The storybook's two fixed places in its area: the face-down deck (right) and the revealed cards (left). */
function addStorySlots(t: Table, story: CardRef[], revealed: CardRef[] = []): Table {
  const [t2] = addStack(t, STORY_SLOTS.story.x, STORY_SLOTS.story.y, story, { label: 'Storybook', deck: 'storybook', slot: 'story' })
  const [t3] = addStack(t2, STORY_SLOTS['story-revealed'].x, STORY_SLOTS['story-revealed'].y, revealed, { slot: 'story-revealed' })
  return t3
}

/** Deck names used by earlier versions of the app. */
const OLD_LABELS: Record<string, DeckKind> = {
  ...Object.fromEntries(DECKS.map((d) => [d.label, d.kind])),
  'Next Chapter': 'time',
}

/** Bring saves from older versions of the app up to date. */
export function migrateTable(t: Table, defs: Record<string, CardDef>): Table {
  return settle(placeOnSpots(shrinkMap(lowerHome(widenStorage(emptyHand(migrateDecks(t, defs), defs)))), defs))
}

/** The hand is gone: cards still held in it go back to their decks. */
function emptyHand(t: Table, defs: Record<string, CardDef>): Table {
  if (!('hand' in t)) return t
  const { hand = [], ...rest } = t
  return returnToDecks(rest, hand.filter((c) => defs[c.id]?.type !== 'title'), defs)
}

/**
 * The Storage area used to be a card narrower: everything right of it (the
 * Storybook and Home areas) moves right with its storybook, and a pile on the
 * old Storage Card place moves to the new one.
 */
function widenStorage(t: Table): Table {
  const revealed = storySlot(t, 'story-revealed')
  const dx = STORY_SLOTS['story-revealed'].x - (revealed?.x ?? STORY_SLOTS['story-revealed'].x)
  if (!revealed || !dx) return t
  const margin = CARD_W / 4
  const shifted = (p: { x: number; y: number }) =>
    p.x >= revealed.x - AREA_PAD - margin && p.y >= revealed.y - AREA_HEADER - margin && p.y < BATTLEFIELD_ORIGIN.y - margin
  const spot = SPOTS.find((s) => s.id === 'storage')!
  const oldSpot = { x: spot.x - dx / 2, y: spot.y }
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => {
      if (!t.z.includes(id)) return [id, s]
      if (s.x === oldSpot.x && s.y === oldSpot.y) return [id, { ...s, x: spot.x }]
      return [id, shifted(s) ? { ...s, x: s.x + dx } : s]
    }),
  )
  return { ...t, stacks, tokens: t.tokens.map((k) => (shifted(k) ? { ...k, x: k.x + dx } : k)) }
}

/**
 * The Storybook area used to be one card high: it grew for the Encounter Card
 * below the revealed cards, and the Home area below it moved down as far, with
 * the cards and figures lying in it.
 */
function lowerHome(t: Table): Table {
  if ((t.layout ?? 0) >= 1) return t
  const story = AREAS.find((a) => a.id === 'storybook')!
  // The Home area as it was then: two cards wide, 1.4 high.
  const home = { ...AREAS.find((a) => a.id === 'home')!, w: 2 * CARD_W + 2 * AREA_PAD, h: 1.4 * CARD_H + AREA_HEADER + AREA_PAD }
  const dy = story.h - (CARD_H + AREA_HEADER + AREA_PAD)
  const margin = CARD_W / 4
  const inOldHome = (p: { x: number; y: number }) =>
    p.x >= home.x - margin && p.x < home.x + home.w && p.y >= home.y - dy - margin && p.y < home.y - dy + home.h
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => [id, t.z.includes(id) && !s.slot && inOldHome(s) ? { ...s, y: s.y + dy } : s]),
  )
  return { ...t, stacks, tokens: t.tokens.map((k) => (inOldHome(k) ? { ...k, y: k.y + dy } : k)), layout: 1 }
}

/**
 * The Map area used to be five cards wide and two high, with the Region Cards
 * in its middle: it shrank around their places, and the Encounter Bar right of
 * it moved left as far. The cards and figures lying in them move with them.
 */
function shrinkMap(t: Table): Table {
  if ((t.layout ?? 0) >= 2) return t
  const map = AREAS.find((a) => a.id === 'map')!
  const bar = AREAS.find((a) => a.id === 'bar')!
  const old = { w: 5 * CARD_W + 2 * AREA_PAD, h: 2 * CARD_H + AREA_HEADER + AREA_PAD }
  const gap = bar.x - map.x - map.w
  // The Region Cards lay in the middle of the old Map area, and now lie in the middle of the new one.
  const mapShift = { x: (map.w - old.w) / 2, y: (map.h - old.h) / 2 }
  const barShift = { x: map.w - old.w, y: 0 }
  const shift = <P extends { x: number; y: number }>(p: P, w: number, h: number): P => {
    const cx = p.x + w / 2
    const cy = p.y + h / 2
    const inRow = cx > map.x - gap / 2 && cy > map.y - gap / 2 && cy < map.y + Math.max(old.h, bar.h) + gap / 2
    const d = !inRow ? null : cx < map.x + old.w + gap / 2 ? mapShift : cx < map.x + old.w + gap + bar.w + gap / 2 ? barShift : null
    return d ? { ...p, x: p.x + d.x, y: p.y + d.y } : p
  }
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => [id, t.z.includes(id) && !s.slot ? shift(s, CARD_W, CARD_H) : s]),
  )
  return { ...t, stacks, tokens: t.tokens.map((k) => shift(k, TOKEN_SIZE, TOKEN_SIZE)), layout: LAYOUT }
}

/** Cards with a spot of their own (Character, Alignment, Money and Region Cards) lying elsewhere on the table move onto it. */
function placeOnSpots(t: Table, defs: Record<string, CardDef>): Table {
  let next = t
  const spots = spotsOf(t)
  for (const spot of spots.filter((s) => s.attracts)) {
    // A card on any of its family's places (the four Region Card places) is in place.
    const placed = new Set(spots.filter((s) => s.attracts && s.family === spot.family).flatMap((s) => stacksOnSpot(next, s)))
    for (const id of t.z) {
      const s = next.stacks[id]
      if (!s || s.slot) continue
      const own = s.cards.filter((c) => family(defs[c.id]) === spot.family)
      // In place: a pile of only these cards on the spot, or a single card on each place of a fanned spot.
      if (!own.length || (placed.has(id) && own.length === s.cards.length && (!spot.fan || own.length === 1))) continue
      for (const card of own) {
        const [t2] = takeCard(next, card.id)
        // Appended to a fanned spot; a card that doesn't fit any more stays where it is.
        const p = spotPlace(settleSpots(t2), spot, null, -Infinity, -Infinity)
        if (!p) continue
        const [t3, newId] = addStack(settleSpots(t2), p.x, p.y, [card])
        next = p.onto ? mergeStacks(t3, newId, p.onto, 'top') : t3
      }
    }
  }
  return next
}

function migrateDecks(t: Table, defs: Record<string, CardDef>): Table {
  let next = t
  // 1. Before the sidebar existed every deck lay on the table.
  if (!next.dock) {
    const isDeck = (id: string) => !!next.stacks[id].label
    next = { ...next, dock: next.z.filter(isDeck), z: next.z.filter((id) => !isDeck(id)) }
  }
  const sidebarOk = SIDEBAR_DECKS.every((spec, i) => next.stacks[next.dock![i]]?.deck === spec.kind) && next.dock!.length === SIDEBAR_DECKS.length
  const storyOk = !!storySlot(next, 'story') && !!storySlot(next, 'story-revealed')
  if (sidebarOk && storyOk) return next

  // 2. The sidebar holds exactly the fixed decks, in order. Cards of any other
  //    (home-made) deck go back where they belong.
  const stacks = { ...next.stacks }
  let nextId = next.nextId
  const strays: CardRef[] = []
  const known = new Map<DeckKind, Stack>()
  for (const id of next.dock!) {
    const s = stacks[id]
    const kind = s.deck ?? OLD_LABELS[s.label ?? '']
    if (kind && !known.has(kind)) known.set(kind, s)
    else strays.push(...s.cards)
    delete stacks[id]
  }
  const dock = SIDEBAR_DECKS.map((spec) => {
    const s = known.get(spec.kind) ?? { id: `s${nextId++}`, x: 0, y: 0, rot: 0 as const, cards: [] }
    stacks[s.id] = { ...s, label: spec.label, deck: spec.kind }
    return s.id
  })
  next = { ...next, stacks, dock, nextId }

  // 3. The storybook moves from the sidebar into its area; storybook cards lying
  //    on the table count as revealed.
  if (!storyOk) {
    const isStory = (c: CardRef) => defs[c.id]?.type === 'storybook'
    const revealed = next.z.flatMap((id) => next.stacks[id].cards.filter(isStory)).map((c) => ({ ...c, faceUp: true }))
    const stacks2 = { ...next.stacks }
    for (const id of next.z) stacks2[id] = { ...stacks2[id], cards: stacks2[id].cards.filter((c) => !isStory(c)) }
    const story = known.get('storybook')?.cards.map((c) => ({ ...c, faceUp: false })) ?? []
    next = addStorySlots({ ...next, stacks: stacks2 }, story, revealed)
  }

  for (const card of strays) {
    const def = defs[card.id]
    const deck = def && deckStack(next, homeDeck(next, def))
    if (!deck) continue
    next = { ...next, stacks: { ...next.stacks, [deck.id]: { ...deck, cards: [...deck.cards, { ...card, faceUp: DECK_SPECS[deck.deck!].faceUp }] } } }
    if (DECK_SPECS[deck.deck!].insert === 'sorted') next = sortStack(next, deck.id, defs)
  }

  // 4. The title card is no longer part of the game; piles left empty disappear.
  const playable = (c: CardRef) => defs[c.id] && defs[c.id].type !== 'title'
  next = {
    ...next,
    stacks: Object.fromEntries(Object.entries(next.stacks).map(([id, s]) => [id, { ...s, cards: s.cards.filter(playable) }])),
  }
  const empty = new Set(next.z.filter((id) => !next.stacks[id].cards.length && !next.stacks[id].slot))
  const stacks3 = Object.fromEntries(Object.entries(next.stacks).filter(([id]) => !empty.has(id)))
  return { ...next, stacks: stacks3, z: next.z.filter((id) => !empty.has(id)) }
}
