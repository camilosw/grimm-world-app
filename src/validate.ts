// Whether a save is of this card set, before it is migrated.

import type { OldTable } from './legacy/table';
import type { CardManifest } from './lib/engine/types';
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
