import { describe, expect, it, vi } from 'vitest';
import { addToken } from '../engine/actions';
import { placement } from '../engine/areas';
import { getTable, resetTable } from '../engine/store';
import type { Table } from '../engine/types';
import { cardsOf, defs, drop, newGame, pileOf, say } from '../../test/play';
import { type TableEventsApp, tableEvents } from './tableEvents';

/** The app, doing nothing but what a test asks of it. */
const app = (table: Table, over: Partial<TableEventsApp> = {}) => ({
  table,
  defs,
  picking: false,
  select: vi.fn(),
  inspect: vi.fn(),
  setDialog: vi.fn(),
  putUnderTarget: vi.fn(),
  notify: vi.fn(),
  openContent: vi.fn(),
  hoverZone: vi.fn(),
  dropOnZone: vi.fn(),
  ...over,
});

/** A new game with one Lost Pages card lying loose on the table, in the store. */
function withLooseCard(): [Table, string] {
  const [y] = cardsOf('lost-pages', 1);
  const [t] = drop(newGame(), [y], 3000, 3000);
  resetTable(t);
  return [t, pileOf(t, y)];
}

describe('the default table events', () => {
  it('select what is tapped, or pick it as the target of "Put under…"', () => {
    const [t, pile] = withLooseCard();
    const a = app(t);
    tableEvents(a).onTap({ kind: 'stack', id: pile, whole: false });
    expect(a.select).toHaveBeenCalledWith({
      kind: 'stack',
      id: pile,
    });
    tableEvents(a).onTap({ kind: 'bg' });
    expect(a.select).toHaveBeenLastCalledWith(null);
    const picking = app(t, { picking: true });
    tableEvents(picking).onTap({ kind: 'stack', id: pile, whole: false });
    expect(picking.putUnderTarget).toHaveBeenCalledWith(pile);
    expect(picking.select).not.toHaveBeenCalled();
  });

  it('turn the top card over on a double tap, and show it on a long press', () => {
    const [t, pile] = withLooseCard();
    const a = app(t);
    const was = t.stacks[pile].cards[0].faceUp;
    tableEvents(a).onDoubleTap({ kind: 'stack', id: pile, whole: false });
    expect(getTable()!.stacks[pile].cards[0].faceUp).toBe(!was);
    tableEvents(a).onLongPress({ kind: 'stack', id: pile, whole: false });
    expect(a.inspect).toHaveBeenCalledWith(t.stacks[pile].cards[0]);
  });

  it("open the game's picker for cards dropped where the player picks, and tell a refusal", () => {
    const [t, pile] = withLooseCard();
    const a = app(t);
    const events = tableEvents(a);
    events.onDrop({
      kind: 'table',
      stackId: pile,
      whole: false,
      dest: { pick: 'story' },
    });
    expect(a.setDialog).toHaveBeenCalledWith({
      kind: 'pick',
      stackId: pile,
      cardIds: [t.stacks[pile].cards[0].id],
    });
    events.onDrop({
      kind: 'table',
      stackId: pile,
      whole: true,
      dest: {
        at: { x: 0, y: 0 },
        x: 0,
        y: 0,
        onto: null,
        area: null,
        spot: null,
        refused: { code: 'deck-to-deck' },
      },
    });
    expect(a.notify).toHaveBeenCalledWith(say({ code: 'deck-to-deck' }));
    expect(getTable()).toBe(t);
  });

  it('select a figure, light up the zones and decks dragged over, and pass on the drops of figures, areas and zones', () => {
    const [t, pile] = withLooseCard();
    const a = app(t);
    const events = tableEvents(a);
    events.onTap({ kind: 'token', id: 'k1' });
    expect(a.select).toHaveBeenLastCalledWith({ kind: 'token', id: 'k1' });
    const card = t.stacks[pile].cards[0].id;
    events.onZoneHover(
      { kind: 'tray', before: null },
      { stackId: pile, whole: false },
    );
    expect(a.hoverZone).toHaveBeenLastCalledWith(
      { kind: 'tray', before: null },
      [card],
      undefined,
    );
    events.onZoneHover(null, null);
    expect(a.hoverZone).toHaveBeenLastCalledWith(null, []);
    // A card taken off a sidebar deck goes back to none.
    const deck = t.dock![0];
    events.onZoneHover(
      { kind: 'tray', before: null },
      { stackId: deck, whole: true },
    );
    expect(a.hoverZone).toHaveBeenLastCalledWith(
      { kind: 'tray', before: null },
      [],
      t.stacks[deck].deck,
    );
    events.onDrop({
      kind: 'zone',
      zone: { kind: 'tray', before: null },
      stackId: pile,
      whole: true,
    });
    expect(a.dropOnZone).toHaveBeenCalledWith(
      { kind: 'tray', before: null },
      pile,
      true,
    );
    events.onAreaInfo('map');
    expect(a.openContent).toHaveBeenCalled();
    expect(events.controls(t)).toEqual([]);
  });

  it('put a pile dropped on the table where it goes, and select it', () => {
    const [t, pile] = withLooseCard();
    const a = app(t);
    const s = t.stacks[pile];
    tableEvents(a).onDrop({
      kind: 'table',
      stackId: pile,
      whole: true,
      dest: {
        at: { x: s.x + 600, y: s.y },
        x: s.x + 600,
        y: s.y,
        onto: null,
        area: null,
        spot: null,
        refused: null,
      },
    });
    expect(getTable()!.stacks[pile].at).toEqual({ x: s.x + 600, y: s.y });
    expect(a.select).toHaveBeenLastCalledWith({ kind: 'stack', id: pile });
  });

  it('move a figure dropped, an area dropped by its tab, and select the pile cards go onto', () => {
    const [t0, pile] = withLooseCard();
    const t = addToken(t0, 100, 100, '#fff', 'pawn');
    resetTable(t);
    const a = app(t);
    const events = tableEvents(a);
    const token = t.tokens[0].id;
    events.onDrop({ kind: 'token', id: token, x: 500, y: 600 });
    expect(getTable()!.tokens[0]).toMatchObject({ x: 500, y: 600 });
    events.onDrop({ kind: 'area', id: 'map', x: 9000, y: 9000 });
    expect(getTable()!.anchors?.map).toBeDefined();
    const [y2] = cardsOf('lost-pages', 2).slice(1);
    const [t2] = drop(getTable()!, [y2], 6000, 6000);
    resetTable(t2);
    const other = pileOf(t2, y2);
    const b = app(t2);
    tableEvents(b).onDrop({
      kind: 'table',
      stackId: other,
      whole: true,
      dest: { ...placement(t2, [y2], defs, 0, 0, pile) },
    });
    expect(b.select).toHaveBeenLastCalledWith({ kind: 'stack', id: pile });
  });
});
