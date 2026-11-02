// Grimm World as the engine and the generic UI play it: its GameDefinition and GameUI, gathered from the game's
// modules, and `registerGame()`, which hands both over (main.tsx, and the tests' setup).

import { AreaIcon } from './AreaIcon';
import {
  acceptsText,
  AREAS,
  areaBoxes,
  battlefieldInUse,
  CARD_NAMES,
  COMBAT_AREAS,
  ENCOUNTER_PLACES,
  FAMILY_NAMES,
  GRID_FAMILY,
  GRID_STRIP,
  gridOrigin,
  GRIDS,
  gridSpots,
  GROWING,
  grows,
  packedPlaces,
  PINNED_BOTTOM,
  PINNED_TOP,
  PLACE_SPOTS,
  placeArea,
  placePoint,
  PLAY_AREAS,
  RAIL_AREAS,
  refusal,
  SPOTS,
} from './areas';
import { cardImage, family, isLandscape, turnsAround } from './cards';
import { DECK_SPECS, homeDeck, returnsCards, storySlot } from './decks';
import { type GameDefinition, setGame } from './lib/engine/game';
import { type GameUI, setGameUI } from './lib/ui/gameUI';
import { pileRule } from './rules';
import { readSave, saveText, writeGame } from './save';
import { initialTable, isPlayable } from './setup';
import { intoStory } from './storybook';
import { gameProblems } from './validate';

export const grimmWorld: GameDefinition = {
  id: 'grimm-world',

  family,
  isLandscape,
  turnsAround,
  cardImage,
  playable: isPlayable,
  setup: initialTable,

  decks: DECK_SPECS,
  homeDeck,
  returnsCards,

  areas: AREAS,
  growing: GROWING,
  spots: SPOTS,
  gridSpots,
  areaBoxes,
  packedPlaces,

  grids: GRIDS,
  gridFamily: GRID_FAMILY,
  gridStrip: GRID_STRIP,
  gridOrigin,
  grows,

  placeSpots: PLACE_SPOTS,
  placeArea,
  placePoint,
  deckPlaces: ENCOUNTER_PLACES,
  pinsBottom: PINNED_BOTTOM,
  pinsTop: PINNED_TOP,
  // Cards the storybook may hold, dropped on it, go under one of its chapters (the chapter picker).
  pickedPile: (t, cardIds, defs, x, y) =>
    intoStory(t, cardIds, defs, x, y)
      ? (storySlot(t, 'story')?.id ?? null)
      : null,

  familyNames: FAMILY_NAMES,
  cardNames: CARD_NAMES,
  refusal,

  readSave,
  saveText,
  autosave: writeGame,
  problems: gameProblems,
};

export const grimmWorldUI: GameUI = {
  AreaIcon,
  railAreas: RAIL_AREAS,
  // The areas used in every round, or in a combat, while Terrain Cards lie on the battlefield, those used in it.
  fitAreas: (t) => (battlefieldInUse(t) ? COMBAT_AREAS : PLAY_AREAS),
  acceptsText,
  gridStart: {
    map: { label: 'Region Card', hint: 'start the map here' },
    battlefield: {
      label: 'Terrain Card',
      hint: 'build the battlefield from here',
    },
  },
  rule: pileRule,
};

/** Hand Grimm World over to the engine and the UI, before anything is laid out or drawn. */
export function registerGame() {
  setGame(grimmWorld);
  setGameUI(grimmWorldUI);
}
