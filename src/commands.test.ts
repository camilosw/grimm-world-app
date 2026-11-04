import { describe, expect, it, vi } from 'vitest';
import { banish } from './commands';
import { grimmWorldUI } from './game';
import { toTray } from './lib/engine/actions';
import { deckStack } from './lib/engine/decks';
import { getTable, resetTable } from './lib/engine/store';
import type { Stack, Table } from './lib/engine/types';
import { offered, type PileContext } from './lib/ui/commands';
import { apply, cardsOf, defs, drop, newGame, pileOf } from './test/play';

const context = (table: Table, stack: Stack): PileContext => ({
  table,
  defs,
  stack,
  aside: table.tray?.includes(stack.id) ?? false,
  app: {
    browseId: null,
    setBrowseId: vi.fn(),
    setPutUnder: vi.fn(),
    setDialog: vi.fn(),
    dropAt: () => ({ x: 0, y: 0 }),
    shuffle: vi.fn(),
    notify: vi.fn(),
    openContent: vi.fn(),
    homeNames: () => 'Lost Pages',
  },
});

/** A new game with two Lost Pages cards on the table, the first then set aside in the Hand. */
function withCardInHand(): [Table, Stack, Stack] {
  const [a, b] = cardsOf('lost-pages', 2);
  let [t] = drop(newGame(), [a], 3000, 3000);
  [t] = drop(t, [b], 3600, 3000);
  const pile = pileOf(t, a);
  t = apply(t, (t) => toTray(t, pile, 'all'));
  return [t, t.stacks[t.tray![0]], t.stacks[pileOf(t, b)]];
}

describe('Banish', () => {
  it('is offered for a pile in the Hand only', () => {
    const [t, aside, loose] = withCardInHand();
    const ids = (s: Stack) =>
      offered(grimmWorldUI.pileCommands, context(t, s)).map((c) => c.id);
    expect(ids(aside)).toContain('banish');
    expect(ids(loose)).not.toContain('banish');
    expect(ids(deckStack(t, 'lost-pages')!)).not.toContain('banish');
  });

  it('puts the cards under the Banned Cards card, which stays on top', () => {
    const [t, aside] = withCardInHand();
    const card = aside.cards[0];
    resetTable(t);
    const c = context(t, aside);
    banish.run(c);
    const after = getTable()!;
    const banned = deckStack(after, 'banned')!;
    expect(banned.cards.map((x) => x.id)).toContain(card.id);
    expect(defs[banned.cards.at(-1)!.id].code).toBe('Y011');
    expect(after.tray ?? []).not.toContain(aside.id);
    expect(c.app.notify).toHaveBeenCalledWith('Card banished', true);
  });

  it('banishes a whole pile set aside, under Y011', () => {
    const cards = cardsOf('lost-pages', 3);
    const [t0] = drop(newGame(), cards, 3000, 3000);
    const pile = pileOf(t0, cards[0]);
    const t = apply(t0, (t) => toTray(t, pile, 'all'));
    resetTable(t);
    const c = context(t, t.stacks[t.tray![0]]);
    banish.run(c);
    const banned = deckStack(getTable()!, 'banned')!;
    expect(banned.cards.map((x) => x.id)).toEqual(
      expect.arrayContaining(cards),
    );
    expect(defs[banned.cards.at(-1)!.id].code).toBe('Y011');
    expect(c.app.notify).toHaveBeenCalledWith('3 cards banished', true);
  });
});
