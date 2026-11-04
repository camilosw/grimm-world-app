import { family } from '../cards';
import {
  DECK_SPECS,
  type DeckKind,
  DECKS,
  homeDeck,
  storySlot,
} from '../decks';
import { deckStack } from '../lib/engine/decks';
import { CARD_H, CARD_W } from '../lib/engine/geometry';
import type { CardDef, CardRef, Stack } from '../lib/engine/types';
import type { EncounterPlace } from '../types';
import {
  addedPlace,
  AREA_HEADER,
  AREA_PAD,
  AREAS,
  areasOf,
  BATTLEFIELD_ORIGIN,
  deckPlace,
  ENCOUNTER_PLACES,
  encounterPlace,
  GAP,
  onSpot,
  rearrange,
  settle,
  settleAt,
  settleSpots,
  shiftOf,
  SPOTS,
  spotsOf,
  STORY_SLOTS,
  TABLE_DECKS,
  terrainPlace,
  tokenSize,
} from './layout';
import {
  addStack,
  isFixed,
  KEEPS,
  mergeOnto,
  returnToDecks,
  sortStack,
  takeCard,
} from './piles';
import type { OldTable } from './table';

// Frozen: the migrations of the saves from before version 3, which held where each pile was drawn (`Stack.x`, `y`) and
// not where it lies (`Stack.at`). They move piles by their coordinates, on the layout those saves were drawn on
// (layout.ts), and record where each pile lies last. They must not change: a later change to the `Table` that saves need
// is a migration of its own, to the next version (save.ts), which a save migrated here goes through too.

/** The version of the area layout `migrateTable` brings a save to (`Table.layout`), which a new game is in already. */
export const LAYOUT = 9;

/** The Encounter Bar before it became a row of landscape cards (`Table.layout` < 3): six cards wide, two high. */
const OLD_BAR = {
  w: 6 * CARD_W + 2 * AREA_PAD,
  h: 2 * CARD_H + AREA_HEADER + AREA_PAD,
};
const area = (id: string) => AREAS.find((a) => a.id === id)!;
/**
 * How far the areas below the Map and the Encounter Bar moved up when the bar became lower than the Map: older saves
 * (`Table.layout` < 3) and the migrations for them have everything there this much lower.
 */
const RAISE =
  Math.max(area('map').h, OLD_BAR.h) - Math.max(area('map').h, area('bar').h);

/** The decks kept in the sidebar, in order. */
const SIDEBAR_DECKS: DeckKind[] = [
  'character',
  'alignment',
  'regions',
  'terrain',
  'x-encounters',
  'lost-pages',
  'hitpoints',
  'money',
];

type Place = EncounterPlace | 'damage' | 'story' | 'story-revealed' | DeckKind;

/** Where a fixed place lies on this table. */
function placePoint(t: OldTable, place: Place): { x: number; y: number } {
  if (place === 'story' || place === 'story-revealed') {
    const d = shiftOf(t, 'storybook');
    return { x: STORY_SLOTS[place].x + d.x, y: STORY_SLOTS[place].y + d.y };
  }
  if (place === 'damage') return spotsOf(t).find((s) => s.id === 'damage')!;
  if ((ENCOUNTER_PLACES as string[]).includes(place))
    return encounterPlace(t, place as EncounterPlace);
  return deckPlace(t, place as DeckKind);
}

/**
 * Where each table pile lies in the game's terms (`Stack.at`), read off where it lies, after laying the table out as
 * the app did before version 3: the migration of a save of version 1 to version 2.
 */
export function recordAt(t: OldTable): OldTable {
  return settle(t);
}

/**
 * Bring a save from before the version was saved (version 0, a bare `Table`) up to version 1, from any earlier layout
 * (`Table.layout`).
 */
