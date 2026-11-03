import { describe, expect, it } from 'vitest';
import { AREAS, SPOTS } from './areas';
import type { Refusal, RefusalCode } from './lib/engine/refusals';
import { refusalText } from './refusals';
import { card, defs } from './test/play';

const spot = (id: string) => SPOTS.find((s) => s.id === id)!;
const area = (id: string) => AREAS.find((a) => a.id === id)!;

/** A refusal of each code, and what the player is told (as before refusals became codes). */
const SAID: Record<RefusalCode, [Refusal, string]> = {
  'onto-grid-card': [
    { code: 'onto-grid-card', grid: 'map' },
    'Nothing goes on top of a Region Card on the Map',
  ],
  'grid-family': [
    { code: 'grid-family', grid: 'battlefield' },
    "Only Terrain Cards go on the Battlefield's places",
  ],
  'grid-one-at-a-time': [
    { code: 'grid-one-at-a-time', grid: 'map' },
    'Put Region Cards on the Map one at a time',
  ],
  'grid-no-free-place': [
    { code: 'grid-no-free-place', grid: 'map' },
    "There is no free place beside the Map's cards",
  ],
  'spot-alone': [
    { code: 'spot-alone', spot: spot('character') },
    'The Character Card lies alone on its place in the Character area',
  ],
  'spot-own-card': [
    { code: 'spot-own-card', spot: spot('character') },
    'Only the Character Card goes on its place',
  ],
  'spot-family': [
    { code: 'spot-family', spot: spot('goods') },
    'Only Encounter Cards go on the Goods place',
  ],
  'spot-one-at-a-time': [
    { code: 'spot-one-at-a-time', spot: spot('goods') },
    'Put Encounter Cards on the Goods place one at a time',
  ],
  'spot-holds-at-most': [
    { code: 'spot-holds-at-most', spot: spot('home-goods'), max: 16 },
    'The Goods place in the Home area holds at most 16 cards',
  ],
  'spot-taken': [
    { code: 'spot-taken', spot: spot('storage') },
    'There is already a card on the Storage Card place in the Storage area',
  ],
  'area-holds-at-most': [
    {
      code: 'area-holds-at-most',
      area: area('storage'),
      family: 'money',
      max: 3,
    },
    'The Storage area holds at most 3 Money Cards',
  ],
  'area-family': [
    { code: 'area-family', area: area('storage'), family: 'terrain' },
    'Terrain Cards belong in the Battlefield',
  ],
  'deck-holds-not': [
    { code: 'deck-holds-not', deck: 'enemy', card: defs[card('Martha')] },
    "Martha can't go into the Enemy Deck",
  ],
  'deck-to-deck': [
    { code: 'deck-to-deck' },
    "Cards can't move from one deck to another",
  ],
  'stays-on-place': [
    { code: 'stays-on-place', spot: spot('character') },
    'The Character Card stays on its place',
  ],
  'slot-takes-nothing': [
    { code: 'slot-takes-nothing', slot: 'story-revealed' },
    'Put cards under the storybook itself (the right-hand card)',
  ],
};

describe('refusalText', () => {
  it.each(Object.entries(SAID))('words %s', (code, [r, text]) => {
    expect(r.code).toBe(code);
    expect(refusalText(r)).toBe(text);
  });

  it("says where a family's cards belong, or that they don't belong here", () => {
    const r = { code: 'area-family', family: 'region' } as const;
    expect(refusalText({ ...r, area: area('storage') })).toBe(
      'Region Cards belong in the Map area',
    );
    expect(
      refusalText({
        code: 'area-family',
        area: area('map'),
        family: 'lost-pages',
      }),
    ).toBe("Lost Pages Cards don't belong in the Map area");
  });

  it('words a refusal without a spot or of a sealed place plainly', () => {
    expect(refusalText({ code: 'stays-on-place', spot: null })).toBe(
      'The card stays on its place',
    );
    expect(refusalText({ code: 'slot-takes-nothing', slot: 'story' })).toBe(
      "Cards can't go there",
    );
  });
});
