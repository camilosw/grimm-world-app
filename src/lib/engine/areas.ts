// The mechanics of the play area: spots, fans, grids, frames, the layout of the areas, where a pile lies (`at`), placement
// and drawing order. Reads the game's areas, spots and rules from its GameDefinition (`game()`).

import { family, game } from './game';
import {
  AREA_HEADER,
  AREA_PAD,
  bottomOf,
  CARD_H,
  CARD_W,
  cardBox,
  cardRect,
  distanceTo,
  GAP,
  inRect,
  OPPOSITE,
  overlap,
  type Point,
  type Rect,
  rightOf,
  type Side,
  tokenSize,
  type Turn,
} from './geometry';
import type {
  At,
  CardDef,
  DeckKind,
  Family,
  FixedPlace,
  GridId,
  Stack,
  StorySlot,
  Table,
} from './types';

/** A framed part of the table reserved for certain cards (rulebook chapters 4 and 10). */
export interface Area {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accepts: Family[];
  /** The deck lying on its place in this area (`TABLE_DECKS`): cards dropped anywhere in the area go into it. */
  deck?: DeckKind;
}

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
  /** Further card families it takes (Broken Items: Y-cards too, as some items are printed on them). */
  also?: Family[];
  /** Cards of the family always land here, wherever they are dropped on the table. */
  attracts: boolean;
  x: number;
  y: number;
  /** The spot beside (or above/below) this one whose card lies on top of it, covering the side next to it. */
  under?: string;
  /**
   * The pile lying on top of this spot's card, covering its `side` (a Market Prices card under its Region Card, which
   * lies on the Map's grid, not on a spot).
   */
  underPile?: { id: string; side: Side };
  /**
   * Part of the card's width (height, for a spot above or below it), as it lies, still showing beside the card on top
   * of it (default: half).
   */
  shows?: number;
  /**
   * One card per place, in a row growing away from the `under` card, each slid under the one before as far as the
   * first lies under that card: at most `count` of them (`Infinity`: any number, the area growing with the row).
   * With `count: 1`, the spot holds a single card.
   */
  fan?: { count: number };
  /**
   * Its row starts beyond the last card of this spot's row, under it, and moves out as that row grows (the Skills beyond
   * the Titles, the Money Cards beyond the stowed items, `spotsOf()`). The two rows lie a unit apart across them: the
   * saves from before version 3 tell the rows apart by it, as their migrations take the piles on a row's line only
   * (legacy/layout.ts).
   */
  after?: string;
  /**
   * Its placeholder, beyond the last card of both rows, is shared with the `after` row: cards dropped on one half join
   * that row, on the other this one (`splitHalves()`), so that row's free place, under this row, isn't shown on its own.
   * A pile moved within either row stays in it (`placement()`).
   */
  split?: boolean;
  /** The spot whose card this spot's card lies on, drawn above it (a Hit Point Card on its Enemy Card). */
  above?: string;
  /** Its placeholder shows only while that spot holds a card (a Hit Point Card's, once its Enemy Card is there). */
  needs?: string;
  /**
   * Another place for that spot's card (a Hit Point Card on the spent side, or over its defeated enemy): it shows no
   * placeholder, and the spot and its other places hold one card between them (`one`).
   */
  alt?: string;
  /** Holds one card (with its `alt` places, between them): another dropped there is refused. */
  one?: boolean;
  /** The storybook place whose top card this spot's card lies on. */
  over?: StorySlot;
  /** Cards of the family dropped anywhere in its area go here. */
  fillsArea?: boolean;
  /** Its card lies landscape across the place (Region Cards, see `cardBox()`). */
  landscape?: boolean;
  /**
   * A portrait card lies here landscape, turned a quarter to this side, face up unless `faceDown` (the Encounter Cards
   * giving a region's market prices, the Y-cards in the Encounter Bar): it can't be turned over or rotated there.
   */
  turn?: Turn;
  /** Its cards lie face down (the Encounter Bar's Y-cards, whose backs show the location they belong to). */
  faceDown?: boolean;
  /** Its cards lie face up, turned so when put there, and can't be turned over there (Broken Items, Status Upgrades, the hand). */
  faceUp?: boolean;
  /** A card put here turns face up, but may be turned over afterwards (the Storybook's Encounter Card; `faceArrivals()`). */
  putFaceUp?: boolean;
  /**
   * New cards go to the front of the fanned row, on top of the others, and its free place is shown before its first
   * card, partly under it as the cards are under each other, instead of after its last (the Encounter Bar, a row
   * running right).
   */
  addsFirst?: boolean;
  /**
   * The fanned row has no card covering it and runs toward this side, each card lying on top of the one before, of which
   * the `shows` part is left showing (the hand in the Actions area: down, the top of each card showing above the next).
   */
  overlaps?: Side;
  /** Its cards lie turned 180° (the Actions area's), so they can't be rotated there. */
  upsideDown?: boolean;
  /**
   * A pile dropped on its row (of any number of cards, `fan.count: Infinity`) is spread out on it, one card per place,
   * its top card still lying on top of the others (`settleSpots()`): the hand, taking back the cards under the Damage
   * Card or the discard pile, its bottom card first; the Encounter Bar, its top card first.
   */
  takesPiles?: boolean;
  /** Cards dropped on its pile go under it, not on top (the Damage Card, with the Action Cards lost as damage under it). */
  slidesUnder?: boolean;
}

/** Most cards a fanned spot holds. */
function fanMax(spot: Spot): number {
  return spot.fan?.count ?? 1;
}

/** Which way a fanned spot's row runs: away from the card covering it, the way its cards lie on each other, else right. */
function growth(spot: Spot): Side {
  const side = coveredSide(spot);
  return spot.overlaps ?? (side ? OPPOSITE[side] : 'right');
}

/** Whether a spot's row runs down or up. */
function vertical(spot: Spot): boolean {
  const side = growth(spot);
  return side === 'top' || side === 'bottom';
}

/** Size of a spot's card as it lies there. */
function lyingSize(spot: Spot): { w: number; h: number } {
  const { width, height } = cardBox(0, 0, !!spot.landscape);
  return { w: width, h: height };
}

/** Signed distance between the places of a fanned spot (negative: the row grows to the left or up). */
function fanStep(spot: Spot): number {
  const side = growth(spot);
  const dir = side === 'left' || side === 'top' ? -1 : 1;
  const size = lyingSize(spot);
  return dir * (spot.shows ?? 0.5) * (vertical(spot) ? size.h : size.w);
}

/** Top-left corners of a spot's places: one, or the first `n` of a fanned spot's row. */
export function spotPlaces(spot: Spot, n = 1): Point[] {
  const step = fanStep(spot);
  const [dx, dy] = vertical(spot) ? [0, step] : [step, 0];
  return Array.from({ length: spot.fan ? n : 1 }, (_, i) => ({
    x: Math.round(spot.x + i * dx),
    y: Math.round(spot.y + i * dy),
  }));
}

/**
 * Where a pile lies in a fanned spot's row at `index`: on its place, or, for an index between two places (a card just
 * put between two others, or a pile just spread out, until `settleSpots()` numbers the row again), half a unit or less
 * before the next place, as the row sorts it.
 */
function rowPoint(spot: Spot, index: number): Point {
  const n = Math.max(0, Math.ceil(index));
  const step = fanStep(spot);
  const back = (n - index) * Math.sign(step);
  const v = vertical(spot);
  return {
    x: Math.round(spot.x + (v ? 0 : n * step)) - (v ? 0 : back),
    y: Math.round(spot.y + (v ? n * step : 0)) - (v ? back : 0),
  };
}

