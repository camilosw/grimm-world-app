// Card labels, ordering and search, which read nothing of the game.

import type { CardDef } from './types';

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

/** Whether any term of the query is part of the card's number, name or type ("44" finds Y044, Y344, Y441…). */
export function matchesQuery(card: CardDef, query: string): boolean {
  const terms = queryTerms(query);
  if (!terms.length) return true;
  return [card.code, card.name, card.type].some(
    (s) => s && terms.some((q) => s.toLowerCase().includes(q)),
  );
}
