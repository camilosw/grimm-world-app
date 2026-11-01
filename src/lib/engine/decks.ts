// What a deck is (DeckSpec) and finding its pile. The decks themselves are the game's (src/decks.ts).

// oxlint-disable-next-line no-restricted-imports -- B2
import type { DeckKind } from '../../decks';
import type { CardDef, Stack, Table } from './types';

export interface DeckSpec {
  kind: DeckKind;
  label: string;
  /** Shown while the deck is empty. */
  emptyHint?: string;
  /** What it may hold, for a deck lying in its own area on the table (shown in the area's header). */
  holdsText?: string;
  /** Facing of cards put into this deck; left out, they keep the side they show. */
  faceUp?: boolean;
  /** Where returned cards go: on top, underneath (rulebook: used Encounter Cards), or by card number. */
  insert: 'top' | 'bottom' | 'sorted';
  /** Cards this deck may hold (rulebook chapter 6 and cards Y003/Y009). */
  holds: (def: CardDef) => boolean;
  /**
   * Number of the card lying on top of this deck for good, the other cards under it: it never leaves the deck
   * (`pinnedOnTop()` in actions.ts; put there by `addDeckCards()` in setup.ts, and in older saves by legacy/migrate.ts).
   */
  keeps?: string;
}

/**
 * The stack holding a deck. The Encounter Deck lies on one of two places (on the 'Time Passes' or the 'Next Chapter'
 * card): the one with the most cards, the 'Time Passes' place when even.
 */
export function deckStack(t: Table, kind: DeckKind): Stack | undefined {
  return [...(t.dock ?? []), ...t.z]
    .map((id) => t.stacks[id])
    .filter((s) => s.deck === kind)
    .reduce<Stack | undefined>(
      (most, s) => (!most || s.cards.length > most.cards.length ? s : most),
      undefined,
    );
}
