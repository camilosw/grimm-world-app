import { describe, expect, it } from 'vitest';
import {
  gridOf,
  gridPlaces,
  placement,
  placeStack,
  spotsOf,
  stacksOnSpot,
} from './areas';
import {
  battlefieldText,
  buildBattlefield,
  cardsToDecks,
  dragged,
  dragsWhole,
  dropDestination,
  dropOnTable,
  dropOnto,
  flipTop,
  fromTray,
  liftPile,
  movedCards,
  moveStack,
  movingPile,
  parseBattlefield,
  putUnderChapter,
  putUnderPile,
  revealStory,
  settle,
  shuffleStack,
  sortStack,
  stackToDecks,
  storyProgress,
  toTray,
  topToBottom,
  unpinned,
  unrevealStory,
} from './actions';
import { deckStack, storySlot } from './decks';
import { card, refs, stack, table } from './test/fixtures';
import * as game from './test/play';

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
    const t = settle(
      moveStack(before, 'e', { spot: 'story-encounter', index: 0 }),
      before,
    );
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

describe('in a game', () => {
  const t0 = game.newGame();
  const { apply, defs, spot } = game;
  const [y1, y2, y3] = game.cardsOf('lost-pages', 3);

  it('lifts the Encounter Deck off its place by the grip, leaving the time card', () => {
    const place = placeStack(t0, 'time-passes')!;
    const [t, id] = liftPile(t0, place.id, { x: -3000, y: -3000 });
    expect(t.stacks[place.id].cards.map((c) => defs[c.id].name)).toEqual([
      'Time Passes',
    ]);
    expect(t.stacks[id!].cards).toEqual(unpinned(place));
    // Nothing is left to lift.
    expect(liftPile(t, place.id, { x: 0, y: 0 })).toEqual([t, null]);
  });

  it('sets cards aside in the Hand and puts them back on the table', () => {
    const lost = deckStack(t0, 'lost-pages')!;
    const t = apply(t0, (t) => toTray(t, lost.id, 'top'));
    const [aside] = t.tray!;
    expect(t.stacks[aside].cards.map((c) => c.id)).toEqual([
      lost.cards.at(-1)!.id,
    ]);
    // Before the set-aside pile dropped on.
    const t2 = apply(t, (t) => toTray(t, lost.id, 'top', aside));
    expect(t2.tray).toHaveLength(2);
    expect(t2.tray![1]).toBe(aside);
    const t3 = apply(t2, (t) => fromTray(t, aside, { x: -3000, y: -3000 }));
    expect(t3.tray).toHaveLength(1);
    expect(t3.z.at(-1)).toBe(aside);
    expect(t3.stacks[aside]).toMatchObject({ x: -3000, y: -3000 });
  });

  it('slides cards picked out of a deck under a table pile, as they are turned', () => {
    let t = game.dropEach(t0, [y1], -3000, -3000);
    const pile = game.pileOf(t, y1);
    t = apply(t, (t) =>
      putUnderPile(t, game.pileOf(t, y2), [y2, y3], pile, false),
    );
    expect(t.stacks[pile].cards).toEqual([
      { id: y2, faceUp: false },
      { id: y3, faceUp: false },
      { id: y1, faceUp: true },
    ]);
    // Back to their deck, in card order.
    const lost = deckStack(t, 'lost-pages')!;
    t = apply(t, (t) => stackToDecks(t, pile, 'all', defs));
    expect(t.stacks[pile]).toBeUndefined();
    expect(sortStack(t, lost.id, defs)).toEqual(t);
  });

  it('returns cards picked in a pile to their decks, but its pinned ones', () => {
    const enemy = deckStack(t0, 'enemy')!;
    let t = game.dropEach(t0, [y1], -3000, -3000);
    t = apply(t, (t) => dropOnto(t, game.pileOf(t, y1), enemy.id, defs));
    t = apply(t, (t) => cardsToDecks(t, enemy.id, [0, 1], defs));
    expect(t.stacks[enemy.id].cards.map((c) => defs[c.id].code)).toEqual([
      'Y013',
    ]);
    expect(game.pileOf(t, y1)).toBe(deckStack(t, 'lost-pages')!.id);
  });

  it('turns the storybook over chapter by chapter, and back', () => {
    let t = apply(t0, (t) => revealStory(t, defs));
    t = apply(t, (t) => revealStory(t, defs));
    expect(storyProgress(t, defs)).toEqual({
      revealed: new Set(['Book Cover / Prologue', 'Chapter 1']),
      current: 'Chapter 1',
    });
    t = apply(t, unrevealStory);
    expect(storyProgress(t, defs).current).toBe('Book Cover / Prologue');
    expect(storySlot(t, 'story')!.cards.at(-1)).toEqual({
      id: game.card('Chapter 1'),
      faceUp: false,
    });
  });

  it('puts Y-cards under a chapter, and sends them to the Encounter Bar as they come up', () => {
    let t = apply(t0, (t) => revealStory(t, defs));
    t = apply(t, (t) =>
      putUnderChapter(t, game.pileOf(t, y1), 'Chapter 2', defs, [y1, y2]),
    );
    const story = storySlot(t, 'story')!;
    const chapter = story.cards.findIndex(
      (c) => c.id === game.card('Chapter 2'),
    );
    expect(
      story.cards.slice(chapter - 2, chapter + 1).map((c) => c.id),
    ).toEqual([y1, y2, game.card('Chapter 2')]);
    // Chapters 1 and 2 come up, then the Y-cards under Chapter 2 go into the Encounter Bar, face down, each first in
    // its row.
    t = [1, 2, 3, 4].reduce((t) => apply(t, (t) => revealStory(t, defs)), t);
    expect(storyProgress(t, defs).current).toBe('Chapter 2');
    const bar = stacksOnSpot(t, spot(t, 'bar'));
    expect(bar.map((id) => t.stacks[id].cards)).toEqual([
      [{ id: y1, faceUp: false }],
      [{ id: y2, faceUp: false }],
    ]);
  });

  it('types out the battlefield lying on the table as it was typed in', () => {
    const text = '01 07v 15v\n19 - 31';
    const t = apply(t0, (t) =>
      buildBattlefield(t, parseBattlefield(text).rows, defs),
    );
    expect(battlefieldText(t, defs)).toBe(text);
  });
});

