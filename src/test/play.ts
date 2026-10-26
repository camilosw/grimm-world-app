import { addStack, dropOnto, settle, takeCard } from '../actions';
import { placement, spotsOf, type Placement, type Spot } from '../areas';
import { initialTable } from '../setup';
import type { CardDef, Table } from '../types';
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
