// The app shell of any game: the toolbar, the area rail, the sidebar decks, the table, the Hand, the Browse panel, the
// action bar and the dialogs, wired to the store; the game registered (`game()`, `gameUI()`) fills them in, and its
// layer (`GameLayer`) adds what only it has: its own table events, what it draws over the table and its dialogs.

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as A from '../engine/actions';
import { allAreas, type Area } from '../engine/areas';
import { game } from '../engine/game';
import { CARD_H, CARD_W, type Point } from '../engine/geometry';
import { loadGame } from '../engine/saves';
import { redo, resetTable, undo, update } from '../engine/store';
import type { CardDef, CardManifest, Table, View } from '../engine/types';
import { FigureBar, PileBar } from './ActionBar';
import { isCompact, useCompact } from './compact';
import { content, useContent } from './content';
import { BrowsePanel, CardViewer, FindDialog, RenameDialog } from './dialogs';
import { useDropRouting } from './dropRouting';
import { gameUI } from './gameUI';
import { FiguresPopover, MenuPopover } from './Popovers';
import { Sidebar } from './Sidebar';
import { type Selection, TableView } from './Table';
import { type TableEvents, tableEvents } from './tableEvents';
import { AreaRail, Toolbar } from './Toolbar';
import { Tray } from './Tray';
import { type Dialog, type PutUnder, useDialogs } from './useDialogs';
import { useFitView } from './useFitView';
import { useNotice } from './useNotice';
import { usePanel } from './usePanel';
import { useHistory, useTable } from './useStore';
import { useTransient } from './useTransient';

/** What a game's layer (`GameApp`'s `useLayer`) is given of the app: its state, and the helpers it may use. */
export interface GameAppContext {
  table: Table | null;
  /** The cards played with (`GameDefinition.playable`), by id. */
  defs: Record<string, CardDef>;
  /** The table's area on the screen. */
  areaRef: RefObject<HTMLDivElement | null>;
  view: View;
  /** Frame a table rectangle, leaving `inset` screen pixels free at its top and bottom (`useFitView`). */
  fitRect: ReturnType<typeof useFitView>['fitRect'];
  /** Glide the view to an area. */
  showArea: (area: Area) => void;
  /** Select a pile or a figure (null: nothing), leaving "Put under…". */
  select: (s: Selection) => void;
  setSelection: (s: Selection) => void;
  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;
  putUnder: PutUnder | null;
  setPutUnder: (p: PutUnder | null) => void;
  /** The pile shown in the Browse panel. */
  browseId: string | null;
  /** Show a pile in the Browse panel (null: close it). */
  browse: (stackId: string | null) => void;
  notify: (text: string, ok?: boolean) => void;
  /** Shuffle a table pile, shown shuffling. */
  shuffle: (stackId: string) => void;
  /** Show a card just dealt travelling there from `from`. */
  deal: (cardId: string, from: Point) => void;
  /** Open the game's content (`GameUI.content`) at a section. */
  openContent: (section?: string | null) => void;
  /** The table's events as any game has them (`tableEvents()`), for the layer to fall back on. */
  events: TableEvents;
}

/** What a game adds to the app shell. */
export interface GameLayer {
  /** Its own table events, each replacing the default one (`GameAppContext.events`). */
  events?: Partial<TableEvents>;
  /** Drawn over the table, inside its area (a bar docked at its top). */
  overlay?: ReactNode;
  /**
   * Its own dialogs, drawn with the app's: among them its picker (`Dialog`'s `pick`), which a game whose
   * `GameDefinition.pickedPile` gives a pile must draw, as the app has none.
   */
  dialogs?: ReactNode;
  /** Escape was pressed: close what it has open. */
  onEscape?: () => void;
}

/** A layer adding nothing. */
const noLayer = (): GameLayer => ({});

