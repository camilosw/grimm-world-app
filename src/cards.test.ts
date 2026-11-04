import { describe, expect, it } from 'vitest';
import { family } from './cards';
import {
  cardImage,
  compareCards,
  matchesQuery,
  queryTerms,
  readManifest,
} from './lib/engine/cards';
import { card } from './test/fixtures';

describe('family', () => {
  it('treats B- and X-Encounter Cards as Encounter Cards', () => {
    expect(family(card('B23', 'encounter-b'))).toBe('encounter');
    expect(family(card('X05', 'encounter-x'))).toBe('encounter');
    expect(family(card('Y003', 'lost-pages'))).toBe('lost-pages');
  });
});

describe('compareCards', () => {
  it('orders by printed number, numerically', () => {
    const cards = [
      card('Y291c', 'lost-pages'),
      card('Y010', 'lost-pages'),
      card('Y003', 'lost-pages'),
    ];
    expect(cards.sort(compareCards).map((c) => c.code)).toEqual([
      'Y003',
      'Y010',
      'Y291c',
    ]);
  });

  it('puts cards without a number last', () => {
    const unnumbered = { ...card('', 'title'), code: undefined };
    const numbered = card('Y003', 'lost-pages');
    expect(
      [unnumbered, numbered].sort(compareCards).map((c) => c.code),
    ).toEqual(['Y003', undefined]);
  });
});

describe('card search', () => {
  it('splits a query into lower-case terms', () => {
    expect(queryTerms(' 44, Wolf ,,')).toEqual(['44', 'wolf']);
    expect(queryTerms('  ')).toEqual([]);
  });

  it('finds a term anywhere in the number, name or type', () => {
    const wolf = { ...card('Y441', 'lost-pages'), name: 'The Wolf' };
    expect(matchesQuery(wolf, '44')).toBe(true);
    expect(matchesQuery(wolf, 'wolf')).toBe(true);
    expect(matchesQuery(wolf, 'lost')).toBe(true);
    expect(matchesQuery(wolf, '12, 99')).toBe(false);
    expect(matchesQuery(wolf, '')).toBe(true);
  });
});

describe('the card set', () => {
  const pipeline = {
    source: 'cards.pdf',
    cardSize: { width: 750, height: 1050 },
    cards: [
      {
        id: '001',
        sheet: 1,
        row: 0,
        col: 0,
        faces: {
          front: { lg: 'lg/001-front.webp', sm: 'sm/001-front.webp' },
          back: { lg: 'https://cdn.example/back.webp' },
        },
        type: 'title',
        name: 'Title',
        ocrUnverified: true,
      },
      {
        id: '002',
        faces: {
          front: { lg: '/img/002.webp' },
          back: { lg: 'back.webp' },
        },
        code: 'Y003',
        attrs: { colour: 'Turquoise', cost: 7, list: ['a'] },
      },
    ],
  };

  it('reads each card as the app knows it, leaving out where it was printed', () => {
    const [title, y] = readManifest(pipeline, '/cards/').cards;
    expect(title).toEqual({
      id: '001',
      type: 'title',
      name: 'Title',
      faces: {
        front: {
          lg: '/cards/lg/001-front.webp',
          sm: '/cards/sm/001-front.webp',
        },
        back: { lg: 'https://cdn.example/back.webp' },
      },
    });
    expect(y).toEqual({
      id: '002',
      code: 'Y003',
      faces: {
        front: { lg: '/img/002.webp' },
        back: { lg: '/cards/back.webp' },
      },
      attrs: { colour: 'Turquoise', cost: '7' },
    });
  });

  it('refuses a card set whose cards have no images', () => {
    expect(() =>
      readManifest({ cards: [{ id: '001', type: 'title' }] }, '/cards'),
    ).toThrow(/Card 001 has no images/);
    expect(() => readManifest({}, '/cards')).toThrow(/no cards/);
    expect(() => readManifest({ cards: [null] }, '/cards')).toThrow(
      /Card \? has no images/,
    );
  });

  it("shows a card's side, small unless only the large image is there", () => {
    const [title] = readManifest(pipeline, '/cards').cards;
    expect(cardImage(title, true, 'sm')).toBe('/cards/sm/001-front.webp');
    expect(cardImage(title, true, 'lg')).toBe('/cards/lg/001-front.webp');
    expect(cardImage(title, false, 'sm')).toBe('https://cdn.example/back.webp');
    expect(cardImage(undefined, true, 'sm')).toBeUndefined();
  });

  it('finds a card by its attrs', () => {
    const [, y] = readManifest(pipeline, '/cards').cards;
    expect(matchesQuery(y, 'turq')).toBe(true);
    expect(matchesQuery(y, 'pink')).toBe(false);
    expect(matchesQuery(y, '7')).toBe(true);
  });
});