/**
 * Where a spot's next card goes, shown by its placeholder: its place, the place after the last card of a fanned row,
 * or, for a row taking new cards first, the place before its first card.
 */
export function freePlace(t: Table, spot: Spot): Point {
  if (spot.addsFirst)
    return { x: Math.round(spot.x - fanStep(spot)), y: spot.y };
  const n = spot.fan ? fanRow(t, spot).length : 0;
  return spotPlaces(spot, n + 1)[n];
}

/**
 * The places a spot's placeholders show: its free place and, for a row taking new cards first that has cards, also the
 * place after its last card, partly under it, to add a card at the end of the row.
 */
export function freePlaces(t: Table, spot: Spot): Point[] {
  const first = freePlace(t, spot);
  const n = spot.addsFirst ? fanRow(t, spot).length : 0;
  return n ? [first, spotPlaces(spot, n + 1)[n]] : [first];
}

/** Least part of a card's height a split placeholder shows: room for the two lines of text on each half. */
const SPLIT_SHOWS = 0.3;

/**
 * Where a split placeholder lies (`Spot.split`): right beyond the last card of both rows, across the row as wide as a
 * card, along it as far as the larger strip of the two rows shows, at least `SPLIT_SHOWS`.
 */
export function splitBox(
  t: Table,
  spot: Spot,
): { x: number; y: number; w: number; h: number } {
  const partner = spotsOf(t).find((s) => s.id === spot.after);
  const { w, h } = lyingSize(spot);
  const free = freePlace(t, spot);
  const shows = spot.shows ?? 0.5;
  const size = Math.max(shows, partner?.shows ?? 0.5, SPLIT_SHOWS);
  // In line with the row on the exact line (the other lies a unit beside it).
  const x = Math.min(spot.x, partner?.x ?? spot.x);
  const y = Math.min(spot.y, partner?.y ?? spot.y);
  // Beyond the edge of the last card, which covers the part of the free place that doesn't show.
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

/**
 * The halves of a split placeholder and the row each takes cards into: the `after` row's first (left of a column, above
 * a row's other), this row's while it has room. Once it is full, the whole placeholder is the other row's.
 */
export function splitHalves(
  t: Table,
  spot: Spot,
): { spot: Spot; x: number; y: number; w: number; h: number }[] {
  const box = splitBox(t, spot);
  const partner = spotsOf(t).find((s) => s.id === spot.after);
  const rows = partner
    ? [partner, ...(fanHasPlace(t, spot) ? [spot] : [])]
    : [spot];
  const n = rows.length;
  return rows.map((s, i) =>
    vertical(spot)
      ? { spot: s, ...box, x: box.x + (i * box.w) / n, w: box.w / n }
      : { spot: s, ...box, y: box.y + (i * box.h) / n, h: box.h / n },
  );
}

/** The row sharing its placeholder with the row beyond it (the Titles, with the Skills'), if `spot` is one. */
function sharesPlaceholder(t: Table, spot: Spot): boolean {
  return spotsOf(t).some((s) => s.split && s.after === spot.id);
}

/** Whether a fanned spot's row has room for one more card, so its next place can be shown. */
export function fanHasPlace(t: Table, spot: Spot): boolean {
  return fanRow(t, spot).length < fanMax(spot);
}

interface Lying {
  /** The piles on each spot, by spot id: in place order on a fanned spot, else from back to front (`Table.z`). */
  spots: Map<string, string[]>;
  /** The piles on each grid's places, by "col,row". */
  grids: Record<GridId, Map<string, string>>;
}

const lyingCache = new WeakMap<Table, Lying>();

/** Where the table piles lie, as their `Stack.at` says, gathered by spot and grid. */
function lying(t: Table): Lying {
  let known = lyingCache.get(t);
  if (known) return known;
  const spots = new Map<string, string[]>();
  const indices = new Map<string, number>();
  const grids: Lying['grids'] = { map: new Map(), battlefield: new Map() };
  const on = (spot: string, id: string) => {
    const row = spots.get(spot);
    if (row) row.push(id);
    else spots.set(spot, [id]);
  };
  for (const id of t.z) {
    const at = t.stacks[id]?.at;
    if (!at) continue;
    if ('grid' in at) grids[at.grid].set(cellKey(at.col, at.row), id);
    else if ('spot' in at) {
      on(at.spot, id);
      indices.set(id, at.index);
    } else if ('place' in at) {
      // A place lying on a spot of a single place, whose piles lie in `z` order: after those before it.
      const spot = game().placeSpots[at.place];
      if (!spot) continue;
      indices.set(id, spots.get(spot)?.length ?? 0);
      on(spot, id);
    }
  }
  // In place order.
  for (const row of spots.values())
    row.sort((a, b) => indices.get(a)! - indices.get(b)!);
  known = { spots, grids };
  lyingCache.set(t, known);
  return known;
}

/** Table piles lying on a spot's places (`Stack.at`), in place order. */
export function stacksOnSpot(t: Table, spot: Spot): readonly string[] {
  return lying(t).spots.get(spot.id) ?? [];
}

/** Piles lying in a fanned spot's row (`Stack.at`), from its first place on. */
export function fanRow(t: Table, spot: Spot): readonly string[] {
  return spot.fan ? stacksOnSpot(t, spot) : [];
}

/**
 * The spot pile `id` lies on (`Stack.at`: its spot, or the spot its fixed place lies on), if any. Only the pile's own
 * `at` counts, so it holds within an action too, as long as that pile hasn't moved (`dropOnto()` asks about the pile
 * the cards go onto, beside the new pile it takes them from).
 */
export function spotOf(t: Table, id: string): Spot | undefined {
  const at = t.stacks[id]?.at;
  const spot = !at
    ? undefined
    : 'spot' in at
      ? at.spot
      : 'place' in at
        ? game().placeSpots[at.place]
        : undefined;
  return spot === undefined ? undefined : spotsById(t).get(spot);
}

const spotsByIdCache = new WeakMap<Table, Map<string, Spot>>();

/** The spots as they lie on this table (`spotsOf()`), by id. */
function spotsById(t: Table): Map<string, Spot> {
  let byId = spotsByIdCache.get(t);
  if (!byId) {
    byId = new Map(spotsOf(t).map((s) => [s.id, s]));
    spotsByIdCache.set(t, byId);
  }
  return byId;
}

/** The pile lying on a spot of a single place (other than `exclude`), if any. */
function pileOn(t: Table, spot: Spot, exclude: string | null): string | null {
  return stacksOnSpot(t, spot).find((id) => id !== exclude) ?? null;
}

/**
 * The area a table pile belongs to (`Stack.at`): its fixed place's, its spot's or grid's, or the area it lies loose in
 * (none: it lies loose outside the areas).
 */
export function areaOf(t: Table, id: string): string | undefined {
  const at = t.stacks[id]?.at;
  if (!at) return undefined;
  if ('place' in at) return game().placeArea(at.place);
  if ('grid' in at) return at.grid;
  if ('spot' in at) return spotOf(t, id)?.area;
  if ('area' in at) return at.area;
  return undefined;
}

/**
 * Where cards going to a spot land (top-left dropped at x, y), or null when a
 * fanned spot is full. A plain spot: onto the pile lying there. A fanned spot:
 * at the place the card is dropped on, or after the last card when dropped
 * elsewhere (before the first, for a row taking new cards first, unless dropped in line beyond its last card): its
 * `index` in the row, half way between two piles' to go between them (`settleSpots()` then numbers the row again), and
 * where it is drawn meanwhile, half a unit beside a place.
 */
export function spotPlace(
  t: Table,
  spot: Spot,
  moving: string | null,
  x: number,
  y: number,
): (Point & { onto: string | null; index: number }) | null {
  if (!spot.fan)
    return { x: spot.x, y: spot.y, onto: pileOn(t, spot, moving), index: 0 };
  const row = fanRow(t, spot);
  const others = row.filter((id) => id !== moving);
  if (others.length >= fanMax(spot)) return null;
  // Measured along the row, in places as spaced once the card is in it.
  const v = vertical(spot);
  const step = fanStep(spot);
  const [pos, off] = v ? [y - spot.y, x - spot.x] : [x - spot.x, y - spot.y];
  const [length, breadth] = v ? [CARD_H, CARD_W] : [CARD_W, CARD_H];
  const along = (pos * Math.sign(step)) / Math.abs(step);
  const reach = others.length + length / 2 / Math.abs(step);
  const inLine = Math.abs(off) < breadth / 2;
  const near = inLine && along > -length / 2 / Math.abs(step) && along < reach;
  const i = near
    ? Math.max(0, Math.min(others.length, Math.round(along)))
    : spot.addsFirst && !(inLine && along >= reach)
      ? 0
      : others.length;
  const at = (d: number, id: string) => {
    const shift = d * Math.sign(step);
    const index = indexOf(t, id) + d;
    return v
      ? { x: spot.x, y: t.stacks[id].y + shift, onto: null, index }
      : { x: t.stacks[id].x + shift, y: spot.y, onto: null, index };
  };
  if (moving && row.indexOf(moving) === i) return at(0, moving);
  if (i < others.length) return at(-0.5, others[i]);
  return others.length
    ? at(0.5, others[others.length - 1])
    : { x: spot.x, y: spot.y, onto: null, index: 0 };
}

/** The index of a pile in the row it lies in (`Stack.at`). */
function indexOf(t: Table, id: string): number {
  const at = t.stacks[id].at;
  return at && 'spot' in at ? at.index : 0;
}

/** Whether a spot takes cards of family `f`. */
export function takes(spot: Spot, f: Family | undefined): boolean {
  return f === spot.family || (!!f && !!spot.also?.includes(f));
}

/** The spot pile `id` lies on that keeps its cards face up or down (Market Prices, Encounter Bar, Broken Items, …). */
export function facedSpot(t: Table, id: string): Spot | undefined {
  const s = spotOf(t, id);
  return s?.turn || s?.faceUp ? s : undefined;
}

/** The spot turning the card lying on it (Market Prices) that pile `id` lies on, if any. */
export function turnedSpot(t: Table, id: string): Spot | undefined {
  const s = spotOf(t, id);
  return s?.turn ? s : undefined;
}

/** Whether pile `id` lies on a spot taking the cards dropped on it underneath (the Damage Card's). */
export function slidesUnder(t: Table, id: string): boolean {
  return !!spotOf(t, id)?.slidesUnder;
}

/** The spot laying the cards on it upside down (the Actions area's) that pile `id` lies on, if any. */
export function upsideDownSpot(t: Table, id: string): Spot | undefined {
  const s = spotOf(t, id);
  return s?.upsideDown ? s : undefined;
}

/**
 * Which side of a spot's free place lies under a card, so only the rest of it shows: under the card covering the spot,
 * or, in a row whose cards lie on the one before, under its last card.
 */
export function freeCovered(t: Table, spot: Spot): Side | null {
  if (spot.overlaps)
    return fanRow(t, spot).length ? OPPOSITE[spot.overlaps] : null;
  return coveredSide(spot);
}

/** Which side of a spot's card is covered by the card of the spot it lies under. */
export function coveredSide(spot: Spot): Side | null {
  if (spot.underPile) return spot.underPile.side;
  // Where they lie in the game's `spots`: moved with their area, they lie the same way side by side.
  // A row `after` another lies there as if that row had no cards: beside that row's covering card (`spotsOf()`).
  const before = spot.after && game().spots.find((s) => s.id === spot.after);
  const cover = game().spots.find(
    (s) => s.id === (before ? before.under : spot.under),
  );
  if (!cover) return null;
  spot = game().spots.find((s) => s.id === spot.id) ?? spot;
  // Side by side, or one above the other (a row `after` another lies a unit beside it).
  if (Math.abs(cover.x - spot.x) > Math.abs(cover.y - spot.y))
    return cover.x > spot.x ? 'right' : 'left';
  return cover.y > spot.y ? 'bottom' : 'top';
}

/** The pile on a fixed place lying on the table (`Stack.at`): an Encounter Deck place, a table deck's, the storybook's. */
export function placeStack(t: Table, place: FixedPlace): Stack | undefined {
  return t.z
    .map((id) => t.stacks[id])
    .find((s) => !!s.at && 'place' in s.at && s.at.place === place);
}

/**
 * Where a card lies on a grid's place (`col`, `row`): the place of a portrait card, which `cardBox()` draws it
 * landscape across.
 */
export function cellPlace(
  t: Table,
  g: GridId,
  col: number,
  row: number,
): Point {
  const o = game().gridOrigin(t, g);
  return {
    x: o.x + col * CARD_H + (CARD_H - CARD_W) / 2,
    y: o.y + row * CARD_W - (CARD_H - CARD_W) / 2,
  };
}

/** The landscape box of a grid's place (`col`, `row`). */
function cellBox(t: Table, g: GridId, col: number, row: number): Rect {
  const o = game().gridOrigin(t, g);
  return { x: o.x + col * CARD_H, y: o.y + row * CARD_W, w: CARD_H, h: CARD_W };
}

const cellKey = (col: number, row: number) => `${col},${row}`;

/** The piles lying on the grids' places (`Stack.at`), for laying them face up (`settleSpots()`). */
export function allGridPiles(t: Table): string[] {
  return game().grids.flatMap((g) => [...gridPiles(t, g).values()]);
}

/** The piles lying on a grid's places (`Stack.at`), by "col,row". */
export function gridPiles(t: Table, g: GridId): Map<string, string> {
  return lying(t).grids[g];
}

/** The piles lying on a grid's places, with their place (`col`, `row`, which may be negative: grids grow every way). */
export function gridCells(
  t: Table,
  g: GridId,
): { col: number; row: number; id: string }[] {
  return cellsOf(gridPiles(t, g));
}

function cellsOf(grid: Map<string, string>) {
  return [...grid].map(([key, id]) => {
    const [col, row] = key.split(',').map(Number);
    return { col, row, id };
  });
}

/** The grid pile `id` lies on a place of (a Region Card on the Map's, a Terrain Card on the battlefield's), if any. */
export function gridOf(t: Table, id: string): GridId | undefined {
  const at = t.stacks[id]?.at;
  return at && 'grid' in at ? at.grid : undefined;
}

/** Whether pile `id` lies on a place of a grid, face up for good. */
export function onGrid(t: Table, id: string): boolean {
  return !!gridOf(t, id);
}

/** A free place of a grid for a card. */
export interface GridPlace extends Point {
  grid: GridId;
  col: number;
  row: number;
  /** Where to drop the card: the whole place, or a strip along the free side of the card beside it. */
  box: Rect;
  /** The side of the card beside it where the strip lies (null: the grid's first place). */
  side: Side | null;
}

const SIDE_STEPS: [Side, number, number][] = [
  ['top', 0, -1],
  ['right', 1, 0],
  ['bottom', 0, 1],
  ['left', -1, 0],
];

/** The strip along `side` of a card lying in `card`. */
function stripBox(card: Rect, side: Side): Rect {
  const s = game().gridStrip;
  if (side === 'top') return { x: card.x, y: card.y - s, w: card.w, h: s };
  if (side === 'bottom')
    return { x: card.x, y: card.y + card.h, w: card.w, h: s };
  if (side === 'left') return { x: card.x - s, y: card.y, w: s, h: card.h };
  return { x: card.x + card.w, y: card.y, w: s, h: card.h };
}

/**
 * A grid's free places, without pile `moving`: its first place while no card lies on it, else a strip on each free
 * side of each card it grows on (`grows()`), for the place beyond it, unless another card lies there.
 */
export function gridPlaces(
  t: Table,
  g: GridId,
  moving: string | null = null,
): GridPlace[] {
  const grid = new Map([...gridPiles(t, g)].filter(([, id]) => id !== moving));
  if (!grid.size)
    return [
      {
        ...cellPlace(t, g, 0, 0),
        grid: g,
        col: 0,
        row: 0,
        box: cellBox(t, g, 0, 0),
        side: null,
      },
    ];
  const placed = new Set(grid.values());
  // The cards on the grid's own spots hide no strip: the Market Prices lie beside their Region Cards, and the Enemy
  // Card places move aside as the battlefield grows (`battlefieldSpots()`).
  const own = new Set(
    spotsOf(t)
      .filter((s) => s.area === g)
      .flatMap((s) => stacksOnSpot(t, s)),
  );
  // Nor do the piles of other areas: those move aside as the grid's area grows (`settleLayout()`).
  const others = t.z
    .filter(
      (id) =>
        id !== moving &&
        !placed.has(id) &&
        !own.has(id) &&
        (areaOf(t, id) ?? g) === g,
    )
    .map((id) => cardRect(t.stacks[id].x, t.stacks[id].y));
  const places: GridPlace[] = [];
  for (const key of grid.keys()) {
    const [col, row] = key.split(',').map(Number);
    for (const [side, dc, dr] of SIDE_STEPS) {
      const [c, r] = [col + dc, row + dr];
      if (!game().grows(g, col, side) || grid.has(cellKey(c, r))) continue;
      const cell = cellBox(t, g, c, r);
      if (others.some((o) => overlap(o, cell) > 0)) continue;
      const box = stripBox(cellBox(t, g, col, row), side);
      places.push({
        ...cellPlace(t, g, c, r),
        grid: g,
        col: c,
        row: r,
        box,
        side,
      });
    }
  }
  return places;
}

/**
 * Where a grid lies: its cards, else its first place, with room for the strips of its free places beside them, on the
 * sides it grows on (`grows()`).
 */
export function gridBox(t: Table, g: GridId): Rect {
  const cells = [...gridPiles(t, g).keys()];
  const boxes = (cells.length ? cells : [cellKey(0, 0)]).map((k) => {
    const [c, r] = k.split(',').map(Number);
    const b = cellBox(t, g, c, r);
    const reach = (side: Side) =>
      game().grows(g, c, side) ? game().gridStrip : 0;
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

/**
 * The places an area is framed around for a spot: its place, or a fanned row from its first place to the next card's
 * while it has room for one, else to its last card; a row taking new cards first from its free place to the place after
 * its last card.
 */
function framedPlaces(t: Table, spot: Spot): Point[] {
  if (!spot.fan) return [spot];
  if (spot.addsFirst) return freePlaces(t, spot);
  const n = fanRow(t, spot).length;
  const last = spotPlaces(spot, n)[n - 1];
  const places = [spot, fanHasPlace(t, spot) ? freePlace(t, spot) : last];
  if (!spot.split) return places;
  // A split placeholder reaches further than the free place it lies over: a card's place ending where it ends.
  const box = splitBox(t, spot);
  const { w, h } = lyingSize(spot);
  const side = growth(spot);
  return [
    ...places,
    {
      x: side === 'right' ? box.x + box.w - w : box.x,
      y: side === 'bottom' ? box.y + box.h - h : box.y,
    },
  ];
}

const NO_SHIFT: Point = { x: 0, y: 0 };

/** How far an area and everything in it lies from its own place (the game's `areas` / `spots`), pushed by the areas before it. */
export function shiftOf(t: Table, area: string): Point {
  return t.shifts?.[area] ?? NO_SHIFT;
}

const shiftedSpots = new WeakMap<Table, Spot[]>();
const tableSpots = new WeakMap<Table, Spot[]>();

/**
 * The spots as they lie on this table: moved with their areas (`Table.shifts`), the Market Prices places beside the
 * Region Cards on the Map and the battlefield's Enemy Card places right of its Terrain Cards (the game's
 * `gridSpots()`), as far as the rows and grids they lie beyond reach (`Stack.at`). Use these, not the game's `spots`, for
 * positions.
 */
export function spotsOf(t: Table): Spot[] {
  let spots = tableSpots.get(t);
  if (!spots) {
    spots = [...baseSpots(t), ...game().gridSpots(t)];
    tableSpots.set(t, spots);
  }
  return spots;
}

/**
 * Whether one of the places holding a single card between them (a spot and its `alt` places) holds a pile other than
 * `moving`.
 */
export function holdsOne(
  t: Table,
  spot: Spot,
  moving: string | null = null,
): boolean {
  const main = spot.alt ?? spot.id;
  return spotsOf(t).some(
    (s) =>
      (s.alt ?? s.id) === main &&
      stacksOnSpot(t, s).some((id) => id !== moving),
  );
}

/** The spots of the areas (the game's `spots`) as they lie on this table: all of them but the grids' (Market Prices, enemies). */
function baseSpots(t: Table): Spot[] {
  let spots = shiftedSpots.get(t);
  if (!spots) {
    spots = game().spots.map((s) => {
      const d = shiftOf(t, s.area);
      return d.x || d.y ? { ...s, x: s.x + d.x, y: s.y + d.y } : s;
    });
    // A row after another starts beyond that row's last card: as far from it as from that row's covering card while it
    // has none.
    spots = spots.map((s, _, all) => {
      const before = s.after && all.find((b) => b.id === s.after);
      const cover = before && all.find((b) => b.id === before.under);
      if (!before || !cover) return s;
      const n = fanRow(t, before).length;
      const last = n ? spotPlaces(before, n)[n - 1] : cover;
      return vertical(before)
        ? { ...s, y: s.y + last.y - cover.y }
        : { ...s, x: s.x + last.x - cover.x };
    });
    shiftedSpots.set(t, spots);
  }
  return spots;
}

/** The frame of an area around the cards lying in it. */
function frameAround(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x)) - AREA_PAD;
  const y = Math.min(...boxes.map((b) => b.y)) - AREA_HEADER;
  const right = Math.max(...boxes.map((b) => b.x + b.w)) + AREA_PAD;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + AREA_PAD;
  return { x, y, w: right - x, h: bottom - y };
}

/** The growing area a card at (x, y) belongs to, if any: the one it overlaps most. */
function mostOverlapped<R extends Rect & { id: string }>(
  frames: R[],
  x: number,
  y: number,
): R | undefined {
  const box = cardRect(x, y);
  let best: R | undefined;
  let most = 0;
  for (const f of frames) {
    const o = overlap(f, box);
    if (o > most) [best, most] = [f, o];
  }
  return best;
}

const framesCache = new WeakMap<Table, Area[]>();

/**
 * The areas as they lie on this table: each of fixed size at its own place moved with it (`Table.shifts`), each growing
 * one framed around its places (a fanned row as far as its next place, a grid's cards with the strips of its free
 * places) and the piles lying loose in it (`Stack.at`). Use these, not the game's `areas`.
 */
export function allAreas(t: Table): Area[] {
  let areas = framesCache.get(t);
  if (areas) return areas;
  const spots = spotsOf(t);
  const loose = new Map<string, Rect[]>();
  for (const id of t.z) {
    const at = t.stacks[id].at;
    if (!at || !('area' in at)) continue;
    const p = pointOf(t, at)!;
    loose.set(at.area, [...(loose.get(at.area) ?? []), cardRect(p.x, p.y)]);
  }
  areas = game().areas.map((a): Area => {
    if (!game().growing.includes(a.id)) {
      const d = shiftOf(t, a.id);
      return { ...a, x: a.x + d.x, y: a.y + d.y };
    }
    return {
      ...a,
      ...frameAround([
        // A grid frames its area, named after it.
        ...game()
          .grids.filter((g) => g === a.id)
          .map((g) => gridBox(t, g)),
        ...game().areaBoxes(t, a.id),
        ...spots
          .filter((s) => s.area === a.id)
          .flatMap((s) =>
            framedPlaces(t, s).map((p) => cardRect(p.x, p.y, !!s.landscape)),
          ),
        ...(loose.get(a.id) ?? []),
      ]),
    };
  });
  framesCache.set(t, areas);
  return areas;
}

/** Where a table pile lying `at` lies on this table (null: on a spot no longer there, a Region Card's that has left). */
export function pointOf(t: Table, at: At): Point | null {
  if ('place' in at) {
    const spot = game().placeSpots[at.place];
    if (spot) return spotPoint(spotsById(t).get(spot)!, 0);
    return game().placePoint(t, at.place);
  }
  if ('grid' in at) return cellPlace(t, at.grid, at.col, at.row);
  if ('spot' in at) {
    const spot = spotsById(t).get(at.spot);
    return spot ? spotPoint(spot, at.index) : null;
  }
  if ('area' in at) {
    const a = game().areas.find((a) => a.id === at.area)!;
    const d = shiftOf(t, a.id);
    return { x: a.x + d.x + at.x, y: a.y + d.y + at.y };
  }
  return { x: at.x, y: at.y };
}

/** Where a pile lies on a spot's place `index` (`rowPoint()`): a spot of a single place has just the one. */
function spotPoint(spot: Spot, index: number): Point {
  return spot.fan ? rowPoint(spot, index) : { x: spot.x, y: spot.y };
}

/** Whether a pile lying `at` lies loose outside the areas. */
export function outsideAreas(at: At): at is { x: number; y: number } {
  return !('place' in at || 'grid' in at || 'spot' in at || 'area' in at);
}

/** Lying loose in `area` with its top-left corner at (x, y): from the area's own corner, as it lies on this table. */
function inArea(t: Table, area: string, x: number, y: number): At {
  const a = game().areas.find((a) => a.id === area)!;
  const d = shiftOf(t, area);
  return { area, x: x - a.x - d.x, y: y - a.y - d.y };
}

/**
 * Where a pile put loose with its top-left corner at (x, y) lies (`Stack.at`): in the area that point belongs to
 * (`areaForCard()`), from the area's own corner, else loose on the table.
 */
export function looseAt(t: Table, x: number, y: number): At {
  const area = areaForCard(t, x, y);
  return area ? inArea(t, area.id, x, y) : { x, y };
}

/**
 * Give the piles lying loose outside the areas that now lie in one to that area (`looseAt()`): under one of fixed size
 * (its middle), or under a growing area's frame (the one it overlaps most), which then grows around them, perhaps over
 * more of them. Returns the same table when none does.
 */
function takeIn(t: Table): Table {
  let next = t;
  for (;;) {
    let stacks: Record<string, Stack> | undefined;
    for (const id of next.z) {
      const s = next.stacks[id];
      if (!s.at || !outsideAreas(s.at) || isFixedPile(s)) continue;
      const at = looseAt(next, s.at.x, s.at.y);
      if (outsideAreas(at)) continue;
      stacks ??= { ...next.stacks };
      stacks[id] = { ...s, at };
    }
    if (!stacks) return next;
    next = { ...next, stacks };
  }
}

/** A deck, a storybook place or another fixed place (`isFixed()` in actions.ts). */
function isFixedPile(s: Stack): boolean {
  return !!s.deck || !!s.slot || !!s.place;
}

/**
 * Lay every table pile where its `Stack.at` says (`pointOf()`), on this table's layout, and leave the piles in the
 * sidebar or set aside without a place (no `at`, `x, y` 0). Returns the same table when nothing moves.
 */
export function placePiles(t: Table): Table {
  const onTable = new Set(t.z);
  let stacks: Record<string, Stack> | undefined;
  for (const [id, s] of Object.entries(t.stacks)) {
    if (onTable.has(id)) {
      const p = s.at && pointOf(t, s.at);
      if (!p || (p.x === s.x && p.y === s.y)) continue;
      stacks ??= { ...t.stacks };
      stacks[id] = { ...s, x: p.x, y: p.y };
    } else if (s.at || s.x !== 0 || s.y !== 0) {
      stacks ??= { ...t.stacks };
      const next = { ...s, x: 0, y: 0 };
      delete next.at;
      stacks[id] = next;
    }
  }
  return stacks ? { ...t, stacks } : t;
}

/** Whether two piles lie at the same place (`Stack.at`). */
export function sameAt(a: At | undefined, b: At): boolean {
  if (!a) return false;
  const was: Record<string, unknown> = a;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(b).every(([k, v]) => was[k] === v)
  );
}

/** Lowest point of the areas reaching under an area from `x`, `w` wide (closer than `GAP` beside it), or `top`. */
export function bottomUnder(
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

/** Two areas closer than `GAP` to each other. */
export function crowd(a: Rect, b: Rect): boolean {
  return (
    a.x < rightOf(b) + GAP &&
    b.x < rightOf(a) + GAP &&
    a.y < bottomOf(b) + GAP &&
    b.y < bottomOf(a) + GAP
  );
}

/**
 * Where an area goes among the areas already laid out: where it is, or pushed aside off the one in its way, `GAP` from
 * it on whichever side is nearest and free (right or down when none is, then again off the next one in its way).
 */
function pushAside(laid: Rect[], r: Rect): Rect {
  for (;;) {
    const hit = laid.find((l) => crowd(l, r));
    if (!hit) return r;
    // Whole units, rounded away from the area pushed off.
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

/** Where the player put each area (`Table.anchors`): an area not put anywhere yet (a new battlefield) where it lies. */
function anchorsOf(t: Table, areas: Area[]): Record<string, Point> {
  return Object.fromEntries(
    areas.map((a) => [a.id, t.anchors?.[a.id] ?? { x: a.x, y: a.y }]),
  );
}

/**
 * Where the areas lie when the player put them somewhere: each at its anchor, unless an area laid out before it is in
 * its way, which pushes it aside (`pushAside()`). They are laid out top to bottom, then left to right, so an area
 * growing pushes the areas below and right of it away, and they move back as it shrinks; `first` goes first.
 */
function anchoredPlaces(
  areas: Area[],
  anchors: Record<string, Point>,
  first?: string,
): Map<string, Rect> {
  const rank = (a: Area) => (a.id === first ? 0 : 1);
  const order = [...areas].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      anchors[a.id].y - anchors[b.id].y ||
      anchors[a.id].x - anchors[b.id].x,
  );
  const laid = new Map<string, Rect>();
  for (const a of order)
    laid.set(
      a.id,
      pushAside([...laid.values()], { ...anchors[a.id], w: a.w, h: a.h }),
    );
  return laid;
}

const SNAP = 60;

/**
 * Where area `id` goes when the player drops its top-left corner at (x, y): in line with another area's edge, or `GAP`
 * beside it, when one is less than `SNAP` away (each way on its own); in whole units.
 */
export function snapArea(t: Table, id: string, x: number, y: number): Point {
  const areas = allAreas(t);
  const a = areas.find((a) => a.id === id);
  if (!a) return { x: Math.round(x), y: Math.round(y) };
  const others = areas.filter((o) => o.id !== id);
  const snap = (v: number, lines: number[]) => {
    const l = lines.reduce(
      (a, c) => (Math.abs(c - v) < Math.abs(a - v) ? c : a),
      Infinity,
    );
    return Math.round(Math.abs(l - v) < SNAP ? l : v);
  };
  return {
    x: snap(
      x,
      others.flatMap((o) => [
        o.x,
        rightOf(o) + GAP,
        rightOf(o) - a.w,
        o.x - GAP - a.w,
      ]),
    ),
    y: snap(
      y,
      others.flatMap((o) => [
        o.y,
        bottomOf(o) + GAP,
        bottomOf(o) - a.h,
        o.y - GAP - a.h,
      ]),
    ),
  };
}

/**
 * Where the player puts the areas by dropping area `id` with its top-left corner at (x, y) (`Table.anchors`): it lies
 * there, and the areas in its way are pushed aside and stay there. Null when the area doesn't move.
 */
export function anchorsAfterMove(
  t: Table,
  id: string,
  x: number,
  y: number,
): Record<string, Point> | null {
  const areas = allAreas(t);
  const area = areas.find((a) => a.id === id);
  if (!area || (area.x === x && area.y === y)) return null;
  const anchors = anchorsOf(t, areas);
  const before = anchoredPlaces(areas, anchors);
  const moved = { ...anchors, [id]: { x, y } };
  const after = anchoredPlaces(areas, moved, id);
  const dropped = { x, y, w: area.w, h: area.h };
  for (const a of areas) {
    if (a.id === id) continue;
    const p = after.get(a.id)!;
    const q = before.get(a.id)!;
    if (
      p.x !== q.x ||
      p.y !== q.y ||
      crowd(dropped, { ...anchors[a.id], w: a.w, h: a.h })
    )
      moved[a.id] = { x: p.x, y: p.y };
  }
  return moved;
}

/** Where the areas go (packed, or where the player put them), and how far each moves from where it lies now. */
function arrange(
  t: Table,
  areas: Area[],
): {
  now: Map<string, Area>;
  anchors: Record<string, Point> | undefined;
  delta: Map<string, Point>;
} {
  const now = new Map(areas.map((a) => [a.id, a]));
  const anchors = t.anchors && anchorsOf(t, areas);
  const places = anchors
    ? anchoredPlaces(areas, anchors)
    : game().packedPlaces(t, now);
  const delta = new Map<string, Point>();
  for (const [id, p] of places) {
    const a = now.get(id)!;
    // In whole units, so that the spots moved with it stay on the grid their rows are laid out on.
    delta.set(id, { x: Math.round(p.x - a.x), y: Math.round(p.y - a.y) });
  }
  return { now, anchors, delta };
}

/** Shifts with each area's moved by `delta`; an area back on its own place has none. */
function shifted(
  shifts: Table['shifts'],
  delta: Map<string, Point>,
): Record<string, Point> {
  const next = { ...shifts };
  for (const [id, d] of delta) {
    if (!d.x && !d.y) continue;
    const old = next[id] ?? NO_SHIFT;
    const p = { x: old.x + d.x, y: old.y + d.y };
    if (p.x || p.y) next[id] = p;
    else delete next[id];
  }
  return next;
}

/**
 * Lay the areas out after a change: packed together (`packedPlaces()`), or, once the player has dragged one, where they
 * put each (`Table.anchors`, `anchoredPlaces()`). An area moves with everything lying in it (its spots and piles, which
 * lie there by their `Stack.at`, and figures; how far it lies from its own place: `Table.shifts`), so it moves back as an
 * area in its way shrinks, and an area growing toward the one before it moves itself instead. Piles lying loose outside
 * the areas that an area comes to lie over, before or after it moves, belong to it from then on (`takeIn()`). Returns
 * the same table when nothing moves.
 */
export function settleLayout(t: Table): Table {
  const taken = takeIn(t);
  const { now, anchors, delta } = arrange(taken, allAreas(taken));
  const moves = [...delta].filter(([, d]) => d.x || d.y);
  const kept = (a?: Record<string, Point>) =>
    !anchors ||
    (!!a &&
      Object.keys(a).length === Object.keys(anchors).length &&
      Object.entries(anchors).every(
        ([id, p]) => a[id]?.x === p.x && a[id]?.y === p.y,
      ));
  if (!moves.length && kept(taken.anchors)) return takeIn(taken);
  const tokens = taken.tokens.map((k) => {
    const c = { x: k.x + tokenSize(k) / 2, y: k.y + tokenSize(k) / 2 };
    const move = moves.find(([id]) => inRect(now.get(id)!, c.x, c.y));
    return move ? { ...k, x: k.x + move[1].x, y: k.y + move[1].y } : k;
  });
  return takeIn({
    ...taken,
    tokens,
    shifts: shifted(taken.shifts, delta),
    ...(anchors ? { anchors } : {}),
  });
}

/**
 * A table laid out from where its piles lie (`Stack.at`) and where the player put the areas (`Table.anchors`), as a
 * save holds it: how far each area lies from its own place (`Table.shifts`), and each table pile's `x, y`
 * (`placePiles()`). Nothing else moves: the save was laid out when it was written.
 */
export function layOut(t: Table): Table {
  const bare = { ...t };
  delete bare.shifts;
  const { delta } = arrange(bare, allAreas(bare));
  return placePiles({ ...bare, shifts: shifted(undefined, delta) });
}

/**
 * The area a card whose top-left corner is at (x, y) lies in: the area of fixed size containing its center, else the
 * growing area it overlaps most. A pile put loose there lies in that area (`looseAt()`).
 */
export function areaForCard(t: Table, x: number, y: number): Area | null {
  const areas = allAreas(t);
  return (
    areas.find(
      (a) =>
        !game().growing.includes(a.id) &&
        inRect(a, x + CARD_W / 2, y + CARD_H / 2),
    ) ??
    mostOverlapped(
      areas.filter((a) => game().growing.includes(a.id)),
      x,
      y,
    ) ??
    null
  );
}

/** The spot place a card whose top-left corner is at (x, y) would lie on (same reach as stacking onto a pile). */
function spotAt(
  t: Table,
  x: number,
  y: number,
  families: (Family | undefined)[] = [],
  pointer?: Point,
): { spot: Spot; place: Point; split?: boolean } | undefined {
  // Dropped on a split placeholder (pointing at it, or just beyond it; else with the card's middle there): each half
  // takes the cards into its row.
  const cx = pointer?.x ?? x + CARD_W / 2;
  const cy = pointer?.y ?? y + CARD_H / 2;
  const reach = CARD_W * 0.4;
  for (const spot of spotsOf(t).filter((s) => s.split)) {
    const box = splitBox(t, spot);
    const side = growth(spot);
    const near = {
      x: box.x - (side === 'left' ? reach : 0),
      y: box.y - (side === 'top' ? reach : 0),
      w: box.w + (side === 'left' || side === 'right' ? reach : 0),
      h: box.h + (side === 'top' || side === 'bottom' ? reach : 0),
    };
    if (!inRect(near, cx, cy)) continue;
    const halves = splitHalves(t, spot);
    const half =
      halves.find((b) => (vertical(spot) ? cx < b.x + b.w : cy < b.y + b.h)) ??
      halves[halves.length - 1];
    return { spot: half.spot, place: freePlace(t, half.spot), split: true };
  }
  // An unlimited row reaches one place past its last card (unless it takes new cards through a split placeholder);
  // taking new cards first, also its free place before them.
  const places = (spot: Spot) => {
    if (spot.addsFirst)
      return [
        ...freePlaces(t, spot),
        ...spotPlaces(spot, fanRow(t, spot).length),
      ];
    const n =
      fanMax(spot) === Infinity
        ? fanRow(t, spot).length + (sharesPlaceholder(t, spot) ? 0 : 1)
        : fanMax(spot);
    return spotPlaces(spot, n);
  };
  // Laid right on the place, or with its middle over the part of the place left showing beside a covering card.
  const shown = (spot: Spot): Point => {
    const side = coveredSide(spot);
    const hidden = 1 - (spot.shows ?? 0.5);
    const dx = side === 'left' ? 1 : side === 'right' ? -1 : 0;
    const dy = side === 'top' ? 1 : side === 'bottom' ? -1 : 0;
    const { w, h } = lyingSize(spot);
    return { x: (dx * hidden * w) / 2, y: (dy * hidden * h) / 2 };
  };
  const near = spotsOf(t).flatMap((spot) =>
    places(spot).map((place) => ({
      spot,
      place,
      d: Math.min(
        Math.hypot(place.x - x, place.y - y),
        Math.hypot(place.x + shown(spot).x - x, place.y + shown(spot).y - y),
      ),
    })),
  );
  // Overlapping places (half under another card, fanned) are close together: take the nearest that takes the cards,
  // else the nearest (to refuse them there).
  const fits = (spot: Spot) =>
    families.length > 0 && families.every((f) => takes(spot, f));
  return near
    .filter((n) => n.d < CARD_W * 0.4)
    .sort(
      (a, b) => Number(fits(b.spot)) - Number(fits(a.spot)) || a.d - b.d,
    )[0];
}

/**
 * Table piles back to front as drawn: piles on a spot lie right under the card
 * (or fanned row) of the spot covering them, later places of a fanned spot under earlier ones,
 * and piles on a spot lying over a storybook place right above it.
 */
export function drawOrder(t: Table): string[] {
  let z = t.z;
  const spots = spotsOf(t);
  for (const spot of spots) {
    if (!spot.under && !spot.underPile && !spot.fan) continue;
    // Later places lie under earlier ones, unless each card lies on the one before (the hand).
    const row = stacksOnSpot(t, spot);
    const below = spot.overlaps ? row : [...row].reverse();
    if (!below.length) continue;
    // Under the lowest card of the covering spot (the last of a fanned row, e.g. the outer house extension); while that
    // has none, of the spot covering it (the Skills under the Character Card while there are no Titles).
    let cover = spots.find((s) => s.id === spot.under);
    let covering = spot.underPile
      ? [spot.underPile.id]
      : cover
        ? stacksOnSpot(t, cover)
        : [];
    while (cover && !covering.length) {
      const next: string | undefined = cover.under;
      cover = spots.find((s) => s.id === next);
      covering = cover ? stacksOnSpot(t, cover) : [];
    }
    const first = Math.min(...below.map((id) => z.indexOf(id)));
    z = z.filter((id) => !below.includes(id));
    const above = Math.min(...covering.map((id) => z.indexOf(id)));
    z.splice(covering.length ? above : first, 0, ...below);
  }
  // A card lying on another's card (a Hit Point Card on its Enemy Card) right above it.
  for (const spot of spots) {
    if (!spot.above) continue;
    const on = stacksOnSpot(t, spot);
    const cover = spots.find((s) => s.id === spot.above);
    const below = cover ? stacksOnSpot(t, cover) : [];
    if (!on.length || !below.length) continue;
    z = z.filter((id) => !on.includes(id));
    z.splice(Math.max(...below.map((id) => z.indexOf(id))) + 1, 0, ...on);
  }
  for (const spot of spots) {
    if (!spot.over) continue;
    const on = stacksOnSpot(t, spot);
    const slot = placeStack(t, spot.over)?.id;
    if (!on.length || !slot) continue;
    z = z.filter((id) => !on.includes(id));
    z.splice(z.indexOf(slot) + 1, 0, ...on);
  }
  return z;
}

export interface Placement {
  /** Where the cards really go: a new pile lying `at` (drawn at x, y until the table is settled), or on top of pile `onto`. */
  at: At;
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
 * end up. Cards dropped in a table deck's area go into that deck (onto its pile),
 * in the Encounter Deck area onto the nearest of its places, cards with an attracting spot go there whatever the drop point, cards
 * dropped on a spot snap onto it; `moving` is the pile being moved as a whole,
 * which doesn't count as lying on the spot. `pointer`, where the dragged card is held (it may lie offset from it),
 * picks the half of a split placeholder; else the card's middle does.
 */
export function placement(
  t: Table,
  cardIds: string[],
  defs: Record<string, CardDef>,
  x: number,
  y: number,
  onto: string | null,
  moving: string | null = null,
  pointer?: Point,
): Placement {
  const target = onto ? t.stacks[onto] : null;
  const at = { x: target?.x ?? x, y: target?.y ?? y };
  const families = cardIds.map((id) => family(defs[id]));
  const g = game().grids.find((g) => families.includes(game().gridFamily[g]));
  const grid = g && ontoGrid(t, g, cardIds, families, x, y, moving, pointer);
  if (grid) return grid;
  const area = areaForCard(t, at.x, at.y);
  // Nothing goes on top of a card on a grid; dropped on a card near a place of that grid lying under one of its cards (a
  // Region Card's Market Prices place), cards it takes go there.
  const under = target ? gridOf(t, target.id) : undefined;
  const beside = under && spotAt(t, x, y, families, pointer);
  if (
    under &&
    !(
      beside &&
      beside.spot.underPile &&
      beside.spot.area === under &&
      families.every((f) => takes(beside.spot, f))
    )
  ) {
    const label = game().areas.find((a) => a.id === under)!.label;
    return {
      at: looseAt(t, x, y),
      x,
      y,
      onto: null,
      area,
      spot: null,
      refused: `Nothing goes on top of a ${game().cardNames[game().gridFamily[under]]} on the ${label}`,
    };
  }
  if (area?.deck) return intoDeck(t, area, area.deck, cardIds, defs);
  const places = area ? deckPlacesIn(area.id) : [];
  if (area && places.length)
    return ontoPlace(t, area, places, cardIds, defs, at);
  const own = spotsOf(t).find((s) => s.attracts && families.includes(s.family));
  if (own) {
    const area = allAreas(t).find((a) => a.id === own.area)!;
    const mixed = families.every((f) => f === own.family)
      ? null
      : `The ${own.label} lies alone on its place in the ${area.label} area`;
    const place = spotPlace(t, own, moving, x, y);
    return {
      ...(place ?? { x: own.x, y: own.y, onto: null }),
      at: { spot: own.id, index: place?.index ?? 0 },
      area,
      spot: own,
      refused: mixed ?? oneEach(own, cardIds) ?? (place ? null : full(own)),
    };
  }
  // Nothing stacks onto a card in a fanned row (or on a grid), so dropped on one, the cards go to the place they are
  // dropped on (e.g. the Storage Card place, which the first Goods card overlaps until a Storage Card covers it).
  const fanned =
    !!onto &&
    (!!under || spotsOf(t).some((s) => s.fan && fanRow(t, s).includes(onto)));
  const taken =
    (fanned && spotAt(t, x, y, families, pointer)) ||
    spotAt(t, at.x, at.y, families, pointer) ||
    areaSpot(t, area, families);
  if (!taken)
    return {
      at: looseAt(t, x, y),
      x,
      y,
      onto,
      area,
      spot: null,
      refused: game().refusal(area, cardIds, defs),
    };
  let { spot } = taken;
  const { place } = taken;
  // A pile moved within one of two rows sharing a split placeholder (the Titles below the Skills) is only reordered in
  // it, dropped where it may; only through the placeholder does it go to the other.
  let to = at;
  const from = moving ? pairedRow(t, moving) : undefined;
  if (
    from &&
    !('split' in taken && taken.split) &&
    from.id !== spot.id &&
    (from.after === spot.id || spot.after === from.id)
  ) {
    spot = from;
    to = withinRow(t, from, at);
  }
  const fits = families.every((f) => takes(spot, f));
  const other = spot.attracts
    ? `Only the ${spot.label} goes on its place`
    : `Only ${familyNames(spot)} go on the ${spot.label} place`;
  // A spot takes its cards even in an area that doesn't (the Encounter Card in the Storybook area).
  const refused = fits ? null : (game().refusal(area, cardIds, defs) ?? other);
  if (!spot.fan)
    return {
      ...place,
      at: { spot: spot.id, index: 0 },
      onto: pileOn(t, spot, moving),
      area,
      spot,
      refused:
        refused ?? (spot.one && holdsOne(t, spot, moving) ? full(spot) : null),
    };
  // A card joins a fanned row at the place it is dropped on, never on top of another card.
  const inRow = spotPlace(t, spot, moving, to.x, to.y);
  return {
    ...(inRow ?? { ...place, onto: null }),
    at: { spot: spot.id, index: inRow?.index ?? 0 },
    area,
    spot,
    refused: refused ?? oneEach(spot, cardIds) ?? (inRow ? null : full(spot)),
  };
}

/** The row pile `id` lies in, if it is one of two rows sharing a split placeholder (the Titles, the Skills). */
function pairedRow(t: Table, id: string): Spot | undefined {
  return spotsOf(t).find(
    (s) => (s.split || sharesPlaceholder(t, s)) && fanRow(t, s).includes(id),
  );
}

/** The point of a row nearest to `p`: on its line, between its first and last places. */
function withinRow(t: Table, spot: Spot, p: Point): Point {
  const n = Math.max(1, fanRow(t, spot).length);
  const last = spotPlaces(spot, n)[n - 1];
  const clamp = (v: number, a: number, b: number) =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));
  return vertical(spot)
    ? { x: spot.x, y: clamp(p.y, spot.y, last.y) }
    : { x: clamp(p.x, spot.x, last.x), y: spot.y };
}

/** How far from a free place of a grid a card dropped outside its area still goes to it. */
const GRID_REACH = CARD_W * 0.4;

/**
 * Where Region Cards dropped on the Map, or Terrain Cards on the battlefield, go: one at a time, onto the free place of
 * its grid nearest to where the card's middle (or the pointer) is, a strip beside a card (`gridPlaces()`). Null when
 * dropped away from the grid's area: they go as anywhere else.
 */
function ontoGrid(
  t: Table,
  g: GridId,
  cardIds: string[],
  families: (Family | undefined)[],
  x: number,
  y: number,
  moving: string | null,
  pointer?: Point,
): Placement | null {
  const area = allAreas(t).find((a) => a.id === g)!;
  const c = pointer ?? { x: x + CARD_W / 2, y: y + CARD_H / 2 };
  const near = gridPlaces(t, g, moving)
    .map((p) => ({ p, d: distanceTo(p.box, c) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!inRect(area, c.x, c.y) && !(near && near.d < GRID_REACH)) return null;
  const names = game().familyNames[game().gridFamily[g]];
  const refused = !families.every((f) => f === game().gridFamily[g])
    ? `Only ${names} go on the ${area.label}'s places`
    : cardIds.length > 1
      ? `Put ${names} on the ${area.label} one at a time`
      : near
        ? null
        : `There is no free place beside the ${area.label}'s cards`;
  const place = near?.p ?? { x, y };
  const at: At = near
    ? { grid: g, col: near.p.col, row: near.p.row }
    : looseAt(t, x, y);
  return { at, x: place.x, y: place.y, onto: null, area, spot: null, refused };
}

/** Cards dropped in a table deck's area go onto its pile (into the deck, `dropOnto()`), if it may hold them all. */
function intoDeck(
  t: Table,
  area: Area,
  kind: DeckKind,
  cardIds: string[],
  defs: Record<string, CardDef>,
): Placement {
  const spec = game().decks[kind];
  const onto = placeStack(t, kind)?.id ?? null;
  const bad = cardIds.map((id) => defs[id]).find((d) => d && !spec.holds(d));
  const p = game().placePoint(t, kind);
  return {
    ...p,
    at: looseAt(t, p.x, p.y),
    onto,
    area,
    spot: null,
    refused: bad
      ? `${bad.code ?? bad.name ?? 'This card'} can't go into the ${spec.label}`
      : null,
  };
}

/** The places of a deck's piles lying in an area (`GameDefinition.deckPlaces`): the Encounter Deck area's. */
export function deckPlacesIn(area: string) {
  return game().deckPlaces.filter((p) => game().placeArea(p.place) === area);
}

/** Cards dropped in an area of a deck's places (`deckPlacesIn()`) go onto the place nearest to where they are dropped. */
function ontoPlace(
  t: Table,
  area: Area,
  places: { place: FixedPlace }[],
  cardIds: string[],
  defs: Record<string, CardDef>,
  at: Point,
): Placement {
  const far = (p: Point) => Math.hypot(p.x - at.x, p.y - at.y);
  const nearest = places
    .map(({ place }) => ({ place, ...game().placePoint(t, place) }))
    .reduce((a, p) => (far(p) < far(a) ? p : a));
  return {
    at: looseAt(t, nearest.x, nearest.y),
    x: nearest.x,
    y: nearest.y,
    onto: placeStack(t, nearest.place)?.id ?? null,
    area,
    spot: null,
    refused: game().refusal(area, cardIds, defs),
  };
}

/** The spot taking cards of these families dropped anywhere in `area`, if any. */
function areaSpot(
  t: Table,
  area: Area | null,
  families: (Family | undefined)[],
): { spot: Spot; place: Point } | undefined {
  const spot = spotsOf(t).find(
    (s) =>
      s.fillsArea && s.area === area?.id && families.every((f) => takes(s, f)),
  );
  return spot && { spot, place: { x: spot.x, y: spot.y } };
}

/** A fanned spot takes one card per place, not a pile (unless it spreads a pile out on its row, as the hand does). */
function oneEach(spot: Spot, cardIds: string[]): string | null {
  return spot.fan && !spot.takesPiles && cardIds.length > 1
    ? `Put ${familyNames(spot)} on the ${spot.label} place one at a time`
    : null;
}

/** The names of the card families a spot takes, e.g. "Encounter Cards and Lost Pages Cards". */
function familyNames(spot: Spot): string {
  return [spot.family, ...(spot.also ?? [])]
    .map((f) => game().familyNames[f])
    .join(' and ');
}

function full(spot: Spot): string {
  const area = game().areas.find((a) => a.id === spot.area)!;
  // Several places for the family: they are all taken.
  const max = game()
    .spots.filter((s) => s.area === spot.area && s.family === spot.family)
    .reduce((n, s) => n + fanMax(s), 0);
  // A place cards don't find on their own: that one is taken.
  if (!spot.attracts && fanMax(spot) > 1 && fanMax(spot) < Infinity)
    return `The ${spot.label} place in the ${area.label} area holds at most ${fanMax(spot)} cards`;
  if (max === 1 || !spot.attracts)
    return `There is already a card on the ${spot.label} place in the ${area.label} area`;
  return `The ${area.label} area holds at most ${max} ${game().familyNames[spot.family]}`;
}
