import { CARD_H, CARD_W } from './cards'
import type { Battlefield, CardDef, CardType, Table } from './types'

/** Card families used by the area rules (B- and X-Encounter Cards behave the same). */
type Family = Exclude<CardType, 'encounter-b' | 'encounter-x'>

export function family(def: CardDef | undefined): Family | undefined {
  const t = def?.type
  return t === 'encounter-b' || t === 'encounter-x' ? 'encounter' : t
}

/** A framed part of the table reserved for certain cards (rulebook chapters 4 and 10). */
export interface Area {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  accepts: Family[]
}

export const AREA_PAD = 40
export const AREA_HEADER = 90
const GAP = 120

/** Size of an area holding `cols` × `rows` cards. */
function box(cols: number, rows: number) {
  return { w: cols * CARD_W + AREA_PAD * 2, h: rows * CARD_H + AREA_HEADER + AREA_PAD }
}

const map = { x: 0, y: 0, ...box(5, 2) }
const bar = { x: map.x + map.w + GAP, y: 0, ...box(6, 2) }
const character = { x: 0, y: map.h + GAP, ...box(5, 3) }
// Five wide, leaving room right of the Money Cards fanned out from the Storage Card (see SPOTS).
const storage = { x: character.w + GAP, y: character.y, ...box(5, 3) }
const story = { x: storage.x + storage.w + GAP, y: character.y, ...box(2, 1) }
const home = { x: story.x, y: story.y + story.h + GAP, ...box(2, 1.4) }

export const AREAS: Area[] = [
  { id: 'map', label: 'Map', ...map, accepts: ['region', 'encounter', 'lost-pages'] },
  { id: 'bar', label: 'Encounter Bar', ...bar, accepts: ['lost-pages'] },
  { id: 'character', label: 'Character', ...character, accepts: ['character', 'alignment', 'lost-pages', 'encounter'] },
  { id: 'storage', label: 'Storage', ...storage, accepts: ['lost-pages', 'encounter', 'money'] },
  { id: 'storybook', label: 'Storybook', ...story, accepts: ['storybook'] },
  { id: 'home', label: 'Home', ...home, accepts: ['lost-pages', 'encounter'] },
]

/**
 * A card-sized place inside an area reserved for one card family: no other card
 * may lie on it, and cards of that family dropped near it snap onto it.
 */
export interface Spot {
  id: string
  label: string
  /** Second line of the empty placeholder. */
  hint?: string
  area: string
  family: Family
  /** Cards of the family always land here, wherever they are dropped on the table. */
  attracts: boolean
  x: number
  y: number
  /** The spot beside this one whose card lies on top of it, covering the half next to it. */
  under?: string
  /** One card per place, in a row of `count` places: each slid half under the right side of the one before. */
  fan?: { count: number }
}

type Point = { x: number; y: number }

/** Top-left corners of a spot's places: one, or a row of them for a fanned spot. */
export function spotPlaces(spot: Spot): Point[] {
  return Array.from({ length: spot.fan?.count ?? 1 }, (_, i) => ({ x: spot.x + (i * CARD_W) / 2, y: spot.y }))
}

/** Table pile lying exactly at a place (other than `exclude`). */
function pileAt(t: Table, p: Point, exclude: string | null): string | null {
  return t.z.find((id) => id !== exclude && t.stacks[id].x === p.x && t.stacks[id].y === p.y) ?? null
}

/** Table piles lying on a spot's places, in place order. */
export function stacksOnSpot(t: Table, spot: Spot): string[] {
  return spotPlaces(spot).flatMap((p) => t.z.filter((id) => t.stacks[id].x === p.x && t.stacks[id].y === p.y))
}

/** Piles lying in a fanned spot's row (on a place, or just dropped between two), left to right. */
export function fanRow(t: Table, spot: Spot, exclude: string | null = null): string[] {
  const last = spotPlaces(spot).at(-1)!
  const inRow = (id: string) => id !== exclude && t.stacks[id].y === spot.y && t.stacks[id].x >= spot.x - 1 && t.stacks[id].x <= last.x + 1
  return t.z.filter(inRow).sort((a, b) => t.stacks[a].x - t.stacks[b].x)
}

/**
 * Where cards going to a spot land (top-left dropped at x, y), or null when a
 * fanned spot is full. A plain spot: onto the pile lying there. A fanned spot:
 * at the place the card is dropped on, or after the last card when dropped
 * elsewhere. That position may lie half a unit beside a place, which sorts the
 * card into the row; `settleFans()` then lays the row out on its places.
 */
