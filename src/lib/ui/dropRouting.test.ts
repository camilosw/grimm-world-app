import { describe, expect, it } from 'vitest';
import { DECK_SPECS } from '../../decks';
import { cardsOf, defs, newGame, say } from '../../test/play';
import { addStack, settle } from '../engine/actions';
import { allAreas, areaForCard, looseAt, spotsOf } from '../engine/areas';
import { CARD_H, CARD_W } from '../engine/geometry';
import type { Table } from '../engine/types';
import { freeDropAt, homeNames, worldPoint } from './dropRouting';

// Far from every area: a card put there lies loose on the table.
const FAR = { x: -20000, y: -20000 };

/** The table with a loose pile lying at (x, y). */
function withPileAt(t: Table, x: number, y: number) {
  const [t2] = addStack(t, { x, y }, [
    { id: cardsOf('terrain', 1)[0], faceUp: true },
  ]);
  return settle(t2, t);
}

describe('freeDropAt', () => {
  const t = newGame();
  const [card] = cardsOf('encounter-b', 1);

  it('puts a card at the given point when nothing lies there and no area covers it', () => {
    expect(freeDropAt(t, defs, [card], FAR.x, FAR.y)).toEqual({ at: FAR });
  });

  it('moves a card aside from a pile lying there, to the nearest free half-card place', () => {
    const busy = withPileAt(t, FAR.x, FAR.y);
    const { at, refused } = freeDropAt(busy, defs, [card], FAR.x, FAR.y);
    expect(refused).toBeUndefined();
    expect(at).not.toBeNull();
    const { x, y } = at as { x: number; y: number };
    expect(
      Math.abs(x - FAR.x) >= CARD_W + 10 || Math.abs(y - FAR.y) >= CARD_H + 10,
    ).toBe(true);
    expect(areaForCard(busy, x, y)).toBeNull();
    // The nearest of the candidates: half a card away or so, not across the table.
    expect(Math.hypot(x - FAR.x, y - FAR.y)).toBeLessThan(CARD_W * 2);
  });

  it('sends a card with a place of its own to it, wherever it is put', () => {
    const [character] = cardsOf('character', 1);
    expect(spotsOf(t).find((s) => s.id === 'character')?.area).toBe(
      'character',
    );
    expect(freeDropAt(t, defs, [character], FAR.x, FAR.y)).toEqual({
      at: { spot: 'character', index: 0 },
    });
  });

  it('refuses cards with a place of their own that do not all belong there, saying why', () => {
    const [character] = cardsOf('character', 1);
    const [alignment] = cardsOf('alignment', 1);
    const { at, refused } = freeDropAt(
      t,
      defs,
      [character, alignment],
      FAR.x,
      FAR.y,
    );
    expect(at).toBeNull();
    expect(refused).toMatchObject({
      code: 'spot-alone',
      spot: { id: 'character' },
    });
    expect(say(refused)).toMatch(/lies alone on its place/);
  });

  describe('with the middle of the screen in a table deck area', () => {
    const area = allAreas(t).find((a) => a.id === 'enemy')!;
    const cx = area.x + area.w / 2 - CARD_W / 2;
    const cy = area.y + area.h / 2 - CARD_H / 2;

    it('still sends a card with a place of its own there', () => {
      const [character] = cardsOf('character', 1);
      expect(freeDropAt(t, defs, [character], cx, cy)).toEqual({
        at: { spot: 'character', index: 0 },
      });
    });

    it('puts any other card on a free place outside the areas, not in the deck', () => {
      const { at, refused } = freeDropAt(t, defs, [card], cx, cy);
      expect(refused).toBeUndefined();
      const { x, y } = at as { x: number; y: number };
      expect(areaForCard(t, x, y)).toBeNull();
    });
  });

  it('puts the cards loose where they are dropped when no place near is free', () => {
    let crowded = t;
    for (let x = -1800; x <= 1800; x += 400)
      for (let y = -1700; y <= 1700; y += 500)
        crowded = addStack(crowded, { x: FAR.x + x, y: FAR.y + y }, [
          { id: card, faceUp: true },
        ])[0];
    expect(freeDropAt(crowded, defs, [card], FAR.x, FAR.y)).toEqual({
      at: looseAt(crowded, FAR.x, FAR.y),
    });
  });
});

describe('worldPoint', () => {
  const rect = { left: 100, top: 50, right: 900, bottom: 650 } as DOMRect;
  const view = { x: 20, y: 10, scale: 0.5 };

  it('turns a screen point on the table into the top-left corner of a card centered there', () => {
    expect(worldPoint(rect, view, 300, 250)).toEqual({
      x: (300 - 100 - 20) / 0.5 - CARD_W / 2,
      y: (250 - 50 - 10) / 0.5 - CARD_H / 2,
    });
  });

  it('is null outside the table or without it', () => {
    expect(worldPoint(rect, view, 99, 300)).toBeNull();
    expect(worldPoint(rect, view, 300, 651)).toBeNull();
    expect(worldPoint(undefined, view, 300, 300)).toBeNull();
  });
});

describe('homeNames', () => {
  const t = newGame();

  it('names the decks cards go back to, once each', () => {
    const [a, b] = cardsOf('encounter-b', 2);
    const cards = [a, b].map((id) => ({ id, faceUp: true }));
    expect(homeNames(t, defs, cards)).toBe(DECK_SPECS.encounter.label);
  });

  it('is empty for no cards', () => {
    expect(homeNames(t, defs, [])).toBe('');
  });
});
