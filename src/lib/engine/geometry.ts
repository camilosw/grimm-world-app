// Sizes and plain geometry of the table in world units: the card size, areas' padding and gaps, points, rectangles and
// sides. A leaf: it imports nothing but types.

import type { Token } from './types';

export const AREA_PAD = 40;
export const AREA_HEADER = 90;
/** Space between two areas as laid out on the table. */
export const GAP = 40;

/** Size of an area holding `cols` × `rows` cards. */
export function box(cols: number, rows: number) {
  return {
    w: cols * CARD_W + AREA_PAD * 2,
    h: rows * CARD_H + AREA_HEADER + AREA_PAD,
  };
}

export type Point = { x: number; y: number };

export const OPPOSITE: Record<Side, Side> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

export type Side = 'left' | 'right' | 'top' | 'bottom';

export type Rect = { x: number; y: number; w: number; h: number };

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Area in which two rectangles overlap. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function cardRect(x: number, y: number, landscape = false): Rect {
  const b = cardBox(x, y, landscape);
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}

export const bottomOf = (r: Rect) => r.y + r.h;
export const rightOf = (r: Rect) => r.x + r.w;

/** Distance from a point to a rectangle (0 inside it). */
export function distanceTo(r: Rect, p: Point): number {
  const dx = Math.max(r.x - p.x, 0, p.x - rightOf(r));
  const dy = Math.max(r.y - p.y, 0, p.y - bottomOf(r));
  return Math.hypot(dx, dy);
}

/** Card size in table (world) units. Poker ratio 63.5 x 88.9 mm. */
export const CARD_W = 250;
export const CARD_H = 350;

/** A figure's size in table units: the Player marker (the only cube) is a small one. */
export const tokenSize = (k: Pick<Token, 'shape'>) =>
  k.shape === 'cube' ? 20 : 70;

export const clampScale = (s: number) => Math.min(4, Math.max(0.08, s));

/** Side a card's image is turned to, a quarter, to lie landscape. */
export type Turn = 'left' | 'right';

/**
 * Screen box of a card whose place has its top-left corner at (x, y). A landscape card lies across that place,
 * turned about its center, so it has the same center as any other card there.
 */
export function cardBox(x: number, y: number, landscape: boolean) {
  if (!landscape) return { left: x, top: y, width: CARD_W, height: CARD_H };
  return {
    left: x + (CARD_W - CARD_H) / 2,
    top: y + (CARD_H - CARD_W) / 2,
    width: CARD_H,
    height: CARD_W,
  };
}
