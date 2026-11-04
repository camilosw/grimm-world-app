// Grimm World's own commands of the action bar, beside the generic ones (`PILE_COMMANDS`): `GameUI.pileCommands`
// lists them in the game's order.

import * as A from './lib/engine/actions';
import { deckStack } from './lib/engine/decks';
import { getTable, update } from './lib/engine/store';
import type { PileCommand } from './lib/ui/commands';

/**
 * Banish a pile set aside in the Hand: its cards go under the Banned Cards card (Y011), out of the game for good
 * (rulebook 7.3.3, 4.7.10). Banned Cards holds any card.
 */
export const banish: PileCommand = {
  id: 'banish',
  icon: '⊘',
  label: 'Banish',
  enabled: (c) =>
    c.aside && A.unpinned(c.stack).length > 0 && !!deckStack(c.table, 'banned'),
  run: (c) => {
    const banned = deckStack(c.table, 'banned');
    if (!banned) return;
    const n = A.unpinned(c.stack).length;
    const before = getTable();
    update((t) => A.putUnderDeck(t, c.stack.id, banned.id, c.defs));
    if (getTable() !== before)
      c.app.notify(n > 1 ? `${n} cards banished` : 'Card banished', true);
  },
};
