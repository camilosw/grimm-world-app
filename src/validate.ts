// Whether a save is of this card set, before it is migrated, and what Grimm World's own rules find wrong with a table.

import type { OldTable } from './legacy/table';
import { pinned } from './lib/engine/actions';
import type { CardManifest, Table } from './lib/engine/types';
import { playableCards } from './setup';

/**
 * Whether a save looks like a table of this card set, before migrating it: every card known and there once at most,
 * every playable card there (older saves may still hold the title card, or cards in the removed hand), and every pile
 * set aside there.
 */
export function isValidTable(
  t: OldTable | null,
  manifest: CardManifest,
): t is OldTable {
  if (!t?.stacks || !t.z || !t.tokens) return false;
  const ids = [
    ...Object.values(t.stacks).flatMap((s) => s.cards),
    ...(t.hand ?? []),
  ].map((c) => c.id);
  const known = new Set(manifest.cards.map((c) => c.id));
  const unique = new Set(ids);
  return (
    unique.size === ids.length &&
    ids.every((id) => known.has(id)) &&
    playableCards(manifest).every((c) => unique.has(c.id)) &&
    (t.tray ?? []).every((id) => t.stacks[id])
  );
}

/**
 * What Grimm World's own rules find wrong with a table (`GameDefinition.problems`, beside `tableProblems()`): the removed
 * hand still there, the time cards off the bottom of their places, the Damage Card off the top of its place — as far as
 * the card set has these cards.
 */
export function gameProblems(t: Table, manifest: CardManifest): string[] {
  const problems: string[] = [];
  const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));
  const codes = new Set(manifest.cards.map((c) => c.code));
  const timeCards = manifest.cards.some((c) => c.type === 'time');
  if ((t as OldTable).hand) problems.push('the removed hand is still there');
  for (const [id, s] of Object.entries(t.stacks)) {
    const top = defs[s.cards.at(-1)?.id ?? ''];
    s.cards.forEach((c, i) => {
      if (defs[c.id]?.type === 'time' && i >= pinned(s))
        problems.push(`pile ${id} holds a time card off its place's bottom`);
    });
    if (
      (s.place === 'time-passes' || s.place === 'next-chapter') &&
      timeCards &&
      defs[s.cards[0]?.id]?.type !== 'time'
    )
      problems.push(`the ${s.place} place has lost its time card`);
    if (s.place === 'damage' && codes.has('Y010') && top?.code !== 'Y010')
      problems.push('the Damage Card is not on top of its place');
  }
  return problems;
}
