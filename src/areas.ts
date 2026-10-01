import { CARD_H, CARD_W, cardBox, type Turn } from "./cards";
import type { Battlefield, CardDef, CardType, StorySlot, Table } from "./types";

/** Card families used by the area rules (B- and X-Encounter Cards behave the same). */
type Family = Exclude<CardType, "encounter-b" | "encounter-x">;

export function family(def: CardDef | undefined): Family | undefined {
  const t = def?.type;
  return t === "encounter-b" || t === "encounter-x" ? "encounter" : t;
}

/** A framed part of the table reserved for certain cards (rulebook chapters 4 and 10). */
export interface Area {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accepts: Family[];
}

export const AREA_PAD = 40;
export const AREA_HEADER = 90;
const GAP = 120;

/** Size of an area holding `cols` × `rows` cards. */
function box(cols: number, rows: number) {
  return {
    w: cols * CARD_W + AREA_PAD * 2,
    h: rows * CARD_H + AREA_HEADER + AREA_PAD,
  };
}

const map = { x: 0, y: 0, ...box(5, 2) };
const bar = { x: map.x + map.w + GAP, y: 0, ...box(6, 2) };
const character = { x: 0, y: map.h + GAP, ...box(5, 3) };
// Five wide, leaving room right of the Money Cards fanned out from the Storage Card (see SPOTS).
const storage = { x: character.w + GAP, y: character.y, ...box(5, 3) };
/** Part of the revealed storybook card's height covered by the Encounter Card lying on its bottom edge. */
const STORY_COVERED = 0.15;
// The revealed cards and the storybook, with the Encounter Card below the revealed cards (see SPOTS).
const story = {
  x: storage.x + storage.w + GAP,
  y: character.y,
  ...box(2, 2 - STORY_COVERED),
};
const home = { x: story.x, y: story.y + story.h + GAP, ...box(2, 1.4) };

export const AREAS: Area[] = [
  {
    id: "map",
    label: "Map",
    ...map,
    accepts: ["region"],
  },
  { id: "bar", label: "Encounter Bar", ...bar, accepts: ["lost-pages"] },
  {
    id: "character",
    label: "Character",
    ...character,
    accepts: ["character", "alignment", "lost-pages", "encounter"],
  },
  {
    id: "storage",
    label: "Storage",
    ...storage,
    accepts: ["lost-pages", "encounter", "money"],
  },
  { id: "storybook", label: "Storybook", ...story, accepts: ["storybook"] },
  { id: "home", label: "Home", ...home, accepts: ["lost-pages", "encounter"] },
];

/**
 * A card-sized place inside an area reserved for one card family: no other card
 * may lie on it, and cards of that family dropped near it snap onto it.
 */
export interface Spot {
  id: string;
  label: string;
  /** Second line of the empty placeholder. */
  hint?: string;
  area: string;
  family: Family;
  /** Cards of the family always land here, wherever they are dropped on the table. */
  attracts: boolean;
  x: number;
  y: number;
  /** The spot beside (or above/below) this one whose card lies on top of it, covering the side next to it. */
  under?: string;
  /**
   * Part of the card's width (height, for a spot above or below it), as it lies, still showing beside the card on top
   * of it (default: half).
   */
  shows?: number;
  /**
   * One card per place, in a row growing away from the `under` card, each slid under the one before as far as the
   * first lies under that card: at most `count` of them, or any number, closer together once they fill `room`.
   * With `count: 1`, the spot holds a single card.
   */
  fan?: { count: number } | { room: number };
  /** The storybook place whose top card this spot's card lies on. */
  over?: StorySlot;
  /** Cards of the family dropped anywhere in its area go here. */
  fillsArea?: boolean;
  /** Its card lies landscape across the place (Region Cards, see `cardBox()`). */
  landscape?: boolean;
  /**
   * A portrait card lies here landscape, turned a quarter to this side, face up (the Encounter Cards giving a region's
   * market prices): it can't be turned over or rotated there.
   */
  turn?: Turn;
}

