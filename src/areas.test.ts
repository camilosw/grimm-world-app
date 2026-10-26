import { describe, expect, it } from 'vitest';
import {
  addStack,
  moveArea,
  resetLayout,
  settleSpots,
  takeCard,
} from './actions';
import {
  allAreas,
  cellPlace,
  drawOrder,
  encounterPlace,
  freePlace,
  GAP,
  gridPlaces,
  placement,
  placeStack,
  settleLayout,
  spotPlaces,
  stacksOnSpot,
} from './areas';
import { deckStack } from './decks';
import {
  apply,
  card,
  cardsOf,
  defs,
  drop,
  dropEach,
  newGame,
  pileOf,
  spot,
} from './test/play';
import type { Table } from './types';

const t0 = newGame();
const [y1, y2, y3] = cardsOf('lost-pages', 3);
const [b1, b2, b3, b4] = cardsOf('encounter-b', 4);
const [r1, r2] = cardsOf('region', 2);
const [x1] = cardsOf('encounter-x', 1);
const [terrain] = cardsOf('terrain', 1);
const money = cardsOf('money', 4);
const martha = card('Martha');

/** Somewhere on the table far from every area. */
const FAR = { x: -5000, y: -5000 };

/** A point inside an area: its frame's center. */
function inArea(t: Table, id: string) {
  const a = allAreas(t).find((a) => a.id === id)!;
  return { x: a.x + a.w / 2 - 125, y: a.y + a.h / 2 - 175 };
}

/** Where a pile lies. */
const at = (t: Table, id: string) => ({ x: t.stacks[id].x, y: t.stacks[id].y });

/** Whether two areas lie closer than `GAP` to each other. */
function crowded(t: Table): string[] {
  const areas = allAreas(t);
  return areas.flatMap((a, i) =>
    areas
      .slice(i + 1)
      .filter(
        (b) =>
          a.x < b.x + b.w + GAP - 1 &&
          b.x < a.x + a.w + GAP - 1 &&
          a.y < b.y + b.h + GAP - 1 &&
          b.y < a.y + a.h + GAP - 1,
      )
      .map((b) => `${a.id}–${b.id}`),
  );
}

