// The action bar: the commands the game offers for the selected pile or figure (`GameUI.pileCommands`,
// `figureCommands`; commands.ts).

import type { CardDef, Stack, Table, Token } from '../engine/types';
import { type Command, commandLabel, offered, type PileApp } from './commands';
import { gameUI } from './gameUI';

/** A bar of the commands offered for the selection `c`. */
function CommandBar<C>({ commands, c }: { commands: Command<C>[]; c: C }) {
  return (
    <footer className="actions">
      {offered(commands, c).map((cmd) => (
        <button
          key={cmd.id}
          className={cmd.on?.(c) ? 'on' : undefined}
          onClick={() => cmd.run(c)}
        >
          {cmd.icon} {commandLabel(cmd, c)}
        </button>
      ))}
    </footer>
  );
}

/** What the action bar needs of the app. */
export interface PileBarProps extends PileApp {
  table: Table;
  defs: Record<string, CardDef>;
  /** The selected pile. */
  stack: Stack;
  /** The pile is set aside in the right sidebar: it lies upright there, in no particular place. */
  aside: boolean;
}

/** The actions for the selected pile. */
export function PileBar({ table, defs, stack, aside, ...app }: PileBarProps) {
  return (
    <CommandBar
      commands={gameUI().pileCommands}
      c={{ table, defs, stack, aside, app }}
    />
  );
}

/** The actions for the selected figure. */
export function FigureBar({ table, token }: { table: Table; token: Token }) {
  return <CommandBar commands={gameUI().figureCommands} c={{ table, token }} />;
}
