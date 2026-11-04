import { useMemo, useRef, useState } from 'react';
import { game, isLandscape } from '../engine/game';
import { cardImage } from '../engine/cards';
import {
  type Destination,
  dragged,
  dragsWhole,
  dropDestination,
  isFixed,
  moveArea,
  moveStack,
  pinnedOnTop,
  sealed,
  settleSpots,
  stackTargetAt,
  unpinned,
} from '../engine/actions';
import {
  allAreas,
  areaOf,
  drawOrder,
  placePiles,
  snapArea,
  spotsOf,
  stacksOnSpot,
} from '../engine/areas';
import { fanRow } from '../engine/arrangement';
import { coveredSide } from '../engine/layering';
import { CARD_H, CARD_W } from '../engine/geometry';
import type {
  At,
  CardDef,
  GridId,
  Table as TableState,
  View,
} from '../engine/types';
import { landscapeClass } from './cardClasses';
import { CardGhost } from './CardGhost';
import type { Point, Target } from './tableGestures';
import {
  AreaView,
  PlaceButton,
  SlotView,
  StackView,
  TokenView,
} from './TablePieces';
import { Placeholders } from './TablePlaces';
import { useTableGestures } from './useTableGestures';

export type Selection = { kind: 'stack' | 'token'; id: string } | null;

/**
 * Places outside the table that accept cards: a sidebar deck, the sidebar itself, or the right sidebar of cards set
 * aside (before the set-aside pile `before`, else last).
 */
export type Zone =
  | { kind: 'deck'; id: string }
  | { kind: 'dock' }
  | { kind: 'tray'; before: string | null };

/** Where cards dragged in from outside the table (sidebar, set-aside cards, Browse panel) would land, to light it up. */
export interface Incoming {
  area: { id: string; ok: boolean } | null;
  spot: string | null;
  dropOn: string | null;
  /** Where they would lie (a free place of the battlefield grid lights up). */
  to?: { x: number; y: number } | null;
}

/** Something dragged on the table and dropped. */
export type TableDrop =
  | { kind: 'token'; id: string; x: number; y: number }
  | { kind: 'area'; id: string; x: number; y: number }
  /** A pile (or its top card) dropped on a zone outside the table. */
  | { kind: 'zone'; zone: Zone; stackId: string; whole: boolean }
  /** A pile (or its top card) dropped on the table, with where it really goes (`dropDestination`). */
  | { kind: 'table'; stackId: string; whole: boolean; dest: Destination };

/** A button drawn on the table: below a box of the table, in an area's header, or in the first place of an empty grid. */
export interface TableControl {
  key: string;
  label: string;
  at:
    | { box: { x: number; y: number; w: number; h: number } }
    | { area: string }
    | { grid: GridId };
  disabled?: boolean;
  /** Shown pressed (the Browse button of the pile being browsed). */
  on?: boolean;
  run: () => void;
}

interface Props {
  table: TableState;
  defs: Record<string, CardDef>;
  view: View;
  onView: (v: View) => void;
  selection: Selection;
  /** A tap picks a target (the `.picking` look). */
  picking: boolean;
  /**
   * Shown instead of the table, which can then only be panned and zoomed; the piles in `faded` are drawn faded (not on
   * the table yet).
   */
  preview?: { table: TableState; faded: string[] } | null;
  /** A tap on the background, a figure or a pile (a fixed place whose taps the game handles too, `Stack.slot`). */
  onTap: (target: Target) => void;
  onDoubleTap: (target: Target) => void;
  onLongPress: (target: Target) => void;
  /** Drop zone under a screen point, if any. */
  zoneAt: (clientX: number, clientY: number) => Zone | null;
  /** A pile (or its top card) dragged on the table is over a drop zone (or left it: null; the drag ended: both null). */
  onZoneHover: (
    zone: Zone | null,
    drag: { stackId: string; whole: boolean } | null,
  ) => void;
  onDrop: (drop: TableDrop) => void;
  /** The buttons drawn on the table, laid out on the table shown. */
  controls: (shown: TableState) => TableControl[];
  /** The ⓘ of an area. */
  onAreaInfo: (areaId: string) => void;
  /** Cards dragged in from outside the table, while over it. */
  incoming?: Incoming | null;
  /** The pile just shuffled, shown shuffling (`n` restarts the animation). */
  shuffled: { id: string; n: number } | null;
  /** A card just dealt from elsewhere on the table, shown moving from there to its place (`n` restarts it). */
  dealt?: Dealt | null;
  /** The view is gliding to where it now is (`.world.gliding`), not jumping there. */
  gliding?: boolean;
}

