import type { CardDef, CardRef, Stack, Table } from '../types';

// The real cards come from public/cards/cards.json, which is generated and git-ignored, so tests make their own.

let nextCard = 1;

/** A card as cards.json describes it. */
export function card(code: string, type: CardDef['type']): CardDef {
  const id = String(nextCard++).padStart(3, '0');
  return { id, sheet: 1, row: 0, col: 0, type, code };
}

/** Cards as a pile holds them, bottom → top. */
export function refs(...defs: CardDef[]): CardRef[] {
  return defs.map((d) => ({ id: d.id, faceUp: false }));
}

/** A pile lying on the table. */
export function stack(
  id: string,
  cards: CardRef[],
  extra?: Partial<Stack>,
): Stack {
  return { id, x: 0, y: 0, rot: 0, cards, ...extra };
}

/** A table holding just these piles. */
export function table(...stacks: Stack[]): Table {
  return {
    stacks: Object.fromEntries(stacks.map((s) => [s.id, s])),
    z: stacks.map((s) => s.id),
    tokens: [],
    nextId: 1,
  };
}
