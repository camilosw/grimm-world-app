import { describe, expect, it } from 'vitest';
import { spotsOf } from './areas';
import {
  dropOnto,
  flipTop,
  moveStack,
  parseBattlefield,
  settle,
  shuffleStack,
  sortStack,
  topToBottom,
  unpinned,
} from './actions';
import { card, refs, stack, table } from './test/fixtures';

describe('pinned cards', () => {
  const time = card('T01', 'time');
  const encounters = [1, 2, 3, 4, 5, 6].map((n) =>
    card(`B0${n}`, 'encounter-b'),
  );
  const timePasses = stack('tp', refs(time, ...encounters), {
    deck: 'encounter',
    place: 'time-passes',
  });

  it("leaves the time card at the bottom of its place, whatever the pile's order", () => {
    expect(unpinned(timePasses)).not.toContainEqual(
      expect.objectContaining({ id: time.id }),
    );
    for (let i = 0; i < 20; i++) {
      const t = shuffleStack(table(timePasses), 'tp');
      expect(t.stacks.tp.cards[0].id).toBe(time.id);
      expect(t.stacks.tp.cards).toHaveLength(7);
    }
    const t = topToBottom(table(timePasses), 'tp');
    expect(t.stacks.tp.cards.map((c) => c.id)).toEqual(
      [time, encounters[5], ...encounters.slice(0, 5)].map((c) => c.id),
    );
  });

  it("keeps a deck's own card on top (Y013 on the Enemy Deck)", () => {
    const y013 = card('Y013', 'lost-pages');
    const enemies = [card('Y849', 'lost-pages'), card('Y800', 'lost-pages')];
    const deck = stack('enemy', refs(...enemies, y013), { deck: 'enemy' });
    const defs = Object.fromEntries([y013, ...enemies].map((d) => [d.id, d]));

    const t = sortStack(table(deck), 'enemy', defs);
    // The lowest number lies on top, under the deck's own card.
    expect(t.stacks.enemy.cards.map((c) => c.id)).toEqual(
      [enemies[0], enemies[1], y013].map((c) => c.id),
    );
    // Nothing goes under a pile whose top card is pinned.
    expect(topToBottom(table(deck), 'enemy').stacks.enemy).toBe(deck);
  });
});

describe('cards turned as they are put on a place', () => {
  const time = card('T01', 'time');
  const deckCard = card('B01', 'encounter-b');
  const encounter = card('B02', 'encounter-b');
  const defs = Object.fromEntries(
    [time, deckCard, encounter].map((d) => [d.id, d]),
  );
  const timePasses = stack('tp', refs(time, deckCard), {
    deck: 'encounter',
    place: 'time-passes',
  });
  const used = stack('used', [], { place: 'used' });
  const spot = spotsOf(table()).find((s) => s.id === 'story-encounter')!;

  it("turns the Storybook's Encounter Card face up, and lets it be turned over there", () => {
    const before = table(timePasses, used, stack('e', refs(encounter)));
    const t = settle(moveStack(before, 'e', spot.x, spot.y), before);
    expect(t.stacks.e.cards[0].faceUp).toBe(true);

    const flipped = settle(flipTop(t, 'e'), t);
    expect(flipped.stacks.e.cards[0].faceUp).toBe(false);
  });

  it('puts cards on the Encounter Deck and the Used Cards place face down', () => {
    const shown = stack('e', [{ id: encounter.id, faceUp: true }], {
      x: spot.x,
      y: spot.y,
    });
    const before = table(timePasses, used, shown);
    const back = settle(dropOnto(before, 'e', 'tp', defs), before);
    expect(back.stacks.tp.cards).toContainEqual({
      id: encounter.id,
      faceUp: false,
    });

    const onUsed = settle(dropOnto(before, 'e', 'used', defs), before);
    expect(onUsed.stacks.used.cards).toEqual([
      { id: encounter.id, faceUp: false },
    ]);
    // Turned over there to be read, it stays face up.
    const read = settle(flipTop(onUsed, 'used'), onUsed);
    expect(read.stacks.used.cards[0].faceUp).toBe(true);
  });
});

describe('parseBattlefield', () => {
  it('reads Terrain Cards row by row, "v" pointing down and "-" empty', () => {
    expect(parseBattlefield('01 07v 15v\n19 - 31')).toEqual({
      rows: [
        [
          { code: 'T01', down: false },
          { code: 'T07', down: true },
          { code: 'T15', down: true },
        ],
        [{ code: 'T19', down: false }, null, { code: 'T31', down: false }],
      ],
      invalid: [],
    });
  });

  it('also splits rows at "/" and collects what is no card number', () => {
    const { rows, invalid } = parseBattlefield('1 2 / 3x');
    expect(rows).toHaveLength(2);
    expect(invalid).toEqual(['3x']);
  });
});
