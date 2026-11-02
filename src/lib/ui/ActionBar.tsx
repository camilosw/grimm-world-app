import * as A from '../engine/actions';
import { game, isLandscape } from '../engine/game';
import { onGrid } from '../engine/areas';
import { facedSpot } from '../engine/facing';
import { turnedSpot, upsideDownSpot } from '../engine/orientation';
import { update } from '../engine/store';
import type {
  At,
  CardDef,
  CardRef,
  Stack,
  Table,
  Token,
} from '../engine/types';
import { gameUI } from './gameUI';
import type { Dialog, PutUnder } from './useDialogs';

/** What the action bar needs of the app. */
export interface PileBarProps {
  table: Table;
  defs: Record<string, CardDef>;
  /** The selected pile. */
  stack: Stack;
  /** The pile is set aside in the right sidebar: it lies upright there, in no particular place. */
  aside: boolean;
  browseId: string | null;
  setBrowseId: (stackId: string | null) => void;
  setPutUnder: (putUnder: PutUnder | null) => void;
  setDialog: (dialog: Dialog) => void;
  /** Where cards put on the table near the middle of the screen go (null: they can't). */
  dropAt: (cardIds?: string[]) => At | null;
  shuffle: (stackId: string) => void;
  notify: (text: string, ok?: boolean) => void;
  openRules: (section?: string | null) => void;
  homeNames: (cards: CardRef[]) => string;
}

/** The actions for the selected pile. */
export function PileBar({
  table,
  defs,
  stack,
  aside,
  browseId,
  setBrowseId,
  setPutUnder,
  setDialog,
  dropAt,
  shuffle,
  notify,
  openRules,
  homeNames,
}: PileBarProps) {
  const act = (fn: (t: Table, id: string) => Table) =>
    update((t) => fn(t, stack.id));
  const count = stack.cards.length;
  const topCard = stack.cards[count - 1];
  // Decks, in the sidebar or on the table, stay where they are and keep their cards.
  const isDeck = !!stack.deck;
  // The Encounter Deck area's places stay too, and so do the time cards at the bottom of theirs.
  const isPlace = !!stack.place;
  // The Damage Card stays on top of its place for good, the Enemy, Training and Banned Cards cards on top of their decks:
  // nothing is drawn from them, nor their top card moved under the rest.
  const topPinned = A.pinnedOnTop(stack) > 0;
  const free = A.unpinned(stack).length;
  // A card lying turned on its place stays as it lies (Market Prices face up, Encounter Bar face down) and can't be rotated.
  const fixed = !!turnedSpot(table, stack.id);
  // Nor turned over, nor one lying face up for good (Broken Items, Status Upgrades & Items).
  const faced = !!facedSpot(table, stack.id);
  // A Region Card on the Map and a Terrain Card on the battlefield lie face up.
  const onGridPlace = onGrid(table, stack.id);
  // A card lying upside down on its place (Actions area, Titles, Skills, Broken Items, Status Upgrades & Items) can't be rotated either.
  const upsideDown = !!upsideDownSpot(table, stack.id);
  /** Decks and places draw several cards; a pile on the table needs at least two. */
  const many = free > (isDeck || isPlace ? 0 : 1);

  return (
    <footer className="actions">
      {many && !topPinned && (
        <button
          onClick={() => {
            const at =
              (isDeck || isPlace || aside) && topCard
                ? dropAt([topCard.id])
                : undefined;
            if (at !== null) act((t, id) => A.drawTop(t, id, at));
          }}
        >
          🂠 Draw
        </button>
      )}
      {count > 0 && !faced && !onGridPlace && (
        <button onClick={() => act(A.flipTop)}>
          ⟲ {count > 1 ? 'Flip top' : 'Flip'}
        </button>
      )}
      {free > 1 && !topPinned && (
        <button onClick={() => act(A.topToBottom)}>⤓ Top → bottom</button>
      )}
      {count > 1 && (
        <button
          className={browseId === stack.id ? 'on' : ''}
          onClick={() => setBrowseId(browseId === stack.id ? null : stack.id)}
        >
          ☰ Browse
        </button>
      )}
      {free > 1 && <button onClick={() => shuffle(stack.id)}>⤮ Shuffle</button>}
      {free > 1 && (
        <button onClick={() => act((t, id) => A.sortStack(t, id, defs))}>
          ⇅ Sort
        </button>
      )}
      {topCard && (
        <button onClick={() => setDialog({ kind: 'inspect', card: topCard })}>
          🔍 View
        </button>
      )}
      {!isDeck &&
        !isPlace &&
        !aside &&
        !fixed &&
        !upsideDown &&
        !stack.cards.some((c) => isLandscape(defs[c.id])) && (
          <button
            onClick={() => act((t, id) => A.rotateStack(t, id, 90, defs))}
          >
            ↻ Rotate
          </button>
        )}
      {!aside && stack.cards.every((c) => game().turnsAround(defs[c.id])) && (
        <button onClick={() => act((t, id) => A.rotateStack(t, id, 180, defs))}>
          ↻ Turn around
        </button>
      )}
      {(!isDeck || isPlace) && free > 0 && (
        <button onClick={() => setPutUnder({ stackId: stack.id })}>
          ⤵ Put under…
        </button>
      )}
      {free > 1 && (
        <button onClick={() => act(A.flipStack)}>⇵ Turn pile over</button>
      )}
      {!isDeck && !isPlace && !aside && (
        <button onClick={() => act(A.bringToFront)}>▲ Front</button>
      )}
      {!isDeck && !isPlace && !aside && (
        <button onClick={() => act(A.sendToBack)}>▼ Back</button>
      )}
      {aside && (
        <button
          onClick={() => {
            const at = dropAt(stack.cards.map((c) => c.id));
            if (at) act((t, id) => A.fromTray(t, id, at));
          }}
        >
          ⤴ To table
        </button>
      )}
      {!isDeck && free > 0 && (
        <button
          onClick={() => {
            notify(`Back to ${homeNames(stack.cards)}`, true);
            act((t, id) => A.stackToDecks(t, id, 'all', defs));
          }}
        >
          ↩ Return to deck
        </button>
      )}
      {!isDeck && !isPlace && (
        <button
          onClick={() => setDialog({ kind: 'rename', stackId: stack.id })}
        >
          ✎ Name
        </button>
      )}
      <button onClick={() => openRules(gameUI().rule(stack, defs))}>
        📖 Rules
      </button>
    </footer>
  );
}

/** The action for the selected figure. */
export function FigureBar({ token }: { token: Token }) {
  return (
    <footer className="actions">
      <button onClick={() => update((t) => A.removeToken(t, token.id))}>
        🗑 Remove figure
      </button>
    </footer>
  );
}