export function GameApp({
  loadCards,
  useLayer = noLayer,
}: {
  /** The game's card set: loaded once, when the app starts. */
  loadCards: () => Promise<CardManifest>;
  /**
   * The game's layer: a hook, called on every render, so always the same function (one of a module, never made while
   * rendering), calling the same hooks.
   */
  useLayer?: (app: GameAppContext) => GameLayer;
}) {
  const [manifest, setManifest] = useState<CardManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const table = useTable();
  const history = useHistory();
  const areaRef = useRef<HTMLDivElement>(null);
  const {
    view,
    gliding,
    shownArea,
    setShownArea,
    rectView,
    fitRect,
    fit,
    glideTo,
    moveView,
    toggleFit,
  } = useFitView(areaRef);
  const [rawSelection, setSelection] = useState<Selection>(null);
  const {
    dialog,
    setDialog,
    putUnder,
    setPutUnder,
    browseId,
    setBrowseId,
    closeBrowse,
  } = useDialogs();
  // On a phone the decks lie over the table: closed until opened.
  const [sidebarOpen, toggleSidebar] = usePanel('sidebar-open', !isCompact());
  /** A phone: the actions for the selection make way for the Browse panel, which puts its own in their column. */
  const compact = useCompact();
  const [browseSlot, setBrowseSlot] = useState<HTMLElement | null>(null);
  /** The Hand, the right sidebar of cards set aside, is open, not minimized to a narrow bar. */
  const [trayOpen, , setTrayOpen] = usePanel('tray-open');
  const trayCount = table?.tray?.length ?? 0;
  const loaded = !!table;
  /** The Hand held cards when last looked at (null: not yet). */
  const trayHeld = useRef<boolean | null>(null);
  // The Hand is minimized while empty: at the start, and once its last card leaves.
  useEffect(() => {
    if (!loaded) return;
    if (!trayCount && trayHeld.current !== false) setTrayOpen(false);
    trayHeld.current = trayCount > 0;
  }, [loaded, trayCount, setTrayOpen]);
  const { notice, notify } = useNotice();
  const {
    loadedContent,
    contentOpen,
    setContentOpen,
    contentTarget,
    openContent,
  } = useContent(notify);
  const provider = content();
  const { shuffled, dealt, shuffle, deal } = useTransient();
  const { About, texts } = gameUI();

  const defs = useMemo<Record<string, CardDef>>(
    () =>
      Object.fromEntries(
        (manifest?.cards.filter(game().playable) ?? []).map((c) => [c.id, c]),
      ),
    [manifest],
  );

  // Loaded once: a `loadCards` made anew on each render doesn't load the game again.
  const loadOnce = useRef(loadCards);
  useEffect(() => {
    loadOnce
      .current()
      .then((m) => {
        const t = loadGame(m);
        setManifest(m);
        resetTable(t);
        requestAnimationFrame(() => fit(t));
      })
      .catch((e: Error) => setError(e.message));
  }, [fit]);

  // A selection goes stale after undo/redo or when a pile is used up.
  const selectedStack =
    rawSelection?.kind === 'stack' ? table?.stacks[rawSelection.id] : undefined;
  const selectedToken =
    rawSelection?.kind === 'token'
      ? table?.tokens.find((t) => t.id === rawSelection.id)
      : undefined;
  const selection = selectedStack || selectedToken ? rawSelection : null;

  const showArea = (area: Area) => {
    setDialog(null);
    setShownArea(area.id);
    glideTo(rectView(area.x, area.y, area.x + area.w, area.y + area.h));
  };

  const showStack = (stackId: string) => {
    const s = table?.stacks[stackId];
    const el = areaRef.current;
    if (!s || !el || !table) return;
    // A fixed place whose taps the game handles isn't selected: its area is shown.
    const slotArea = s.slot && game().placeArea(s.slot);
    if (slotArea) {
      const area = allAreas(table).find((a) => a.id === slotArea);
      if (area) return showArea(area);
    }
    if (A.isDocked(table, stackId)) {
      if (!sidebarOpen) toggleSidebar();
      document
        .querySelector(`[data-deck="${stackId}"]`)
        ?.scrollIntoView({ block: 'nearest' });
      return setSelection({ kind: 'stack', id: stackId });
    }
    if (A.inTray(table, stackId)) {
      setTrayOpen(true);
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-tray-pile="${stackId}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
      return setSelection({ kind: 'stack', id: stackId });
    }
    const scale = Math.max(view.scale, 0.6);
    setShownArea(null);
    glideTo({
      scale,
      x: el.clientWidth / 2 - (s.x + CARD_W / 2) * scale,
      y: el.clientHeight / 2 - (s.y + CARD_H / 2) * scale,
    });
    setSelection({ kind: 'stack', id: stackId });
  };

  /** Select a pile or a figure (null: nothing), leaving "Put under…". */
  const select = (s: Selection) => {
    setSelection(s);
    setPutUnder(null);
  };

  const drops = useDropRouting({
    table,
    defs,
    areaRef,
    view,
    notify,
    setDialog,
    putUnder,
    setPutUnder,
    setSelection,
    setTrayOpen,
  });

  const events = tableEvents({
    table,
    defs,
    picking: !!putUnder,
    select,
    inspect: (card) => setDialog({ kind: 'inspect', card }),
    setDialog,
    putUnderTarget: drops.putUnderTarget,
    notify,
    openContent,
    hoverZone: drops.hoverZone,
    dropOnZone: drops.dropOnZone,
  });

  // oxlint-disable-next-line react/refs -- `useLayer` is a hook (a prop, so not known for one): it reads the ref in effects
  const layer = useLayer({
    table,
    defs,
    areaRef,
    view,
    fitRect,
    showArea,
    select,
    setSelection,
    dialog,
    setDialog,
    putUnder,
    setPutUnder,
    browseId,
    browse: setBrowseId,
    notify,
    shuffle,
    deal,
    openContent,
    events,
  });
  // The layer's events replace the defaults, but those it leaves undefined.
  const shownEvents: TableEvents = { ...events };
  for (const [key, on] of Object.entries(layer.events ?? {}))
    if (on !== undefined) Object.assign(shownEvents, { [key]: on });
  // The layer's latest, for the key listener below.
  const onEscape = useRef(layer.onEscape);
  useEffect(() => {
    onEscape.current = layer.onEscape;
  });

  // Keyboard shortcuts for desktop testing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Escape') {
        setSelection(null);
        setPutUnder(null);
        setBrowseId(null);
        onEscape.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPutUnder, setBrowseId]);

  if (error) return <div className="splash">{error}</div>;
  if (!manifest || !table) return <div className="splash">Loading cards…</div>;

  const docked = !!selectedStack && A.isDocked(table, selectedStack.id);
  // A pile set aside in the right sidebar lies upright there, in no particular place.
  const aside = !!selectedStack && A.inTray(table, selectedStack.id);
  const trayPiles = (table.tray ?? []).map((id) => table.stacks[id]);
  // A game without decks in the sidebar has neither the sidebar nor its button.
  const hasDecks = !!table.dock?.length;

  return (
    <div className="app">
      {/* The content panel (the rules) lies beside the toolbar and the table, from the top of the screen. */}
      <div className="workspace">
        <div className="workspace-left">
          <Toolbar
            sidebarOpen={sidebarOpen}
            toggleSidebar={hasDecks ? toggleSidebar : undefined}
            history={history}
            contentOpen={contentOpen}
            setContentOpen={setContentOpen}
            openContent={openContent}
            setDialog={setDialog}
            onFit={() => toggleFit(table)}
          />

          <div className="main">
            {/* Always shown, along the left edge of the screen; it scrolls when the screen is too short for it. */}
            <AreaRail table={table} shownArea={shownArea} onShow={showArea} />
            {hasDecks && sidebarOpen && (
              <Sidebar
                decks={(table.dock ?? []).map((id) => table.stacks[id])}
                defs={defs}
                selectedId={selectedStack && docked ? selectedStack.id : null}
                hoverIds={
                  drops.zoneHover && drops.zoneHover.kind !== 'tray'
                    ? drops.homeHover
                    : []
                }
                onTap={(id) => {
                  if (putUnder) return drops.putUnderTarget(id);
                  setSelection({ kind: 'stack', id });
                  // Tapping a deck browses it (an open panel follows the deck tapped, even an empty one).
                  if (browseId || table.stacks[id]?.cards.length)
                    setBrowseId(id);
                }}
                onDoubleTap={(id) => update((t) => A.flipTop(t, id))}
                onInspect={(card) => setDialog({ kind: 'inspect', card })}
                onDrop={drops.dropFromDeck}
                onDragHover={(d) => {
                  drops.hoverZone(d && drops.zoneAt(d.x, d.y), []);
                  const top = d && table.stacks[d.item]?.cards.at(-1);
                  drops.hoverTable(top ? [top.id] : [], d?.x, d?.y);
                }}
              />
            )}
            <div className="table-area" ref={areaRef}>
              <TableView
                table={table}
                defs={defs}
                view={view}
                onView={moveView}
                selection={selection}
                zoneAt={drops.zoneAt}
                {...shownEvents}
                shuffled={shuffled}
                incoming={drops.incoming}
                dealt={dealt}
                gliding={gliding}
              />
              {layer.overlay}
              {notice && (
                <div className={`notice${notice.ok ? ' ok' : ''}`}>
                  {notice.text}
                </div>
              )}
              {putUnder && (
                <div className="banner">
                  Tap {texts.putUnderTargets} to slide the card
                  {(
                    putUnder.cardIds ??
                    table.stacks[putUnder.stackId]?.cards ??
                    []
                  ).length > 1
                    ? 's'
                    : ''}{' '}
                  under
                  <button onClick={() => setPutUnder(null)}>Cancel</button>
                </div>
              )}
            </div>
            <Tray
              piles={trayPiles}
              defs={defs}
              collapsed={!trayOpen}
              onCollapse={(collapsed) => setTrayOpen(!collapsed)}
              selectedId={aside ? selectedStack!.id : null}
              hover={drops.zoneHover?.kind === 'tray' ? drops.zoneHover : null}
              onTap={(id) =>
                putUnder
                  ? drops.putUnderTarget(id)
                  : setSelection({ kind: 'stack', id })
              }
              onDoubleTap={(id) => update((t) => A.flipTop(t, id))}
              onInspect={(card) => setDialog({ kind: 'inspect', card })}
              onDragHover={(d) => {
                const cardIds = d
                  ? (table.stacks[d.item]?.cards.map((c) => c.id) ?? [])
                  : [];
                drops.hoverZone(d && drops.zoneAt(d.x, d.y), cardIds);
                drops.hoverTable(cardIds, d?.x, d?.y);
              }}
              onDrop={drops.dropFromTray}
            />
          </div>
        </div>
        {contentOpen && loadedContent && provider && (
          <provider.Panel
            content={loadedContent.content}
            target={contentTarget}
            onClose={() => setContentOpen(false)}
          />
        )}
      </div>

      {browseId && (
        <BrowsePanel
          key={browseId}
          table={table}
          stackId={browseId}
          defs={defs}
          dropAt={drops.dropAt}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onDrop={(cardIds, x, y, faceUp) =>
            drops.dropFromBrowse(browseId, cardIds, x, y, faceUp)
          }
          onDragHover={(cardIds, at) => {
            const deck = table.stacks[browseId]?.deck;
            drops.hoverZone(
              at && drops.zoneAt(at.x, at.y),
              deck && !game().returnsCards(deck) ? [] : cardIds,
              deck,
            );
            drops.hoverTable(at ? cardIds : [], at?.x, at?.y);
          }}
          onPutUnder={(cardIds, faceUp) =>
            setPutUnder({ stackId: browseId, cardIds, faceUp })
          }
          onClose={closeBrowse}
          actionsSlot={compact ? browseSlot : null}
        />
      )}
      {/* Empty (and hidden) until cards are selected in the panel. */}
      {compact && browseId && (
        <footer className="actions" ref={setBrowseSlot} />
      )}

      {selectedStack && !putUnder && !(compact && browseId) && (
        <PileBar
          table={table}
          defs={defs}
          stack={selectedStack}
          aside={aside}
          browseId={browseId}
          setBrowseId={setBrowseId}
          setPutUnder={setPutUnder}
          setDialog={setDialog}
          dropAt={drops.dropAt}
          shuffle={shuffle}
          notify={notify}
          openContent={openContent}
          homeNames={drops.homeNamesOf}
        />
      )}
      {selectedToken && <FigureBar table={table} token={selectedToken} />}

      {dialog?.kind === 'inspect' && (
        <CardViewer
          card={dialog.card}
          def={defs[dialog.card.id]}
          onClose={() => setDialog(null)}
          onContent={
            provider?.cardSection(defs[dialog.card.id])
              ? () => {
                  setDialog(null);
                  openContent(provider.cardSection(defs[dialog.card.id]));
                }
              : undefined
          }
        />
      )}
      {dialog?.kind === 'find' && (
        <FindDialog
          table={table}
          defs={defs}
          dropAt={drops.dropAt}
          onShow={showStack}
          onInspect={(card) => setDialog({ kind: 'inspect', card })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'about' && About && (
        <About manifest={manifest} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          initial={table.stacks[dialog.stackId]?.label ?? ''}
          onSave={(label) =>
            update((t) => A.renameStack(t, dialog.stackId, label))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {layer.dialogs}
      <FiguresPopover
        open={dialog?.kind === 'tokens'}
        table={table}
        view={view}
        areaRef={areaRef}
        setDialog={setDialog}
      />
      {dialog?.kind === 'menu' && (
        <MenuPopover
          manifest={manifest}
          table={table}
          setDialog={setDialog}
          setSelection={setSelection}
          fit={fit}
          notify={notify}
        />
      )}
    </div>
  );
}
