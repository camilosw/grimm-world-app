import type { Family } from '../cards';
import type { DeckKind } from '../decks';
import { CARD_H, CARD_W, cardBox, tokenSize } from '../lib/engine/geometry';
import type { At, Stack } from '../lib/engine/types';
import type { EncounterPlace } from '../types';
import { addStack, isFixed, setStack } from './piles';
import type { OldTable } from './table';

// Frozen: the table's layout as the saves from before version 3 drew it, and where each pile lies in the game's terms
// (`Stack.at`) read off its coordinates. Those saves hold where each pile was drawn, not where it lies, and their
// migrations move piles by their coordinates. This is the layout of areas.ts as it was then, cut down to what the
// migrations need, with its own areas and spots: it must not change, whatever becomes of the app's layout. A change to
// the app's layout that saves need is a migration of its own, after these.

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Side = 'left' | 'right' | 'top' | 'bottom';

/** A framed part of the table (`AREAS`), at its own place. */
export interface Area extends Rect {
  id: string;
  /** The deck lying on its place in this area. */
  deck?: DeckKind;
}

/** A card-sized place reserved for one card family (see `Spot` in areas.ts, as it was then). */
export interface Spot extends Point {
  id: string;
  area: string;
  family: Family;
  attracts?: boolean;
  under?: string;
  underPile?: { id: string; side: Side };
  shows?: number;
  fan?: { count: number };
  after?: string;
  split?: boolean;
  landscape?: boolean;
  turn?: 'left' | 'right';
  faceDown?: boolean;
  faceUp?: boolean;
  putFaceUp?: boolean;
  addsFirst?: boolean;
  overlaps?: Side;
  upsideDown?: boolean;
  takesPiles?: boolean;
}

// ---------- the areas and spots at their own places ----------

export const AREA_PAD = 40;
export const AREA_HEADER = 90;
export const GAP = 40;
const OWN_GAP = 120;

function box(cols: number, rows: number) {
  return {
    w: cols * CARD_W + AREA_PAD * 2,
    h: rows * CARD_H + AREA_HEADER + AREA_PAD,
  };
}

const MARKET_SHOWS = 0.17;
const marketStrip = Math.round(MARKET_SHOWS * CARD_H);
const map = {
  x: 0,
  y: 0,
  w: 2 * CARD_H + 2 * marketStrip + AREA_PAD * 2,
  h: 2 * CARD_W + AREA_HEADER + AREA_PAD,
};
const BAR_SHOWS = 0.26;
const bar = {
  x: map.x + map.w + OWN_GAP,
  y: 0,
  w: CARD_H + AREA_PAD * 2,
  h: CARD_W + AREA_HEADER + AREA_PAD,
};
const PLACE_GAP = 40;
const PLACE_BUTTON = { gap: 24, h: 76 };
const encounter = {
  x: bar.x + bar.w + OWN_GAP,
  y: 0,
  w: 3 * CARD_W + 2 * PLACE_GAP + AREA_PAD * 2,
  h: CARD_H + PLACE_BUTTON.gap + PLACE_BUTTON.h + AREA_HEADER + AREA_PAD,
};
const character = { x: 0, y: Math.max(map.h, bar.h) + OWN_GAP, ...box(5, 3) };
const storage = { x: character.w + OWN_GAP, y: character.y, ...box(5, 3) };
const STORY_COVERED = 0.15;
const story = {
  x: storage.x + storage.w + OWN_GAP,
  y: character.y,
  ...box(2, 2 - STORY_COVERED),
};
/** The decks lying in areas of their own, in the order of their areas. */
export const TABLE_DECKS: DeckKind[] = ['quest', 'enemy', 'training', 'banned'];
const deckBox = box(1, 1);
const deckArea = (i: number) => ({
  x: story.x + story.w + OWN_GAP + i * (deckBox.w + OWN_GAP),
  y: character.y,
  w: deckBox.w,
  // The Training Deck's area has room for its Browse button.
  h:
    deckBox.h +
    (TABLE_DECKS[i] === 'training' ? PLACE_BUTTON.gap + PLACE_BUTTON.h : 0),
});
const HOUSE_ABOVE_SHOWS = 0.27;
const HOUSE_BELOW_SHOWS = 0.42;
const HOUSE_SIDE_SHOWS = 0.5;
const HOUSE_SIDE_CARDS = 2;
const GOODS_LEFT_SHOWS = 0.31;
const HOME_GOODS_CARDS = 16;
const EQUIPMENT_SHOWS = 0.15;
const EQUIPMENT_CARDS = 4;
const HOME_LEFT =
  HOUSE_SIDE_CARDS * HOUSE_SIDE_SHOWS + HOME_GOODS_CARDS * GOODS_LEFT_SHOWS;
const HOME_RIGHT =
  HOUSE_SIDE_CARDS * HOUSE_SIDE_SHOWS + EQUIPMENT_CARDS * EQUIPMENT_SHOWS;
const home = {
  x: story.x,
  y: story.y + story.h + OWN_GAP,
  ...box(HOME_LEFT + 1 + HOME_RIGHT, 1 + HOUSE_ABOVE_SHOWS + HOUSE_BELOW_SHOWS),
};
const HAND_SHOWS = 0.22;
const hand = {
  x: deckArea(TABLE_DECKS.length).x,
  y: character.y,
  w: 2 * CARD_W + PLACE_GAP + AREA_PAD * 2,
  h: 2 * CARD_H + PLACE_GAP + AREA_HEADER + AREA_PAD,
};
const GRID_STRIP = 50;
const ENEMY_COLS = 2;
const ENEMY_ROWS = 2;
const ENEMY_GAP = 60;
const HP_DROP = Math.round(0.715 * CARD_H);
const HP_SHIFT = Math.round(0.14 * CARD_W);
const ENEMY_SLOT = { w: CARD_W + 2 * HP_SHIFT, h: HP_DROP + CARD_H };
const ENEMY_BLOCK = {
  w: ENEMY_COLS * ENEMY_SLOT.w + (ENEMY_COLS - 1) * PLACE_GAP,
  h: ENEMY_ROWS * ENEMY_SLOT.h + (ENEMY_ROWS - 1) * PLACE_GAP,
};
const battlefield = {
  x: home.x + home.w + OWN_GAP,
  y: home.y,
  w: CARD_H + 2 * GRID_STRIP + ENEMY_GAP + ENEMY_BLOCK.w + AREA_PAD * 2,
  h: 2 * CARD_H + AREA_HEADER + AREA_PAD,
};

export const AREAS: Area[] = [
  { id: 'map', ...map },
  { id: 'bar', ...bar },
  { id: 'encounter', ...encounter },
  { id: 'character', ...character },
  { id: 'storage', ...storage },
  { id: 'storybook', ...story },
  ...TABLE_DECKS.map((kind, i): Area => ({
    id: kind,
    ...deckArea(i),
    deck: kind,
  })),
  { id: 'hand', ...hand },
  { id: 'home', ...home },
  { id: 'battlefield', ...battlefield },
];

