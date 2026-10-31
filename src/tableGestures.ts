import { clampScale } from './cards';
import type { View } from './types';

// The table's pointer gestures as a pure state machine: `step()` takes the gesture so far and what a pointer did, and
// returns the gesture after it with what the table should do (`GestureEffect`). It knows nothing of the DOM, React or
// the game: `useTableGestures` feeds it the pointer events and carries out its effects, and what may be dragged, double
// tapped or long pressed it asks of its `GestureContext`.

export type Point = { x: number; y: number };

/** What a pointer went down on. Storybook slots are plain stacks here (`whole: false`). */
export type Target =
  | { kind: 'stack'; id: string; whole: boolean }
  | { kind: 'token'; id: string }
  /** An area, dragged by the grip in its header. */
  | { kind: 'area'; id: string }
  | { kind: 'bg' };

type Gesture =
  | { type: 'idle' }
  | { type: 'press'; x: number; y: number; target: Target }
  | { type: 'pan' }
  | { type: 'pinch'; dist: number; mid: Point; view: View }
  | { type: 'drag'; target: Target; offX: number; offY: number };

export interface GestureState {
  /** The pointers down, in the order they went down (the first two pinch), in the table element's pixels. */
  pointers: readonly { id: number; p: Point }[];
  gesture: Gesture;
  /** The last tap that may start a double tap. */
  lastTap: { id: string; time: number } | null;
}

export type GestureEvent =
  | { type: 'down'; pointer: number; p: Point; target: Target; view: View }
  | { type: 'move'; pointer: number; p: Point; view: View }
  | { type: 'up'; pointer: number; time: number }
  | { type: 'cancel'; pointer: number }
  /** The long-press timer started by `startLongPress` fired. */
  | { type: 'timeout' };

export type GestureEffect =
  /** Start the long-press timer: `timeout` once `LONG_PRESS_MS` have passed. */
  | { type: 'startLongPress' }
  | { type: 'cancelLongPress' }
  /** Panned or pinched: the table is shown so. */
  | { type: 'view'; view: View }
  /** The dragged item is held with its top-left corner at (x, y), the pointer at `pointer` (table coordinates). */
  | { type: 'drag'; target: Target; x: number; y: number; pointer: Point }
  /** The drag ended where it was last held: it is dropped there. */
  | { type: 'drop' }
  /** The drag was abandoned (a second finger came down). */
  | { type: 'dragCancel' }
  /** A pointer went up or was cancelled: whatever a drag lit up goes out. */
  | { type: 'release' }
  | { type: 'tap'; target: Target }
  | { type: 'doubleTap'; target: Target }
  | { type: 'longPress'; target: Target };

/** What the gestures ask of the table, which they don't know. */
export interface GestureContext {
  /**
   * Moving past the slop: what the press drags (only a revealed Y-card leaves the storybook, a time card alone on its
   * place stays…) and where that item lies (its top-left corner); null: the table is panned instead.
   */
  grab(target: Target): { target: Target; pos: Point } | null;
  /** Whether a tap on it may be half of a double tap (a pile, not while a tap picks a target, not the storybook). */
  doubleTaps(target: Target): boolean;
  /** Whether a long press on it is taken: it ends the gesture, and releasing then doesn't tap. */
  longPresses(target: Target): boolean;
}

/** How far (pixels) a pointer may move before a press becomes a drag or a pan. */
export const TAP_SLOP = 8;
export const LONG_PRESS_MS = 500;
/** Two taps on the same pile at most this far apart (ms) are a double tap. */
export const DOUBLE_TAP_MS = 300;

export const initialGestures: GestureState = {
  pointers: [],
  gesture: { type: 'idle' },
  lastTap: null,
};

const IDLE: Gesture = { type: 'idle' };

const toWorld = (p: Point, v: View): Point => ({
  x: (p.x - v.x) / v.scale,
  y: (p.y - v.y) / v.scale,
});

/** The pointers with pointer `id` at `p`: where it was in the order, else last. */
function withPointer(
  pointers: GestureState['pointers'],
  id: number,
  p: Point,
): GestureState['pointers'] {
  return pointers.some((q) => q.id === id)
    ? pointers.map((q) => (q.id === id ? { id, p } : q))
    : [...pointers, { id, p }];
}

