import { useEffect, useLayoutEffect, useRef } from 'react';
import { clampScale } from './cards';
import {
  initialGestures,
  LONG_PRESS_MS,
  step,
  type GestureContext,
  type GestureEvent,
  type Point,
  type Target,
} from './tableGestures';
import type { View } from './types';

export interface TableGestureOptions {
  view: View;
  onView: (v: View) => void;
  /** What a pointer going down on this element presses. */
  targetAt: (el: HTMLElement) => Target;
  ctx: GestureContext;
  onTap: (target: Target) => void;
  onDoubleTap: (target: Target) => void;
  onLongPress: (target: Target) => void;
  /**
   * The dragged item is held with its top-left corner at (x, y) and the pointer at `pointer` (table coordinates), at
   * `client` on the screen.
   */
  onDrag: (
    target: Target,
    x: number,
    y: number,
    pointer: Point,
    client: Point,
  ) => void;
  /** The drag ended: drop the item where it was last held. */
  onDrop: () => void;
  /** The drag was abandoned. */
  onDragCancel: () => void;
  /** A pointer went up or was cancelled. */
  onRelease: () => void;
}

/**
 * The pointer gestures on the table element `rootRef` (tap, double tap, long press, drag, one-finger pan, pinch and
 * wheel zoom): the pointer handlers to put on it. The gestures themselves are `step()` in tableGestures.ts; this feeds
 * it the pointer events and carries out what it says.
 */
export function useTableGestures(
  rootRef: React.RefObject<HTMLElement | null>,
  options: TableGestureOptions,
) {
  const state = useRef(initialGestures);
  const timer = useRef<number | undefined>(undefined);

  // The latest options for use inside native/async handlers.
  const live = useRef(options);
  useLayoutEffect(() => {
    live.current = options;
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Wheel zoom (desktop / trackpad) needs a non-passive listener.
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, onView: set } = live.current;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const scale = clampScale(
        v.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
      );
      const k = scale / v.scale;
      set({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    // Safari pinch gestures would otherwise zoom the whole page.
    el.addEventListener('gesturestart', stop);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', stop);
    };
  }, [rootRef]);

  /** Step the gestures on, then do what they say (`client`: where the pointer is on the screen, for a drag). */
  function dispatch(event: GestureEvent, client?: Point) {
    const o = live.current;
    const [next, effects] = step(state.current, event, o.ctx);
    state.current = next;
    for (const fx of effects) {
      switch (fx.type) {
        case 'startLongPress':
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(
            () => dispatch({ type: 'timeout' }),
            LONG_PRESS_MS,
          );
          break;
        case 'cancelLongPress':
          window.clearTimeout(timer.current);
          break;
        case 'view':
          o.onView(fx.view);
          break;
        case 'drag':
          o.onDrag(fx.target, fx.x, fx.y, fx.pointer, client!);
          break;
        case 'drop':
          o.onDrop();
          break;
        case 'dragCancel':
          o.onDragCancel();
          break;
        case 'release':
          o.onRelease();
          break;
        case 'tap':
          o.onTap(fx.target);
          break;
        case 'doubleTap':
          o.onDoubleTap(fx.target);
          break;
        case 'longPress':
          o.onLongPress(fx.target);
          break;
      }
    }
  }

  const local = (e: { clientX: number; clientY: number }) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      // Buttons drawn on the table handle their own clicks.
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      const p = local(e);
      try {
        rootRef.current!.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already gone (e.g. synthetic events); capture is best effort.
      }
      const { view, targetAt } = live.current;
      const target = targetAt(e.target as HTMLElement);
      dispatch({ type: 'down', pointer: e.pointerId, p, target, view });
    },
    onPointerMove(e: React.PointerEvent) {
      // A mouse merely hovering: no pointer down to move.
      if (!state.current.pointers.some((q) => q.id === e.pointerId)) return;
      dispatch(
        {
          type: 'move',
          pointer: e.pointerId,
          p: local(e),
          view: live.current.view,
        },
        { x: e.clientX, y: e.clientY },
      );
    },
    onPointerUp(e: React.PointerEvent) {
      dispatch({ type: 'up', pointer: e.pointerId, time: Date.now() });
    },
    onPointerCancel(e: React.PointerEvent) {
      dispatch({ type: 'cancel', pointer: e.pointerId });
    },
  };
}