const characterSpot = {
  x: character.x + AREA_PAD + 2 * CARD_W,
  y: character.y + AREA_HEADER,
};
const storageSpot = {
  x: storage.x + (storage.w - CARD_W) / 2,
  y: storage.y + AREA_HEADER,
};
const houseSideStep = Math.round(HOUSE_SIDE_SHOWS * CARD_W);
const houseSpot = {
  x: Math.round(home.x + AREA_PAD + HOME_LEFT * CARD_W),
  y: Math.round(home.y + AREA_HEADER + HOUSE_ABOVE_SHOWS * CARD_H),
};
const UPGRADES_SHOWS = 0.15;
const QUESTS_SHOWS = 0.26;
const TITLES_SHOWS = 0.21;
const SKILLS_SHOWS = 0.14;
const BROKEN_SHOWS = 0.16;
const GOODS_BELOW_SHOWS = 0.21;
const goodsX = Math.round(storageSpot.x - GOODS_LEFT_SHOWS * CARD_W);
const goodsBelowY = Math.round(storageSpot.y + GOODS_BELOW_SHOWS * CARD_H);
const barSpot = {
  x: bar.x + AREA_PAD + (CARD_H - CARD_W) / 2 + Math.round(BAR_SHOWS * CARD_H),
  y: bar.y + AREA_HEADER + (CARD_W - CARD_H) / 2,
};
const regionGrid = {
  x: map.x + AREA_PAD + marketStrip,
  y: map.y + AREA_HEADER,
};
const handSpot = { x: hand.x + AREA_PAD, y: hand.y + AREA_HEADER };

export const SPOTS: Spot[] = [
  {
    id: 'bar',
    area: 'bar',
    family: 'lost-pages',
    ...barSpot,
    shows: BAR_SHOWS,
    fan: { count: Infinity },
    landscape: true,
    turn: 'left',
    faceDown: true,
    addsFirst: true,
    takesPiles: true,
  },
  {
    id: 'character',
    area: 'character',
    family: 'character',
    attracts: true,
    ...characterSpot,
  },
  {
    id: 'alignment',
    area: 'character',
    family: 'alignment',
    attracts: true,
    x: characterSpot.x - CARD_W / 2,
    y: characterSpot.y,
    under: 'character',
  },
  {
    id: 'titles',
    area: 'character',
    family: 'lost-pages',
    x: characterSpot.x,
    y: characterSpot.y - Math.round(TITLES_SHOWS * CARD_H),
    under: 'character',
    shows: TITLES_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
  },
  {
    id: 'skills',
    area: 'character',
    family: 'lost-pages',
    x: characterSpot.x + 1,
    y: characterSpot.y - Math.round(SKILLS_SHOWS * CARD_H),
    under: 'titles',
    after: 'titles',
    split: true,
    shows: SKILLS_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
  },
  {
    id: 'upgrades',
    area: 'character',
    family: 'lost-pages',
    x: characterSpot.x + Math.round(UPGRADES_SHOWS * CARD_W),
    y: characterSpot.y,
    under: 'character',
    shows: UPGRADES_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
    faceUp: true,
  },
  {
    id: 'quests',
    area: 'character',
    family: 'lost-pages',
    x: characterSpot.x,
    y: characterSpot.y + Math.round(QUESTS_SHOWS * CARD_H),
    under: 'character',
    shows: QUESTS_SHOWS,
    fan: { count: Infinity },
  },
  {
    id: 'storage',
    area: 'storage',
    family: 'lost-pages',
    ...storageSpot,
  },
  {
    id: 'broken',
    area: 'storage',
    family: 'encounter',
    x: storageSpot.x,
    y: storageSpot.y - Math.round(BROKEN_SHOWS * CARD_H),
    under: 'storage',
    shows: BROKEN_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
    faceUp: true,
  },
  {
    id: 'items',
    area: 'storage',
    family: 'encounter',
    x: storageSpot.x + Math.round(UPGRADES_SHOWS * CARD_W),
    y: storageSpot.y + 1,
    under: 'storage',
    shows: UPGRADES_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
    faceUp: true,
  },
  {
    id: 'money',
    area: 'storage',
    family: 'money',
    attracts: true,
    x: storageSpot.x + CARD_W / 2,
    y: storageSpot.y,
    under: 'items',
    after: 'items',
    split: true,
    fan: { count: 3 },
  },
  {
    id: 'goods',
    area: 'storage',
    family: 'encounter',
    x: goodsX,
    y: storageSpot.y,
    under: 'storage',
    shows: GOODS_LEFT_SHOWS,
    fan: { count: Infinity },
  },
  {
    id: 'goods-below',
    area: 'storage',
    family: 'encounter',
    x: storageSpot.x,
    y: goodsBelowY,
    under: 'storage',
    shows: GOODS_BELOW_SHOWS,
    fan: { count: Infinity },
  },
  {
    id: 'story-encounter',
    area: 'storybook',
    family: 'encounter',
    x: story.x + AREA_PAD,
    y: story.y + AREA_HEADER + Math.round((1 - STORY_COVERED) * CARD_H),
    fan: { count: 1 },
    putFaceUp: true,
  },
  {
    id: 'hand',
    area: 'hand',
    family: 'lost-pages',
    ...handSpot,
    shows: HAND_SHOWS,
    fan: { count: Infinity },
    overlaps: 'bottom',
    upsideDown: true,
    faceUp: true,
    takesPiles: true,
  },
  {
    id: 'discard',
    area: 'hand',
    family: 'lost-pages',
    x: handSpot.x + CARD_W + PLACE_GAP,
    y: handSpot.y,
    upsideDown: true,
  },
  {
    id: 'damage',
    area: 'hand',
    family: 'lost-pages',
    x: handSpot.x + CARD_W + PLACE_GAP,
    y: handSpot.y + CARD_H + PLACE_GAP,
  },
  {
    id: 'house',
    area: 'home',
    family: 'lost-pages',
    ...houseSpot,
  },
  ...(['left', 'right'] as const).map((side): Spot => ({
    id: `house-${side}`,
    area: 'home',
    family: 'lost-pages',
    x: houseSpot.x + (side === 'left' ? -1 : 1) * houseSideStep,
    y: houseSpot.y,
    under: 'house',
    shows: HOUSE_SIDE_SHOWS,
    fan: { count: HOUSE_SIDE_CARDS },
  })),
  {
    id: 'house-above',
    area: 'home',
    family: 'lost-pages',
    x: houseSpot.x,
    y: houseSpot.y - Math.round(HOUSE_ABOVE_SHOWS * CARD_H),
    under: 'house',
    shows: HOUSE_ABOVE_SHOWS,
    fan: { count: 1 },
  },
  {
    id: 'house-below',
    area: 'home',
    family: 'lost-pages',
    x: houseSpot.x,
    y: houseSpot.y + Math.round(HOUSE_BELOW_SHOWS * CARD_H),
    under: 'house',
    shows: HOUSE_BELOW_SHOWS,
    fan: { count: 1 },
  },
  {
    id: 'home-goods',
    area: 'home',
    family: 'encounter',
    x:
      houseSpot.x -
      HOUSE_SIDE_CARDS * houseSideStep -
      Math.round(GOODS_LEFT_SHOWS * CARD_W),
    y: houseSpot.y,
    under: 'house-left',
    shows: GOODS_LEFT_SHOWS,
    fan: { count: HOME_GOODS_CARDS },
  },
  {
    id: 'home-equipment',
    area: 'home',
    family: 'encounter',
    x:
      houseSpot.x +
      HOUSE_SIDE_CARDS * houseSideStep +
      Math.round(EQUIPMENT_SHOWS * CARD_W),
    y: houseSpot.y,
    under: 'house-right',
    shows: EQUIPMENT_SHOWS,
    fan: { count: EQUIPMENT_CARDS },
  },
];

