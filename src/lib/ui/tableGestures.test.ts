import { describe, expect, it } from 'vitest';
import type { View } from '../engine/types';
import {
  DOUBLE_TAP_MS,
  type GestureContext,
  type GestureEffect,
  type GestureEvent,
  type GestureState,
  initialGestures,
  step,
  TAP_SLOP,
  type Target,
} from './tableGestures';

const view: View = { x: 0, y: 0, scale: 1 };
const pile: Target = { kind: 'stack', id: 's1', whole: false };
const other: Target = { kind: 'stack', id: 's2', whole: false };
const bg: Target = { kind: 'bg' };

/** Piles drag themselves from (100, 100), double tap and long press; the background pans. */
const ctx: GestureContext = {
  grab: (target) =>
    target.kind === 'bg' ? null : { target, pos: { x: 100, y: 100 } },
  doubleTaps: (target) => target.kind === 'stack',
  longPresses: (target) => target.kind === 'stack',
};

const down = (
  p: { x: number; y: number },
  target: Target = pile,
  pointer = 1,
  v = view,
): GestureEvent => ({ type: 'down', pointer, p, target, view: v });
const move = (
  p: { x: number; y: number },
  pointer = 1,
  v = view,
): GestureEvent => ({ type: 'move', pointer, p, view: v });
const up = (time = 0, pointer = 1): GestureEvent => ({
  type: 'up',
  pointer,
  time,
});

/** The gestures after these events, and all they asked for, in order. */
function run(
  events: GestureEvent[],
  context = ctx,
  from: GestureState = initialGestures,
): [GestureState, GestureEffect[]] {
  return events.reduce<[GestureState, GestureEffect[]]>(
    ([state, all], event) => {
      const [next, effects] = step(state, event, context);
      return [next, [...all, ...effects]];
    },
    [from, []],
  );
}

const types = (effects: GestureEffect[]) => effects.map((e) => e.type);

