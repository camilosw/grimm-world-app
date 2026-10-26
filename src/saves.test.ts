import { describe, expect, it } from 'vitest';
import { battlefieldText, settle } from './actions';
import { migrateTable } from './setup';
import { deepFreeze, realManifest, SAVES } from './test/fixtures';
import type { Table } from './types';
import { isValidTable, tableProblems } from './validate';

const manifest = realManifest();
const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));

/** Where everything lies: each pile's place, turn and cards (a deck in the sidebar or set aside: how many). */
function layout(t: Table) {
  const pile = (id: string) => {
    const s = t.stacks[id];
    const kind = s.deck ?? s.slot ?? s.place ?? '';
    return `${id} ${kind} ${s.x},${s.y} ${s.rot}° ${s.cards.map((c) => c.id + (c.faceUp ? '+' : '-')).join(' ')}`;
  };
  return {
    table: t.z.map(pile),
    sidebar: (t.dock ?? []).map(
      (id) => `${id} ${t.stacks[id].deck} ${t.stacks[id].cards.length}`,
    ),
    hand: (t.tray ?? []).map((id) => `${id} ${t.stacks[id].cards.length}`),
    tokens: t.tokens.map((k) => `${k.id} ${k.x},${k.y}`),
    shifts: t.shifts,
    anchors: t.anchors,
  };
}

/** The cards lying in piles on the table that aren't fixed (laid out by the player). */
function looseCards(t: Table): string[] {
  return t.z
    .map((id) => t.stacks[id])
    .filter((s) => !s.deck && !s.slot && !s.place)
    .flatMap((s) => s.cards.map((c) => c.id))
    .sort();
}

describe.each(Object.keys(SAVES).sort())('the save from %s', (name) => {
  const saved = deepFreeze(JSON.parse(SAVES[name]) as Table);
  // Frozen: migrating changes nothing in the save it is given.
  const migrated = migrateTable(saved, defs);

  it('is taken for a save of this card set', () => {
    expect(isValidTable(saved, manifest)).toBe(true);
  });

  it('migrates to a sound table', () => {
    expect(tableProblems(migrated, manifest)).toEqual([]);
  });

  it('migrates to a table already in order', () => {
    expect(settle(migrated)).toEqual(migrated);
  });

  it('loads unchanged once migrated', () => {
    expect(migrateTable(migrated, defs)).toEqual(migrated);
  });

  it('keeps the cards the player laid out on the table', () => {
    const kept = new Set(
      migrated.z.flatMap((id) => migrated.stacks[id].cards.map((c) => c.id)),
    );
    expect(looseCards(saved).filter((id) => !kept.has(id))).toEqual([]);
  });

  it('lays the table out as before', () => {
    expect(layout(migrated)).toMatchSnapshot();
  });

  // Typed in the Battle dialog of the versions before the Battlefield area (`-battle` saves).
  it.runIf(saved.battlefield)(
    'lays the battlefield built before onto the Battlefield grid',
    () => {
      expect(battlefieldText(migrated, defs)).toBe('01 07v 15v\n19 - 31');
    },
  );
});