/** Fixed places of the storybook: revealed cards on the left, the face-down deck on the right. */
export const STORY_SLOTS = {
  'story-revealed': { x: story.x + AREA_PAD, y: story.y + AREA_HEADER },
  story: { x: story.x + AREA_PAD + CARD_W, y: story.y + AREA_HEADER },
};

/** The Encounter Deck area's places, left to right. */
export const ENCOUNTER_PLACES: EncounterPlace[] = [
  'time-passes',
  'next-chapter',
  'used',
];

/** Where an Encounter Deck place lies on this table. */
export function encounterPlace(t: OldTable, place: EncounterPlace): Point {
  const i = ENCOUNTER_PLACES.indexOf(place);
  const d = shiftOf(t, 'encounter');
  return {
    x: encounter.x + AREA_PAD + i * (CARD_W + PLACE_GAP) + d.x,
    y: encounter.y + AREA_HEADER + d.y,
  };
}

/** Place of a table deck in its area, as it lies on this table. */
export function deckPlace(t: OldTable, kind: DeckKind): Point {
  const area = AREAS.find((a) => a.deck === kind)!;
  const d = shiftOf(t, area.id);
  return { x: area.x + AREA_PAD + d.x, y: area.y + AREA_HEADER + d.y };
}

/** Where the battlefield lay before it was an area of its own: the height below the areas' own places. */
export const BATTLEFIELD_ORIGIN = {
  x: 0,
  y: character.y + character.h + OWN_GAP,
};

const NO_SHIFT: Point = { x: 0, y: 0 };

/** How far an area and everything in it lies from its own place (`Table.shifts`). */
export function shiftOf(t: OldTable, area: string): Point {
  return t.shifts?.[area] ?? NO_SHIFT;
}

// ---------- the spots' rows ----------

function fanMax(spot: Spot): number {
  return spot.fan?.count ?? 1;
}

const OPPOSITE: Record<Side, Side> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

function growth(spot: Spot): Side {
  const side = coveredSide(spot);
  return spot.overlaps ?? (side ? OPPOSITE[side] : 'right');
}

function vertical(spot: Spot): boolean {
  const side = growth(spot);
  return side === 'top' || side === 'bottom';
}

function lyingSize(spot: Spot): { w: number; h: number } {
  const { width, height } = cardBox(0, 0, !!spot.landscape);
  return { w: width, h: height };
}

function fanStep(spot: Spot): number {
  const side = growth(spot);
  const dir = side === 'left' || side === 'top' ? -1 : 1;
  const size = lyingSize(spot);
  return dir * (spot.shows ?? 0.5) * (vertical(spot) ? size.h : size.w);
}

/** Top-left corners of a spot's places: one, or the first `n` of a fanned spot's row. */
function spotPlaces(spot: Spot, n = 1): Point[] {
  const step = fanStep(spot);
  const [dx, dy] = vertical(spot) ? [0, step] : [step, 0];
  return Array.from({ length: spot.fan ? n : 1 }, (_, i) => ({
    x: Math.round(spot.x + i * dx),
    y: Math.round(spot.y + i * dy),
  }));
}

function freePlace(t: OldTable, spot: Spot): Point {
  if (spot.addsFirst)
    return { x: Math.round(spot.x - fanStep(spot)), y: spot.y };
  const n = spot.fan ? row(t, spot).length : 0;
  return spotPlaces(spot, n + 1)[n];
}

function freePlaces(t: OldTable, spot: Spot): Point[] {
  const first = freePlace(t, spot);
  const n = spot.addsFirst ? row(t, spot).length : 0;
  return n ? [first, spotPlaces(spot, n + 1)[n]] : [first];
}

const SPLIT_SHOWS = 0.3;

function splitBox(t: OldTable, spot: Spot): Rect {
  const partner = spotsOf(t).find((s) => s.id === spot.after);
  const { w, h } = lyingSize(spot);
  const free = freePlace(t, spot);
  const shows = spot.shows ?? 0.5;
  const size = Math.max(shows, partner?.shows ?? 0.5, SPLIT_SHOWS);
  const x = Math.min(spot.x, partner?.x ?? spot.x);
  const y = Math.min(spot.y, partner?.y ?? spot.y);
  switch (growth(spot)) {
    case 'top': {
      const edge = free.y + Math.round(shows * h);
      return { x, y: edge - Math.round(size * h), w, h: Math.round(size * h) };
    }
    case 'bottom':
      return {
        x,
        y: free.y + Math.round((1 - shows) * h),
        w,
        h: Math.round(size * h),
      };
    case 'left': {
      const edge = free.x + Math.round(shows * w);
      return { x: edge - Math.round(size * w), y, w: Math.round(size * w), h };
    }
    case 'right':
      return {
        x: free.x + Math.round((1 - shows) * w),
        y,
        w: Math.round(size * w),
        h,
      };
  }
}

function fanHasPlace(t: OldTable, spot: Spot): boolean {
  return row(t, spot).length < fanMax(spot);
}

const FAN_GAP = 3;

/** Table piles lying on a spot's places by their coordinates, in place order. */
export function onSpot(t: OldTable, spot: Spot): string[] {
  if (spot.fan) return row(t, spot);
  return t.z.filter(
    (id) => t.stacks[id].x === spot.x && t.stacks[id].y === spot.y,
  );
}

/**
 * Piles lying in a fanned spot's row by their coordinates, from its first place on: each at most `FAN_GAP` places
 * beyond the one before, at most `count` of them.
 */
