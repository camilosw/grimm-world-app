import { describe, expect, it } from 'vitest';
import { battlefieldText } from './battlefield';
import { migrateTable, recordAt } from './legacy/migrate';
import type { OldTable } from './legacy/table';
import { settle } from './lib/engine/actions';
import type { At, Table } from './lib/engine/types';
import { tableProblems } from './lib/engine/validate';
import { migrate, readSave, saveText } from './save';
import { deepFreeze, realManifest, SAVES } from './test/fixtures';
import { misplaced } from './test/play';
import { isValidTable } from './validate';

const manifest = realManifest();
const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));

/** Where a pile lies in the game's terms (`Stack.at`). */
function where(at?: At): string {
  if (!at) return '-';
  if ('place' in at) return `@${at.place}`;
  if ('grid' in at) return `@${at.grid}[${at.col},${at.row}]`;
  if ('spot' in at) return `@${at.spot}#${at.index}`;
  if ('area' in at) return `@${at.area}+${at.x},${at.y}`;
  return `@${at.x},${at.y}`;
}

/** Where everything lies: each pile's place, turn and cards (a deck in the sidebar or set aside: how many). */
function layout(t: Table) {
  const pile = (id: string) => {
    const s = t.stacks[id];
    const kind = s.deck ?? s.slot ?? s.place ?? '';
    return `${id} ${kind} ${s.x},${s.y} ${where(s.at)} ${s.rot}° ${s.cards.map((c) => c.id + (c.faceUp ? '+' : '-')).join(' ')}`;
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

/** A save of `version` brought up to version `to` only, as the migrations leave it (no layout of its own after 2). */
function migrateTo(saved: OldTable, version: number, to: number): OldTable {
  return [migrateTable, recordAt]
    .slice(version, to)
    .reduce((t, up) => up(t, defs), saved);
}

/** The areas' shifts, but those of the areas lying on their own place. */
function moved(shifts: Table['shifts']) {
  return Object.fromEntries(
    Object.entries(shifts ?? {}).filter(([, d]) => d.x || d.y),
  );
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
  // From 0.5.6 on, a save holds its table with the game and the version of the save format.
  const file = JSON.parse(SAVES[name]);
  const saved = deepFreeze((file.game ? file.table : file) as OldTable);
  const version: number = file.game ? file.version : 0;
  const migrated = readSave(SAVES[name], manifest);

  it('is taken for a save of this card set', () => {
    expect(isValidTable(saved, manifest)).toBe(true);
  });

  it('migrates without changing the save it is given', () => {
    // Frozen: changing anything in it throws.
    expect(migrate(saved, version, defs)).toEqual(migrated);
  });

  // The saves before version 3 held where each pile was drawn, and their migrations still lay the table out by the
  // coordinates, on the layout of then (legacy/): the app, laying each pile out from where it lies (`Stack.at`), draws
  // it in the same place. (Only while the app's layout is that one: once it changes, only `at` and anchors compare.)
  it('lays every pile out where the save from before version 3 drew it', () => {
    const drawn = migrateTo(saved, version, 2);
    expect(migrated.z).toEqual(drawn.z);
    for (const id of drawn.z) {
      const [was, now] = [drawn.stacks[id], migrated.stacks[id]];
      expect(now.at, id).toEqual(was.at);
      // To within the rounding of adding a loose pile's place in its area to the area's corner.
      expect(now.x, id).toBeCloseTo(was.x, 9);
      expect(now.y, id).toBeCloseTo(was.y, 9);
    }
    expect(migrated.tokens).toEqual(drawn.tokens);
    expect(migrated.anchors).toEqual(drawn.anchors);
    expect(migrated.shifts).toEqual(moved(drawn.shifts));
  });

  it('migrates to a sound table', () => {
    expect(tableProblems(migrated, manifest)).toEqual([]);
  });

  it('migrates to a table already in order', () => {
    expect(settle(migrated)).toEqual(migrated);
  });

  it('loads unchanged once migrated and saved again', () => {
    expect(readSave(saveText(migrated), manifest)).toEqual(migrated);
    // Saved bare, as before the version was saved: `migrateTable` changes nothing in it.
    expect(readSave(JSON.stringify(migrated), manifest)).toEqual(migrated);
  });

  it('migrates to a table knowing where each pile lies', () => {
    expect(misplaced(migrated)).toEqual([]);
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
