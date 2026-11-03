// What a spot accepts (`Spot.accepts`): the card families it takes, and whether cards of its family dropped elsewhere
// go to it (from anywhere on the table, or anywhere in its area); and why other cards are refused there.

import { type Area, type Spot, spotsOf } from './areas';
import { game } from './game';
import type { Point } from './geometry';
import type { Refusal } from './refusals';
import type { CardDef, Family, Table } from './types';

/** The cards a spot takes, and where from. */
export interface Accepts {
  family: Family;
  /** Further card families it takes (Broken Items: Y-cards too, as some items are printed on them). */
  also?: Family[];
  /** Cards of the family always land here, wherever they are dropped on the table. */
  attracts?: boolean;
  /** Cards of the family dropped anywhere in its area go here. */
  fillsArea?: boolean;
}

/** Whether a spot takes cards of family `f`. */
export function takes(spot: Spot, f: Family | undefined): boolean {
  const a = spot.accepts;
  return f === a.family || (!!f && !!a.also?.includes(f));
}

/** The spot pulling cards of one of these families from anywhere on the table, if any. */
export function attractor(
  t: Table,
  families: (Family | undefined)[],
): Spot | undefined {
  return spotsOf(t).find(
    (s) => s.accepts.attracts && families.includes(s.accepts.family),
  );
}

/** Why cards of these families can't all go to the spot attracting one of them: it takes its card alone. */
export function mixedRefusal(
  own: Spot,
  families: (Family | undefined)[],
): Refusal | null {
  return families.every((f) => f === own.accepts.family)
    ? null
    : { code: 'spot-alone', spot: own };
}

/** The spot taking cards of these families dropped anywhere in `area`, if any. */
export function areaSpot(
  t: Table,
  area: Area | null,
  families: (Family | undefined)[],
): { spot: Spot; place: Point } | undefined {
  const spot = spotsOf(t).find(
    (s) =>
      s.accepts.fillsArea &&
      s.area === area?.id &&
      families.every((f) => takes(s, f)),
  );
  return spot && { spot, place: { x: spot.x, y: spot.y } };
}

/**
 * Why cards of these families can't go on the spot, dropped in `area` (null: they may). A spot takes its cards even in
 * an area that doesn't (the Encounter Card in the Storybook area); other cards, the area's refusal, else the spot's.
 */
export function refusedBy(
  spot: Spot,
  area: Area | null,
  cardIds: string[],
  defs: Record<string, CardDef>,
  families: (Family | undefined)[],
): Refusal | null {
  if (families.every((f) => takes(spot, f))) return null;
  return (
    game().refusal(area, cardIds, defs) ?? {
      code: spot.accepts.attracts ? 'spot-own-card' : 'spot-family',
      spot,
    }
  );
}
