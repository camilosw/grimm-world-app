import { describe, expect, it } from 'vitest';
import { DECK_SPECS, homeDeck } from './decks';
import { card, table } from './test/fixtures';

describe('what the campaign decks hold', () => {
  it('takes any Y-card into the Enemy, Quest and Training Decks', () => {
    for (const kind of ['enemy', 'quest', 'training'] as const) {
      const { holds } = DECK_SPECS[kind];
      for (const code of ['Y013', 'Y705', 'Y760', 'Y800', 'Y291c'])
        expect(holds(card(code, 'lost-pages'))).toBe(true);
      expect(holds(card('B13', 'encounter-b'))).toBe(false);
      expect(holds(card('X05', 'encounter-x'))).toBe(false);
      expect(holds(card('R1-111', 'region'))).toBe(false);
    }
  });

  it('takes any card into Banned Cards', () => {
    expect(DECK_SPECS.banned.holds(card('R1-111', 'region'))).toBe(true);
  });
});

describe('homeDeck', () => {
  it('sends a card back to the deck it came out of', () => {
    const y = card('Y760', 'lost-pages');
    const t = { ...table(), origin: { [y.id]: 'training' as const } };
    expect(homeDeck(t, y)).toBe('training');
  });

  it('uses the default deck for its type when there is no such deck', () => {
    expect(homeDeck(table(), card('Y760', 'lost-pages'))).toBe('lost-pages');
    expect(homeDeck(table(), card('X05', 'encounter-x'))).toBe('x-encounters');
    expect(homeDeck(table(), card('B23', 'encounter-b'))).toBe('encounter');
  });

  it('never sends a card back to Banned Cards, nor to a deck that refuses it', () => {
    const y = card('Y760', 'lost-pages');
    const banned = { ...table(), origin: { [y.id]: 'banned' as const } };
    expect(homeDeck(banned, y)).toBe('lost-pages');
    const x = card('X05', 'encounter-x');
    const enemy = { ...table(), origin: { [x.id]: 'enemy' as const } };
    expect(homeDeck(enemy, x)).toBe('x-encounters');
  });
});
