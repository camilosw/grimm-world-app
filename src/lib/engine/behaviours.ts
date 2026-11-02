// What a spot does with the cards on it, composed of one behaviour per axis of `Spot` (arrangement.ts, orientation.ts,
// facing.ts, layering.ts; what it accepts, accepts.ts, `placement()` asks first): each a set of hooks that `settleSpots()`,
// `faceArrivals()`, `drawOrder()` and `placement()` run for every spot, so that a new behaviour is a module of its own
// rather than a branch in each of them.

import type { Spot } from './areas';
import { ARRANGEMENT } from './arrangement';
import { FACING } from './facing';
import { LAYERING } from './layering';
import { ORIENTATION } from './orientation';
import type { Table } from './types';

/** A spot behaviour's hooks: each leaves what isn't its own as it is (returns its input). */
export interface PlaceBehaviour {
  /** Lay the spot's piles as they must lie there, after any change (`settleSpots()`). */
  settle?(t: Table, spot: Spot): Table;
  /**
   * Turn the cards just put on the spot (`faceArrivals()`), given the table before the change and the spot as it lay
   * on it (`was`, if it was there).
   */
  arrive?(prev: Table, t: Table, spot: Spot, was: Spot | undefined): Table;
  /** The drawing order (back to front) with the spot's piles where they are drawn (`drawOrder()`). */
  layer?(t: Table, spot: Spot, z: string[], spots: Spot[]): string[];
  /** Why the spot takes no more of these cards, which it may hold (`placement()`; null: it does). */
  refuse?(
    t: Table,
    spot: Spot,
    cardIds: string[],
    moving: string | null,
  ): string | null;
}

let all: PlaceBehaviour[] | undefined;

/**
 * Every spot behaviour, in the order its hooks run: the arrangement (rows numbered, piles spread out) before the cards
 * are turned, the cards under others before those above them. Gathered on first use, as the modules import each other.
 */
export function behaviours(): PlaceBehaviour[] {
  return (all ??= [...ARRANGEMENT, ...ORIENTATION, ...FACING, ...LAYERING]);
}

/** Each behaviour's `settle` hook applied to every spot, one behaviour after the other. */
export function settleBehaviours(t: Table, spots: Spot[]): Table {
  let next = t;
  for (const b of behaviours())
    if (b.settle) for (const spot of spots) next = b.settle(next, spot);
  return next;
}

/** Each behaviour's `arrive` hook applied to every spot of `t`, given the spots of `prev`. */
export function arriveBehaviours(
  prev: Table,
  t: Table,
  before: Spot[],
  spots: Spot[],
): Table {
  const was = new Map(before.map((s) => [s.id, s]));
  let next = t;
  for (const b of behaviours())
    if (b.arrive)
      for (const spot of spots)
        next = b.arrive(prev, next, spot, was.get(spot.id));
  return next;
}

/** The drawing order `z` with each behaviour's `layer` hook applied to every spot, one behaviour after the other. */
export function layerBehaviours(
  t: Table,
  z: string[],
  spots: Spot[],
): string[] {
  let order = z;
  for (const b of behaviours())
    if (b.layer)
      for (const spot of spots) order = b.layer(t, spot, order, spots);
  return order;
}

/** The first behaviour's reason the spot takes no more of these cards, if any. */
export function refusedOnto(
  t: Table,
  spot: Spot,
  cardIds: string[],
  moving: string | null,
): string | null {
  for (const b of behaviours()) {
    const why = b.refuse?.(t, spot, cardIds, moving);
    if (why) return why;
  }
  return null;
}
