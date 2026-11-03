// Grimm World's storybook: its two fixed places, revealing its cards, putting cards under its chapters, and its
// progress.

import { refusal } from './areas';
import { family } from './cards';
import { DECK_SPECS, storySlot } from './decks';
import { addStack, notHeldBy, setStack, takeCards } from './lib/engine/actions';
import { areaForCard, spotsOf } from './lib/engine/areas';
import { spotPlace } from './lib/engine/arrangement';
import type { SlotSpec } from './lib/engine/game';
import { CARD_H, CARD_W } from './lib/engine/geometry';
import type { At, CardDef, StorySlot, Table } from './lib/engine/types';

// ---------- storybook ----------

/** The storybook's two fixed places: the face-down deck (`story`) and its revealed cards (`story-revealed`). */
export const STORY_SLOT_SPECS: Record<StorySlot, SlotSpec> = {
  story: {
    gives: () => false,
    // Its cards move between its chapters only (`putUnderChapter`, the chapter picker).
    sealed: true,
    empty: 'The story is over',
  },
  'story-revealed': {
    // Only a revealed card that isn't a storybook card leaves the storybook (a Y-card, for the Encounter Bar).
    gives: (top) => top?.type !== 'storybook',
    refusal: 'Put cards under the storybook itself (the right-hand card)',
    empty: 'Tap the storybook to turn over its next card',
  },
};

/**
 * Turn over the top card of the storybook onto the revealed pile. A sub-chapter card (Y-card) on top isn't turned over:
 * it goes unseen into the Encounter Bar, first in its row (rulebook 9.1.2, step 4: the Y-cards on top of the storybook go
 * into the Encounter Bar until the next Chapter Card is visible).
 */
export function revealStory(t: Table, defs: Record<string, CardDef>): Table {
  const deck = storySlot(t, 'story');
  const shown = storySlot(t, 'story-revealed');
  const top = deck?.cards.at(-1);
  if (!deck || !shown || !top) return t;
  const t2 = setStack(t, { ...deck, cards: deck.cards.slice(0, -1) });
  const bar = storyToBar(t, defs);
  if (bar) return addStack(t2, bar.at, [{ ...top, faceUp: false }])[0];
  return setStack(t2, {
    ...shown,
    cards: [...shown.cards, { ...top, faceUp: true }],
  });
}

/**
 * Where the storybook's top card goes in the Encounter Bar when revealed (and where it is drawn meanwhile), if it is a
 * card for the bar (a Y-card).
 */
export function storyToBar(
  t: Table,
  defs: Record<string, CardDef>,
): { x: number; y: number; at: At } | null {
  const top = storySlot(t, 'story')?.cards.at(-1);
  const spot = spotsOf(t).find((s) => s.id === 'bar');
  if (!top || !spot || family(defs[top.id]) !== spot.accepts.family)
    return null;
  const p = spotPlace(t, spot, null, -Infinity, -Infinity);
  return p && { x: p.x, y: p.y, at: { spot: spot.id, index: p.index } };
}

/** Put the top revealed card back on top of the storybook, face down. */
export function unrevealStory(t: Table): Table {
  const deck = storySlot(t, 'story');
  const shown = storySlot(t, 'story-revealed');
  const top = shown?.cards.at(-1);
  if (!deck || !shown || !top) return t;
  const t2 = setStack(t, { ...shown, cards: shown.cards.slice(0, -1) });
  return setStack(t2, {
    ...deck,
    cards: [...deck.cards, { ...top, faceUp: false }],
  });
}

/**
 * Put a table pile, or cards picked out of any pile, into the storybook directly under the Storybook card `name`
 * ("Chapter 3", "Epilogue"), face down, so they come up right after it. If that card was already revealed, the cards
 * go on top and come up next.
 */
export function putUnderChapter(
  t: Table,
  stackId: string,
  name: string,
  defs: Record<string, CardDef>,
  cardIds?: string[],
): Table {
  const s = t.stacks[stackId];
  // Cards of the storybook itself (picked in the Browse panel) move to another chapter.
  if (
    !s ||
    (s.slot === 'story' && !cardIds) ||
    !storySlot(t, 'story') ||
    notHeldBy(t, stackId, 'storybook', defs, cardIds).length
  )
    return t;
  const [t2, taken] = takeCards(t, stackId, cardIds);
  const deck = storySlot(t2, 'story')!;
  const cards = taken.map((c) => ({ ...c, faceUp: false }));
  const at = deck.cards.findIndex((c) => defs[c.id]?.name === name);
  const next =
    at < 0
      ? [...deck.cards, ...cards]
      : [...deck.cards.slice(0, at), ...cards, ...deck.cards.slice(at)];
  return setStack(t2, { ...deck, cards: next });
}

/** Names of the Storybook cards already turned over, and the current one (the last turned over). */
export function storyProgress(
  t: Table,
  defs: Record<string, CardDef>,
): { revealed: Set<string>; current: string | null } {
  const names = (storySlot(t, 'story-revealed')?.cards ?? [])
    .map((c) => defs[c.id])
    .filter((d) => d?.type === 'storybook' && d.name)
    .map((d) => d.name!);
  return { revealed: new Set(names), current: names.at(-1) ?? null };
}

/** Whether a table point lies on the face-down storybook. */
function storyAt(t: Table, x: number, y: number): boolean {
  const s = storySlot(t, 'story');
  return !!s && x >= s.x && x <= s.x + CARD_W && y >= s.y && y <= s.y + CARD_H;
}

/**
 * Whether cards dropped with their top-left corner at (x, y) go into the face-down storybook (the drop then asks under
 * which chapter): the storybook may hold them all, and they are dropped on it, or anywhere in the Storybook area that
 * doesn't take them as loose cards (Y-cards). Others, like an Encounter Card for its place, land as usual.
 */
export function intoStory(
  t: Table,
  cardIds: string[],
  defs: Record<string, CardDef>,
  x: number,
  y: number,
): boolean {
  if (
    !cardIds.length ||
    !cardIds.every((id) => defs[id] && DECK_SPECS.storybook.holds(defs[id]))
  )
    return false;
  if (storyAt(t, x + CARD_W / 2, y + CARD_H / 2)) return true;
  const area = areaForCard(t, x, y);
  return area?.id === 'storybook' && !!refusal(area, cardIds, defs);
}