export function migrateTable(
  t: OldTable,
  defs: Record<string, CardDef>,
): OldTable {
  const terrain = builtBattlefield(t, defs);
  const migrated = addHandArea(
    addEncounterArea(
      emptyHand(migrateDecks(addBattlefieldArea(t), defs), defs),
    ),
  );
  const laidOut = packAreas(
    layBattlefield(
      clearDeckAreas(
        layDecks(
          raiseAreas(
            fillBar(shrinkMap(lowerHome(widenStorage(migrated))), defs),
          ),
        ),
      ),
      terrain,
    ),
  );
  return settle(
    addDeckCards(
      placeOnSpots(addDamagePlace(layEncounterDeck(laidOut, defs), defs), defs),
      defs,
    ),
  );
}

/** Each deck's own card (`KEEPS`) on top of it, face up, for good, taken from wherever it is. */
function addDeckCards(t: OldTable, defs: Record<string, CardDef>): OldTable {
  return (Object.entries(KEEPS) as [DeckKind, string][]).reduce(
    (next, [kind, code]) => {
      const def = Object.values(defs).find((d) => d.code === code);
      if (!def || deckStack(next, kind)?.cards.at(-1)?.id === def.id)
        return next;
      const [t2, card] = takeCard(next, def.id);
      const deck = deckStack(t2, kind);
      if (!card || !deck) return next;
      return {
        ...t2,
        stacks: {
          ...t2.stacks,
          [deck.id]: {
            ...deck,
            cards: [...deck.cards, { ...card, faceUp: true }],
          },
        },
      };
    },
    t,
  );
}

/**
 * The Damage Card's place in the Actions area, with the Damage Card (Y010) face up on it for good, taken from wherever it
 * is. Cards lying on that place already (from before it was fixed) stay, under it.
 */
function addDamagePlace(t: OldTable, defs: Record<string, CardDef>): OldTable {
  if (t.z.some((id) => t.stacks[id].place === 'damage')) return t;
  const spot = placePoint(t, 'damage');
  const def = Object.values(defs).find((d) => d.code === 'Y010');
  let [next, card] = def ? takeCard(t, def.id) : [t, null];
  const there = next.z
    .map((id) => next.stacks[id])
    .find((s) => s.x === spot.x && s.y === spot.y && !isFixed(s));
  const under = there?.cards ?? [];
  for (const c of under) next = takeCard(next, c.id)[0];
  const cards = [...under, ...(card ? [{ ...card, faceUp: true }] : [])];
  return addStack(
    next,
    placePoint(next, 'damage'),
    cards,
    { label: 'Damage Card', place: 'damage' },
    { place: 'damage' },
  )[0];
}

/** The Encounter Deck area's places, with these cards. The two with a time card hold the Encounter Deck. */
function addEncounterPlaces(
  t: OldTable,
  piles: Record<EncounterPlace, CardRef[]>,
): OldTable {
  return ENCOUNTER_PLACES.reduce((next, place) => {
    const kind =
      place === 'used'
        ? { label: 'Used Cards' }
        : { label: DECK_SPECS.encounter.label, deck: 'encounter' as const };
    return addStack(
      next,
      placePoint(next, place),
      piles[place],
      { ...kind, place },
      { place },
    )[0];
  }, t);
}

/** The storybook's two fixed places in its area: the face-down deck (right) and the revealed cards (left). */
function addStorySlots(
  t: OldTable,
  story: CardRef[],
  revealed: CardRef[],
): OldTable {
  const [t2] = addStack(
    t,
    placePoint(t, 'story'),
    story,
    { label: 'Storybook', deck: 'storybook', slot: 'story' },
    { place: 'story' },
  );
  const [t3] = addStack(
    t2,
    placePoint(t2, 'story-revealed'),
    revealed,
    { slot: 'story-revealed' },
    { place: 'story-revealed' },
  );
  return t3;
}

/** Deck names used by earlier versions of the app (with the Time Card deck, now gone). */
const OLD_LABELS: Record<string, string> = {
  ...Object.fromEntries(DECKS.map((d) => [d.label, d.kind])),
  'Time Card': 'time',
  'Next Chapter': 'time',
};

/**
 * Sidebar decks of older saves whose cards now lie in the Encounter Deck area: they stay in the sidebar until
 * `layEncounterDeck` lays their cards out.
 */
