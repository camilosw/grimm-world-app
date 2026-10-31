import { useCallback, useState, type RefObject } from 'react';
import * as A from './actions';
import { areaForCard, looseAt, placement } from './areas';
import { CARD_H, CARD_W } from './cards';
import {
  DECK_SPECS,
  homeDeck,
  returnsCards,
  storySlot,
  type DeckKind,
} from './decks';
import { update } from './store';
import type { Incoming, Selection, Zone } from './Table';
import type { At, CardDef, CardRef, Table, View } from './types';
import type { Dialog, PutUnder } from './useDialogs';

// Where cards go when they are put on the table or dropped on it, on the sidebars and from the Browse panel: the
// pure rules, and `useDropRouting` for the hover state and the drops that need the app's state.

/** What drop routing needs of the app: its state and the helpers it uses. */
export interface DropGame {
  table: Table | null;
  defs: Record<string, CardDef>;
  /** The table's area on the screen: where the table lies, to turn screen points into table ones. */
  areaRef: RefObject<HTMLDivElement | null>;
  view: View;
  notify: (text: string, ok?: boolean) => void;
  setDialog: (dialog: Dialog) => void;
  putUnder: PutUnder | null;
  setPutUnder: (putUnder: PutUnder | null) => void;
  setSelection: (selection: Selection) => void;
  /** Open (true) or minimize the Hand. */
  setTrayOpen: (open: boolean) => void;
}

const sameZone = (a: Zone | null, b: Zone | null) =>
  JSON.stringify(a) === JSON.stringify(b);

const DECKS_IN_SIDEBAR = (t: Table) => (t.dock ?? []).map((id) => t.stacks[id]);

/** Drop zone (sidebar deck, sidebar, the Hand) under a screen point. */
export function zoneAt(
  table: Table | null,
  clientX: number,
  clientY: number,
): Zone | null {
  const el = document.elementFromPoint(clientX, clientY);
  const pile = el?.closest<HTMLElement>('[data-tray-pile]');
  if (pile) {
    // Before the set-aside pile dropped on, or after it when dropped on its lower half.
    const id = pile.dataset.trayPile!;
    const r = pile.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return { kind: 'tray', before: id };
    const tray = table?.tray ?? [];
    return { kind: 'tray', before: tray[tray.indexOf(id) + 1] ?? null };
  }
  if (el?.closest('[data-tray]')) return { kind: 'tray', before: null };
  const deck = el?.closest<HTMLElement>('[data-deck]');
  if (deck) return { kind: 'deck', id: deck.dataset.deck! };
  if (el?.closest('[data-dock]')) return { kind: 'dock' };
  return null;
}

/** Table position for a card dropped at a screen point, or null if outside the table's area `r` on the screen. */
export function worldPoint(
  r: DOMRect | undefined,
  view: View,
  clientX: number,
  clientY: number,
) {
  if (
    !r ||
    clientX < r.left ||
    clientX > r.right ||
    clientY < r.top ||
    clientY > r.bottom
  )
    return null;
  return {
    x: (clientX - r.left - view.x) / view.scale - CARD_W / 2,
    y: (clientY - r.top - view.y) / view.scale - CARD_H / 2,
  };
}

/**
 * Where the given cards go when put on the table near the point (cx, cy), the top-left corner of a card: a free spot,
 * outside the areas if possible, else in an area that takes them. `at` is null, with the reason, when they can't go
 * on the table.
 */
export function freeDropAt(
  table: Table,
  defs: Record<string, CardDef>,
  cardIds: string[],
  cx: number,
  cy: number,
): { at: At | null; refused?: string } {
  // Cards with a place of their own (Character, Alignment, Money Cards) always go there. Dropped in a table deck's
  // area they would go into that deck instead: none is put there on its own.
  const centered = placement(table, cardIds, defs, cx, cy, null);
  const own = centered.area?.deck
    ? placement(table, cardIds, defs, -Infinity, -Infinity, null)
    : centered;
  if (own.spot?.attracts)
    return own.refused ? { at: null, refused: own.refused } : { at: own.at };
  const stacks = table.z.map((id) => table.stacks[id]);
  const free = (x: number, y: number) =>
    !stacks.some(
      (s) => Math.abs(s.x - x) < CARD_W + 10 && Math.abs(s.y - y) < CARD_H + 10,
    );
  // Try spots on a half-card grid, nearest to the screen center first.
  const spots: { x: number; y: number; d: number }[] = [];
  for (let i = -12; i <= 12; i++) {
    for (let j = -8; j <= 8; j++)
      spots.push({
        x: cx + (i * CARD_W) / 2,
        y: cy + (j * CARD_H) / 2,
        d: Math.hypot(i * CARD_W, j * CARD_H),
      });
  }
  spots.sort((a, b) => a.d - b.d);
  const outside = spots.find(
    (p) => free(p.x, p.y) && !areaForCard(table, p.x, p.y),
  );
  if (outside) return { at: { x: outside.x, y: outside.y } };
  const allowed = spots
    .map((p) => placement(table, cardIds, defs, p.x, p.y, null))
    .find((p) => free(p.x, p.y) && !p.refused);
  return { at: allowed?.at ?? looseAt(table, cx, cy) };
}

