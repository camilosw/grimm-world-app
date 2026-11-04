// The commands of the action bar: what can be done with the selected pile or figure, each with when the bar offers it
// and what it does. The game lists those its bar offers, in order (`GameUI.pileCommands`, `figureCommands`), from
// these and its own.

import * as A from '../engine/actions';
import { onGrid } from '../engine/areas';
import { facedSpot } from '../engine/facing';
import { game, isLandscape } from '../engine/game';
import { cardRect, type Rect } from '../engine/geometry';
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
import { content } from './content';
import type { Dialog, PutUnder } from './useDialogs';

/** An action of the action bar, on what is selected (`C`: the selection and what the action needs of the app). */
export interface Command<C> {
  id: string;
  /** Drawn before the label. */
  icon: string;
  label: string | ((c: C) => string);
  /** Whether the bar offers it for this selection (it leaves it out otherwise). */
  enabled(c: C): boolean;
  /** Shown pressed (Browse, while the pile is browsed). */
  on?(c: C): boolean;
  run(c: C): void;
}

/** What the commands on a pile need of the app. */
export interface PileApp {
  /** The pile shown in the Browse panel. */
  browseId: string | null;
  setBrowseId: (stackId: string | null) => void;
  setPutUnder: (putUnder: PutUnder | null) => void;
  setDialog: (dialog: Dialog) => void;
  /** Where cards put on the table near the middle of the screen go (null: they can't, and the player is told why). */
  dropAt: (cardIds?: string[]) => At | null;
  shuffle: (stackId: string) => void;
  notify: (text: string, ok?: boolean) => void;
  /** Open the game's content (`GameUI.content`) at a section. */
  openContent: (section?: string | null) => void;
  /** The decks cards go back to, by name. */
  homeNames: (cards: CardRef[]) => string;
  /** Glide the view to show this table rectangle as large as the screen allows. */
  focusRect: (rect: Rect) => void;
}

/** The selected pile, and the app. */
export interface PileContext {
  table: Table;
  defs: Record<string, CardDef>;
  stack: Stack;
  /** The pile is set aside in the Hand: it lies upright there, in no particular place. */
  aside: boolean;
  app: PileApp;
}

/** The selected figure. */
export interface FigureContext {
  table: Table;
  token: Token;
}

export type PileCommand = Command<PileContext>;
export type FigureCommand = Command<FigureContext>;

/** Change the table with an action on the selected pile. */
const act = (c: PileContext, fn: (t: Table, id: string) => Table) =>
  update((t) => fn(t, c.stack.id));

// Decks, in the sidebar or on the table, stay where they are and keep their cards.
const isDeck = (c: PileContext) => !!c.stack.deck;
// The Encounter Deck area's places stay too, and so do the time cards at the bottom of theirs.
const isPlace = (c: PileContext) => !!c.stack.place;
// The Damage Card stays on top of its place for good, the Enemy, Training and Banned Cards cards on top of their decks:
// nothing is drawn from them, nor their top card moved under the rest.
const topPinned = (c: PileContext) => A.pinnedOnTop(c.stack) > 0;
/** The cards of the pile that may leave it (not pinned to it). */
const free = (c: PileContext) => A.unpinned(c.stack).length;
const count = (c: PileContext) => c.stack.cards.length;
const topCard = (c: PileContext) => c.stack.cards.at(-1);
/** A pile lying loose on the table (not a deck, a fixed place, nor set aside). */
const loose = (c: PileContext) => !isDeck(c) && !isPlace(c) && !c.aside;

/** Room left around a focused pile, in table units: a glimpse of what lies beside it. */
export const FOCUS_MARGIN = 40;

/**
 * Where the top card of a pile lying on the table is drawn, with `FOCUS_MARGIN` around it: landscape for a landscape
 * card or one on a turned place (Market Prices, the Encounter Bar), and across when the pile lies a quarter turned.
 */
export function focusedRect(c: PileContext): Rect {
  const top = topCard(c);
  const landscape =
    (!!top && isLandscape(c.defs[top.id])) || !!turnedSpot(c.table, c.stack.id);
  const across = c.stack.rot % 180 === 90;
  const r = cardRect(c.stack.x, c.stack.y, landscape !== across);
  return {
    x: r.x - FOCUS_MARGIN,
    y: r.y - FOCUS_MARGIN,
    w: r.w + FOCUS_MARGIN * 2,
    h: r.h + FOCUS_MARGIN * 2,
  };
}

