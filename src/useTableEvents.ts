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
import { storySlot } from './decks';
import { allAreas, gridCells, gridOf, placeStack } from './lib/engine/areas';
import { facedSpot } from './lib/engine/facing';
import { deckStack } from './lib/engine/decks';
import { CARD_H, CARD_W } from './lib/engine/geometry';
import { update } from './lib/engine/store';
import type { Table } from './lib/engine/types';
import type { GameAppContext } from './lib/ui/GameApp';
import type { TableControl } from './lib/ui/Table';
import type { TableEvents } from './lib/ui/tableEvents';
import type { Target } from './lib/ui/tableGestures';
import { revealStory, storyToBar, unrevealStory } from './storybook';

// The game layer of the table: what Grimm World makes of the generic events of `TableView` beyond what any game makes
// of them (`tableEvents()` in src/lib/ui/): the storybook's taps, why a card isn't turned over, the battlefield typed
// shown instead of the table, and the buttons it draws on the table.

/** What the table's events need of the app (`GameAppContext`) and of the Battlefield bar. */
export interface TableGame {
  app: GameAppContext;
  /** The table with the battlefield being typed laid out, shown instead (null: none is typed). */
  battlePreview: Table | null;
  typeBattlefield: () => void;
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
export function useTableEvents({
  app: g,
  battlePreview,
  typeBattlefield,
}: TableGame): Partial<TableEvents> {
  const { table, defs } = g;

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

  /** A tap on a storybook place (`Stack.slot`) turns its card over or back; any other, as in any game. */
  function onTap(target: Target) {
    const slot =
      target.kind === 'stack' && !g.putUnder && table?.stacks[target.id]?.slot;
    if (slot) return tapStory(slot);
    g.events.onTap(target);
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
    g.events.onDoubleTap(target);
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
          run: typeBattlefield,
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
          run: typeBattlefield,
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

  return { preview, onTap, onDoubleTap, controls };
}