/** Names of the decks these cards (taken off the deck `from` if any) go back to, e.g. "Lost Pages". */
export function homeNames(
  table: Table,
  defs: Record<string, CardDef>,
  cards: CardRef[],
  from?: DeckKind,
) {
  const kinds = [
    ...new Set(
      cards
        .map((c) => defs[c.id] && homeDeck(table, defs[c.id], from))
        .filter(Boolean),
    ),
  ];
  return kinds.map((k) => DECK_SPECS[k!].label).join(', ');
}

/** Whether cards dropped with their top-left corner at `at` go into the face-down storybook (`intoStory`). */
const onStory = (
  table: Table | null,
  defs: Record<string, CardDef>,
  at: { x: number; y: number },
  cardIds: string[],
) => !!table && A.intoStory(table, cardIds, defs, at.x, at.y);

/** The drop zones and drops from outside the table, with the state that lights up where cards would land. */
export function useDropRouting(g: DropGame) {
  const { table, defs, areaRef, view, notify } = g;
  const [zoneHover, setZoneHover] = useState<Zone | null>(null);
  /** Sidebar decks a dragged card would go back to. */
  const [homeHover, setHomeHover] = useState<string[]>([]);
  // Where cards dragged in from outside the table (sidebar, set-aside cards, Browse panel) would land on it.
  const [incoming, setIncoming] = useState<Incoming | null>(null);

  const zoneOf = (clientX: number, clientY: number) =>
    zoneAt(table, clientX, clientY);

  const worldAt = (clientX: number, clientY: number) =>
    worldPoint(
      areaRef.current?.getBoundingClientRect(),
      view,
      clientX,
      clientY,
    );

  /** Where the given cards go when put on the table near the middle of the screen (null, and the player is told why, when they can't go on the table). */
  const dropAt = useCallback(
    (cardIds: string[] = []): At | null => {
      const el = areaRef.current!;
      const cx = (el.clientWidth / 2 - view.x) / view.scale - CARD_W / 2;
      const cy = (el.clientHeight / 2 - view.y) / view.scale - CARD_H / 2;
      if (!table) return { x: cx, y: cy };
      const { at, refused } = freeDropAt(table, defs, cardIds, cx, cy);
      if (refused) notify(refused);
      return at;
    },
    [view, table, defs, areaRef, notify],
  );

  /** Where cards dropped at (x, y) or onto `targetId` really go, or null (and tell the player why) if they can't. */
  const placeAt = (
    cardIds: string[],
    x: number,
    y: number,
    targetId: string | null,
  ) => {
    if (!table) return null;
    const p = placement(table, cardIds, defs, x, y, targetId);
    if (p.refused) notify(p.refused);
    return p.refused ? null : p;
  };

  const onStoryAt = (at: { x: number; y: number }, cardIds: string[]) =>
    onStory(table, defs, at, cardIds);

  /**
   * Cards (by id, taken off the deck `from` if any) dragged over a drop zone (or off it: null): light it up, and the
   * sidebar decks they would go back to.
   */
  const hoverZone = (zone: Zone | null, cardIds: string[], from?: DeckKind) => {
    setZoneHover((prev) => (sameZone(prev, zone) ? prev : zone));
    if (zone && table) {
      const kinds = new Set(
        cardIds.map((id) => defs[id] && homeDeck(table, defs[id], from)),
      );
      setHomeHover(
        DECKS_IN_SIDEBAR(table)
          .filter((d) => d.deck && kinds.has(d.deck))
          .map((d) => d.id),
      );
    }
  };

  /** Cards dropped on the Hand: it opens, if minimized, to show them. */
  const setAside = (fn: (t: Table) => Table) => {
    g.setTrayOpen(true);
    update(fn);
  };

  /**
   * Cards dragged in from outside the table, held at a screen point (none: the drag left the table or ended): light up
   * where they would land on the table, as a drag on the table does.
   */
  const hoverTable = (cardIds: string[], clientX = 0, clientY = 0) => {
    const at =
      table && cardIds.length && !zoneOf(clientX, clientY)
        ? worldAt(clientX, clientY)
        : null;
    let next: Incoming | null = null;
    if (at && table && onStoryAt(at, cardIds)) {
      // They go under one of the storybook's cards (the drop asks which), as a drag on the table does.
      next = {
        area: { id: 'storybook', ok: true },
        spot: null,
        dropOn: storySlot(table, 'story')?.id ?? null,
      };
    } else if (at && table) {
      const target =
        A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)
          ?.id ?? null;
      const p = placement(table, cardIds, defs, at.x, at.y, target);
      next = {
        area: p.area ? { id: p.area.id, ok: !p.refused } : null,
        spot: p.spot?.id ?? null,
        dropOn: p.onto,
        to: { x: p.x, y: p.y },
      };
    }
    setIncoming((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  };

  /** A table pile (or its top card) was dropped on the sidebar. */
  const dropOnZone = (zone: Zone, stackId: string, whole: boolean) => {
    // Wherever it lands on the sidebar, a card goes back to its own deck; one taken off the Encounter Deck stays there.
    // One taken off a deck built during play goes back to the deck it came from (Lost Pages).
    const s = table?.stacks[stackId];
    if (!s) return;
    if (zone.kind === 'tray')
      return setAside((t) =>
        A.toTray(t, stackId, whole ? 'all' : 'top', zone.before),
      );
    if (s.deck && !returnsCards(s.deck))
      return (
        zone.kind === 'deck' &&
        notify("Cards can't move from one deck to another")
      );
    // A deck's card on top for good (Y013, Y012, Y011) keeps the cards under it.
    if (!whole && A.pinnedOnTop(s)) return;
    const moved = whole ? A.unpinned(s) : A.unpinned(s).slice(-1);
    if (!moved.length) return;
    notify(`Back to ${homeNames(table!, defs, moved, s.deck)}`, true);
    update((t) => A.stackToDecks(t, stackId, whole ? 'all' : 'top', defs));
  };

  /** Cards dragged out of the browse panel were released at a screen point (face down: picked at random, unseen). */
  const dropFromBrowse = (
    stackId: string,
    cardIds: string[],
    clientX: number,
    clientY: number,
    faceUp: boolean,
  ) => {
    const stack = table?.stacks[stackId];
    const indices = cardIds
      .map((id) => stack?.cards.findIndex((c) => c.id === id) ?? -1)
      .filter((i) => i >= 0);
    if (!table || !indices.length) return;
    const zone = zoneOf(clientX, clientY);
    if (zone?.kind === 'tray')
      return setAside((t) =>
        A.toTray(t, stackId, cardIds, zone.before, faceUp),
      );
    if (zone) {
      if (!stack?.deck || returnsCards(stack.deck)) {
        notify(
          `Back to ${homeNames(
            table,
            defs,
            cardIds.map((id) => ({ id, faceUp: true })),
            stack?.deck,
          )}`,
          true,
        );
        return update((t) => A.cardsToDecks(t, stackId, indices, defs));
      }
      if (zone.kind === 'deck' && zone.id !== stackId)
        notify("Cards can't move from one deck to another");
      return;
    }
    const at = worldAt(clientX, clientY);
    if (!at) return;
    if (onStoryAt(at, cardIds))
      return g.setDialog({ kind: 'chapter', stackId, cardIds });
    const target =
      A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ??
      null;
    const p = placeAt(cardIds, at.x, at.y, target);
    if (p)
      update((t) =>
        A.playCards(t, stackId, indices, p.at, p.onto, defs, faceUp),
      );
  };

  /** Tell the player which card a deck refuses, if any; true when they may all go in. */
  const heldBy = (
    stackId: string,
    kind: DeckKind,
    label: string,
    cardIds?: string[],
  ) => {
    if (!table) return false;
    const refused = A.notHeldBy(table, stackId, kind, defs, cardIds);
    if (refused.length)
      notify(
        `${refused[0].code ?? refused[0].name ?? 'This card'} can't go into the ${label}`,
      );
    return !refused.length;
  };

  /** Put the cards waiting in "Put under…" mode under a table pile or a deck. */
  const putUnderTarget = (targetId: string) => {
    const source = g.putUnder;
    g.setPutUnder(null);
    if (!table || !source) return;
    const { stackId: sourceId, cardIds, faceUp = true } = source;
    const target = table.stacks[targetId];
    // Cards picked out of the storybook may go under another of its chapters.
    if (sourceId === targetId && !(target.slot === 'story' && cardIds)) return;
    if (target.slot === 'story-revealed')
      return notify(
        'Put cards under the storybook itself (the right-hand card)',
      );
    if (target.slot === 'story') {
      if (heldBy(sourceId, 'storybook', 'Storybook', cardIds))
        g.setDialog({ kind: 'chapter', stackId: sourceId, cardIds });
      return;
    }
    if (target.deck) {
      if (
        !heldBy(sourceId, target.deck, DECK_SPECS[target.deck].label, cardIds)
      )
        return;
      update((t) => A.putUnderDeck(t, sourceId, targetId, defs, cardIds));
    } else if (A.inTray(table, targetId)) {
      // Set aside, the pile belongs to no area.
      update((t) =>
        cardIds
          ? A.putUnderPile(t, sourceId, cardIds, targetId, faceUp)
          : A.mergeStacks(t, sourceId, targetId, 'bottom'),
      );
    } else {
      const cards = cardIds ?? table.stacks[sourceId].cards.map((c) => c.id);
      const p = placeAt(cards, target.x, target.y, targetId);
      if (!p) return;
      if (p.onto !== targetId)
        return notify(`The ${p.spot?.label ?? 'card'} stays on its place`);
      update((t) =>
        cardIds
          ? A.putUnderPile(t, sourceId, cardIds, targetId, faceUp)
          : A.mergeStacks(t, sourceId, targetId, 'bottom'),
      );
    }
    g.setSelection({ kind: 'stack', id: targetId });
  };

  /** The top card of a sidebar deck was released at a screen point. */
  const dropFromDeck = (deckId: string, clientX: number, clientY: number) => {
    const zone = zoneOf(clientX, clientY);
    if (zone?.kind === 'tray')
      return setAside((t) => A.toTray(t, deckId, 'top', zone.before));
    if (zone?.kind === 'deck' && zone.id !== deckId)
      return notify("Cards can't move from one deck to another");
    if (zone) return;
    const at = worldAt(clientX, clientY);
    const card = table?.stacks[deckId]?.cards.at(-1);
    if (!at || !table || !card) return;
    if (onStoryAt(at, [card.id]))
      return g.setDialog({
        kind: 'chapter',
        stackId: deckId,
        cardIds: [card.id],
      });
    const target =
      A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ??
      null;
    const p = placeAt([card.id], at.x, at.y, target);
    if (!p) return;
    update((t) => {
      const [t2, newId] = A.takeTop(t, deckId, p.at);
      return newId && p.onto ? A.dropOnto(t2, newId, p.onto, defs) : t2;
    });
  };

  /** A set-aside pile was dragged out of the right sidebar and released at a screen point. */
  const dropFromTray = (stackId: string, clientX: number, clientY: number) => {
    const s = table?.stacks[stackId];
    if (!table || !s) return;
    const zone = zoneOf(clientX, clientY);
    if (zone?.kind === 'tray')
      return update((t) => A.toTray(t, stackId, 'all', zone.before));
    if (zone) {
      notify(`Back to ${homeNames(table, defs, s.cards)}`, true);
      return update((t) => A.stackToDecks(t, stackId, 'all', defs));
    }
    const at = worldAt(clientX, clientY);
    if (!at) return;
    const cardIds = s.cards.map((c) => c.id);
    if (onStoryAt(at, cardIds))
      return g.setDialog({ kind: 'chapter', stackId });
    const target =
      A.stackTargetAt(table, at.x + CARD_W / 2, at.y + CARD_H / 2, null)?.id ??
      null;
    const p = placeAt(cardIds, at.x, at.y, target);
    if (!p) return;
    update((t) => {
      const t2 = A.fromTray(t, stackId, p.at);
      return p.onto ? A.dropOnto(t2, stackId, p.onto, defs) : t2;
    });
  };

  return {
    zoneAt: zoneOf,
    zoneHover,
    homeHover,
    incoming,
    dropAt,
    hoverZone,
    hoverTable,
    putUnderTarget,
    dropOnZone,
    dropFromBrowse,
    dropFromDeck,
    dropFromTray,
    homeNamesOf: (cards: CardRef[], from?: DeckKind) =>
      table ? homeNames(table, defs, cards, from) : '',
  };
}
