import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as A from './actions';
import {
  allAreas,
  ENCOUNTER_PLACES,
  encounterPlace,
  freePlaces,
  gridPlaces,
  placement,
  spotsOf,
} from './areas';
import { CARD_H, CARD_W } from './cards';
import { DECK_SPECS, storySlot, TABLE_DECKS, returnsCards } from './decks';
import { deckPlace } from './areas';
import { defs, manifest, newGame } from './test/play';
import type { Table } from './types';
import { tableProblems } from './validate';

// Random games: sequences of the moves the player can make, each applied as the app applies it (through `placement()`
// for anything put on the table, and `settle()` after every change, as `store.update` does), keep the table sound.

/** A move, its numbers picking what it works on among what there is (modulo how many there are). */
interface Move {
  kind: number;
  a: number;
  b: number;
  c: number;
  dx: number;
  dy: number;
}

const KINDS = 14;

const move: fc.Arbitrary<Move> = fc.record({
  kind: fc.nat(KINDS - 1),
  a: fc.nat(),
  b: fc.nat(),
  c: fc.nat(),
  dx: fc.integer({ min: -80, max: 80 }),
  dy: fc.integer({ min: -80, max: 80 }),
});

const pick = <T>(list: T[], n: number): T | undefined =>
  list.length ? list[n % list.length] : undefined;

/** Places worth dropping cards on: every spot's free places, the grids', the decks' and places', the areas, the piles. */
function targets(t: Table): { x: number; y: number }[] {
  const areas = allAreas(t);
  const right = Math.max(...areas.map((a) => a.x + a.w));
  return [
    ...spotsOf(t).flatMap((s) => [{ x: s.x, y: s.y }, ...freePlaces(t, s)]),
    ...gridPlaces(t, 'map'),
    ...gridPlaces(t, 'battlefield'),
    ...ENCOUNTER_PLACES.map((p) => encounterPlace(t, p.place)),
    ...TABLE_DECKS.map((k) => deckPlace(t, k)),
    ...areas.map((a) => ({
      x: a.x + a.w / 2 - CARD_W / 2,
      y: a.y + a.h / 2 - CARD_H / 2,
    })),
    ...t.z.map((id) => t.stacks[id]),
    { x: right + CARD_W, y: 0 },
    { x: -2 * CARD_W, y: -2 * CARD_H },
  ];
}

/** The pile a card dropped with its top-left corner at (x, y) lands on, as a drag picks it (`stackTargetAt`). */
const pileAt = (t: Table, x: number, y: number, exclude: string | null) =>
  A.stackTargetAt(t, x + CARD_W / 2, y + CARD_H / 2, exclude)?.id ?? null;

/** Some of a pile's cards (by index), in an order picked by `n`. */
function indices(s: { cards: unknown[] }, n: number, m: number): number[] {
  const count = (n % Math.min(4, s.cards.length)) + 1;
  return Array.from({ length: count }, (_, i) => (m + i * 7) % s.cards.length);
}

