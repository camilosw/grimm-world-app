import { family } from "./cards";
import type { CardDef, Stack, Table } from "./types";

export type DeckKind =
  | "storybook"
  | "encounter"
  | "time"
  | "x-encounters"
  | "lost-pages"
  | "regions"
  | "terrain"
  | "hitpoints"
  | "character"
  | "alignment"
  | "money"
  | "quest"
  | "enemy"
  | "training"
  | "banned";

export interface DeckSpec {
  kind: DeckKind;
  label: string;
  /** Shown while the deck is empty. */
  emptyHint?: string;
  /** What it may hold, for a deck lying in its own area on the table (shown in the area's header). */
  holdsText?: string;
  /** Facing of cards put into this deck. */
  faceUp: boolean;
  /** Where returned cards go: on top, underneath (rulebook: used Encounter Cards), or by card number. */
  insert: "top" | "bottom" | "sorted";
  /** Cards this deck may hold (rulebook chapter 6 and cards Y003/Y009). */
  holds: (def: CardDef) => boolean;
}

/** Numeric part of a Y-card number: "Y815c" → 815. */
function yNumber(def: CardDef): number | null {
  const m = /^Y(\d{3})/.exec(def.code ?? "");
  return m ? Number(m[1]) : null;
}

const isY = (def: CardDef) => family(def) === "lost-pages";
const yIn = (def: CardDef, ...ranges: [number, number][]) => {
  const n = yNumber(def);
  return (
    isY(def) && n !== null && ranges.some(([lo, hi]) => n >= lo && n <= hi)
  );
};

/** All decks. The storybook and the decks built during play (`TABLE_DECKS`) lie in their areas on the table; the others are in the sidebar, in this order. */
export const DECKS: DeckSpec[] = [
  // Y-cards are also put "into the corresponding chapters" of the Storybook Deck.
  {
    kind: "storybook",
    label: "Storybook",
    faceUp: false,
    insert: "top",
    holds: (d) => family(d) === "storybook" || isY(d),
  },
  // X-cards and the 'Time Passes'/'Next Chapter' card are placed under the Encounter Deck.
  {
    kind: "encounter",
    label: "Encounter Deck",
    faceUp: false,
    insert: "bottom",
    holds: (d) => family(d) === "encounter" || d.type === "time",
  },
  {
    kind: "time",
    label: "Time Card",
    faceUp: true,
    insert: "top",
    holds: (d) => d.type === "time",
  },
  {
    kind: "x-encounters",
    label: "X-Encounters",
    faceUp: true,
    insert: "sorted",
    holds: (d) => d.type === "encounter-x",
  },
  {
    kind: "lost-pages",
    label: "Lost Pages",
    faceUp: false,
    insert: "sorted",
    holds: isY,
  },
  {
    kind: "regions",
    label: "Regions",
    faceUp: false,
    insert: "sorted",
    holds: (d) => d.type === "region",
  },
  {
    kind: "terrain",
    label: "Terrain",
    faceUp: false,
    insert: "sorted",
    holds: (d) => d.type === "terrain",
  },
  {
    kind: "hitpoints",
    label: "Hit Points",
    faceUp: true,
    insert: "top",
    holds: (d) => d.type === "hitpoints",
  },
  {
    kind: "character",
    label: "Character",
    faceUp: true,
    insert: "top",
    holds: (d) => d.type === "character",
  },
  {
    kind: "alignment",
    label: "Alignment",
    faceUp: true,
    insert: "top",
    holds: (d) => d.type === "alignment",
  },
  {
    kind: "money",
    label: "Money",
    faceUp: true,
    insert: "top",
    holds: (d) => d.type === "money",
  },
  // Quest Cards are Y705–Y707 (Y009).
  {
    kind: "quest",
    label: "Quest Deck",
    emptyHint: "Built by card Y009",
    holdsText: "Quest Cards Y705–Y707",
    faceUp: true,
    insert: "top",
    holds: (d) => yIn(d, [705, 707]),
  },
  // The Enemy Card Y013 with the Enemy Cards Y800–Y849 underneath (Y009).
  {
    kind: "enemy",
    label: "Enemy Deck",
    emptyHint: "Built by card Y009",
    holdsText: "Y013, Y800–Y849",
    faceUp: true,
    insert: "bottom",
    holds: (d) => yIn(d, [13, 13], [800, 849]),
  },
  // The Training Card Y012 with training cards (Y749–Y799) underneath (Y003).
  {
    kind: "training",
    label: "Training Deck",
    emptyHint: "Built by card Y003",
    holdsText: "Y012, Y749–Y799",
    faceUp: true,
    insert: "bottom",
    holds: (d) => yIn(d, [12, 12], [749, 799]),
  },
  // Banished cards go under the 'Banned Cards' card Y011, whatever they are.
  {
    kind: "banned",
    label: "Banned Cards",
    emptyHint: "Y011 goes here",
    holdsText: "Any card",
    faceUp: true,
    insert: "bottom",
    holds: () => true,
  },
];

export const DECK_SPECS = Object.fromEntries(
  DECKS.map((d) => [d.kind, d]),
) as Record<DeckKind, DeckSpec>;

/**
 * Decks built during play (cards Y003 and Y009), each lying in its own area on the table: cards dropped there go into
 * it. Like the sidebar decks they stay when empty, can't be moved, and keep track of where their cards came from.
 */
export const TABLE_DECKS: DeckKind[] = ["quest", "enemy", "training", "banned"];

/** Decks shown in the sidebar (all but the storybook and the table decks). */
export const SIDEBAR_DECKS = DECKS.filter(
  (d) => d.kind !== "storybook" && !TABLE_DECKS.includes(d.kind),
);

/** The stack holding a deck. */
export function deckStack(t: Table, kind: DeckKind): Stack | undefined {
  return [...(t.dock ?? []), ...t.z]
    .map((id) => t.stacks[id])
    .find((s) => s.deck === kind);
}

/** The storybook's two places on the table. */
export function storySlot(
  t: Table,
  slot: "story" | "story-revealed",
): Stack | undefined {
  return t.z.map((id) => t.stacks[id]).find((s) => s.slot === slot);
}

/** The deck a card type starts in and goes back to by default. */
function defaultDeck(def: CardDef): DeckKind {
  switch (def.type) {
    case "storybook":
      return "storybook";
    case "encounter-b":
    case "encounter":
      return "encounter";
    case "encounter-x":
      return "x-encounters";
    case "time":
      return "time";
    case "region":
      return "regions";
    case "terrain":
      return "terrain";
    case "hitpoints":
      return "hitpoints";
    case "character":
      return "character";
    case "alignment":
      return "alignment";
    case "money":
      return "money";
    default:
      return "lost-pages";
  }
}

/**
 * The deck a card belongs to: the deck it last came out of (so an Enemy Card
 * goes back to the Enemy Deck), or else the deck of its type. The time card
 * always returns to its own slot, since the Encounter Deck only ever holds one.
 */
export function homeDeck(t: Table, def: CardDef): DeckKind {
  if (def.type === "time") return "time";
  const origin = t.origin?.[def.id];
  if (origin && origin !== "banned" && DECK_SPECS[origin].holds(def))
    return origin;
  return defaultDeck(def);
}
