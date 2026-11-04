// A spot's arrangement: one pile (`Spot.pile`, the default) or a fanned row of single cards (`Spot.fan`). Where its
// cards lie and its free places, where cards dropped on it go, the row numbered again and piles dropped on it spread out
// after any change (its `settle` hook), and why it takes no more (its `refuse` hook).

import {
  pileOn,
  sameAt,
  type Spot,
  spotOf,
  spotsOf,
  stacksOnSpot,
} from './areas';
import { addStack, setStack } from './actions';
import type { PlaceBehaviour } from './behaviours';
import { compareCards } from './cards';
import { cardDef, game } from './game';
import { CARD_H, CARD_W, type Point, type Side, OPPOSITE } from './geometry';
import { coveredSide } from './layering';
import { lyingSize } from './orientation';
import type { Refusal } from './refusals';
import type { Table } from './types';

/** One pile on the spot's place (cards dropped on it go on top of it, or under it). */
export interface Pile {
  /** Cards dropped on its pile go under it, not on top (the Damage Card, with the Action Cards lost as damage under it). */
  slidesUnder?: boolean;
  /** Holds one card (with its `alt` places, between them): another dropped there is refused. */
  one?: boolean;
  /**
   * Another place for that spot's card (a Hit Point Card on the spent side, or over its defeated enemy): it shows no
   * placeholder, and the spot and its other places hold one card between them (`one`).
   */
  alt?: string;
  /** Its placeholder shows only while that spot holds a card (a Hit Point Card's, once its Enemy Card is there). */
  needs?: string;
}

/**
 * One card per place, in a row growing away from the card covering it (`Layer.under`), each slid under the one before
 * as far as the first lies under that card.
 */
export interface Fan {
  /** At most this many cards (`Infinity`: any number, the area growing with the row; 1: a single card). */
  count: number;
  /**
   * Part of the card's width (height, for a spot above or below it), as it lies, still showing beside the card on top
   * of it (default: half); the distance between the row's places.
   */
  shows?: number;
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
  /**
   * The row has no card covering it and runs toward this side, each card lying on top of the one before, of which the
   * `shows` part is left showing (the hand in the Actions area: down, the top of each card showing above the next).
   */
  overlaps?: Side;
  /**
   * A pile dropped on its row (of any number of cards, `count: Infinity`) is spread out on it, one card per place, its
   * top card still lying on top of the others (`settle`): the hand, taking back the cards under the Damage Card or the
   * discard pile, its bottom card first; the Encounter Bar, its top card first (then put in card order, `sorted`).
   */
  takesPiles?: boolean;
  /**
   * The row keeps its cards in the order of their printed numbers (`CardDef.code`, `compareCards()`), lowest first,
   * wherever they are dropped in it (`settle`): the Encounter Bar, whose cards are resolved in that order.
   */
  sorted?: boolean;
}

/** Part of a spot's card showing beside the card on top of it (`Fan.shows`, default half). */
export function shows(spot: Spot): number {
  return spot.fan?.shows ?? 0.5;
}

/** Most cards a fanned spot holds. */
function fanMax(spot: Spot): number {
  return spot.fan?.count ?? 1;
}

/** Which way a fanned spot's row runs: away from the card covering it, the way its cards lie on each other, else right. */
export function growth(spot: Spot): Side {
  const side = coveredSide(spot);
  return spot.fan?.overlaps ?? (side ? OPPOSITE[side] : 'right');
}

/** Whether a spot's row runs down or up. */
export function vertical(spot: Spot): boolean {
  const side = growth(spot);
  return side === 'top' || side === 'bottom';
}

