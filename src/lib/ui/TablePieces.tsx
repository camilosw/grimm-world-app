import { useLayoutEffect, useRef } from 'react';
import { cardImage, game, isLandscape } from '../engine/game';
import { gameUI } from './gameUI';
import { unpinned } from '../engine/actions';
import type { Area } from '../engine/areas';
import { cardLabel } from '../engine/cards';
import {
  CARD_H,
  CARD_W,
  cardBox,
  type Side,
  tokenSize,
  type Turn,
} from '../engine/geometry';
import type { CardDef, Stack, Token } from '../engine/types';
import { landscapeClass, turnedClass } from './cardClasses';
import type { Dealt, TableControl } from './Table';
import { useFlip } from './useFlip';

// The pieces the table is drawn with: its areas, piles, fixed places whose taps the game handles, figures and the
// buttons drawn on it.

/** A fixed place whose taps the game handles (`Stack.slot`, `GameDefinition.slots`: the storybook's two). */
export function SlotView({
  stack,
  defs,
  size,
  dropTarget,
}: {
  stack: Stack;
  defs: Record<string, CardDef>;
  size: 'sm' | 'lg';
  dropTarget: boolean;
}) {
  const top = stack.cards[stack.cards.length - 1];
  const depth = Math.min(8, Math.ceil(Math.log2(stack.cards.length + 1)));
  const shadow = Array.from(
    { length: depth },
    (_, i) =>
      `${i + 1}px ${(i + 1) * 1.5}px 0 ${i % 2 ? '#3a2e24' : '#d8cdb8'}`,
  );
  return (
    <div
      className={`stack slot${dropTarget ? ' drop-target' : ''}`}
      data-stack={stack.id}
      style={{ left: stack.x, top: stack.y, width: CARD_W, height: CARD_H }}
    >
      {top ? (
        <div
          className="card"
          style={{
            boxShadow: [...shadow, '0 4px 10px rgba(0,0,0,.45)'].join(', '),
          }}
        >
          <img
            src={cardImage(top.id, top.faceUp, size)}
            alt={top.faceUp ? cardLabel(defs[top.id]) : (stack.label ?? 'Card')}
            draggable={false}
          />
        </div>
      ) : (
        <div className="slot-empty">{game().slots[stack.slot!]?.empty}</div>
      )}
      {stack.cards.length > 1 && (
        <div className="slot-count">{stack.cards.length}</div>
      )}
    </div>
  );
}

interface AreaViewProps {
  area: Area;
  /** Cards dragged over it are taken or refused; or it is being moved. */
  state: 'accept' | 'refuse' | 'moving' | null;
  /** The buttons in its header, in this order. */
  controls: TableControl[];
  /** Its ⓘ. */
  onInfo: () => void;
}

