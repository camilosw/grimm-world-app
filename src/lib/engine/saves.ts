// Saves of any game: the save file (`{ game, version, table }`, the game being its `GameDefinition.id`), the table it
// holds without what the layout works out (loading lays it out again, `layOut()`), and the game kept on this device.
// What a save of a version holds and how an older one is brought up to date are the game's (`GameDefinition.readSave`).

import { game } from './game';
import { storage } from './storage';
import type { CardManifest, Stack, Table } from './types';

/** A save as it is written: the table, with which game and which version of the game's save format it is. */
export interface SaveFile {
  game: string;
  version: number;
  table: Table;
}

/** Why a save can't be loaded, worded to follow "could not be loaded: ". */
export class SaveError extends Error {}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A table without what the layout works out from where its piles lie (`Stack.at`) and where the player put the areas
 * (`Table.anchors`): where each pile is drawn (`Stack.x`, `y`) and how far each area lies from its own place
 * (`Table.shifts`).
 */
export function withoutLayout<T extends Table>(t: T): T {
  const rest = { ...t };
  delete rest.shifts;
  const stacks: Record<string, Stack> = {};
  for (const [id, s] of Object.entries(t.stacks)) {
    const pile: Partial<Stack> = { ...s };
    delete pile.x;
    delete pile.y;
    stacks[id] = pile as Stack;
  }
  return { ...rest, stacks };
}

/** The save of a table, of version `version` of the game's save format: without its layout (`withoutLayout()`). */
export function saveFile(t: Table, version: number): string {
  const file: SaveFile = {
    game: game().id,
    version,
    table: withoutLayout(t),
  };
  return JSON.stringify(file);
}

/**
 * The version and the table of a save of this game, not checked yet: a bare table is a save from before the version was
 * saved (version 0). Throws a `SaveError` for what isn't a save, a save of another game, or one of a version above
 * `current`.
 */
export function openSave(
  text: string,
  current: number,
): { version: number; table: unknown } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('it is not a save file');
  }
  if (!isObject(data) || !('game' in data)) return { version: 0, table: data };
  if (data.game !== game().id)
    throw new SaveError('it is a save of another game');
  const { version } = data;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new SaveError('it is not a save file');
  if (version > current)
    throw new SaveError('it was saved by a newer version of the app');
  return { version, table: data.table };
}

// The game saved on this device (the prefix is the game's, `storage()`).

const saved = storage('table:v1');
/** A save that could not be loaded, kept aside before a new game was saved over it. */
const unreadable = storage('table:unreadable');

/**
 * The game saved on this device (`GameDefinition.readSave`), or a new game when there is none (`setup`). A save that
 * can't be loaded is kept aside (`<game>:table:unreadable`) before the new game is saved over it.
 */
export function loadGame(manifest: CardManifest): Table {
  const text = saved.get();
  if (text === null) return game().setup(manifest);
  try {
    return game().readSave(text, manifest);
  } catch (e) {
    unreadable.set(text);
    console.warn(`The saved game could not be loaded: ${(e as Error).message}`);
    return game().setup(manifest);
  }
}

/** Keep the table on this device (the store's autosave, `GameDefinition.saveText`). */
export function writeGame(t: Table) {
  saved.set(game().saveText(t));
}
