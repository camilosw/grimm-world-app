// Grimm World's app: the generic app shell (`GameApp`) with the game's layer — its table events and buttons
// (`useTableEvents`), the Battlefield bar docked at the top of the table and the chapter picker.

import { BattlefieldBar } from './BattlefieldBar';
import { loadManifest } from './cards';
import { ChapterDialog } from './GameDialogs';
import { update } from './lib/engine/store';
import { GameApp, type GameAppContext, type GameLayer } from './lib/ui/GameApp';
import { putUnderChapter, storyProgress } from './storybook';
import { useBattlefieldBar } from './useBattlefieldBar';
import { useTableEvents } from './useTableEvents';

export default function App() {
  return <GameApp loadCards={loadManifest} useLayer={useGrimmWorld} />;
}

/** What Grimm World adds to the app shell. */
function useGrimmWorld(app: GameAppContext): GameLayer {
  const { table, defs, dialog, setDialog } = app;
  const {
    battleText,
    setBattleText,
    battleLayout,
    battlePreview,
    setBarHeight,
    typeBattlefield,
    layOutBattlefield,
  } = useBattlefieldBar(app);
  const events = useTableEvents({ app, battlePreview, typeBattlefield });

  return {
    events,
    onEscape: () => setBattleText(null),
    overlay: battleLayout && (
      <BattlefieldBar
        text={battleText!}
        layout={battleLayout}
        defs={defs}
        onText={setBattleText}
        onLayOut={layOutBattlefield}
        onClose={() => setBattleText(null)}
        onHeight={setBarHeight}
      />
    ),
    // The chapter picker, for cards going into the storybook.
    dialogs: dialog?.kind === 'pick' && table && (
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
    ),
  };
}