type Point = { x: number; y: number };

/** Most cards a fanned spot holds. */
function fanMax(spot: Spot): number {
  return spot.fan && "count" in spot.fan ? spot.fan.count : Infinity;
}

/** Whether a spot lies below or above the card covering it, so its row runs down or up. */
function vertical(spot: Spot): boolean {
  const side = coveredSide(spot);
  return side === "top" || side === "bottom";
}

/** Size of a spot's card as it lies there. */
function lyingSize(spot: Spot): { w: number; h: number } {
  const { width, height } = cardBox(0, 0, !!spot.landscape);
  return { w: width, h: height };
}

/** Signed distance between the places of a fanned spot holding `n` cards (negative: the row grows to the left or up). */
function fanStep(spot: Spot, n: number): number {
  const side = coveredSide(spot);
  const dir = side === "right" || side === "bottom" ? -1 : 1;
  const size = lyingSize(spot);
  const full = (spot.shows ?? 0.5) * (vertical(spot) ? size.h : size.w);
  const room = spot.fan && "room" in spot.fan ? spot.fan.room : Infinity;
  return dir * Math.min(full, n > 1 ? room / (n - 1) : full);
}

/** How far a fanned spot's row may reach from its first place. */
function fanReach(spot: Spot): number {
  if (!spot.fan) return 0;
  return "room" in spot.fan
    ? spot.fan.room
    : Math.abs(fanStep(spot, spot.fan.count)) * (spot.fan.count - 1);
}

/** Top-left corners of a spot's places: one, or a row of them for a fanned spot holding `n` cards (default: all). */
export function spotPlaces(
  spot: Spot,
  n = spot.fan ? fanMax(spot) : 1,
): Point[] {
  const step = fanStep(spot, n);
  const [dx, dy] = vertical(spot) ? [0, step] : [step, 0];
  return Array.from({ length: spot.fan ? n : 1 }, (_, i) => ({
    x: Math.round(spot.x + i * dx),
    y: Math.round(spot.y + i * dy),
  }));
}

/** Whether a fanned spot's row has room for one more card at full spacing, so its next place can be shown. */
export function fanHasPlace(t: Table, spot: Spot): boolean {
  const n = fanRow(t, spot).length + 1;
  return (
    n <= fanMax(spot) &&
    Math.abs(fanStep(spot, n)) === Math.abs(fanStep(spot, 1))
  );
}

/** Table pile lying exactly at a place (other than `exclude`). */
function pileAt(t: Table, p: Point, exclude: string | null): string | null {
  return (
    t.z.find(
      (id) =>
        id !== exclude && t.stacks[id].x === p.x && t.stacks[id].y === p.y,
    ) ?? null
  );
}

/** Table piles lying on a spot's places, in place order. */
export function stacksOnSpot(t: Table, spot: Spot): string[] {
  if (spot.fan) return fanRow(t, spot);
  return t.z.filter(
    (id) => t.stacks[id].x === spot.x && t.stacks[id].y === spot.y,
  );
}

/** Piles lying in a fanned spot's row (on a place, or just dropped between two), from its first place on. */
export function fanRow(
  t: Table,
  spot: Spot,
  exclude: string | null = null,
): string[] {
  const dir = Math.sign(fanStep(spot, 1));
  const v = vertical(spot);
  const along = (id: string) =>
    (v ? t.stacks[id].y - spot.y : t.stacks[id].x - spot.x) * dir;
  const inRow = (id: string) =>
    id !== exclude &&
    (v ? t.stacks[id].x === spot.x : t.stacks[id].y === spot.y) &&
    along(id) >= -1 &&
    along(id) <= fanReach(spot) + 1;
  return t.z.filter(inRow).sort((a, b) => along(a) - along(b));
}

/**
 * Where cards going to a spot land (top-left dropped at x, y), or null when a
 * fanned spot is full. A plain spot: onto the pile lying there. A fanned spot:
 * at the place the card is dropped on, or after the last card when dropped
 * elsewhere. That position may lie half a unit beside a place, which sorts the
 * card into the row; `settleSpots()` then lays the row out on its places.
 */