const OLD_ENCOUNTER: string[] = ['encounter', 'time'];

/** Whether the Encounter Deck area's places are on the table (older saves don't have them). */
const hasPlaces = (t: OldTable) =>
  t.z.some((id) =>
    (ENCOUNTER_PLACES as string[]).includes(t.stacks[id].place ?? ''),
  );

/**
 * The Encounter Deck area is new: until its places are laid out (`layEncounterDeck`), it lies right of everything on the
 * table, so that it takes in none of the cards lying there, and the layout then moves it right of the Encounter Bar.
 * Where the player moved the areas, it goes right of the bar as it lies, pushing the areas in its way aside.
 */
function addEncounterArea(t: OldTable): OldTable {
  if (hasPlaces(t)) return t;
  const own = area('encounter');
  const right = Math.max(
    ...areasOf(t).map((a) => a.x + a.w),
    ...t.z.map((id) => t.stacks[id].x + CARD_H),
    ...t.tokens.map((k) => k.x + tokenSize(k)),
  );
  const shifts = {
    ...t.shifts,
    encounter: { x: Math.round(right + GAP - own.x), y: 0 },
  };
  if (!t.anchors) return { ...t, shifts };
  const bar = t.frames?.bar ?? areasOf(t).find((a) => a.id === 'bar')!;
  return {
    ...t,
    shifts,
    anchors: {
      ...t.anchors,
      encounter: { x: Math.round(bar.x + bar.w + GAP), y: Math.round(bar.y) },
    },
  };
}

/**
 * The Battlefield area is new (`Table.layout` < 9): a battlefield used to be built on demand below the other areas
 * (`OldTable.battlefield`), its Terrain Cards lying portrait, edge to edge. The area lies right of everything on the
 * table, so that it takes in none of the cards lying there, until `packAreas` lays it out right of the Home area; where
 * the player moved the areas, it goes below them at the left edge. The Terrain Cards of a battlefield built go onto the
 * places of its grid (`builtBattlefield`, `layBattlefield`).
 */
function addBattlefieldArea(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= 9) return t;
  const { battlefield: _, ...rest } = t;
  const own = area('battlefield');
  const areas = areasOf(rest).filter((a) => a.id !== 'battlefield');
  const right = Math.max(
    ...areas.map((a) => a.x + a.w),
    ...t.z.map((id) => t.stacks[id].x + CARD_H),
    ...t.tokens.map((k) => k.x + tokenSize(k)),
  );
  const next: OldTable = {
    ...rest,
    shifts: {
      ...t.shifts,
      battlefield: { x: Math.round(right + GAP - own.x), y: 0 },
    },
  };
  if (t.anchors) {
    const x = Math.min(...areas.map((a) => a.x));
    const y = Math.max(...areas.map((a) => a.y + a.h)) + GAP;
    next.anchors = {
      ...t.anchors,
      battlefield: { x: Math.round(x), y: Math.round(y) },
    };
  }
  return next;
}

/** A place of the battlefield grid, by column and row. */
type Cell = { col: number; row: number };

/**
 * The piles of Terrain Cards lying on a battlefield built before the Battlefield area (`OldTable.battlefield`), with the
 * column and row of the place each lay on.
 */
function builtBattlefield(
  t: OldTable,
  defs: Record<string, CardDef>,
): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  const old = (t.layout ?? 0) < 9 && t.battlefield;
  if (!old) return cells;
  const x0 = old.x + AREA_PAD;
  const y0 = old.y + AREA_HEADER;
  for (const id of t.z) {
    const s = t.stacks[id];
    if (!s.cards.some((c) => defs[c.id]?.type === 'terrain')) continue;
    const col = Math.round((s.x - x0) / CARD_W);
    const row = Math.round((s.y - y0) / CARD_H);
    const inside = col >= 0 && row >= 0 && col < old.cols && row < old.rows;
    if (
      inside &&
      Math.hypot(s.x - x0 - col * CARD_W, s.y - y0 - row * CARD_H) <= CARD_W / 4
    )
      cells.set(id, { col, row });
  }
  return cells;
}