export function AreaView({ area, state, controls, onInfo }: AreaViewProps) {
  const { AreaIcon } = gameUI();
  const accepts = gameUI().acceptsText(area);
  return (
    <div
      className={`area area-${area.id}${area.deck ? ' area-deck' : ''}${state ? ` ${state}` : ''}`}
      style={{ left: area.x, top: area.y, width: area.w, height: area.h }}
    >
      <div
        className="area-grip"
        data-area-grip={area.id}
        title="Drag here to move the area"
      >
        ⠿
        <Hit />
      </div>
      <div className="area-header">
        <span>
          <AreaIcon id={area.id} />
          {area.label}
          <button
            className="area-info"
            data-ui
            onClick={onInfo}
            aria-label={`Rules: ${area.label}`}
          >
            ⓘ
            <Hit />
          </button>
          {accepts !== area.label && <small>{accepts}</small>}
        </span>
        {controls.length > 0 && (
          <span className="area-buttons">
            {controls.map((c) => (
              <button
                key={c.key}
                className={c.on ? 'on' : undefined}
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
    </div>
  );
}

/** A button drawn on the table below a box of it (the game's: below an Encounter Deck place, a deck's place, the storybook). */
export function PlaceButton({
  control,
  box,
}: {
  control: TableControl;
  box: { x: number; y: number; w: number; h: number };
}) {
  return (
    <button
      className={`place-button${control.on ? ' on' : ''}`}
      data-ui
      disabled={control.disabled}
      onClick={control.run}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {control.label}
      <Hit />
    </button>
  );
}

interface StackViewProps {
  stack: Stack;
  defs: Record<string, CardDef>;
  size: 'sm' | 'lg';
  selected: boolean;
  dropTarget: boolean;
  lifted: boolean;
  /** Part of it lies under another card (the Alignment Card under the Character Card, Money and Goods under the Storage Card). */
  covered: Side | null;
  /** Lies landscape, turned a quarter to this side by its place (Market Prices face up, the Encounter Bar face down). */
  turn?: Turn | null;
  /** Lies in a row of Money Cards or Goods, whose cards slide when it rearranges. */
  sliding: boolean;
  /** A Terrain Card of the battlefield being typed, not on the table yet. */
  previewed?: boolean;
  /** A deck lying on its place in its area, named by it: it shows how many cards it holds but can't be moved as a whole. */
  fixed?: boolean;
  /** An Encounter Deck place: its grip doesn't show how many cards it holds, so the deck's size stays unknown. */
  countless?: boolean;
  /** How many cards on top its count leaves out: the card fixed there for good (the Damage Card, a deck's `keeps` card). */
  uncounted?: number;
  /** Set while the pile shows being shuffled; a new value restarts it. */
  shuffle?: number | null;
  /** Just dealt here from another place: shown travelling from there. */
  dealt?: Dealt | null;
}

/** How long a dealt card takes to travel to its place (see `DEAL_MS` in App.tsx). */
const DEAL_TRAVEL_MS = 380;

/** Most cards shown splitting and sliding back together while a pile is shuffled. */
const SHUFFLE_CARDS = 4;

export function StackView({
  stack,
  defs,
  size,
  selected,
  dropTarget,
  lifted,
  covered,
  turn,
  sliding,
  previewed,
  fixed,
  countless,
  uncounted = 0,
  shuffle,
  dealt,
}: StackViewProps) {
  const top = stack.cards[stack.cards.length - 1];
  const count = stack.cards.length;
  const landscape = isLandscape(defs[top.id]) || !!turn;
  const cardRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const faceUp = useFlip(cardRef, top, landscape ? 'x' : 'y');
  const { x, y } = stack;

  // Just dealt: travel from where it came from, above everything, lifted on the way and turning (upright where it came
  // from) to lie as its place has it.
  useLayoutEffect(() => {
    const node = stackRef.current;
    if (
      !dealt ||
      !node ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const back = turn === 'left' ? 90 : turn === 'right' ? -90 : 0;
    const from = `translate(${dealt.from.x - x}px, ${dealt.from.y - y}px) rotate(${back}deg)`;
    const run = node.animate(
      [
        {
          transform: from,
          zIndex: 1000,
          filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))',
        },
        {
          transform: `translate(${(dealt.from.x - x) / 2}px, ${(dealt.from.y - y) / 2}px) rotate(${back / 2}deg) scale(1.12)`,
          zIndex: 1000,
          filter: 'drop-shadow(0 24px 22px rgba(0,0,0,.5))',
          offset: 0.5,
        },
        {
          transform: 'none',
          zIndex: 1000,
          filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.4))',
        },
      ],
      { duration: DEAL_TRAVEL_MS, easing: 'cubic-bezier(.45,.05,.35,1)' },
    );
    return () => run.cancel();
  }, [dealt, x, y, turn]);
  // A countless pile (the Encounter Deck's places) gives no hint of its size: one edge, whatever it holds.
  const depth = countless ? 1 : Math.min(8, Math.ceil(Math.log2(count + 1)));
  const shadow = Array.from(
    { length: depth },
    (_, i) =>
      `${i + 1}px ${(i + 1) * 1.5}px 0 ${i % 2 ? '#3a2e24' : '#d8cdb8'}`,
  );
  const classes = [
    'stack',
    selected && 'selected',
    dropTarget && 'drop-target',
    lifted && 'lifted',
    covered && `covered-${covered}`,
    sliding && 'sliding',
    previewed && 'previewed',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      ref={stackRef}
      className={classes}
      data-stack={stack.id}
      style={cardBox(stack.x, stack.y, landscape)}
    >
      <div
        ref={cardRef}
        className={`card${turn ? turnedClass(turn) : landscapeClass(landscape, faceUp)}`}
        style={{
          rotate: `${stack.rot}deg`,
          boxShadow: [
            ...shadow,
            lifted
              ? '0 18px 30px rgba(0,0,0,.55)'
              : '0 4px 10px rgba(0,0,0,.45)',
          ].join(', '),
        }}
      >
        <img
          src={cardImage(top.id, faceUp, size)}
          alt={cardLabel(defs[top.id])}
          draggable={false}
        />
      </div>
      {/* Being shuffled: its top cards (not a pinned card) split to both sides and slide back in, one after another. */}
      {shuffle != null &&
        unpinned(stack)
          .slice(-SHUFFLE_CARDS)
          .map((c, i) => (
            <div
              key={`${shuffle}-${i}`}
              className={`card shuffle-card${i % 2 ? ' right' : ''}${turn ? turnedClass(turn) : landscapeClass(landscape, c.faceUp)}`}
              style={{
                rotate: `${stack.rot}deg`,
                animationDelay: `${i * 60}ms`,
              }}
              aria-hidden
            >
              <img
                src={cardImage(c.id, c.faceUp, size)}
                alt=""
                draggable={false}
              />
            </div>
          ))}
      {fixed
        ? count > 1 && <div className="slot-count">{count - uncounted}</div>
        : count > 1 && (
            <div
              className="grip"
              data-grip
              title="Drag here to move the whole pile"
            >
              ⠿{countless ? '' : ` ${count - uncounted}`}
              <Hit />
            </div>
          )}
      {stack.label && !fixed && !stack.place && (
        <div className="stack-label">{stack.label}</div>
      )}
    </div>
  );
}

/**
 * A control's touch target, invisible: on a phone (`.hit` in styles.css) it reaches 44 screen pixels, however far the
 * table is zoomed out (up to a limit), so the control is still easy to hit.
 */
export function Hit() {
  return <span className="hit" aria-hidden />;
}

export function TokenView({
  token,
  selected,
}: {
  token: Token;
  selected: boolean;
}) {
  return (
    <div
      className={`token ${token.shape}${selected ? ' selected' : ''}`}
      data-token={token.id}
      style={{
        left: token.x,
        top: token.y,
        width: tokenSize(token),
        height: tokenSize(token),
        background: token.color,
      }}
    />
  );
}
