import { type DraggedPile, movingPile } from '../engine/actions';
import { game } from '../engine/game';
import {
  allAreas,
  deckPlacesIn,
  gridCells,
  gridPlaces,
  placeStack,
  type Spot,
  spotsOf,
} from '../engine/areas';
import {
  fanRow,
  freePlaces,
  shows,
  showsPlace,
  splitHalves,
} from '../engine/arrangement';
import { cardBox } from '../engine/geometry';
import { freeCovered } from '../engine/layering';
import { landscapeSpot } from '../engine/orientation';
import type { Table } from '../engine/types';
import type { Incoming, TableControl } from './Table';
import { Hit } from './TablePieces';
import { gameUI } from './gameUI';

// The empty card places drawn on the table, under the piles: the grids' free places, the spots' and the fixed places'
// (Encounter Deck places, the decks lying on the table), each lit up while cards dragged over it would go there.

/** Below this breadth (world units) a covered place's label is set smaller to fit (Market Prices showing only their price strip). */
const NARROW_SPOT = 70;

/** Position and size of a table rectangle as an absolutely placed element's style. */
const rectStyle = (r: { x: number; y: number; w: number; h: number }) => ({
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
});

interface PlaceholdersProps {
  /** The table itself. */
  table: Table;
  /** The table shown (a preview of it, while something is dragged or typed). */
  shown: Table;
  /** What a drag lights up. */
  hl: Incoming | null;
  /** The pile dragged on the table, if any, and where it would really land. */
  dragged: DraggedPile | null;
  to: { x: number; y: number } | null;
  /** Piles shown that aren't on the table yet (a battlefield being typed): their grid shows no strips beside them. */
  faded: Set<string>;
  /** The buttons drawn in a grid's first place. */
  controls: TableControl[];
}

