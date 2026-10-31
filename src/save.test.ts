import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGame, readSave, SAVE_VERSION, saveText, writeGame } from './save';
import { storage } from './storage';
import { SAVES } from './test/fixtures';
import { manifest, newGame } from './test/play';
import type { Table } from './types';
import { tableProblems } from './validate';

const t0 = newGame();
const SAVED = 'grimm-world:table:v1';
const UNREADABLE = 'grimm-world:table:unreadable';

/** A save of the current version holding this table. */
const envelope = (table: unknown, version = SAVE_VERSION) =>
  JSON.stringify({ game: 'grimm-world', version, table });

/** Whether the table is a new game (its decks shuffled anew). */
const isNewGame = (t: Table) =>
  tableProblems(t, manifest).length === 0 &&
  JSON.stringify(t.z) === JSON.stringify(t0.z) &&
  t.layout === t0.layout;

/** Why the save can't be loaded. */
function refusal(text: string): string {
  try {
    readSave(text, manifest);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('the save was loaded');
}

describe('readSave', () => {
  it('loads what saveText wrote, unchanged', () => {
    const text = saveText(t0);
    expect(JSON.parse(text)).toMatchObject({
      game: 'grimm-world',
      version: SAVE_VERSION,
    });
    expect(readSave(text, manifest)).toEqual(t0);
  });

  it('brings a bare table (before the version was saved) up to date', () => {
    const t = readSave(SAVES['v0.1.0'], manifest);
    expect(t.layout).toBe(newGame().layout);
    expect(readSave(saveText(t), manifest)).toEqual(t);
  });

  it('records where each pile lies in a save from before it was saved (version 1)', () => {
    const stacks = Object.fromEntries(
      Object.entries(t0.stacks).map(([id, s]) => {
        const old = { ...s };
        delete old.at;
        return [id, old];
      }),
    );
    expect(readSave(envelope({ ...t0, stacks }, 1), manifest)).toEqual(t0);
  });

  it('refuses what is no save of this game and version', () => {
    expect(refusal('{"stacks":')).toBe('it is not a save file');
    expect(refusal('null')).toBe('it is damaged (table is not an object)');
    expect(refusal(JSON.stringify({ game: 'other', table: t0 }))).toBe(
      'it is a save of another game',
    );
    expect(refusal(envelope(t0, SAVE_VERSION + 1))).toBe(
      'it was saved by a newer version of the app',
    );
    expect(refusal(envelope(t0, 0))).toBe('it is not a save file');
    expect(refusal(envelope(t0, 1.5))).toBe('it is not a save file');
  });

  it('refuses a table of the wrong shape, saying where', () => {
    const [id] = t0.z;
    const pile = t0.stacks[id];
    const damaged = (t: unknown) => refusal(envelope(t));
    expect(damaged({ ...t0, z: 'all' })).toBe(
      'it is damaged (table.z is not a list)',
    );
    expect(
      damaged({
        ...t0,
        stacks: { ...t0.stacks, [id]: { ...pile, x: null } },
      }),
    ).toBe(`it is damaged (table.stacks.${id}.x is not a number)`);
    expect(
      damaged({
        ...t0,
        stacks: {
          ...t0.stacks,
          [id]: { ...pile, cards: [{ id: pile.cards[0].id }] },
        },
      }),
    ).toBe(
      `it is damaged (table.stacks.${id}.cards[0].faceUp is not true or false)`,
    );
    expect(
      damaged({
        ...t0,
        stacks: { ...t0.stacks, [id]: { ...pile, at: { spot: 'money' } } },
      }),
    ).toBe(`it is damaged (table.stacks.${id}.at.index is not a number)`);
    expect(damaged({ ...t0, tokens: [{ id: 'k' }] })).toBe(
      'it is damaged (table.tokens[0].x is not a number)',
    );
  });

  it('refuses a table of another card set', () => {
    const [id] = t0.z;
    const pile = t0.stacks[id];
    const unknown = { id: 'nope', faceUp: false };
    expect(
      refusal(
        envelope({
          ...t0,
          stacks: { ...t0.stacks, [id]: { ...pile, cards: [unknown] } },
        }),
      ),
    ).toBe('its cards are not those of this game');
  });

  it('refuses a table that is not sound once migrated', () => {
    const empty = { id: 'x', x: 0, y: 0, rot: 0, cards: [] };
    const t = { ...t0, stacks: { ...t0.stacks, x: empty }, z: [...t0.z, 'x'] };
    expect(refusal(envelope(t))).toBe('it is damaged (pile x is empty)');
  });

  it('refuses a save its migrations fail on', () => {
    const text = SAVES['v0.1.0'].replace('"z":[', '"z":["nowhere",');
    expect(refusal(text)).toMatch(/^it could not be brought up to date \(/);
  });
});

describe('loadGame', () => {
  beforeEach(() => localStorage.clear());

  it('begins a new game when nothing is saved', () => {
    expect(isNewGame(loadGame(manifest))).toBe(true);
  });

  it('loads the game saved, and saves it in the current version', () => {
    localStorage.setItem(SAVED, SAVES['v0.5.5']);
    const table = loadGame(manifest);
    expect(table).toEqual(readSave(SAVES['v0.5.5'], manifest));
    writeGame(table);
    expect(localStorage.getItem(SAVED)).toBe(saveText(table));
  });

  it('keeps a save it can not load aside before saving a new game', () => {
    localStorage.setItem(SAVED, '{"stacks":');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const table = loadGame(manifest);
    expect(isNewGame(table)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'The saved game could not be loaded: it is not a save file',
    );
    expect(localStorage.getItem(UNREADABLE)).toBe('{"stacks":');
    writeGame(table);
    expect(localStorage.getItem(SAVED)).toBe(saveText(table));
    warn.mockRestore();
  });
});

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it("keeps values under the app's prefix", () => {
    const width = storage('tray-width');
    expect(width.get()).toBeNull();
    expect(width.set('300')).toBe(true);
    expect(localStorage.getItem('grimm-world:tray-width')).toBe('300');
    width.remove();
    expect(width.get()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    const spies = (['getItem', 'setItem', 'removeItem'] as const).map((m) =>
      vi.spyOn(Storage.prototype, m).mockImplementation(blocked),
    );
    const width = storage('tray-width');
    expect(width.get()).toBeNull();
    expect(width.set('300')).toBe(false);
    expect(() => width.remove()).not.toThrow();
    spies.forEach((s) => s.mockRestore());
  });
});
