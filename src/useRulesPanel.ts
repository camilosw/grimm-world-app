import { useState } from 'react';
import { loadRules, type RulesManifest, type RuleTarget } from './rules';

/** The rulebook drawer beside the table: whether it is open, the section it shows, and loading it on first use. */
export function useRulesPanel(notify: (text: string) => void) {
  const [rules, setRules] = useState<RulesManifest | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesTarget, setRulesTarget] = useState<RuleTarget | null>(null);

  /** Open the rulebook beside the table, at a section if given. */
  const openRules = (section?: string | null) => {
    const show = () => {
      setRulesOpen(true);
      if (section) setRulesTarget({ section });
    };
    if (rules) return show();
    loadRules()
      .then((r) => {
        setRules(r);
        show();
      })
      .catch((e: Error) => notify(e.message));
  };

  return { rules, rulesOpen, setRulesOpen, rulesTarget, openRules };
}
