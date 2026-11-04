import { useMemo } from 'react';
import * as A from './lib/engine/actions';
import {
  battlefieldInUse,
  BROWSE_DECKS,
  deckPlace,
  ENCOUNTER_PLACES,
  encounterPlace,
  gridFaceUp,
  PLACE_BUTTON,
} from './areas';
import { clearBattlefield } from './battlefield';
import { type DeckKind, returnsCards, storySlot } from './decks';
import { allAreas, gridCells, gridOf, placeStack } from './lib/engine/areas';
import { facedSpot } from './lib/engine/facing';
import { deckStack } from './lib/engine/decks';
import { CARD_H, CARD_W } from './lib/engine/geometry';
import { update } from './lib/engine/store';
import type { CardDef, CardRef, Table } from './lib/engine/types';
import { content } from './lib/ui/content';
import { gameUI } from './lib/ui/gameUI';
import type { Selection, TableControl, TableDrop, Zone } from './lib/ui/Table';
import type { Target } from './lib/ui/tableGestures';
import { revealStory, storyToBar, unrevealStory } from './storybook';

// The game layer of the table: what Grimm World makes of the generic events of `TableView` (a tap, a drop…) and the
// buttons it draws on the table.

/** What the table's events need of the app: its state and the helpers they use. */
export interface TableGame {
  table: Table | null;
  defs: Record<string, CardDef>;
  /** "Put under…" waits for its target: a tap on a pile picks it. */
  picking: boolean;
  /** The pile shown in the Browse panel. */
  browseId: string | null;
  /** The table with the battlefield being typed laid out, shown instead (null: none is typed). */
  battlePreview: Table | null;
  /** Select a pile or a figure (null: nothing), leaving "Put under…". */
  select: (s: Selection) => void;
  /** Show a pile in the Browse panel (null: close it). */
  browse: (stackId: string | null) => void;
  inspect: (card: CardRef) => void;
  /** Open the chapter picker for cards of a pile (all its cards, if none given) going into the storybook. */
  pickChapter: (stackId: string, cardIds?: string[]) => void;
  putUnderTarget: (targetId: string) => void;
  notify: (text: string, ok?: boolean) => void;
  shuffle: (stackId: string) => void;
  /** Show a card just dealt travelling there from `from`. */
  deal: (cardId: string, from: { x: number; y: number }) => void;
  typeBattlefield: () => void;
  /** Open the rules (`GameUI.content`) at a section. */
  openContent: (section?: string | null) => void;
  hoverZone: (zone: Zone | null, cardIds: string[], from?: DeckKind) => void;
  dropOnZone: (zone: Zone, stackId: string, whole: boolean) => void;
}

/** A button's box below a card place at (x, y). */
const belowPlace = (at: { x: number; y: number }) => ({
  box: {
    x: at.x,
    y: at.y + CARD_H + PLACE_BUTTON.gap,
    w: CARD_W,
    h: PLACE_BUTTON.h,
  },
});

