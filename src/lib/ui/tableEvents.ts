// What any game makes of the generic events of `TableView` (a tap selects, a double tap turns the top card over, a long
// press shows it, a drop puts the cards where `dropDestination()` says): the defaults the app shell (`GameApp`) hands
// the table, which a game's layer may replace one by one (`GameLayer.events`).

import * as A from '../engine/actions';
import { game } from '../engine/game';
import { update } from '../engine/store';
import type { CardDef, CardRef, DeckKind, Table } from '../engine/types';
import { content } from './content';
import { gameUI } from './gameUI';
import type { Selection, TableControl, TableDrop, Zone } from './Table';
import type { Target } from './tableGestures';
import type { Dialog } from './useDialogs';

/** The props of `TableView` that say what the game makes of what is done on the table. */
export interface TableEvents {
  /** A tap picks a target ("Put under…" waits for one). */
  picking: boolean;
  /** Shown instead of the table, its `faded` piles faded (null: the table). */
  preview: { table: Table; faded: string[] } | null;
  onTap: (target: Target) => void;
  onDoubleTap: (target: Target) => void;
  onLongPress: (target: Target) => void;
  onZoneHover: (
    zone: Zone | null,
    drag: { stackId: string; whole: boolean } | null,
  ) => void;
  onDrop: (drop: TableDrop) => void;
  /** The buttons drawn on the table shown. */
  controls: (shown: Table) => TableControl[];
  onAreaInfo: (areaId: string) => void;
}

/** What the default events need of the app. */
export interface TableEventsApp {
  table: Table | null;
  defs: Record<string, CardDef>;
  /** "Put under…" waits for its target: a tap on a pile picks it. */
  picking: boolean;
  /** Select a pile or a figure (null: nothing), leaving "Put under…". */
  select: (s: Selection) => void;
  inspect: (card: CardRef) => void;
  setDialog: (dialog: Dialog) => void;
  putUnderTarget: (targetId: string) => void;
  notify: (text: string, ok?: boolean) => void;
  /** Open the game's content (`GameUI.content`) at a section. */
  openContent: (section?: string | null) => void;
  hoverZone: (zone: Zone | null, cardIds: string[], from?: DeckKind) => void;
  dropOnZone: (zone: Zone, stackId: string, whole: boolean) => void;
}

/** The table's events as any game has them. */
export function tableEvents(g: TableEventsApp): TableEvents {
  const { table, defs } = g;

  function onTap(target: Target) {
    if (target.kind === 'bg') return g.select(null);
    if (target.kind === 'token')
      return g.select({ kind: 'token', id: target.id });
    if (target.kind !== 'stack' || !table) return;
    if (g.picking) return g.putUnderTarget(target.id);
    g.select({ kind: 'stack', id: target.id });
  }

  /** A double tap turns the top card over (unless its place keeps it as it lies: `flipTop()` leaves it). */
  function onDoubleTap(target: Target) {
    if (target.kind !== 'stack' || !table) return;
    update((t) => A.flipTop(t, target.id));
  }

  /** A long press shows the top card. */
  function onLongPress(target: Target) {
    if (target.kind !== 'stack' || !table) return;
    const top = table.stacks[target.id]?.cards.at(-1);
    if (top) g.inspect(top);
  }

  /** The cards dragged over a zone outside the table light it up, and the sidebar decks they would go back to. */
  function onZoneHover(
    zone: Zone | null,
    drag: { stackId: string; whole: boolean } | null,
  ) {
    const s = drag && table?.stacks[drag.stackId];
    if (!drag || !s) return g.hoverZone(zone, []);
    // A card taken off a deck doesn't go back to the sidebar (it is refused), so no deck lights up; but one taken off a
    // deck built during play does, to the deck it came from.
    const cards =
      s.deck && !game().returnsCards(s.deck)
        ? []
        : drag.whole
          ? s.cards
          : A.pinnedOnTop(s)
            ? []
            : s.cards.slice(-1);
    g.hoverZone(
      zone,
      cards.map((c) => c.id),
      s.deck,
    );
  }

  function onDrop(drop: TableDrop) {
    if (!table) return;
    if (drop.kind === 'token')
      return update((t) => A.moveToken(t, drop.id, drop.x, drop.y));
    if (drop.kind === 'area')
      return update((t) => A.moveArea(t, drop.id, drop.x, drop.y));
    if (drop.kind === 'zone')
      return g.dropOnZone(drop.zone, drop.stackId, drop.whole);
    const { stackId, whole, dest } = drop;
    // Under a card the player picks (`GameDefinition.pickedPile`): the game's picker.
    if ('pick' in dest) {
      const top = table.stacks[stackId]?.cards.at(-1);
      return g.setDialog({
        kind: 'pick',
        stackId,
        cardIds: whole ? undefined : top && [top.id],
      });
    }
    if (dest.refused) return g.notify(gameUI().refusalText(dest.refused));
    const onto = dest.onto;
    // Put back where it came from (a card dropped back on its deck).
    if (onto === stackId) return;
    update((t) => A.dropOnTable(t, stackId, whole, dest, defs));
    const source = table.stacks[stackId];
    if (!onto && !A.isFixed(source) && (whole || source.cards.length === 1))
      g.select({ kind: 'stack', id: stackId });
    else if (onto) g.select({ kind: 'stack', id: onto });
  }

  return {
    picking: g.picking,
    preview: null,
    onTap,
    onDoubleTap,
    onLongPress,
    onZoneHover,
    onDrop,
    controls: () => [],
    onAreaInfo: (areaId) => g.openContent(content()?.areaSection(areaId)),
  };
}