describe('dragging a table pile', () => {
  const t0 = game.newGame();
  const { apply, defs } = game;
  const [y1, y2] = game.cardsOf('lost-pages', 2);
  const place = placeStack(t0, 'time-passes')!;
  const enemy = deckStack(t0, 'enemy')!;
  const story = storySlot(t0, 'story')!;
  // Two Y-cards in a pile, far from the areas.
  const [t1] = game.drop(t0, [y1, y2], -3000, -3000);
  const pile = game.pileOf(t1, y1);

  it('moves a pile whole by its grip, or a single card; a deck or the storybook never, a place by its grip', () => {
    expect(dragsWhole(t1.stacks[pile], false)).toBe(false);
    expect(dragsWhole(t1.stacks[pile], true)).toBe(true);
    const single = game.dropEach(t0, [y1], -3000, -3000);
    expect(dragsWhole(single.stacks[game.pileOf(single, y1)], false)).toBe(
      true,
    );
    expect(dragsWhole(enemy, true)).toBe(false);
    expect(dragsWhole(story, true)).toBe(false);
    expect(dragsWhole(storySlot(t0, 'story-revealed'), true)).toBe(false);
    expect(dragsWhole(place, false)).toBe(false);
    expect(dragsWhole(place, true)).toBe(true);
  });

  it('moves the cards that may leave the pile: all but its pinned ones, or the top one', () => {
    expect(movedCards(t1, pile, true)).toEqual([y1, y2]);
    expect(movedCards(t1, pile, false)).toEqual([y2]);
    expect(movedCards(t0, place.id, true)).toEqual(
      unpinned(place).map((c) => c.id),
    );
    // The Enemy Card lies on top of its deck for good.
    expect(movedCards(t0, enemy.id, false)).toEqual([]);
    expect(movedCards(t0, 'gone', true)).toEqual([]);
  });

  it('moves a pile itself when dragged whole, or a card alone on a grid place, but never a fixed pile', () => {
    expect(movingPile(t1, pile, true)).toBe(pile);
    expect(movingPile(t1, pile, false)).toBeNull();
    expect(movingPile(t0, place.id, true)).toBeNull();
    const [region] = game.cardsOf('region', 1);
    const first = gridPlaces(t0, 'map')[0];
    const [t2] = game.drop(t0, [region], first.x, first.y);
    const id = game.pileOf(t2, region);
    expect(gridOf(t2, id)).toBe('map');
    expect(movingPile(t2, id, false)).toBe(id);
  });

  it('drags only a revealed card that is no storybook card off the storybook, and no time card alone on its place', () => {
    expect(dragged(t1, defs, { id: pile, whole: true })).toEqual({
      id: pile,
      whole: true,
    });
    expect(dragged(t0, defs, { id: story.id, whole: false })).toBeNull();
    const revealed = apply(t0, (t) => revealStory(t, defs));
    const shown = storySlot(revealed, 'story-revealed')!;
    expect(dragged(revealed, defs, { id: shown.id, whole: true })).toBeNull();
    // A Y-card lying on the revealed cards leaves them as their top card.
    const withY = {
      ...revealed,
      stacks: {
        ...revealed.stacks,
        [shown.id]: {
          ...shown,
          cards: [...shown.cards, { id: y1, faceUp: true }],
        },
      },
    };
    expect(dragged(withY, defs, { id: shown.id, whole: true })).toEqual({
      id: shown.id,
      whole: false,
    });
    const [lifted] = liftPile(t0, place.id, { x: -3000, y: -3000 });
    expect(dragged(lifted, defs, { id: place.id, whole: true })).toBeNull();
    expect(dragged(lifted, defs, { id: place.id, whole: false })).toBeNull();
  });

  it('sends Y-cards dropped on the storybook under one of its chapters, other drops where placement() says', () => {
    expect(
      dropDestination(t1, defs, pile, true, story.x, story.y, null),
    ).toEqual({ story: story.id });
    // Over the storybook's pile alone doesn't decide: `intoStory` does, as for cards it can't take.
    expect(
      dropDestination(t1, defs, pile, true, -2000, -3000, story.id),
    ).toEqual(placement(t1, [y1, y2], defs, -2000, -3000, story.id, pile));
    expect(dropDestination(t1, defs, pile, false, -2000, -3000, null)).toEqual(
      placement(t1, [y2], defs, -2000, -3000, null, null),
    );
    expect(dropDestination(t1, defs, pile, true, -2000, -3000, null)).toEqual(
      placement(t1, [y1, y2], defs, -2000, -3000, null, pile),
    );
  });

  it('drops a pile whole or its top card, onto a pile or lying where it goes; a place keeps its time card', () => {
    const at = { x: -2000, y: -3000 };
    const moved = apply(t1, (t) =>
      dropOnTable(t, pile, true, { at, onto: null }, defs),
    );
    expect(moved.stacks[pile]).toMatchObject({ ...at, at });

    const taken = apply(t1, (t) =>
      dropOnTable(t, pile, false, { at, onto: null }, defs),
    );
    expect(taken.stacks[pile].cards.map((c) => c.id)).toEqual([y1]);
    expect(taken.stacks[game.pileOf(taken, y2)]).toMatchObject(at);

    const onto = apply(t1, (t) =>
      dropOnTable(t, pile, false, { at, onto: enemy.id }, defs),
    );
    expect(onto.stacks[enemy.id].cards.map((c) => c.id)).toContain(y2);

    const lifted = apply(t0, (t) =>
      dropOnTable(t, place.id, true, { at, onto: null }, defs),
    );
    expect(lifted.stacks[place.id].cards).toHaveLength(1);
    expect(lifted.stacks[game.pileOf(lifted, place.cards[1].id)].cards).toEqual(
      unpinned(place),
    );
  });
});
