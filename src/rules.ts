import type { DeckKind } from './decks';
import type { CardDef } from './types';

/** public/rules/rules.json, made by scripts/split_rules.py. */
export interface RulesManifest {
  version: string;
  /** Page height / width. */
  aspect: number;
  pages: { page: number; file: string; text: string }[];
  toc: RuleSection[];
}

export interface RuleSection {
  /** Section number, e.g. "4.7.4". */
  id: string;
  title: string;
  /** Printed page number. */
  page: number;
  /** Vertical position of the heading on its page (0–1). */
  y: number;
  depth: number;
}

/** Where to open the rules: a section number or a printed page. */
export type RuleTarget = { section: string } | { page: number };

const BASE = `${import.meta.env.BASE_URL}rules`;

export async function loadRules(): Promise<RulesManifest> {
  const res = await fetch(`${BASE}/rules.json`);
  if (!res.ok)
    throw new Error(
      'The rulebook has not been prepared yet: run "uv run scripts/split_rules.py".',
    );
  return res.json();
}

export function rulePageImage(file: string): string {
  return `${BASE}/${file}`;
}

/** Rulebook sections explaining each table area. */
export const AREA_RULES: Record<string, string> = {
  map: '4.5',
  bar: '5.2',
  encounter: '5.1',
  character: '4.1',
  storage: '4.7.4',
  storybook: '4.6',
  home: '10',
  battlefield: '8.1.2',
  quest: '6.2.1',
  enemy: '6.2.2',
  training: '6.2.3',
  banned: '4.7.10',
  hand: '4.7.7',
};

/** Rulebook sections explaining each deck. */
export const DECK_RULES: Record<DeckKind, string> = {
  storybook: '4.6',
  encounter: '5.1',
  'x-encounters': '4.4.2',
  'lost-pages': '4.7',
  regions: '4.5',
  terrain: '4.8',
  hitpoints: '4.9',
  character: '4.1',
  alignment: '4.2',
  money: '4.3',
  quest: '6.2.1',
  enemy: '6.2.2',
  training: '6.2.3',
  banned: '4.7.10',
};

/** Y-card number ranges with their own rulebook section (checked against the card faces). */
const Y_RULES: [number, number, string][] = [
  [10, 10, '4.7.9'], // Damage Card
  [11, 11, '4.7.10'], // 'Banned Cards'-Card
  [12, 12, '6.2.3'], // Training Deck card
  [13, 13, '6.2.2'], // Enemy Deck card
  [14, 14, '4.7.11'], // Save Cards
  [34, 37, '4.7.4'], // Storage Cards
  [40, 44, '4.7.7'], // Action Cards
  [705, 707, '4.7.6'], // Quest Cards
  [800, 849, '4.7.8'], // Enemy Cards
  [900, 999, '4.7.3'], // Conflict Cards
];

/** The rulebook section that explains a card. */
export function cardRule(def: CardDef | undefined): string | null {
  if (!def) return null;
  switch (def.type) {
    case 'character':
      return '4.1';
    case 'alignment':
      return '4.2';
    case 'money':
      return '4.3';
    case 'region':
      return '4.5';
    case 'terrain':
      return '4.8';
    case 'hitpoints':
      return '4.9';
    case 'storybook':
      return '4.6';
    case 'time':
      return def.name === 'Next Chapter' ? '4.4.4' : '4.4.3';
    case 'encounter-b':
    case 'encounter':
      return '4.4.1';
    case 'encounter-x':
      return '4.4.2';
    case 'lost-pages': {
      const n = Number(/^Y(\d{3})/.exec(def.code ?? '')?.[1]);
      return Y_RULES.find(([lo, hi]) => n >= lo && n <= hi)?.[2] ?? '4.7';
    }
    default:
      return null;
  }
}
