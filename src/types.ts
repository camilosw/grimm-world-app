// Grimm World's own kinds: card types, the storybook's slots and the fixed places (the table's model is in
// src/lib/engine/types.ts).

export type CardType =
  | 'title'
  | 'character'
  | 'alignment'
  | 'money'
  | 'region'
  | 'terrain'
  | 'hitpoints'
  | 'storybook'
  | 'time'
  | 'encounter'
  | 'encounter-b'
  | 'encounter-x'
  | 'lost-pages';

export type StorySlot = 'story' | 'story-revealed';

/**
 * The Encounter Deck area's places, left to right: the 'Time Passes' and 'Next Chapter' cards, each for good at the
 * bottom of its place, with the Encounter Deck lying on one of them, and the used Encounter Cards.
 */
export type EncounterPlace = 'time-passes' | 'next-chapter' | 'used';

/** The table's fixed places: the Encounter Deck area's, and the Damage Card's in the Actions area, with the cards under it. */
export type Place = EncounterPlace | 'damage';
