import type { CardRef, Table } from '../types';

/** Where a battlefield was built, before the Battlefield was an area of its own (`OldTable.battlefield`). */
export interface OldBattlefield {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

/**
 * A table as the saves from before version 3 hold it, with what the app no longer has: where each pile is drawn
 * (`Stack.x`, `y`) was saved, and these fields.
 */
export interface OldTable extends Table {
  /** The battlefield built, before the Battlefield area: `migrateTable` lays its Terrain Cards out in that area. */
  battlefield?: OldBattlefield | null;
  /** Cards in the hand the app once had: `migrateTable` sends them back to their decks. */
  hand?: CardRef[];
  /** Frames of the growing areas as last laid out: a card lying on one belongs to that area (`measure()`). */
  frames?: Record<string, { x: number; y: number; w: number; h: number }>;
  /**
   * Where the battlefield's Enemy Card places lay, from its grid's first place, as last laid out: the cards lying on them
   * move with them (`settleEnemies()`).
   */
  enemies?: { x: number; y: number };
}
