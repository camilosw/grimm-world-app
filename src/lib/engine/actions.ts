// The pure changes of a Table (Table => Table): piles, cards, decks, drops and settling. Battlefield and storybook actions
// are the game's (src/battlefield.ts, src/storybook.ts).

import {
  allAreas,
  anchorsAfterMove,
  gridOf,
  looseAt,
  onGrid,
  outsideAreas,
  placement,
  type Placement,
  placePiles,
  pointOf,
  sameAt,
  settleLayout,
  spotsOf,
} from './areas';
import { slidesUnder } from './arrangement';
import { arriveBehaviours, settleBehaviours } from './behaviours';
import { compareCards } from './cards';
import { cardsOn, facedSpot, faceUpGrids, turnArrived } from './facing';
import { game, isLandscape } from './game';
import { deckStack } from './decks';
import { CARD_H, CARD_W } from './geometry';
import { turnedSpot, upsideDownSpot } from './orientation';
import type {
  At,
  CardDef,
  CardRef,
  DeckKind,
  Rotation,
  Stack,
  Table,
  Token,
} from './types';

// Pure table transformations. Each returns a new Table (or the same one when
// nothing changes) so they can be passed straight to store.update().

function newId(t: Table, prefix: string): [string, number] {
  return [`${prefix}${t.nextId}`, t.nextId + 1];
}

export function setStack(t: Table, s: Stack): Table {
  return { ...t, stacks: { ...t.stacks, [s.id]: s } };
}

