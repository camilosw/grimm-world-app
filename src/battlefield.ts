// Grimm World's battlefield: typing it row by row, building it from the Terrain Cards and clearing it.

import {
  addStack,
  returnToDecks,
  takeCard,
  withCards,
} from './lib/engine/actions';
import { gridCells } from './lib/engine/areas';
import type { At, CardDef, Table } from './lib/engine/types';

export interface TerrainSlot {
  code: string;
  down: boolean;
}

/** A battlefield typed out: its rows of places, and the words that are no Terrain Card number. */
export interface BattlefieldLayout {
  rows: (TerrainSlot | null)[][];
  invalid: string[];
}

/**
 * Parse a battlefield typed row by row: "01 07v 15v" on each line (or rows split by "/"), "v" (or "d", "↓") for a card
 * pointing down, "-" for an empty place.
 */
export function parseBattlefield(text: string): BattlefieldLayout {
  const invalid: string[] = [];
  const rows = text
    .split(/[\n/;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.split(/[\s,]+/).map((tok) => {
        const m = /^(\d{1,2})\s*([vVdD↓])?$/.exec(tok);
        if (!m && !/^[-–—.]$/.test(tok)) invalid.push(tok);
        return m ? { code: `T${m[1].padStart(2, '0')}`, down: !!m[2] } : null;
      }),
    );
  return { rows, invalid };
}

/** The battlefield lying on the table typed out as `parseBattlefield()` reads it, one line per row. */
export function battlefieldText(
  t: Table,
  defs: Record<string, CardDef>,
): string {
  const cells = gridCells(t, 'battlefield');
  if (!cells.length) return '';
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  const rows: string[][] = [];
  for (const { col, row, id } of cells) {
    const s = t.stacks[id];
    const code = defs[s.cards[s.cards.length - 1].id]?.code ?? '';
    const line = (rows[row - minRow] ??= []);
    line[col - minCol] = code.replace(/^T/, '') + (s.rot === 180 ? 'v' : '');
  }
  return Array.from(rows, (line) =>
    Array.from(line ?? [], (w) => w ?? '-').join(' '),
  ).join('\n');
}

/**
 * Lay out Terrain Cards edge to edge on the battlefield grid as drawn on a Conflict Card, from its first place.
 * `rows` holds card codes like "T07" (null = empty place); down-facing cards are turned 180°. Replaces the Terrain
 * Cards lying on the table.
 */
export function buildBattlefield(
  t: Table,
  rows: (TerrainSlot | null)[][],
  defs: Record<string, CardDef>,
): Table {
  const idByCode = new Map(Object.values(defs).map((d) => [d.code, d.id]));
  let next = clearBattlefield(t, defs);
  // A card typed twice lies at its first place.
  const laid = new Set<string>();
  rows.forEach((row, r) =>
    row.forEach((slot, c) => {
      const id = slot && idByCode.get(slot.code);
      if (!id || laid.has(id)) return;
      laid.add(id);
      const [t2, card] = takeCard(next, id);
      if (!card) return;
      const at: At = { grid: 'battlefield', col: c, row: r };
      next = addStack(t2, at, [{ ...card, faceUp: true }], {
        rot: slot.down ? 180 : 0,
      })[0];
    }),
  );
  return next;
}

/** Put every Terrain Card lying on the table back into the Terrain deck. */
export function clearBattlefield(
  t: Table,
  defs: Record<string, CardDef>,
): Table {
  let next = t;
  for (const id of t.z) {
    const s = next.stacks[id];
    if (s?.cards.some((c) => defs[c.id]?.type === 'terrain')) {
      const terrain = s.cards.filter((c) => defs[c.id]?.type === 'terrain');
      next = returnToDecks(
        withCards(
          next,
          s,
          s.cards.filter((c) => !terrain.includes(c)),
        ),
        terrain,
        defs,
      );
    }
  }
  return next;
}
