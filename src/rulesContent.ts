// Grimm World's reading matter beside the table (`GameUI.content`): the rulebook and the rule booklets (RulesPanel),
// and the sections explaining its piles, cards and areas (rules.ts).

import type { ContentProvider } from './lib/ui/content';
import { AREA_RULES, cardRule, loadRules, pileRule } from './rules';
import { RulesContent } from './RulesPanel';

/** Grimm World's reading matter beside the table (`GameUI.content`): the rulebook, and the rule booklets beside it. */
export const RULES_CONTENT: ContentProvider = {
  label: 'Rules',
  icon: '📖',
  load: loadRules,
  Panel: RulesContent,
  pileSection: pileRule,
  cardSection: cardRule,
  areaSection: (area) => AREA_RULES[area] ?? null,
};