/** Signed distance between the places of a fanned spot (negative: the row grows to the left or up). */
function fanStep(spot: Spot): number {
  const side = growth(spot);
  const dir = side === 'left' || side === 'top' ? -1 : 1;
  const size = lyingSize(spot);
  return dir * shows(spot) * (vertical(spot) ? size.h : size.w);
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

/** Where a pile lies on a spot's place `index` (`rowPoint()`): a spot of a single place has just the one. */
export function spotPoint(spot: Spot, index: number): Point {
  return spot.fan ? rowPoint(spot, index) : { x: spot.x, y: spot.y };
}

/**
 * Where a spot's next card goes, shown by its placeholder: its place, or the place after the last card of a fanned row
 * (in a `sorted` row, the card then goes to its place in card order).
 */
export function freePlace(t: Table, spot: Spot): Point {
  const n = spot.fan ? fanRow(t, spot).length : 0;
  return spotPlaces(spot, n + 1)[n];
}

/** Least part of a card's height a split placeholder shows: room for the two lines of text on each half. */
const SPLIT_SHOWS = 0.3;

/**
 * Where a split placeholder lies (`Fan.split`): right beyond the last card of both rows, across the row as wide as a
 * card, along it as far as the larger strip of the two rows shows, at least `SPLIT_SHOWS`.
 */
export function splitBox(
  t: Table,
  spot: Spot,
): { x: number; y: number; w: number; h: number } {
  const partner = spotsOf(t).find((s) => s.id === spot.fan?.after);
  const { w, h } = lyingSize(spot);
  const free = freePlace(t, spot);
  const own = shows(spot);
  const size = Math.max(own, partner ? shows(partner) : 0.5, SPLIT_SHOWS);
  // In line with the row on the exact line (the other lies a unit beside it).
  const x = Math.min(spot.x, partner?.x ?? spot.x);
  const y = Math.min(spot.y, partner?.y ?? spot.y);
  // Beyond the edge of the last card, which covers the part of the free place that doesn't show.
  switch (growth(spot)) {
    case 'top': {
      const edge = free.y + Math.round(own * h);
      return { x, y: edge - Math.round(size * h), w, h: Math.round(size * h) };
    }
    case 'bottom':
      return {
        x,
        y: free.y + Math.round((1 - own) * h),
        w,
        h: Math.round(size * h),
      };
    case 'left': {
      const edge = free.x + Math.round(own * w);
      return { x: edge - Math.round(size * w), y, w: Math.round(size * w), h };
    }
    case 'right':
      return {
        x: free.x + Math.round((1 - own) * w),
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
  const partner = spotsOf(t).find((s) => s.id === spot.fan?.after);
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
export function sharesPlaceholder(t: Table, spot: Spot): boolean {
  return spotsOf(t).some((s) => s.fan?.split && s.fan.after === spot.id);
}

/** Whether a fanned spot's row has room for one more card, so its next place can be shown. */
export function fanHasPlace(t: Table, spot: Spot): boolean {
  return fanRow(t, spot).length < fanMax(spot);
}

/** Piles lying in a fanned spot's row (`Stack.at`), from its first place on. */
export function fanRow(t: Table, spot: Spot): readonly string[] {
  return spot.fan ? stacksOnSpot(t, spot) : [];
}

/**
 * The places a spot can take a card dropped near it at: its place, or a fanned row's: all of them, an unlimited one as
 * far as one place past its last card (unless it takes new cards through a split placeholder).
 */
export function nearPlaces(t: Table, spot: Spot): Point[] {
  const n =
    fanMax(spot) === Infinity
      ? fanRow(t, spot).length + (sharesPlaceholder(t, spot) ? 0 : 1)
      : fanMax(spot);
  return spotPlaces(spot, n);
}

/**
 * Where cards going to a spot land (top-left dropped at x, y), or null when a
 * fanned spot is full. A plain spot: onto the pile lying there. A fanned spot:
 * at the place the card is dropped on, or after the last card when dropped
 * elsewhere (a `sorted` row then puts it in card order): its `index` in the row, half way between two piles' to go between them (`settleSpots()` then numbers the row again), and
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

/**
 * The places an area is framed around for a spot: its place, or a fanned row from its first place to the next card's
 * while it has room for one, else to its last card.
 */
export function framedPlaces(t: Table, spot: Spot): Point[] {
  if (!spot.fan) return [spot];
  const n = fanRow(t, spot).length;
  const last = spotPlaces(spot, n)[n - 1];
  const places = [spot, fanHasPlace(t, spot) ? freePlace(t, spot) : last];
  if (!spot.fan.split) return places;
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

/** The row pile `id` lies in, if it is one of two rows sharing a split placeholder (the Titles, the Skills). */
export function pairedRow(t: Table, id: string): Spot | undefined {
  return spotsOf(t).find(
    (s) =>
      (s.fan?.split || sharesPlaceholder(t, s)) && fanRow(t, s).includes(id),
  );
}

/** Whether two rows share a split placeholder, one lying after the other. */
export function paired(a: Spot, b: Spot): boolean {
  return a.fan?.after === b.id || b.fan?.after === a.id;
}

/** The point of a row nearest to `p`: on its line, between its first and last places. */
export function withinRow(t: Table, spot: Spot, p: Point): Point {
  const n = Math.max(1, fanRow(t, spot).length);
  const last = spotPlaces(spot, n)[n - 1];
  const clamp = (v: number, a: number, b: number) =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));
  return vertical(spot)
    ? { x: spot.x, y: clamp(p.y, spot.y, last.y) }
    : { x: clamp(p.x, spot.x, last.x), y: spot.y };
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
  const main = spot.pile?.alt ?? spot.id;
  return spotsOf(t).some(
    (s) =>
      (s.pile?.alt ?? s.id) === main &&
      stacksOnSpot(t, s).some((id) => id !== moving),
  );
}

/** Whether the spot shows a placeholder of its own on this table: not another place for a card, nor one waiting for another spot's card. */
export function showsPlace(t: Table, spot: Spot, spots: Spot[]): boolean {
  if (spot.fan && !fanHasPlace(t, spot)) return false;
  // A place holding one card shows none once that card is there (a Hit Point Card on any of its places); another place
  // for a spot's card shows none of its own (the spent side, over the defeated enemy); a Hit Point Card's place shows
  // only once its Enemy Card is there.
  const pile = spot.pile;
  if (pile?.alt || (pile?.one && holdsOne(t, spot))) return false;
  const needed = pile?.needs && spots.find((s) => s.id === pile.needs);
  return !needed || stacksOnSpot(t, needed).length > 0;
}

/** Whether pile `id` lies on a spot taking the cards dropped on it underneath (the Damage Card's). */
export function slidesUnder(t: Table, id: string): boolean {
  return !!spotOf(t, id)?.pile?.slidesUnder;
}

/** Why the spot takes no more of these cards: a full row, one card at a time on a row, a place for one card taken. */
function refusal(
  t: Table,
  spot: Spot,
  cardIds: string[],
  moving: string | null,
): Refusal | null {
  if (!spot.fan)
    return spot.pile?.one && holdsOne(t, spot, moving) ? full(spot) : null;
  // A fanned spot takes one card per place, not a pile (unless it spreads a pile out on its row, as the hand does).
  if (!spot.fan.takesPiles && cardIds.length > 1)
    return { code: 'spot-one-at-a-time', spot };
  const others = fanRow(t, spot).filter((id) => id !== moving);
  return others.length >= fanMax(spot) ? full(spot) : null;
}

function full(spot: Spot): Refusal {
  const family = spot.accepts.family;
  // Several places for the family: they are all taken.
  const max = game()
    .spots.filter((s) => s.area === spot.area && s.accepts.family === family)
    .reduce((n, s) => n + fanMax(s), 0);
  // A place cards don't find on their own: that one is taken.
  const attracts = !!spot.accepts.attracts;
  if (!attracts && fanMax(spot) > 1 && fanMax(spot) < Infinity)
    return { code: 'spot-holds-at-most', spot, max: fanMax(spot) };
  if (max === 1 || !attracts) return { code: 'spot-taken', spot };
  const area = game().areas.find((a) => a.id === spot.area)!;
  return { code: 'area-holds-at-most', area, family, max };
}

/** The card of the card set (`cardDef()`) on top of pile `id`. */
function topDef(t: Table, id: string) {
  const top = t.stacks[id].cards.at(-1);
  return top && cardDef(top.id);
}

const arrangement: PlaceBehaviour = {
  settle(t, spot) {
    if (!spot.fan) return t;
    let next = t;
    // A pile dropped on the hand or the Encounter Bar is spread out, one card per place, its top card still on top: its
    // other cards just after its first one, before the next pile, the row numbered again below. In the hand each card
    // lies on the one before, so its bottom card comes first; in the bar on the one after, its top card.
    if (spot.fan.takesPiles)
      for (const id of fanRow(next, spot)) {
        const s = next.stacks[id];
        if (s.cards.length < 2) continue;
        const index = s.at && 'spot' in s.at ? s.at.index : 0;
        const cards = spot.fan.overlaps ? s.cards : [...s.cards].reverse();
        next = setStack(next, { ...s, cards: cards.slice(0, 1) });
        cards.slice(1).forEach((card, i) => {
          const d = ((i + 1) / s.cards.length) * 0.4;
          next = addStack(next, { spot: spot.id, index: index + d }, [card], {
            rot: s.rot,
          })[0];
        });
      }
    // A sorted row in card order, by each pile's top card (stable: cards of the same number keep their order).
    const row = fanRow(next, spot);
    const inOrder = spot.fan.sorted
      ? [...row].sort((a, b) => compareCards(topDef(next, a), topDef(next, b)))
      : row;
    // The gaps closed, the piles numbered from the first place in row order.
    inOrder.forEach((id, index) => {
      const s = next.stacks[id];
      const at = { spot: spot.id, index };
      if (!sameAt(s.at, at)) next = setStack(next, { ...s, at });
    });
    return next;
  },
  refuse: refusal,
};

export const ARRANGEMENT: PlaceBehaviour[] = [arrangement];
