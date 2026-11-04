import { migrateTable, recordAt } from './legacy/migrate';
import type { OldTable } from './legacy/table';
import { layOut } from './lib/engine/areas';
import {
  isObject,
  openSave,
  SaveError,
  saveFile,
  withoutLayout as bare,
} from './lib/engine/saves';
import type { CardDef, CardManifest, Table } from './lib/engine/types';
import { tableProblems } from './lib/engine/validate';
import { isValidTable } from './validate';

interface Migration {
  /** The version of the save format it brings a save to. */
  to: number;
  /** The table brought up to date, as a save of that version holds it. */
  up(t: OldTable, defs: Record<string, CardDef>): OldTable;
}

/**
 * How a save of an older version is brought up to date, in order: a save of version n goes through each migration to a
 * version above n. A change to the `Table` that older saves need brought up to date for adds a migration here, to the
 * next version, rather than a step to `migrateTable`.
 */
const MIGRATIONS: Migration[] = [
  // The saves before version 3 held where each pile was drawn: their migrations move piles by their coordinates, on the
  // layout of then, frozen in legacy/ so that changes to the app's layout leave them as they were.
  // The saves before the version was saved (version 0, a bare `Table`), which `migrateTable` brings up to date from
  // any earlier layout (`Table.layout`).
  { to: 1, up: migrateTable },
  // Where each table pile lies in the game's terms (`Stack.at`), read off where it lies by `recordAt()`.
  { to: 2, up: recordAt },
  // The layout is no longer saved, only where each pile lies (`Stack.at`) and where the player put the areas
  // (`Table.anchors`): loading lays the table out from them (`layOut()`).
  { to: 3, up: withoutLayout },
];

/** The version of the save format written now. */
export const SAVE_VERSION = MIGRATIONS.at(-1)!.to;

/** A save of the table, as it is written to the device or exported: without its layout (`saveFile()`). */
export function saveText(t: Table): string {
  return saveFile(t, SAVE_VERSION);
}

/**
 * The migration to version 3: a table without what the layout works out (`withoutLayout()` in src/lib/engine/saves.ts),
 * nor the frames and the Enemy Card places last laid out that saves from before version 3 hold (`OldTable.frames`,
 * `enemies`). The app's tables have neither, so `saveText` needs only the engine's.
 */
export function withoutLayout(t: OldTable): Table {
  const rest = bare(t);
  delete rest.frames;
  delete rest.enemies;
  return rest;
}

/**
 * A saved table of `version` brought up to date (`MIGRATIONS`) and laid out (`layOut()`), as loading it gives it. Throws
 * when a migration fails.
 */
export function migrate(
  table: OldTable,
  version: number,
  defs: Record<string, CardDef>,
): Table {
  let t = table;
  for (const m of MIGRATIONS) if (m.to > version) t = m.up(t, defs);
  return layOut(t);
}

/**
 * The table a save holds, brought up to date and checked: it is a table of this card set, and it is sound once
 * migrated (`tableProblems`). Throws a `SaveError` saying why when it can't be loaded.
 */
export function readSave(text: string, manifest: CardManifest): Table {
  const { version, table } = openSave(text, SAVE_VERSION);
  const wrong = TABLE(table, 'table');
  if (wrong) throw new SaveError(`it is damaged (${wrong})`);
  if (!isValidTable(table as OldTable, manifest))
    throw new SaveError('its cards are not those of this game');

  const defs = Object.fromEntries(manifest.cards.map((c) => [c.id, c]));
  let t: Table;
  try {
    t = migrate(table as OldTable, version, defs);
  } catch (e) {
    throw new SaveError(
      `it could not be brought up to date (${(e as Error).message})`,
    );
  }
  const problems = tableProblems(t, manifest);
  if (problems.length) throw new SaveError(`it is damaged (${problems[0]})`);
  return t;
}

// The shape of a saved table (any version), checked before migrating it.

/** What is wrong with a value at a path (null: nothing). */
type Shape = (v: unknown, path: string) => string | null;

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
/** One of the grids (`GridId`). */
const GRID: Shape = (v, p) =>
  v === 'map' || v === 'battlefield' ? null : `${p} is no grid`;
/** Where a table pile lies (`At`): on a fixed place, a grid's place, a spot, or loose in an area or on the table. */
const AT: Shape = (v, p) => {
  if (!isObject(v)) return `${p} is not an object`;
  if ('place' in v) return object({ place: str })(v, p);
  if ('grid' in v) return object({ grid: GRID, col: num, row: num })(v, p);
  if ('spot' in v) return object({ spot: str, index: num })(v, p);
  return object({ area: optional(str), x: num, y: num })(v, p);
};
const CARD = object({ id: str, faceUp: bool });
// Before version 3 a save also held where each pile was drawn (`x`, `y`), the areas' shifts, frames and Enemy Card places.
const STACK = object({
  id: str,
  x: optional(num),
  y: optional(num),
  rot: num,
  cards: listOf(CARD),
  label: optional(str),
  deck: optional(str),
  slot: optional(str),
  place: optional(str),
  at: optional(AT),
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