/**
 * The Terrain Cards of a battlefield built before the Battlefield area onto the places of its grid, in the same columns
 * and rows. After the migrations working in older coordinates, which would move them off these places.
 */
function layBattlefield(t: OldTable, cells: Map<string, Cell>): OldTable {
  if (!cells.size) return t;
  const stacks = { ...t.stacks };
  for (const [id, { col, row }] of cells)
    if (stacks[id])
      stacks[id] = { ...stacks[id], ...terrainPlace(t, col, row) };
  return { ...t, stacks };
}

/**
 * The Actions area (id `hand`) is new (`Table.layout` < 6): it lies right of everything on the table, so that it takes
 * in none of the cards lying there, until `packAreas` lays it out right of the table decks' areas. Where the player
 * moved the areas, it goes right of them, level with the Character area.
 */
function addHandArea(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= 6) return t;
  const own = area('hand');
  const areas = areasOf(t).filter((a) => a.id !== 'hand');
  const right = Math.max(
    ...areas.map((a) => a.x + a.w),
    ...t.z.map((id) => t.stacks[id].x + CARD_H),
    ...t.tokens.map((k) => k.x + tokenSize(k)),
  );
  const shifts = {
    ...t.shifts,
    hand: { x: Math.round(right + GAP - own.x), y: 0 },
  };
  if (!t.anchors) return { ...t, shifts };
  const x = Math.max(...areas.map((a) => a.x + a.w)) + GAP;
  const y = areas.find((a) => a.id === 'character')!.y;
  return {
    ...t,
    shifts,
    anchors: { ...t.anchors, hand: { x: Math.round(x), y: Math.round(y) } },
  };
}

/**
 * The Encounter Deck and the time cards used to be sidebar decks: their cards go to the Encounter Deck area's places,
 * the deck onto the 'Next Chapter' card if that was in it (and 'Time Passes' wasn't), else onto 'Time Passes'. Time
 * cards lying elsewhere go to their places too. The piles and figures the area now lies on move right, past the areas.
 */
function layEncounterDeck(
  t: OldTable,
  defs: Record<string, CardDef>,
): OldTable {
  if (hasPlaces(t)) return t;
  return rearrange(t, (t) => {
    const old = (t.dock ?? []).filter((id) =>
      OLD_ENCOUNTER.includes(t.stacks[id].deck ?? ''),
    );
    const isTime = (name: string) => (c: CardRef) =>
      defs[c.id]?.type === 'time' && defs[c.id]?.name === name;
    const oldDeck = old.flatMap((id) =>
      t.stacks[id].deck === 'encounter' ? t.stacks[id].cards : [],
    );
    const onNextChapter =
      oldDeck.some(isTime('Next Chapter')) &&
      !oldDeck.some(isTime('Time Passes'));
    let next = t;
    const timeCard = (name: string): CardRef[] => {
      const def = Object.values(defs).find(
        (d) => d.type === 'time' && d.name === name,
      );
      const [t2, card] = def ? takeCard(next, def.id) : [next, null];
      next = t2;
      return card ? [{ ...card, faceUp: false }] : [];
    };
    const timePasses = timeCard('Time Passes');
    const nextChapter = timeCard('Next Chapter');
    const deck = old
      .flatMap((id) => next.stacks[id].cards)
      .map((c) => ({ ...c, faceUp: DECK_SPECS.encounter.faceUp ?? false }));
    const stacks = { ...next.stacks };
    for (const id of old) delete stacks[id];
    next = {
      ...next,
      stacks,
      dock: next.dock?.filter((id) => !old.includes(id)),
    };
    return addEncounterPlaces(next, {
      'time-passes': [...timePasses, ...(onNextChapter ? [] : deck)],
      'next-chapter': [...nextChapter, ...(onNextChapter ? deck : [])],
      used: [],
    });
  });
}

