import { DECK_SPECS, type DeckKind, homeDeck } from '../decks';
import { compareCards } from '../lib/engine/cards';
import { deckStack } from '../lib/engine/decks';
import type { At, CardDef, CardRef, Stack } from '../lib/engine/types';
import type { OldTable } from './table';

// Frozen: the pile operations the migrations of saves from before version 3 use, as they were then (actions.ts), working
// on coordinates. They must not change: a change to the app's piles that saves need is a migration of its own.

type Point = { x: number; y: number };

export function setStack(t: OldTable, s: Stack): OldTable {
  return { ...t, stacks: { ...t.stacks, [s.id]: s } };
}

function removeStack(t: OldTable, id: string): OldTable {
  const stacks = { ...t.stacks };
  delete stacks[id];
  return {
    ...t,
    stacks,
    z: t.z.filter((z) => z !== id),
    dock: t.dock?.filter((d) => d !== id),
    tray: t.tray?.filter((d) => d !== id),
  };
}

/** A deck, a storybook place, an Encounter Deck place or the Damage Card's: it stays, even when empty. */
export function isFixed(s: Stack): boolean {
  return !!s.deck || !!s.slot || !!s.place;
}

/** The decks with a card of their own on top for good, and its number. */
export const KEEPS: Partial<Record<DeckKind, string>> = {
  enemy: 'Y013',
  training: 'Y012',
  banned: 'Y011',
};

/** How many cards at the bottom of a pile never leave it: the time card on its place. */
function pinned(s: Stack): number {
  return (s.place === 'time-passes' || s.place === 'next-chapter') &&
    s.cards.length
    ? 1
    : 0;
}

/** How many cards at the top of a pile never leave it: the Damage Card on its place, a deck's own card on it. */
function pinnedOnTop(s: Stack): number {
  return (s.place === 'damage' || (!!s.deck && !!KEEPS[s.deck])) &&
    s.cards.length
    ? 1
    : 0;
}

function isPinned(s: Stack, index: number): boolean {
  return index < pinned(s) || index >= s.cards.length - pinnedOnTop(s);
}

function unpinned(s: Stack): CardRef[] {
  return s.cards.filter((_, i) => !isPinned(s, i));
}

function abovePinned(s: Stack, fn: (cards: CardRef[]) => CardRef[]): CardRef[] {
  const lo = pinned(s);
  const hi = s.cards.length - pinnedOnTop(s);
  return [
    ...s.cards.slice(0, lo),
    ...fn(s.cards.slice(lo, hi)),
    ...s.cards.slice(hi),
  ];
}

function underneath(s: Stack, cards: CardRef[]): CardRef[] {
  return abovePinned(s, (rest) => [...cards, ...rest]);
}

/**
 * Put cards on the table as a new pile (on top of everything) at `p`, its top-left corner, lying `at` (loose there,
 * unless it is a fixed place) until `settleAt()` reads where it lies.
 */
export function addStack(
  t: OldTable,
  p: Point,
  cards: CardRef[],
  extra: Partial<Stack> = {},
  at: At = { x: p.x, y: p.y },
): [OldTable, string] {
  const id = `s${t.nextId}`;
  const stack: Stack = { id, x: p.x, y: p.y, at, rot: 0, cards, ...extra };
  return [
    {
      ...t,
      nextId: t.nextId + 1,
      stacks: { ...t.stacks, [id]: stack },
      z: [...t.z, id],
    },
    id,
  ];
}

/** Replace a pile's cards: a table pile left empty disappears, a fixed one stays. Remembers where deck cards came from. */
function withCards(t: OldTable, s: Stack, cards: CardRef[]): OldTable {
  let next = t;
  if (s.deck && !s.slot) {
    const kept = new Set(cards.map((c) => c.id));
    const left = s.cards.filter((c) => !kept.has(c.id));
    if (left.length)
      next = {
        ...t,
        origin: {
          ...t.origin,
          ...Object.fromEntries(left.map((c) => [c.id, s.deck!])),
        },
      };
  }
  return cards.length || isFixed(s)
    ? setStack(next, { ...s, cards })
    : removeStack(next, s.id);
}

function locateCard(
  t: OldTable,
  cardId: string,
): { stack: Stack; index: number } | null {
  for (const id of [...t.z, ...(t.dock ?? []), ...(t.tray ?? [])]) {
    const stack = t.stacks[id];
    const index = stack.cards.findIndex((c) => c.id === cardId);
    if (index >= 0) return { stack, index };
  }
  return null;
}

/** Take a card out of whatever pile holds it (not a pinned one). */
export function takeCard(
  t: OldTable,
  cardId: string,
): [OldTable, CardRef | null] {
  const where = locateCard(t, cardId);
  if (!where || isPinned(where.stack, where.index)) return [t, null];
  const { stack, index } = where;
  return [
    withCards(
      t,
      stack,
      stack.cards.filter((_, i) => i !== index),
    ),
    stack.cards[index],
  ];
}

/** Move all cards of `sourceId` (but its pinned ones) on top of `targetId`. */
export function mergeOnto(
  t: OldTable,
  sourceId: string,
  targetId: string,
): OldTable {
  const s = t.stacks[sourceId];
  if (!s || !t.stacks[targetId] || sourceId === targetId) return t;
  const moved = unpinned(s);
  if (!moved.length) return t;
  const out = new Set(moved.map((c) => c.id));
  const t2 = withCards(
    t,
    s,
    s.cards.filter((c) => !out.has(c.id)),
  );
  const dst = t2.stacks[targetId];
  return setStack(t2, { ...dst, cards: [...dst.cards, ...moved] });
}

/** Sort a pile's cards (but its pinned ones) by card number, the lowest on top. */
export function sortStack(
  t: OldTable,
  id: string,
  defs: Record<string, CardDef>,
): OldTable {
  const s = t.stacks[id];
  if (!s || unpinned(s).length < 2) return t;
  const cards = abovePinned(s, (rest) =>
    [...rest].sort((a, b) => compareCards(defs[b.id], defs[a.id])),
  );
  return setStack(t, { ...s, cards });
}

/** Send cards (already taken off the table) back to their own decks, each at the place its rules say. */
export function returnToDecks(
  t: OldTable,
  cards: CardRef[],
  defs: Record<string, CardDef>,
): OldTable {
  const groups = new Map<DeckKind, CardRef[]>();
  for (const card of cards) {
    const def = defs[card.id];
    if (!def) continue;
    const kind = homeDeck(t, def);
    groups.set(kind, [...(groups.get(kind) ?? []), card]);
  }
  let next = t;
  for (const [kind, group] of groups) {
    const deck = deckStack(next, kind);
    if (!deck?.deck) continue;
    const spec = DECK_SPECS[deck.deck];
    const added = group.map((c) => ({
      ...c,
      faceUp: spec.faceUp ?? c.faceUp,
    }));
    next =
      spec.insert === 'sorted'
        ? sortStack(
            setStack(next, { ...deck, cards: [...deck.cards, ...added] }),
            deck.id,
            defs,
          )
        : setStack(next, {
            ...deck,
            cards:
              spec.insert === 'bottom'
                ? underneath(deck, added)
                : [...deck.cards, ...added],
          });
  }
  return next;
}
