// Grimm World's areas and spots, as data: where each lies on its own, its size, which cards it takes, and its own rules
// (the mechanics are in src/lib/engine/areas.ts).

import { family, type Family } from './cards';
import { DECK_SPECS, type DeckKind, TABLE_DECKS } from './decks';
import {
  type Area,
  bottomUnder,
  cellPlace,
  crowd,
  gridBox,
  gridPiles,
  looseAt,
  type Placement,
  placeStack,
  shiftOf,
  type Spot,
} from './lib/engine/areas';
import {
  AREA_HEADER,
  AREA_PAD,
  bottomOf,
  box,
  CARD_H,
  CARD_W,
  GAP,
  OPPOSITE,
  type Point,
  type Rect,
  rightOf,
  type Side,
} from './lib/engine/geometry';
import type { CardDef, Table } from './lib/engine/types';
import type { EncounterPlace, Place, StorySlot } from './types';

/**
 * Space between the areas' own places in `AREAS`. These only fix where spots lie relative to each other, and saves
 * record each area's shift from its own place (`Table.shifts`), so this must not change.
 */
const OWN_GAP = 120;

/**
 * Part of a Market Prices card's width, as it lies landscape, showing beside its Region Card; the rest lies under it.
 * Just its price strip, as in rulebook figure 63.
 */
const MARKET_SHOWS = 0.17;
/** Width of a Market Prices card's price strip showing beside its Region Card. */
const marketStrip = Math.round(MARKET_SHOWS * CARD_H);
// A grid of landscape Region Card places, edge to edge, with the Market Prices strips beside them (`mapSpots()`). Drawn
// only as large as its cards need (`allAreas()`): this size, of the four places it used to have, two by two, only places
// its grid (`gridOrigin()`), and the areas' own places after it.
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
// Right of the Map, one landscape card high. Drawn only as large as its cards need (`allAreas()`): this size, just its
// free place, places its spot; it grows right with the cards placed in it (see SPOTS).
const bar = {
  x: map.x + map.w + OWN_GAP,
  y: 0,
  w: CARD_H + AREA_PAD * 2,
  h: CARD_W + AREA_HEADER + AREA_PAD,
};
/** Space between the Encounter Deck area's places. */
const PLACE_GAP = 40;
/**
 * A button below a card's place (the Shuffle button below each time card's place in the Encounter Deck area, Browse
 * below the Training Deck and the storybook): its distance from the card, and height.
 */