/** The hand is gone: cards still held in it go back to their decks. */
function emptyHand(t: OldTable, defs: Record<string, CardDef>): OldTable {
  if (!('hand' in t)) return t;
  const { hand = [], ...rest } = t;
  return returnToDecks(
    rest,
    hand.filter((c) => defs[c.id]?.type !== 'title'),
    defs,
  );
}

/**
 * The Storage area used to be a card narrower: everything right of it (the Storybook and Home areas) moves right with
 * its storybook, and a pile on the old Storage Card place moves to the new one.
 */
function widenStorage(t: OldTable): OldTable {
  // Since then the storybook moves with its area (`Table.shifts`), so it no longer tells.
  if ((t.layout ?? 0) >= 1) return t;
  const revealed = storySlot(t, 'story-revealed');
  const dx =
    STORY_SLOTS['story-revealed'].x -
    (revealed?.x ?? STORY_SLOTS['story-revealed'].x);
  if (!revealed || !dx) return t;
  const margin = CARD_W / 4;
  const shifted = (p: { x: number; y: number }) =>
    p.x >= revealed.x - AREA_PAD - margin &&
    p.y >= revealed.y - AREA_HEADER - margin &&
    p.y < BATTLEFIELD_ORIGIN.y + RAISE - margin;
  const spot = SPOTS.find((s) => s.id === 'storage')!;
  const oldSpot = { x: spot.x - dx / 2, y: spot.y + RAISE };
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => {
      if (!t.z.includes(id)) return [id, s];
      if (s.x === oldSpot.x && s.y === oldSpot.y)
        return [id, { ...s, x: spot.x }];
      return [id, shifted(s) ? { ...s, x: s.x + dx } : s];
    }),
  );
  return {
    ...t,
    stacks,
    tokens: t.tokens.map((k) => (shifted(k) ? { ...k, x: k.x + dx } : k)),
  };
}

/**
 * The Storybook area used to be one card high: it grew for the Encounter Card below the revealed cards, and the Home
 * area below it moved down as far, with the cards and figures lying in it.
 */
function lowerHome(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= 1) return t;
  const story = area('storybook');
  // The Home area as it was then: two cards wide, 1.4 high.
  const home = {
    ...area('home'),
    y: area('home').y + RAISE,
    w: 2 * CARD_W + 2 * AREA_PAD,
    h: 1.4 * CARD_H + AREA_HEADER + AREA_PAD,
  };
  const dy = story.h - (CARD_H + AREA_HEADER + AREA_PAD);
  const margin = CARD_W / 4;
  const inOldHome = (p: { x: number; y: number }) =>
    p.x >= home.x - margin &&
    p.x < home.x + home.w &&
    p.y >= home.y - dy - margin &&
    p.y < home.y - dy + home.h;
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => [
      id,
      t.z.includes(id) && !s.slot && inOldHome(s) ? { ...s, y: s.y + dy } : s,
    ]),
  );
  return {
    ...t,
    stacks,
    tokens: t.tokens.map((k) => (inOldHome(k) ? { ...k, y: k.y + dy } : k)),
    layout: 1,
  };
}

/**
 * The Map area used to be five cards wide and two high, with the Region Cards in its middle: it shrank around their
 * places, and the Encounter Bar right of it moved left as far. The cards and figures lying in them move with them.
 */
function shrinkMap(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= 2) return t;
  const map = area('map');
  const bar = { ...area('bar'), ...OLD_BAR };
  const old = {
    w: 5 * CARD_W + 2 * AREA_PAD,
    h: 2 * CARD_H + AREA_HEADER + AREA_PAD,
  };
  const gap = bar.x - map.x - map.w;
  // The Region Cards lay in the middle of the old Map area, and now lie in the middle of the new one.
  const mapShift = { x: (map.w - old.w) / 2, y: (map.h - old.h) / 2 };
  const barShift = { x: map.w - old.w, y: 0 };
  const shift = <P extends { x: number; y: number }>(
    p: P,
    w: number,
    h: number,
  ): P => {
    const cx = p.x + w / 2;
    const cy = p.y + h / 2;
    const inRow =
      cx > map.x - gap / 2 &&
      cy > map.y - gap / 2 &&
      cy < map.y + Math.max(old.h, bar.h) + gap / 2;
    const d = !inRow
      ? null
      : cx < map.x + old.w + gap / 2
        ? mapShift
        : cx < map.x + old.w + gap + bar.w + gap / 2
          ? barShift
          : null;
    return d ? { ...p, x: p.x + d.x, y: p.y + d.y } : p;
  };
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => [
      id,
      t.z.includes(id) && !s.slot ? shift(s, CARD_W, CARD_H) : s,
    ]),
  );
  return {
    ...t,
    stacks,
    tokens: t.tokens.map((k) => shift(k, tokenSize(k), tokenSize(k))),
    layout: 2,
  };
}

