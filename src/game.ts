// Grimm World as the engine and the generic UI play it: its GameDefinition and GameUI, gathered from the game's
// modules, and `registerGame()`, which hands both over (main.tsx, and the tests' setup).

import { AreaIcon } from './AreaIcon';
import { banish } from './commands';
import {
  acceptsText,
  AREAS,
  areaBoxes,
  battlefieldInUse,
  COMBAT_AREAS,
  ENCOUNTER_PLACES,
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
import { family, isLandscape, turnsAround } from './cards';
import { DECK_SPECS, homeDeck, returnsCards, storySlot } from './decks';
import { About } from './GameDialogs';
import { type GameDefinition, setGame } from './lib/engine/game';
import { FIGURE_COMMANDS, PILE_COMMANDS } from './lib/ui/commands';
import { type GameUI, setGameUI } from './lib/ui/gameUI';
import { RULES_CONTENT } from './rulesContent';
import { refusalText } from './refusals';
import { readSave, saveText } from './save';
import { initialTable, isPlayable } from './setup';
import { intoStory, STORY_SLOT_SPECS } from './storybook';
import { gameProblems } from './validate';

export const grimmWorld: GameDefinition = {
  id: 'grimm-world',

  family,
  isLandscape,
  turnsAround,
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
  slots: STORY_SLOT_SPECS,
  pinsBottom: PINNED_BOTTOM,
  pinsTop: PINNED_TOP,
  // Cards the storybook may hold, dropped on it, go under one of its chapters (the chapter picker).
  pickedPile: (t, cardIds, defs, x, y) =>
    intoStory(t, cardIds, defs, x, y)
      ? (storySlot(t, 'story')?.id ?? null)
      : null,

  refusal,

  readSave,
  saveText,
  problems: gameProblems,
};

export const grimmWorldUI: GameUI = {
  AreaIcon,
  railAreas: RAIL_AREAS,
  // The areas used in every round, or in a combat, while Terrain Cards lie on the battlefield, those used in it.
  fitAreas: (t) => (battlefieldInUse(t) ? COMBAT_AREAS : PLAY_AREAS),
  acceptsText,
  refusalText,
  gridStart: {
    map: { label: 'Region Card', hint: 'start the map here' },
    battlefield: {
      label: 'Terrain Card',
      hint: 'build the battlefield from here',
    },
  },
  texts: {
    tray: 'Hand',
    findPlaceholder: 'Card numbers or names, e.g. Y003, B12, Chapter 3',
    nameExample: 'Encounter Deck',
    filterExample: 'Y003, B12, Terrain…',
    putUnderTargets: 'a pile, a deck or the storybook',
  },
  // The Player marker, the character and an ally, and the enemies in their four colours.
  figures: [
    { label: 'Player marker', color: '#e8e2d6', shape: 'cube' },
    { label: 'Character', color: '#8a8f98', shape: 'pawn' },
    { label: 'Ally', color: '#7b4fb5', shape: 'pawn' },
    { label: 'Enemy yellow', color: '#f2c318', shape: 'pawn' },
    { label: 'Enemy turquoise', color: '#1fb5b0', shape: 'pawn' },
    { label: 'Enemy black', color: '#1d1d1f', shape: 'pawn' },
    { label: 'Enemy pink', color: '#e75aa6', shape: 'pawn' },
  ],
  About,
  content: RULES_CONTENT,
  pileCommands: [
    PILE_COMMANDS.draw,
    PILE_COMMANDS.flip,
    PILE_COMMANDS.topToBottom,
    PILE_COMMANDS.browse,
    PILE_COMMANDS.shuffle,
    PILE_COMMANDS.sort,
    PILE_COMMANDS.view,
    PILE_COMMANDS.rotate,
    PILE_COMMANDS.turnAround,
    PILE_COMMANDS.putUnder,
    PILE_COMMANDS.turnOver,
    PILE_COMMANDS.front,
    PILE_COMMANDS.back,
    PILE_COMMANDS.toTable,
    banish,
    PILE_COMMANDS.returnToDeck,
    PILE_COMMANDS.name,
    PILE_COMMANDS.content,
  ],
  figureCommands: [FIGURE_COMMANDS.remove],
};

/** Hand Grimm World over to the engine and the UI, before anything is laid out or drawn. */
export function registerGame() {
  setGame(grimmWorld);
  setGameUI(grimmWorldUI);
}