export const PLACE_BUTTON = { gap: 24, h: 76 };
// The three places of the Encounter Deck area side by side (`ENCOUNTER_PLACES`), with a Shuffle button below each time
// card's.
const encounter = {
  x: bar.x + bar.w + OWN_GAP,
  y: 0,
  w: 3 * CARD_W + 2 * PLACE_GAP + AREA_PAD * 2,
  h: CARD_H + PLACE_BUTTON.gap + PLACE_BUTTON.h + AREA_HEADER + AREA_PAD,
};
// Below the Map, which is taller than the Encounter Bar. The Character, Storage and Home areas are drawn only as large
// as the cards in them need (`allAreas()`): these sizes just place their spots. Where the areas really lie is up to
// `settleLayout()`, which moves each next to the one before it.
const character = { x: 0, y: Math.max(map.h, bar.h) + OWN_GAP, ...box(5, 3) };
// Five wide, leaving room right of the Money Cards fanned out from the Storage Card (see SPOTS).
const storage = { x: character.w + OWN_GAP, y: character.y, ...box(5, 3) };
/** Part of the revealed storybook card's height covered by the Encounter Card lying on its bottom edge. */
const STORY_COVERED = 0.15;
// The revealed cards and the storybook, with the Encounter Card below the revealed cards (see SPOTS).
const story = {
  x: storage.x + storage.w + OWN_GAP,
  y: character.y,
  ...box(2, 2 - STORY_COVERED),
};
/** Table decks with a Browse button below their place: the Training Deck, whose cards are all taken to train. */
export const BROWSE_DECKS: DeckKind[] = ['training'];
// One card each, two by two right of the Actions area as laid out (`settleLayout()`): the decks built during play,
// each on its place (see `deckPlace()`), with its Browse button below it (`BROWSE_DECKS`).
const deckBox = box(1, 1);
const deckArea = (i: number) => ({
  x: story.x + story.w + OWN_GAP + i * (deckBox.w + OWN_GAP),
  y: character.y,
  w: deckBox.w,
  h:
    deckBox.h +
    (BROWSE_DECKS.includes(TABLE_DECKS[i])
      ? PLACE_BUTTON.gap + PLACE_BUTTON.h
      : 0),
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
  y: story.y + story.h + OWN_GAP,
  ...box(HOME_LEFT + 1 + HOME_RIGHT, 1 + HOUSE_ABOVE_SHOWS + HOUSE_BELOW_SHOWS),
};
/** Part of a hand card's height showing above the card lying on it: the strip of an Action Card, turned upside down. */
const HAND_SHOWS = 0.22;
// Right of the Character area as laid out: the hand, a column of Y-cards growing down, and right of it the discard
// pile above the Damage Card (see SPOTS). Drawn only as large as its cards need (`allAreas()`): this size just places
// its spots.
const hand = {
  x: deckArea(TABLE_DECKS.length).x,
  y: character.y,
  w: 2 * CARD_W + PLACE_GAP + AREA_PAD * 2,
  h: 2 * CARD_H + PLACE_GAP + AREA_HEADER + AREA_PAD,
};

/** Thickness of a free place beside a card on a grid (the Map's, the battlefield's): a strip along that side of the card. */
export const GRID_STRIP = 50;
/** Columns and rows of Enemy Card places right of the battlefield's Terrain Cards: four enemies at most (rulebook 3.3). */
const ENEMY_COLS = 2;
const ENEMY_ROWS = 2;
const ENEMY_GAP = 60;
/**
 * Where a Hit Point Card lies on its Enemy Card (rulebook figures 80 and 91): this far down, over the card's lower part
 * below its reaction symbols...
 */
const HP_DROP = Math.round(0.715 * CARD_H);
/** ...and this far left of it, its chain pointing at the unspent reaction, or right of it at the spent one. */
const HP_SHIFT = Math.round(0.14 * CARD_W);
/** An Enemy Card's place with its Hit Point Card's places beside and below it. */
const ENEMY_SLOT = { w: CARD_W + 2 * HP_SHIFT, h: HP_DROP + CARD_H };
/** The Enemy Card places, `ENEMY_COLS` by `ENEMY_ROWS`. */
const ENEMY_BLOCK = {
  w: ENEMY_COLS * ENEMY_SLOT.w + (ENEMY_COLS - 1) * PLACE_GAP,
  h: ENEMY_ROWS * ENEMY_SLOT.h + (ENEMY_ROWS - 1) * PLACE_GAP,
};
// Right of the Home area as laid out (`battlefieldPlace()`): a grid of landscape Terrain Card places, edge to edge, with
// room for the Enemy Cards right of it. Drawn only as large as its cards need (`allAreas()`): this size, its first place
// alone, places its grid (`gridOrigin()`).
const battlefield = {
  x: home.x + home.w + OWN_GAP,
  y: home.y,
  w: CARD_H + 2 * GRID_STRIP + ENEMY_GAP + ENEMY_BLOCK.w + AREA_PAD * 2,
  h: 2 * CARD_H + AREA_HEADER + AREA_PAD,
};

export const AREAS: Area[] = [
  {
    id: 'map',
    label: 'Map',
    ...map,
    accepts: ['region'],
  },
  { id: 'bar', label: 'Encounter Bar', ...bar, accepts: ['lost-pages'] },
  {
    id: 'encounter',
    label: 'Encounter Deck',
    ...encounter,
    accepts: ['encounter'],
  },
  {
    id: 'character',
    label: 'Character',
    ...character,
    accepts: ['character', 'alignment', 'lost-pages', 'encounter'],
  },
  {
    id: 'storage',
    label: 'Storage',
    ...storage,
    accepts: ['lost-pages', 'encounter', 'money'],
  },
  { id: 'storybook', label: 'Storybook', ...story, accepts: ['storybook'] },
  ...TABLE_DECKS.map((kind, i): Area => ({
    id: kind,
    label: DECK_SPECS[kind].label,
    ...deckArea(i),
    accepts: [],
    deck: kind,
  })),
  { id: 'hand', label: 'Actions', ...hand, accepts: ['lost-pages'] },
  { id: 'home', label: 'Home', ...home, accepts: ['lost-pages', 'encounter'] },
  {
    id: 'battlefield',
    label: 'Battlefield',
    ...battlefield,
    accepts: ['terrain', 'hitpoints', 'lost-pages'],
  },
];

// ---------- where piles lie: `Stack.at` ----------

/** The spot a fixed place lies on: the Damage Card's place is the Actions area's damage spot. */
export const PLACE_SPOTS: Partial<
  Record<Place | StorySlot | DeckKind, string>
> = {
  damage: 'damage',
};

/** The area each fixed place lies in. */
export function placeArea(
  place: Place | StorySlot | DeckKind,
): string | undefined {
  if (place === 'story' || place === 'story-revealed') return 'storybook';
  if (place === 'damage') return 'hand';
  if (ENCOUNTER_PLACES.some((p) => p.place === place)) return 'encounter';
  return AREAS.find((a) => a.deck === place)?.id;
}

// Top center, so titles/skills can go above it and items to its right (rulebook 4.1).
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
/**
 * Part of a Status Upgrade's or item's width showing right of the Character Card (or the card before it) on top of it:
 * the strip of status values printed upside down along the left edge of a Y-card or Encounter Card, the right way up
 * with the card turned (rulebook figure 18).
 */
const UPGRADES_SHOWS = 0.15;
/** Part of a Quest Card's height showing below the Character Card (or the card before it) on top of it. */
const QUESTS_SHOWS = 0.26;
/**
 * Part of a title card's height showing above the Character Card (or the card before it) on top of it: the bottom of
 * the card, printed upside down, so it reads the right way up with the card turned.
 */
const TITLES_SHOWS = 0.21;
/** Part of a skill card's height showing above the title (or skill) card on top of it: the skill's name banner. */
const SKILLS_SHOWS = 0.14;
/**
 * Part of a broken item's height showing above the Storage Card (or the item before it) on top of it: the item strip
 * printed upside down at the bottom of an Encounter Card, with its repair costs, the right way up with the card turned.
 */
const BROKEN_SHOWS = 0.16;
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
/**
 * Top-left corner of the Map grid's first place (column 0, row 0) in the area's own place: where the first of the four
 * Region Card places lay, right of its Market Prices strip, so the cards of older saves lie on the grid.
 */
const regionGrid = {
  x: map.x + AREA_PAD + marketStrip,
  y: map.y + AREA_HEADER,
};
const handSpot = { x: hand.x + AREA_PAD, y: hand.y + AREA_HEADER };
export const SPOTS: Spot[] = [
  // The Y-cards placed in the Encounter Bar (rulebook 5.2), landscape and face down, as in rulebook figure 29: their backs
  // show the location they belong to, with card number, location and chapter on their right strip. Each lies over the
  // left part of the one after it, so a new card, which goes first, lies on top of the others. Its free place stays
  // before them, partly under the first; Y-cards dropped anywhere in the area go into the row. Any number of them: the area grows with it.
  {
    id: 'bar',
    label: 'Encounter Bar',
    hint: 'Y-Cards, face down',
    area: 'bar',
    family: 'lost-pages',
    attracts: false,
    ...barSpot,
    shows: BAR_SHOWS,
    fan: { count: Infinity },
    fillsArea: true,
    landscape: true,
    turn: 'left',
    faceDown: true,
    addsFirst: true,
    takesPiles: true,
  },
  {
    id: 'character',
    label: 'Character Card',
    area: 'character',
    family: 'character',
    attracts: true,
    ...characterSpot,
  },
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
  // Above it, the titles and skills received (rulebook 4.1), upside down ("Attach this card above your Character Card"),
  // so the strip printed upside down at their bottom reads the right way up. First the titles, slid under its top edge,
  // each further one likewise under the one before; then the skills, the first slid under the last title (or the
  // Character Card), showing only their name banner. One placeholder above them both, split: Titles left, Skills right.
  // Any number of each: the area grows up with the column.
  {
    id: 'titles',
    label: 'Titles',
    hint: 'Y-Cards',
    area: 'character',
    family: 'lost-pages',
    attracts: false,
    x: characterSpot.x,
    y: characterSpot.y - Math.round(TITLES_SHOWS * CARD_H),
    under: 'character',
    shows: TITLES_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
  },
  {
    id: 'skills',
    label: 'Skills',
    hint: 'Y-Cards',
    area: 'character',
    family: 'lost-pages',
    attracts: false,
    x: characterSpot.x + 1,
    y: characterSpot.y - Math.round(SKILLS_SHOWS * CARD_H),
    under: 'titles',
    after: 'titles',
    split: true,
    shows: SKILLS_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
  },
  // Right of it, the Status Upgrades and Conditions (Y-cards) and equipped items (mostly Encounter Cards; rulebook 4.1,
  // 4.7.5, 7.3.8), face up and upside down: slid under its right side so only the strip of status values printed upside
  // down along their left edge shows (rulebook figure 18), each further one likewise under the one before. Any number of
  // them: the area grows right with the row.
  {
    id: 'upgrades',
    // No hint: the strip is too narrow for a second line.
    label: 'Status Upgrades & Items',
    area: 'character',
    family: 'lost-pages',
    also: ['encounter'],
    attracts: false,
    x: characterSpot.x + Math.round(UPGRADES_SHOWS * CARD_W),
    y: characterSpot.y,
    under: 'character',
    shows: UPGRADES_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
    faceUp: true,
  },
  // Below it, the Quest Cards (Y-cards) slid under its bottom edge so only their bottom quarter shows, each further one
  // likewise under the one before. Any number of them: the area grows with the column.
  {
    id: 'quests',
    label: 'Quest Cards',
    hint: 'Y-Cards',
    area: 'character',
    family: 'lost-pages',
    attracts: false,
    x: characterSpot.x,
    y: characterSpot.y + Math.round(QUESTS_SHOWS * CARD_H),
    under: 'character',
    shows: QUESTS_SHOWS,
    fan: { count: Infinity },
  },
  // Top center. The Storage Card is a Y-card; goods go left and below it, items and money right (rulebook 4.7.4).
  {
    id: 'storage',
    label: 'Storage Card',
    hint: 'any Y-Card',
    area: 'storage',
    family: 'lost-pages',
    attracts: false,
    ...storageSpot,
  },
  // Above it, the broken items (rulebook 4.7.4, 7.2.4), face up and upside down: slid under its top edge so only the
  // item strip printed upside down at their bottom shows, with the repair costs (rulebook figure 16), each further one
  // likewise under the one before. Mostly Encounter Cards; some items are Y-cards. Any number of them: the area grows up
  // with the column.
  {
    id: 'broken',
    label: 'Broken Items',
    hint: 'Encounter Cards, Y-Cards',
    area: 'storage',
    family: 'encounter',
    also: ['lost-pages'],
    attracts: false,
    x: storageSpot.x,
    y: storageSpot.y - Math.round(BROKEN_SHOWS * CARD_H),
    under: 'storage',
    shows: BROKEN_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
    faceUp: true,
  },
  // Right of it, the whole items stowed in the bag (rulebook 4.7.4, 7.2.4), mostly Encounter Cards, face up and upside
  // down like the Status Upgrades & Items beside the Character Card: slid under its right side so only the strip of
  // status values along their left edge shows (rulebook figure 16), each further one likewise under the one before.
  // Any number of them; the Money Cards lie beyond them, sharing their placeholder. A unit below the Money Cards' line.
  {
    id: 'items',
    label: 'Items',
    // A non-breaking hyphen: the half is narrow, and "Y-" alone on a line reads badly.
    hint: 'Encounter Cards, Y\u2011Cards',
    area: 'storage',
    family: 'encounter',
    also: ['lost-pages'],
    attracts: false,
    x: storageSpot.x + Math.round(UPGRADES_SHOWS * CARD_W),
    y: storageSpot.y + 1,
    under: 'storage',
    shows: UPGRADES_SHOWS,
    fan: { count: Infinity },
    upsideDown: true,
    faceUp: true,
  },
  // Beyond the items (under the Storage Card's right side while there are none), slid half under the last one, and each
  // further one half under the one before, so the amounts on their right halves add up to the sum shown (rulebook 4.3).
  // Each is its own pile, so it can be turned to its amount. One placeholder beyond both rows, split: Items above, Money
  // below.
  {
    id: 'money',
    label: 'Money Card',
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
  // Slid under the left side of the Storage Card so only their left third shows, and each further one likewise under
  // the one before (rulebook 4.7.4). Any number of them: the area grows with the row.
  {
    id: 'goods',
    label: 'Goods',
    hint: 'Encounter Cards',
    area: 'storage',
    family: 'encounter',
    attracts: false,
    x: goodsX,
    y: storageSpot.y,
    under: 'storage',
    shows: GOODS_LEFT_SHOWS,
    fan: { count: Infinity },
  },
  // The same below the Storage Card: only their bottom part shows, each further one under the one before.
  {
    id: 'goods-below',
    label: 'Goods',
    hint: 'Encounter Cards',
    area: 'storage',
    family: 'encounter',
    attracts: false,
    x: storageSpot.x,
    y: goodsBelowY,
    under: 'storage',
    shows: GOODS_BELOW_SHOWS,
    fan: { count: Infinity },
  },
  // Below the revealed storybook cards, lying over the bottom edge of the top one. A single card, turned face up when put
  // there: it takes the Storybook area's only Encounter Card.
  {
    id: 'story-encounter',
    label: 'Encounter Card',
    area: 'storybook',
    family: 'encounter',
    attracts: false,
    x: story.x + AREA_PAD,
    y: story.y + AREA_HEADER + Math.round((1 - STORY_COVERED) * CARD_H),
    over: 'story-revealed',
    fillsArea: true,
    fan: { count: 1 },
    putFaceUp: true,
  },
  // The Y-cards in the hand (Action Cards, rulebook 4.7.7), face up and upside down, so the strip printed upside down at
  // the bottom of an Action Card reads the right way up at the top. Each lies on the one before, a little lower, leaving the top
  // of the one before showing (`HAND_SHOWS`). Y-cards dropped anywhere in the area but on the discard pile go into
  // it. Any number of them: the area grows down with the column.
  {
    id: 'hand',
    label: 'Action Cards',
    hint: 'Y-Cards',
    area: 'hand',
    family: 'lost-pages',
    attracts: false,
    ...handSpot,
    shows: HAND_SHOWS,
    fan: { count: Infinity },
    overlaps: 'bottom',
    fillsArea: true,
    upsideDown: true,
    faceUp: true,
    takesPiles: true,
  },
  // Right of the hand: the cards played from it (rulebook 8.2.1.1.1), upside down too, in one pile.
  {
    id: 'discard',
    label: 'Discard',
    hint: 'Y-Cards',
    area: 'hand',
    family: 'lost-pages',
    attracts: false,
    x: handSpot.x + CARD_W + PLACE_GAP,
    y: handSpot.y,
    upsideDown: true,
  },
  // Below the discard pile: the Damage Card, upright and there for good (a fixed place, `pinnedOnTop()` in actions.ts),
  // with the Action Cards discarded as damage under it (rulebook 4.7.9), so they aren't mixed up with the played ones.
  // Cards dropped on it go under it.
  {
    id: 'damage',
    label: 'Damage Card',
    hint: 'Y010',
    area: 'hand',
    family: 'lost-pages',
    attracts: false,
    x: handSpot.x + CARD_W + PLACE_GAP,
    y: handSpot.y + CARD_H + PLACE_GAP,
    slidesUnder: true,
  },
  // In the middle of the Home area. The House Card is a Y-card; its extensions lie under it (rulebook 10).
  {
    id: 'house',
    label: 'House Card',
    hint: 'Y730',
    area: 'home',
    family: 'lost-pages',
    attracts: false,
    ...houseSpot,
  },
  // Left and right of the House Card, up to two extensions each: the first slid half under it, the second half under
  // the first (`HOUSE_SIDE_SHOWS`).
  ...(['left', 'right'] as const).map((side): Spot => ({
    id: `house-${side}`,
    label: 'House Extension',
    area: 'home',
    family: 'lost-pages',
    attracts: false,
    x: houseSpot.x + (side === 'left' ? -1 : 1) * houseSideStep,
    y: houseSpot.y,
    under: 'house',
    shows: HOUSE_SIDE_SHOWS,
    fan: { count: HOUSE_SIDE_CARDS },
  })),
  // Above and below it, one extension each, mostly under it (`HOUSE_ABOVE_SHOWS`, `HOUSE_BELOW_SHOWS`).
  {
    id: 'house-above',
    label: 'House Extension',
    area: 'home',
    family: 'lost-pages',
    attracts: false,
    x: houseSpot.x,
    y: houseSpot.y - Math.round(HOUSE_ABOVE_SHOWS * CARD_H),
    under: 'house',
    shows: HOUSE_ABOVE_SHOWS,
    fan: { count: 1 },
  },
  {
    id: 'house-below',
    label: 'House Extension',
    area: 'home',
    family: 'lost-pages',
    attracts: false,
    x: houseSpot.x,
    y: houseSpot.y + Math.round(HOUSE_BELOW_SHOWS * CARD_H),
    under: 'house',
    shows: HOUSE_BELOW_SHOWS,
    fan: { count: 1 },
  },
  // Left of the house extensions, slid under the outer one as the Goods in the Storage area are under the Storage Card,
  // each further one under the one before.
  {
    id: 'home-goods',
    label: 'Goods',
    hint: 'Encounter Cards',
    area: 'home',
    family: 'encounter',
    attracts: false,
    x:
      houseSpot.x -
      HOUSE_SIDE_CARDS * houseSideStep -
      Math.round(GOODS_LEFT_SHOWS * CARD_W),
    y: houseSpot.y,
    under: 'house-left',
    shows: GOODS_LEFT_SHOWS,
    fan: { count: HOME_GOODS_CARDS },
  },
  // The same right of them, showing only a narrow strip of each card.
  {
    id: 'home-equipment',
    label: 'Equipment',
    hint: 'Encounter Cards',
    area: 'home',
    family: 'encounter',
    attracts: false,
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
  { place: 'time-passes', label: 'Time Passes' },
  { place: 'next-chapter', label: 'Next Chapter' },
  { place: 'used', label: 'Used Cards', hint: 'Encounter Cards' },
];

/** Where an Encounter Deck place lies on this table: its pile, or its placeholder. */
export function encounterPlace(t: Table, place: EncounterPlace): Point {
  const i = ENCOUNTER_PLACES.findIndex((p) => p.place === place);
  const d = shiftOf(t, 'encounter');
  return {
    x: encounter.x + AREA_PAD + i * (CARD_W + PLACE_GAP) + d.x,
    y: encounter.y + AREA_HEADER + d.y,
  };
}

/** Place of a table deck in its area (`TABLE_DECKS`), as it lies on this table: where its pile lies, or its placeholder. */
export function deckPlace(t: Table, kind: DeckKind): Point {
  const area = AREAS.find((a) => a.deck === kind)!;
  const d = shiftOf(t, area.id);
  return { x: area.x + AREA_PAD + d.x, y: area.y + AREA_HEADER + d.y };
}

/**
 * The grids of landscape card places, edge to edge, growing from a first place in every direction: the Map's Region
 * Cards (rulebook 7.1.1: a region entered goes beside the one left, the way its compass points) and the battlefield's
 * Terrain Cards (rulebook 8.1.2). Each is named after its area.
 */
export type GridId = 'map' | 'battlefield';

export const GRIDS: GridId[] = ['map', 'battlefield'];

/** The cards each grid takes. */
export const GRID_FAMILY: Record<GridId, Family> = {
  map: 'region',
  battlefield: 'terrain',
};

/** Top-left corner of a grid's first place (column 0, row 0), as its area lies on this table. */
export function gridOrigin(t: Table, g: GridId): Point {
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

/** Columns of the Map: the first Region Card's, and one right of it. */
const MAP_COLS = 2;

/**
 * Whether a grid grows beyond the `side` of its card in column `col`: the battlefield every way; the Map only up, any
 * number of rows, and right of its first column (`MAP_COLS`).
 */
export function grows(g: GridId, col: number, side: Side): boolean {
  if (g === 'battlefield') return true;
  return side === 'top' || (side === 'right' && col < MAP_COLS - 1);
}

/** Where a Terrain Card lies on the battlefield grid's place (`col`, `row`). */
export function terrainPlace(t: Table, col: number, row: number): Point {
  return cellPlace(t, 'battlefield', col, row);
}

/** Why a card on a grid can't be turned over: "Region Cards on the Map lie face up". */
export function gridFaceUp(g: GridId): string {
  return `${FAMILY_NAMES[GRID_FAMILY[g]]} on the ${gridLabel(g)} lie face up`;
}

/** Whether Terrain Cards lie on the battlefield. */
export function battlefieldInUse(t: Table): boolean {
  return gridPiles(t, 'battlefield').size > 0;
}

/**
 * The side of a Region Card in the Map's column `col` where its goods strip is printed, with its Market Prices card
 * beside it: the regions lie two by two side by side, odd numbers left and even right (as their compasses show), each
 * with its goods strip on the outer edge.
 */
function marketSide(col: number): 'left' | 'right' {
  return col % 2 ? 'right' : 'left';
}

/** Where the battlefield's grid lies (`gridBox()`), and right of it the place for the Enemy Cards. */
export function battlefieldBoxes(t: Table): { grid: Rect; enemies: Rect } {
  const grid = gridBox(t, 'battlefield');
  const enemies = {
    x: rightOf(grid) + ENEMY_GAP,
    y: grid.y,
    w: ENEMY_BLOCK.w,
    h: Math.max(grid.h, ENEMY_BLOCK.h),
  };
  return { grid, enemies };
}

const marketCache = new WeakMap<Table, Spot[]>();

/**
 * The Market Prices places of the Region Cards on the Map's grid: the Encounter Card giving the region's market prices
 * (rulebook 7.1.2.5), beside the edge where the card's goods strip is printed (`marketSide()`), slid under it so only
 * its price strip shows (`MARKET_SHOWS`). Left of a Region Card it is turned a quarter right, so its prices lie beside
 * the goods on the card's left edge; right of one it is turned the other way.
 */
export function mapSpots(t: Table): Spot[] {
  let spots = marketCache.get(t);
  if (spots) return spots;
  spots = [...gridPiles(t, 'map')].map(([key, id]): Spot => {
    const [col, row] = key.split(',').map(Number);
    const side = marketSide(col);
    const p = cellPlace(t, 'map', col, row);
    return {
      id: `market-${key}`,
      label: 'Market Prices',
      hint: 'Encounter Card',
      area: 'map',
      family: 'encounter',
      attracts: false,
      // Both lie landscape, so the shown part of the card is as wide as its place is away from the Region Card's.
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

/**
 * Areas drawn only as large as what lies in them needs: their places (a fanned row as far as its next place, a grid's
 * cards with the strips of its free places) and the piles lying on or overlapping them. Each grows around the cards added to it, pushing the areas right of it and below
 * it away (`settleLayout()`); the Encounter Bar only grows right, until the Storybook area beside it moves down.
 */
export const GROWING = [
  'map',
  'bar',
  'character',
  'storage',
  'hand',
  'home',
  'battlefield',
];

/**
 * The places of the battlefield's Enemy Cards, right of its Terrain Cards (`battlefieldBoxes()`), two by two: each
 * with its Hit Point Card's place over the card's lower part, its chain pointing at the unspent reaction (rulebook
 * figure 80), and two more places for that card: on the spent side (rulebook 8.2.1.2.2, figure 91) and over the
 * defeated enemy (8.2.1.3), a unit lower, so it isn't taken for the Enemy Card's pile.
 */
export function battlefieldSpots(t: Table): Spot[] {
  const { enemies } = battlefieldBoxes(t);
  return Array.from({ length: ENEMY_COLS * ENEMY_ROWS }, (_, i): Spot[] => {
    const n = i + 1;
    // Rounded like the places of a fanned spot (the battlefield's top, like the Home area's, lies half a unit off the
    // grid).
    const x = Math.round(
      enemies.x + HP_SHIFT + (i % ENEMY_COLS) * (ENEMY_SLOT.w + PLACE_GAP),
    );
    const y = Math.round(
      enemies.y + Math.floor(i / ENEMY_COLS) * (ENEMY_SLOT.h + PLACE_GAP),
    );
    const hp = (id: string, dx: number, dy: number, alt: boolean): Spot => ({
      id,
      label: 'Hit Point Card',
      area: 'battlefield',
      family: 'hitpoints',
      attracts: false,
      x: x + dx,
      y: y + dy,
      above: `enemy-${n}`,
      one: true,
      ...(alt ? { alt: `hp-${n}` } : { needs: `enemy-${n}` }),
    });
    return [
      {
        id: `enemy-${n}`,
        label: 'Enemy Card',
        hint: 'Y-Card',
        area: 'battlefield',
        family: 'lost-pages',
        attracts: false,
        x,
        y,
        one: true,
        faceUp: true,
      },
      hp(`hp-${n}`, -HP_SHIFT, HP_DROP, false),
      hp(`hp-${n}-spent`, HP_SHIFT, HP_DROP, true),
      hp(`hp-${n}-defeated`, 0, 1, true),
    ];
  }).flat();
}

/** Where `packedPlaces()` puts a battlefield `w` wide: right of the Home area, below the areas it reaches under. */
function battlefieldPlace(laid: Map<string, Rect>, w: number): Point {
  const home = laid.get('home')!;
  const x = rightOf(home) + GAP;
  const below = [...laid].filter(([id]) => !ABOVE_PLAY.includes(id));
  return {
    x,
    y: bottomUnder(
      below.map(([, r]) => r),
      x,
      w,
      home.y,
    ),
  };
}

/** The areas of the two top rows, above the character's areas: the battlefield and the Home area lie below them. */
const ABOVE_PLAY = ['bar', 'map', 'encounter', 'storybook'];

/** The decks' block of areas right of the Actions area, two by two: each row left to right. */
const DECK_BLOCK: DeckKind[][] = [
  ['banned', 'enemy'],
  ['quest', 'training'],
];

/**
 * The areas used in every round (rulebook 7.1): the two top rows, the character's row and the decks drawn from or
 * banished to most, beside it. **Fit** shows these, or in a combat, `COMBAT_AREAS`.
 */
export const PLAY_AREAS = [
  ...ABOVE_PLAY,
  'storage',
  'character',
  'hand',
  ...DECK_BLOCK[0],
];

/**
 * The areas used in a combat (rulebook 8): the character, their hand and Damage Card, the Enemy Deck and the
 * battlefield. **Fit** shows these while Terrain Cards lie on the battlefield.
 */
export const COMBAT_AREAS = ['character', 'hand', 'enemy', 'battlefield'];

/**
 * Where the areas lie packed together, each `GAP` from the one before however they grew, in rows:
 * - the Encounter Bar on its own, growing right;
 * - the Map, the Encounter Deck and the Storybook, its bottom in line with theirs (it is taller), beside the bar while
 *   the bar leaves room for it, else down in line with the Map;
 * - Storage, Character and Actions, the table decks' areas two by two right of them (Banned Cards and the Enemy Deck,
 *   below them the Quest and Training Deck);
 * - below them the Home area at the left edge and the battlefield right of it, each below every area it reaches under.
 */
export function packedPlaces(
  t: Table,
  now: Map<string, Area>,
): Map<string, Rect> {
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
  const bar = put('bar', { x: 0, y: 0 });
  const top = bottomOf(bar) + GAP;
  const map = put('map', { x: 0, y: top });
  const encounter = put('encounter', { x: rightOf(map) + GAP, y: top });
  const x = rightOf(encounter) + GAP;
  const story = now.get('storybook')!;
  const raised = Math.max(bottomOf(map), bottomOf(encounter)) - story.h;
  const storybook = put('storybook', {
    x,
    y: crowd(bar, { ...story, x, y: raised }) ? top : raised,
  });
  const row =
    Math.max(bottomOf(map), bottomOf(encounter), bottomOf(storybook)) + GAP;
  const storage = put('storage', { x: 0, y: row });
  const character = put('character', { x: rightOf(storage) + GAP, y: row });
  const hand = put('hand', { x: rightOf(character) + GAP, y: row });
  DECK_BLOCK.forEach((kinds, i) =>
    kinds.forEach((kind, j) => {
      const left = j ? laid.get(kinds[j - 1])! : hand;
      const above = i ? laid.get(DECK_BLOCK[i - 1][j])! : null;
      put(
        kind,
        above
          ? { x: above.x, y: bottomOf(above) + GAP }
          : { x: rightOf(left) + GAP, y: row },
      );
    }),
  );
  const home = now.get('home')!;
  put('home', { x: 0, y: bottomUnder(laid.values(), 0, home.w, row) });
  put('battlefield', battlefieldPlace(laid, now.get('battlefield')!.w));
  return laid;
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
};

export const FAMILY_NAMES: Record<Family, string> = {
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
};

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
};

/** "Regions · Encounter Cards · Y-Cards", or what a table deck holds. */
export function acceptsText(area: Area): string {
  if (area.deck) return DECK_SPECS[area.deck].holdsText ?? '';
  return area.accepts.map((f) => SHORT_NAMES[f]).join(' · ');
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
    return `${FAMILY_NAMES[f]} belong in ${home === 'battlefield' ? 'the Battlefield' : `the ${AREAS.find((a) => a.id === home)?.label} area`}`;
  }
  return null;
}

/** The name of a grid's area: "Map", "Battlefield". */
export function gridLabel(g: GridId): string {
  return AREAS.find((a) => a.id === g)!.label;
}

/** A card of each family, as named on the table: "Region Card", "Terrain Card". */
export const CARD_NAMES: Partial<Record<Family, string>> = {
  region: 'Region Card',
  terrain: 'Terrain Card',
};

/** Cards dropped in the Encounter Deck area go onto the place nearest to where they are dropped, if they are Encounter Cards. */
export function ontoPlace(
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
    at: looseAt(t, nearest.x, nearest.y),
    x: nearest.x,
    y: nearest.y,
    onto: placeStack(t, nearest.place)?.id ?? null,
    area,
    spot: null,
    refused: refusal(area, cardIds, defs),
  };
}

/** The area buttons along the left edge of the screen, in the order the areas lie (`packedPlaces()`). */
export const RAIL_AREAS = [
  'bar',
  'map',
  'encounter',
  'storybook',
  'storage',
  'character',
  'hand',
  'home',
  'battlefield',
  'quest',
  'enemy',
  'training',
  'banned',
];
