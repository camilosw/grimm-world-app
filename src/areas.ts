import {
  CARD_H,
  CARD_W,
  cardBox,
  family,
  TOKEN_SIZE,
  type Family,
  type Turn,
} from "./cards";
import { DECK_SPECS, TABLE_DECKS, type DeckKind } from "./decks";
import type {
  Battlefield,
  CardDef,
  EncounterPlace,
  Stack,
  StorySlot,
  Table,
} from "./types";

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

export const AREA_PAD = 40;
export const AREA_HEADER = 90;
export const GAP = 120;

/** Size of an area holding `cols` × `rows` cards. */
function box(cols: number, rows: number) {
  return {
    w: cols * CARD_W + AREA_PAD * 2,
    h: rows * CARD_H + AREA_HEADER + AREA_PAD,
  };
}

/**
 * Part of a Market Prices card's width, as it lies landscape, showing beside its Region Card; the rest lies under it.
 * Just its price strip, as in rulebook figure 63.
 */
const MARKET_SHOWS = 0.17;
/** Width of a Market Prices card's price strip showing beside its Region Card. */
const marketStrip = Math.round(MARKET_SHOWS * CARD_H);
// Just large enough for the Region Card places, landscape, two by two, with the Market Prices strips beside them (see
// SPOTS).
const map = {
  x: 0,
  y: 0,
  w: 2 * CARD_H + 2 * marketStrip + AREA_PAD * 2,
  h: 2 * CARD_W + AREA_HEADER + AREA_PAD,
};
/**
 * Part of an Encounter Bar card's width, as it lies landscape, showing right of the card lying over it: about the strip
 * on the right of its back with its card number, location and chapter, as in rulebook figure 29.
 */
const BAR_SHOWS = 0.26;
// Right of the Map, one landscape card high. Drawn only as large as its cards need (`measure()`): this size, just its
// free place, places its spot; it grows right with the cards placed in it (see SPOTS).
const bar = {
  x: map.x + map.w + GAP,
  y: 0,
  w: CARD_H + AREA_PAD * 2,
  h: CARD_W + AREA_HEADER + AREA_PAD,
};
/** Space between the Encounter Deck area's places. */
const PLACE_GAP = 40;
/**
 * A button below a card's place (the Shuffle button below each time card's place in the Encounter Deck area, Browse
 * below the Training Deck): its distance from the card, and height.
 */
export const PLACE_BUTTON = { gap: 24, h: 76 };
// Right of the Encounter Bar, and moving right as it grows (`settleLayout()`): the three places of the Encounter Deck
// area side by side (`ENCOUNTER_PLACES`), with a Shuffle button below each time card's.
const encounter = {
  x: bar.x + bar.w + GAP,
  y: 0,
  w: 3 * CARD_W + 2 * PLACE_GAP + AREA_PAD * 2,
  h: CARD_H + PLACE_BUTTON.gap + PLACE_BUTTON.h + AREA_HEADER + AREA_PAD,
};
// Below the Map, which is taller than the Encounter Bar. The Character, Storage and Home areas are drawn only as large
// as the cards in them need (`measure()`): these sizes just place their spots. Where the areas really lie is up to
// `settleLayout()`, which moves each next to the one before it.
const character = { x: 0, y: Math.max(map.h, bar.h) + GAP, ...box(5, 3) };
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
/** Table decks with a Browse button below their place: the Training Deck, whose cards are all taken to train. */
export const BROWSE_DECKS: DeckKind[] = ["training"];
// Right of the Storybook area, one card each, two by two as laid out (`settleLayout()`): the decks built during play,
// each on its place (see `deckPlace()`), with its Browse button below it (`BROWSE_DECKS`).
const deckBox = box(1, 1);
const deckArea = (i: number) => ({
  x: story.x + story.w + GAP + i * (deckBox.w + GAP),
  y: character.y,
  w: deckBox.w,
  h: deckBox.h + (BROWSE_DECKS.includes(TABLE_DECKS[i]) ? PLACE_BUTTON.gap + PLACE_BUTTON.h : 0),
});
/** Part of the house extension's height showing above the House Card (the rest lies under it). */
const HOUSE_ABOVE_SHOWS = 0.27;
/** Part of the house extension's height showing below the House Card. */
const HOUSE_BELOW_SHOWS = 0.42;
/** Part of a house extension's width showing beside the House Card, or beside the extension before it. */
const HOUSE_SIDE_SHOWS = 0.5;
/** Most house extensions left and right of the House Card. */
const HOUSE_SIDE_CARDS = 2;
/** Part of a Goods card's width showing left of the card on top of it (in the Storage and Home areas). */
const GOODS_LEFT_SHOWS = 0.31;
/** Most Goods left of the house extensions. */
const HOME_GOODS_CARDS = 16;
/** Part of an Equipment card's width showing right of the card on top of it. */
const EQUIPMENT_SHOWS = 0.15;
/** Most Equipment cards right of the house extensions. */
const EQUIPMENT_CARDS = 4;
/** Card widths taken left of the House Card: its extensions, then the Goods. */
const HOME_LEFT =
  HOUSE_SIDE_CARDS * HOUSE_SIDE_SHOWS + HOME_GOODS_CARDS * GOODS_LEFT_SHOWS;