/** A card just moved by an action, not a drag: it is shown travelling from `from`, a card place, to where it lies now. */
export interface Dealt {
  cardId: string;
  from: { x: number; y: number };
  n: number;
}

interface Drag {
  target: Target;
  x: number;
  y: number;
  dropOn: string | null;
  zone: Zone | null;
  /** Screen position, for the floating card shown over the sidebar. */
  clientX: number;
  clientY: number;
  /** Area under the dragged card and whether it takes the card. */
  area: { id: string; ok: boolean } | null;
  /** Spot the card goes to (or is refused from). */
  spot: string | null;
  /** Where the card would really land (drawn at x, y). */
  to: { x: number; y: number; at: At } | null;
  /** The pointer, in table coordinates (the dragged card lies offset from it, as it was taken). */
  pointer?: { x: number; y: number };
}

const sameZone = (a: Zone | null, b: Zone | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export function TableView(props: Props) {
  const { table, defs, view, selection, preview } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  function itemPos(target: Target): Point | null {
    if (target.kind === 'stack') return table.stacks[target.id] ?? null;
    if (target.kind === 'token')
      return table.tokens.find((t) => t.id === target.id) ?? null;
    if (target.kind === 'area')
      return allAreas(table).find((a) => a.id === target.id) ?? null;
    return null;
  }

  /** What a pointer going down on `el` presses. */
  function targetAt(el: HTMLElement): Target {
    // While previewing, the table is only panned and zoomed: what it shows isn't the table yet.
    if (preview) return { kind: 'bg' };
    const areaEl = el.closest<HTMLElement>('[data-area-grip]');
    if (areaEl) return { kind: 'area', id: areaEl.dataset.areaGrip! };
    const tokenEl = el.closest<HTMLElement>('[data-token]');
    if (tokenEl) return { kind: 'token', id: tokenEl.dataset.token! };
    const stackEl = el.closest<HTMLElement>('[data-stack]');
    if (!stackEl) return { kind: 'bg' };
    const id = stackEl.dataset.stack!;
    const whole = dragsWhole(table.stacks[id], !!el.closest('[data-grip]'));
    return { kind: 'stack', id, whole };
  }

  /** What a press on `target` drags, and where it lies; null: the table is panned instead. */
  function grab(target: Target) {
    let moved: Target | null = target.kind === 'bg' ? null : target;
    if (target.kind === 'stack') {
      const pile = dragged(table, defs, target);
      moved = pile && { kind: 'stack', ...pile };
    }
    const pos = moved && itemPos(moved);
    return moved && pos ? { target: moved, pos } : null;
  }

  /** The dragged item held with its top-left corner at (x, y): where it would go, lit up. */
  function onDrag(
    target: Target,
    x: number,
    y: number,
    pointer: Point,
    client: Point,
  ) {
    const still = {
      target,
      clientX: client.x,
      clientY: client.y,
      area: null,
      spot: null,
      to: null,
    };
    if (target.kind === 'area') {
      const at = snapArea(table, target.id, x, y);
      return setDrag({ ...still, ...at, dropOn: null, zone: null });
    }
    if (target.kind !== 'stack')
      return setDrag({ ...still, x, y, dropOn: null, zone: null, pointer });
    const zone = props.zoneAt(client.x, client.y);
    const exclude = target.whole ? target.id : null;
    let dropOn = zone
      ? null
      : (stackTargetAt(table, x + CARD_W / 2, y + CARD_H / 2, exclude)?.id ??
        null);
    if (dropOn === target.id) dropOn = null;
    if (!sameZone(zone, drag?.zone ?? null))
      props.onZoneHover(zone, { stackId: target.id, whole: target.whole });
    let area: Drag['area'] = null;
    let spot: string | null = null;
    let to: Drag['to'] = null;
    if (!zone) {
      const dest = dropDestination(
        table,
        defs,
        target.id,
        target.whole,
        x,
        y,
        dropOn,
        pointer,
      );
      if ('pick' in dest) {
        dropOn = dest.pick;
        const lit = areaOf(table, dest.pick);
        area = lit ? { id: lit, ok: true } : null;
      } else {
        dropOn = dest.onto;
        if (dest.area) area = { id: dest.area.id, ok: !dest.refused };
        spot = dest.spot?.id ?? null;
        to = { x: dest.x, y: dest.y, at: dest.at };
      }
    }
    setDrag({ ...still, x, y, dropOn, zone, area, spot, to, pointer });
  }

  /** The drag ended: the item dropped where it was last held. */
  function onDrop() {
    if (!drag) return;
    const { target, x, y, dropOn, zone } = drag;
    if (target.kind === 'token' || target.kind === 'area')
      return props.onDrop({ kind: target.kind, id: target.id, x, y });
    if (target.kind !== 'stack') return;
    const { id: stackId, whole } = target;
    if (zone) return props.onDrop({ kind: 'zone', zone, stackId, whole });
    const dest = dropDestination(
      table,
      defs,
      stackId,
      whole,
      x,
      y,
      dropOn,
      drag.pointer,
    );
    props.onDrop({ kind: 'table', stackId, whole, dest });
  }

  const gestures = useTableGestures(rootRef, {
    view,
    onView: props.onView,
    targetAt,
    ctx: {
      grab,
      // Not while a tap picks a target, nor on a fixed place whose taps the game handles (the storybook).
      doubleTaps: (target) =>
        target.kind === 'stack' &&
        !props.picking &&
        !table.stacks[target.id]?.slot,
      // A sealed place (the face-down storybook) can't be looked at.
      longPresses: (target) =>
        target.kind === 'stack' && !sealed(table.stacks[target.id]),
    },
    onTap: (target) => {
      if (target.kind !== 'area') props.onTap(target);
    },
    onDoubleTap: props.onDoubleTap,
    onLongPress: props.onLongPress,
    onDrag,
    onDrop,
    onDragCancel: () => setDrag(null),
    onRelease: () => {
      if (drag?.zone) props.onZoneHover(null, null);
      setDrag(null);
    },
  });

  const dpr = window.devicePixelRatio || 1;
  const imgSize: 'sm' | 'lg' = view.scale * CARD_W * dpr > 330 ? 'lg' : 'sm';
  const dragStack = drag?.target.kind === 'stack' ? drag.target : null;
  const liftedFrom =
    dragStack && !dragStack.whole ? table.stacks[dragStack.id] : null;
  // Over the sidebar the table can't show the card, so it floats above everything.
  const ghost =
    drag?.zone && dragStack ? table.stacks[dragStack.id]?.cards.at(-1) : null;
  // While a card is dragged along a row of Money Cards, the others make room for it.
  const fanTo =
    dragStack?.whole &&
    drag?.to &&
    drag.area?.ok &&
    spotsOf(table).some((s) => s.fan && s.id === drag.spot)
      ? drag.to
      : null;
  // While an area is dragged, the table shows it (and the areas it pushes aside) where it would go.
  const movingArea = drag?.target.kind === 'area' ? drag.target.id : null;
  const areaPreview = useMemo(
    () =>
      movingArea && drag ? moveArea(table, movingArea, drag.x, drag.y) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only where the area is dropped matters, not the rest of the drag
    [table, movingArea, drag?.x, drag?.y],
  );
  const shownTable =
    preview?.table ??
    areaPreview ??
    (fanTo && dragStack
      ? // The row numbered again and its piles laid out on it, the areas left where they lie.
        placePiles(settleSpots(moveStack(table, dragStack.id, fanTo.at)))
      : table);
  const spots = spotsOf(shownTable);
  const controls = props.controls(shownTable);
  // What a drag lights up: a drag on the table, else cards dragged in from outside it.
  const hl: Incoming | null = drag ?? props.incoming ?? null;
  const sliding = new Set(
    spots.filter((s) => s.fan).flatMap((s) => fanRow(shownTable, s)),
  );
  const covered = new Map(
    spots
      .filter((s) => s.layer?.under || s.layer?.underPile)
      .flatMap((s) =>
        stacksOnSpot(shownTable, s).map((id) => [id, coveredSide(s)]),
      ),
  );
  const faded = new Set(preview?.faded ?? []);
  const turned = new Map(
    spots.flatMap((s) =>
      s.orientation?.turn
        ? stacksOnSpot(shownTable, s).map(
            (id) => [id, s.orientation!.turn!] as const,
          )
        : [],
    ),
  );

  return (
    <div
      ref={rootRef}
      className={`table${props.picking ? ' picking' : ''}`}
      {...gestures}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`world${props.gliding ? ' gliding' : ''}`}
        style={
          {
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            '--inv-scale': 1 / view.scale,
          } as React.CSSProperties
        }
      >
        {allAreas(shownTable).map((area) => (
          <AreaView
            key={area.id}
            area={area}
            state={
              movingArea === area.id
                ? 'moving'
                : hl?.area?.id === area.id
                  ? hl.area.ok
                    ? 'accept'
                    : 'refuse'
                  : null
            }
            controls={controls.filter(
              (c) => 'area' in c.at && c.at.area === area.id,
            )}
            onInfo={() => props.onAreaInfo(area.id)}
          />
        ))}
        <Placeholders
          table={table}
          shown={shownTable}
          hl={hl}
          dragged={dragStack}
          to={drag?.to ?? null}
          faded={faded}
          controls={controls}
        />
        {controls.map(
          (c) =>
            'box' in c.at && (
              <PlaceButton key={c.key} control={c} box={c.at.box} />
            ),
        )}
        {drawOrder(shownTable).map((id) => {
          const s = shownTable.stacks[id];
          let shown = s;
          if (dragStack?.id === id) {
            // A pile moved as a whole is drawn above everything (below); a fixed one leaves its pinned cards.
            if (dragStack.whole && !isFixed(s)) return null;
            shown = {
              ...s,
              cards: dragStack.whole
                ? s.cards.filter((c) => !unpinned(s).includes(c))
                : s.cards.slice(0, -1),
            };
          }
          if (s.slot)
            return (
              <SlotView
                key={id}
                stack={shown}
                defs={defs}
                size={imgSize}
                dropTarget={hl?.dropOn === id}
              />
            );
          if (!shown.cards.length) return null;
          return (
            <StackView
              key={id}
              stack={shown}
              defs={defs}
              size={imgSize}
              selected={selection?.kind === 'stack' && selection.id === id}
              dropTarget={hl?.dropOn === id}
              lifted={false}
              covered={covered.get(id) ?? null}
              turn={turned.get(id) ?? null}
              sliding={sliding.has(id)}
              previewed={faded.has(id)}
              fixed={!!s.deck && !s.place}
              countless={game().deckPlaces.some((p) => p.place === s.place)}
              uncounted={pinnedOnTop(s)}
              shuffle={props.shuffled?.id === id ? props.shuffled.n : null}
              dealt={
                props.dealt &&
                shown.cards.some((c) => c.id === props.dealt!.cardId)
                  ? props.dealt
                  : null
              }
            />
          );
        })}
        {dragStack?.whole && drag && !ghost && table.stacks[dragStack.id] && (
          <StackView
            stack={{
              ...table.stacks[dragStack.id],
              x: drag.x,
              y: drag.y,
              cards: unpinned(table.stacks[dragStack.id]),
            }}
            defs={defs}
            size={imgSize}
            selected={
              selection?.kind === 'stack' && selection.id === dragStack.id
            }
            dropTarget={false}
            lifted
            covered={null}
            sliding={false}
            countless={game().deckPlaces.some(
              (p) => p.place === table.stacks[dragStack.id].place,
            )}
          />
        )}
        {liftedFrom && drag && !ghost && (
          <StackView
            stack={{
              ...liftedFrom,
              id: 'lifted',
              x: drag.x,
              y: drag.y,
              cards: liftedFrom.cards.slice(-1),
              label: undefined,
            }}
            defs={defs}
            size={imgSize}
            selected={false}
            dropTarget={false}
            lifted
            covered={null}
            sliding={false}
          />
        )}
        {shownTable.tokens.map((tok) => (
          <TokenView
            key={tok.id}
            token={
              drag?.target.kind === 'token' && drag.target.id === tok.id
                ? { ...tok, x: drag.x, y: drag.y }
                : tok
            }
            selected={selection?.kind === 'token' && selection.id === tok.id}
          />
        ))}
      </div>
      {ghost && drag && (
        <CardGhost
          src={cardImage(defs[ghost.id], ghost.faceUp, 'sm')}
          x={drag.clientX}
          y={drag.clientY}
          frame={landscapeClass(isLandscape(defs[ghost.id]), ghost.faceUp)}
        />
      )}
    </div>
  );
}
