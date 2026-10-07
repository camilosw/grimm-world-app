import { describe, expect, it } from 'vitest';
import { DECK_SPECS, homeDeck } from './decks';
import { card, table } from './test/fixtures';

describe('what the campaign decks hold', () => {
  it('takes only its own Y-cards into the Enemy Deck', () => {
    const { holds } = DECK_SPECS.enemy;
    expect(holds(card('Y013', 'lost-pages'))).toBe(true);
    expect(holds(card('Y800', 'lost-pages'))).toBe(true);
    expect(holds(card('Y849', 'lost-pages'))).toBe(true);
    expect(holds(card('Y850', 'lost-pages'))).toBe(false);
    expect(holds(card('Y012', 'lost-pages'))).toBe(false);
    expect(holds(card('B13', 'encounter-b'))).toBe(false);
  });

  it('takes only the Quest Cards into the Quest Deck', () => {
    const { holds } = DECK_SPECS.quest;
    expect(holds(card('Y705', 'lost-pages'))).toBe(true);
    expect(holds(card('Y707', 'lost-pages'))).toBe(true);
    expect(holds(card('Y708', 'lost-pages'))).toBe(false);
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
    const enemy = { ...table(), origin: { [y.id]: 'enemy' as const } };
    expect(homeDeck(enemy, y)).toBe('lost-pages');
  });
});
