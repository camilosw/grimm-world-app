// Why cards can't go where the player puts them, as a code with what wording it needs (`Refusal`): `placement()`'s
// `refused`, the game's `refusal()` for an area, and the drops and "Put under…" the UI refuses. The engine and the UI
// say which refusal it is; the game says it in words (`GameUI.refusalText`), so the texts, and one day their
// translations, are the game's.

import type { Area, Spot } from './areas';
import type { CardDef, DeckKind, Family, GridId, StorySlot } from './types';

export type Refusal =
  /** Nothing goes on top of a card lying on a grid ("Nothing goes on top of a Region Card on the Map"). */
  | { code: 'onto-grid-card'; grid: GridId }
  /** A card of another family dropped on a grid ("Only Region Cards go on the Map's places"). */
  | { code: 'grid-family'; grid: GridId }
  /** Several cards dropped on a grid, which takes one at a time. */
  | { code: 'grid-one-at-a-time'; grid: GridId }
  /** No free place left beside the grid's cards. */
  | { code: 'grid-no-free-place'; grid: GridId }
  /** A card going to the spot attracting it, dropped with cards of other families: it lies there alone. */
  | { code: 'spot-alone'; spot: Spot }
  /** Another card dropped on a spot attracting its own card ("Only the Character Card goes on its place"). */
  | { code: 'spot-own-card'; spot: Spot }
  /** A card of a family the spot doesn't take ("Only Encounter Cards go on the Goods place"). */
  | { code: 'spot-family'; spot: Spot }
  /** Several cards dropped on a row taking one card per place. */
  | { code: 'spot-one-at-a-time'; spot: Spot }
  /** A row of at most `max` cards, full. */
  | { code: 'spot-holds-at-most'; spot: Spot; max: number }
  /** A place for one card, taken. */
  | { code: 'spot-taken'; spot: Spot }
  /** The places of the area for its `family`, at most `max` cards, all taken ("…holds at most 3 Money Cards"). */
  | { code: 'area-holds-at-most'; area: Area; family: Family; max: number }
  /** A card of a family the area doesn't take (the game's `refusal()`). */
  | { code: 'area-family'; area: Area; family: Family }
  /** A card the deck may not hold. */
  | { code: 'deck-holds-not'; deck: DeckKind; card: CardDef }
  /** Cards dragged from a deck onto another. */
  | { code: 'deck-to-deck' }
  /** "Put under…" a pile whose cards go to a spot of their own (`spot`, if any) rather than under it. */
  | { code: 'stays-on-place'; spot: Spot | null }
  /** "Put under…" a fixed place that isn't sealed: nothing goes under it. */
  | { code: 'slot-takes-nothing'; slot: StorySlot };

/** A refusal's code. */
export type RefusalCode = Refusal['code'];
