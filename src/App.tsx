import { useEffect, useMemo, useRef, useState } from 'react';
import * as A from './lib/engine/actions';
import { BattlefieldBar } from './BattlefieldBar';
import { loadManifest } from './cards';
import { returnsCards } from './decks';
import { AboutDialog, ChapterDialog } from './GameDialogs';
import { allAreas, type Area } from './lib/engine/areas';
import { CARD_H, CARD_W } from './lib/engine/geometry';
import { redo, resetTable, undo, update } from './lib/engine/store';
import type { CardDef, CardManifest } from './lib/engine/types';
import { FigureBar, PileBar } from './lib/ui/ActionBar';
import { isCompact, useCompact } from './lib/ui/compact';
import {
  BrowsePanel,
  CardViewer,
  FindDialog,
  RenameDialog,
} from './lib/ui/dialogs';
import { useDropRouting } from './lib/ui/dropRouting';
import { FiguresPopover, MenuPopover } from './lib/ui/Popovers';
import { Sidebar } from './lib/ui/Sidebar';
import { type Selection, TableView } from './lib/ui/Table';
import { AreaRail, Toolbar } from './lib/ui/Toolbar';
import { Tray } from './lib/ui/Tray';
import { useDialogs } from './lib/ui/useDialogs';
import { useFitView } from './lib/ui/useFitView';
import { useNotice } from './lib/ui/useNotice';
import { usePanel } from './lib/ui/usePanel';
import { useHistory, useTable } from './lib/ui/useStore';
import { useTransient } from './lib/ui/useTransient';
import { cardRule } from './rules';
import { RulesPanel } from './RulesPanel';
import { loadGame } from './save';
import { playableCards } from './setup';
import { putUnderChapter, storyProgress } from './storybook';
import { useBattlefieldBar } from './useBattlefieldBar';
import { useRulesPanel } from './useRulesPanel';
import { useTableEvents } from './useTableEvents';

export default function App() {
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
  const { rules, rulesOpen, setRulesOpen, rulesTarget, openRules } =
    useRulesPanel(notify);
  const { shuffled, dealt, shuffle, deal } = useTransient();

  const defs = useMemo<Record<string, CardDef>>(
    () =>
      Object.fromEntries(
        (manifest ? playableCards(manifest) : []).map((c) => [c.id, c]),
      ),
    [manifest],
  );

  useEffect(() => {
    loadManifest()
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
    if (s.slot) {
      const area = allAreas(table).find((a) => a.id === 'storybook')!;
      return showArea(area);
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

  const {
    battleText,
    setBattleText,
    battleLayout,
    battlePreview,
    setBarHeight,
    typeBattlefield,
    layOutBattlefield,
  } = useBattlefieldBar({
    table,
    defs,
    areaRef,
    fitRect,
    showArea,
    setSelection,
    setPutUnder,
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
        setBattleText(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPutUnder, setBrowseId, setBattleText]);

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

  // What the game makes of what is done on the table.
  const tableEvents = useTableEvents({
    table,
    defs,
    picking: !!putUnder,
    browseId,
    battlePreview,
    select,
    browse: setBrowseId,
    inspect: (card) => setDialog({ kind: 'inspect', card }),
    pickChapter: (stackId, cardIds) =>
      setDialog({ kind: 'chapter', stackId, cardIds }),
    putUnderTarget: drops.putUnderTarget,
    notify,
    shuffle,
    deal,
    typeBattlefield,
    openRules,
    hoverZone: drops.hoverZone,
    dropOnZone: drops.dropOnZone,
  });

  if (error) return <div className="splash">{error}</div>;
  if (!manifest || !table) return <div className="splash">Loading cards…</div>;

  const docked = !!selectedStack && A.isDocked(table, selectedStack.id);
  // A pile set aside in the right sidebar lies upright there, in no particular place.
  const aside = !!selectedStack && A.inTray(table, selectedStack.id);
  const trayPiles = (table.tray ?? []).map((id) => table.stacks[id]);

  return (
    <div className="app">
      {/* The rules panel lies beside the toolbar and the table, from the top of the screen. */}
      <div className="workspace">
        <div className="workspace-left">
          <Toolbar
            sidebarOpen={sidebarOpen}
            toggleSidebar={toggleSidebar}
            history={history}
            rulesOpen={rulesOpen}
            setRulesOpen={setRulesOpen}
            openRules={openRules}
            setDialog={setDialog}
            onFit={() => toggleFit(table)}
          />

          <div className="main">
            {/* Always shown, along the left edge of the screen; it scrolls when the screen is too short for it. */}
            <AreaRail table={table} shownArea={shownArea} onShow={showArea} />
            {sidebarOpen && (
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
                {...tableEvents}
                shuffled={shuffled}
                incoming={drops.incoming}
                dealt={dealt}
                gliding={gliding}
              />
              {battleLayout && (
                <BattlefieldBar
                  text={battleText!}
                  layout={battleLayout}
                  defs={defs}
                  onText={setBattleText}
                  onLayOut={layOutBattlefield}
                  onClose={() => setBattleText(null)}
                  onHeight={setBarHeight}
                />
              )}
              {notice && (
                <div className={`notice${notice.ok ? ' ok' : ''}`}>
                  {notice.text}
                </div>
              )}
              {putUnder && (
                <div className="banner">
                  Tap a pile, a deck or the storybook to slide the card
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
        {rulesOpen && rules && (
          <RulesPanel
            rules={rules}
            target={rulesTarget}
            onClose={() => setRulesOpen(false)}
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
              deck && !returnsCards(deck) ? [] : cardIds,
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
          openRules={openRules}
          homeNames={drops.homeNamesOf}
        />
      )}
      {selectedToken && <FigureBar token={selectedToken} />}

      {dialog?.kind === 'inspect' && (
        <CardViewer
          card={dialog.card}
          def={defs[dialog.card.id]}
          onClose={() => setDialog(null)}
          onRules={
            cardRule(defs[dialog.card.id])
              ? () => {
                  setDialog(null);
                  openRules(cardRule(defs[dialog.card.id]));
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
      {dialog?.kind === 'about' && (
        <AboutDialog onClose={() => setDialog(null)} />
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
      {dialog?.kind === 'chapter' && (
        <ChapterDialog
          cards={
            dialog.cardIds ??
            table.stacks[dialog.stackId]?.cards.map((c) => c.id) ??
            []
          }
          defs={defs}
          progress={storyProgress(table, defs)}
          onPick={(name) => {
            update((t) =>
              putUnderChapter(t, dialog.stackId, name, defs, dialog.cardIds),
            );
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
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
