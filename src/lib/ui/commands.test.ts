import { describe, expect, it, vi } from 'vitest';
import { grimmWorldUI } from '../../game';
import { setGameUI } from './gameUI';
import { toTray } from '../engine/actions';
import { cellPlace, placeStack } from '../engine/areas';
import { CARD_H, CARD_W } from '../engine/geometry';
import { deckStack } from '../engine/decks';
import { getTable, resetTable } from '../engine/store';
import type { Stack, Table } from '../engine/types';
import { apply, cardsOf, defs, drop, newGame, pileOf } from '../../test/play';
import {
  commandLabel,
  FIGURE_COMMANDS,
  FOCUS_MARGIN,
  focusedRect,
  offered,
  type PileApp,
  PILE_COMMANDS,
  type PileContext,
} from './commands';

/** The app, doing nothing but what a test asks of it. */
const app = (over: Partial<PileApp> = {}): PileApp => ({
  browseId: null,
  setBrowseId: vi.fn(),
  setPutUnder: vi.fn(),
  setDialog: vi.fn(),
  dropAt: () => ({ x: 0, y: 0 }),
  shuffle: vi.fn(),
  notify: vi.fn(),
  openContent: vi.fn(),
  homeNames: () => 'Lost Pages',
  focusRect: vi.fn(),
  ...over,
});

const context = (
  table: Table,
  stack: Stack,
  over: Partial<PileContext> = {},
): PileContext => ({
  table,
  defs,
  stack,
  aside: table.tray?.includes(stack.id) ?? false,
  app: app(),
  ...over,
});

/** The ids of the commands Grimm World's bar offers for a pile. */
const bar = (t: Table, stack: Stack) =>
  offered(grimmWorldUI.pileCommands, context(t, stack)).map((c) => c.id);

/** A new game with one Lost Pages card lying loose on the table. */
function withLooseCard(): [Table, Stack] {
  const [y] = cardsOf('lost-pages', 1);
  const [t] = drop(newGame(), [y], 3000, 3000);
  return [t, t.stacks[pileOf(t, y)]];
}

