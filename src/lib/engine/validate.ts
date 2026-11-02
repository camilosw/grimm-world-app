// What is wrong with a table as the app keeps it (`tableProblems()`).

import { pinnedOnTop } from './actions';
import { spotsOf } from './areas';
import { game } from './game';
import type { CardManifest, Table } from './types';

/**
 * What is wrong with a table as the app keeps it, migrated and settled (none: it is sound). Every playable card lies
 * exactly once in a pile, and no other card does; every pile lies on the table (`z`), in the sidebar (`dock`) or set
 * aside (`tray`), in exactly one of them; only fixed piles may be empty; each table pile says where it lies
 * (`Stack.at`: a fixed pile on its place, any other on a spot or in an area there is), and no other pile does; each
 * deck's own card (`DeckSpec.keeps`) lies on top of it, as far as the card set has it; and whatever else the game's own
 * rules say (`GameDefinition.problems`).
 */
export function tableProblems(t: Table, manifest: CardManifest): string[] {
  const problems: string[] = [];
  const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));
  const codes = new Set(manifest.cards.map((c) => c.code));

  const lists = { z: t.z, dock: t.dock ?? [], tray: t.tray ?? [] };
  const listed = new Map<string, string>();
  for (const [list, ids] of Object.entries(lists))
    for (const id of ids) {
      if (listed.has(id))
        problems.push(`pile ${id} is in both ${listed.get(id)} and ${list}`);
      listed.set(id, list);
      if (!t.stacks[id]) problems.push(`${list} names missing pile ${id}`);
    }

  const holder = new Map<string, string>();
  for (const [id, s] of Object.entries(t.stacks)) {
    if (s.id !== id) problems.push(`pile ${s.id} is filed as ${id}`);
    if (!listed.has(id))
      problems.push(`pile ${id} is in none of z, dock, tray`);
    if (!s.cards.length && !s.deck && !s.slot && !s.place)
      problems.push(`pile ${id} is empty`);
    for (const c of s.cards) {
      if (holder.has(c.id))
        problems.push(`card ${c.id} is in both ${holder.get(c.id)} and ${id}`);
      holder.set(c.id, id);
      if (!defs[c.id] || !game().playable(defs[c.id]))
        problems.push(`card ${c.id} is no playable card`);
    }
  }
  for (const d of manifest.cards.filter(game().playable))
    if (!holder.has(d.id)) problems.push(`card ${d.id} is missing`);

  const onTable = new Set(t.z);
  const spots = new Set(spotsOf(t).map((s) => s.id));
  const areas = new Set(game().areas.map((a) => a.id));
  for (const [id, s] of Object.entries(t.stacks)) {
    const at = s.at;
    if (!onTable.has(id)) {
      if (at)
        problems.push(`pile ${id} lies off the table but has a place on it`);
      continue;
    }
    const place = s.place ?? s.slot ?? s.deck;
    if (!at) problems.push(`pile ${id} lies nowhere on the table`);
    else if (place || 'place' in at) {
      if (!('place' in at) || at.place !== place)
        problems.push(`pile ${id} lies off its place`);
    } else if ('spot' in at && !spots.has(at.spot))
      problems.push(`pile ${id} lies on a place no longer there`);
    else if ('area' in at && !areas.has(at.area))
      problems.push(`pile ${id} lies in no area`);
  }

  for (const s of Object.values(t.stacks)) {
    const top = defs[s.cards.at(-1)?.id ?? ''];
    const keeps = s.deck && game().decks[s.deck]?.keeps;
    if (keeps && codes.has(keeps) && pinnedOnTop(s) && top?.code !== keeps)
      problems.push(`the ${s.deck} deck has no ${keeps} on top`);
  }
  return [...problems, ...game().problems(t, manifest)];
}
