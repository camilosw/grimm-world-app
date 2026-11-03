// The game's words for the refusals the engine and the UI give as codes (`Refusal`, `GameUI.refusalText`): what the
// player is told when cards can't go where they are put.

import {
  AREAS,
  CARD_NAMES,
  FAMILY_NAMES,
  GRID_FAMILY,
  gridLabel,
  HOME_AREA,
} from './areas';
import { DECK_SPECS } from './decks';
import type { Spot } from './lib/engine/areas';
import type { Refusal } from './lib/engine/refusals';
import type { GridId } from './lib/engine/types';

/** The names of the card families a spot takes, e.g. "Encounter Cards and Lost Pages Cards". */
function familiesOf(spot: Spot): string {
  return [spot.accepts.family, ...(spot.accepts.also ?? [])]
    .map((f) => FAMILY_NAMES[f])
    .join(' and ');
}

/** An area's label. */
function areaLabel(id: string): string {
  return AREAS.find((a) => a.id === id)!.label;
}

/** The cards a grid takes: "Region Cards". */
const gridCards = (g: GridId) => FAMILY_NAMES[GRID_FAMILY[g]];

/** A refusal in words, as the player is told it. */
export function refusalText(r: Refusal): string {
  switch (r.code) {
    case 'onto-grid-card':
      return `Nothing goes on top of a ${CARD_NAMES[GRID_FAMILY[r.grid]]} on the ${gridLabel(r.grid)}`;
    case 'grid-family':
      return `Only ${gridCards(r.grid)} go on the ${gridLabel(r.grid)}'s places`;
    case 'grid-one-at-a-time':
      return `Put ${gridCards(r.grid)} on the ${gridLabel(r.grid)} one at a time`;
    case 'grid-no-free-place':
      return `There is no free place beside the ${gridLabel(r.grid)}'s cards`;
    case 'spot-alone':
      return `The ${r.spot.label} lies alone on its place in the ${areaLabel(r.spot.area)} area`;
    case 'spot-own-card':
      return `Only the ${r.spot.label} goes on its place`;
    case 'spot-family':
      return `Only ${familiesOf(r.spot)} go on the ${r.spot.label} place`;
    case 'spot-one-at-a-time':
      return `Put ${familiesOf(r.spot)} on the ${r.spot.label} place one at a time`;
    case 'spot-holds-at-most':
      return `The ${r.spot.label} place in the ${areaLabel(r.spot.area)} area holds at most ${r.max} cards`;
    case 'spot-taken':
      return `There is already a card on the ${r.spot.label} place in the ${areaLabel(r.spot.area)} area`;
    case 'area-holds-at-most':
      return `The ${r.area.label} area holds at most ${r.max} ${FAMILY_NAMES[r.family]}`;
    case 'area-family': {
      const home = HOME_AREA[r.family];
      if (!home)
        return `${FAMILY_NAMES[r.family]} don't belong in the ${r.area.label} area`;
      return `${FAMILY_NAMES[r.family]} belong in ${home === 'battlefield' ? 'the Battlefield' : `the ${areaLabel(home)} area`}`;
    }
    case 'deck-holds-not':
      return `${r.card.code ?? r.card.name ?? 'This card'} can't go into the ${DECK_SPECS[r.deck].label}`;
    case 'deck-to-deck':
      return "Cards can't move from one deck to another";
    case 'stays-on-place':
      return `The ${r.spot?.label ?? 'card'} stays on its place`;
    case 'slot-takes-nothing':
      return r.slot === 'story-revealed'
        ? 'Put cards under the storybook itself (the right-hand card)'
        : "Cards can't go there";
  }
}