function row(t: OldTable, spot: Spot): string[] {
  const step = Math.abs(fanStep(spot));
  const v = vertical(spot);
  const along = (id: string) =>
    (v ? t.stacks[id].y - spot.y : t.stacks[id].x - spot.x) *
    Math.sign(fanStep(spot));
  const before = spot.after && SPOTS.find((s) => s.id === spot.after);
  const behind = before ? Math.abs(fanStep(before)) + 1 : 1;
  const inLine = t.z
    .filter(
      (id) =>
        !t.stacks[id].deck &&
        !t.stacks[id].place &&
        !t.stacks[id].slot &&
        (v ? t.stacks[id].x === spot.x : t.stacks[id].y === spot.y) &&
        along(id) >= -behind,
    )
    .sort((a, b) => along(a) - along(b));
  const found: string[] = [];
  let reach = FAN_GAP * step + 1;
  for (const id of inLine) {
    if (along(id) > reach || found.length >= fanMax(spot)) break;
    found.push(id);
    reach = along(id) + FAN_GAP * step + 1;
  }
  return found;
}

/** Which side of a spot's card is covered by the card of the spot it lies under. */
function coveredSide(spot: Spot): Side | null {
  if (spot.underPile) return spot.underPile.side;
  const before = spot.after && SPOTS.find((s) => s.id === spot.after);
  const cover = SPOTS.find(
    (s) => s.id === (before ? before.under : spot.under),
  );
  if (!cover) return null;
  spot = SPOTS.find((s) => s.id === spot.id) ?? spot;
  if (Math.abs(cover.x - spot.x) > Math.abs(cover.y - spot.y))
    return cover.x > spot.x ? 'right' : 'left';
  return cover.y > spot.y ? 'bottom' : 'top';
}

/**
 * Where a card added to a spot lands, as the app put it there then (dropped far from the row): onto the pile on a spot
 * of a single place; at the end of a fanned row, or at its front for a row taking new cards first, half a unit beside
 * the pile there (`settleSpots()` then lays it onto its place); null when the row is full. The row is read off the
 * piles' `Stack.at`, recorded first (`settleAt()`).
 */
export function addedPlace(
  t: OldTable,
  spot: Spot,
): (Point & { onto: string | null }) | null {
  const rowIds = t.z
    .filter((id) => {
      const at = t.stacks[id].at;
      return !!at && 'spot' in at && at.spot === spot.id;
    })
    .sort((a, b) => indexOf(t, a) - indexOf(t, b));
  if (!spot.fan) return { x: spot.x, y: spot.y, onto: rowIds[0] ?? null };
  if (rowIds.length >= fanMax(spot)) return null;
  if (!rowIds.length) return { x: spot.x, y: spot.y, onto: null };
  const [d, id] = spot.addsFirst
    ? [-0.5, rowIds[0]]
    : [0.5, rowIds[rowIds.length - 1]];
  const shift = d * Math.sign(fanStep(spot));
  return vertical(spot)
    ? { x: spot.x, y: t.stacks[id].y + shift, onto: null }
    : { x: t.stacks[id].x + shift, y: spot.y, onto: null };
}

function indexOf(t: OldTable, id: string): number {
  const at = t.stacks[id].at;
  return at && 'spot' in at ? at.index : 0;
}

// ---------- the grids ----------

type GridId = 'map' | 'battlefield';

const GRIDS: GridId[] = ['map', 'battlefield'];

function gridOrigin(t: OldTable, g: GridId): Point {
  const d = shiftOf(t, g);
  const own =
    g === 'map'
      ? regionGrid
      : {
          x: battlefield.x + AREA_PAD + GRID_STRIP,
          y: battlefield.y + AREA_HEADER + GRID_STRIP,
        };
  return { x: own.x + d.x, y: own.y + d.y };
}

const MAP_COLS = 2;

function grows(g: GridId, col: number, side: Side): boolean {
  if (g === 'battlefield') return true;
  return side === 'top' || (side === 'right' && col < MAP_COLS - 1);
}

function cellPlace(t: OldTable, g: GridId, col: number, row: number): Point {
  const o = gridOrigin(t, g);
  return {
    x: o.x + col * CARD_H + (CARD_H - CARD_W) / 2,
    y: o.y + row * CARD_W - (CARD_H - CARD_W) / 2,
  };
}

/** Where a Terrain Card lies on the battlefield grid's place (`col`, `row`). */
export function terrainPlace(t: OldTable, col: number, row: number): Point {
  return cellPlace(t, 'battlefield', col, row);
}

function cellBox(t: OldTable, g: GridId, col: number, row: number): Rect {
  const o = gridOrigin(t, g);
  return { x: o.x + col * CARD_H, y: o.y + row * CARD_W, w: CARD_H, h: CARD_W };
}

const cellKey = (col: number, row: number) => `${col},${row}`;

const gridCache: Record<GridId, WeakMap<OldTable, Map<string, string>>> = {
  map: new WeakMap(),
  battlefield: new WeakMap(),
};

/**
 * The piles lying on a grid's places by their coordinates, by "col,row". Piles of fixed places and on spots elsewhere
 * never count, nor the other grid's.
 */
function grid(t: OldTable, g: GridId): Map<string, string> {
  let found = gridCache[g].get(t);
  if (found) return found;
  found = new Map();
  const o = cellPlace(t, g, 0, 0);
  const elsewhere = new Set(baseSpots(t).flatMap((sp) => onSpot(t, sp)));
  if (g === 'battlefield') {
    for (const id of grid(t, 'map').values()) elsewhere.add(id);
    for (const sp of mapSpots(t))
      for (const id of onSpot(t, sp)) elsewhere.add(id);
  }
  for (const id of t.z) {
    const s = t.stacks[id];
    if (s.slot || s.deck || s.place || elsewhere.has(id)) continue;
    const col = (s.x - o.x) / CARD_H;
    const row = (s.y - o.y) / CARD_W;
    const c = Math.round(col);
    const r = Math.round(row);
    if (Math.abs(col - c) * CARD_H < 0.5 && Math.abs(row - r) * CARD_W < 0.5)
      found.set(cellKey(c, r), id);
  }
  gridCache[g].set(t, found);
  return found;
}

function gridCells(
  t: OldTable,
  g: GridId,
): { col: number; row: number; id: string }[] {
  return [...grid(t, g)].map(([key, id]) => {
    const [col, row] = key.split(',').map(Number);
    return { col, row, id };
  });
}