function removeStack(t: Table, id: string): Table {
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

export function isDocked(t: Table, id: string): boolean {
  return !!t.dock?.includes(id);
}

/** Whether a pile is set aside in the right sidebar. */
export function inTray(t: Table, id: string): boolean {
  return !!t.tray?.includes(id);
}

/**
 * A deck (in the sidebar or on the table), a storybook place, an Encounter Deck place or the Damage Card's: it stays where
 * it is, even when empty.
 */
export function isFixed(s: Stack): boolean {
  return !!s.deck || !!s.slot || !!s.place;
}

/**
 * How many cards at the bottom of a pile never leave it: the 'Time Passes' or 'Next Chapter' card on its place. They
 * can't be taken, and shuffling, sorting or adding cards underneath leaves them at the bottom.
 */
export function pinned(s: Stack): number {
  return s.place && game().pinsBottom.includes(s.place) && s.cards.length
    ? 1
    : 0;
}

/**
 * How many cards at the top of a pile never leave it: the Damage Card on its place, the Enemy Card (Y013), the Training
 * Card (Y012) and the Banned Cards card (Y011) on their decks (`DeckSpec.keeps`). The cards under it can (they go back to the hand once
 * healed, or are taken out by browsing the deck), but dragging the pile doesn't take them, nor does drawing; the Damage
 * Card's grip moves them all.
 */
export function pinnedOnTop(s: Stack): number {
  // A save names its decks as text: one no longer made has no rules.
  return ((!!s.place && game().pinsTop.includes(s.place)) ||
    (!!s.deck && !!game().decks[s.deck]?.keeps)) &&
    s.cards.length
    ? 1
    : 0;
}

/** Whether the card at `index` (bottom = 0) is pinned to its pile. */
export function isPinned(s: Stack, index: number): boolean {
  return index < pinned(s) || index >= s.cards.length - pinnedOnTop(s);
}

/** The cards of a pile that may leave it: all but its pinned ones, in pile order. */
export function unpinned(s: Stack): CardRef[] {
  return s.cards.filter((_, i) => !isPinned(s, i));
}

/** A pile's cards with `fn` applied to those between its pinned ones. */
function abovePinned(s: Stack, fn: (cards: CardRef[]) => CardRef[]): CardRef[] {
  const lo = pinned(s);
  const hi = s.cards.length - pinnedOnTop(s);
  return [
    ...s.cards.slice(0, lo),
    ...fn(s.cards.slice(lo, hi)),
    ...s.cards.slice(hi),
  ];
}

/** A pile's cards with `cards` slid underneath, just above its pinned ones. */
function underneath(s: Stack, cards: CardRef[]): CardRef[] {
  return abovePinned(s, (rest) => [...cards, ...rest]);
}

/** Every stack, on the table, in the sidebar or set aside. */
function allStacks(t: Table): Stack[] {
  return [...t.z, ...(t.dock ?? []), ...(t.tray ?? [])].map(
    (id) => t.stacks[id],
  );
}

/**
 * Where a pile lying `at` is drawn until the table is settled (`placePiles()` then lays it out), so that an action finds
 * it there meanwhile (`drawTop()`).
 */
function drawnAt(t: Table, at: At): { x: number; y: number } {
  return pointOf(t, at) ?? { x: 0, y: 0 };
}

/** Put cards on the table as a new stack (on top of everything), lying `at`. */
export function addStack(
  t: Table,
  at: At,
  cards: CardRef[],
  extra: Partial<Stack> = {},
): [Table, string] {
  const [id, nextId] = newId(t, 's');
  const stack: Stack = { id, ...drawnAt(t, at), at, rot: 0, cards, ...extra };
  return [
    { ...t, nextId, stacks: { ...t.stacks, [id]: stack }, z: [...t.z, id] },
    id,
  ];
}

/**
 * Replace a stack's cards. A pile on the table disappears when it becomes
 * empty; a deck stays as an empty slot so cards can go back into it.
 */
export function withCards(t: Table, s: Stack, cards: CardRef[]): Table {
  let next = t;
  // Remember which deck the cards came out of, so they can find their way back.
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

/** Move a pile to lie `at`, on top of everything. */
export function moveStack(t: Table, id: string, at: At): Table {
  const s = t.stacks[id];
  if (!s || isFixed(s) || sameAt(s.at, at)) return t;
  return bringToFront(setStack(t, { ...s, ...drawnAt(t, at), at }), id);
}

/** Lift the top card off a stack and drop it as its own stack, lying `at`. */
export function takeTop(t: Table, id: string, at: At): [Table, string | null] {
  const s = t.stacks[id];
  if (!s || s.cards.length <= pinned(s) || pinnedOnTop(s)) return [t, null];
  if (s.cards.length === 1 && !isFixed(s)) return [moveStack(t, id, at), id];
  const top = s.cards[s.cards.length - 1];
  return addStack(withCards(t, s, s.cards.slice(0, -1)), at, [top], {
    rot: s.rot,
  });
}

/**
 * Move a whole pile to lie `at`. A fixed one (an Encounter Deck place, the Damage Card's) stays: its unpinned cards
 * move, as a new pile. Returns the moved pile's id (null: nothing to move).
 */
export function liftPile(t: Table, id: string, at: At): [Table, string | null] {
  const s = t.stacks[id];
  if (!s) return [t, null];
  if (!isFixed(s)) return [moveStack(t, id, at), id];
  const moved = unpinned(s);
  if (!moved.length) return [t, null];
  return addStack(
    withCards(
      t,
      s,
      s.cards.filter((_, i) => isPinned(s, i)),
    ),
    at,
    moved,
    { rot: s.rot },
  );
}

/**
 * Put a pile on top of another (under it, on the Damage Card's place), or into a deck lying on the table at the place
 * its rules say (`insertIntoDeck()`: on top of the Quest Deck, under the Enemy, Training and Banned Cards).
 */
export function dropOnto(
  t: Table,
  sourceId: string,
  targetId: string,
  defs: Record<string, CardDef>,
): Table {
  const dst = t.stacks[targetId];
  if (!dst?.deck || sourceId === targetId)
    return mergeStacks(
      t,
      sourceId,
      targetId,
      slidesUnder(t, targetId) ? 'bottom' : 'top',
    );
  const [t2, cards] = takeCards(t, sourceId);
  return insertIntoDeck(t2, t2.stacks[targetId], cards, defs);
}

/** Move all cards of `sourceId` (but its pinned ones) onto (or under) `targetId`. */
export function mergeStacks(
  t: Table,
  sourceId: string,
  targetId: string,
  where: 'top' | 'bottom',
): Table {
  if (!t.stacks[sourceId] || !t.stacks[targetId] || sourceId === targetId)
    return t;
  const [t2, moved] = takeCards(t, sourceId);
  const dst = t2.stacks[targetId];
  if (!moved.length) return t;
  if (where === 'top')
    return setStack(t2, { ...dst, cards: [...dst.cards, ...moved] });
  // Cards slid under a pile take on the facing of that pile's bottom card (above its pinned ones).
  const faceUp = dst.cards[pinned(dst)]?.faceUp ?? moved[0].faceUp;
  return setStack(t2, {
    ...dst,
    cards: underneath(
      dst,
      moved.map((c) => ({ ...c, faceUp })),
    ),
  });
}

/**
 * Turn the top card over; a card lying face up or down on its place for good stays as it lies (Market Prices, Broken
 * Items, Status Upgrades & Items face up, the Encounter Bar face down).
 */
export function flipTop(t: Table, id: string): Table {
  const s = t.stacks[id];
  if (!s?.cards.length || facedSpot(t, id) || onGrid(t, id)) return t;
  const cards = [...s.cards];
  const top = cards[cards.length - 1];
  cards[cards.length - 1] = { ...top, faceUp: !top.faceUp };
  return setStack(t, { ...s, cards });
}

/** Turn the whole pile over, like flipping a real deck (but its pinned cards). */
export function flipStack(t: Table, id: string): Table {
  const s = t.stacks[id];
  if (!s || !unpinned(s).length || facedSpot(t, id) || onGrid(t, id)) return t;
  return setStack(t, {
    ...s,
    cards: abovePinned(s, (cards) =>
      cards.map((c) => ({ ...c, faceUp: !c.faceUp })).reverse(),
    ),
  });
}

/**
 * Turn a pile on the table; a Region Card in it never turns, nor a card lying turned on its place (Market Prices,
 * Encounter Bar) or upside down on it (Actions area, Titles, Skills, Broken Items, Status Upgrades & Items). Terrain
 * Cards lie landscape: they only turn around, half a turn, so that their triangles point up or down.
 */
export function rotateStack(
  t: Table,
  id: string,
  delta: number,
  defs: Record<string, CardDef>,
): Table {
  const s = t.stacks[id];
  if (!s || turnedSpot(t, id) || upsideDownSpot(t, id)) return t;
  const around = s.cards.every((c) => game().turnsAround(defs[c.id]));
  if (!around && s.cards.some((c) => isLandscape(defs[c.id]))) return t;
  const by = around ? 180 : delta;
  return setStack(t, {
    ...s,
    rot: ((((s.rot + by) % 360) + 360) % 360) as Rotation,
  });
}

/** Whether a pile has at least two cards to reorder (between its pinned ones). */
function reorders(s: Stack | undefined): s is Stack {
  return !!s && unpinned(s).length >= 2;
}

/** The items in random order. */
export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function shuffleStack(t: Table, id: string): Table {
  const s = t.stacks[id];
  if (!reorders(s)) return t;
  return setStack(t, { ...s, cards: abovePinned(s, shuffled) });
}

export function sortStack(
  t: Table,
  id: string,
  defs: Record<string, CardDef>,
): Table {
  const s = t.stacks[id];
  if (!reorders(s)) return t;
  // Top of the pile (end of the array) holds the lowest number.
  const cards = abovePinned(s, (rest) =>
    [...rest].sort((a, b) => compareCards(defs[b.id], defs[a.id])),
  );
  return setStack(t, { ...s, cards });
}

/** Place the top card at the bottom of the pile, above its pinned cards (e.g. after reading a Fate Number). */
export function topToBottom(t: Table, id: string): Table {
  const s = t.stacks[id];
  if (!reorders(s) || pinnedOnTop(s)) return t;
  const top = s.cards[s.cards.length - 1];
  return setStack(t, {
    ...s,
    cards: underneath({ ...s, cards: s.cards.slice(0, -1) }, [
      { ...top, faceUp: s.cards[pinned(s)].faceUp },
    ]),
  });
}

/**
 * Draw the top card face up next to the pile (onto a pile already lying there).
 * Decks draw to `at` instead.
 */
export function drawTop(t: Table, id: string, at?: At): Table {
  const s = t.stacks[id];
  if (!s || pinnedOnTop(s) || s.cards.length - pinned(s) < (isFixed(s) ? 1 : 2))
    return t;
  const to = at ?? looseAt(t, s.x + CARD_W + 40, s.y);
  const { x, y } = drawnAt(t, to);
  const top = { ...s.cards[s.cards.length - 1], faceUp: true };
  const t2 = withCards(t, s, s.cards.slice(0, -1));
  const there = t2.z
    .map((z) => t2.stacks[z])
    .find((o) => o.x === x && o.y === y);
  if (there) return setStack(t2, { ...there, cards: [...there.cards, top] });
  return addStack(t2, to, [top], { rot: s.rot })[0];
}

/** Pull one card (by index, bottom = 0) out of a pile onto the table, lying `at`. */
export function extractCard(
  t: Table,
  id: string,
  index: number,
  at: At,
  faceUp = true,
): Table {
  const s = t.stacks[id];
  if (!s || !s.cards[index] || isPinned(s, index)) return t;
  const card = { ...s.cards[index], faceUp };
  const rest = s.cards.filter((_, i) => i !== index);
  return addStack(withCards(t, s, rest), at, [card])[0];
}

/**
 * Pull cards (by index, bottom = 0) out of a pile, face up (or face down: cards
 * picked at random, unseen) and in the order given (bottom → top), onto the
 * table lying `at` or onto the pile `ontoId` (into a table deck: `dropOnto()`);
 * onto their own pile they move to its top.
 */
export function playCards(
  t: Table,
  id: string,
  indices: number[],
  at: At,
  ontoId: string | null,
  defs: Record<string, CardDef>,
  faceUp = true,
): Table {
  const s = t.stacks[id];
  if (!s) return t;
  const set = new Set(indices.filter((i) => s.cards[i] && !isPinned(s, i)));
  const picked = [...set].map((i) => ({ ...s.cards[i], faceUp }));
  if (!picked.length) return t;
  const rest = s.cards.filter((_, i) => !set.has(i));
  if (ontoId === id) return setStack(t, { ...s, cards: [...rest, ...picked] });
  const [t2, newId] = addStack(withCards(t, s, rest), at, picked);
  return ontoId && t2.stacks[ontoId] ? dropOnto(t2, newId, ontoId, defs) : t2;
}

export function bringToFront(t: Table, id: string): Table {
  if (!t.z.includes(id) || t.z[t.z.length - 1] === id) return t;
  return { ...t, z: [...t.z.filter((z) => z !== id), id] };
}

export function sendToBack(t: Table, id: string): Table {
  if (!t.z.includes(id) || t.z[0] === id) return t;
  return { ...t, z: [id, ...t.z.filter((z) => z !== id)] };
}

export function renameStack(t: Table, id: string, label: string): Table {
  const s = t.stacks[id];
  if (!s) return t;
  return setStack(t, { ...s, label: label.trim() || undefined });
}

/** Find which stack holds a card, and where. */
export function locateCard(
  t: Table,
  cardId: string,
): { stack: Stack; index: number } | null {
  for (const stack of allStacks(t)) {
    const index = stack.cards.findIndex((c) => c.id === cardId);
    if (index >= 0) return { stack, index };
  }
  return null;
}

export function addToken(
  t: Table,
  x: number,
  y: number,
  color: string,
  shape: Token['shape'],
): Table {
  const [id, nextId] = newId(t, 't');
  return { ...t, nextId, tokens: [...t.tokens, { id, x, y, color, shape }] };
}

export function moveToken(t: Table, id: string, x: number, y: number): Table {
  const tok = t.tokens.find((k) => k.id === id);
  if (!tok || (tok.x === x && tok.y === y)) return t;
  // Moved token goes last so it renders on top.
  return {
    ...t,
    tokens: [...t.tokens.filter((k) => k.id !== id), { ...tok, x, y }],
  };
}

export function removeToken(t: Table, id: string): Table {
  return { ...t, tokens: t.tokens.filter((k) => k.id !== id) };
}

/** Topmost stack whose center is close enough to (cx, cy) to stack onto it. */
export function stackTargetAt(
  t: Table,
  cx: number,
  cy: number,
  exclude: string | null,
): Stack | null {
  const reach = CARD_W * 0.4;
  for (let i = t.z.length - 1; i >= 0; i--) {
    const s = t.stacks[t.z[i]];
    if (s.id === exclude || s.slot) continue;
    if (Math.hypot(s.x + CARD_W / 2 - cx, s.y + CARD_H / 2 - cy) < reach)
      return s;
  }
  return null;
}

// ---------- dragging ----------

/** A table pile being dragged: its id, and whether it moves whole or only its top card does. */
export interface DraggedPile {
  id: string;
  whole: boolean;
}

/**
 * Whether a drag taking pile `s` (by its grip or not) moves it whole: by its grip, or a card alone. A deck lying on the
 * table stays: dragging it takes its top card. A storybook place too: only its top card ever leaves it. An Encounter
 * Deck place stays too: its grip moves its cards but the time card; so does the Damage Card's, its grip moving the
 * cards under the Damage Card.
 */
export function dragsWhole(s: Stack | undefined, grip: boolean): boolean {
  if (s?.place) return grip;
  return !s?.deck && !s?.slot && (grip || (s?.cards.length ?? 0) <= 1);
}

/** The cards a drag moves: the whole pile (but its pinned cards), or its top card (none, when that is pinned). */
export function movedCards(
  t: Table,
  stackId: string,
  whole: boolean,
): string[] {
  const s = t.stacks[stackId];
  if (!s) return [];
  const free = unpinned(s);
  const cards = whole ? free : pinnedOnTop(s) ? [] : free.slice(-1);
  return cards.map((c) => c.id);
}

/**
 * The pile a drag moves whole: dragged by its grip, or a card alone on its place of a grid (Map, battlefield). Null
 * when its cards leave it as a new pile: its top card, or the cards of a fixed pile (an Encounter Deck place), which
 * stays.
 */
export function movingPile(
  t: Table,
  stackId: string,
  whole: boolean,
): string | null {
  const moves = whole || !!gridOf(t, stackId);
  return moves && !isFixed(t.stacks[stackId]) ? stackId : null;
}

/**
 * What a drag starting on a table pile moves, or null when nothing leaves it (the table is panned instead). A fixed
 * table place's pile (`Stack.slot`) gives its top card only, if the game says so (`SlotSpec.gives`: a revealed card that
 * isn't a storybook card, a Y-card for the Encounter Bar); a time card alone on its place stays there.
 */
export function dragged(
  t: Table,
  defs: Record<string, CardDef>,
  pile: DraggedPile,
): DraggedPile | null {
  const s = t.stacks[pile.id];
  let moved = pile;
  if (s?.slot) {
    const top = s.cards.at(-1);
    if (!top || !game().slots[s.slot]?.gives(defs[top.id])) return null;
    moved = { id: pile.id, whole: false };
  }
  return movedCards(t, moved.id, moved.whole).length ? moved : null;
}

/**
 * Where a dragged pile (or its top card) goes: under one of the cards of pile `pick`, which the player then picks (the
 * face-down storybook's, under a chapter; `GameDefinition.pickedPile`), or where `placement()` puts it.
 */
export type Destination = { pick: string } | Placement;

/**
 * Where a table pile (or its top card, `whole` false) dragged with its top-left corner to (x, y), over pile `dropOn`
 * if any, goes: into the face-down storybook when it takes them there (`intoStory`), else where `placement()` says. Other cards (an Encounter Card for its place below the storybook) land as usual. `pointer` is
 * where the dragged card is held.
 */
export function dropDestination(
  t: Table,
  defs: Record<string, CardDef>,
  stackId: string,
  whole: boolean,
  x: number,
  y: number,
  dropOn: string | null,
  pointer?: { x: number; y: number },
): Destination {
  const cards = movedCards(t, stackId, whole);
  const pick = game().pickedPile(t, cards, defs, x, y);
  if (pick) return { pick };
  // A fixed pile (an Encounter Deck place) stays: its cards leave it as a new pile.
  const moving = movingPile(t, stackId, whole);
  return placement(t, cards, defs, x, y, dropOn, moving, pointer);
}

/**
 * Drop a table pile (or its top card) where `dropDestination()` puts it on the table: lying `dest.at`, or onto pile
 * `dest.onto`. A fixed pile stays: its cards leave it as a new pile.
 */
export function dropOnTable(
  t: Table,
  stackId: string,
  whole: boolean,
  dest: Pick<Placement, 'at' | 'onto'>,
  defs: Record<string, CardDef>,
): Table {
  const { onto } = dest;
  if (whole && !isFixed(t.stacks[stackId]))
    return onto
      ? dropOnto(t, stackId, onto, defs)
      : moveStack(t, stackId, dest.at);
  const [t2, newId] = whole
    ? liftPile(t, stackId, dest.at)
    : takeTop(t, stackId, dest.at);
  return onto && newId ? dropOnto(t2, newId, onto, defs) : t2;
}

// ---------- set aside ----------

/**
 * Set cards aside in the right sidebar: a whole pile (but its pinned cards), its top card, or the cards given (picked
 * in the Browse panel, face up as when taken out). They go before the set-aside pile `before`, else last. A pile that
 * moves whole keeps its id (one already set aside just moves along the sidebar); it lies upright there.
 */
export function toTray(
  t: Table,
  id: string,
  which: 'all' | 'top' | string[],
  before: string | null = null,
  faceUp = true,
): Table {
  const s = t.stacks[id];
  if (!s || before === id) return t;
  const free = unpinned(s);
  const cards =
    which === 'all'
      ? free
      : which === 'top'
        ? pinnedOnTop(s)
          ? []
          : free.slice(-1)
        : cardsOf(t, id, which).map((c) => ({ ...c, faceUp }));
  if (!cards.length) return t;
  const insert = (tray: string[], at: string) => {
    const i = before ? tray.indexOf(before) : -1;
    return i < 0 ? [...tray, at] : [...tray.slice(0, i), at, ...tray.slice(i)];
  };
  if (!isFixed(s) && cards.length === s.cards.length) {
    const tray = insert(
      (t.tray ?? []).filter((x) => x !== id),
      id,
    );
    return {
      ...t,
      z: t.z.filter((z) => z !== id),
      tray,
      stacks: { ...t.stacks, [id]: { ...s, rot: 0, cards } },
    };
  }
  const out = new Set(cards.map((c) => c.id));
  const t2 = withCards(
    t,
    s,
    s.cards.filter((c) => !out.has(c.id)),
  );
  const [newStack, nextId] = newId(t2, 's');
  const stack: Stack = { id: newStack, x: 0, y: 0, rot: 0, cards };
  return {
    ...t2,
    nextId,
    stacks: { ...t2.stacks, [newStack]: stack },
    tray: insert(t2.tray ?? [], newStack),
  };
}

/** Put a set-aside pile back on the table, lying `at`, on top of everything. */
export function fromTray(t: Table, id: string, at: At): Table {
  const s = t.stacks[id];
  if (!s || !inTray(t, id)) return t;
  return {
    ...t,
    tray: t.tray!.filter((x) => x !== id),
    z: [...t.z, id],
    stacks: { ...t.stacks, [id]: { ...s, ...drawnAt(t, at), at } },
  };
}

// ---------- battlefield ----------

/** Take a card out of whatever pile holds it. */
export function takeCard(t: Table, cardId: string): [Table, CardRef | null] {
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

// ---------- decks ----------

/** Put cards (bottom → top, kept in that order) into a deck's pile, at the place its rules say. */
function insertIntoDeck(
  t: Table,
  deck: Stack | undefined,
  cards: CardRef[],
  defs: Record<string, CardDef>,
  under = false,
): Table {
  if (!deck?.deck || !cards.length) return t;
  const spec = game().decks[deck.deck];
  const added = cards.map((c) => ({ ...c, faceUp: spec.faceUp ?? c.faceUp }));
  if (spec.insert === 'sorted')
    return sortStack(
      setStack(t, { ...deck, cards: [...deck.cards, ...added] }),
      deck.id,
      defs,
    );
  const bottom = under || spec.insert === 'bottom';
  return setStack(t, {
    ...deck,
    cards: bottom ? underneath(deck, added) : [...deck.cards, ...added],
  });
}

/** Send cards (already taken off the table, or off the deck `from`) back to their own decks. */
export function returnToDecks(
  t: Table,
  cards: CardRef[],
  defs: Record<string, CardDef>,
  from?: DeckKind,
): Table {
  const groups = new Map<DeckKind, CardRef[]>();
  for (const card of cards) {
    const def = defs[card.id];
    if (!def) continue;
    const kind = game().homeDeck(t, def, from);
    groups.set(kind, [...(groups.get(kind) ?? []), card]);
  }
  let next = t;
  for (const [kind, group] of groups)
    next = insertIntoDeck(next, deckStack(next, kind), group, defs);
  return next;
}

/**
 * A table pile (or its top card) goes back to the decks its cards belong to, but its pinned cards (the Damage Card). Of
 * a deck built during play (`returnsCards`), its cards go back to the decks they came from; other decks keep theirs.
 */
export function stackToDecks(
  t: Table,
  id: string,
  which: 'top' | 'all',
  defs: Record<string, CardDef>,
): Table {
  const s = t.stacks[id];
  if (!s?.cards.length || (s.deck && !game().returnsCards(s.deck))) return t;
  const free = unpinned(s);
  const moved = which === 'top' ? free.slice(-1) : free;
  if (!moved.length) return t;
  const out = new Set(moved.map((c) => c.id));
  return returnToDecks(
    withCards(
      t,
      s,
      s.cards.filter((c) => !out.has(c.id)),
    ),
    moved,
    defs,
    s.deck,
  );
}

/**
 * Some cards (by index, in that order) of a table pile, or of a deck built during play, go back to their decks, but its
 * pinned ones.
 */
export function cardsToDecks(
  t: Table,
  id: string,
  indices: number[],
  defs: Record<string, CardDef>,
): Table {
  const s = t.stacks[id];
  if (!s || (s.deck && !game().returnsCards(s.deck))) return t;
  const set = new Set(indices.filter((i) => s.cards[i] && !isPinned(s, i)));
  const moved = [...set].map((i) => s.cards[i]);
  return returnToDecks(
    withCards(
      t,
      s,
      s.cards.filter((_, i) => !set.has(i)),
    ),
    moved,
    defs,
    s.deck,
  );
}

/**
 * The cards of a pile that may leave it (all but its pinned ones), or only those given, in the order given (bottom →
 * top: the Browse panel's selection order, e.g. picked at random).
 */
function cardsOf(t: Table, stackId: string, cardIds?: string[]): CardRef[] {
  const s = t.stacks[stackId];
  const cards = s ? unpinned(s) : [];
  if (!cardIds) return cards;
  const byId = new Map(cards.map((c) => [c.id, c]));
  return [...new Set(cardIds)].flatMap((id) => byId.get(id) ?? []);
}

/** Take cards (all of them if none given, but its pinned ones) out of a pile; an emptied table pile disappears. */
export function takeCards(
  t: Table,
  stackId: string,
  cardIds?: string[],
): [Table, CardRef[]] {
  const s = t.stacks[stackId];
  const taken = cardsOf(t, stackId, cardIds);
  if (!s || !taken.length) return [t, []];
  const out = new Set(taken.map((c) => c.id));
  return [
    withCards(
      t,
      s,
      s.cards.filter((c) => !out.has(c.id)),
    ),
    taken,
  ];
}

/** Cards of a pile (or those given) that a deck may not hold (empty = they may go under that deck). */
export function notHeldBy(
  t: Table,
  stackId: string,
  kind: DeckKind,
  defs: Record<string, CardDef>,
  cardIds?: string[],
): CardDef[] {
  return cardsOf(t, stackId, cardIds)
    .map((c) => defs[c.id])
    .filter((d) => d && !game().decks[kind].holds(d));
}

/** Whether a pile lies on a fixed table place whose cards only the game's own actions move (the face-down storybook). */
export function sealed(s: Stack | undefined): boolean {
  return !!s?.slot && !!game().slots[s.slot]?.sealed;
}

/**
 * Slide a table pile, or cards picked out of any pile, under the deck `deckId`, as the rules ask (X-cards under the
 * Encounter Deck, enemies under the Enemy Card, banished cards under Banned Cards).
 */
export function putUnderDeck(
  t: Table,
  stackId: string,
  deckId: string,
  defs: Record<string, CardDef>,
  cardIds?: string[],
): Table {
  const s = t.stacks[stackId];
  const kind = t.stacks[deckId]?.deck;
  if (
    !s ||
    !kind ||
    stackId === deckId ||
    sealed(s) ||
    notHeldBy(t, stackId, kind, defs, cardIds).length
  )
    return t;
  const [t2, cards] = takeCards(t, stackId, cardIds);
  return insertIntoDeck(t2, t2.stacks[deckId], cards, defs, true);
}

/** Slide cards picked out of a pile (e.g. a sidebar deck) under a table pile, face up as when taken out (or face down). */
export function putUnderPile(
  t: Table,
  stackId: string,
  cardIds: string[],
  targetId: string,
  faceUp = true,
): Table {
  if (stackId === targetId || !t.stacks[targetId] || sealed(t.stacks[stackId]))
    return t;
  const [t2, cards] = takeCards(t, stackId, cardIds);
  const target = t2.stacks[targetId];
  if (!cards.length || !target) return t;
  return setStack(t2, {
    ...target,
    cards: underneath(
      target,
      cards.map((c) => ({ ...c, faceUp })),
    ),
  });
}

// ---------- spots ----------

/**
 * Where each table pile lies before laying out: a fixed pile on its place; a pile put on the table without saying
 * where, loose where it is drawn (`looseAt()`); a pile on a spot no longer there (the Market Prices place of a Region
 * Card that has left its place), loose in that spot's area, where it lies.
 */
function locate(t: Table): Table {
  const spots = new Set(spotsOf(t).map((s) => s.id));
  let stacks: Record<string, Stack> | undefined;
  for (const id of t.z) {
    const s = t.stacks[id];
    const place = s.place ?? s.slot ?? s.deck;
    const at: At | undefined = place
      ? { place }
      : !s.at
        ? looseAt(t, s.x, s.y)
        : 'spot' in s.at && !spots.has(s.at.spot)
          ? looseAt(t, s.x, s.y)
          : undefined;
    if (!at || sameAt(s.at, at)) continue;
    stacks ??= { ...t.stacks };
    stacks[id] = { ...s, at };
  }
  return stacks ? { ...t, stacks } : t;
}

/**
 * Lay the spots out, each as its behaviours say (their `settle` hooks, behaviours.ts): spread out piles dropped on the
 * hand or the Encounter Bar, close the gaps in fanned spots (Money Cards, Goods), their piles numbered from the first
 * place in row order (arrangement.ts), and lay cards on a spot that turns them straight (Market Prices, Encounter Bar)
 * or upside down (Actions area, Titles, Skills, Broken Items, Status Upgrades & Items; orientation.ts), face up or down
 * (facing.ts), as they must lie there; Region Cards on the Map and Terrain Cards on the battlefield lie face up. Where
 * piles lie is their `Stack.at`.
 */
export function settleSpots(t: Table): Table {
  const next = locate(t);
  return faceUpGrids(settleBehaviours(next, spotsOf(next)));
}

/**
 * Turn the cards just put on a place that takes them so, however they got there, and leave them free to be turned over
 * there afterwards: as the spots' `arrive` hooks say (facing.ts: face up on a spot with `facing: 'arrives-up'`, the
 * Storybook's Encounter Card), face down on the places of a deck's piles (the Encounter Deck area's, like the cards going
 * into a deck with `DeckSpec.faceUp`).
 */
export function faceArrivals(prev: Table, t: Table): Table {
  let next = arriveBehaviours(prev, t, spotsOf(prev), spotsOf(t));
  const places = new Set<string>(game().deckPlaces.map((p) => p.place));
  for (const s of Object.values(t.stacks))
    if (s.place && places.has(s.place) && prev.stacks[s.id])
      next = turnArrived(next, s.id, cardsOn(prev, [s.id]), false);
  return next;
}

/**
 * Bring the table in order after any change: the spots laid out (`settleSpots()`), then the areas (`settleLayout()`),
 * and, given the table before the change, the cards just put on a place that turns them turned (`faceArrivals()`);
 * last, each table pile laid where its `Stack.at` says (`placePiles()`).
 */
export function settle(t: Table, prev?: Table): Table {
  const laid = settleLayout(settleSpots(t));
  return placePiles(prev ? faceArrivals(prev, laid) : laid);
}

// ---------- area layout ----------

/**
 * Apply a change that moves the areas, and lay the table out (`settle()`). The piles that lay loose outside the areas
 * and now lie under one move right, past the areas, keeping their places to each other: they don't belong in it, and
 * they still lie loose outside the areas. Figures belong to no area and may lie on any, so they stay.
 */
export function rearrange(t: Table, fn: (t: Table) => Table): Table {
  const piles = t.z.filter((id) => {
    const at = t.stacks[id].at;
    return !isFixed(t.stacks[id]) && !!at && outsideAreas(at);
  });
  const laid = settle(fn(t), t);
  const moved = covered(laid, piles);
  if (!moved.size) return laid;
  const dx = pastAreas(laid, moved);
  const stacks = { ...laid.stacks };
  for (const id of moved) {
    const s = laid.stacks[id];
    stacks[id] = { ...s, x: s.x + dx, at: { x: s.x + dx, y: s.y } };
  }
  return { ...laid, stacks };
}

/** Of these piles, those an area lies over on this table. */
function covered(t: Table, piles: string[]): Set<string> {
  const areas = allAreas(t);
  const under = (x: number, y: number) =>
    areas.some(
      (a) =>
        x < a.x + a.w && x + CARD_W > a.x && y < a.y + a.h && y + CARD_H > a.y,
    );
  return new Set(
    piles.filter((id) => t.stacks[id] && under(t.stacks[id].x, t.stacks[id].y)),
  );
}

/** How far right piles move to lie past the areas, half a card from them, keeping their places to each other. */
function pastAreas(t: Table, piles: Set<string>): number {
  const areas = allAreas(t);
  const left = Math.min(...[...piles].map((id) => t.stacks[id].x));
  return Math.max(...areas.map((a) => a.x + a.w)) + CARD_W / 2 - left;
}

/** Put an area (and everything in it) with its top-left corner at (x, y); the areas in its way are pushed aside. */
export function moveArea(t: Table, id: string, x: number, y: number): Table {
  const anchors = anchorsAfterMove(t, id, x, y);
  return anchors ? rearrange(t, (t) => ({ ...t, anchors })) : t;
}

/** Lay the areas out packed together again, as before the player moved any. */
export function resetLayout(t: Table): Table {
  if (!t.anchors) return t;
  return rearrange(t, (t) => {
    const packed = { ...t };
    delete packed.anchors;
    return packed;
  });
}
