import { describe, expect, it } from 'vitest';
import {
  apply,
  cardsOf,
  defs,
  drop,
  newGame,
  pileOf,
  spot,
} from '../../test/play';
import {
  addStack,
  flipTop,
  rotateStack,
  settleSpots,
  takeCard,
} from './actions';
import { drawOrder, placement, spotsOf } from './areas';
import { fanRow, showsPlace, spotPlaces } from './arrangement';
import { behaviours } from './behaviours';
import { facedSpot } from './facing';
import { freeCovered } from './layering';
import { turnedSpot, upsideDownSpot } from './orientation';
import type { Table } from './types';

const t0 = newGame();
const [y1, y2, y3] = cardsOf('lost-pages', 3);
const [b1] = cardsOf('encounter-b', 1);
const [hp] = cardsOf('hitpoints', 1);

/** A card taken out of wherever it lies, put on a spot's place `index` (as the player puts it there, `apply()`). */
function put(t: Table, id: string, cardId: string, index = 0, faceUp = true) {
  return apply(t, (t) => {
    const [t2] = takeCard(t, cardId);
    return addStack(t2, { spot: id, index }, [{ id: cardId, faceUp }])[0];
  });
}

/** A table with these cards laid on a spot's places, one per place. */
function laid(t: Table, id: string, cards: string[], faceUp = true): Table {
  return cards.reduce((t, c, index) => put(t, id, c, index, faceUp), t);
}

describe('place behaviours', () => {
  it('lay a row out before turning its cards, and the cards under others before those over them', () => {
    const hooks = behaviours().map((b) =>
      (['settle', 'arrive', 'layer', 'refuse'] as const).filter((h) => b[h]),
    );
    expect(hooks).toEqual([
      ['settle', 'refuse'],
      ['settle'],
      ['settle', 'arrive'],
      ['layer'],
      ['layer'],
      ['layer'],
    ]);
  });

  it('keep the Encounter Bar face down and the hand face up, for good', () => {
    let t = laid(t0, 'bar', [y1], true);
    t = laid(t, 'hand', [y2], false);
    const bar = t.stacks[pileOf(t, y1)];
    const hand = t.stacks[pileOf(t, y2)];
    expect(bar.cards[0].faceUp).toBe(false);
    expect(hand.cards[0].faceUp).toBe(true);
    expect(facedSpot(t, bar.id)?.facing).toBe('down');
    expect(flipTop(t, bar.id)).toBe(t);
  });

  it("turn the Storybook's Encounter Card face up as it arrives, and leave it free to be turned over", () => {
    const t = put(t0, 'story-encounter', b1, 0, false);
    const pile = pileOf(t, b1);
    expect(t.stacks[pile].cards[0].faceUp).toBe(true);
    expect(facedSpot(t, pile)).toBeUndefined();
    const turned = apply(t, (t) => flipTop(t, pile));
    expect(turned.stacks[pile].cards[0].faceUp).toBe(false);
  });

  it('keep the cards of the Actions area upside down, and refuse to rotate them', () => {
    const t = laid(t0, 'discard', [y1]);
    const pile = pileOf(t, y1);
    expect(t.stacks[pile].rot).toBe(180);
    expect(upsideDownSpot(t, pile)?.id).toBe('discard');
    expect(turnedSpot(t, pile)).toBeUndefined();
    expect(rotateStack(t, pile, 90, defs)).toBe(t);
  });

  it("show the hand's free place under its last card once it has one, and a covered row's beside its cover", () => {
    expect(freeCovered(t0, spot(t0, 'hand'))).toBeNull();
    const t = laid(t0, 'hand', [y1]);
    expect(freeCovered(t, spot(t, 'hand'))).toBe('top');
    expect(freeCovered(t0, spot(t0, 'goods'))).toBe('right');
    expect(freeCovered(t0, spot(t0, 'alignment'))).toBe('right');
  });

  it('draw a Hit Point Card right above its Enemy Card, and show its place only once that card is there', () => {
    const hpPlace = spot(t0, 'hp-1');
    expect(showsPlace(t0, hpPlace, spotsOf(t0))).toBe(false);
    const t = laid(t0, 'enemy-1', [y1]);
    expect(showsPlace(t, spot(t, 'hp-1'), spotsOf(t))).toBe(true);
    // Its other places show none of their own.
    expect(showsPlace(t, spot(t, 'hp-1-spent'), spotsOf(t))).toBe(false);
    const enemy = spot(t, 'enemy-1');
    const [t2, p] = drop(t, [hp], hpPlace.x, hpPlace.y);
    expect(p).toMatchObject({ spot: { id: 'hp-1' }, refused: null });
    const z = drawOrder(t2);
    expect(z.indexOf(pileOf(t2, hp))).toBe(z.indexOf(pileOf(t2, y1)) + 1);
    // One card between its places: none shows, and another is refused on any of them.
    expect(showsPlace(t2, spot(t2, 'hp-1'), spotsOf(t2))).toBe(false);
    const [other] = cardsOf('hitpoints', 2).filter((c) => c !== hp);
    const spent = spot(t2, 'hp-1-spent');
    const refused = placement(t2, [other], defs, spent.x, spent.y, null);
    expect(refused.refused).toMatch(/already a card on the Hit Point Card/);
    expect(enemy.pile?.one).toBe(true);
  });

  it('reorder a pile moved within one of two rows sharing a placeholder, and keep it in that row', () => {
    const t = laid(t0, 'titles', [y1, y2, y3]);
    const titles = spot(t, 'titles');
    const first = pileOf(t, y1);
    const last = spotPlaces(titles, 3)[2];
    const p = placement(t, [y1], defs, last.x, last.y + 40, null, first);
    expect(p.spot?.id).toBe('titles');
    expect(p.refused).toBeNull();
    const skills = spot(t, 'skills');
    const q = placement(t, [y1], defs, skills.x, skills.y, null, first);
    expect(q.spot?.id).toBe('titles');
    expect(fanRow(t, titles)).toHaveLength(3);
  });

  it('leave a settled table as it is', () => {
    const t = laid(laid(t0, 'hand', [y1, y2]), 'bar', [y3]);
    expect(settleSpots(t)).toBe(t);
  });
});