describe('placement', () => {
  it('sends a card with a place of its own there, wherever it is dropped', () => {
    const p = placement(t0, [martha], defs, FAR.x, FAR.y, null);
    expect(p).toMatchObject({ spot: { id: 'character' }, refused: null });
    expect({ x: p.x, y: p.y }).toEqual(spotPlaces(spot(t0, 'character'))[0]);
  });

  it('refuses such a card in a pile with others', () => {
    const p = placement(t0, [martha, y1], defs, FAR.x, FAR.y, null);
    expect(p.refused).toMatch(/lies alone on its place/);
  });

  it('lays up to three Money Cards in their row, and refuses a fourth', () => {
    const t = dropEach(t0, money.slice(0, 3), FAR.x, FAR.y);
    const row = spotPlaces(spot(t, 'money'), 3);
    expect(money.slice(0, 3).map((id) => at(t, pileOf(t, id)))).toEqual(row);
    const [, p] = drop(t, [money[3]], FAR.x, FAR.y);
    expect(p.refused).toMatch(/holds at most 3 Money Cards/);
  });

  it('lays cards dropped on a fanned row one per place, in the order dropped', () => {
    const goods = spot(t0, 'goods');
    const t = dropEach(t0, [b1, b2, b3], goods.x, goods.y);
    expect(stacksOnSpot(t, spot(t, 'goods'))).toEqual(
      [b3, b2, b1].map((id) => pileOf(t, id)).reverse(),
    );
    expect([b1, b2, b3].map((id) => at(t, pileOf(t, id)))).toEqual(
      spotPlaces(spot(t, 'goods'), 3),
    );
  });

  it('puts a card dropped on a place in a row between the cards there', () => {
    const goods = spot(t0, 'goods');
    const t = dropEach(t0, [b1, b2, b3], goods.x, goods.y);
    const second = spotPlaces(spot(t, 'goods'), 2)[1];
    const [t2] = drop(t, [b4], second.x, second.y);
    expect(stacksOnSpot(t2, spot(t2, 'goods'))).toEqual(
      [b1, b4, b2, b3].map((id) => pileOf(t2, id)),
    );
  });

  it('refuses a pile on a row taking one card per place', () => {
    const goods = spot(t0, 'goods');
    const p = placement(t0, [b1, b2], defs, goods.x, goods.y, null);
    expect(p.refused).toMatch(/one at a time/);
  });

  it('refuses cards an area does not take, saying where they belong', () => {
    const goods = spot(t0, 'goods');
    const p = placement(t0, [r1], defs, goods.x, goods.y, null);
    expect(p.refused).toBe('Region Cards belong in the Map area');
    const map = inArea(t0, 'map');
    expect(placement(t0, [y1], defs, map.x, map.y, null).refused).toBe(
      "Lost Pages Cards don't belong in the Map area",
    );
  });

  it('takes any card without a place of its own on the free table', () => {
    const p = placement(t0, [y1, r1, x1, terrain], defs, 40_000, 40_000, null);
    expect(p).toMatchObject({
      x: 40_000,
      y: 40_000,
      onto: null,
      area: null,
      spot: null,
      refused: null,
    });
  });

  it('puts Y-cards dropped anywhere in the Encounter Bar first in its row', () => {
    const bar = inArea(t0, 'bar');
    const t = dropEach(t0, [y1, y2], bar.x, bar.y);
    const row = stacksOnSpot(t, spot(t, 'bar'));
    expect(row).toEqual([y2, y1].map((id) => pileOf(t, id)));
    expect(row.map((id) => at(t, id))).toEqual(spotPlaces(spot(t, 'bar'), 2));
    // Face down, turned a quarter (`turn`), straight.
    expect(row.map((id) => t.stacks[id].cards[0].faceUp)).toEqual([
      false,
      false,
    ]);
  });

  it('spreads a pile dropped on the hand out, its bottom card first', () => {
    const hand = inArea(t0, 'hand');
    const [t] = drop(t0, [y1, y2, y3], hand.x, hand.y);
    const row = stacksOnSpot(t, spot(t, 'hand'));
    expect(row.map((id) => t.stacks[id].cards.map((c) => c.id))).toEqual([
      [y1],
      [y2],
      [y3],
    ]);
    expect(row.map((id) => t.stacks[id].rot)).toEqual([180, 180, 180]);
  });

  it('lays Region Cards on the Map one at a time, beside the cards there', () => {
    const map = inArea(t0, 'map');
    const [t, p] = drop(t0, [r1], map.x, map.y);
    expect({ x: p.x, y: p.y }).toEqual(cellPlace(t0, 'map', 0, 0));
    expect(t.stacks[pileOf(t, r1)].cards[0].faceUp).toBe(true);
    expect(placement(t, [r2, y1], defs, map.x, map.y, null).refused).toMatch(
      /Only Region Cards go on the Map's places/,
    );
    const right = gridPlaces(t, 'map').find((g) => g.side === 'right')!;
    const [t2] = drop(t, [r2], right.box.x, right.box.y - 50);
    expect(at(t2, pileOf(t2, r2))).toEqual(cellPlace(t2, 'map', 1, 0));
  });

  it('puts nothing on top of a card on the Map', () => {
    const map = inArea(t0, 'map');
    const [t] = drop(t0, [r1], map.x, map.y);
    const region = pileOf(t, r1);
    const p = placement(t, [y1], defs, map.x, map.y, region);
    expect(p.refused).toBe('Nothing goes on top of a Region Card on the Map');
  });

  it('puts an Encounter Card dropped on a Region Card near its strip on its Market Prices place', () => {
    const map = inArea(t0, 'map');
    const [t] = drop(t0, [r1], map.x, map.y);
    const market = spot(t, 'market-0,0');
    const [t2, p] = drop(t, [b1], market.x, market.y, pileOf(t, r1));
    expect(p).toMatchObject({ spot: { id: 'market-0,0' }, refused: null });
    const pile = t2.stacks[pileOf(t2, b1)];
    expect({ x: pile.x, y: pile.y, rot: pile.rot }).toEqual({
      ...spotPlaces(spot(t2, 'market-0,0'))[0],
      rot: 0,
    });
  });

  it('lays Terrain Cards on the Battlefield', () => {
    const field = inArea(t0, 'battlefield');
    const p = placement(t0, [terrain], defs, field.x, field.y, null);
    expect(p).toMatchObject({ area: { id: 'battlefield' }, refused: null });
    expect({ x: p.x, y: p.y }).toEqual(cellPlace(t0, 'battlefield', 0, 0));
  });

  it("puts cards dropped in a table deck's area into the deck, if it holds them", () => {
    const enemy = inArea(t0, 'enemy');
    const deck = deckStack(t0, 'enemy')!;
    const p = placement(t0, [y1], defs, enemy.x, enemy.y, null);
    expect(p).toMatchObject({ onto: deck.id, refused: null });
    const [t] = drop(t0, [y1], enemy.x, enemy.y);
    // Under the Enemy Card (Y013), which stays on top.
    expect(t.stacks[deck.id].cards.map((c) => defs[c.id].code)).toEqual([
      defs[y1].code,
      'Y013',
    ]);
    expect(placement(t0, [x1], defs, enemy.x, enemy.y, null).refused).toBe(
      `${defs[x1].code} can't go into the Enemy Deck`,
    );
  });

  it('puts Encounter Cards dropped in the Encounter Deck area on the nearest place', () => {
    const used = encounterPlace(t0, 'used');
    const p = placement(t0, [b1], defs, used.x + 30, used.y + 30, null);
    expect(p).toMatchObject({
      ...used,
      onto: placeStack(t0, 'used')!.id,
      refused: null,
    });
    expect(placement(t0, [y1], defs, used.x, used.y, null).refused).toBe(
      "Lost Pages Cards don't belong in the Encounter Deck area",
    );
  });

  it("puts the Storybook area's Encounter Card on its place, face up", () => {
    const story = inArea(t0, 'storybook');
    const [t, p] = drop(t0, [b1], story.x, story.y);
    expect(p.spot?.id).toBe('story-encounter');
    const pile = t.stacks[pileOf(t, b1)];
    expect(at(t, pile.id)).toEqual(spotPlaces(spot(t, 'story-encounter'))[0]);
  });
});