function gridBox(t: OldTable, g: GridId): Rect {
  const cells = [...grid(t, g).keys()];
  const boxes = (cells.length ? cells : [cellKey(0, 0)]).map((k) => {
    const [c, r] = k.split(',').map(Number);
    const b = cellBox(t, g, c, r);
    const reach = (side: Side) => (grows(g, c, side) ? GRID_STRIP : 0);
    return {
      x: b.x - reach('left'),
      y: b.y - reach('top'),
      w: b.w + reach('left') + reach('right'),
      h: b.h + reach('top') + reach('bottom'),
    };
  });
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map(rightOf));
  const bottom = Math.max(...boxes.map(bottomOf));
  return { x, y, w: right - x, h: bottom - y };
}

function battlefieldBoxes(t: OldTable): { grid: Rect; enemies: Rect } {
  const field = gridBox(t, 'battlefield');
  const enemies = {
    x: rightOf(field) + ENEMY_GAP,
    y: field.y,
    w: ENEMY_BLOCK.w,
    h: Math.max(field.h, ENEMY_BLOCK.h),
  };
  return { grid: field, enemies };
}

const marketCache = new WeakMap<OldTable, Spot[]>();

/** The Market Prices places beside the Region Cards on the Map's grid, under them. */
function mapSpots(t: OldTable): Spot[] {
  let spots = marketCache.get(t);
  if (spots) return spots;
  spots = [...grid(t, 'map')].map(([key, id]): Spot => {
    const [col, row] = key.split(',').map(Number);
    const side = col % 2 ? 'right' : 'left';
    const p = cellPlace(t, 'map', col, row);
    return {
      id: `market-${key}`,
      area: 'map',
      family: 'encounter',
      x: p.x + (side === 'left' ? -marketStrip : marketStrip),
      y: p.y,
      underPile: { id, side: OPPOSITE[side] },
      shows: MARKET_SHOWS,
      fan: { count: 1 },
      landscape: true,
      turn: side === 'left' ? 'right' : 'left',
    };
  });
  marketCache.set(t, spots);
  return spots;
}

/** The battlefield's Enemy Card places, right of its Terrain Cards, each with its Hit Point Card's places. */
function battlefieldSpots(t: OldTable): Spot[] {
  const { enemies } = battlefieldBoxes(t);
  return Array.from({ length: ENEMY_COLS * ENEMY_ROWS }, (_, i): Spot[] => {
    const n = i + 1;
    const x = Math.round(
      enemies.x + HP_SHIFT + (i % ENEMY_COLS) * (ENEMY_SLOT.w + PLACE_GAP),
    );
    const y = Math.round(
      enemies.y + Math.floor(i / ENEMY_COLS) * (ENEMY_SLOT.h + PLACE_GAP),
    );
    const hp = (id: string, dx: number, dy: number): Spot => ({
      id,
      area: 'battlefield',
      family: 'hitpoints',
      x: x + dx,
      y: y + dy,
    });
    return [
      {
        id: `enemy-${n}`,
        area: 'battlefield',
        family: 'lost-pages',
        x,
        y,
        faceUp: true,
      },
      hp(`hp-${n}`, -HP_SHIFT, HP_DROP),
      hp(`hp-${n}-spent`, HP_SHIFT, HP_DROP),
      hp(`hp-${n}-defeated`, 0, 1),
    ];
  }).flat();
}

/**
 * Keep the cards on the battlefield's Enemy Card places on them as the places move with the grid's edge, and remember
 * where they lie from the grid (`OldTable.enemies`).
 */
function settleEnemies(t: OldTable): OldTable {
  const o = terrainPlace(t, 0, 0);
  const { enemies } = battlefieldBoxes(t);
  const at = { x: enemies.x - o.x, y: enemies.y - o.y };
  const was = t.enemies;
  if (was && was.x === at.x && was.y === at.y) return t;
  let stacks = t.stacks;
  if (was) {
    const dx = Math.round(at.x - was.x);
    const dy = Math.round(at.y - was.y);
    const moved = new Set<string>();
    for (const s of battlefieldSpots(t))
      for (const id of t.z) {
        const p = stacks[id];
        if (moved.has(id) || p.x !== s.x - dx || p.y !== s.y - dy) continue;
        stacks = { ...stacks, [id]: { ...p, x: s.x, y: s.y } };
        moved.add(id);
      }
  }
  return { ...t, stacks, enemies: at };
}

// ---------- the spots and areas as they lie ----------

const GROWING = [
  'map',
  'bar',
  'character',
  'storage',
  'hand',
  'home',
  'battlefield',
];

const shiftedSpots = new WeakMap<OldTable, Spot[]>();
const tableSpots = new WeakMap<OldTable, Spot[]>();

/** The spots as they lie on this table, the rows and grids they lie beyond read off the coordinates. */
export function spotsOf(t: OldTable): Spot[] {
  let spots = tableSpots.get(t);
  if (!spots) {
    spots = [...baseSpots(t), ...mapSpots(t), ...battlefieldSpots(t)];
    tableSpots.set(t, spots);
  }
  return spots;
}

/** The spots of the areas (`SPOTS`) as they lie on this table: all but the grids'. */
function baseSpots(t: OldTable): Spot[] {
  let spots = shiftedSpots.get(t);
  if (!spots) {
    spots = SPOTS.map((s) => {
      const d = shiftOf(t, s.area);
      return d.x || d.y ? { ...s, x: s.x + d.x, y: s.y + d.y } : s;
    });
    spots = spots.map((s, _, all) => {
      const before = s.after && all.find((b) => b.id === s.after);
      const cover = before && all.find((b) => b.id === before.under);
      if (!before || !cover) return s;
      const n = row(t, before).length;
      const last = n ? spotPlaces(before, n)[n - 1] : cover;
      return vertical(before)
        ? { ...s, y: s.y + last.y - cover.y }
        : { ...s, x: s.x + last.x - cover.x };
    });
    shiftedSpots.set(t, spots);
  }
  return spots;
}

function framedPlaces(t: OldTable, spot: Spot): Point[] {
  if (!spot.fan) return [spot];
  if (spot.addsFirst) return freePlaces(t, spot);
  const n = row(t, spot).length;
  const last = spotPlaces(spot, n)[n - 1];
  const places = [spot, fanHasPlace(t, spot) ? freePlace(t, spot) : last];
  if (!spot.split) return places;
  const split = splitBox(t, spot);
  const { w, h } = lyingSize(spot);
  const side = growth(spot);
  return [
    ...places,
    {
      x: side === 'right' ? split.x + split.w - w : split.x,
      y: side === 'bottom' ? split.y + split.h - h : split.y,
    },
  ];
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function cardRect(x: number, y: number, landscape = false): Rect {
  const b = cardBox(x, y, landscape);
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}

function frameAround(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x)) - AREA_PAD;
  const y = Math.min(...boxes.map((b) => b.y)) - AREA_HEADER;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + AREA_PAD;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + AREA_PAD;
  return { x, y, w: right - x, h: bottom - y };
}

