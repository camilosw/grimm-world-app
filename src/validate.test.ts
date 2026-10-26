import { describe, expect, it } from 'vitest';
import { placeStack } from './areas';
import { deckStack } from './decks';
import { card, manifest, newGame } from './test/play';
import type { Stack, Table } from './types';
import { isValidTable, tableProblems } from './validate';

const t0 = newGame();

/** The table with a pile changed. */
const withPile = (t: Table, s: Stack): Table => ({
  ...t,
  stacks: { ...t.stacks, [s.id]: s },
});

describe('isValidTable', () => {
  it('takes a new game, and a save still holding the title card', () => {
    expect(isValidTable(t0, manifest)).toBe(true);
    const lost = deckStack(t0, 'lost-pages')!;
    const title = { id: card('Title'), faceUp: false };
    expect(
      isValidTable(
        withPile(t0, { ...lost, cards: [...lost.cards, title] }),
        manifest,
      ),
    ).toBe(true);
  });

  it('refuses what is no table of this card set', () => {
    expect(isValidTable(null, manifest)).toBe(false);
    expect(isValidTable({ ...t0, z: undefined! }, manifest)).toBe(false);
    const lost = deckStack(t0, 'lost-pages')!;
    const [first, ...rest] = lost.cards;
    expect(isValidTable(withPile(t0, { ...lost, cards: rest }), manifest)).toBe(
      false,
    );
    expect(
      isValidTable(
        withPile(t0, { ...lost, cards: [...lost.cards, first] }),
        manifest,
      ),
    ).toBe(false);
    expect(
      isValidTable(
        withPile(t0, {
          ...lost,
          cards: [...lost.cards, { id: '999', faceUp: true }],
        }),
        manifest,
      ),
    ).toBe(false);
    expect(isValidTable({ ...t0, tray: ['nope'] }, manifest)).toBe(false);
  });
});

describe('tableProblems', () => {
  it('finds nothing wrong with a new game', () => {
    expect(tableProblems(t0, manifest)).toEqual([]);
  });

  it('finds cards lost or there twice', () => {
    const lost = deckStack(t0, 'lost-pages')!;
    const [first, ...rest] = lost.cards;
    expect(
      tableProblems(withPile(t0, { ...lost, cards: rest }), manifest),
    ).toEqual([`card ${first.id} is missing`]);
    const regions = deckStack(t0, 'regions')!;
    expect(
      tableProblems(
        withPile(t0, { ...regions, cards: [...regions.cards, first] }),
        manifest,
      ),
    ).toEqual([`card ${first.id} is in both ${regions.id} and ${lost.id}`]);
  });

  it('finds piles misfiled, empty or in two places', () => {
    const lost = deckStack(t0, 'lost-pages')!;
    const empty: Stack = { id: 'e', x: 0, y: 0, rot: 0, cards: [] };
    expect(
      tableProblems({ ...withPile(t0, empty), z: [...t0.z, 'e'] }, manifest),
    ).toEqual(['pile e is empty']);
    expect(tableProblems(withPile(t0, empty), manifest)).toEqual([
      'pile e is in none of z, dock, tray',
      'pile e is empty',
    ]);
    expect(tableProblems({ ...t0, tray: [lost.id] }, manifest)).toEqual([
      `pile ${lost.id} is in both dock and tray`,
    ]);
    expect(tableProblems({ ...t0, z: [...t0.z, 'x'] }, manifest)).toEqual([
      'z names missing pile x',
    ]);
  });

  it('finds pinned cards off their places', () => {
    const place = placeStack(t0, 'time-passes')!;
    const [time, ...deck] = place.cards;
    expect(
      tableProblems(
        withPile(t0, { ...place, cards: [...deck, time] }),
        manifest,
      ),
    ).toEqual([
      `pile ${place.id} holds a time card off its place's bottom`,
      'the time-passes place has lost its time card',
    ]);
    const enemy = deckStack(t0, 'enemy')!;
    const lost = deckStack(t0, 'lost-pages')!;
    const y = lost.cards.at(-1)!;
    const t = withPile(
      withPile(t0, { ...lost, cards: lost.cards.slice(0, -1) }),
      { ...enemy, cards: [...enemy.cards, y] },
    );
    expect(tableProblems(t, manifest)).toEqual([
      'the enemy deck has no Y013 on top',
    ]);
  });
});
