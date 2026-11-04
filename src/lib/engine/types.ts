// The table's model: cards, piles (Stack), where a pile lies (At), figures, the Table, and the names of the game's own
// kinds (GameKinds), which the game fills in.

/**
 * The game's own kinds, which the game names by adding to this interface (declaration merging, `declare module` in its
 * types.ts): `cardType` (`CardDef.type`), `family` (what areas, spots and grids take), `deck` (`Stack.deck`), `slot`
 * (`Stack.slot`), `place` (`Stack.place`) and `grid`. Each it leaves out is any string.
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- filled in by the game
export interface GameKinds {}

/** A kind the game named in `GameKinds`, else any string. */
type Kind<K extends string> =
  GameKinds extends Record<K, infer T extends string> ? T : string;

export type CardType = Kind<'cardType'>;
export type Family = Kind<'family'>;
export type DeckKind = Kind<'deck'>;
export type StorySlot = Kind<'slot'>;
export type Place = Kind<'place'>;
export type GridId = Kind<'grid'>;
/** What a pile on a fixed place lies on (`At`): its `Stack.place`, `slot` or `deck`. */
export type FixedPlace = Place | StorySlot | DeckKind;

/** The images of one side of a card: full size, and smaller for the table and lists (left out: the full one). */
export interface FaceImages {
  lg: string;
  sm?: string;
}

/**
 * One card of the card set (`CardManifest`): its kind, number and name, the images of its two sides, and whatever else
 * the game reads of it. Where the card was printed (sheet, row, column) is the pipeline's business, not the app's.
 */
export interface CardDef {
  id: string;
  type?: CardType;
  /** Printed card number, e.g. "Y003", "B23", "T07". */
  code?: string;
  name?: string;
  /** The images of its front and back (URLs). */
  faces: { front: FaceImages; back: FaceImages };
  /** Further facts the game reads of the card, which the search also looks through. */
  attrs?: Record<string, string>;
}

/** The card set the game is played with (`readManifest()`). */
export interface CardManifest {
  cards: CardDef[];
}

export interface CardRef {
  id: string;
  faceUp: boolean;
}

export type Rotation = 0 | 90 | 180 | 270;

/** A pile of one or more cards lying on the table. `cards` is bottom → top. */
export interface Stack {
  id: string;
  /**
   * Where a table pile is drawn (its top-left corner, as a portrait card's): worked out from its `at` and the layout by
   * `settle()` (`placePiles()` in areas.ts), so up to date on a settled table only; 0 for the piles off the table. Not
   * saved (from save format version 3): loading lays the piles out (`layOut()`).
   */
  x: number;
  y: number;
  rot: Rotation;
  cards: CardRef[];
  label?: string;
  /** Which deck this is (sidebar decks and the storybook). */
  deck?: DeckKind;
  /** Fixed places on the table: the face-down storybook and its revealed cards. */
  slot?: StorySlot;
  /** Fixed places: the Encounter Deck area's (the time card under the deck, and the used cards) and the Damage Card's. */
  place?: Place;
  /**
   * Where it lies on the table in the game's terms (table piles only, `z`): what the actions set (`placement()` says
   * where cards go) and the save holds, and what everything asks which spot, grid place, fixed place or area a pile lies
   * on (`stacksOnSpot()`, `spotOf()`, `gridOf()`, `placeStack()`, `areaOf()` in areas.ts); its `x, y` follow from it.
   * Only the migrations of saves from before version 3 read it off `x, y` (`settleAt()` in legacy/layout.ts).
   */
  at?: At;
}

/**
 * Where a table pile lies in the game's terms: on its fixed place (`Stack.place`, `slot` or `deck`, in that order), on a
 * grid's place, on a spot (`index`: its place in the spot's row, from the first; 0 for a spot of one place; half way
 * between two places' to go between them, until `settle()` numbers the row again), loose in an area (`x, y` from the
 * area's own corner in the game's `areas`, which the layout moves with it, `Table.shifts`), or loose outside the areas (`x, y` on
 * the table).
 */
export type At =
  | { place: FixedPlace }
  | { grid: GridId; col: number; row: number }
  | { spot: string; index: number }
  | { area: string; x: number; y: number }
  | { x: number; y: number };

export interface Token {
  id: string;
  x: number;
  y: number;
  color: string;
  shape: 'pawn' | 'cube';
}

export interface Table {
  stacks: Record<string, Stack>;
  /** Ids of the stacks lying on the table, from back to front. */
  z: string[];
  /** Ids of the decks kept in the sidebar, top to bottom. */
  dock?: string[];
  /** Ids of the piles set aside in the right sidebar (e.g. the setup cards), top to bottom. */
  tray?: string[];
  /** The sidebar deck each card last came out of, so it can go back there. */
  origin?: Record<string, DeckKind>;
  tokens: Token[];
  /** Version of the area layout the cards lie in (missing: before the Storybook area grew for its Encounter Card). */
  layout?: number;
  /**
   * How far each area lies from its place in `AREAS`, with its spots, as `settleLayout()` laid it out (missing: not
   * moved). Worked out from where the piles lie and `anchors`, so not saved (from save format version 3): loading lays
   * the areas out again (`layOut()`).
   */
  shifts?: Record<string, { x: number; y: number }>;
  /**
   * Where the player put each area (the top-left corner of its frame, by area id) once they dragged one: the areas then
   * lie there, pushed aside only by an area growing into them (`settleLayout()`). Missing: the areas lie packed together.
   */
  anchors?: Record<string, { x: number; y: number }>;
  nextId: number;
}

export interface View {
  x: number;
  y: number;
  scale: number;
}
