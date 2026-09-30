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
const storage = { x: character.w + GAP, y: character.y, ...box(4, 3) }
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
