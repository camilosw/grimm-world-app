import { allAreas, type Area } from '../engine/areas';
import { redo, undo } from '../engine/store';
import type { Table } from '../engine/types';
import { gameUI } from './gameUI';
import type { Dialog } from './useDialogs';

/** The toolbar: decks, undo and redo, Find card, Figures, Rules, Fit and the menu. */
export function Toolbar({
  sidebarOpen,
  toggleSidebar,
  history,
  rulesOpen,
  setRulesOpen,
  openRules,
  setDialog,
  onFit,
}: {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  /** Bit 1: undo possible; bit 2: redo possible. */
  history: number;
  rulesOpen: boolean;
  setRulesOpen: (open: boolean) => void;
  openRules: () => void;
  setDialog: (dialog: Dialog) => void;
  /** Fit the play areas, again for the whole table. */
  onFit: () => void;
}) {
  return (
    <header className="toolbar">
      <button
        onClick={toggleSidebar}
        className={sidebarOpen ? 'on' : ''}
        aria-label="Toggle decks"
      >
        🂠 <span>Decks</span>
      </button>
      <button onClick={undo} disabled={!(history & 1)} aria-label="Undo">
        ↶ <span>Undo</span>
      </button>
      <button onClick={redo} disabled={!(history & 2)} aria-label="Redo">
        ↷ <span>Redo</span>
      </button>
      <span className="spacer" />
      <button onClick={() => setDialog({ kind: 'find' })}>
        🔍 <span>Find card</span>
      </button>
      <button onClick={() => setDialog({ kind: 'tokens' })}>
        ● <span>Figures</span>
      </button>
      <button
        onClick={() => (rulesOpen ? setRulesOpen(false) : openRules())}
        className={rulesOpen ? 'on' : ''}
      >
        📖 <span>Rules</span>
      </button>
      <button
        onClick={onFit}
        aria-label="Fit the play areas, again for the whole table"
      >
        ⤢ <span>Fit</span>
      </button>
      <button onClick={() => setDialog({ kind: 'menu' })} aria-label="Menu">
        ☰
      </button>
    </header>
  );
}

/** The buttons along the left edge of the screen that glide the view to an area. */
export function AreaRail({
  table,
  shownArea,
  onShow,
}: {
  table: Table;
  shownArea: string | null;
  onShow: (area: Area) => void;
}) {
  const { AreaIcon, railAreas } = gameUI();
  return (
    <nav className="area-rail" aria-label="Show an area">
      {railAreas
        .map((id) => allAreas(table).find((a) => a.id === id))
        .filter((a) => !!a)
        .map((area) => (
          <button
            key={area.id}
            className={shownArea === area.id ? 'on' : ''}
            onClick={() => onShow(area)}
            aria-label={area.label}
            title={area.label}
          >
            <AreaIcon id={area.id} />
          </button>
        ))}
    </nav>
  );
}
