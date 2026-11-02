// What the game adds to the generic UI (GameUI): its area icons, the area rail, the areas Fit frames, the area headers'
// texts and the rulebook links. The game registers it with `setGameUI()` beside its GameDefinition (`setGame()`).

import type { ComponentType } from 'react';
import type { Area } from '../engine/areas';
import type { CardDef, GridId, Stack, Table } from '../engine/types';

export interface GameUI {
  /** An area's icon, in its header and on the area rail. */
  AreaIcon: ComponentType<{ id: string }>;
  /** The areas of the rail at the screen's left edge, in this order. */
  railAreas: string[];
  /** The areas Fit frames on this table (pressed again, it frames the whole table). */
  fitAreas(t: Table): string[];
  /** What an area takes, in its header (left out when it is the area's label). */
  acceptsText(area: Area): string;
  /** What the first place of an empty grid says. */
  gridStart: Record<GridId, { label: string; hint: string }>;
  /** The rulebook section explaining a pile (its deck, its place or its top card), if any. */
  rule(stack: Stack, defs: Record<string, CardDef>): string | null;
}

let current: GameUI | undefined;

/** Register what the game adds to the UI, before the UI is drawn. */
export function setGameUI(ui: GameUI) {
  current = ui;
}

/** What the game adds to the UI (`setGameUI()`). */
export function gameUI(): GameUI {
  if (!current)
    throw new Error('No game UI registered: call setGameUI() first.');
  return current;
}
