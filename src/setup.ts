import { addStack, sortStack } from './actions'
import { compareCards } from './cards'
import { STORY_SLOTS } from './areas'
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
  let table: Table = { stacks: {}, z: [], tokens: [], nextId: 1 }
  for (const spec of SIDEBAR_DECKS) {
    const cards = contents[spec.kind].map((c) => ({ id: c.id, faceUp: spec.faceUp }))
    table = addStack(table, 0, 0, cards, { label: spec.label, deck: spec.kind })[0]
  }
  table = { ...table, dock: table.z, z: [] }
  const story = contents.storybook.map((c) => ({ id: c.id, faceUp: false }))
  return addStorySlots(table, story)
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
    hand: next.hand?.filter(playable),
  }
  const empty = new Set(next.z.filter((id) => !next.stacks[id].cards.length && !next.stacks[id].slot))
  const stacks3 = Object.fromEntries(Object.entries(next.stacks).filter(([id]) => !empty.has(id)))
  return { ...next, stacks: stacks3, z: next.z.filter((id) => !empty.has(id)) }
}
