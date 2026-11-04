// A spot's layering (`Spot.layer`): which card its cards lie under or over, the side of them that card covers, and the
// drawing order that follows from it (its `layer` hooks, run by `drawOrder()`).

import { placeStack, type Spot, stacksOnSpot } from './areas';
import { fanRow, growth } from './arrangement';
import type { PlaceBehaviour } from './behaviours';
import { game } from './game';
import { OPPOSITE, type Side } from './geometry';
import type { FixedPlace, Table } from './types';

/** Where a spot's cards lie among the others: under one, or over one. One of these at most. */
export interface Layer {
  /** The spot beside (or above/below) this one whose card lies on top of it, covering the side next to it. */
  under?: string;
  /**
   * The pile lying on top of this spot's card, covering its `side` (a Market Prices card under its Region Card, which
   * lies on the Map's grid, not on a spot).
   */
  underPile?: { id: string; side: Side };
  /** The spot whose card this spot's card lies on, drawn above it (a Hit Point Card on its Enemy Card). */
  above?: string;
  /** The fixed place whose top card this spot's card lies on (the Storybook's Encounter Card, on the revealed cards). */
  over?: FixedPlace;
}

/** Which side of a spot's card is covered by the card of the spot it lies under. */
export function coveredSide(spot: Spot): Side | null {
  if (spot.layer?.underPile) return spot.layer.underPile.side;
  // Where they lie in the game's `spots`: moved with their area, they lie the same way side by side.
  // A row `after` another lies there as if that row had no cards: beside that row's covering card (`spotsOf()`).
  const after = spot.fan?.after;
  const before = after && game().spots.find((s) => s.id === after);
  const under = before ? before.layer?.under : spot.layer?.under;
  const cover = game().spots.find((s) => s.id === under);
  if (!cover) return null;
  spot = game().spots.find((s) => s.id === spot.id) ?? spot;
  // Side by side, or one above the other (a row `after` another lies a unit beside it).
  if (Math.abs(cover.x - spot.x) > Math.abs(cover.y - spot.y))
    return cover.x > spot.x ? 'right' : 'left';
  return cover.y > spot.y ? 'bottom' : 'top';
}

/**
 * Which side of a spot's free place lies under a card, so only the rest of it shows: under the card covering the spot,
 * or, in a row that has cards, under its last card.
 */
export function freeCovered(t: Table, spot: Spot): Side | null {
  const overlaps = spot.fan?.overlaps;
  if (overlaps) return fanRow(t, spot).length ? OPPOSITE[overlaps] : null;
  // A row's place after its last card lies under that card, on the side the row grows from (`growth()`).
  if (spot.fan && fanRow(t, spot).length) return OPPOSITE[growth(spot)];
  return coveredSide(spot);
}

/**
 * Piles on a spot lie right under the card (or fanned row) of the spot covering them, later places of a fanned row
 * under earlier ones (unless each card lies on the one before, the hand).
 */
const beneath: PlaceBehaviour = {
  layer(t, spot, z, spots) {
    const layer = spot.layer;
    if (!layer?.under && !layer?.underPile && !spot.fan) return z;
    const row = stacksOnSpot(t, spot);
    const below = spot.fan?.overlaps ? row : [...row].reverse();
    if (!below.length) return z;
    // Under the lowest card of the covering spot (the last of a fanned row, e.g. the outer house extension); while that
    // has none, of the spot covering it (the Skills under the Character Card while there are no Titles).
    let cover = spots.find((s) => s.id === layer?.under);
    let covering = layer?.underPile
      ? [layer.underPile.id]
      : cover
        ? stacksOnSpot(t, cover)
        : [];
    while (cover && !covering.length) {
      const next: string | undefined = cover.layer?.under;
      cover = spots.find((s) => s.id === next);
      covering = cover ? stacksOnSpot(t, cover) : [];
    }
    const first = Math.min(...below.map((id) => z.indexOf(id)));
    const rest = z.filter((id) => !below.includes(id));
    const above = Math.min(...covering.map((id) => rest.indexOf(id)));
    rest.splice(covering.length ? above : first, 0, ...below);
    return rest;
  },
};

/** A card lying on another's card (a Hit Point Card on its Enemy Card) lies right above it. */
const above: PlaceBehaviour = {
  layer(t, spot, z, spots) {
    if (!spot.layer?.above) return z;
    const on = stacksOnSpot(t, spot);
    const cover = spots.find((s) => s.id === spot.layer?.above);
    const below = cover ? stacksOnSpot(t, cover) : [];
    if (!on.length || !below.length) return z;
    const rest = z.filter((id) => !on.includes(id));
    rest.splice(Math.max(...below.map((id) => rest.indexOf(id))) + 1, 0, ...on);
    return rest;
  },
};

/** A card lying over a fixed place's pile (the Storybook's Encounter Card) lies right above it. */
const over: PlaceBehaviour = {
  layer(t, spot, z) {
    if (!spot.layer?.over) return z;
    const on = stacksOnSpot(t, spot);
    const pile = placeStack(t, spot.layer.over)?.id;
    if (!on.length || !pile) return z;
    const rest = z.filter((id) => !on.includes(id));
    rest.splice(rest.indexOf(pile) + 1, 0, ...on);
    return rest;
  },
};

/** The layering's behaviours, in the order they apply: under the covering cards first, then above or over others. */
export const LAYERING: PlaceBehaviour[] = [beneath, above, over];
