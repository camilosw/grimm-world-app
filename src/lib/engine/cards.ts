// Cards: the card set read from the pipeline's manifest, card images, labels, ordering and search. Reads nothing of
// the game.

import type { CardDef, CardManifest, CardType, FaceImages } from './types';

/** The image of a card's side: `sm` for the table and lists, `lg` to look at it (its only one, if it has no `sm`). */
export function cardImage(
  def: CardDef | undefined,
  faceUp: boolean,
  size: 'sm' | 'lg',
): string | undefined {
  const face = def?.faces[faceUp ? 'front' : 'back'];
  return (size === 'sm' && face?.sm) || face?.lg;
}

/** A path relative to the manifest, resolved against where it was loaded from; a URL or an absolute path as it is. */
function resolve(path: string, base: string): string {
  return /^([a-z][a-z\d+.-]*:|\/)/i.test(path)
    ? path
    : `${base.replace(/\/$/, '')}/${path}`;
}

/**
 * The card set as the pipeline wrote it (`cards.json`, loaded from `base`): each card's id, kind, number and name, its
 * faces' images (relative to `base`) and its `attrs`. Whatever else the pipeline keeps there (where each card was
 * printed, its OCR notes) is left out; `attrs` keeps its strings, numbers and truths as text. Throws when a card has no
 * faces, as a manifest written before they were.
 */
export function readManifest(raw: unknown, base: string): CardManifest {
  const cards = (raw as { cards?: unknown })?.cards;
  if (!Array.isArray(cards)) throw new Error('The card set lists no cards.');
  const face = (f: FaceImages): FaceImages => ({
    lg: resolve(f.lg, base),
    ...(f.sm ? { sm: resolve(f.sm, base) } : {}),
  });
  return {
    cards: cards.map((c: Partial<CardDef> | null) => {
      if (!c?.id || !c.faces?.front?.lg || !c.faces.back?.lg)
        throw new Error(
          `Card ${c?.id ?? '?'} has no images: run the card pipeline again (split_cards.py).`,
        );
      const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
      const def: CardDef = {
        id: c.id,
        faces: { front: face(c.faces.front), back: face(c.faces.back) },
      };
      const type = text(c.type);
      const code = text(c.code);
      const name = text(c.name);
      // The game's kinds, as the pipeline wrote them: the game checks the card set (`problems`).
      if (type) def.type = type as CardType;
      if (code) def.code = code;
      if (name) def.name = name;
      const attrs = Object.entries(c.attrs ?? {}).filter(([, v]) =>
        ['string', 'number', 'boolean'].includes(typeof v),
      );
      if (attrs.length)
        def.attrs = Object.fromEntries(attrs.map(([k, v]) => [k, String(v)]));
      return def;
    }),
  };
}

export function cardLabel(card: CardDef | undefined): string {
  if (!card) return '';
  return card.code ?? card.name ?? `#${card.id}`;
}

/** Order by printed card number (Y003 < Y010 < Y291c); cards without one go last. */
export function compareCards(
  a: CardDef | undefined,
  b: CardDef | undefined,
): number {
  const byId = (a?.id ?? '').localeCompare(b?.id ?? '');
  if (a?.code && b?.code)
    return a.code.localeCompare(b.code, undefined, { numeric: true }) || byId;
  if (a?.code || b?.code) return a?.code ? -1 : 1;
  return byId;
}

/** The comma-separated terms of a card search ("44, 41,42"), lower-cased; none for a blank query. */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Whether any term of the query is part of the card's number, name, type or `attrs` ("44" finds Y044, Y344, Y441…).
 */
export function matchesQuery(card: CardDef, query: string): boolean {
  const terms = queryTerms(query);
  if (!terms.length) return true;
  return [
    card.code,
    card.name,
    card.type,
    ...Object.values(card.attrs ?? {}),
  ].some((s) => s && terms.some((q) => s.toLowerCase().includes(q)));
}
