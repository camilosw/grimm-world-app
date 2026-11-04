// What the game adds to the generic UI (GameUI): its area icons, the area rail, the areas Fit frames, the area headers'
// texts, the words of the refusals and its other words, its figures, its About dialog, its reading matter (the rules)
// and the action bar's commands.
// The game registers it with `setGameUI()` beside its GameDefinition (`setGame()`).

import type { ComponentType } from 'react';
import type { Area } from '../engine/areas';
import type { Refusal } from '../engine/refusals';
import type { CardManifest, GridId, Table, Token } from '../engine/types';
import type { FigureCommand, PileCommand } from './commands';
import type { ContentProvider } from './content';

/** A figure the Figures panel puts on the table. */
export interface FigureKind {
  label: string;
  color: string;
  shape: Token['shape'];
}

export interface GameUI {
  /** An area's icon, in its header and on the area rail. */
  AreaIcon: ComponentType<{ id: string }>;
  /** The areas of the rail at the screen's left edge, in this order. */
  railAreas: string[];
  /** The areas Fit frames on this table (pressed again, it frames the whole table). */
  fitAreas(t: Table): string[];
  /** What an area takes, in its header (left out when it is the area's label). */
  acceptsText(area: Area): string;
  /** A refusal in words, told to the player ("Region Cards belong in the Map area"). */
  refusalText(r: Refusal): string;
  /** What the first place of an empty grid says. */
  gridStart: Record<GridId, { label: string; hint: string }>;
  /** The game's words in the generic UI. */
  texts: {
    /** The right sidebar of cards set aside ("Hand"). */
    tray: string;
    /** What the Find dialog asks for ("Card numbers or names, e.g. …"). */
    findPlaceholder: string;
    /** An example of a pile's name, in the Name dialog ("e.g. …"). */
    nameExample: string;
    /** What the Browse panel's filter finds, as examples ("Filter: …"). */
    filterExample: string;
    /** What a tap picks in "Put under…" mode ("Tap … to slide the card under"). */
    putUnderTargets: string;
  };
  /** The figures of the Figures panel, in this order. */
  figures: FigureKind[];
  /** Who made the game, from the menu's About (left out: the menu has no About). */
  About?: ComponentType<{ manifest: CardManifest; onClose: () => void }>;
  /** Reading matter beside the table (the rulebook), if the game has any. */
  content?: ContentProvider;
  /** The action bar's commands for a selected pile, in this order (`PILE_COMMANDS` and the game's own). */
  pileCommands: PileCommand[];
  /** The action bar's commands for a selected figure, in this order (`FIGURE_COMMANDS` and the game's own). */
  figureCommands: FigureCommand[];
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