/** The actions on a pile, as the game's bar may offer them. */
export const PILE_COMMANDS = {
  draw: {
    id: 'draw',
    icon: '🂠',
    label: 'Draw',
    // Decks and places draw several cards; a pile on the table needs at least two.
    enabled: (c) =>
      free(c) > (isDeck(c) || isPlace(c) ? 0 : 1) && !topPinned(c),
    run: (c) => {
      const top = topCard(c);
      const at =
        (isDeck(c) || isPlace(c) || c.aside) && top
          ? c.app.dropAt([top.id])
          : undefined;
      if (at !== null) act(c, (t, id) => A.drawTop(t, id, at));
    },
  },
  flip: {
    id: 'flip',
    icon: '⟲',
    label: (c) => (count(c) > 1 ? 'Flip top' : 'Flip'),
    // Not one lying face up or down for good (Market Prices, Broken Items, the Encounter Bar), nor a Region Card on the
    // Map or a Terrain Card on the battlefield.
    enabled: (c) =>
      count(c) > 0 &&
      !facedSpot(c.table, c.stack.id) &&
      !onGrid(c.table, c.stack.id),
    run: (c) => act(c, A.flipTop),
  },
  topToBottom: {
    id: 'top-to-bottom',
    icon: '⤓',
    label: 'Top → bottom',
    enabled: (c) => free(c) > 1 && !topPinned(c),
    run: (c) => act(c, A.topToBottom),
  },
  browse: {
    id: 'browse',
    icon: '☰',
    label: 'Browse',
    enabled: (c) => count(c) > 1,
    on: (c) => c.app.browseId === c.stack.id,
    run: (c) =>
      c.app.setBrowseId(c.app.browseId === c.stack.id ? null : c.stack.id),
  },
  shuffle: {
    id: 'shuffle',
    icon: '⤮',
    label: 'Shuffle',
    enabled: (c) => free(c) > 1,
    run: (c) => c.app.shuffle(c.stack.id),
  },
  sort: {
    id: 'sort',
    icon: '⇅',
    label: 'Sort',
    enabled: (c) => free(c) > 1,
    run: (c) => act(c, (t, id) => A.sortStack(t, id, c.defs)),
  },
  focus: {
    id: 'focus',
    icon: '⌖',
    label: 'Focus',
    // A pile lying on the table (decks on their places too), not one in the sidebar or the Hand.
    enabled: (c) => c.table.z.includes(c.stack.id),
    run: (c) => c.app.focusRect(focusedRect(c)),
  },
  view: {
    id: 'view',
    icon: '🔍',
    label: 'View',
    enabled: (c) => !!topCard(c),
    run: (c) => c.app.setDialog({ kind: 'inspect', card: topCard(c)! }),
  },
  rotate: {
    id: 'rotate',
    icon: '↻',
    label: 'Rotate',
    // Not a card lying turned on its place (Market Prices, Encounter Bar) or upside down (Actions area, Titles, Skills,
    // Broken Items, Status Upgrades & Items), nor a landscape card.
    enabled: (c) =>
      loose(c) &&
      !turnedSpot(c.table, c.stack.id) &&
      !upsideDownSpot(c.table, c.stack.id) &&
      !c.stack.cards.some((card) => isLandscape(c.defs[card.id])),
    run: (c) => act(c, (t, id) => A.rotateStack(t, id, 90, c.defs)),
  },
  turnAround: {
    id: 'turn-around',
    icon: '↻',
    label: 'Turn around',
    enabled: (c) =>
      !c.aside &&
      c.stack.cards.every((card) => game().turnsAround(c.defs[card.id])),
    run: (c) => act(c, (t, id) => A.rotateStack(t, id, 180, c.defs)),
  },
  putUnder: {
    id: 'put-under',
    icon: '⤵',
    label: 'Put under…',
    enabled: (c) => (!isDeck(c) || isPlace(c)) && free(c) > 0,
    run: (c) => c.app.setPutUnder({ stackId: c.stack.id }),
  },
  turnOver: {
    id: 'turn-over',
    icon: '⇵',
    label: 'Turn pile over',
    enabled: (c) => free(c) > 1,
    run: (c) => act(c, A.flipStack),
  },
  front: {
    id: 'front',
    icon: '▲',
    label: 'Front',
    enabled: loose,
    run: (c) => act(c, A.bringToFront),
  },
  back: {
    id: 'back',
    icon: '▼',
    label: 'Back',
    enabled: loose,
    run: (c) => act(c, A.sendToBack),
  },
  toTable: {
    id: 'to-table',
    icon: '⤴',
    label: 'To table',
    enabled: (c) => c.aside,
    run: (c) => {
      const at = c.app.dropAt(c.stack.cards.map((card) => card.id));
      if (at) act(c, (t, id) => A.fromTray(t, id, at));
    },
  },
  returnToDeck: {
    id: 'return-to-deck',
    icon: '↩',
    label: 'Return to deck',
    enabled: (c) => !isDeck(c) && free(c) > 0,
    run: (c) => {
      c.app.notify(`Back to ${c.app.homeNames(c.stack.cards)}`, true);
      act(c, (t, id) => A.stackToDecks(t, id, 'all', c.defs));
    },
  },
  name: {
    id: 'name',
    icon: '✎',
    label: 'Name',
    enabled: (c) => !isDeck(c) && !isPlace(c),
    run: (c) => c.app.setDialog({ kind: 'rename', stackId: c.stack.id }),
  },
  /** The game's content (the rules), at the section explaining the pile; offered only if the game has content. */
  content: {
    id: 'content',
    get icon() {
      return content()?.icon ?? '';
    },
    label: () => content()?.label ?? '',
    enabled: () => !!content(),
    run: (c) => c.app.openContent(content()?.pileSection(c.stack, c.defs)),
  },
} satisfies Record<string, PileCommand>;

/** The actions on a figure. */
export const FIGURE_COMMANDS = {
  remove: {
    id: 'remove-figure',
    icon: '🗑',
    label: 'Remove figure',
    enabled: () => true,
    run: (c) => update((t) => A.removeToken(t, c.token.id)),
  },
} satisfies Record<string, FigureCommand>;

/** A command's label for this selection. */
export const commandLabel = <C>(cmd: Command<C>, c: C) =>
  typeof cmd.label === 'string' ? cmd.label : cmd.label(c);

/** The commands the bar offers for this selection, in the game's order. */
export const offered = <C>(commands: Command<C>[], c: C) =>
  commands.filter((cmd) => cmd.enabled(c));
