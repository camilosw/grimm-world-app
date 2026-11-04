// Grimm World's card families, how its cards lie, and loading its card set (images, sizes and labels are in
// src/lib/engine/).

import { readManifest } from './lib/engine/cards';
import type { CardDef, CardManifest } from './lib/engine/types';
import type { CardType } from './types';

/** Card families used by the area and deck rules (B- and X-Encounter Cards behave the same). */
export type Family = Exclude<CardType, 'encounter-b' | 'encounter-x'>;

export function family(def: CardDef | undefined): Family | undefined {
  const t = def?.type;
  return t === 'encounter-b' || t === 'encounter-x' ? 'encounter' : t;
}

const BASE = `${import.meta.env.BASE_URL}cards`;

export async function loadManifest(): Promise<CardManifest> {
  const res = await fetch(`${BASE}/cards.json`);
  if (!res.ok)
    throw new Error(
      `Could not load ${BASE}/cards.json — run "uv run scripts/split_cards.py" first.`,
    );
  return readManifest(await res.json(), BASE);
}

/**
 * Region and Terrain Cards are printed sideways: they always lie landscape and turn over about their horizontal axis.
 * Region Cards never rotate; Terrain Cards only turn around, their triangles pointing up or down (`rotateStack()`).
 */
export function isLandscape(def: CardDef | undefined): boolean {
  return def?.type === 'region' || def?.type === 'terrain';
}

/** Terrain Cards turn around, their triangles pointing up or down; Region Cards never rotate. */
export function turnsAround(def: CardDef | undefined): boolean {
  return def?.type === 'terrain';
}