/**
 * The Encounter Bar used to be a plain area: the Y-cards lying in it go into its row, left to right as they lay (the
 * top card of a pile first), and lie face down there (`settleSpots()`).
 */
function fillBar(t: OldTable, defs: Record<string, CardDef>): OldTable {
  if ((t.layout ?? 0) >= 3) return t;
  const bar = { ...area('bar'), ...OLD_BAR };
  const center = (s: Stack) => ({ x: s.x + CARD_W / 2, y: s.y + CARD_H / 2 });
  const inBar = (s: Stack) => {
    const c = center(s);
    return (
      !s.slot &&
      c.x >= bar.x &&
      c.x <= bar.x + bar.w &&
      c.y >= bar.y &&
      c.y <= bar.y + bar.h
    );
  };
  const piles = t.z.map((id) => t.stacks[id]).filter(inBar);
  piles.sort((a, b) => a.x - b.x || a.y - b.y);
  const cards = piles.flatMap((s) =>
    s.cards.filter((c) => family(defs[c.id]) === 'lost-pages').reverse(),
  );
  let next = cards.reduce((n, c) => takeCard(n, c.id)[0], t);
  // Each goes first in the row, so the last one first. Where the cards in it lie is read off their coordinates
  // (`settleAt()`).
  for (const card of [...cards].reverse()) {
    const settled = settleSpots(next);
    const spot = spotsOf(settled).find((s) => s.id === 'bar')!;
    const p = addedPlace(settleAt(settled), spot)!;
    next = addStack(settled, p, [card])[0];
  }
  return next;
}

/**
 * The Encounter Bar used to be taller than the Map: now that it is lower, the areas below them moved up, with the cards
 * and figures lying in them and the frames last laid out.
 */
function raiseAreas(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= 3) return t;
  const below = (p: { y: number }) =>
    p.y >= area('character').y + RAISE - CARD_W / 4;
  const up = <P extends { y: number }>(p: P): P =>
    below(p) ? { ...p, y: p.y - RAISE } : p;
  const stacks = Object.fromEntries(
    Object.entries(t.stacks).map(([id, s]) => [
      id,
      t.z.includes(id) ? up(s) : s,
    ]),
  );
  const frames =
    t.frames &&
    Object.fromEntries(Object.entries(t.frames).map(([id, f]) => [id, up(f)]));
  return { ...t, stacks, tokens: t.tokens.map(up), frames, layout: 3 };
}

/**
 * The decks built during play lie on their places in their own areas (`TABLE_DECKS`): those still in the sidebar move
 * there with their cards, missing ones are added empty.
 */
function layDecks(t: OldTable): OldTable {
  let next = t;
  for (const kind of TABLE_DECKS) {
    const s = deckStack(next, kind);
    if (s && next.z.includes(s.id)) continue;
    if (!s) {
      next = addStack(
        next,
        placePoint(next, kind),
        [],
        { label: DECK_SPECS[kind].label, deck: kind },
        { place: kind },
      )[0];
      continue;
    }
    const p = deckPlace(next, kind);
    const stacks = {
      ...next.stacks,
      [s.id]: { ...s, x: p.x, y: p.y, at: { place: kind }, rot: 0 as const },
    };
    next = {
      ...next,
      stacks,
      dock: next.dock?.filter((id) => id !== s.id),
      z: [...next.z, s.id],
    };
  }
  return next;
}

