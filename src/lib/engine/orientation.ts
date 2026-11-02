// A spot's orientation (`Spot.orientation`): its cards turned a quarter, landscape, or upside down, kept so after any
// change (its `settle` hook) and never rotated there.

import { type Spot, spotOf, stacksOnSpot } from './areas';
import { setStack } from './actions';
import type { PlaceBehaviour } from './behaviours';
import { cardBox, type Turn } from './geometry';
import type { Table } from './types';

/** How a spot's cards lie, as they must lie there: they can't be rotated there. One of these at most. */
export interface Orientation {
  /**
   * A portrait card lies here landscape, turned a quarter to this side (the Encounter Cards giving a region's market
   * prices, the Y-cards in the Encounter Bar).
   */
  turn?: Turn;
  /** Its cards lie turned 180° (the Actions area's). */
  upsideDown?: boolean;
}

/** Whether a spot's card lies landscape across the place (turned a quarter, see `cardBox()`). */
export function landscapeSpot(spot: Spot): boolean {
  return !!spot.orientation?.turn;
}

/** Size of a spot's card as it lies there. */
export function lyingSize(spot: Spot): { w: number; h: number } {
  const { width, height } = cardBox(0, 0, landscapeSpot(spot));
  return { w: width, h: height };
}

/** The spot turning the card lying on it (Market Prices) that pile `id` lies on, if any. */
export function turnedSpot(t: Table, id: string): Spot | undefined {
  const s = spotOf(t, id);
  return s?.orientation?.turn ? s : undefined;
}

/** The spot laying the cards on it upside down (the Actions area's) that pile `id` lies on, if any. */
export function upsideDownSpot(t: Table, id: string): Spot | undefined {
  const s = spotOf(t, id);
  return s?.orientation?.upsideDown ? s : undefined;
}

/** Cards on a turned spot lie unrotated (the turn is drawn, `turnedClass()`), those on an upside-down one turned 180°. */
const orientation: PlaceBehaviour = {
  settle(t, spot) {
    const o = spot.orientation;
    const rot = o?.turn ? 0 : o?.upsideDown ? 180 : undefined;
    if (rot === undefined) return t;
    let next = t;
    for (const id of stacksOnSpot(t, spot)) {
      const s = next.stacks[id];
      if (s.rot !== rot) next = setStack(next, { ...s, rot });
    }
    return next;
  },
};

export const ORIENTATION: PlaceBehaviour[] = [orientation];