describe('table gestures', () => {
  it('taps: a press released where it went down', () => {
    const [state, effects] = run([
      down({ x: 10, y: 10 }),
      move({ x: 12, y: 13 }),
      up(),
    ]);
    expect(effects).toEqual([
      { type: 'startLongPress' },
      { type: 'cancelLongPress' },
      { type: 'tap', target: pile },
      { type: 'release' },
    ]);
    expect(state.gesture).toEqual({ type: 'idle' });
    expect(state.pointers).toEqual([]);
  });

  it('double taps the same pile within the window, else taps twice', () => {
    const tap = (target: Target, time: number) => [
      down({ x: 0, y: 0 }, target),
      up(time),
    ];
    const [, quick] = run([...tap(pile, 1000), ...tap(pile, 1200)]);
    expect(
      quick.filter((e) => e.type === 'tap' || e.type === 'doubleTap'),
    ).toEqual([
      { type: 'tap', target: pile },
      { type: 'doubleTap', target: pile },
    ]);
    // A third tap starts a new double tap.
    const [state] = run([
      ...tap(pile, 1000),
      ...tap(pile, 1200),
      ...tap(pile, 1300),
    ]);
    expect(state.lastTap).toEqual({ id: 's1', time: 1300 });

    const [, slow] = run([
      ...tap(pile, 1000),
      ...tap(pile, 1000 + DOUBLE_TAP_MS),
    ]);
    expect(types(slow)).not.toContain('doubleTap');
    const [, two] = run([...tap(pile, 1000), ...tap(other, 1100)]);
    expect(types(two)).not.toContain('doubleTap');
  });

  it("neither starts nor ends a double tap with a tap that can't be half of one", () => {
    const picking = { ...ctx, doubleTaps: () => false };
    const [state, effects] = run([down({ x: 0, y: 0 }), up(1000)], picking, {
      ...initialGestures,
      lastTap: { id: 's1', time: 900 },
    });
    expect(types(effects)).toContain('tap');
    expect(state.lastTap).toEqual({ id: 's1', time: 900 });
    // The background taps, and is never half of a double tap.
    const [, bgTaps] = run([
      down({ x: 0, y: 0 }, bg),
      up(1000),
      down({ x: 0, y: 0 }, bg),
      up(1100),
    ]);
    expect(types(bgTaps).filter((t) => t === 'tap')).toHaveLength(2);
    expect(types(bgTaps)).not.toContain('doubleTap');
  });

  it('long presses, which ends the gesture: releasing then taps nothing', () => {
    const [state, effects] = run([
      down({ x: 0, y: 0 }),
      { type: 'timeout' },
      up(),
    ]);
    expect(types(effects)).toEqual(['startLongPress', 'longPress', 'release']);
    expect(effects[1]).toEqual({ type: 'longPress', target: pile });
    expect(state.gesture.type).toBe('idle');
  });

  it('taps when the long press is not taken', () => {
    const [, effects] = run([down({ x: 0, y: 0 }), { type: 'timeout' }, up()], {
      ...ctx,
      longPresses: () => false,
    });
    expect(types(effects)).toEqual([
      'startLongPress',
      'cancelLongPress',
      'tap',
      'release',
    ]);
  });

  it('drags past the slop, holding the item as it was taken, in table coordinates', () => {
    const zoomed: View = { x: 50, y: 20, scale: 2 };
    const [state, effects] = run([
      down({ x: 250, y: 220 }, pile, 1, zoomed),
      move({ x: 250 + TAP_SLOP - 1, y: 220 }, 1, zoomed),
      move({ x: 270, y: 240 }, 1, zoomed),
      move({ x: 290, y: 220 }, 1, zoomed),
    ]);
    // Taken at table point (100, 100), where the item's corner lies: it follows the pointer.
    expect(effects).toEqual([
      { type: 'startLongPress' },
      { type: 'cancelLongPress' },
      {
        type: 'drag',
        target: pile,
        x: 110,
        y: 110,
        pointer: { x: 110, y: 110 },
      },
      {
        type: 'drag',
        target: pile,
        x: 120,
        y: 100,
        pointer: { x: 120, y: 100 },
      },
    ]);
    const [, end] = run([up()], ctx, state);
    expect(types(end)).toEqual(['drop', 'release']);
  });

  it('drags what the table says the press takes', () => {
    const lifted: Target = { kind: 'stack', id: 's1', whole: true };
    const [, effects] = run([down({ x: 0, y: 0 }), move({ x: 20, y: 0 })], {
      ...ctx,
      grab: () => ({ target: lifted, pos: { x: -5, y: 0 } }),
    });
    expect(effects.at(-1)).toEqual({
      type: 'drag',
      target: lifted,
      x: 15,
      y: 0,
      pointer: { x: 20, y: 0 },
    });
  });

  it('pans what it can not drag, by how far the pointer moved since last time', () => {
    const [state, effects] = run([
      down({ x: 0, y: 0 }, bg),
      move({ x: 3, y: 4 }),
      move({ x: 10, y: 0 }),
      move({ x: 15, y: 5 }, 1, { x: 7, y: -4, scale: 1 }),
    ]);
    expect(effects.filter((e) => e.type === 'view')).toEqual([
      { type: 'view', view: { x: 7, y: -4, scale: 1 } },
      { type: 'view', view: { x: 12, y: 1, scale: 1 } },
    ]);
    expect(state.gesture.type).toBe('pan');
    const [, end] = run([up()], ctx, state);
    expect(types(end)).toEqual(['release']);
  });

  it('pinches with two fingers, a third one ignored, and starts nothing new until all are up', () => {
    const [pressed] = run([down({ x: 100, y: 100 })]);
    const [pinching, started] = run(
      [down({ x: 200, y: 100 }, other, 2)],
      ctx,
      pressed,
    );
    expect(started).toEqual([{ type: 'cancelLongPress' }]);
    expect(pinching.gesture).toEqual({
      type: 'pinch',
      dist: 100,
      mid: { x: 150, y: 100 },
      view,
    });
    // A third finger changes nothing; the second twice as far from the first: the table point under their middle
    // stays under it.
    const [, zoom] = run(
      [
        down({ x: 0, y: 0 }, bg, 3),
        move({ x: 500, y: 500 }, 3),
        move({ x: 300, y: 100 }, 2),
      ],
      ctx,
      pinching,
    );
    expect(zoom).toEqual([
      { type: 'view', view },
      { type: 'view', view: { scale: 2, x: -100, y: -100 } },
    ]);
    const [lifted, end] = run([up(0, 2)], ctx, pinching);
    expect(types(end)).toEqual(['release']);
    expect(lifted.gesture.type).toBe('idle');
    const [, after] = run([move({ x: 300, y: 300 })], ctx, lifted);
    expect(after).toEqual([]);
  });

  it('cancels a drag when a second finger comes down, or the pointer is cancelled', () => {
    const [dragging] = run([down({ x: 0, y: 0 }), move({ x: 20, y: 0 })]);
    expect(dragging.gesture.type).toBe('drag');
    const [, pinch] = run([down({ x: 50, y: 0 }, bg, 2)], ctx, dragging);
    expect(types(pinch)).toEqual(['dragCancel']);
    const [state, cancel] = run(
      [{ type: 'cancel', pointer: 1 }],
      ctx,
      dragging,
    );
    expect(types(cancel)).toEqual(['dragCancel', 'release']);
    expect(state).toEqual({ ...initialGestures, lastTap: null });
  });

  it("ignores the moves and lifts of a pointer it doesn't follow", () => {
    const [pressed] = run([down({ x: 0, y: 0 })]);
    expect(run([move({ x: 50, y: 50 }, 7), up(0, 7)], ctx, pressed)).toEqual([
      pressed,
      [],
    ]);
  });
});