export function spotPlace(t: Table, spot: Spot, moving: string | null, x: number, y: number): (Point & { onto: string | null }) | null {
  if (!spot.fan) return { x: spot.x, y: spot.y, onto: pileAt(t, spot, moving) }
  const row = fanRow(t, spot)
  const others = row.filter((id) => id !== moving)
  if (others.length >= spot.fan.count) return null
  const near = Math.abs(y - spot.y) < CARD_H / 2 && x > spot.x - CARD_W / 2 && x < spot.x + (others.length + 1) * (CARD_W / 2)
  const i = near ? Math.max(0, Math.min(others.length, Math.round((x - spot.x) / (CARD_W / 2)))) : others.length
  const at = (dx: number, id: string) => ({ x: t.stacks[id].x + dx, y: spot.y, onto: null })
  if (moving && row.indexOf(moving) === i) return at(0, moving)
  if (i < others.length) return at(-0.5, others[i])
  return others.length ? at(0.5, others[others.length - 1]) : { x: spot.x, y: spot.y, onto: null }
}

/** Which half of a spot's card is covered by the card of the spot it lies under. */
export function coveredSide(spot: Spot): 'left' | 'right' | null {
  const cover = SPOTS.find((s) => s.id === spot.under)
  return cover ? (cover.x > spot.x ? 'right' : 'left') : null
}

// Top center, so titles/skills can go above-left/right and items to its right (rulebook 4.1).
const characterSpot = { x: character.x + AREA_PAD + 2 * CARD_W, y: character.y + AREA_HEADER }
const storageSpot = { x: storage.x + (storage.w - CARD_W) / 2, y: storage.y + AREA_HEADER }

export const SPOTS: Spot[] = [
  { id: 'character', label: 'Character Card', area: 'character', family: 'character', attracts: true, ...characterSpot },
  // Slid half under the left side of the Character Card (rulebook 4.2).
  {
    id: 'alignment',
    label: 'Alignment Card',
    area: 'character',
    family: 'alignment',
    attracts: true,
    x: characterSpot.x - CARD_W / 2,
    y: characterSpot.y,
    under: 'character',
  },
  // Top center. The Storage Card is a Y-card; goods go left and below it, items and money right (rulebook 4.7.4).
  { id: 'storage', label: 'Storage Card', hint: 'any Y-Card', area: 'storage', family: 'lost-pages', attracts: false, ...storageSpot },
  // Slid half under the right side of the Storage Card, and each further one half under the one before, so the amounts
  // on their right halves add up to the sum shown (rulebook 4.3). Each is its own pile, so it can be turned to its amount.
  {
    id: 'money',
    label: 'Money Card',
    area: 'storage',
    family: 'money',
    attracts: true,
    x: storageSpot.x + CARD_W / 2,
    y: storageSpot.y,
    under: 'storage',
    fan: { count: 3 },
  },
]

/** Fixed places of the storybook: revealed cards on the left, the face-down deck on the right. */
export const STORY_SLOTS = {
  'story-revealed': { x: story.x + AREA_PAD, y: story.y + AREA_HEADER },
  story: { x: story.x + AREA_PAD + CARD_W, y: story.y + AREA_HEADER },
}

/** Where the battlefield is laid out: below the other areas. */
export const BATTLEFIELD_ORIGIN = { x: 0, y: character.y + character.h + GAP }
/** Columns to the right of the Terrain Cards for Enemy Cards with their Hit Point Cards. */
export const ENEMY_COLS = 2
const ENEMY_GAP = 60

export function battlefieldArea(b: Battlefield): Area {
  const size = box(b.cols + ENEMY_COLS, Math.max(2, b.rows))
  return { id: 'battlefield', label: 'Battlefield', x: b.x, y: b.y, w: size.w + ENEMY_GAP, h: size.h, accepts: ['terrain', 'hitpoints', 'lost-pages'] }
}

/** Top-left corner of the enemy columns inside the battlefield. */
export function enemyOrigin(b: Battlefield): { x: number; y: number } {
  return { x: b.x + AREA_PAD + b.cols * CARD_W + ENEMY_GAP, y: b.y + AREA_HEADER }
}

export function allAreas(t: Table): Area[] {
  return t.battlefield ? [...AREAS, battlefieldArea(t.battlefield)] : AREAS
}

/** The one area for card families that have a dedicated place. */
const HOME_AREA: Partial<Record<Family, string>> = {
  region: 'map',
  character: 'character',
  alignment: 'character',
  money: 'storage',
  storybook: 'storybook',
  terrain: 'battlefield',
  hitpoints: 'battlefield',
}

const FAMILY_NAMES: Record<Family, string> = {
  title: 'The title card',
  character: 'The Character Card',
  alignment: 'Alignment Cards',
  money: 'Money Cards',
  region: 'Region Cards',
  terrain: 'Terrain Cards',
  hitpoints: 'Hit Point Cards',
  storybook: 'Storybook Cards',
  time: "'Time Passes' / 'Next Chapter' cards",
  encounter: 'Encounter Cards',
  'lost-pages': 'Lost Pages Cards',
}