/**
 * The table decks' areas right of the Storybook area are new (`Table.layout` < 4): the piles and figures lying where
 * they now are move right, past the last of them.
 */
function clearDeckAreas(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= 4) return t;
  const laid = settle(t);
  const areas = areasOf(laid).filter((a) => a.deck);
  const left = Math.min(...areas.map((a) => a.x));
  const right = Math.max(...areas.map((a) => a.x + a.w));
  const top = Math.min(...areas.map((a) => a.y));
  const bottom = Math.max(...areas.map((a) => a.y + a.h));
  const dx = right - left + CARD_W;
  const inRow = (x: number, y: number) =>
    x >= left && x <= right && y >= top && y <= bottom;
  const stacks = Object.fromEntries(
    Object.entries(laid.stacks).map(([id, s]) => {
      const loose =
        laid.z.includes(id) &&
        !s.deck &&
        !s.slot &&
        inRow(s.x + CARD_W / 2, s.y + CARD_H / 2);
      return [id, loose ? { ...s, x: s.x + dx } : s];
    }),
  );
  const tokens = laid.tokens.map((k) =>
    inRow(k.x + tokenSize(k) / 2, k.y + tokenSize(k) / 2)
      ? { ...k, x: k.x + dx }
      : k,
  );
  return { ...laid, stacks, tokens, layout: 4 };
}

/**
 * The areas used to lie near places leaving room for them to grow, far apart (`Table.layout` < 5); now each lies next
 * to the one before it. The same lays out the Actions area, new since (`Table.layout` < 6, `addHandArea`), the Training
 * Deck area, taller since for its Browse button (`Table.layout` < 7), the areas in their rows since, the Encounter Bar
 * on top (`Table.layout` < 8), and the Battlefield area, new since (`Table.layout` < 9, `addBattlefieldArea`). The piles
 * and figures lying outside the areas that an area now lies on move right, past the areas.
 */
function packAreas(t: OldTable): OldTable {
  if ((t.layout ?? 0) >= LAYOUT) return t;
  return { ...rearrange(t, (t) => t), layout: LAYOUT };
}

/** Cards with a spot of their own (Character, Alignment and Money Cards) lying elsewhere on the table move onto it. */
function placeOnSpots(t: OldTable, defs: Record<string, CardDef>): OldTable {
  let next = t;
  const spots = spotsOf(t);
  for (const spot of spots.filter((s) => s.attracts)) {
    const placed = new Set(onSpot(next, spot));
    for (const id of t.z) {
      const s = next.stacks[id];
      if (!s || s.slot) continue;
      const own = s.cards.filter((c) => family(defs[c.id]) === spot.family);
      // In place: a pile of only these cards on the spot, or a single card on each place of a fanned spot.
      if (
        !own.length ||
        (placed.has(id) &&
          own.length === s.cards.length &&
          (!spot.fan || own.length === 1))
      )
        continue;
      for (const card of own) {
        const [t2] = takeCard(next, card.id);
        // Appended to a fanned spot; a card that doesn't fit any more stays where it is.
        const p = addedPlace(settleAt(settleSpots(t2)), spot);
        if (!p) continue;
        const [t3, newId] = addStack(settleSpots(t2), p, [card]);
        next = p.onto ? mergeOnto(t3, newId, p.onto) : t3;
      }
    }
  }
  return next;
}