export function spotPlace(
  t: Table,
  spot: Spot,
  moving: string | null,
  x: number,
  y: number,
): (Point & { onto: string | null }) | null {
  if (!spot.fan) return { x: spot.x, y: spot.y, onto: pileAt(t, spot, moving) };
  const row = fanRow(t, spot);
  const others = row.filter((id) => id !== moving);
  if (others.length >= fanMax(spot)) return null;
  // Measured along the row, in places as spaced once the card is in it.
  const v = vertical(spot);
  const step = fanStep(spot, others.length + 1);
  const [pos, off] = v ? [y - spot.y, x - spot.x] : [x - spot.x, y - spot.y];
  const [length, breadth] = v ? [CARD_H, CARD_W] : [CARD_W, CARD_H];
  const along = (pos * Math.sign(step)) / Math.abs(step);
  const reach = others.length + length / 2 / Math.abs(step);
  const near =
    Math.abs(off) < breadth / 2 &&
    along > -length / 2 / Math.abs(step) &&
    along < reach;
  const i = near
    ? Math.max(0, Math.min(others.length, Math.round(along)))
    : others.length;
  const at = (d: number, id: string) => {
    const shift = d * Math.sign(step);
    return v
      ? { x: spot.x, y: t.stacks[id].y + shift, onto: null }
      : { x: t.stacks[id].x + shift, y: spot.y, onto: null };
  };
  if (moving && row.indexOf(moving) === i) return at(0, moving);
  if (i < others.length) return at(-0.5, others[i]);
  return others.length
    ? at(0.5, others[others.length - 1])
    : { x: spot.x, y: spot.y, onto: null };
}

export type Side = "left" | "right" | "top" | "bottom";

/** The spot turning the card lying on it (Market Prices) that pile `id` lies on, if any. */
export function turnedSpot(t: Table, id: string): Spot | undefined {
  return SPOTS.find((s) => s.turn && stacksOnSpot(t, s).includes(id));
}

/** Which side of a spot's card is covered by the card of the spot it lies under. */
export function coveredSide(spot: Spot): Side | null {
  const cover = SPOTS.find((s) => s.id === spot.under);
  if (!cover) return null;
  if (cover.x !== spot.x) return cover.x > spot.x ? "right" : "left";
  return cover.y > spot.y ? "bottom" : "top";
}

// Top center, so titles/skills can go above-left/right and items to its right (rulebook 4.1).
const characterSpot = {
  x: character.x + AREA_PAD + 2 * CARD_W,
  y: character.y + AREA_HEADER,
};
const storageSpot = {
  x: storage.x + (storage.w - CARD_W) / 2,
  y: storage.y + AREA_HEADER,
};
/** Part of a Goods card's width showing left of the card on top of it. */
const GOODS_LEFT_SHOWS = 0.31;
/** Part of a Goods card's height showing below the card on top of it. */
const GOODS_BELOW_SHOWS = 0.21;
const goodsX = Math.round(storageSpot.x - GOODS_LEFT_SHOWS * CARD_W);
const goodsBelowY = Math.round(storageSpot.y + GOODS_BELOW_SHOWS * CARD_H);
/** Top-left corner of the Region Cards laid out landscape, edge to edge, two by two in the middle of the Map area. */
const regionGrid = {
  x: map.x + (map.w - 2 * CARD_H) / 2,
  y: map.y + AREA_HEADER + (map.h - AREA_HEADER - AREA_PAD - 2 * CARD_W) / 2,
};
/** Place of the i-th Region Card (left to right, top to bottom): a portrait card's, the Region Card lies across it. */
const regionPlace = (i: number) => ({
  x: regionGrid.x + (i % 2) * CARD_H + (CARD_H - CARD_W) / 2,
  y: regionGrid.y + Math.floor(i / 2) * CARD_W + (CARD_W - CARD_H) / 2,
});
/**
 * Part of a Market Prices card's width, as it lies landscape, showing beside its Region Card; the rest lies under it.
 * Just its price strip, as in rulebook figure 63. At most about 0.79: the room between a Region Card and the edge of
 * the Map area, `(regionGrid.x - map.x - AREA_PAD) / CARD_H`.
 */
