import type {
  CardDef,
  CardManifest,
  CardRef,
  Stack,
  Table,
} from '../lib/engine/types';

// The real cards come from public/cards/cards.json, which is generated and git-ignored, so tests make their own, or
// use the definitions kept with the saves exported from released versions (`saves/`).

const files = import.meta.glob<string>('./saves/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The images of a card's two sides, as the card pipeline names them. */
export function faces(id: string): CardDef['faces'] {
  const side = (s: string) => ({
    lg: `/cards/lg/${id}-${s}.webp`,
    sm: `/cards/sm/${id}-${s}.webp`,
  });
  return { front: side('front'), back: side('back') };
}

/** The real card set (number, type and name of each card, as the saves of released versions use it). */
export function realManifest(): CardManifest {
  const cards: Omit<CardDef, 'faces'>[] = JSON.parse(
    files['./saves/cards.json'],
  );
  return { cards: cards.map((c) => ({ ...c, faces: faces(c.id) })) };
}

/**
 * The saves exported from each released version after playing a little (`-moved`: also with an area moved and cards
 * set aside), by name ("v0.5.5"), as `localStorage` holds them.
 */
export const SAVES: Record<string, string> = Object.fromEntries(
  Object.entries(files)
    .filter(([path]) => /\/v[\d.]+[^/]*\.json$/.test(path))
    .map(([path, raw]) => [path.replace(/^.*\/|\.json$/g, ''), raw]),
);

let nextCard = 1;

/** A card of the card set. */
export function card(code: string, type: CardDef['type']): CardDef {
  const id = String(nextCard++).padStart(3, '0');
  return { id, type, code, faces: faces(id) };
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

/** The value, frozen all the way down, so that changing anything in it throws. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
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
