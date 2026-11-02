// The game the engine plays (GameDefinition): its cards, decks, areas, spots, grids and fixed places, its texts and
// saves, and the rules only it knows. The game registers it with `setGame()` before anything is laid out; the engine
// and the UI read it with `game()`. The game's own kinds are named in `GameKinds` (types.ts).

import type { Area, Spot } from './areas';
import type { DeckSpec } from './decks';
import type { Point, Rect, Side } from './geometry';
import type {
  CardDef,
  CardManifest,
  DeckKind,
  Family,
  FixedPlace,
  GridId,
  Place,
  Table,
} from './types';

export interface GameDefinition {
  /** Prefix of what the game keeps on the device (`storage()`). */
  id: string;

  // ---------- cards ----------

  /** The family a card belongs to: what areas, spots, grids and their texts go by. */
  family(def: CardDef | undefined): Family | undefined;
  /** Whether a card lies landscape, printed sideways (`cardBox()` draws it across a portrait card's place). */
  isLandscape(def: CardDef | undefined): boolean;
  /** Whether a landscape card turns around (by 180°, `rotateStack()`); other landscape cards never rotate. */
  turnsAround(def: CardDef | undefined): boolean;
  /** The image of a card's side. */
  cardImage(id: string, faceUp: boolean, size: 'sm' | 'lg'): string;
  /** Whether a card of the card set is played with (others lie nowhere). */
  playable(def: CardDef): boolean;
  /** The table of a new game. */
  setup(manifest: CardManifest): Table;

  // ---------- decks ----------

  decks: Record<DeckKind, DeckSpec>;
  /** The deck a card goes back to, taken off the deck `from` if any. */
  homeDeck(t: Table, def: CardDef, from?: DeckKind): DeckKind;
  /** Whether cards taken off this deck may go back to their own decks (a deck built during play). */
  returnsCards(kind: DeckKind | undefined): boolean;

  // ---------- areas and spots ----------

  /** The areas, each at its own place: the layout moves them (`settleLayout()`). */
  areas: Area[];
  /** The areas framed around what lies in them (`allAreas()`), growing with it; the others keep their size. */
  growing: string[];
  /** The spots of the areas, each at its own place. */
  spots: Spot[];
  /** The spots lying beside a grid's cards on this table, which come and go with them. */
  gridSpots(t: Table): Spot[];
  /** Further boxes a growing area is framed around (beside its spots, grids and loose piles). */
  areaBoxes(t: Table, area: string): Rect[];
  /** Where the areas lie packed together (`now`: as they lie, framed), until the player moves one. */
  packedPlaces(t: Table, now: Map<string, Area>): Map<string, Rect>;

  // ---------- grids ----------

  /** The grids of landscape card places, each named after its area. */
  grids: GridId[];
  /** The family each grid takes. */
  gridFamily: Record<GridId, Family>;
  /** Depth of the strip beside a grid's card where a card dropped goes to the place beyond. */
  gridStrip: number;
  /** Top-left corner of a grid's first place (column 0, row 0), as its area lies on this table. */
  gridOrigin(t: Table, g: GridId): Point;
  /** Whether a grid grows beyond the `side` of its card in column `col`. */
  grows(g: GridId, col: number, side: Side): boolean;

  // ---------- fixed places ----------

  /** The spot a fixed place lies on, if any. */
  placeSpots: Partial<Record<FixedPlace, string>>;
  /** The area a fixed place lies in. */
  placeArea(place: FixedPlace): string | undefined;
  /** Where a fixed place not lying on a spot lies on this table. */
  placePoint(t: Table, place: FixedPlace): Point;
  /**
   * The places a deck's piles lie on: drawn as card places while empty, the cards arriving there turned face down,
   * their piles telling nothing of their size; cards dropped in their area go onto the nearest (`placement()`).
   */
  deckPlaces: { place: Place; label: string; hint?: string }[];
  /** Fixed places whose bottom card stays there for good (`pinned()`). */
  pinsBottom: Place[];
  /** Fixed places whose top card stays there for good (`pinnedOnTop()`), besides a deck's `DeckSpec.keeps`. */
  pinsTop: Place[];
  /**
   * The pile cards dropped with their top-left corner at (x, y) go under, for the player to pick where in it (the
   * face-down storybook, under a chapter), if they go there rather than where `placement()` says.
   */
  pickedPile(
    t: Table,
    cardIds: string[],
    defs: Record<string, CardDef>,
    x: number,
    y: number,
  ): string | null;

  // ---------- texts ----------

  /** A family's cards, for refusals: "Region Cards". */
  familyNames: Record<Family, string>;
  /** A card of a grid's family, as named on the table: "Region Card". */
  cardNames: Partial<Record<Family, string>>;
  /** Why these cards may not be put in `area` (null: they may; space outside the areas takes anything). */
  refusal(
    area: Area | null,
    cardIds: string[],
    defs: Record<string, CardDef>,
  ): string | null;

  // ---------- saves ----------

  /** A save of this game read back (migrated and checked), or a thrown error worded for the player. */
  readSave(text: string, manifest: CardManifest): Table;
  /** The save of a table. */
  saveText(t: Table): string;
  /** Keep the table on this device (the store's autosave). */
  autosave(t: Table): void;
  /** What else is wrong with a table, by the game's own rules (`tableProblems()`). */
  problems(t: Table, manifest: CardManifest): string[];
}

let current: GameDefinition | undefined;

/** Register the game the engine plays: before anything is laid out, as the engine reads it from then on. */
export function setGame(def: GameDefinition) {
  current = def;
}

/** The game the engine plays (`setGame()`). */
export function game(): GameDefinition {
  if (!current) throw new Error('No game registered: call setGame() first.');
  return current;
}

/** The family a card belongs to (`GameDefinition.family`). */
export function family(def: CardDef | undefined): Family | undefined {
  return game().family(def);
}

/** Whether a card lies landscape (`GameDefinition.isLandscape`). */
export function isLandscape(def: CardDef | undefined): boolean {
  return game().isLandscape(def);
}

/** The image of a card's side (`GameDefinition.cardImage`). */
export function cardImage(
  id: string,
  faceUp: boolean,
  size: 'sm' | 'lg',
): string {
  return game().cardImage(id, faceUp, size);
}