function mostOverlapped<R extends Rect & { id: string }>(
  frames: R[],
  x: number,
  y: number,
): R | undefined {
  const card = cardRect(x, y);
  let best: R | undefined;
  let most = 0;
  for (const f of frames) {
    const o = overlap(f, card);
    if (o > most) [best, most] = [f, o];
  }
  return best;
}

interface Measured {
  /** The areas where they lie on this table. */
  areas: Area[];
  /** The area each table pile belongs to (none: it lies outside the areas). */
  owner: Map<string, string>;
}

const measured = new WeakMap<OldTable, Measured>();

/**
 * The areas as they lie on this table, and the area each table pile belongs to: the area of fixed size containing its
 * center (the storybook places: the Storybook area), else the growing area it overlaps most. The growing areas start
 * as framed when last laid out (`OldTable.frames`); then each is framed around its places and piles, taking in any
 * further pile it comes to overlap.
 */
function measure(t: OldTable): Measured {
  const known = measured.get(t);
  if (known) return known;
  const spots = spotsOf(t);
  const fixed: Area[] = AREAS.filter((a) => !GROWING.includes(a.id)).map(
    (a) => {
      const d = shiftOf(t, a.id);
      return { ...a, x: a.x + d.x, y: a.y + d.y };
    },
  );
  const owner = new Map<string, string>();
  const loose: string[] = [];
  const onSpots = new Map(
    spots.flatMap((sp) => onSpot(t, sp).map((id) => [id, sp.area])),
  );
  for (const g of GRIDS)
    for (const id of grid(t, g).values()) onSpots.set(id, g);
  for (const id of t.z) {
    const s = t.stacks[id];
    const area = s.slot
      ? 'storybook'
      : (onSpots.get(id) ??
        fixed.find((a) => inRect(a, s.x + CARD_W / 2, s.y + CARD_H / 2))?.id);
    if (area) owner.set(id, area);
    else loose.push(id);
  }
  const wide = new Set(
    spots.filter((s) => s.landscape).flatMap((s) => onSpot(t, s)),
  );
  const field = battlefieldBoxes(t);
  const frame = (area: string) => ({
    id: area,
    ...frameAround([
      ...(area === 'battlefield'
        ? [field.grid, field.enemies]
        : area === 'map'
          ? [gridBox(t, 'map')]
          : []),
      ...spots
        .filter((s) => s.area === area)
        .flatMap((s) =>
          framedPlaces(t, s).map((p) => cardRect(p.x, p.y, !!s.landscape)),
        ),
      ...loose
        .filter((id) => owner.get(id) === area)
        .map((id) => cardRect(t.stacks[id].x, t.stacks[id].y, wide.has(id))),
    ]),
  });
  const takeIn = (frames: (Rect & { id: string })[]) => {
    let taken = false;
    for (const id of loose) {
      const f =
        !owner.has(id) &&
        mostOverlapped(frames, t.stacks[id].x, t.stacks[id].y);
      if (!f) continue;
      owner.set(id, f.id);
      taken = true;
    }
    return taken;
  };
  takeIn(GROWING.map((id) => ({ id, ...(t.frames?.[id] ?? frame(id)) })));
  let frames = GROWING.map(frame);
  while (takeIn(frames)) frames = GROWING.map(frame);
  const areas = AREAS.map((a) => {
    const f = frames.find((f) => f.id === a.id);
    return f ? { ...a, ...f } : fixed.find((b) => b.id === a.id)!;
  });
  const m = { areas, owner };
  measured.set(t, m);
  return m;
}

/** The areas as they lie on this table (`measure()`). */
export function areasOf(t: OldTable): Area[] {
  return measure(t).areas;
}

/**
 * The area a card whose top-left corner is at (x, y) lies in: the area of fixed size containing its center, else the
 * growing area it overlaps most.
 */
function areaForCard(t: OldTable, x: number, y: number): Area | null {
  const areas = areasOf(t);
  return (
    areas.find(
      (a) =>
        !GROWING.includes(a.id) && inRect(a, x + CARD_W / 2, y + CARD_H / 2),
    ) ??
    mostOverlapped(
      areas.filter((a) => GROWING.includes(a.id)),
      x,
      y,
    ) ??
    null
  );
}

// ---------- where each pile lies ----------

/**
 * Where each table pile lies in the game's terms, read off where it lies: its fixed place, the grid place or spot it
 * lies on (the grid first), else loose in the area `measure()` gives it to, from that area's own corner, else loose on
 * the table.
 */
function placesOf(t: OldTable): Map<string, At> {
  const { owner } = measure(t);
  const at = new Map<string, At>();
  for (const g of GRIDS)
    for (const { col, row, id } of gridCells(t, g))
      at.set(id, { grid: g, col, row });
  for (const spot of spotsOf(t))
    onSpot(t, spot).forEach((id, index) => {
      if (!at.has(id)) at.set(id, { spot: spot.id, index });
    });
  for (const id of t.z) {
    const s = t.stacks[id];
    const place = s.place ?? s.slot ?? s.deck;
    if (place) at.set(id, { place });
    if (at.has(id)) continue;
    const area = AREAS.find((a) => a.id === owner.get(id));
    if (!area) {
      at.set(id, { x: s.x, y: s.y });
      continue;
    }
    const d = shiftOf(t, area.id);
    at.set(id, { area: area.id, x: s.x - area.x - d.x, y: s.y - area.y - d.y });
  }
  return at;
}

function sameAt(a: At | undefined, b: At): boolean {
  if (!a) return false;
  const was: Record<string, unknown> = a;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(b).every(([k, v]) => was[k] === v)
  );
}

/**
 * Record where each table pile lies in the game's terms (`Stack.at`, `placesOf()`), read off where it lies, and forget
 * it for the piles in the sidebar or set aside. Returns the same table when nothing changes.
 */
export function settleAt(t: OldTable): OldTable {
  const at = placesOf(t);
  let stacks: Record<string, Stack> | undefined;
  for (const [id, s] of Object.entries(t.stacks)) {
    const now = at.get(id);
    if (now ? sameAt(s.at, now) : !s.at) continue;
    stacks ??= { ...t.stacks };
    const next = { ...s };
    if (now) next.at = now;
    else delete next.at;
    stacks[id] = next;
  }
  return stacks ? { ...t, stacks } : t;
}

// ---------- laying the areas out ----------

const bottomOf = (r: Rect) => r.y + r.h;
const rightOf = (r: Rect) => r.x + r.w;

function bottomUnder(
  areas: Iterable<Rect>,
  x: number,
  w: number,
  top: number,
): number {
  let bottom = top;
  for (const r of areas)
    if (r.x < x + w + GAP && rightOf(r) + GAP > x)
      bottom = Math.max(bottom, bottomOf(r) + GAP);
  return bottom;
}

const ABOVE_PLAY = ['bar', 'map', 'encounter', 'storybook'];

