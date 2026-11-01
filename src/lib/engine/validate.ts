// What is wrong with a table as the app keeps it (`tableProblems()`).

// oxlint-disable-next-line no-restricted-imports -- B2
import { AREAS } from '../../areas';
// oxlint-disable-next-line no-restricted-imports -- B2
import { DECK_SPECS } from '../../decks';
// oxlint-disable-next-line no-restricted-imports -- B2
import type { OldTable } from '../../legacy/table';
// oxlint-disable-next-line no-restricted-imports -- B2
import { playableCards } from '../../setup';
import { pinned, pinnedOnTop } from './actions';
import { spotsOf } from './areas';
import type { CardManifest, Table } from './types';

/**
 * What is wrong with a table as the app keeps it, migrated and settled (none: it is sound). Every playable card lies
 * exactly once in a pile, and no other card does; every pile lies on the table (`z`), in the sidebar (`dock`) or set
 * aside (`tray`), in exactly one of them; only fixed piles may be empty; each table pile says where it lies
 * (`Stack.at`: a fixed pile on its place, any other on a spot or in an area there is), and no other pile does; and the
 * cards pinned to their piles lie there:
 * the time cards at the bottom of their places, the Damage Card on top of its place and each deck's own card
 * (`DeckSpec.keeps`) on top of it — as far as the card set has these cards.
 */
export function tableProblems(t: Table, manifest: CardManifest): string[] {
  const problems: string[] = [];
  const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));
  const codes = new Set(manifest.cards.map((c) => c.code));
  const timeCards = manifest.cards.some((c) => c.type === 'time');

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
      if (!defs[c.id] || defs[c.id].type === 'title')
        problems.push(`card ${c.id} is no playable card`);
    }
  }
  for (const d of playableCards(manifest))
    if (!holder.has(d.id)) problems.push(`card ${d.id} is missing`);
  if ((t as OldTable).hand) problems.push('the removed hand is still there');

  const onTable = new Set(t.z);
  const spots = new Set(spotsOf(t).map((s) => s.id));
  const areas = new Set(AREAS.map((a) => a.id));
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
    const keeps = s.deck && DECK_SPECS[s.deck]?.keeps;
    if (keeps && codes.has(keeps) && pinnedOnTop(s) && top?.code !== keeps)
      problems.push(`the ${s.deck} deck has no ${keeps} on top`);
  }
  return problems;
}