/** Card widths taken right of the House Card: its extensions, then the Equipment. */
const HOME_RIGHT =
  HOUSE_SIDE_CARDS * HOUSE_SIDE_SHOWS + EQUIPMENT_CARDS * EQUIPMENT_SHOWS;
// The House Card with its extensions around it, and room for all the Goods to their left and the Equipment to their
// right (see SPOTS).
const home = {
  x: story.x,
  y: story.y + story.h + GAP,
  ...box(HOME_LEFT + 1 + HOME_RIGHT, 1 + HOUSE_ABOVE_SHOWS + HOUSE_BELOW_SHOWS),
};
/** Part of a hand card's height showing above the card lying on it: the strip of an Action Card, turned upside down. */
const HAND_SHOWS = 0.22;
// Right of the table decks' areas: the hand, a column of Y-cards growing down, and right of it the discard pile above
// the Damage Card (see SPOTS). Drawn only as large as its cards need (`measure()`): this size just places its spots.
const hand = {
  x: deckArea(TABLE_DECKS.length).x,
  y: character.y,
  w: 2 * CARD_W + PLACE_GAP + AREA_PAD * 2,
  h: 2 * CARD_H + PLACE_GAP + AREA_HEADER + AREA_PAD,
};

export const AREAS: Area[] = [
  {
    id: "map",
    label: "Map",
    ...map,
    accepts: ["region"],
  },
  { id: "bar", label: "Encounter Bar", ...bar, accepts: ["lost-pages"] },
  {
    id: "encounter",
    label: "Encounter Deck",
    ...encounter,
    accepts: ["encounter"],
  },
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
  ...TABLE_DECKS.map(
    (kind, i): Area => ({
      id: kind,
      label: DECK_SPECS[kind].label,
      ...deckArea(i),
      accepts: [],
      deck: kind,
    }),
  ),
  { id: "hand", label: "Actions", ...hand, accepts: ["lost-pages"] },
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
   * first lies under that card: at most `count` of them (`Infinity`: any number, the area growing with the row).
   * With `count: 1`, the spot holds a single card.
   */
  fan?: { count: number };
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
   * its bottom card first (`settleSpots()`): the hand, taking back the cards under the Damage Card or the discard pile.
   */
  takesPiles?: boolean;
  /** Cards dropped on its pile go under it, not on top (the Damage Card, with the Action Cards lost as damage under it). */
  slidesUnder?: boolean;
}

type Point = { x: number; y: number };

/** Most cards a fanned spot holds. */
function fanMax(spot: Spot): number {
  return spot.fan?.count ?? 1;
}

const OPPOSITE: Record<Side, Side> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

/** Which way a fanned spot's row runs: away from the card covering it, the way its cards lie on each other, else right. */
function growth(spot: Spot): Side {
  const side = coveredSide(spot);
  return spot.overlaps ?? (side ? OPPOSITE[side] : "right");
}

/** Whether a spot's row runs down or up. */
function vertical(spot: Spot): boolean {
  const side = growth(spot);
  return side === "top" || side === "bottom";
}

/** Size of a spot's card as it lies there. */
function lyingSize(spot: Spot): { w: number; h: number } {
  const { width, height } = cardBox(0, 0, !!spot.landscape);
  return { w: width, h: height };
}

