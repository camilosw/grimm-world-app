import { describe, expect, it } from 'vitest';
import {
  parseBattlefield,
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
