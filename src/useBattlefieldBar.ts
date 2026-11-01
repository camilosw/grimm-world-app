import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react';
import * as A from './lib/engine/actions';
import {
  battlefieldText,
  buildBattlefield,
  parseBattlefield,
} from './battlefield';
import { allAreas, type Area } from './lib/engine/areas';
import { getTable, update } from './lib/engine/store';
import type { CardDef, Table } from './lib/engine/types';
import type { Selection } from './lib/ui/Table';
import type { PutUnder } from './lib/ui/useDialogs';

/** What the Battlefield bar needs of the app. */
export interface BattlefieldBarGame {
  table: Table | null;
  defs: Record<string, CardDef>;
  /** The table's area on the screen. */
  areaRef: RefObject<HTMLDivElement | null>;
  fitRect: (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    inset?: { top: number; bottom: number },
  ) => void;
  showArea: (area: Area) => void;
  setSelection: (selection: Selection) => void;
  setPutUnder: (putUnder: PutUnder | null) => void;
}

/** The bar docked at the top of the table for typing the battlefield, and the table with it laid out meanwhile. */
export function useBattlefieldBar(g: BattlefieldBarGame) {
  const { table, defs, areaRef, fitRect } = g;
  /** The battlefield being typed in the bar at the top of the table (null: the bar is closed). */
  const [battleText, setBattleText] = useState<string | null>(null);
  /** Screen pixels hidden at the top of the table by that bar and at its bottom by the on-screen keyboard. */
  const [inset, setInset] = useState({ top: 0, bottom: 0 });
  const setBarHeight = useCallback(
    (top: number) => setInset((i) => (i.top === top ? i : { ...i, top })),
    [],
  );

  // The battlefield typed in the bar, and the table with it laid out, shown meanwhile.
  const battleLayout = useMemo(
    () => (battleText === null ? null : parseBattlefield(battleText)),
    [battleText],
  );
  const battlePreview = useMemo(
    () =>
      battleLayout && table
        ? A.settle(buildBattlefield(table, battleLayout.rows, defs))
        : null,
    [battleLayout, table, defs],
  );
  const typing = battleText !== null;

  // While it is typed, the battlefield as it would lie fills the table below the bar, above the on-screen keyboard.
  const battleBox =
    battlePreview &&
    allAreas(battlePreview).find((a) => a.id === 'battlefield');
  const battleFit =
    battleBox &&
    [
      battleBox.x,
      battleBox.y,
      battleBox.w,
      battleBox.h,
      inset.top,
      inset.bottom,
    ].join();
  useEffect(() => {
    if (battleBox)
      fitRect(
        battleBox.x,
        battleBox.y,
        battleBox.x + battleBox.w,
        battleBox.y + battleBox.h,
        inset,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the battlefield or the room for it changes
  }, [battleFit]);

  // The on-screen keyboard: where the browser reports it (`visualViewport`), the part of the table it hides.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!typing || !vv) return;
    const measure = () => {
      const el = areaRef.current;
      if (!el) return;
      const bottom = Math.max(
        0,
        Math.round(
          el.getBoundingClientRect().bottom - (vv.offsetTop + vv.height),
        ),
      );
      setInset((i) => (i.bottom === bottom ? i : { ...i, bottom }));
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      setInset((i) => ({ ...i, bottom: 0 }));
    };
  }, [typing, areaRef]);

  /** Open the bar for typing the battlefield, filled in with the one lying on the table. */
  const typeBattlefield = () => {
    setBattleText(battlefieldText(table!, defs));
    g.setSelection(null);
    g.setPutUnder(null);
  };

  const layOutBattlefield = () => {
    if (!battleLayout) return;
    update((t) => buildBattlefield(t, battleLayout.rows, defs));
    setBattleText(null);
    const area = allAreas(getTable() ?? table!).find(
      (a) => a.id === 'battlefield',
    );
    if (area) g.showArea(area);
  };

  return {
    battleText,
    setBattleText,
    battleLayout,
    battlePreview,
    setBarHeight,
    typeBattlefield,
    layOutBattlefield,
  };
}
