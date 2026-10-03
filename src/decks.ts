import { family } from "./cards";
import type { CardDef, Stack, Table } from "./types";

export type DeckKind =
  | "storybook"
  | "encounter"
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
  /** Facing of cards put into this deck; left out, they keep the side they show. */
  faceUp?: boolean;
  /** Where returned cards go: on top, underneath (rulebook: used Encounter Cards), or by card number. */
  insert: "top" | "bottom" | "sorted";
  /** Cards this deck may hold (rulebook chapter 6 and cards Y003/Y009). */
  holds: (def: CardDef) => boolean;
  /**
   * Number of the card lying on top of this deck for good, the other cards under it: it never leaves the deck
   * (`pinnedOnTop()` in actions.ts; put there by `addDeckCards()` in setup.ts).
   */
  keeps?: string;
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

/**
 * All decks. The storybook, the Encounter Deck and the decks built during play (`TABLE_DECKS`) lie in their areas on the
 * table; the others are in the sidebar, in this order.
 */
export const DECKS: DeckSpec[] = [
  // Y-cards are also put "into the corresponding chapters" of the Storybook Deck.
  {
    kind: "storybook",
    label: "Storybook",
    faceUp: false,
    insert: "top",
    holds: (d) => family(d) === "storybook" || isY(d),
  },
  // X-cards are placed under the Encounter Deck. It lies in its own area on the table, on the 'Time Passes' or the
  // 'Next Chapter' card, which stay at the bottom of their places (see `ENCOUNTER_PLACES`).
  {
    kind: "encounter",
    label: "Encounter Deck",
    faceUp: false,
    insert: "bottom",
    holds: (d) => family(d) === "encounter",
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
  // Quest Cards are Y705–Y707 (Y009), kept face down.
  {
    kind: "quest",
    label: "Quest Deck",
    emptyHint: "Built by card Y009",
    holdsText: "Quest Cards Y705–Y707",
    faceUp: false,
    insert: "top",
    holds: (d) => yIn(d, [705, 707]),
  },
  // The Enemy Card Y013, on top for good, with the Enemy Cards Y800–Y849 underneath (Y009), each lying as it was put there.
  {
    kind: "enemy",
    label: "Enemy Deck",
    emptyHint: "Built by card Y009",
    holdsText: "Y013, Y800–Y849",
    insert: "bottom",
    holds: (d) => yIn(d, [13, 13], [800, 849]),
    keeps: "Y013",
  },
  // The Training Card Y012, on top for good, with training cards (Y749–Y799) underneath (Y003).
  {
    kind: "training",
    label: "Training Deck",
    emptyHint: "Built by card Y003",
    holdsText: "Y012, Y749–Y799",
    faceUp: true,
    insert: "bottom",
    holds: (d) => yIn(d, [12, 12], [749, 799]),
    keeps: "Y012",
  },
  // Banished cards go under the 'Banned Cards' card Y011, on top for good, whatever they are.
  {
    kind: "banned",
    label: "Banned Cards",
    emptyHint: "Y011 goes here",
    holdsText: "Any card",
    faceUp: true,
    insert: "bottom",
    holds: () => true,
    keeps: "Y011",
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

/** Whether cards taken off this deck may go back to the sidebar: those of the decks built during play, from their own decks. */
export const returnsCards = (kind: DeckKind | undefined) =>
  !!kind && TABLE_DECKS.includes(kind);

/** Decks shown in the sidebar (all but the storybook, the Encounter Deck and the table decks). */
export const SIDEBAR_DECKS = DECKS.filter(
  (d) =>
    d.kind !== "storybook" &&
    d.kind !== "encounter" &&
    !TABLE_DECKS.includes(d.kind),
);

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
    // Never moved off its place: only for saves from before the time cards had places.
    case "time":
      return "encounter";
    case "encounter-x":
      return "x-encounters";
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
 * goes back to the Enemy Deck), or else the deck of its type. A card taken off
 * a deck (`from`) doesn't go back into that deck.
 */
export function homeDeck(t: Table, def: CardDef, from?: DeckKind): DeckKind {
  const origin = t.origin?.[def.id];
  // Older saves may name the Time Card deck, which is gone.
  if (
    origin &&
    origin !== "banned" &&
    origin !== from &&
    DECK_SPECS[origin]?.holds(def)
  )
    return origin;
  return defaultDeck(def);
}