/** The gesture after `event`, and what the table should do about it, in order. */
export function step(
  state: GestureState,
  event: GestureEvent,
  ctx: GestureContext,
): [GestureState, GestureEffect[]] {
  const g = state.gesture;
  switch (event.type) {
    case 'down': {
      const pointers = withPointer(state.pointers, event.pointer, event.p);
      if (pointers.length === 2) {
        // A second finger: whatever the first one did, the two pinch.
        const [a, b] = pointers.map((q) => q.p);
        const effects: GestureEffect[] =
          g.type === 'press'
            ? [{ type: 'cancelLongPress' }]
            : g.type === 'drag'
              ? [{ type: 'dragCancel' }]
              : [];
        const pinch: Gesture = {
          type: 'pinch',
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          view: event.view,
        };
        return [{ ...state, pointers, gesture: pinch }, effects];
      }
      if (pointers.length > 2) return [{ ...state, pointers }, []];
      const press: Gesture = {
        type: 'press',
        x: event.p.x,
        y: event.p.y,
        target: event.target,
      };
      return [
        { ...state, pointers, gesture: press },
        [{ type: 'startLongPress' }],
      ];
    }

    case 'move': {
      const prev = state.pointers.find((q) => q.id === event.pointer)?.p;
      if (!prev) return [state, []];
      const { p, view } = event;
      const pointers = withPointer(state.pointers, event.pointer, p);
      if (g.type === 'pinch') {
        const [a, b] = pointers.map((q) => q.p);
        if (!b) return [{ ...state, pointers }, []];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const scale = clampScale((g.view.scale * dist) / g.dist);
        // The table point first under the fingers' middle stays under it.
        const anchor = toWorld(g.mid, g.view);
        const zoomed = {
          scale,
          x: mid.x - anchor.x * scale,
          y: mid.y - anchor.y * scale,
        };
        return [{ ...state, pointers }, [{ type: 'view', view: zoomed }]];
      }
      const effects: GestureEffect[] = [];
      let next = g;
      if (g.type === 'press') {
        if (Math.hypot(p.x - g.x, p.y - g.y) < TAP_SLOP)
          return [{ ...state, pointers }, []];
        effects.push({ type: 'cancelLongPress' });
        const grab = ctx.grab(g.target);
        if (!grab) next = { type: 'pan' };
        else {
          // Held as it was taken: the item lies offset from the pointer.
          const w = toWorld(g, view);
          next = {
            type: 'drag',
            target: grab.target,
            offX: w.x - grab.pos.x,
            offY: w.y - grab.pos.y,
          };
        }
      }
      if (next.type === 'pan') {
        const panned = {
          ...view,
          x: view.x + p.x - prev.x,
          y: view.y + p.y - prev.y,
        };
        effects.push({ type: 'view', view: panned });
      } else if (next.type === 'drag') {
        const w = toWorld(p, view);
        effects.push({
          type: 'drag',
          target: next.target,
          x: w.x - next.offX,
          y: w.y - next.offY,
          pointer: w,
        });
      }
      return [{ ...state, pointers, gesture: next }, effects];
    }

    case 'up': {
      if (!state.pointers.some((q) => q.id === event.pointer))
        return [state, []];
      const pointers = state.pointers.filter((q) => q.id !== event.pointer);
      const effects: GestureEffect[] = [];
      let { lastTap } = state;
      if (g.type === 'press') {
        effects.push({ type: 'cancelLongPress' });
        const { target } = g;
        const id = 'id' in target ? target.id : null;
        // A tap that can't be half of a double tap (while a tap picks a target, on the storybook) neither starts one nor
        // ends one.
        if (id === null || !ctx.doubleTaps(target))
          effects.push({ type: 'tap', target });
        else if (
          lastTap?.id === id &&
          event.time - lastTap.time < DOUBLE_TAP_MS
        ) {
          lastTap = null;
          effects.push({ type: 'doubleTap', target });
        } else {
          lastTap = { id, time: event.time };
          effects.push({ type: 'tap', target });
        }
      } else if (g.type === 'drag') effects.push({ type: 'drop' });
      effects.push({ type: 'release' });
      // After a pinch, nothing new starts until all fingers are lifted.
      return [{ pointers, gesture: IDLE, lastTap }, effects];
    }

    case 'cancel': {
      const pointers = state.pointers.filter((q) => q.id !== event.pointer);
      const effects: GestureEffect[] = [];
      if (g.type === 'press') effects.push({ type: 'cancelLongPress' });
      if (g.type === 'drag') effects.push({ type: 'dragCancel' });
      effects.push({ type: 'release' });
      return [{ ...state, pointers, gesture: IDLE }, effects];
    }

    case 'timeout':
      if (g.type !== 'press' || !ctx.longPresses(g.target)) return [state, []];
      return [
        { ...state, gesture: IDLE },
        [{ type: 'longPress', target: g.target }],
      ];
  }
}