function migrateDecks(t: OldTable, defs: Record<string, CardDef>): OldTable {
  let next = t;
  // 1. Before the sidebar existed every deck lay on the table.
  if (!next.dock) {
    const isDeck = (id: string) => !!next.stacks[id].label;
    next = {
      ...next,
      dock: next.z.filter(isDeck),
      z: next.z.filter((id) => !isDeck(id)),
    };
  }
  // The table decks may still be in the sidebar of older saves: `layDecks` moves them to the table, `layEncounterDeck`
  // the cards of the Encounter Deck and the Time Card deck.
  const later = [...TABLE_DECKS, ...OLD_ENCOUNTER];
  const inSidebar = next.dock!.filter(
    (id) => !later.includes(next.stacks[id].deck ?? ''),
  );
  const sidebarOk =
    SIDEBAR_DECKS.every(
      (kind, i) => next.stacks[inSidebar[i]]?.deck === kind,
    ) && inSidebar.length === SIDEBAR_DECKS.length;
  const storyOk =
    !!storySlot(next, 'story') && !!storySlot(next, 'story-revealed');
  if (sidebarOk && storyOk) return next;

  // 2. The sidebar holds exactly the fixed decks, in order (the table decks after them, until `layDecks`). Cards of any
  //    other (home-made) deck go back where they belong.
  const stacks = { ...next.stacks };
  let nextId = next.nextId;
  const strays: CardRef[] = [];
  const known = new Map<string, Stack>();
  for (const id of next.dock!) {
    const s = stacks[id];
    const kind = s.deck ?? OLD_LABELS[s.label ?? ''];
    if (kind && !known.has(kind)) known.set(kind, s);
    else strays.push(...s.cards);
    delete stacks[id];
  }
  const dock = SIDEBAR_DECKS.map((kind) => {
    const s = known.get(kind) ?? {
      id: `s${nextId++}`,
      x: 0,
      y: 0,
      rot: 0 as const,
      cards: [],
    };
    stacks[s.id] = { ...s, label: DECK_SPECS[kind].label, deck: kind };
    return s.id;
  });
  const tableDecks = later.flatMap((kind) => {
    const s = known.get(kind);
    if (!s) return [];
    // 'time' only names the Time Card deck of older saves, until `layEncounterDeck`.
    stacks[s.id] = {
      ...s,
      label: DECK_SPECS[kind as DeckKind]?.label ?? s.label,
      deck: kind as DeckKind,
    };
    return [s.id];
  });
  next = { ...next, stacks, dock: [...dock, ...tableDecks], nextId };

  // 3. The storybook moves from the sidebar into its area; storybook cards lying on the table count as revealed.
  if (!storyOk) {
    const isStory = (c: CardRef) => defs[c.id]?.type === 'storybook';
    const revealed = next.z
      .flatMap((id) => next.stacks[id].cards.filter(isStory))
      .map((c) => ({ ...c, faceUp: true }));
    const stacks2 = { ...next.stacks };
    for (const id of next.z)
      stacks2[id] = {
        ...stacks2[id],
        cards: stacks2[id].cards.filter((c) => !isStory(c)),
      };
    const story =
      known.get('storybook')?.cards.map((c) => ({ ...c, faceUp: false })) ?? [];
    next = addStorySlots({ ...next, stacks: stacks2 }, story, revealed);
  }

  for (const card of strays) {
    const def = defs[card.id];
    const deck = def && deckStack(next, homeDeck(next, def));
    if (!deck) continue;
    next = {
      ...next,
      stacks: {
        ...next.stacks,
        [deck.id]: {
          ...deck,
          cards: [
            ...deck.cards,
            { ...card, faceUp: DECK_SPECS[deck.deck!].faceUp ?? card.faceUp },
          ],
        },
      },
    };
    if (DECK_SPECS[deck.deck!].insert === 'sorted')
      next = sortStack(next, deck.id, defs);
  }

  // 4. The title card is no longer part of the game; piles left empty disappear.
  const playable = (c: CardRef) => defs[c.id] && defs[c.id].type !== 'title';
  next = {
    ...next,
    stacks: Object.fromEntries(
      Object.entries(next.stacks).map(([id, s]) => [
        id,
        { ...s, cards: s.cards.filter(playable) },
      ]),
    ),
  };
  const empty = new Set(
    next.z.filter(
      (id) =>
        !next.stacks[id].cards.length &&
        !next.stacks[id].slot &&
        !next.stacks[id].deck,
    ),
  );
  const stacks3 = Object.fromEntries(
    Object.entries(next.stacks).filter(([id]) => !empty.has(id)),
  );
  return { ...next, stacks: stacks3, z: next.z.filter((id) => !empty.has(id)) };
}