const MARKET_SHOWS = 0.17;

export const SPOTS: Spot[] = [
  // Four places, one Region Card each. A spot's place is a portrait card's; the Region Card lies across it.
  ...[0, 1, 2, 3].map(
    (i): Spot => ({
      id: `region-${i + 1}`,
      label: "Region Card",
      area: "map",
      family: "region",
      attracts: true,
      ...regionPlace(i),
      fan: { count: 1 },
      landscape: true,
    }),
  ),
  // Beside the outer edge of each Region Card, partly slid under it (`MARKET_SHOWS`): the Encounter Card
  // giving the region's market prices (rulebook 7.1.2.5). Left of the left ones it is turned a quarter right, so its
  // prices lie beside the goods on the Region Card's left edge; right of the right ones it is turned the other way.
  ...[0, 1, 2, 3].map((i): Spot => {
    const left = i % 2 === 0;
    // Both lie landscape, so the shown part of the card is as wide as its place is away from the Region Card's.
    const offset = (left ? -1 : 1) * Math.round(MARKET_SHOWS * CARD_H);
    return {
      id: `market-${i + 1}`,
      label: "Market Prices",
      hint: "Encounter Card",
      area: "map",
      family: "encounter",
      attracts: false,
      x: regionPlace(i).x + offset,
      y: regionPlace(i).y,
      under: `region-${i + 1}`,
      shows: MARKET_SHOWS,
      fan: { count: 1 },
      landscape: true,
      turn: left ? "right" : "left",
    };
  }),
  {
    id: "character",
    label: "Character Card",
    area: "character",
    family: "character",
    attracts: true,
    ...characterSpot,
  },
  // Slid half under the left side of the Character Card (rulebook 4.2).
  {
    id: "alignment",
    label: "Alignment Card",
    area: "character",
    family: "alignment",
    attracts: true,
    x: characterSpot.x - CARD_W / 2,
    y: characterSpot.y,
    under: "character",
  },
  // Top center. The Storage Card is a Y-card; goods go left and below it, items and money right (rulebook 4.7.4).
  {
    id: "storage",
    label: "Storage Card",
    hint: "any Y-Card",
    area: "storage",
    family: "lost-pages",
    attracts: false,
    ...storageSpot,
  },
  // Slid half under the right side of the Storage Card, and each further one half under the one before, so the amounts
  // on their right halves add up to the sum shown (rulebook 4.3). Each is its own pile, so it can be turned to its amount.
  {
    id: "money",
    label: "Money Card",
    area: "storage",
    family: "money",
    attracts: true,
    x: storageSpot.x + CARD_W / 2,
    y: storageSpot.y,
    under: "storage",
    fan: { count: 3 },
  },
  // Slid under the left side of the Storage Card so only their left third shows, and each further one likewise under
  // the one before (rulebook 4.7.4). Any number of them: once they reach the left edge of the area they close up.
  {
    id: "goods",
    label: "Goods",
    hint: "Encounter Cards",
    area: "storage",
    family: "encounter",
    attracts: false,
    x: goodsX,
    y: storageSpot.y,
    under: "storage",
    shows: GOODS_LEFT_SHOWS,
    fan: { room: goodsX - (storage.x + AREA_PAD) },
  },
  // The same below the Storage Card: only their bottom part shows, each further one under the one before, closing up
  // once they reach the bottom edge of the area.
  {
    id: "goods-below",
    label: "Goods",
    hint: "Encounter Cards",
    area: "storage",
    family: "encounter",
    attracts: false,
    x: storageSpot.x,
    y: goodsBelowY,
    under: "storage",
    shows: GOODS_BELOW_SHOWS,
    fan: { room: storage.y + storage.h - AREA_PAD - CARD_H - goodsBelowY },
  },
  // Below the revealed storybook cards, lying over the bottom edge of the top one. A single card: it takes the
  // Storybook area's only Encounter Card.
  {
    id: "story-encounter",
    label: "Encounter Card",
    area: "storybook",
    family: "encounter",
    attracts: false,
    x: story.x + AREA_PAD,
    y: story.y + AREA_HEADER + Math.round((1 - STORY_COVERED) * CARD_H),
    over: "story-revealed",
    fillsArea: true,
    fan: { count: 1 },
  },
];

