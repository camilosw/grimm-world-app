import { type RefObject } from 'react';
import { createPortal } from 'react-dom';
import * as A from '../engine/actions';
import { game } from '../engine/game';
import { tokenSize } from '../engine/geometry';
import { resetTable, update } from '../engine/store';
import type { CardManifest, Table, Token, View } from '../engine/types';
import type { Selection } from './Table';
import type { Dialog } from './useDialogs';
import { useDragOut } from './useDragOut';

type FigureKind = { label: string; color: string; shape: Token['shape'] };

const TOKENS: FigureKind[] = [
  { label: 'Player marker', color: '#e8e2d6', shape: 'cube' },
  { label: 'Character', color: '#8a8f98', shape: 'pawn' },
  { label: 'Ally', color: '#7b4fb5', shape: 'pawn' },
  { label: 'Enemy yellow', color: '#f2c318', shape: 'pawn' },
  { label: 'Enemy turquoise', color: '#1fb5b0', shape: 'pawn' },
  { label: 'Enemy black', color: '#1d1d1f', shape: 'pawn' },
  { label: 'Enemy pink', color: '#e75aa6', shape: 'pawn' },
];

/** The Figures panel (open: shown) and, while a figure is dragged out of it, the figure following the pointer. */
export function FiguresPopover({
  open,
  table,
  view,
  areaRef,
  setDialog,
}: {
  open: boolean;
  table: Table;
  view: View;
  /** The table's area on the screen. */
  areaRef: RefObject<HTMLDivElement | null>;
  setDialog: (dialog: Dialog) => void;
}) {
  /**
   * Put a figure from the Figures panel on the table, centered on a screen point (none: the middle of the screen,
   * beside the figures already there). Figures belong to no area or place: they lie on whatever lies there.
   */
  const addFigure = (tok: FigureKind, clientX?: number, clientY?: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const size = tokenSize(tok);
    const dropped = clientX !== undefined && clientY !== undefined;
    let x =
      ((dropped ? clientX - r.left : r.width / 2) - view.x) / view.scale -
      size / 2;
    const y =
      ((dropped ? clientY - r.top : r.height / 2) - view.y) / view.scale -
      size / 2;
    if (!dropped) {
      const near = (k: Token) =>
        Math.abs(k.x + tokenSize(k) / 2 - x - size / 2) <
          (tokenSize(k) + size) / 2 &&
        Math.abs(k.y + tokenSize(k) / 2 - y - size / 2) <
          (tokenSize(k) + size) / 2;
      while (table.tokens.some(near)) x += size + 10;
    }
    update((t) => A.addToken(t, x, y, tok.color, tok.shape));
    setDialog(null);
  };

  // Figures panel: tap a figure to put it in the middle of the screen, or drag it to where it goes; dropped off the
  // table, it stays in the panel.
  const figureDrag = useDragOut<FigureKind>({
    onTap: (tok) => addFigure(tok),
    onDrop: (tok, clientX, clientY) => {
      const r = areaRef.current?.getBoundingClientRect();
      if (
        r &&
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      )
        addFigure(tok, clientX, clientY);
    },
  });

  return (
    <>
      {open && (
        // Hidden while a figure is dragged out of it, so the whole table shows.
        <div
          className={`popover${figureDrag.drag ? ' dragging' : ''}`}
          onPointerDown={(e) => e.target === e.currentTarget && setDialog(null)}
        >
          <div className="popover-panel">
            {TOKENS.map((tok) => (
              <button
                key={tok.label}
                className="figure-button"
                {...figureDrag.bind(tok)}
              >
                <span
                  className={`swatch ${tok.shape}`}
                  style={{ background: tok.color }}
                />{' '}
                {tok.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {figureDrag.drag &&
        createPortal(
          <div
            className={`token ${figureDrag.drag.item.shape} figure-ghost`}
            style={{
              left: figureDrag.drag.x,
              top: figureDrag.drag.y,
              width: tokenSize(figureDrag.drag.item),
              height: tokenSize(figureDrag.drag.item),
              transform: `translate(-50%, -50%) scale(${view.scale})`,
              background: figureDrag.drag.item.color,
            }}
          />,
          document.body,
        )}
    </>
  );
}

/** The menu: new game, save export and import, full screen, layout reset, about. */
export function MenuPopover({
  manifest,
  table,
  setDialog,
  setSelection,
  fit,
  notify,
}: {
  manifest: CardManifest;
  table: Table;
  setDialog: (dialog: Dialog) => void;
  setSelection: (selection: Selection) => void;
  fit: (t: Table) => void;
  notify: (text: string, ok?: boolean) => void;
}) {
  const exportSave = () => {
    const blob = new Blob([game().saveText(table)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${game().id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importSave = (file: File) => {
    file.text().then((text) => {
      try {
        const t = game().readSave(text, manifest);
        resetTable(t);
        setSelection(null);
        fit(t);
      } catch (e) {
        alert(`Could not load this file: ${(e as Error).message}`);
      }
    });
  };

  return (
    <div
      className="popover"
      onPointerDown={(e) => e.target === e.currentTarget && setDialog(null)}
    >
      <div className="popover-panel">
        <button
          onClick={() => {
            if (
              !confirm(
                'Start a new game? The current table will be replaced (export it first to keep it).',
              )
            )
              return;
            const t = game().setup(manifest);
            resetTable(t);
            setSelection(null);
            setDialog(null);
            fit(t);
          }}
        >
          ✦ New game
        </button>
        <button
          onClick={() => {
            exportSave();
            setDialog(null);
          }}
        >
          ⭳ Export save
        </button>
        <label className="button">
          ⭱ Import save
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importSave(f);
              setDialog(null);
            }}
          />
        </label>
        {document.fullscreenEnabled && (
          <button
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
              setDialog(null);
            }}
          >
            ⛶ Full screen
          </button>
        )}
        {table.anchors && (
          <button
            onClick={() => {
              update(A.resetLayout);
              setDialog(null);
              notify('Areas packed together again', true);
            }}
          >
            ↺ Reset layout
          </button>
        )}
        <button onClick={() => setDialog({ kind: 'about' })}>ⓘ About</button>
        <p className="muted small">
          Tap: select · Double-tap: flip · Long-press: read card · Drag a card
          off a pile to draw it · Drag ⠿ to move the whole pile · Drop onto a
          pile to stack · Two fingers: zoom
        </p>
      </div>
    </div>
  );
}
