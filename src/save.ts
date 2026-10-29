import { initialTable, migrateTable } from './setup';
import { storage } from './storage';
import type { CardDef, CardManifest, Table } from './types';
import { isValidTable, tableProblems } from './validate';

/** Which game a save file is of. */
const GAME = 'grimm-world';

/** A save as it is written: the table, with which game and which version of the save format it is. */
export interface SaveFile {
  game: typeof GAME;
  version: number;
  table: Table;
}

interface Migration {
  /** The version of the save format it brings a save to. */
  to: number;
  /** The table brought up to date, settled. */
  up(t: Table, defs: Record<string, CardDef>): Table;
}

/**
 * How a save of an older version is brought up to date, in order: a save of version n goes through each migration to a
 * version above n. A change to the `Table` that older saves need brought up to date for adds a migration here, to the
 * next version, rather than a step to `migrateTable`.
 */
const MIGRATIONS: Migration[] = [
  // The saves before the version was saved (version 0, a bare `Table`), which `migrateTable` brings up to date from
  // any earlier layout (`Table.layout`).
  { to: 1, up: migrateTable },
];

/** The version of the save format written now. */
export const SAVE_VERSION = MIGRATIONS.at(-1)!.to;

/** Why a save can't be loaded, worded to follow "could not be loaded: ". */
export class SaveError extends Error {}

/** A save of the table, as it is written to the device or exported. */
export function saveText(t: Table): string {
  const file: SaveFile = { game: GAME, version: SAVE_VERSION, table: t };
  return JSON.stringify(file);
}

/**
 * The table a save holds, brought up to date and checked: it is a table of this card set, and it is sound once
 * migrated (`tableProblems`). Throws a `SaveError` saying why when it can't be loaded.
 */
export function readSave(text: string, manifest: CardManifest): Table {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('it is not a save file');
  }
  const { version, table } = unwrap(data);
  const wrong = TABLE(table, 'table');
  if (wrong) throw new SaveError(`it is damaged (${wrong})`);
  if (!isValidTable(table as Table, manifest))
    throw new SaveError('its cards are not those of this game');

  const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));
  let t = table as Table;
  try {
    for (const m of MIGRATIONS) if (m.to > version) t = m.up(t, defs);
  } catch (e) {
    throw new SaveError(
      `it could not be brought up to date (${(e as Error).message})`,
    );
  }
  const problems = tableProblems(t, manifest);
  if (problems.length) throw new SaveError(`it is damaged (${problems[0]})`);
  return t;
}

/** The version and the table of a save: a bare table is a save from before the version was saved (version 0). */
function unwrap(data: unknown): { version: number; table: unknown } {
  if (!isObject(data) || !('game' in data)) return { version: 0, table: data };
  if (data.game !== GAME) throw new SaveError('it is a save of another game');
  const { version } = data;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new SaveError('it is not a save file');
  if (version > SAVE_VERSION)
    throw new SaveError('it was saved by a newer version of the app');
  return { version, table: data.table };
}

// The shape of a saved table (any version), checked before migrating it.

/** What is wrong with a value at a path (null: nothing). */
type Shape = (v: unknown, path: string) => string | null;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num: Shape = (v, p) =>
  typeof v === 'number' && Number.isFinite(v) ? null : `${p} is not a number`;
const str: Shape = (v, p) =>
  typeof v === 'string' ? null : `${p} is not text`;
const bool: Shape = (v, p) =>
  typeof v === 'boolean' ? null : `${p} is not true or false`;
const optional =
  (shape: Shape): Shape =>
  (v, p) =>
    v === undefined ? null : shape(v, p);
const listOf =
  (shape: Shape): Shape =>
  (v, p) => {
    if (!Array.isArray(v)) return `${p} is not a list`;
    for (const [i, x] of v.entries()) {
      const wrong = shape(x, `${p}[${i}]`);
      if (wrong) return wrong;
    }
    return null;
  };
const recordOf =
  (shape: Shape): Shape =>
  (v, p) => {
    if (!isObject(v)) return `${p} is not an object`;
    for (const [k, x] of Object.entries(v)) {
      const wrong = shape(x, `${p}.${k}`);
      if (wrong) return wrong;
    }
    return null;
  };
const object =
  (fields: Record<string, Shape>): Shape =>
  (v, p) => {
    if (!isObject(v)) return `${p} is not an object`;
    for (const [k, shape] of Object.entries(fields)) {
      const wrong = shape(v[k], `${p}.${k}`);
      if (wrong) return wrong;
    }
    return null;
  };

const POINT = object({ x: num, y: num });
const CARD = object({ id: str, faceUp: bool });
const STACK = object({
  id: str,
  x: num,
  y: num,
  rot: num,
  cards: listOf(CARD),
  label: optional(str),
  deck: optional(str),
  slot: optional(str),
  place: optional(str),
});
const TABLE = object({
  stacks: recordOf(STACK),
  z: listOf(str),
  dock: optional(listOf(str)),
  tray: optional(listOf(str)),
  battlefield: (v, p) =>
    v === undefined || v === null
      ? null
      : object({ x: num, y: num, cols: num, rows: num })(v, p),
  origin: optional(recordOf(str)),
  tokens: listOf(object({ id: str, x: num, y: num, color: str, shape: str })),
  hand: optional(listOf(CARD)),
  layout: optional(num),
  shifts: optional(recordOf(POINT)),
  anchors: optional(recordOf(POINT)),
  frames: optional(recordOf(object({ x: num, y: num, w: num, h: num }))),
  enemies: optional(POINT),
  nextId: num,
});

// The game saved on this device.

const saved = storage('table:v1');
/** A save that could not be loaded, kept aside before a new game was saved over it. */
const unreadable = storage('table:unreadable');

/**
 * The game saved on this device, or a new game when there is none. A save that can't be loaded is kept aside
 * (`grimm-world:table:unreadable`) before the new game is saved over it.
 */
export function loadGame(manifest: CardManifest): Table {
  const text = saved.get();
  if (text === null) return initialTable(manifest);
  try {
    return readSave(text, manifest);
  } catch (e) {
    unreadable.set(text);
    console.warn(`The saved game could not be loaded: ${(e as Error).message}`);
    return initialTable(manifest);
  }
}

/** Keep the table on this device (autosave). */
export function writeGame(t: Table) {
  saved.set(saveText(t));
}