const SHORT_NAMES: Record<Family, string> = {
  title: 'Title',
  character: 'Character',
  alignment: 'Alignment',
  money: 'Money',
  region: 'Regions',
  terrain: 'Terrain',
  hitpoints: 'Hit Points',
  storybook: 'Storybook',
  time: 'Time',
  encounter: 'Encounter Cards',
  'lost-pages': 'Y-Cards',
}

/** "Regions · Encounter Cards · Y-Cards" */
export function acceptsText(area: Area): string {
  return area.accepts.map((f) => SHORT_NAMES[f]).join(' · ')
}

/** The area containing a table point (card center). */
export function areaAt(t: Table, x: number, y: number): Area | null {
  return allAreas(t).find((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) ?? null
}

/** Area containing the center of a card whose top-left corner is at (x, y). */
export function areaForCard(t: Table, x: number, y: number): Area | null {
  return areaAt(t, x + CARD_W / 2, y + CARD_H / 2)
}

/** Why these cards may not be placed in `area` (null = allowed; free table space takes anything). */
export function refusal(area: Area | null, cardIds: string[], defs: Record<string, CardDef>): string | null {
  if (!area) return null
  for (const id of cardIds) {
    const f = family(defs[id])
    if (!f || area.accepts.includes(f)) continue
    const home = HOME_AREA[f]
    if (!home) return `${FAMILY_NAMES[f]} don't belong in the ${area.label} area`
    return `${FAMILY_NAMES[f]} belong in ${home === 'battlefield' ? 'the Battlefield' : `the ${AREAS.find((a) => a.id === home)?.label} area`}`
  }
  return null
}

/** The spot place a card whose top-left corner is at (x, y) would lie on (same reach as stacking onto a pile). */
function spotAt(x: number, y: number): { spot: Spot; place: Point } | undefined {
  const near = SPOTS.flatMap((spot) => spotPlaces(spot).map((place) => ({ spot, place, d: Math.hypot(place.x - x, place.y - y) })))
  // Overlapping places (half under another card, fanned) are close together: take the nearest.
  return near.filter((n) => n.d < CARD_W * 0.4).sort((a, b) => a.d - b.d)[0]
}

/**
 * Table piles back to front as drawn: piles on a spot lie right under the card
 * of the spot covering them, and later places of a fanned spot under earlier ones.
 */
export function drawOrder(t: Table): string[] {
  let z = t.z
  for (const spot of SPOTS) {
    if (!spot.under && !spot.fan) continue
    const below = stacksOnSpot(t, spot).reverse()
    if (!below.length) continue
    const cover = SPOTS.find((s) => s.id === spot.under)
    const above = cover && stacksOnSpot(t, cover)[0]
    const first = Math.min(...below.map((id) => z.indexOf(id)))
    z = z.filter((id) => !below.includes(id))
    z.splice(above ? z.indexOf(above) : first, 0, ...below)
  }
  return z
}

export interface Placement {
  /** Where the cards really go: a new pile at (x, y), or on top of pile `onto`. */
  x: number
  y: number
  onto: string | null
  area: Area | null
  /** The spot they go to, if any. */
  spot: Spot | null
  /** Why they can't go there (null = allowed). */
  refused: string | null
}

/**
 * Where cards dropped with their top-left corner at (x, y), or onto pile `onto`,
 * end up. Cards with an attracting spot go there whatever the drop point, cards
 * dropped on a spot snap onto it; `moving` is the pile being moved as a whole,
 * which doesn't count as lying on the spot.
 */
export function placement(
  t: Table,
  cardIds: string[],
  defs: Record<string, CardDef>,
  x: number,
  y: number,
  onto: string | null,
  moving: string | null = null,
): Placement {
  const families = cardIds.map((id) => family(defs[id]))
  const own = SPOTS.find((s) => s.attracts && families.includes(s.family))
  if (own) {
    const area = AREAS.find((a) => a.id === own.area)!
    const mixed = families.every((f) => f === own.family) ? null : `The ${own.label} lies alone on its place in the ${area.label} area`
    const place = spotPlace(t, own, moving, x, y)
    const full = `The ${area.label} area holds at most ${own.fan?.count} ${FAMILY_NAMES[own.family]}`
    return { ...(place ?? { x: own.x, y: own.y, onto: null }), area, spot: own, refused: mixed ?? (place ? null : full) }
  }
  const target = onto ? t.stacks[onto] : null
  const at = { x: target?.x ?? x, y: target?.y ?? y }
  const area = areaForCard(t, at.x, at.y)
  const taken = spotAt(at.x, at.y)
  if (!taken) return { x, y, onto, area, spot: null, refused: refusal(area, cardIds, defs) }
  const { spot, place } = taken
  const fits = families.every((f) => f === spot.family)
  const other = spot.attracts ? `Only the ${spot.label} goes on its place` : `Only ${FAMILY_NAMES[spot.family]} go on the ${spot.label} place`
  const refused = refusal(area, cardIds, defs) ?? (fits ? null : other)
  return { ...place, onto: pileAt(t, place, moving), area, spot, refused }
}