const DECK_BLOCK: DeckKind[][] = [
  ['banned', 'enemy'],
  ['quest', 'training'],
];

function battlefieldPlace(laid: Map<string, Rect>, w: number): Point {
  const homeRect = laid.get('home')!;
  const x = rightOf(homeRect) + GAP;
  const below = [...laid].filter(([id]) => !ABOVE_PLAY.includes(id));
  return {
    x,
    y: bottomUnder(
      below.map(([, r]) => r),
      x,
      w,
      homeRect.y,
    ),
  };
}

/** Where the areas lie packed together, each `GAP` from the one before, in rows. */
function packedPlaces(t: OldTable, now: Map<string, Area>): Map<string, Rect> {
  const laid = new Map<string, Rect>();
  const put = (id: string, at: { x?: number; y?: number }) => {
    const a = now.get(id)!;
    const d = shiftOf(t, id);
    const dx = Math.round((at.x ?? a.x - d.x) - a.x);
    const dy = Math.round((at.y ?? a.y - d.y) - a.y);
    laid.set(id, { x: a.x + dx, y: a.y + dy, w: a.w, h: a.h });
    return laid.get(id)!;
  };
  const barRect = put('bar', { x: 0, y: 0 });
  const top = bottomOf(barRect) + GAP;
  const mapRect = put('map', { x: 0, y: top });
  const encounterRect = put('encounter', { x: rightOf(mapRect) + GAP, y: top });
  const x = rightOf(encounterRect) + GAP;
  const storyNow = now.get('storybook')!;
  const raised =
    Math.max(bottomOf(mapRect), bottomOf(encounterRect)) - storyNow.h;
  const storybook = put('storybook', {
    x,
    y: crowd(barRect, { ...storyNow, x, y: raised }) ? top : raised,
  });
  const rowY =
    Math.max(bottomOf(mapRect), bottomOf(encounterRect), bottomOf(storybook)) +
    GAP;
  const storageRect = put('storage', { x: 0, y: rowY });
  const characterRect = put('character', {
    x: rightOf(storageRect) + GAP,
    y: rowY,
  });
  const handRect = put('hand', { x: rightOf(characterRect) + GAP, y: rowY });
  DECK_BLOCK.forEach((kinds, i) =>
    kinds.forEach((kind, j) => {
      const left = j ? laid.get(kinds[j - 1])! : handRect;
      const above = i ? laid.get(DECK_BLOCK[i - 1][j])! : null;
      put(
        kind,
        above
          ? { x: above.x, y: bottomOf(above) + GAP }
          : { x: rightOf(left) + GAP, y: rowY },
      );
    }),
  );
  const homeNow = now.get('home')!;
  put('home', { x: 0, y: bottomUnder(laid.values(), 0, homeNow.w, rowY) });
  put('battlefield', battlefieldPlace(laid, now.get('battlefield')!.w));
  return laid;
}

function crowd(a: Rect, b: Rect): boolean {
  return (
    a.x < rightOf(b) + GAP &&
    b.x < rightOf(a) + GAP &&
    a.y < bottomOf(b) + GAP &&
    b.y < bottomOf(a) + GAP
  );
}

function pushAside(laid: Rect[], r: Rect): Rect {
  for (;;) {
    const hit = laid.find((l) => crowd(l, r));
    if (!hit) return r;
    const right = { ...r, x: Math.ceil(rightOf(hit) + GAP) };
    const down = { ...r, y: Math.ceil(bottomOf(hit) + GAP) };
    const left = { ...r, x: Math.floor(hit.x - GAP - r.w) };
    const up = { ...r, y: Math.floor(hit.y - GAP - r.h) };
    const far = (c: Rect) => Math.abs(c.x - r.x) + Math.abs(c.y - r.y);
    const nearest = (cs: Rect[]) =>
      cs.reduce((a, c) => (far(c) < far(a) ? c : a));
    const free = [right, down, left, up].filter(
      (c) => !laid.some((l) => crowd(l, c)),
    );
    if (free.length) return nearest(free);
    r = nearest([right, down]);
  }
}

function anchorsOf(t: OldTable, areas: Area[]): Record<string, Point> {
  return Object.fromEntries(
    areas.map((a) => [a.id, t.anchors?.[a.id] ?? { x: a.x, y: a.y }]),
  );
}

function anchoredPlaces(
  areas: Area[],
  anchors: Record<string, Point>,
): Map<string, Rect> {
  const order = [...areas].sort(
    (a, b) =>
      anchors[a.id].y - anchors[b.id].y || anchors[a.id].x - anchors[b.id].x,
  );
  const laid = new Map<string, Rect>();
  for (const a of order)
    laid.set(
      a.id,
      pushAside([...laid.values()], { ...anchors[a.id], w: a.w, h: a.h }),
    );
  return laid;
}

/**
 * Lay the areas out after the piles were moved by their coordinates, packed together or where the player put them
 * (`Table.anchors`): each moves with the piles `measure()` gives it, and the figures on it; remember the frames
 * (`OldTable.frames`) and how far each area lies from its own place (`Table.shifts`).
 */
function settleLayout(t: OldTable): OldTable {
  const { areas, owner } = measure(t);
  const now = new Map(areas.map((a) => [a.id, a]));
  const anchors = t.anchors && anchorsOf(t, areas);
  const places = anchors
    ? anchoredPlaces(areas, anchors)
    : packedPlaces(t, now);
  const delta = new Map<string, Point>();
  const laid = new Map<string, Rect>();
  for (const [id, p] of places) {
    const a = now.get(id)!;
    const d = { x: Math.round(p.x - a.x), y: Math.round(p.y - a.y) };
    delta.set(id, d);
    laid.set(id, { x: a.x + d.x, y: a.y + d.y, w: a.w, h: a.h });
  }

  const moves = [...delta].filter(([, d]) => d.x || d.y);
  const frames = Object.fromEntries(GROWING.map((id) => [id, laid.get(id)!]));
  const same = (a?: Rect, c?: Rect) =>
    !!a && !!c && a.x === c.x && a.y === c.y && a.w === c.w && a.h === c.h;
  const kept = (a?: Record<string, Point>) =>
    !anchors ||
    (!!a &&
      Object.keys(a).length === Object.keys(anchors).length &&
      Object.entries(anchors).every(
        ([id, p]) => a[id]?.x === p.x && a[id]?.y === p.y,
      ));
  if (
    !moves.length &&
    GROWING.every((id) => same(t.frames?.[id], frames[id])) &&
    kept(t.anchors)
  )
    return t;

  const stacks = { ...t.stacks };
  for (const [id, area] of owner) {
    const d = delta.get(area);
    if (d && (d.x || d.y))
      stacks[id] = {
        ...stacks[id],
        x: stacks[id].x + d.x,
        y: stacks[id].y + d.y,
      };
  }
  const tokens = t.tokens.map((k) => {
    const c = { x: k.x + tokenSize(k) / 2, y: k.y + tokenSize(k) / 2 };
    const move = moves.find(([id]) => inRect(now.get(id)!, c.x, c.y));
    return move ? { ...k, x: k.x + move[1].x, y: k.y + move[1].y } : k;
  });
  const shifts = { ...t.shifts };
  for (const [id, d] of moves) {
    const old = shiftOf(t, id);
    shifts[id] = { x: old.x + d.x, y: old.y + d.y };
  }
  return {
    ...t,
    stacks,
    tokens,
    shifts,
    frames,
    ...(anchors ? { anchors } : {}),
  };
}

