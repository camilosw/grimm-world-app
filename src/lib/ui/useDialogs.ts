import { useCallback, useState } from 'react';
import type { CardRef } from '../engine/types';

export type Dialog =
  | { kind: 'inspect'; card: CardRef }
  | { kind: 'find' }
  | { kind: 'rename'; stackId: string }
  | { kind: 'menu' }
  | { kind: 'about' }
  | { kind: 'tokens' }
  /** The game's picker for cards of a pile (all its cards, if none given) going under a card of `GameDefinition.pickedPile` or of a sealed place (Grimm World's chapter picker). */
  | { kind: 'pick'; stackId: string; cardIds?: string[] }
  | null;

/** Cards waiting in "Put under…" mode: a whole table pile, or cards picked in the Browse panel. */
export interface PutUnder {
  stackId: string;
  cardIds?: string[];
  faceUp?: boolean;
}

/** The state of the dialogs, of the Browse panel and of "Put under…" mode. */
export function useDialogs() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [putUnder, setPutUnder] = useState<PutUnder | null>(null);
  /** Pile shown in the browse panel. */
  const [browseId, setBrowseId] = useState<string | null>(null);
  const closeBrowse = useCallback(() => setBrowseId(null), []);
  return {
    dialog,
    setDialog,
    putUnder,
    setPutUnder,
    browseId,
    setBrowseId,
    closeBrowse,
  };
}
