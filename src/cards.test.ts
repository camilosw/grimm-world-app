import { describe, expect, it } from 'vitest';
import { compareCards, family, matchesQuery, queryTerms } from './cards';
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
