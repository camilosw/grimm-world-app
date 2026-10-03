import type { CardDef, CardManifest, CardType, Token } from "./types";

/** Card size in table (world) units. Poker ratio 63.5 x 88.9 mm. */
export const CARD_W = 250;
export const CARD_H = 350;

/** A figure's size in table units: the Player marker (the only cube) is a small one. */
export const tokenSize = (k: Pick<Token, "shape">) =>
  k.shape === "cube" ? 30 : 70;

/** Card families used by the area and deck rules (B- and X-Encounter Cards behave the same). */
export type Family = Exclude<CardType, "encounter-b" | "encounter-x">;

export function family(def: CardDef | undefined): Family | undefined {
  const t = def?.type;
  return t === "encounter-b" || t === "encounter-x" ? "encounter" : t;
}

export const clampScale = (s: number) => Math.min(4, Math.max(0.08, s));

const BASE = `${import.meta.env.BASE_URL}cards`;

export async function loadManifest(): Promise<CardManifest> {
  const res = await fetch(`${BASE}/cards.json`);
  if (!res.ok)
    throw new Error(
      `Could not load ${BASE}/cards.json — run "uv run scripts/split_cards.py" first.`,
    );
  return res.json();
}

export function cardImage(
  id: string,
  faceUp: boolean,
  size: "sm" | "lg",
): string {
  return `${BASE}/${size}/${id}-${faceUp ? "front" : "back"}.webp`;
}

/**
 * Region Cards are printed sideways: they always lie landscape, never rotate, and turn over about their horizontal
 * axis.
 */
export function isLandscape(def: CardDef | undefined): boolean {
  return def?.type === "region";
}

/** Side a card's image is turned to, a quarter, to lie landscape. */
export type Turn = "left" | "right";

/** Classes of a landscape frame showing the portrait card image inside it turned a quarter to one side (with a leading space). */
export function turnedClass(turn: Turn): string {
  return ` landscape${turn === "right" ? " turned-right" : ""}`;
}

/**
 * Classes of the frame holding a card's image (with a leading space): a landscape frame shows the image turned a
 * quarter to the left for the front and to the right for the back, which is printed the other way round.
 */
export function landscapeClass(landscape: boolean, faceUp: boolean): string {
  return landscape ? turnedClass(faceUp ? "left" : "right") : "";
}

/**
 * Screen box of a card whose place has its top-left corner at (x, y). A landscape card lies across that place,
 * turned about its center, so it has the same center as any other card there.
 */
export function cardBox(x: number, y: number, landscape: boolean) {
  if (!landscape) return { left: x, top: y, width: CARD_W, height: CARD_H };
  return {
    left: x + (CARD_W - CARD_H) / 2,
    top: y + (CARD_H - CARD_W) / 2,
    width: CARD_H,
    height: CARD_W,
  };
}

export function cardLabel(card: CardDef | undefined): string {
  if (!card) return "";
  return card.code ?? card.name ?? `#${card.id}`;
}

/** Order by printed card number (Y003 < Y010 < Y291c); cards without one go last. */
export function compareCards(
  a: CardDef | undefined,
  b: CardDef | undefined,
): number {
  const byId = (a?.id ?? "").localeCompare(b?.id ?? "");
  if (a?.code && b?.code)
    return a.code.localeCompare(b.code, undefined, { numeric: true }) || byId;
  if (a?.code || b?.code) return a?.code ? -1 : 1;
  return byId;
}

/** The comma-separated terms of a card search ("44, 41,42"), lower-cased; none for a blank query. */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Whether any term of the query is part of the card's number, name or type ("44" finds Y044, Y344, Y441…). */
export function matchesQuery(card: CardDef, query: string): boolean {
  const terms = queryTerms(query);
  if (!terms.length) return true;
  return [card.code, card.name, card.type].some(
    (s) => s && terms.some((q) => s.toLowerCase().includes(q)),
  );
}