/** The props of `TableView` that say what the game makes of what is done on the table. */
export function useTableEvents(g: TableGame) {
  const { table, defs, battlePreview } = g;

  // The battlefield being typed is shown with its Terrain Cards faded: they aren't on the table yet.
  const preview = useMemo(
    () =>
      battlePreview && {
        table: battlePreview,
        faded: gridCells(battlePreview, 'battlefield').map((c) => c.id),
      },
    [battlePreview],
  );

  /** A tap on the storybook turns its next card over; one on its revealed cards puts the last one back. */
  function tapStory(slot: 'story' | 'story-revealed') {
    if (!table) return;
    const story = storySlot(table, 'story');
    const top = story?.cards.at(-1);
    if (slot === 'story' && story && top && storyToBar(table, defs)) {
      g.notify('Sub-chapter card placed in the Encounter Bar', true);
      g.deal(top.id, { x: story.x, y: story.y });
    }
    update((t) => (slot === 'story' ? revealStory(t, defs) : unrevealStory(t)));
  }

  function onTap(target: Target) {
    if (target.kind === 'bg') return g.select(null);
    if (target.kind === 'token')
      return g.select({ kind: 'token', id: target.id });
    if (target.kind !== 'stack' || !table) return;
    if (g.picking) return g.putUnderTarget(target.id);
    const slot = table.stacks[target.id]?.slot;
    if (slot) return tapStory(slot);
    g.select({ kind: 'stack', id: target.id });
  }

  /** A double tap turns the top card over, unless its place keeps it as it lies. */
  function onDoubleTap(target: Target) {
    if (target.kind !== 'stack' || !table) return;
    const fixed = facedSpot(table, target.id);
    if (fixed)
      return g.notify(
        `Cards on the ${fixed.label} place lie face ${fixed.facing === 'down' ? 'down' : 'up'}`,
      );
    const grid = gridOf(table, target.id);
    if (grid) return g.notify(gridFaceUp(grid));
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
      s.deck && !returnsCards(s.deck)
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
    // Into the storybook: the player picks under which chapter.
    if ('pick' in dest) {
      const top = table.stacks[stackId]?.cards.at(-1);
      return g.pickChapter(stackId, whole ? undefined : top && [top.id]);
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

  /** The buttons drawn on the table shown. */
  function controls(shown: Table): TableControl[] {
    const list: TableControl[] = [];
    for (const area of allAreas(shown)) {
      // A Shuffle button below each time card's Encounter Deck place (it stays at the bottom).
      if (area.id === 'encounter')
        for (const { place } of ENCOUNTER_PLACES) {
          const s = placeStack(shown, place);
          if (!s || !A.pinned(s)) continue;
          list.push({
            key: `shuffle-${place}`,
            label: '⤮ Shuffle',
            at: belowPlace(encounterPlace(shown, place)),
            disabled: s.cards.length - A.pinned(s) < 2,
            run: () => {
              g.shuffle(s.id);
              g.notify('Encounter Deck shuffled', true);
            },
          });
        }
      // A Browse button below the face-down storybook, to look through it and fix mistakes, and below the place of a
      // deck lying on the table (`BROWSE_DECKS`).
      const s =
        area.id === 'storybook'
          ? storySlot(shown, 'story')
          : area.deck && BROWSE_DECKS.includes(area.deck)
            ? deckStack(shown, area.deck)
            : undefined;
      if (s)
        list.push({
          key: area.deck ? `browse-${area.id}` : 'browse-story',
          label: '☰ Browse',
          at: belowPlace(area.deck ? deckPlace(shown, area.deck) : s),
          disabled: !(area.deck ? A.unpinned(s) : s.cards).length,
          on: g.browseId === s.id,
          run: () => browseDeck(s.id),
        });
      // The Battlefield's: type its layout (in its header and in its empty first place), or return its cards to their
      // decks; none while it is typed.
      if (area.id === 'battlefield' && !battlePreview) {
        list.push({
          key: 'type',
          label: '⌨ Type',
          at: { area: area.id },
          run: g.typeBattlefield,
        });
        if (battlefieldInUse(shown))
          list.push({
            key: 'clear',
            label: '↩ Return to deck',
            at: { area: area.id },
            run: () => update((t) => clearBattlefield(t, defs)),
          });
        list.push({
          key: 'type-layout',
          label: '⌨ or type the layout',
          at: { grid: 'battlefield' },
          run: g.typeBattlefield,
        });
      }
    }
    return list;
  }

  /** The Browse button of a table deck (or the storybook): browse it, or stop. */
  function browseDeck(stackId: string) {
    // The storybook is only turned over, never picked up: browsing it doesn't select it.
    g.select(
      table?.stacks[stackId]?.slot ? null : { kind: 'stack', id: stackId },
    );
    g.browse(g.browseId === stackId ? null : stackId);
  }

  return {
    picking: g.picking,
    preview,
    onTap,
    onDoubleTap,
    onLongPress,
    onZoneHover,
    onDrop,
    controls,
    onAreaInfo: (areaId: string) =>
      g.openContent(content()?.areaSection(areaId)),
  };
}