// ---------- settling the table by coordinates ----------

/**
 * Lay the spots out by the piles' coordinates: spread out piles dropped on the hand or the Encounter Bar, lay the piles
 * of each fanned row onto its places, and lay cards on a spot that turns them, keeps them face up or upside down, and
 * on a grid, as they must lie there.
 */
export function settleSpots(t: OldTable): OldTable {
  let next = t;
  const spots = spotsOf(t);
  for (const spot of spots.filter((s) => s.takesPiles)) {
    const [a, b] = spotPlaces(spot, 2);
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    for (const id of row(next, spot)) {
      const s = next.stacks[id];
      if (s.cards.length < 2) continue;
      const cards = spot.overlaps ? s.cards : [...s.cards].reverse();
      next = setStack(next, { ...s, cards: cards.slice(0, 1) });
      cards.slice(1).forEach((card, i) => {
        const d = ((i + 1) / s.cards.length) * 0.4;
        next = addStack(next, { x: s.x + dx * d, y: s.y + dy * d }, [card], {
          rot: s.rot,
        })[0];
      });
    }
  }
  for (const spot of spots.filter((s) => s.fan)) {
    const piles = row(next, spot);
    const places = spotPlaces(spot, piles.length);
    piles.forEach((id, i) => {
      const s = next.stacks[id];
      const p = places[Math.min(i, places.length - 1)];
      if (s.x !== p.x || s.y !== p.y)
        next = setStack(next, { ...s, x: p.x, y: p.y });
    });
  }
  for (const spot of spots.filter((s) => s.turn)) {
    const faceUp = !spot.faceDown;
    for (const id of onSpot(next, spot)) {
      const s = next.stacks[id];
      if (s.rot || s.cards.some((c) => c.faceUp !== faceUp))
        next = setStack(next, {
          ...s,
          rot: 0,
          cards: s.cards.map((c) => ({ ...c, faceUp })),
        });
    }
  }
  for (const spot of spots.filter((s) => s.faceUp)) {
    for (const id of onSpot(next, spot)) {
      const s = next.stacks[id];
      if (s.cards.some((c) => !c.faceUp))
        next = setStack(next, {
          ...s,
          cards: s.cards.map((c) => ({ ...c, faceUp: true })),
        });
    }
  }
  for (const id of GRIDS.flatMap((g) => [...grid(next, g).values()])) {
    const s = next.stacks[id];
    if (s.cards.some((c) => !c.faceUp))
      next = setStack(next, {
        ...s,
        cards: s.cards.map((c) => ({ ...c, faceUp: true })),
      });
  }
  for (const spot of spots.filter((s) => s.upsideDown)) {
    for (const id of onSpot(next, spot)) {
      const s = next.stacks[id];
      if (s.rot !== 180) next = setStack(next, { ...s, rot: 180 });
    }
  }
  return next;
}

/**
 * Turn the cards just put on a place that takes them so: face up on a spot with `putFaceUp` (the Storybook's Encounter
 * Card), face down on the Encounter Deck area's places.
 */
function faceArrivals(prev: OldTable, t: OldTable): OldTable {
  let next = t;
  const turn = (s: Stack, before: Set<string>, faceUp: boolean) => {
    if (s.cards.some((c) => !before.has(c.id) && c.faceUp !== faceUp))
      next = setStack(next, {
        ...s,
        cards: s.cards.map((c) => (before.has(c.id) ? c : { ...c, faceUp })),
      });
  };
  const cardsOn = (u: OldTable, ids: string[]) =>
    new Set(ids.flatMap((id) => u.stacks[id].cards.map((c) => c.id)));
  const before = spotsOf(prev);
  for (const spot of spotsOf(t).filter((s) => s.putFaceUp)) {
    const was = before.find((s) => s.id === spot.id);
    const had = cardsOn(prev, was ? onSpot(prev, was) : []);
    for (const id of onSpot(t, spot)) turn(t.stacks[id], had, true);
  }
  const places = new Set<string>(ENCOUNTER_PLACES);
  for (const s of Object.values(t.stacks)) {
    const was = prev.stacks[s.id];
    if (s.place && places.has(s.place) && was)
      turn(s, cardsOn(prev, [s.id]), false);
  }
  return next;
}

/**
 * Bring a table whose piles were moved by their coordinates in order, as the app did before version 3: the cards on
 * the Enemy Card places kept on them, the spots and the areas laid out, the cards put on a place turned (given the
 * table before), and last, where each pile now lies recorded (`settleAt()`).
 */
export function settle(t: OldTable, prev?: OldTable): OldTable {
  const laid = settleLayout(settleSpots(settleEnemies(t)));
  return settleAt(prev ? faceArrivals(prev, laid) : laid);
}

/**
 * Apply a change that moves the areas, and settle the table (`settle()`). The piles that lay loose outside the areas and
 * now lie under one move right, past the areas, keeping their places to each other.
 */
export function rearrange(
  t: OldTable,
  fn: (t: OldTable) => OldTable,
): OldTable {
  const piles = t.z.filter(
    (id) =>
      !isFixed(t.stacks[id]) && !areaForCard(t, t.stacks[id].x, t.stacks[id].y),
  );
  const laid = settle(fn(t), t);
  const areas = areasOf(laid);
  const under = (x: number, y: number) =>
    areas.some(
      (a) =>
        x < a.x + a.w && x + CARD_W > a.x && y < a.y + a.h && y + CARD_H > a.y,
    );
  const moved = new Set(
    piles.filter(
      (id) => laid.stacks[id] && under(laid.stacks[id].x, laid.stacks[id].y),
    ),
  );
  if (!moved.size) return laid;
  const left = Math.min(...[...moved].map((id) => laid.stacks[id].x));
  const dx = Math.max(...areas.map((a) => a.x + a.w)) + CARD_W / 2 - left;
  const stacks = Object.fromEntries(
    Object.entries(laid.stacks).map(([id, s]) => [
      id,
      moved.has(id) ? { ...s, x: s.x + dx } : s,
    ]),
  );
  return settleAt({ ...laid, stacks });
}
