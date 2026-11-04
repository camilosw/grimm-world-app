import { useCallback, useRef, useState, type RefObject } from 'react';
import { allAreas } from '../engine/areas';
import { CARD_H, CARD_W, clampScale, tokenSize } from '../engine/geometry';
import type { Table, View } from '../engine/types';
import { gameUI } from './gameUI';

/** How long the view glides to an area or a pile it is sent to (see `.world.gliding` in styles.css). */
export const GLIDE_MS = 500;

/** The view of the table (pan and zoom) in the area `areaRef` and the ways of framing parts of the table in it. */
export function useFitView(areaRef: RefObject<HTMLDivElement | null>) {
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.5 });

  /**
   * The view in which the given table rectangle fills the screen, but `inset` pixels at its top and bottom, zoomed in
   * at most to `maxScale` (1: a card as large as its size in table units).
   */
  const rectView = useCallback(
    (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      inset = { top: 0, bottom: 0 },
      maxScale = 1,
    ): View | null => {
      const el = areaRef.current;
      if (!el) return null;
      const pad = 40;
      const h = el.clientHeight - inset.top - inset.bottom;
      const scale = clampScale(
        Math.min(
          maxScale,
          (el.clientWidth - pad * 2) / (maxX - minX),
          (h - pad * 2) / (maxY - minY),
        ),
      );
      return {
        scale,
        x: (el.clientWidth - (maxX - minX) * scale) / 2 - minX * scale,
        y: inset.top + (h - (maxY - minY) * scale) / 2 - minY * scale,
      };
    },
    [areaRef],
  );

  /** Zoom and pan so that the given table rectangle fills the screen (but `inset` pixels at its top and bottom). */
  const fitRect = useCallback(
    (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      inset?: { top: number; bottom: number },
    ) => {
      const v = rectView(minX, minY, maxX, maxY, inset);
      if (v) setView(v);
    },
    [rectView],
  );

  /**
   * The view showing the areas the game frames on this table (`GameUI.fitAreas`: those used in every round, or in a
   * combat those used in it); with `whole`, everything on the table.
   */
  const fitView = useCallback(
    (t: Table, whole = false) => {
      const fit = gameUI().fitAreas(t);
      const items = whole
        ? [
            ...t.z
              .map((id) => t.stacks[id])
              .map((s) => ({ x: s.x, y: s.y - 50, w: CARD_W, h: CARD_H + 90 })),
            ...t.tokens.map((k) => ({
              x: k.x,
              y: k.y,
              w: tokenSize(k),
              h: tokenSize(k),
            })),
            ...allAreas(t),
          ]
        : allAreas(t).filter((a) => fit.includes(a.id));
      return rectView(
        Math.min(...items.map((i) => i.x)),
        Math.min(...items.map((i) => i.y)),
        Math.max(...items.map((i) => i.x + i.w)),
        Math.max(...items.map((i) => i.y + i.h)),
      );
    },
    [rectView],
  );

  /** The view moving smoothly to an area or a pile it is sent to, until the player pans or zooms. */
  const [gliding, setGliding] = useState(false);
  const glideTimer = useRef<number | undefined>(undefined);
  const glideTo = (v: View | null) => {
    if (!v) return;
    window.clearTimeout(glideTimer.current);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setGliding(!still);
    if (!still)
      glideTimer.current = window.setTimeout(() => setGliding(false), GLIDE_MS);
    setView(v);
  };
  /** The area just shown by its button, lit up there until the view moves elsewhere. */
  const [shownArea, setShownArea] = useState<string | null>(null);
  /** The view moved by the player (pan, pinch, wheel): it stops gliding where it is headed. */
  const moveView = (v: View) => {
    window.clearTimeout(glideTimer.current);
    setGliding(false);
    setShownArea(null);
    setView(v);
  };

  const fit = useCallback(
    (t: Table, whole = false) => {
      const v = fitView(t, whole);
      if (v) setView(v);
    },
    [fitView],
  );

  /** Glide to the play areas; when they are shown already, to the whole table. */
  const toggleFit = (t: Table) => {
    const play = fitView(t);
    const same =
      !!play &&
      Math.abs(play.scale - view.scale) < 1e-3 &&
      Math.abs(play.x - view.x) < 1 &&
      Math.abs(play.y - view.y) < 1;
    setShownArea(null);
    glideTo(fitView(t, same));
  };

  return {
    view,
    gliding,
    shownArea,
    setShownArea,
    rectView,
    fitRect,
    fitView,
    fit,
    glideTo,
    moveView,
    toggleFit,
  };
}
