import type { DeckKind } from './decks'

export type CardType =
  | 'title'
  | 'character'
  | 'alignment'
  | 'money'
  | 'region'
  | 'terrain'
  | 'hitpoints'
  | 'storybook'
  | 'time'
  | 'encounter'
  | 'encounter-b'
  | 'encounter-x'
  | 'lost-pages'

/** One physical card as described by public/cards/cards.json. */
export interface CardDef {
  id: string
  sheet: number
  row: number
  col: number
  type?: CardType
  /** Printed card number, e.g. "Y003", "B23", "T07". */
  code?: string
  name?: string
}

export interface CardManifest {
  source: string
  cardSize: { width: number; height: number }
  cards: CardDef[]
}

export interface CardRef {
  id: string
  faceUp: boolean
}

export type Rotation = 0 | 90 | 180 | 270

/** A pile of one or more cards lying on the table. `cards` is bottom → top. */
export interface Stack {
  id: string
  x: number
  y: number
  rot: Rotation
  cards: CardRef[]
  label?: string
  /** Which deck this is (sidebar decks and the storybook). */
  deck?: DeckKind
  /** Fixed places on the table: the face-down storybook and its revealed cards. */
  slot?: StorySlot
}

export type StorySlot = 'story' | 'story-revealed'

export interface Token {
  id: string
  x: number
  y: number
  color: string
  shape: 'pawn' | 'cube'
}

/** Framed area on the table where Terrain Cards form the battlefield. */
export interface Battlefield {
  x: number
  y: number
  cols: number
  rows: number
}

export interface Table {
  stacks: Record<string, Stack>
  /** Ids of the stacks lying on the table, from back to front. */
  z: string[]
  /** Ids of the decks kept in the sidebar, top to bottom. */
  dock?: string[]
  battlefield?: Battlefield | null
  /** The sidebar deck each card last came out of, so it can go back there. */
  origin?: Record<string, DeckKind>
  tokens: Token[]
  /** Cards in the hand, which the app no longer has: only in older saves, `migrateTable` sends them back to their decks. */
  hand?: CardRef[]
  /** Version of the area layout the cards lie in (missing: before the Storybook area grew for its Encounter Card). */
  layout?: number
  /** How far each area lies from its place in `AREAS`, with its spots, as `settleLayout()` laid it out (missing: not moved). */
  shifts?: Record<string, { x: number; y: number }>
  /** Frames of the growing areas as last laid out: a card dropped on one belongs to that area (`settleLayout()`). */
  frames?: Record<string, { x: number; y: number; w: number; h: number }>
  nextId: number
}

export interface View {
  x: number
  y: number
  scale: number
}