describe('settleSpots', () => {
  it('leaves a table in order as it is', () => {
    expect(settleSpots(t0)).toBe(t0);
  });

  it('closes the gap a card taken out of a row leaves', () => {
    const goods = spot(t0, 'goods');
    const t = dropEach(t0, [b1, b2, b3], goods.x, goods.y);
    const t2 = apply(t, (t) => takeCard(t, b2)[0]);
    const row = stacksOnSpot(t2, spot(t2, 'goods'));
    expect(row.map((id) => at(t2, id))).toEqual(
      spotPlaces(spot(t2, 'goods'), 2),
    );
    expect(freePlace(t2, spot(t2, 'goods'))).toEqual(
      spotPlaces(spot(t2, 'goods'), 3)[2],
    );
  });

  it('lays cards upside down where they lie so, and straight and face up on Market Prices', () => {
    const map = inArea(t0, 'map');
    const [t] = drop(t0, [r1], map.x, map.y);
    const market = spot(t, 'market-0,0');
    const discard = spot(t, 'discard');
    let t2 = takeCard(takeCard(t, b1)[0], y1)[0];
    t2 = addStack(t2, market.x, market.y, [{ id: b1, faceUp: false }], {
      rot: 90,
    })[0];
    t2 = addStack(t2, discard.x, discard.y, [{ id: y1, faceUp: true }])[0];
    const laid = settleSpots(t2);
    expect(laid.stacks[pileOf(laid, b1)]).toMatchObject({
      rot: 0,
      cards: [{ id: b1, faceUp: true }],
    });
    expect(laid.stacks[pileOf(laid, y1)].rot).toBe(180);
  });
});

