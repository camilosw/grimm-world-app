import { useRef, useState } from 'react';
import * as A from '../engine/actions';
import { update } from '../engine/store';
import type { Dealt } from './Table';

/** How long a pile on the table shows being shuffled (see `.shuffle-card` in styles.css). */
export const SHUFFLE_MS = 900;
/** How long a card dealt by an action shows travelling to its place (see `DEAL_TRAVEL_MS` in TablePieces.tsx). */
export const DEAL_MS = 430;

/** The animations that play on the table for a moment: a pile being shuffled, a card being dealt. */
export function useTransient() {
  /** The table pile just shuffled, shown shuffling for a moment (`n` restarts the animation). */
  const [shuffled, setShuffled] = useState<{ id: string; n: number } | null>(
    null,
  );
  const shuffleTimer = useRef<number | undefined>(undefined);
  /** The card just dealt by an action (a sub-chapter card into the Encounter Bar), shown travelling there. */
  const [dealt, setDealt] = useState<Dealt | null>(null);
  const dealTimer = useRef<number | undefined>(undefined);

  const shuffle = (stackId: string) => {
    update((t) => A.shuffleStack(t, stackId));
    setShuffled((prev) => ({ id: stackId, n: (prev?.n ?? 0) + 1 }));
    window.clearTimeout(shuffleTimer.current);
    shuffleTimer.current = window.setTimeout(
      () => setShuffled(null),
      SHUFFLE_MS,
    );
  };

  /** Show a card just dealt by an action travelling to its place from `from`. */
  const deal = (cardId: string, from: { x: number; y: number }) => {
    setDealt((prev) => ({ cardId, from, n: (prev?.n ?? 0) + 1 }));
    window.clearTimeout(dealTimer.current);
    dealTimer.current = window.setTimeout(() => setDealt(null), DEAL_MS);
  };

  return { shuffled, dealt, shuffle, deal };
}
