import { addStack, dropOnto, settle, takeCard } from '../actions';
import {
  AREAS,
  cellPlace,
  deckPlace,
  ENCOUNTER_PLACES,
  encounterPlace,
  placement,
  spotPlaces,
  spotsOf,
  STORY_SLOTS,
  type Placement,
  type Spot,
} from '../areas';
import type { DeckKind } from '../decks';
import { initialTable } from '../setup';
import type { At, CardDef, EncounterPlace, Table } from '../types';
import { realManifest } from './fixtures';

// Playing on a table of the real card set, as the player does: cards are put where `placement()` says, and every
// change is settled as `store.update` settles it.

export const manifest = realManifest();
export const defs: Record<string, CardDef> = Object.fromEntries(
  manifest.cards.map((c) => [c.id, c]),
);

/** A new game (rulebook 6.1). */
export function newGame(): Table {
  return initialTable(manifest);
}

/** Apply a change as `store.update` does. */
export function apply(t: Table, fn: (t: Table) => Table): Table {
  return settle(fn(t), t);
}

/** The id of the card with this number ("Y291c", "B23", "R1-111") or name ("Martha", "Time Passes"). */
export function card(codeOrName: string): string {
  const def = manifest.cards.find(
    (c) => c.code === codeOrName || c.name === codeOrName,
  );
  if (!def) throw new Error(`no card ${codeOrName}`);
  return def.id;
}

/** The ids of the first `n` cards of a type, in card order. */
export function cardsOf(type: CardDef['type'], n: number): string[] {
  return manifest.cards
    .filter(
      (c) =>
        c.type === type &&
        c.code !== 'Y010' &&
        !/^Y01[1-3]$/.test(c.code ?? ''),
    )
    .slice(0, n)
    .map((c) => c.id);
}

/** A spot as it lies on this table. */
export function spot(t: Table, id: string): Spot {
  const s = spotsOf(t).find((s) => s.id === id);
  if (!s) throw new Error(`no spot ${id}`);
  return s;
}

/** The table pile holding a card. */
export function pileOf(t: Table, cardId: string): string {
  const id = Object.keys(t.stacks).find((id) =>
    t.stacks[id].cards.some((c) => c.id === cardId),
  );
  if (!id) throw new Error(`no pile holds ${cardId}`);
  return id;
}

/**
 * Take cards out of wherever they are and drop them, as one pile (the first at the bottom), with its top-left corner
 * at (x, y), or onto pile `onto`. Returns the table (unchanged when refused) and where `placement()` put them.
 */
export function drop(
  t: Table,
  cardIds: string[],
  x: number,
  y: number,
  onto: string | null = null,
): [Table, Placement] {
  const p = placement(t, cardIds, defs, x, y, onto);
  if (p.refused) return [t, p];
  const next = apply(t, (t) => {
    let taken = t;
    const cards = cardIds.map((id) => {
      const [t2, c] = takeCard(taken, id);
      taken = t2;
      return { ...c!, faceUp: true };
    });
    const [t3, id] = addStack(taken, p.x, p.y, cards);
    return p.onto && t3.stacks[p.onto] ? dropOnto(t3, id, p.onto, defs) : t3;
  });
  return [next, p];
}

/** Drop cards one by one, each where the first was dropped; fails on a refusal. */
export function dropEach(t: Table, cardIds: string[], x: number, y: number) {
  return cardIds.reduce((t, id) => {
    const [next, p] = drop(t, [id], x, y);
    if (p.refused) throw new Error(p.refused);
    return next;
  }, t);
}

/** Where a table pile lying `at` lies on this table, worked out from the layout as the app works out a spot's place. */
function pointOf(t: Table, at: At): { x: number; y: number } {
  if ('place' in at) {
    const p = at.place;
    if (p === 'story' || p === 'story-revealed') {
      const d = t.shifts?.storybook ?? { x: 0, y: 0 };
      return { x: STORY_SLOTS[p].x + d.x, y: STORY_SLOTS[p].y + d.y };
    }
    if (p === 'damage') return spot(t, 'damage');
    if (ENCOUNTER_PLACES.some((e) => e.place === p))
      return encounterPlace(t, p as EncounterPlace);
    return deckPlace(t, p as DeckKind);
  }
  if ('grid' in at) return cellPlace(t, at.grid, at.col, at.row);
  if ('spot' in at) {
    const s = spot(t, at.spot);
    return s.fan ? spotPlaces(s, at.index + 1)[at.index] : s;
  }
  if ('area' in at) {
    const a = AREAS.find((a) => a.id === at.area)!;
    const d = t.shifts?.[a.id] ?? { x: 0, y: 0 };
    return { x: a.x + d.x + at.x, y: a.y + d.y + at.y };
  }
  return at;
}

/**
 * The piles whose `Stack.at` doesn't say where they lie (none: every table pile's leads back to its `x, y`, and no other
 * pile has one).
 */
export function misplaced(t: Table): string[] {
  const onTable = new Set(t.z);
  return Object.values(t.stacks).flatMap((s) => {
    if (!onTable.has(s.id))
      return s.at
        ? [`${s.id} lies off the table, at ${JSON.stringify(s.at)}`]
        : [];
    if (!s.at) return [`${s.id} lies nowhere`];
    const p = pointOf(t, s.at);
    const close = Math.abs(p.x - s.x) < 1e-6 && Math.abs(p.y - s.y) < 1e-6;
    return close
      ? []
      : [
          `${s.id} lies at ${s.x},${s.y}, not ${JSON.stringify(s.at)}: ${p.x},${p.y}`,
        ];
  });
}
