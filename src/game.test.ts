import { describe, expect, it } from 'vitest';
import { AREAS, gridFaceUp } from './areas';
import { grimmWorld, grimmWorldUI } from './game';
import { setStack } from './lib/engine/actions';
import { cellPlace, placeStack, spotsOf } from './lib/engine/areas';
import { storage } from './lib/engine/storage';
import { tableProblems } from './lib/engine/validate';
import { cardsOf, defs, drop, manifest, newGame } from './test/play';

describe("Grimm World's definition", () => {
  it('lays each fixed place where its pile lies in a new game', () => {
    const t = newGame();
    for (const place of [
      'story',
      'story-revealed',
      'time-passes',
      'next-chapter',
      'used',
      'quest',
      'enemy',
    ] as const) {
      const s = placeStack(t, place)!;
      expect(grimmWorld.placePoint(t, place)).toEqual({ x: s.x, y: s.y });
    }
  });

  it('frames the play areas, or the combat areas once Terrain Cards lie on the battlefield', () => {
    let t = newGame();
    expect(grimmWorldUI.fitAreas(t)).toContain('map');
    const first = cellPlace(t, 'battlefield', 0, 0);
    [t] = drop(t, cardsOf('terrain', 1), first.x, first.y);
    expect(grimmWorldUI.fitAreas(t)).toEqual([
      'character',
      'hand',
      'enemy',
      'battlefield',
    ]);
  });

  it('frames the battlefield around the place of its Enemy Cards too', () => {
    const t = newGame();
    const enemies = grimmWorld.areaBoxes(t, 'battlefield');
    expect(enemies).toHaveLength(1);
    expect(grimmWorld.areaBoxes(t, 'map')).toEqual([]);
    expect(grimmWorld.gridSpots(t).length).toBeGreaterThan(0);
  });

  it('refuses cards on a Terrain Card, even beside the Enemy Cards', () => {
    let t = newGame();
    const first = cellPlace(t, 'battlefield', 0, 0);
    const [terrain] = cardsOf('terrain', 1);
    [t] = drop(t, [terrain], first.x, first.y);
    const pile = Object.keys(t.stacks).find((id) =>
      t.stacks[id].cards.some((c) => c.id === terrain),
    )!;
    const enemy = spotsOf(t).find((s) => s.area === 'battlefield')!;
    const [, p] = drop(t, cardsOf('lost-pages', 1), enemy.x, enemy.y, pile);
    expect(p.refused).toEqual({ code: 'onto-grid-card', grid: 'battlefield' });
    expect(grimmWorldUI.refusalText(p.refused!)).toBe(
      'Nothing goes on top of a Terrain Card on the Battlefield',
    );
  });

  it('says what each area takes and why grid cards lie face up', () => {
    const map = AREAS.find((a) => a.id === 'map')!;
    expect(grimmWorldUI.acceptsText(map)).toContain('Regions');
    const quest = AREAS.find((a) => a.deck === 'quest')!;
    expect(grimmWorldUI.acceptsText(quest)).toBe(
      grimmWorld.decks.quest.holdsText ?? '',
    );
    expect(gridFaceUp('map')).toBe('Region Cards on the Map lie face up');
  });

  it('links a pile to the rulebook by its deck, its place or its top card', () => {
    const t = newGame();
    const rule = (id: string) => grimmWorldUI.rule(t.stacks[id], defs);
    expect(rule(placeStack(t, 'quest')!.id)).toBe('6.2.1');
    expect(rule(placeStack(t, 'used')!.id)).toBe('5.1');
    expect(rule(placeStack(t, 'damage')!.id)).toBe('4.7.9');
  });

  it('sends Y-cards dropped on the face-down storybook under one of its chapters', () => {
    const t = newGame();
    const story = placeStack(t, 'story')!;
    const [y] = cardsOf('lost-pages', 1);
    expect(grimmWorld.pickedPile(t, [y], defs, story.x, story.y)).toBe(
      story.id,
    );
    const [b] = cardsOf('encounter-b', 1);
    expect(grimmWorld.pickedPile(t, [b], defs, story.x, story.y)).toBeNull();
  });

  it('lets only a revealed card that is no storybook card be dragged off the storybook', () => {
    const [y] = cardsOf('lost-pages', 1);
    const [chapter] = cardsOf('storybook', 1);
    const { story, 'story-revealed': revealed } = grimmWorld.slots;
    expect(revealed.gives(defs[y])).toBe(true);
    expect(revealed.gives(defs[chapter])).toBe(false);
    // A card the card set doesn't know: not a storybook card.
    expect(revealed.gives(undefined)).toBe(true);
    expect(story.gives(defs[y])).toBe(false);
    // Only the face-down storybook's cards are moved by the game alone, between its chapters.
    expect(story.sealed).toBe(true);
    expect(revealed.sealed).toBeFalsy();
  });

  it('finds time cards and the Damage Card off their places', () => {
    const t = newGame();
    expect(grimmWorld.problems(t, manifest)).toEqual([]);
    const damage = placeStack(t, 'damage')!;
    const time = placeStack(t, 'time-passes')!;
    // As a table could only come to be by a bug: nothing settles it.
    const [y] = cardsOf('lost-pages', 1);
    const broken = setStack(
      setStack(t, {
        ...damage,
        cards: [...damage.cards, { id: y, faceUp: true }],
      }),
      { ...time, cards: [...time.cards].reverse() },
    );
    expect(tableProblems(broken, manifest)).toEqual(
      expect.arrayContaining([
        `pile ${time.id} holds a time card off its place's bottom`,
        'the time-passes place has lost its time card',
        'the Damage Card is not on top of its place',
      ]),
    );
  });

  it("keeps the device's values under the game's prefix", () => {
    storage('test-key').set('1');
    expect(localStorage.getItem('grimm-world:test-key')).toBe('1');
    storage('test-key').remove();
    expect(localStorage.getItem('grimm-world:test-key')).toBeNull();
  });
});