/** Apply a move to a settled table as the app would: the same table when the app refuses it or offers nothing. */
function play(t: Table, m: Move): Table {
  const point = pick(targets(t), m.c)!;
  const x = point.x + m.dx;
  const y = point.y + m.dy;
  const onTable = t.z.map((id) => t.stacks[id]);
  // Mostly the piles the player laid out, while there are any.
  const loose = onTable.filter((s) => !A.isFixed(s));
  const pile = pick(loose.length && m.b % 4 ? loose : onTable, m.a);
  const update = (fn: (t: Table) => Table) => A.settle(fn(t), t);
  const aside = Object.keys(t.stacks).length ? (t.tray ?? []) : [];
  const docked = t.dock ?? [];
  switch (m.kind) {
    // A pile on the table dragged by its top card, or whole by its grip (`commitDrag` in Table.tsx).
    case 0:
    case 1: {
      if (!pile) return t;
      // Only a revealed Y-card leaves the storybook; a deck gives its top card, a place its cards by its grip, any other
      // pile its top card unless it is dragged by its grip or is a single card (`onPointerDown` in Table.tsx).
      const top = defs[pile.cards.at(-1)?.id ?? ''];
      if (pile.slot === 'story' || (pile.slot && top?.type === 'storybook'))
        return t;
      const grip = m.kind === 1;
      const whole = pile.place
        ? grip
        : !pile.deck && !pile.slot && (grip || pile.cards.length <= 1);
      const free = A.unpinned(pile);
      const cards = whole ? free : A.pinnedOnTop(pile) ? [] : free.slice(-1);
      let onto = pileAt(t, x, y, whole ? pile.id : null);
      if (onto === pile.id) onto = null;
      const ids = cards.map((c) => c.id);
      if (!ids.length || A.intoStory(t, ids, defs, x, y)) return t;
      const moving = whole && !A.isFixed(pile) ? pile.id : null;
      const dest = placement(t, ids, defs, x, y, onto, moving);
      if (dest.refused || dest.onto === pile.id) return t;
      return update((t) => {
        if (whole && !A.isFixed(t.stacks[pile.id]))
          return dest.onto
            ? A.dropOnto(t, pile.id, dest.onto, defs)
            : A.moveStack(t, pile.id, dest.x, dest.y);
        const [t2, newId] = whole
          ? A.liftPile(t, pile.id, dest.x, dest.y)
          : A.takeTop(t, pile.id, dest.x, dest.y);
        return dest.onto && newId ? A.dropOnto(t2, newId, dest.onto, defs) : t2;
      });
    }
    // The top card of a sidebar deck dragged onto the table (`dropFromDeck`), or a set-aside pile (`dropFromTray`).
    case 2:
    case 3: {
      const id = pick(m.kind === 2 ? docked : aside, m.a);
      const s = id ? t.stacks[id] : undefined;
      if (!s?.cards.length) return t;
      const ids =
        m.kind === 2 ? [s.cards.at(-1)!.id] : s.cards.map((c) => c.id);
      if (A.intoStory(t, ids, defs, x, y)) return t;
      const p = placement(t, ids, defs, x, y, pileAt(t, x, y, null));
      if (p.refused) return t;
      return update((t) => {
        if (m.kind === 3) {
          const t2 = A.fromTray(t, s.id, p.x, p.y);
          return p.onto ? A.dropOnto(t2, s.id, p.onto, defs) : t2;
        }
        const [t2, newId] = A.takeTop(t, s.id, p.x, p.y);
        return newId && p.onto ? A.dropOnto(t2, newId, p.onto, defs) : t2;
      });
    }
    // Set aside in the Hand: a table pile (whole or its top card) or a sidebar deck's top card, before another pile.
    case 4: {
      const id = pick([...t.z, ...docked, ...aside], m.a);
      if (!id) return t;
      const before = pick([...aside, null as unknown as string], m.c) ?? null;
      const which = docked.includes(id) || m.b % 2 ? 'top' : 'all';
      return update((t) => A.toTray(t, id, which, before));
    }
    // A table pile (or its top card) dropped on the sidebar goes back to its decks (`dropOnZone`).
    case 5: {
      if (!pile || (pile.deck && !returnsCards(pile.deck))) return t;
      const whole = m.b % 2 === 0;
      if (!whole && A.pinnedOnTop(pile)) return t;
      return update((t) =>
        A.stackToDecks(t, pile.id, whole ? 'all' : 'top', defs),
      );
    }
    // The action bar of a selected pile.
    case 6: {
      const id = pick([...t.z, ...docked, ...aside], m.a);
      if (!id) return t;
      const s = t.stacks[id];
      const far = targets(t).at(-2)!;
      switch (m.b % 8) {
        case 0:
          return update((t) => A.flipTop(t, id));
        case 1:
          return update((t) => A.flipStack(t, id));
        case 2:
          return update((t) => A.rotateStack(t, id, m.c % 2 ? 90 : -90, defs));
        case 3:
          return update((t) => A.shuffleStack(t, id));
        case 4:
          return update((t) => A.sortStack(t, id, defs));
        case 5:
          return update((t) => A.topToBottom(t, id));
        default: {
          const at =
            A.isFixed(s) || aside.includes(id) || docked.includes(id)
              ? { x: far.x + (m.c % 5) * CARD_W, y: far.y + (m.c % 3) * CARD_H }
              : undefined;
          return update((t) => A.drawTop(t, id, at));
        }
      }
    }
    // Cards picked in the Browse panel dragged onto the table (`dropFromBrowse`), face up or unseen.
    case 7: {
      const id = pick([...t.z, ...docked, ...aside], m.a);
      const s = id ? t.stacks[id] : undefined;
      if (!s?.cards.length || s.slot === 'story-revealed') return t;
      const picked = indices(s, m.b, m.c).filter((i) => !A.isPinned(s, i));
      const ids = picked.map((i) => s.cards[i].id);
      if (!ids.length || A.intoStory(t, ids, defs, x, y)) return t;
      const p = placement(t, ids, defs, x, y, pileAt(t, x, y, null));
      if (p.refused) return t;
      return update((t) =>
        A.playCards(t, s.id, picked, p.x, p.y, p.onto, defs, m.b % 3 !== 0),
      );
    }
    // Cards picked in the Browse panel dropped on the sidebar (`dropFromBrowse`).
    case 8: {
      const s = pick([...onTable, ...aside.map((id) => t.stacks[id])], m.a);
      if (!s?.cards.length || (s.deck && !returnsCards(s.deck))) return t;
      return update((t) => A.cardsToDecks(t, s.id, indices(s, m.b, m.c), defs));
    }
    // "Put under…" a table pile or deck (`putUnderTarget`), a whole pile or cards picked in the Browse panel.
    case 9: {
      const source = pick([...t.z, ...docked, ...aside], m.a);
      const target = pick([...t.z, ...aside], m.c);
      if (!source || !target || source === target) return t;
      const s = t.stacks[source];
      const dst = t.stacks[target];
      const cardIds =
        m.b % 2 && s.cards.length
          ? indices(s, m.b, m.c).map((i) => s.cards[i].id)
          : undefined;
      if (!cardIds && docked.includes(source)) return t;
      if (dst.slot) return t;
      if (dst.deck) {
        if (A.notHeldBy(t, source, dst.deck, defs, cardIds).length) return t;
        return update((t) => A.putUnderDeck(t, source, target, defs, cardIds));
      }
      if (!aside.includes(target)) {
        const cards = cardIds ?? s.cards.map((c) => c.id);
        const p = placement(t, cards, defs, dst.x, dst.y, target);
        if (p.refused || p.onto !== target) return t;
      }
      return update((t) =>
        cardIds
          ? A.putUnderPile(t, source, cardIds, target, m.b % 3 !== 0)
          : A.mergeStacks(t, source, target, 'bottom'),
      );
    }
    // The storybook: turn its next card over, or put the last one back.
    case 10:
      return update((t) =>
        m.b % 3 ? A.revealStory(t, defs) : A.unrevealStory(t),
      );
    // Cards put into the storybook under a chapter (the chapter picker).
    case 11: {
      const s = pick([...onTable, ...aside.map((id) => t.stacks[id])], m.a);
      if (!s?.cards.length || !storySlot(t, 'story')) return t;
      const names = manifest.cards
        .filter((c) => c.type === 'storybook')
        .map((c) => c.name!);
      const cardIds =
        m.b % 2 ? indices(s, m.b, m.c).map((i) => s.cards[i].id) : undefined;
      if (s.slot === 'story' && !cardIds) return t;
      if (A.notHeldBy(t, s.id, 'storybook', defs, cardIds).length) return t;
      const name = pick(names, m.c)!;
      return update((t) => A.putUnderChapter(t, s.id, name, defs, cardIds));
    }
    // An area dragged by its grip, or the areas packed together again.
    case 12: {
      if (m.b % 5 === 0) return update(A.resetLayout);
      const area = pick(allAreas(t), m.a)!;
      return A.moveArea(t, area.id, Math.round(x), Math.round(y)) === t
        ? t
        : update((t) => A.moveArea(t, area.id, Math.round(x), Math.round(y)));
    }
    // The battlefield typed in, or cleared; a figure put on the table.
    case 13: {
      if (m.b % 4 === 0) return update((t) => A.clearBattlefield(t, defs));
      if (m.b % 4 === 1)
        return update((t) =>
          A.addToken(t, x, y, '#000', m.c % 2 ? 'pawn' : 'cube'),
        );
      const n = (m.a % 46) + 1;
      const text = `${n} ${(n % 46) + 1}v -\n${((n + 7) % 46) + 1}`;
      return update((t) =>
        A.buildBattlefield(t, A.parseBattlefield(text).rows, defs),
      );
    }
  }
  return t;
}