describe('the action bar', () => {
  it('offers a sidebar deck what a deck does: no Put under, Return to deck, Name, Rotate, Front or Back', () => {
    const t = newGame();
    expect(bar(t, deckStack(t, 'lost-pages')!)).toEqual([
      'draw',
      'flip',
      'top-to-bottom',
      'browse',
      'shuffle',
      'sort',
      'view',
      'turn-over',
      'content',
    ]);
  });

  it('offers a card lying loose on the table everything but Draw and the pile actions', () => {
    const [t, s] = withLooseCard();
    expect(bar(t, s)).toEqual([
      'flip',
      'focus',
      'view',
      'rotate',
      'put-under',
      'front',
      'back',
      'return-to-deck',
      'name',
      'content',
    ]);
  });

  it('draws and moves nothing off the Damage Card, which stays on top of its place', () => {
    const t = newGame();
    const ids = bar(t, placeStack(t, 'damage')!);
    expect(ids).not.toContain('draw');
    expect(ids).not.toContain('top-to-bottom');
    expect(ids).not.toContain('name');
  });

  it('turns a Terrain Card on the battlefield around, never over nor a quarter', () => {
    let t = newGame();
    const [terrain] = cardsOf('terrain', 1);
    const first = cellPlace(t, 'battlefield', 0, 0);
    [t] = drop(t, [terrain], first.x, first.y);
    const ids = bar(t, t.stacks[pileOf(t, terrain)]);
    expect(ids).toContain('turn-around');
    expect(ids).not.toContain('flip');
    expect(ids).not.toContain('rotate');
  });

  it('takes a pile set aside in the Hand back to the table, and neither rotates nor layers it', () => {
    const [t0, s] = withLooseCard();
    const t = apply(t0, (t) => toTray(t, s.id, 'all'));
    const ids = bar(t, t.stacks[t.tray![0]]);
    expect(ids).toContain('to-table');
    for (const id of ['rotate', 'turn-around', 'front', 'back'])
      expect(ids).not.toContain(id);
  });

  it('names Flip after what it turns, and shows Browse pressed while the pile is browsed', () => {
    const t = newGame();
    const deck = deckStack(t, 'lost-pages')!;
    const [, loose] = withLooseCard();
    expect(commandLabel(PILE_COMMANDS.flip, context(t, deck))).toBe('Flip top');
    expect(commandLabel(PILE_COMMANDS.flip, context(t, loose))).toBe('Flip');
    const browsed = context(t, deck, { app: app({ browseId: deck.id }) });
    expect(PILE_COMMANDS.browse.on(browsed)).toBe(true);
    PILE_COMMANDS.browse.run(browsed);
    expect(browsed.app.setBrowseId).toHaveBeenCalledWith(null);
  });

  it('asks the app for what is not a change of the table', () => {
    const t = newGame();
    const deck = deckStack(t, 'lost-pages')!;
    const c = context(t, deck);
    PILE_COMMANDS.shuffle.run(c);
    expect(c.app.shuffle).toHaveBeenCalledWith(deck.id);
    PILE_COMMANDS.view.run(c);
    expect(c.app.setDialog).toHaveBeenCalledWith({
      kind: 'inspect',
      card: deck.cards.at(-1),
    });
    PILE_COMMANDS.content.run(c);
    expect(c.app.openContent).toHaveBeenCalledWith(
      grimmWorldUI.content?.pileSection(deck, defs),
    );
  });

  it('focuses on a pile lying on the table, its card as drawn there with room around it', () => {
    const [t, s] = withLooseCard();
    const c = context(t, s);
    PILE_COMMANDS.focus.run(c);
    const m = FOCUS_MARGIN;
    expect(c.app.focusRect).toHaveBeenCalledWith({
      x: s.x - m,
      y: s.y - m,
      w: CARD_W + 2 * m,
      h: CARD_H + 2 * m,
    });
    // A pile lying a quarter turned lies across, and so does a Region Card, which is landscape.
    expect(focusedRect(context(t, { ...s, rot: 90 }))).toMatchObject({
      w: CARD_H + 2 * m,
      h: CARD_W + 2 * m,
    });
    let onMap = newGame();
    const [region] = cardsOf('region', 1);
    const first = cellPlace(onMap, 'map', 0, 0);
    [onMap] = drop(onMap, [region], first.x, first.y);
    const r = focusedRect(context(onMap, onMap.stacks[pileOf(onMap, region)]));
    expect([r.w, r.h]).toEqual([CARD_H + 2 * m, CARD_W + 2 * m]);
    // Decks lying on the table too, but not those in the sidebar nor a pile in the Hand.
    expect(bar(onMap, deckStack(onMap, 'quest')!)).toContain('focus');
    expect(bar(onMap, deckStack(onMap, 'lost-pages')!)).not.toContain('focus');
    const aside = apply(t, (t) => toTray(t, s.id, 'all'));
    expect(bar(aside, aside.stacks[aside.tray![0]])).not.toContain('focus');
  });

  it('offers no content to a game without any', () => {
    const t = newGame();
    const deck = deckStack(t, 'lost-pages')!;
    expect(PILE_COMMANDS.content.icon).toBe('📖');
    expect(commandLabel(PILE_COMMANDS.content, context(t, deck))).toBe('Rules');
    setGameUI({ ...grimmWorldUI, content: undefined });
    try {
      expect(bar(t, deck)).not.toContain('content');
      expect(PILE_COMMANDS.content.icon).toBe('');
    } finally {
      setGameUI(grimmWorldUI);
    }
  });

  it('changes the table through the store', () => {
    const [t, s] = withLooseCard();
    resetTable(t);
    PILE_COMMANDS.flip.run(context(t, s));
    expect(getTable()!.stacks[s.id].cards[0].faceUp).toBe(false);
    // Drawn where the app says, or not at all when the cards can't go on the table.
    const deck = deckStack(t, 'lost-pages')!;
    PILE_COMMANDS.draw.run(
      context(t, deck, { app: app({ dropAt: () => null }) }),
    );
    expect(getTable()!.stacks[deck.id].cards).toHaveLength(deck.cards.length);
  });

  it('does something with every command the bar offers: changes the table or asks the app', () => {
    const [one, card] = withLooseCard();
    // Another card in front of it, for Front to bring it there.
    const [loose] = drop(one, cardsOf('lost-pages', 2).slice(1), 3600, 3000);
    const aside = apply(loose, (t) => toTray(t, card.id, 'all'));
    const fresh = newGame();
    const cases: [Table, Stack][] = [
      [fresh, deckStack(fresh, 'lost-pages')!],
      [fresh, placeStack(fresh, 'used')!],
      [loose, card],
      [aside, aside.stacks[aside.tray![0]]],
    ];
    const done = new Set<string>();
    for (const [t, s] of cases)
      for (const cmd of offered(grimmWorldUI.pileCommands, context(t, s))) {
        resetTable(t);
        const c = context(t, s);
        cmd.run(c);
        const asked = Object.values(c.app).some(
          (f) => vi.isMockFunction(f) && f.mock.calls.length,
        );
        expect(asked || getTable() !== t, cmd.id).toBe(true);
        done.add(cmd.id);
      }
    expect([...done].sort()).toEqual(
      grimmWorldUI.pileCommands.map((c) => c.id).sort(),
    );
  });

  it('removes a selected figure', () => {
    const t: Table = {
      ...newGame(),
      tokens: [{ id: 'f1', shape: 'cube', color: 'red', x: 0, y: 0 }],
    };
    resetTable(t);
    FIGURE_COMMANDS.remove.run({ table: t, token: t.tokens[0] });
    expect(getTable()!.tokens).toEqual([]);
  });
});
