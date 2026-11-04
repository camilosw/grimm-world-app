// The game's reading matter beside the table (ContentProvider: Grimm World's rulebook and rule booklets), optional, and
// the panel's state (`useContent`): whether it is open, where it shows, and loading it on first use.

import { type ComponentType, useState } from 'react';
import type { CardDef, Stack } from '../engine/types';
import { gameUI } from './gameUI';

/** Where to open the content: one of its sections. A new object means "go there again". */
export interface ContentTarget {
  section: string;
}

export interface ContentPanelProps {
  /** What `ContentProvider.load()` gave. */
  content: unknown;
  target: ContentTarget | null;
  onClose: () => void;
}

/**
 * Reading matter the game offers beside the table, such as its rules (`GameUI.content`). Without one, the toolbar, the
 * area headers, the action bar and the card viewer offer no way to it.
 */
export interface ContentProvider {
  /** Its name and icon, on the buttons opening it ("Rules", "📖"). */
  label: string;
  icon: string;
  /** Load it, on first opening; a thrown error's message is told the player, and the panel stays closed. */
  load(): Promise<unknown>;
  /** The panel showing it, beside the table. */
  Panel: ComponentType<ContentPanelProps>;
  /** The section explaining a pile (its deck, its place or its top card), if any. */
  pileSection(stack: Stack, defs: Record<string, CardDef>): string | null;
  /** The section explaining a card, if any. */
  cardSection(def: CardDef | undefined): string | null;
  /** The section explaining an area, if any. */
  areaSection(area: string): string | null;
}

/** The game's content (`GameUI.content`), if it has any. */
export function content(): ContentProvider | undefined {
  return gameUI().content;
}

/** The content panel: whether it is open, the section it shows, and loading the content on first use. */
export function useContent(notify: (text: string) => void) {
  const [loadedContent, setLoadedContent] = useState<{
    content: unknown;
  } | null>(null);
  const [contentOpen, setContentOpen] = useState(false);
  const [contentTarget, setContentTarget] = useState<ContentTarget | null>(
    null,
  );

  /** Open the content beside the table, at a section if given; nothing, for a game without content. */
  const openContent = (section?: string | null) => {
    const provider = content();
    if (!provider) return;
    const show = () => {
      setContentOpen(true);
      if (section) setContentTarget({ section });
    };
    if (loadedContent) return show();
    provider
      .load()
      .then((c) => {
        setLoadedContent({ content: c });
        show();
      })
      .catch((e: Error) => notify(e.message));
  };

  return {
    loadedContent,
    contentOpen,
    setContentOpen,
    contentTarget,
    openContent,
  };
}