/** A pseudo-random number generator (mulberry32), so that a failing game replays exactly. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('random games', () => {
  const random = Math.random;
  beforeAll(() => {
    vi.spyOn(Math, 'random');
  });
  afterAll(() => {
    vi.mocked(Math.random).mockRestore();
    expect(Math.random).toBe(random);
  });

  it('keep every card once, every pile in one place, and pinned cards on their piles; settled, they stay so', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.array(move, { maxLength: 50 }),
        (seed, moves) => {
          vi.mocked(Math.random).mockImplementation(seeded(seed));
          let t = newGame();
          moves.forEach((m, step) => {
            const prev = t;
            t = play(t, m);
            const where = `after move ${step} (${JSON.stringify(m)})`;
            expect(tableProblems(t, manifest), where).toEqual([]);
            // Fixed piles (decks, places) never go away.
            for (const [id, s] of Object.entries(prev.stacks))
              if (A.isFixed(s))
                expect(t.stacks[id], `${where}: ${id}`).toBeDefined();
            expect(A.settle(t), where).toEqual(t);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('only put cards in a deck that the deck holds', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.array(move, { maxLength: 50 }),
        (seed, moves) => {
          vi.mocked(Math.random).mockImplementation(seeded(seed));
          const t = moves.reduce(play, newGame());
          for (const s of Object.values(t.stacks)) {
            if (!s.deck) continue;
            // The time cards lie pinned under the Encounter Deck, on their places.
            const bad = A.unpinned(s).filter(
              (c) => !DECK_SPECS[s.deck!].holds(defs[c.id]),
            );
            expect(bad, `${s.deck} deck`).toEqual([]);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