/** Fixed places of the storybook: revealed cards on the left, the face-down deck on the right. */
export const STORY_SLOTS = {
  "story-revealed": { x: story.x + AREA_PAD, y: story.y + AREA_HEADER },
  story: { x: story.x + AREA_PAD + CARD_W, y: story.y + AREA_HEADER },
};

/** Where the battlefield is laid out: below the other areas. */
export const BATTLEFIELD_ORIGIN = { x: 0, y: character.y + character.h + GAP };
/** Columns to the right of the Terrain Cards for Enemy Cards with their Hit Point Cards. */
export const ENEMY_COLS = 2;
const ENEMY_GAP = 60;

export function battlefieldArea(b: Battlefield): Area {
  const size = box(b.cols + ENEMY_COLS, Math.max(2, b.rows));
  return {
    id: "battlefield",
    label: "Battlefield",
    x: b.x,
    y: b.y,
    w: size.w + ENEMY_GAP,
    h: size.h,
    accepts: ["terrain", "hitpoints", "lost-pages"],
  };
}

/** Top-left corner of the enemy columns inside the battlefield. */
export function enemyOrigin(b: Battlefield): { x: number; y: number } {
  return {
    x: b.x + AREA_PAD + b.cols * CARD_W + ENEMY_GAP,
    y: b.y + AREA_HEADER,
  };
}

export function allAreas(t: Table): Area[] {
  return t.battlefield ? [...AREAS, battlefieldArea(t.battlefield)] : AREAS;
}

/** The one area for card families that have a dedicated place. */
const HOME_AREA: Partial<Record<Family, string>> = {
  region: "map",
  character: "character",
  alignment: "character",
  money: "storage",
  storybook: "storybook",
  terrain: "battlefield",
  hitpoints: "battlefield",
};

const FAMILY_NAMES: Record<Family, string> = {
  title: "The title card",
  character: "The Character Card",
  alignment: "Alignment Cards",
  money: "Money Cards",
  region: "Region Cards",
  terrain: "Terrain Cards",
  hitpoints: "Hit Point Cards",
  storybook: "Storybook Cards",
  time: "'Time Passes' / 'Next Chapter' cards",
  encounter: "Encounter Cards",
  "lost-pages": "Lost Pages Cards",
};

const SHORT_NAMES: Record<Family, string> = {
  title: "Title",
  character: "Character",
  alignment: "Alignment",
  money: "Money",
  region: "Regions",
  terrain: "Terrain",
  hitpoints: "Hit Points",
  storybook: "Storybook",
  time: "Time",
  encounter: "Encounter Cards",
  "lost-pages": "Y-Cards",
};

/** "Regions · Encounter Cards · Y-Cards" */
export function acceptsText(area: Area): string {
  return area.accepts.map((f) => SHORT_NAMES[f]).join(" · ");
}