describe('settleLayout', () => {
  it('leaves the areas of a new game as they lie', () => {
    expect(settleLayout(t0)).toBe(t0);
    expect(crowded(t0)).toEqual([]);
  });

  it('moves the areas beside a growing one out of its way, keeping them apart', () => {
    const goods = spot(t0, 'goods');
    const before = allAreas(t0).find((a) => a.id === 'character')!;
    const t = dropEach(t0, cardsOf('encounter-b', 12), goods.x, goods.y);
    const storage = allAreas(t).find((a) => a.id === 'storage')!;
    const character = allAreas(t).find((a) => a.id === 'character')!;
    expect(character.x).toBe(storage.x + storage.w + GAP);
    expect(character.x).toBeGreaterThan(before.x);
    expect(crowded(t)).toEqual([]);
  });

  it('puts an area where the player drops it, pushing the others aside, and moves its cards with it', () => {
    const storage = spot(t0, 'storage');
    const [t] = drop(t0, [y1], storage.x, storage.y);
    const was = at(t, pileOf(t, y1));
    const frame = allAreas(t).find((a) => a.id === 'storage')!;
    const moved = apply(t, (t) =>
      moveArea(t, 'storage', frame.x + 600, frame.y + 300),
    );
    const now = allAreas(moved).find((a) => a.id === 'storage')!;
    expect({ x: now.x, y: now.y }).toEqual({
      x: frame.x + 600,
      y: frame.y + 300,
    });
    expect(at(moved, pileOf(moved, y1))).toEqual({
      x: was.x + 600,
      y: was.y + 300,
    });
    expect(stacksOnSpot(moved, spot(moved, 'storage'))).toEqual([
      pileOf(moved, y1),
    ]);
    expect(crowded(moved)).toEqual([]);
    // Settled again, nothing moves.
    expect(settleLayout(moved)).toBe(moved);
  });

  it('packs the areas together again on reset', () => {
    const frame = allAreas(t0).find((a) => a.id === 'home')!;
    const moved = apply(t0, (t) =>
      moveArea(t, 'home', frame.x - 3000, frame.y),
    );
    expect(moved.anchors).toBeDefined();
    const reset = apply(moved, resetLayout);
    expect(reset.anchors).toBeUndefined();
    expect(allAreas(reset)).toEqual(allAreas(t0));
  });
});

describe('drawOrder', () => {
  it('draws a row under the card covering it, each card under the one before', () => {
    const storage = spot(t0, 'storage');
    const goods = spot(t0, 'goods');
    let t = dropEach(t0, [y1], storage.x, storage.y);
    t = dropEach(t, [b1, b2], goods.x, goods.y);
    const z = drawOrder(t);
    const [s, g1, g2] = [y1, b1, b2].map((id) => z.indexOf(pileOf(t, id)));
    expect(g2).toBeLessThan(g1);
    expect(g1).toBeLessThan(s);
  });

  it('draws each card of the hand on the one before', () => {
    const hand = inArea(t0, 'hand');
    const [t] = drop(t0, [y1, y2, y3], hand.x, hand.y);
    const z = drawOrder(t);
    const order = [y1, y2, y3].map((id) => z.indexOf(pileOf(t, id)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("draws the Storybook's Encounter Card over the revealed storybook card", () => {
    const story = inArea(t0, 'storybook');
    const [t] = drop(t0, [b1], story.x, story.y);
    const z = drawOrder(t);
    const revealed = t.z.find((id) => t.stacks[id].slot === 'story-revealed')!;
    expect(z.indexOf(pileOf(t, b1))).toBe(z.indexOf(revealed) + 1);
  });
});

describe('gridPlaces', () => {
  it("offers a grid's first place while it is empty", () => {
    expect(gridPlaces(t0, 'map')).toEqual([
      expect.objectContaining({ col: 0, row: 0, side: null }),
    ]);
  });

  it('grows the Map up, and right of its first column only', () => {
    const map = inArea(t0, 'map');
    const [t] = drop(t0, [r1], map.x, map.y);
    const sides = (t: Table) =>
      gridPlaces(t, 'map')
        .map((g) => `${g.side} ${g.col},${g.row}`)
        .sort();
    expect(sides(t)).toEqual(['right 1,0', 'top 0,-1']);
    const right = gridPlaces(t, 'map').find((g) => g.side === 'right')!;
    const [t2] = drop(t, [r2], right.box.x, right.box.y - 50);
    expect(sides(t2)).toEqual(['top 0,-1', 'top 1,-1']);
  });

  it('grows the Battlefield every way', () => {
    const field = inArea(t0, 'battlefield');
    const [t] = drop(t0, [terrain], field.x, field.y);
    expect(
      gridPlaces(t, 'battlefield')
        .map((g) => g.side)
        .sort(),
    ).toEqual(['bottom', 'left', 'right', 'top']);
  });
});
