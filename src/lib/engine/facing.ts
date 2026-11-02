// A spot's facing (`Spot.facing`): its cards kept face up or face down after any change (its `settle` hook), or turned
// face up as they arrive (its `arrive` hook), and the grids' cards, which lie face up.

import { allGridPiles, type Spot, spotOf, stacksOnSpot } from './areas';
import { setStack } from './actions';
import type { PlaceBehaviour } from './behaviours';
import type { Stack, Table } from './types';

/**
 * How a spot's cards face: `up` or `down` for good, turned so when put there, and they can't be turned over there
 * (Broken Items, Status Upgrades & Items, the hand, Market Prices face up; the Encounter Bar's Y-cards face down, their
 * backs showing the location they belong to); `arrives-up`: turned face up when put there, and free to be turned over
 * afterwards (the Storybook's Encounter Card). Left out: as the player turns them.
 */
export type Facing = 'up' | 'down' | 'arrives-up';

/** The spot pile `id` lies on that keeps its cards face up or down (Market Prices, Encounter Bar, Broken Items, …). */
export function facedSpot(t: Table, id: string): Spot | undefined {
  const s = spotOf(t, id);
  return s?.facing === 'up' || s?.facing === 'down' ? s : undefined;
}

/** A pile with all its cards facing `faceUp`. */
function faced(s: Stack, faceUp: boolean): Stack | null {
  return s.cards.some((c) => c.faceUp !== faceUp)
    ? { ...s, cards: s.cards.map((c) => ({ ...c, faceUp })) }
    : null;
}

/** The ids of the cards in these piles. */
export function cardsOn(t: Table, ids: readonly string[]): Set<string> {
  return new Set(ids.flatMap((id) => t.stacks[id].cards.map((c) => c.id)));
}

/** Pile `id` with its cards that weren't among `had` (just put there) facing `faceUp`, the others as they lie. */
export function turnArrived(
  t: Table,
  id: string,
  had: Set<string>,
  faceUp: boolean,
): Table {
  const s = t.stacks[id];
  if (!s.cards.some((c) => !had.has(c.id) && c.faceUp !== faceUp)) return t;
  return setStack(t, {
    ...s,
    cards: s.cards.map((c) => (had.has(c.id) ? c : { ...c, faceUp })),
  });
}

/** The cards lying on the grids' places (the Map's Region Cards, the battlefield's Terrain Cards) lie face up. */
export function faceUpGrids(t: Table): Table {
  let next = t;
  for (const id of allGridPiles(t)) {
    const s = faced(next.stacks[id], true);
    if (s) next = setStack(next, s);
  }
  return next;
}

const facing: PlaceBehaviour = {
  settle(t, spot) {
    if (spot.facing !== 'up' && spot.facing !== 'down') return t;
    let next = t;
    for (const id of stacksOnSpot(t, spot)) {
      const s = faced(next.stacks[id], spot.facing === 'up');
      if (s) next = setStack(next, s);
    }
    return next;
  },
  arrive(prev, t, spot, was) {
    if (spot.facing !== 'arrives-up') return t;
    const had = cardsOn(prev, was ? stacksOnSpot(prev, was) : []);
    return stacksOnSpot(t, spot).reduce(
      (next, id) => turnArrived(next, id, had, true),
      t,
    );
  },
};

export const FACING: PlaceBehaviour[] = [facing];