/** The area containing a table point (card center). */
export function areaAt(t: Table, x: number, y: number): Area | null {
  return (
    allAreas(t).find(
      (a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h,
    ) ?? null
  );
}

/** Area containing the center of a card whose top-left corner is at (x, y). */
export function areaForCard(t: Table, x: number, y: number): Area | null {
  return areaAt(t, x + CARD_W / 2, y + CARD_H / 2);
}

/** Why these cards may not be placed in `area` (null = allowed; free table space takes anything). */
export function refusal(
  area: Area | null,
  cardIds: string[],
  defs: Record<string, CardDef>,
): string | null {
  if (!area) return null;
  for (const id of cardIds) {
    const f = family(defs[id]);
    if (!f || area.accepts.includes(f)) continue;
    const home = HOME_AREA[f];
    if (!home)
      return `${FAMILY_NAMES[f]} don't belong in the ${area.label} area`;
    return `${FAMILY_NAMES[f]} belong in ${home === "battlefield" ? "the Battlefield" : `the ${AREAS.find((a) => a.id === home)?.label} area`}`;
  }
  return null;
}

/** The spot place a card whose top-left corner is at (x, y) would lie on (same reach as stacking onto a pile). */
function spotAt(
  t: Table,
  x: number,
  y: number,
): { spot: Spot; place: Point } | undefined {
  // An unlimited row reaches one place past its last card.
  const places = (spot: Spot) =>
    spotPlaces(
      spot,
      fanMax(spot) === Infinity ? fanRow(t, spot).length + 1 : undefined,
    );
  // Laid right on the place, or with its middle over the part of the place left showing beside a covering card.
  const shown = (spot: Spot): Point => {
    const side = coveredSide(spot);
    const hidden = 1 - (spot.shows ?? 0.5);
    const dx = side === "left" ? 1 : side === "right" ? -1 : 0;
    const dy = side === "top" ? 1 : side === "bottom" ? -1 : 0;
    const { w, h } = lyingSize(spot);
    return { x: (dx * hidden * w) / 2, y: (dy * hidden * h) / 2 };
  };
  const near = SPOTS.flatMap((spot) =>
    places(spot).map((place) => ({
      spot,
      place,
      d: Math.min(
        Math.hypot(place.x - x, place.y - y),
        Math.hypot(place.x + shown(spot).x - x, place.y + shown(spot).y - y),
      ),
    })),
  );
  // Overlapping places (half under another card, fanned) are close together: take the nearest.
  return near.filter((n) => n.d < CARD_W * 0.4).sort((a, b) => a.d - b.d)[0];
}

/**
 * Table piles back to front as drawn: piles on a spot lie right under the card
 * of the spot covering them, later places of a fanned spot under earlier ones,
 * and piles on a spot lying over a storybook place right above it.
 */
export function drawOrder(t: Table): string[] {
  let z = t.z;
  for (const spot of SPOTS) {
    if (!spot.under && !spot.fan) continue;
    const below = stacksOnSpot(t, spot).reverse();
    if (!below.length) continue;
    const cover = SPOTS.find((s) => s.id === spot.under);
    const above = cover && stacksOnSpot(t, cover)[0];
    const first = Math.min(...below.map((id) => z.indexOf(id)));
    z = z.filter((id) => !below.includes(id));
    z.splice(above ? z.indexOf(above) : first, 0, ...below);
  }
  for (const spot of SPOTS) {
    if (!spot.over) continue;
    const on = stacksOnSpot(t, spot);
    const slot = z.find((id) => t.stacks[id].slot === spot.over);
    if (!on.length || !slot) continue;
    z = z.filter((id) => !on.includes(id));
    z.splice(z.indexOf(slot) + 1, 0, ...on);
  }
  return z;
}

export interface Placement {
  /** Where the cards really go: a new pile at (x, y), or on top of pile `onto`. */
  x: number;
  y: number;
  onto: string | null;
  area: Area | null;
  /** The spot they go to, if any. */
  spot: Spot | null;
  /** Why they can't go there (null = allowed). */
  refused: string | null;
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
  const families = cardIds.map((id) => family(defs[id]));
  const own = ownSpot(
    t,
    SPOTS.filter((s) => s.attracts && families.includes(s.family)),
    moving,
    x,
    y,
  );
  if (own) {
    const area = AREAS.find((a) => a.id === own.area)!;
    const mixed = families.every((f) => f === own.family)
      ? null
      : `The ${own.label} lies alone on its place in the ${area.label} area`;
    const place = spotPlace(t, own, moving, x, y);
    return {
      ...(place ?? { x: own.x, y: own.y, onto: null }),
      area,
      spot: own,
      refused: mixed ?? oneEach(own, cardIds) ?? (place ? null : full(own)),
    };
  }
  const target = onto ? t.stacks[onto] : null;
  const at = { x: target?.x ?? x, y: target?.y ?? y };
  const area = areaForCard(t, at.x, at.y);
  // Nothing stacks onto a card in a fanned row, so dropped on one, the cards go to the place they are dropped on
  // (e.g. the Storage Card place, which the first Goods card overlaps until a Storage Card covers it).
  const fanned =
    !!onto && SPOTS.some((s) => s.fan && fanRow(t, s).includes(onto));
  const taken =
    (fanned && spotAt(t, x, y)) ||
    spotAt(t, at.x, at.y) ||
    areaSpot(area, families);
  if (!taken)
    return {
      x,
      y,
      onto,
      area,
      spot: null,
      refused: refusal(area, cardIds, defs),
    };
  const { spot, place } = taken;
  const fits = families.every((f) => f === spot.family);
  const other = spot.attracts
    ? `Only the ${spot.label} goes on its place`
    : `Only ${FAMILY_NAMES[spot.family]} go on the ${spot.label} place`;
  // A spot takes its cards even in an area that doesn't (the Encounter Card in the Storybook area).
  const refused = fits ? null : (refusal(area, cardIds, defs) ?? other);
  if (!spot.fan)
    return { ...place, onto: pileAt(t, place, moving), area, spot, refused };
  // A card joins a fanned row at the place it is dropped on, never on top of another card.
  const inRow = spotPlace(t, spot, moving, at.x, at.y);
  return {
    ...(inRow ?? { ...place, onto: null }),
    area,
    spot,
    refused: refused ?? oneEach(spot, cardIds) ?? (inRow ? null : full(spot)),
  };
}

/**
 * Of the attracting spots for the dropped cards, the one they go to: the place they are dropped on if it has room,
 * else the one the moved pile lies on, else the first with room (the four Region Card places).
 */
function ownSpot(
  t: Table,
  spots: Spot[],
  moving: string | null,
  x: number,
  y: number,
): Spot | undefined {
  if (spots.length < 2) return spots[0];
  const room = (s: Spot) => !!spotPlace(t, s, moving, x, y);
  const near = spotAt(t, x, y)?.spot;
  return (
    (near && spots.includes(near) && room(near) ? near : undefined) ??
    spots.find((s) => !!moving && stacksOnSpot(t, s).includes(moving)) ??
    spots.find(room) ??
    spots[0]
  );
}

/** The spot taking cards of these families dropped anywhere in `area`, if any. */
function areaSpot(
  area: Area | null,
  families: (Family | undefined)[],
): { spot: Spot; place: Point } | undefined {
  const spot = SPOTS.find(
    (s) =>
      s.fillsArea &&
      s.area === area?.id &&
      families.every((f) => f === s.family),
  );
  return spot && { spot, place: { x: spot.x, y: spot.y } };
}

/** A fanned spot takes one card per place, not a pile. */
function oneEach(spot: Spot, cardIds: string[]): string | null {
  return spot.fan && cardIds.length > 1
    ? `Put ${FAMILY_NAMES[spot.family]} on the ${spot.label} place one at a time`
    : null;
}

function full(spot: Spot): string {
  const area = AREAS.find((a) => a.id === spot.area)!;
  // Several places for the family: they are all taken.
  const max = SPOTS.filter(
    (s) => s.area === spot.area && s.family === spot.family,
  ).reduce((n, s) => n + fanMax(s), 0);
  // A place cards don't find on their own: that one is taken.
  if (max === 1 || !spot.attracts)
    return `There is already a card on the ${spot.label} place in the ${area.label} area`;
  return `The ${area.label} area holds at most ${max} ${FAMILY_NAMES[spot.family]}`;
}
