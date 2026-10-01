import type { CardDef, CardManifest } from './types'

/** Card size in table (world) units. Poker ratio 63.5 x 88.9 mm. */
export const CARD_W = 250
export const CARD_H = 350
export const TOKEN_SIZE = 70

export const clampScale = (s: number) => Math.min(4, Math.max(0.08, s))

const BASE = `${import.meta.env.BASE_URL}cards`

export async function loadManifest(): Promise<CardManifest> {
  const res = await fetch(`${BASE}/cards.json`)
  if (!res.ok) throw new Error(`Could not load ${BASE}/cards.json — run "uv run scripts/split_cards.py" first.`)
  return res.json()
}

export function cardImage(id: string, faceUp: boolean, size: 'sm' | 'lg'): string {
  return `${BASE}/${size}/${id}-${faceUp ? 'front' : 'back'}.webp`
}

/**
 * Region Cards are printed sideways: they always lie landscape, never rotate, and turn over about their horizontal
 * axis.
 */
export function isLandscape(def: CardDef | undefined): boolean {
  return def?.type === 'region'
}

/**
 * Classes of the frame holding a card's image (with a leading space): a landscape frame shows the image turned a
 * quarter to the left for the front and to the right for the back, which is printed the other way round.
 */
export function landscapeClass(landscape: boolean, faceUp: boolean): string {
  return landscape ? ` landscape${faceUp ? '' : ' landscape-back'}` : ''
}

/**
 * Screen box of a card whose place has its top-left corner at (x, y). A landscape card lies across that place,
 * turned about its center, so it has the same center as any other card there.
 */
export function cardBox(x: number, y: number, landscape: boolean) {
  if (!landscape) return { left: x, top: y, width: CARD_W, height: CARD_H }
  return { left: x + (CARD_W - CARD_H) / 2, top: y + (CARD_H - CARD_W) / 2, width: CARD_H, height: CARD_W }
}

export function cardLabel(card: CardDef | undefined): string {
  if (!card) return ''
  return card.code ?? card.name ?? `#${card.id}`
}

/** Order by printed card number (Y003 < Y010 < Y291c); cards without one go last. */
export function compareCards(a: CardDef | undefined, b: CardDef | undefined): number {
  const byId = (a?.id ?? '').localeCompare(b?.id ?? '')
  if (a?.code && b?.code) return a.code.localeCompare(b.code, undefined, { numeric: true }) || byId
  if (a?.code || b?.code) return a?.code ? -1 : 1
  return byId
}

export function matchesQuery(card: CardDef, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [card.code, card.name, card.type, `#${card.id}`].some((s) => s?.toLowerCase().includes(q))
}