/** Signed distance between the places of a fanned spot (negative: the row grows to the left or up). */
function fanStep(spot: Spot): number {
  const side = growth(spot);
  const dir = side === "left" || side === "top" ? -1 : 1;
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

/** Whether a fanned spot's row has room for one more card, so its next place can be shown. */
export function fanHasPlace(t: Table, spot: Spot): boolean {
  return fanRow(t, spot).length < fanMax(spot);
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

/** Most places in a row between two of its cards: the gap left by cards just taken away, until `settleSpots()`. */
const FAN_GAP = 3;

/**
 * Piles lying in a fanned spot's row (on a place, or just dropped between two), from its first place on: the first and
 * each further one at most `FAN_GAP` places beyond the one before, at most `count` of them.
 */
export function fanRow(
  t: Table,
  spot: Spot,
  exclude: string | null = null,
): string[] {
  const step = Math.abs(fanStep(spot));
  const v = vertical(spot);
  const along = (id: string) =>
    (v ? t.stacks[id].y - spot.y : t.stacks[id].x - spot.x) *
    Math.sign(fanStep(spot));
  const inLine = t.z
    .filter(
      (id) =>
        id !== exclude &&
        (v ? t.stacks[id].x === spot.x : t.stacks[id].y === spot.y) &&
        along(id) >= -1,
    )
    .sort((a, b) => along(a) - along(b));
  const row: string[] = [];
  let reach = FAN_GAP * step + 1;
  for (const id of inLine) {
    if (along(id) > reach || row.length >= fanMax(spot)) break;
    row.push(id);
    reach = along(id) + FAN_GAP * step + 1;
  }
  return row;
}

/**
 * Where cards going to a spot land (top-left dropped at x, y), or null when a
 * fanned spot is full. A plain spot: onto the pile lying there. A fanned spot:
 * at the place the card is dropped on, or after the last card when dropped
 * elsewhere (before the first, for a row taking new cards first, unless dropped in line beyond its last card). That
 * position may lie half a unit beside a place, which sorts the
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
  return spotsOf(t).find((s) => s.turn && stacksOnSpot(t, s).includes(id));
}

/** Whether pile `id` lies on a spot taking the cards dropped on it underneath (the Damage Card's). */
export function slidesUnder(t: Table, id: string): boolean {
  return spotsOf(t).some((s) => s.slidesUnder && stacksOnSpot(t, s).includes(id));
}

/** The spot laying the cards on it upside down (the Actions area's) that pile `id` lies on, if any. */
export function upsideDownSpot(t: Table, id: string): Spot | undefined {
  return spotsOf(t).find(
    (s) => s.upsideDown && stacksOnSpot(t, s).includes(id),
  );
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
  // Where they lie in `SPOTS`: moved with their area, they lie the same way side by side.
  const cover = SPOTS.find((s) => s.id === spot.under);
  if (!cover) return null;
  spot = SPOTS.find((s) => s.id === spot.id) ?? spot;
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
// Rounded like the places of a fanned spot (the Home area's top lies half a unit off the grid).
/** Distance between the places of the house extensions left and right of the House Card. */
const houseSideStep = Math.round(HOUSE_SIDE_SHOWS * CARD_W);
const houseSpot = {
  x: Math.round(home.x + AREA_PAD + HOME_LEFT * CARD_W),
  y: Math.round(home.y + AREA_HEADER + HOUSE_ABOVE_SHOWS * CARD_H),
};
/** Part of a Goods card's height showing below the card on top of it. */
const GOODS_BELOW_SHOWS = 0.21;
const goodsX = Math.round(storageSpot.x - GOODS_LEFT_SHOWS * CARD_W);
const goodsBelowY = Math.round(storageSpot.y + GOODS_BELOW_SHOWS * CARD_H);
/**
 * Place of the first Encounter Bar card (a portrait card's, the card lies across it), one place right of the row's
 * free place.
 */
const barSpot = {
  x: bar.x + AREA_PAD + (CARD_H - CARD_W) / 2 + Math.round(BAR_SHOWS * CARD_H),
  y: bar.y + AREA_HEADER + (CARD_W - CARD_H) / 2,
};
/** Top-left corner of the Region Cards laid out landscape, edge to edge, two by two between the Market Prices strips. */
const regionGrid = {
  x: map.x + AREA_PAD + marketStrip,
  y: map.y + AREA_HEADER,
};
const handSpot = { x: hand.x + AREA_PAD, y: hand.y + AREA_HEADER };
/** Place of the i-th Region Card (left to right, top to bottom): a portrait card's, the Region Card lies across it. */
const regionPlace = (i: number) => ({
  x: regionGrid.x + (i % 2) * CARD_H + (CARD_H - CARD_W) / 2,
  y: regionGrid.y + Math.floor(i / 2) * CARD_W + (CARD_W - CARD_H) / 2,
});
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
    const offset = (left ? -1 : 1) * marketStrip;
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
  // The Y-cards placed in the Encounter Bar (rulebook 5.2), landscape and face down, as in rulebook figure 29: their backs
  // show the location they belong to, with card number, location and chapter on their right strip. Each lies over the
  // left part of the one after it, so a new card, which goes first, lies on top of the others. Its free place stays
  // before them, partly under the first; Y-cards dropped anywhere in the area go into the row. Any number of them: the area grows with it.
  {
    id: "bar",
    label: "Encounter Bar",
    hint: "Y-Cards, face down",
    area: "bar",
    family: "lost-pages",
    attracts: false,
    ...barSpot,
    shows: BAR_SHOWS,
    fan: { count: Infinity },
    fillsArea: true,
    landscape: true,
    turn: "left",
    faceDown: true,
    addsFirst: true,
  },
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
  // the one before (rulebook 4.7.4). Any number of them: the area grows with the row.
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
    fan: { count: Infinity },
  },
  // The same below the Storage Card: only their bottom part shows, each further one under the one before.
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
    fan: { count: Infinity },
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
  // The Y-cards in the hand (Action Cards, rulebook 4.7.7), upside down, so the strip printed upside down at the bottom
  // of an Action Card reads the right way up at the top. Each lies on the one before, a little lower, leaving the top
  // of the one before showing (`HAND_SHOWS`). Y-cards dropped anywhere in the area but on the discard pile go into
  // it. Any number of them: the area grows down with the column.
  {
    id: "hand",
    label: "Hand",
    hint: "Y-Cards",
    area: "hand",
    family: "lost-pages",
    attracts: false,
    ...handSpot,
    shows: HAND_SHOWS,
    fan: { count: Infinity },
    overlaps: "bottom",
    fillsArea: true,
    upsideDown: true,
    takesPiles: true,
  },
  // Right of the hand: the cards played from it (rulebook 8.2.1.1.1), upside down too, in one pile.
  {
    id: "discard",
    label: "Discard",
    hint: "Y-Cards",
    area: "hand",
    family: "lost-pages",
    attracts: false,
    x: handSpot.x + CARD_W + PLACE_GAP,
    y: handSpot.y,
    upsideDown: true,
  },
  // Below the discard pile: the Damage Card, upright and there for good (a fixed place, `pinnedOnTop()` in actions.ts),
  // with the Action Cards discarded as damage under it (rulebook 4.7.9), so they aren't mixed up with the played ones.
  // Cards dropped on it go under it.
  {
    id: "damage",
    label: "Damage Card",
    hint: "Y010",
    area: "hand",
    family: "lost-pages",
    attracts: false,
    x: handSpot.x + CARD_W + PLACE_GAP,
    y: handSpot.y + CARD_H + PLACE_GAP,
    slidesUnder: true,
  },
  // In the middle of the Home area. The House Card is a Y-card; its extensions lie under it (rulebook 10).
  {
    id: "house",
    label: "House Card",
    hint: "Y730",
    area: "home",
    family: "lost-pages",
    attracts: false,
    ...houseSpot,
  },
  // Left and right of the House Card, up to two extensions each: the first slid half under it, the second half under
  // the first (`HOUSE_SIDE_SHOWS`).
  ...(["left", "right"] as const).map(
    (side): Spot => ({
      id: `house-${side}`,
      label: "House Extension",
      area: "home",
      family: "lost-pages",
      attracts: false,
      x: houseSpot.x + (side === "left" ? -1 : 1) * houseSideStep,
      y: houseSpot.y,
      under: "house",
      shows: HOUSE_SIDE_SHOWS,
      fan: { count: HOUSE_SIDE_CARDS },
    }),
  ),
  // Above and below it, one extension each, mostly under it (`HOUSE_ABOVE_SHOWS`, `HOUSE_BELOW_SHOWS`).
  {
    id: "house-above",
    label: "House Extension",
    area: "home",
    family: "lost-pages",
    attracts: false,
    x: houseSpot.x,
    y: houseSpot.y - Math.round(HOUSE_ABOVE_SHOWS * CARD_H),
    under: "house",
    shows: HOUSE_ABOVE_SHOWS,
    fan: { count: 1 },
  },
  {
    id: "house-below",
    label: "House Extension",
    area: "home",
    family: "lost-pages",
    attracts: false,
    x: houseSpot.x,
    y: houseSpot.y + Math.round(HOUSE_BELOW_SHOWS * CARD_H),
    under: "house",
    shows: HOUSE_BELOW_SHOWS,
    fan: { count: 1 },
  },
  // Left of the house extensions, slid under the outer one as the Goods in the Storage area are under the Storage Card,
  // each further one under the one before.
  {
    id: "home-goods",
    label: "Goods",
    hint: "Encounter Cards",
    area: "home",
    family: "encounter",
    attracts: false,
    x:
      houseSpot.x -
      HOUSE_SIDE_CARDS * houseSideStep -
      Math.round(GOODS_LEFT_SHOWS * CARD_W),
    y: houseSpot.y,
    under: "house-left",
    shows: GOODS_LEFT_SHOWS,
    fan: { count: HOME_GOODS_CARDS },
  },
  // The same right of them, showing only a narrow strip of each card.
  {
    id: "home-equipment",
    label: "Equipment",
    hint: "Encounter Cards",
    area: "home",
    family: "encounter",
    attracts: false,
    x:
      houseSpot.x +
      HOUSE_SIDE_CARDS * houseSideStep +
      Math.round(EQUIPMENT_SHOWS * CARD_W),
    y: houseSpot.y,
    under: "house-right",
    shows: EQUIPMENT_SHOWS,
    fan: { count: EQUIPMENT_CARDS },
  },
];

/** Fixed places of the storybook: revealed cards on the left, the face-down deck on the right. */
export const STORY_SLOTS = {
  "story-revealed": { x: story.x + AREA_PAD, y: story.y + AREA_HEADER },
  story: { x: story.x + AREA_PAD + CARD_W, y: story.y + AREA_HEADER },
};

/**
 * The Encounter Deck area's places, left to right. The 'Time Passes' and 'Next Chapter' cards lie for good at the
 * bottom of theirs (`pinned()` in actions.ts), the Encounter Deck on one of them (`deckStack()`); the used Encounter
 * Cards lie on the third until they go back under the deck. Each holds Encounter Cards only.
 */
export const ENCOUNTER_PLACES: {
  place: EncounterPlace;
  label: string;
  hint?: string;
}[] = [
  { place: "time-passes", label: "Time Passes" },
  { place: "next-chapter", label: "Next Chapter" },
  { place: "used", label: "Used Cards", hint: "Encounter Cards" },
];

/** Where an Encounter Deck place lies on this table: its pile, or its placeholder. */
export function encounterPlace(t: Table, place: EncounterPlace): Point {
  const i = ENCOUNTER_PLACES.findIndex((p) => p.place === place);
  const d = shiftOf(t, "encounter");
  return {
    x: encounter.x + AREA_PAD + i * (CARD_W + PLACE_GAP) + d.x,
    y: encounter.y + AREA_HEADER + d.y,
  };
}

/** The pile on an Encounter Deck place. */
export function placeStack(t: Table, place: EncounterPlace): Stack | undefined {
  return t.z.map((id) => t.stacks[id]).find((s) => s.place === place);
}

/** Place of a table deck in its area (`TABLE_DECKS`), as it lies on this table: where its pile lies, or its placeholder. */
export function deckPlace(t: Table, kind: DeckKind): Point {
  const area = AREAS.find((a) => a.deck === kind)!;
  const d = shiftOf(t, area.id);
  return { x: area.x + AREA_PAD + d.x, y: area.y + AREA_HEADER + d.y };
}

/**
 * Where the battlefield is laid out: at the left edge, below the other areas (`battlefieldOrigin()`). This height is
 * where it lay below the areas' own places, for migrating older saves.
 */
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
  return [spot, fanHasPlace(t, spot) ? freePlace(t, spot) : last];
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Areas drawn only as large as what lies in them needs: their places (a fanned row as far as its next place) and the
 * piles lying on or overlapping them. Each grows around the cards added to it, pushing the areas right of it and below
 * it away (`settleLayout()`); the Encounter Bar only grows right, pushing the Encounter Deck area along.
 */
const GROWING = ["bar", "character", "storage", "hand", "home"];

const NO_SHIFT: Point = { x: 0, y: 0 };

/** How far an area and everything in it lies from its place in `AREAS` / `SPOTS`, pushed by the areas before it. */
function shiftOf(t: Table, area: string): Point {
  return t.shifts?.[area] ?? NO_SHIFT;
}

const shiftedSpots = new WeakMap<Table, Spot[]>();

/** The spots as they lie on this table: moved with their areas (`Table.shifts`). Use these, not `SPOTS`, for positions. */
export function spotsOf(t: Table): Spot[] {
  let spots = shiftedSpots.get(t);
  if (!spots) {
    spots = SPOTS.map((s) => {
      const d = shiftOf(t, s.area);
      return d.x || d.y ? { ...s, x: s.x + d.x, y: s.y + d.y } : s;
    });
    shiftedSpots.set(t, spots);
  }
  return spots;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Area in which two rectangles overlap. */
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function cardRect(x: number, y: number, landscape = false): Rect {
  const b = cardBox(x, y, landscape);
  return { x: b.left, y: b.top, w: b.width, h: b.height };
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

interface Measured {
  /** The areas where they lie on this table. */
  areas: Area[];
  /** The area each table pile belongs to (none: it lies outside the areas). */
  owner: Map<string, string>;
}

const measured = new WeakMap<Table, Measured>();

/**
 * The areas as they lie on this table, and the area each table pile belongs to: the area of fixed size containing its
 * center (the storybook places: the Storybook area), else the growing area it overlaps most. The growing areas start
 * as framed when last laid out (`Table.frames`), so a card dropped on a frame belongs to that area; then each is framed
 * around its places and piles, taking in any further pile it comes to overlap.
 */
function measure(t: Table): Measured {
  const known = measured.get(t);
  if (known) return known;
  const spots = spotsOf(t);
  const fixed: Area[] = AREAS.filter((a) => !GROWING.includes(a.id)).map(
    (a) => {
      const d = shiftOf(t, a.id);
      return { ...a, x: a.x + d.x, y: a.y + d.y };
    },
  );
  if (t.battlefield) fixed.push(battlefieldArea(t.battlefield));
  const owner = new Map<string, string>();
  const loose: string[] = [];
  for (const id of t.z) {
    const s = t.stacks[id];
    const area = s.slot
      ? "storybook"
      : fixed.find((a) => inRect(a, s.x + CARD_W / 2, s.y + CARD_H / 2))?.id;
    if (area) owner.set(id, area);
    else loose.push(id);
  }
  // Piles lying landscape on their places (the Encounter Bar's cards).
  const wide = new Set(
    spots.filter((s) => s.landscape).flatMap((s) => stacksOnSpot(t, s)),
  );
  const frame = (area: string) => ({
    id: area,
    ...frameAround([
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
  /** Give the piles not yet in an area that overlap one of these frames to that area. */
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
  if (t.battlefield) areas.push(fixed[fixed.length - 1]);
  const m = { areas, owner };
  measured.set(t, m);
  return m;
}

/** The areas as they lie on the table, and the battlefield if there is one. Use these, not `AREAS`. */
export function allAreas(t: Table): Area[] {
  return measure(t).areas;
}

const bottomOf = (r: Rect) => r.y + r.h;
const rightOf = (r: Rect) => r.x + r.w;

/** How far down the battlefield lies: below all the areas. */
function battlefieldTop(areas: Rect[]): number {
  return Math.max(...areas.map(bottomOf)) + GAP;
}

/** Where a battlefield built now goes: below the areas as they lie. */
export function battlefieldOrigin(t: Table): Point {
  const areas = allAreas(t).filter((a) => a.id !== "battlefield");
  return { x: BATTLEFIELD_ORIGIN.x, y: battlefieldTop(areas) };
}

/** Columns of the table decks' block of areas right of the Storybook area. */
const DECK_COLS = 2;

/**
 * Where the areas lie packed together, each `GAP` from the one before however they grew: the Map with the Encounter
 * Bar and the Encounter Deck right of it; below them the Character, Storage and Storybook areas, each right of the one before, the table
 * decks' areas two by two right of the Storybook, and the Actions area right of them; the Home area below the Character and Storage areas (and below any
 * other area it reaches under), and the battlefield below them all, at the left edge.
 */
function packedPlaces(t: Table, now: Map<string, Area>): Map<string, Rect> {
  const laid = new Map<string, Rect>();
  /** Put an area at (x, y); a coordinate left out is that of its own place in `AREAS`. */
  const put = (id: string, at: { x?: number; y?: number }) => {
    const a = now.get(id)!;
    const d = shiftOf(t, id);
    // In whole units, so that the spots moved with it stay on the grid their rows are laid out on.
    const dx = Math.round((at.x ?? a.x - d.x) - a.x);
    const dy = Math.round((at.y ?? a.y - d.y) - a.y);
    laid.set(id, { x: a.x + dx, y: a.y + dy, w: a.w, h: a.h });
    return laid.get(id)!;
  };
  const map = put("map", {});
  const bar = put("bar", { x: rightOf(map) + GAP, y: map.y });
  const encounter = put("encounter", { x: rightOf(bar) + GAP, y: map.y });
  const top = Math.max(bottomOf(map), bottomOf(bar), bottomOf(encounter)) + GAP;
  const character = put("character", { x: map.x, y: top });
  const storage = put("storage", { x: rightOf(character) + GAP, y: top });
  const story = put("storybook", { x: rightOf(storage) + GAP, y: top });
  TABLE_DECKS.forEach((kind, i) => {
    const left = i % DECK_COLS ? laid.get(TABLE_DECKS[i - 1])! : story;
    const above = i >= DECK_COLS ? laid.get(TABLE_DECKS[i - DECK_COLS]) : null;
    put(kind, {
      x: rightOf(left) + GAP,
      y: above ? bottomOf(above) + GAP : top,
    });
  });
  put("hand", {
    x: Math.max(...TABLE_DECKS.map((kind) => rightOf(laid.get(kind)!))) + GAP,
    y: top,
  });
  // Below every area it reaches under (always the Character area).
  const homeRight = character.x + now.get("home")!.w;
  const over = [...laid]
    .filter(([id]) => id !== "map" && id !== "bar" && id !== "encounter")
    .map(([, r]) => r)
    .filter((r) => r.x < homeRight + GAP && rightOf(r) + GAP > character.x);
  put("home", { x: character.x, y: Math.max(...over.map(bottomOf)) + GAP });
  if (now.has("battlefield"))
    put("battlefield", {
      x: BATTLEFIELD_ORIGIN.x,
      y: battlefieldTop([...laid.values()]),
    });
  return laid;
}

/** Two areas closer than `GAP` to each other. */
function crowd(a: Rect, b: Rect): boolean {
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

/**
 * Lay the areas out after a change: packed together (`packedPlaces()`), or, once the player has dragged one, where they
 * put each (`Table.anchors`, `anchoredPlaces()`). An area moves with everything lying in it (its spots, piles and
 * figures, see `Table.shifts`), so it moves back as an area in its way shrinks, and an area growing toward the one
 * before it moves itself instead. Returns the same table when nothing moves.
 */
export function settleLayout(t: Table): Table {
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
    // In whole units, so that the spots moved with it stay on the grid their rows are laid out on.
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
    const c = { x: k.x + TOKEN_SIZE / 2, y: k.y + TOKEN_SIZE / 2 };
    const move = moves.find(([id]) => inRect(now.get(id)!, c.x, c.y));
    return move ? { ...k, x: k.x + move[1].x, y: k.y + move[1].y } : k;
  });
  const shifts = { ...t.shifts };
  for (const [id, d] of moves) {
    if (id === "battlefield") continue;
    const old = shiftOf(t, id);
    shifts[id] = { x: old.x + d.x, y: old.y + d.y };
  }
  const b = t.battlefield;
  const db = delta.get("battlefield");
  const battlefield = b && db && { ...b, x: b.x + db.x, y: b.y + db.y };
  return {
    ...t,
    stacks,
    tokens,
    shifts,
    frames,
    ...(anchors ? { anchors } : {}),
    ...(b ? { battlefield } : {}),
  };
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

/** "Regions · Encounter Cards · Y-Cards", or what a table deck holds. */
export function acceptsText(area: Area): string {
  if (area.deck) return DECK_SPECS[area.deck].holdsText ?? "";
  return area.accepts.map((f) => SHORT_NAMES[f]).join(" · ");
}

/**
 * The area a card whose top-left corner is at (x, y) lies in: the area of fixed size containing its center, else the
 * growing area it overlaps most (as `measure()` decides for the piles on the table).
 */
export function areaForCard(t: Table, x: number, y: number): Area | null {
  const areas = allAreas(t);
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
  families: (Family | undefined)[] = [],
): { spot: Spot; place: Point } | undefined {
  // An unlimited row reaches one place past its last card; taking new cards first, also its free place before them.
  const places = (spot: Spot) => {
    if (spot.addsFirst)
      return [
        ...freePlaces(t, spot),
        ...spotPlaces(spot, fanRow(t, spot).length),
      ];
    const n =
      fanMax(spot) === Infinity ? fanRow(t, spot).length + 1 : fanMax(spot);
    return spotPlaces(spot, n);
  };
  // Laid right on the place, or with its middle over the part of the place left showing beside a covering card.
  const shown = (spot: Spot): Point => {
    const side = coveredSide(spot);
    const hidden = 1 - (spot.shows ?? 0.5);
    const dx = side === "left" ? 1 : side === "right" ? -1 : 0;
    const dy = side === "top" ? 1 : side === "bottom" ? -1 : 0;
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
    families.length > 0 && families.every((f) => f === spot.family);
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
    if (!spot.under && !spot.fan) continue;
    // Later places lie under earlier ones, unless each card lies on the one before (the hand).
    const row = stacksOnSpot(t, spot);
    const below = spot.overlaps ? row : row.reverse();
    if (!below.length) continue;
    // Under the lowest card of the covering spot (the last of a fanned row, e.g. the outer house extension).
    const cover = spots.find((s) => s.id === spot.under);
    const covering = cover ? stacksOnSpot(t, cover) : [];
    const first = Math.min(...below.map((id) => z.indexOf(id)));
    z = z.filter((id) => !below.includes(id));
    const above = Math.min(...covering.map((id) => z.indexOf(id)));
    z.splice(covering.length ? above : first, 0, ...below);
  }
  for (const spot of spots) {
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
 * end up. Cards dropped in a table deck's area go into that deck (onto its pile),
 * in the Encounter Deck area onto the nearest of its places, cards with an attracting spot go there whatever the drop point, cards
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
  const target = onto ? t.stacks[onto] : null;
  const at = { x: target?.x ?? x, y: target?.y ?? y };
  const area = areaForCard(t, at.x, at.y);
  if (area?.deck) return intoDeck(t, area, area.deck, cardIds, defs);
  if (area?.id === "encounter") return ontoPlace(t, area, cardIds, defs, at);
  const families = cardIds.map((id) => family(defs[id]));
  const own = ownSpot(
    t,
    spotsOf(t).filter((s) => s.attracts && families.includes(s.family)),
    moving,
    x,
    y,
  );
  if (own) {
    const area = allAreas(t).find((a) => a.id === own.area)!;
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
  // Nothing stacks onto a card in a fanned row, so dropped on one, the cards go to the place they are dropped on
  // (e.g. the Storage Card place, which the first Goods card overlaps until a Storage Card covers it).
  const fanned =
    !!onto && spotsOf(t).some((s) => s.fan && fanRow(t, s).includes(onto));
  const taken =
    (fanned && spotAt(t, x, y, families)) ||
    spotAt(t, at.x, at.y, families) ||
    areaSpot(t, area, families);
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

/** Cards dropped in a table deck's area go onto its pile (into the deck, `dropOnto()`), if it may hold them all. */
function intoDeck(
  t: Table,
  area: Area,
  kind: DeckKind,
  cardIds: string[],
  defs: Record<string, CardDef>,
): Placement {
  const spec = DECK_SPECS[kind];
  const onto = t.z.find((id) => t.stacks[id].deck === kind) ?? null;
  const bad = cardIds.map((id) => defs[id]).find((d) => d && !spec.holds(d));
  return {
    ...deckPlace(t, kind),
    onto,
    area,
    spot: null,
    refused: bad
      ? `${bad.code ?? bad.name ?? "This card"} can't go into the ${spec.label}`
      : null,
  };
}

/** Cards dropped in the Encounter Deck area go onto the place nearest to where they are dropped, if they are Encounter Cards. */
function ontoPlace(
  t: Table,
  area: Area,
  cardIds: string[],
  defs: Record<string, CardDef>,
  at: Point,
): Placement {
  const far = (p: Point) => Math.hypot(p.x - at.x, p.y - at.y);
  const nearest = ENCOUNTER_PLACES.map(({ place }) => ({
    place,
    ...encounterPlace(t, place),
  })).reduce((a, p) => (far(p) < far(a) ? p : a));
  return {
    x: nearest.x,
    y: nearest.y,
    onto: placeStack(t, nearest.place)?.id ?? null,
    area,
    spot: null,
    refused: refusal(area, cardIds, defs),
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
  t: Table,
  area: Area | null,
  families: (Family | undefined)[],
): { spot: Spot; place: Point } | undefined {
  const spot = spotsOf(t).find(
    (s) =>
      s.fillsArea &&
      s.area === area?.id &&
      families.every((f) => f === s.family),
  );
  return spot && { spot, place: { x: spot.x, y: spot.y } };
}

/** A fanned spot takes one card per place, not a pile (unless it spreads a pile out on its row, as the hand does). */
function oneEach(spot: Spot, cardIds: string[]): string | null {
  return spot.fan && !spot.takesPiles && cardIds.length > 1
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
  if (!spot.attracts && fanMax(spot) > 1 && fanMax(spot) < Infinity)
    return `The ${spot.label} place in the ${area.label} area holds at most ${fanMax(spot)} cards`;
  if (max === 1 || !spot.attracts)
    return `There is already a card on the ${spot.label} place in the ${area.label} area`;
  return `The ${area.label} area holds at most ${max} ${FAMILY_NAMES[spot.family]}`;
}
