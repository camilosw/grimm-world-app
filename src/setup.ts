import { addStack, settle, shuffled, takeCard } from './actions';
import { compareCards } from './cards';
import { ENCOUNTER_PLACES } from './areas';
import { LAYOUT } from './legacy/migrate';
import {
  DECK_SPECS,
  DECKS,
  deckStack,
  SIDEBAR_DECKS,
  TABLE_DECKS,
  type DeckKind,
} from './decks';
import type {
  CardDef,
  CardManifest,
  CardRef,
  EncounterPlace,
  Table,
} from './types';

/** Every card used in play: all of them except the title card. */
export function playableCards(manifest: CardManifest): CardDef[] {
  return manifest.cards.filter((c) => c.type !== 'title');
}

/** Starting contents of each deck, bottom → top (rulebook chapter 6.1). */
function deckContents(cards: CardDef[]): Record<DeckKind, CardDef[]> {
  const byType = (...types: string[]) =>
    cards.filter((c) => c.type && types.includes(c.type));
  const sorted = (list: CardDef[]) =>
    [...list].sort((a, b) => compareCards(b, a));
  const inOrder = (list: CardDef[]) => [...list].reverse();
  const indexed = cards.some((c) => c.type);
  return {
    // Book Cover on top, then Chapter 1–14, the Epilogue and the Book Back Side.
    storybook: inOrder(byType('storybook')),
    // Shuffled B-Encounter Cards, lying on the 'Time Passes' card (`initialTable()`).
    encounter: shuffled(byType('encounter-b', 'encounter')),
    'x-encounters': sorted(byType('encounter-x')),
    // Without card types (scripts/index_cards.py not run) everything lands here.
    'lost-pages': indexed ? sorted(byType('lost-pages')) : inOrder(cards),
    regions: sorted(byType('region')),
    terrain: sorted(byType('terrain')),
    hitpoints: inOrder(byType('hitpoints')),
    character: byType('character'),
    alignment: inOrder(byType('alignment')),
    money: inOrder(byType('money')),
    quest: [],
    enemy: [],
    training: [],
    banned: [],
  };
}

/**
 * Sort the cards into decks as described in the rulebook, chapter 6.1
 * "Game Setup". The storybook, the Encounter Deck (on the 'Time Passes' card,
 * beside the 'Next Chapter' card) and the (empty) decks built during play lie in
 * their areas; all other decks start in the sidebar; the table itself is empty.
 */
export function initialTable(manifest: CardManifest): Table {
  const cards = playableCards(manifest);
  const contents = deckContents(cards);
  let table: Table = {
    stacks: {},
    z: [],
    tokens: [],
    layout: LAYOUT,
    nextId: 1,
  };
  for (const spec of SIDEBAR_DECKS) {
    const cards = contents[spec.kind].map((c) => ({
      id: c.id,
      faceUp: spec.faceUp ?? true,
    }));
    table = addStack(table, { x: 0, y: 0 }, cards, {
      label: spec.label,
      deck: spec.kind,
    })[0];
  }
  table = { ...table, dock: table.z, z: [] };
  const story = contents.storybook.map((c) => ({ id: c.id, faceUp: false }));
  // Face down: their hourglass backs show.
  const timeCard = (name: string) =>
    cards
      .filter((c) => c.type === 'time' && c.name === name)
      .map((c) => ({ id: c.id, faceUp: false }));
  const deck = contents.encounter.map((c) => ({
    id: c.id,
    faceUp: DECK_SPECS.encounter.faceUp ?? false,
  }));
  const places = {
    'time-passes': [...timeCard('Time Passes'), ...deck],
    'next-chapter': timeCard('Next Chapter'),
    used: [],
  };
  const defs = Object.fromEntries(cards.map((c) => [c.id, c]));
  return settle(
    addDeckCards(
      addDamagePlace(
        addEncounterPlaces(layDecks(addStorySlots(table, story)), places),
        defs,
      ),
      defs,
    ),
  );
}

/**
 * The Enemy Card (Y013), the Training Card (Y012) and the Banned Cards card (Y011) on top of their decks, face up, for good (`DeckSpec.keeps`),
 * taken from wherever they are.
 */
function addDeckCards(t: Table, defs: Record<string, CardDef>): Table {
  return DECKS.reduce((next, spec) => {
    const def = spec.keeps
      ? Object.values(defs).find((d) => d.code === spec.keeps)
      : undefined;
    if (!def || deckStack(next, spec.kind)?.cards.at(-1)?.id === def.id)
      return next;
    const [t2, card] = takeCard(next, def.id);
    const deck = deckStack(t2, spec.kind);
    if (!card || !deck) return next;
    return {
      ...t2,
      stacks: {
        ...t2.stacks,
        [deck.id]: {
          ...deck,
          cards: [...deck.cards, { ...card, faceUp: true }],
        },
      },
    };
  }, t);
}

/** The Damage Card's place in the Actions area, with the Damage Card (Y010) face up on it for good. */
function addDamagePlace(t: Table, defs: Record<string, CardDef>): Table {
  const def = Object.values(defs).find((d) => d.code === 'Y010');
  const [next, card] = def ? takeCard(t, def.id) : [t, null];
  return addStack(
    next,
    { place: 'damage' },
    card ? [{ ...card, faceUp: true }] : [],
    { label: 'Damage Card', place: 'damage' },
  )[0];
}

/**
 * The Encounter Deck area's places (`ENCOUNTER_PLACES`), with these cards. The two with a time card hold the Encounter
 * Deck, when it lies there.
 */
function addEncounterPlaces(
  t: Table,
  piles: Record<EncounterPlace, CardRef[]>,
): Table {
  return ENCOUNTER_PLACES.reduce((next, { place }) => {
    const kind =
      place === 'used'
        ? { label: 'Used Cards' }
        : { label: DECK_SPECS.encounter.label, deck: 'encounter' as const };
    return addStack(next, { place }, piles[place], { ...kind, place })[0];
  }, t);
}

/** The storybook's two fixed places in its area: the face-down deck (right) and the revealed cards (left), none yet. */
function addStorySlots(t: Table, story: CardRef[]): Table {
  const [t2] = addStack(t, { place: 'story' }, story, {
    label: 'Storybook',
    deck: 'storybook',
    slot: 'story',
  });
  const [t3] = addStack(t2, { place: 'story-revealed' }, [], {
    slot: 'story-revealed',
  });
  return t3;
}

/** The decks built during play (`TABLE_DECKS`), empty, each on its place in its own area. */
function layDecks(t: Table): Table {
  return TABLE_DECKS.reduce(
    (next, kind) =>
      addStack(next, { place: kind }, [], {
        label: DECK_SPECS[kind].label,
        deck: kind,
      })[0],
    t,
  );
}