export function Placeholders({
  table,
  shown,
  hl,
  dragged,
  to,
  faded,
  controls,
}: PlaceholdersProps) {
  const spots = spotsOf(shown);
  const state = (lit: boolean) =>
    lit ? (hl?.area?.ok ? ' accept' : ' refuse') : '';

  /** A spot's placeholders: its free place(s), only the part showing beside a card covering it. */
  const placeholders = (spot: Spot) => {
    // A fanned spot shows its next free place, none when full. The Encounter Bar: left of its cards, and once it
    // has cards, also right of its last one.
    // A row sharing a split placeholder shows no free place of its own: the split one takes its cards, beyond both rows
    // (Titles | Skills above the Character Card, Items over Money right of the Storage Card), all of it once the other
    // row is full.
    if (spots.some((s) => s.fan?.split && s.fan.after === spot.id)) return [];
    if (spot.fan?.split) {
      const halves = splitHalves(shown, spot);
      const side = freeCovered(shown, spot);
      const across = side === 'top' || side === 'bottom';
      return halves.map((half, i) => {
        const pos =
          halves.length === 1
            ? 'whole'
            : across
              ? i
                ? 'right'
                : 'left'
              : i
                ? 'bottom'
                : 'top';
        return (
          <div
            key={`${spot.id}-${i}`}
            className={`card-spot covered covered-${side} split-${pos}${state(hl?.spot === half.spot.id)}`}
            style={{ left: half.x, top: half.y, width: half.w, height: half.h }}
          >
            <span>
              {half.spot.label}
              {half.spot.hint && <small>{half.spot.hint}</small>}
            </span>
          </div>
        );
      });
    }
    // None once a row is full, nor where a place shows none of its own (`showsPlace()`).
    if (!showsPlace(shown, spot, spots)) return [];
    const addsFirst = !!spot.fan?.addsFirst;
    const row = addsFirst ? fanRow(shown, spot) : [];
    // Where the dragged card goes: after the row's last card (not counting the card itself), else before its first.
    // Taken from the table itself: the preview spreads a dragged pile out into cards that aren't on it.
    const others = addsFirst
      ? fanRow(table, spot).filter((id) => id !== dragged?.id)
      : [];
    const toEnd =
      !!to &&
      others.length > 0 &&
      to.x > table.stacks[others[others.length - 1]].x;
    return freePlaces(shown, spot).map((at, i) => {
      const end = i > 0;
      // A covered spot only shows the part beside the card lying on it. The Encounter Bar's free place lies under
      // its first card, though the cards put there go on top; its place after the last card lies under that card. So
      // does the hand's place after its last card, though the card put there goes on top.
      const side = end
        ? 'left'
        : row.length
          ? 'right'
          : freeCovered(shown, spot);
      const hover = hl?.spot === spot.id && (!addsFirst || end === toEnd);
      const box = cardBox(at.x, at.y, landscapeSpot(spot));
      const hidden = 1 - shows(spot);
      if (side === 'left') box.left += hidden * box.width;
      if (side === 'top') box.top += hidden * box.height;
      if (side === 'left' || side === 'right') box.width *= 1 - hidden;
      if (side === 'top' || side === 'bottom') box.height *= 1 - hidden;
      return (
        <div
          key={end ? `${spot.id}-end` : spot.id}
          className={`card-spot${side ? ` covered covered-${side}` : ''}${box.width > box.height ? ' wide' : ''}${Math.min(box.width, box.height) < NARROW_SPOT ? ' narrow' : ''}${state(hover)}`}
          style={box}
        >
          <span>
            {spot.label}
            {spot.hint && <small>{spot.hint}</small>}
          </span>
        </div>
      );
    });
  };

  return (
    <>
      {/* The grids' free places (the Map's, the battlefield's): the first one, then a strip on each free side of their cards. */}
      {/* While a battlefield is typed, only its first place: there are no cards to lay beside yet. */}
      {game().grids.flatMap((g) => {
        const typed =
          faded.size > 0 && gridCells(shown, g).some((c) => faded.has(c.id));
        return gridPlaces(
          shown,
          g,
          dragged ? movingPile(table, dragged.id, dragged.whole) : null,
        ).flatMap((p) => {
          if (typed && p.side) return [];
          const hover =
            hl?.area?.id === g && hl.to?.x === p.x && hl.to?.y === p.y;
          return (
            <div
              key={`${g}-${p.col},${p.row}-${p.side}`}
              className={`card-spot${p.side ? ` grid-strip strip-${p.side}` : ' wide'}${state(hover)}`}
              style={rectStyle(p.box)}
            >
              {p.side ? (
                <span>+</span>
              ) : (
                <span>
                  {gameUI().gridStart[g].label}
                  <small>{gameUI().gridStart[g].hint}</small>
                  {controls
                    .filter((c) => 'grid' in c.at && c.at.grid === g)
                    .map((c) => (
                      <button
                        key={c.key}
                        className={`spot-button${c.on ? ' on' : ''}`}
                        data-ui
                        disabled={c.disabled}
                        onClick={c.run}
                      >
                        {c.label}
                        <Hit />
                      </button>
                    ))}
                </span>
              )}
            </div>
          );
        });
      })}
      {spots.flatMap(placeholders)}
      {allAreas(shown).flatMap((area) => {
        // The places of a deck's piles (the Encounter Deck area's), shown while empty (their piles cover them).
        const places = deckPlacesIn(area.id);
        if (places.length)
          return places.map(({ place, label, hint }) => {
            const at = game().placePoint(shown, place);
            const s = placeStack(shown, place);
            return (
              <div
                key={`place-${place}`}
                className={`card-spot${state(!!s && hl?.dropOn === s.id)}`}
                style={cardBox(at.x, at.y, false)}
              >
                <span>
                  {label}
                  {hint && <small>{hint}</small>}
                </span>
              </div>
            );
          });
        // The place of a deck lying on the table, shown while it is empty (its pile covers it).
        if (!area.deck) return [];
        const spec = game().decks[area.deck];
        const at = game().placePoint(shown, area.deck);
        return [
          <div
            key={`deck-${area.id}`}
            className={`card-spot${state(hl?.area?.id === area.id)}`}
            style={cardBox(at.x, at.y, false)}
          >
            <span>
              {spec.label}
              {spec.emptyHint && <small>{spec.emptyHint}</small>}
            </span>
          </div>,
        ];
      })}
    </>
  );
}
