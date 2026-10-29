# Architecture plan

Long-term goal: make this project the base of a library for building other card and board games for the browser. There
is no rush for the library: first the current app's architecture is made solid (phase A), then the engine is separated
from the game (phase B).

## Progress

Update this table when a step starts and when it lands on `main` (in the same commit).

Status: ⬜ Not started · 🟡 In progress · ✅ Done · 🔁 Ongoing

| Step                                     | Model                                                                                               | Status         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| A1. Test safety net                      | Opus designs the invariants, property tests and save fixtures; Sonnet writes the bulk of unit tests | ✅ Done        |
| A2. A single path for loading and saving | Opus                                                                                                | ✅ Done        |
| A3.1 Add `at` next to `x, y`             | Opus                                                                                                | ⬜ Not started |
| A3.2 Move the readers over to `at`       | Opus                                                                                                | ⬜ Not started |
| A3.3 Derive `x, y`, stop saving layout   | Opus                                                                                                | ⬜ Not started |
| A3.4 Remove the geometric inference      | Opus                                                                                                | ⬜ Not started |
| A4. Split `App.tsx` and `TableView`      | Opus for the gesture reducer and the first hook; Sonnet for the remaining hook extractions          | ⬜ Not started |
| A5. Documentation                        | Sonnet                                                                                              | 🔁 Ongoing     |
| B1. Folders and boundary                 | Sonnet (moving code); Opus sets the import rule and reviews                                         | ⬜ Not started |
| B2. Injected `GameDefinition`            | Opus                                                                                                | ⬜ Not started |
| B3. Composable place behaviours          | Opus                                                                                                | ⬜ Not started |
| B4. Commands and UI extensions           | Opus designs the registry and slots; Sonnet moves the actions over                                  | ⬜ Not started |
| B5. Refusals as codes                    | Sonnet, once Opus has fixed the list of codes                                                       | ⬜ Not started |
| B6. Generic cards, images and content    | Opus for `CardDef`; Sonnet for the pipeline configuration and the content provider                  | ⬜ Not started |
| B7. A minimal second game                | Opus                                                                                                | ⬜ Not started |
| B8. Packages                             | Sonnet                                                                                              | ⬜ Not started |

### Choosing the model

- **Opus** where something has to be designed, or where a subtle mistake is expensive: the data model, saves and
  migrations, the rules in `areas.ts` / `actions.ts`, the library's abstractions.
- **Sonnet** for well-defined, repetitive work: many similar tests once the cases are fixed, moving code, extracting
  hooks once the first one sets the pattern, documentation, mechanical changes already decided.
- In a mixed step: Opus writes the detailed plan and the first part, which sets the pattern; Sonnet does the repetitive
  parts following it; Opus reviews (e.g. `/code-review`) before the commit is approved. Switch with `/model`.
- To avoid switching models, use Opus for the whole plan: this code has many implicit rules spread over `areas.ts` and
  `actions.ts`, and in an architecture refactor saving on the model tends to cost more in mistakes than in tokens.

## Starting point

What already works for a library:

- An immutable `Table`, pure `(Table) => Table` actions and a single point of mutation (`update` in `store.ts`), which
  also keeps the placement invariants (`settle`).
- `placement()` as the single gate for putting cards on the table.
- The `Stack` / `z` / `dock` / `tray` model, which is truly generic.
- `Spot`, which in practice is already a small declarative language for card places.

What prevents it or makes it fragile:

- **Grimm World is in every layer.** `CardType`, `Place` and `StorySlot` in `types.ts`; global `CARD_W`/`CARD_H` and
  `isLandscape()` decided by card type in `cards.ts`; `areas.ts` (about 2600 lines) mixes a geometry engine, Grimm's
  table data and refusal texts; `store.ts` is a singleton with the key `grimm-world:table:v1`; `TableView` takes
  game-specific props (`onSlotTap`, `onStoryDrop`, `onShufflePlace`, `onTypeBattlefield`…). The engine functions import
  `AREAS`, `SPOTS` and `DECKS` as module constants, so two games can't live side by side.
- **Few tests where the risk is.** About 270 lines of tests for about 11,000 lines of code; `areas.ts` (`placement`,
  `settleLayout`, `measure`) has none, and neither does `migrateTable`.
- **Area membership is inferred from geometry.** `measure()` decides which area a pile belongs to by overlap, which is
  why derived data has to be saved (`frames`, `shifts`, `enemies`) and why every layout change has needed a migration in
  old coordinates (`widenStorage`, `lowerHome`, `shrinkMap`, `raiseAreas`, `RAISE`…).
- **Components that are too large.** `App.tsx` (about 1600 lines, about 45 hooks) and `TableView` in `Table.tsx` (a single
  function of about 880 lines with gestures and rendering together).
- **Save loading is scattered.** `loadSaved()` does `JSON.parse(raw) as Table`; validation (`isValidTable`) lives in
  `App.tsx` and runs _before_ migrating: a save that fails it is silently replaced by a new game, which the autosave
  writes over it after 300 ms.

## How each step is done

- Each step (or sub-step) is its own change: worktree, dev server, review and approved commit, as usual.
- Unless the step says otherwise, **the player notices nothing**: commits are `refactor`, `test`, `docs` or `build`.
  Whatever does change for the player goes in as `feat`/`fix` and into the README.
- **Existing saves keep working** in every step. A change that can't guarantee it gets `!` and `BREAKING CHANGE:`, and
  is discussed first.
- `CLAUDE.md` is updated in the same commit as the change it describes (not at the end of the plan).
- UI changes are checked with Playwright at the four sizes in `CLAUDE.md` (tablet, laptop and two phones).

## Phase A — a solid architecture

### A1. Test safety net

Goal: being able to refactor `areas.ts`, `actions.ts` and `setup.ts` without fear. Everything else depends on this.

- Unit tests for `areas.ts`: `placement()` for each kind of target (attracting spot, fanned row, grid, deck area,
  Encounter Deck places, refusals), `settleSpots()`, `settleLayout()` (packed and anchored), `drawOrder()`,
  `gridPlaces()`.
- Property tests with `fast-check`: random sequences of actions (`moveStack`, `takeTop`, `dropOnto`, `flipTop`,
  `shuffleStack`, `toTray`/`fromTray`, `cardsToDecks`, `putUnderPile`…) on an initial table, going through `settle` as
  `update` does. Invariants:
  - every playable card is there exactly once;
  - `settle(settle(t))` equals `settle(t)`;
  - `z`, `dock` and `tray` are disjoint and together hold every pile;
  - fixed piles never disappear and the others are never empty;
  - pinned cards (`pinned`, `pinnedOnTop`) stay in place.
- `isValidTable` moves out of `App.tsx` into a pure module, so the tests can use it.
- Real save fixtures: one per released version (tags `v0.1.0` … `v0.5.5`), captured by playing a little in each version
  and exporting `localStorage`. Since `cards.json` isn't in git (nor in CI), each fixture carries only the card
  definitions it uses (`id`, `type`, `code`, `name`). Test: each fixture migrates to a valid, stable table.
- Coverage report (`@vitest/coverage-v8`) with a threshold for `areas.ts`, `actions.ts`, `decks.ts` and `setup.ts`.

Done when: the invariants pass in CI, every fixture migrates, and the coverage of the rules modules exceeds the agreed
threshold.

Outcome (October 2026, on top of 0.5.5; `CLAUDE.md` describes how to use it):

- The invariants are `tableProblems()` in `validate.ts`, next to `isValidTable`, ready for A2. The random games
  (`properties.test.ts`) play the moves the UI offers, as `App.tsx` / `Table.tsx` apply them, with `Math.random`
  seeded per game; a one-off run of 10,000 games of up to 150 moves found nothing.
- The save fixtures share one file of card definitions (`src/test/saves/cards.json`), since every save holds every
  card. Besides one save per tag, `-moved` saves (an area moved, cards set aside) and `-battle` saves (a battlefield
  built in the old Battle dialog). A snapshot records where everything lies after migrating: the baseline for A3.
- The `-battle` save from v0.1.0 showed a migration bug, fixed separately (`fix(save)`): the Terrain Cards of a
  battlefield built before v0.3.0 ended up beside the Battlefield grid.
- Coverage threshold, per file, for `areas.ts`, `actions.ts`, `decks.ts`, `setup.ts` and `validate.ts`: 85% of
  statements, lines and functions, 75% of branches (`vite.config.ts`, checked in CI by `npm run test:coverage`). The
  random games make coverage vary by about 1.5 points between runs, hence the margin below what is reached (lines:
  90–100%).

### A2. A single path for loading and saving

Goal: loading a save is load → migrate → validate, in one place, without ever losing the player's game.

- A `save.ts` module: reads, migrates, validates and writes. `store.ts` no longer knows about `localStorage`.
- Save envelope: `{ game: 'grimm-world', version, table }`. A save without an envelope (the current format) is read as
  the _legacy_ version.
- Migrations as an ordered list (`{ to: number, up(t, defs) }`). The current `migrateTable` chain stays as it is, as the
  migration from _legacy_ to the first numbered version: old migrations aren't rewritten.
- Validation after migrating, with a schema (valibot or hand-written) plus the invariants from A1.
- If a save can't be loaded: it is copied to a backup key before starting a new game, and the player is told (`fix`,
  shown in the changelog).
- A `storage(key)` helper with the game's prefix, instead of `grimm-world:*` repeated in five files.

Done when: the A1 fixtures load through `save.ts`, a corrupt save leaves a backup and a notice, and `App.tsx` no longer
validates or migrates.

Outcome (October 2026, on top of A1; `CLAUDE.md` describes it under **Saves**):

- `save.ts`: `readSave` (parse → envelope or legacy → shape → card set → migrations → `tableProblems`), `saveText`,
  and `loadGame` / `writeGame` for the device. `store.ts` saves through `writeGame`; Import save and Export save go
  through `readSave` / `saveText`. Refusals are `SaveError`s worded for the player.
- The envelope is written under the same key (`grimm-world:table:v1`), so a tab still running an older version writes
  a bare table there, which loads as version 0. A save of a newer version than the app's is refused, never migrated.
- Saves of version 1 no longer go through `migrateTable` on every load: a later `Table` change adds a migration to
  version 2 rather than a step to `migrateTable`.
- The schema is hand-written (about 80 lines, no dependency): the types stay in `types.ts`, and most of what matters is
  the semantic check (`isValidTable`, `tableProblems`). Valibot can still replace it in phase B if each game brings its
  own schema.
- A save that can't be loaded is kept under `grimm-world:table:unreadable` before the new game is saved, with the
  reason in the console. No notice to the player for now: while the app is in development there are no players' saves
  to look after, so a dialog (with the old save to download) waits until there are.
- `storage(key)` (`storage.ts`) replaces the `grimm-world:*` keys and their try/catch in `App.tsx`, `dialogs.tsx`,
  `Tray.tsx` and `RulesPanel.tsx`. `save.ts` joined the coverage threshold.

### A3. Logical position of piles

Goal: save _where_ each pile is in the game's terms and compute the coordinates, instead of inferring the area from the
coordinates. This is the biggest step; it is done in parts, each one releasable.

Proposed model (to be refined when starting):

```ts
type At =
  | { area: string; x: number; y: number } // loose inside an area, relative to its corner
  | { spot: string; index: number } // in a row or card place
  | { grid: GridId; col: number; row: number } // on the Map or the Battlefield
  | { place: string } // fixed pile: table deck, storybook, Encounter Deck places, Damage Card
  | { x: number; y: number }; // loose outside the areas
```

- Absolute coordinates become a result (`layout(t)`, cached per table, as `spotsOf`/`allAreas` are today). Moving an
  area moves its piles without touching them.
- The three fixed-place mechanisms (`Stack.deck`, `Stack.slot`, `Stack.place`) and the pinned cards (`pinned`,
  `pinnedOnTop`, `DeckSpec.keeps`) are unified into `{ place }` plus a policy declared on the place (insertion, card
  pinned at the bottom or on top).
- `placement()` returns an `At` instead of `x, y`.
- Only the player's intent is saved (`anchors`); `frames`, `shifts` and `enemies` are no longer saved.

Order:

1. Add `at` next to `x, y`, computed by `settle` from what `measure()` infers today; nothing reads it yet.
2. Move the readers over to `at`, by kind of place: fanned rows, then grids, then fixed places, and finally loose piles
   in areas.
3. Make `x, y` derived and stop saving `frames`, `shifts` and `enemies`.
4. Remove the geometric inference (`measure()` and whatever depends on it).

The migration uses the current code: it applies `measure()` once to the old save to get `at`. Key test: for each
fixture, the coordinates computed after the migration equal those from before.

Done when: no data derived from the layout is saved, changing the size or order of the areas no longer needs a
migration, and the fixtures look the same as before.

### A4. Split `App.tsx` and `TableView`

Goal: small components and hooks, with the view already prepared to be separated from the game in phase B.

- `TableView`'s gesture machine (`Gesture`, `onPointerDown/Move/Up`, pinch, long press, double tap) moves to
  `useTableGestures`, with the logic as a pure reducer `(state, event) → (state, effects)` and its own tests.
- `TableView` emits generic events (tap, double tap, long press and drop on a target, with its `placement`). What is
  Grimm's (revealing the storybook, a place's Shuffle, opening the Battlefield bar…) is decided in the game layer.
- Out of `App.tsx` come: `useNotice`, `useFitView` (`rectView`, `fitRect`, `fitView`), `useTransient` (shuffle and deal
  animations with their timers), the state of the dialogs and of the Browse panel, and drop routing (`zoneAt`, `dropAt`)
  into a module of its own.
- Rough guideline: no component longer than about 500 lines.

Done when: the gesture reducer has tests, `TableView` takes no Grimm-specific props, and Playwright confirms nothing
changes at the four sizes.

### A5. Documentation

Ongoing, not a step at the end: each step updates `CLAUDE.md` (and the README if anything changes for the player). The
thorough reorganization (`CLAUDE.md` as an overall map and each module documented in its header) is done in B1, once
the final folders exist.

## Phase B — towards the library

### B1. Folders and boundary

- `src/engine/` (pure TypeScript, no React: model, actions, placement, layout, settle, store, saves), `src/ui/` (generic
  React components: table, gestures, sidebar, Hand, Browse, `CardGhost`, `useFlip`, `useDragOut`) and
  `src/games/grimm-world/` (decks, areas, spots, setup, migrations, rules, its own UI).
- An import rule in lint (oxlint's `no-restricted-imports`, or dependency-cruiser if that isn't enough): `engine` doesn't
  import from `ui` or `games`; `ui` doesn't import from `games`.
- First only move code; design changes come in the following steps.

### B2. Injected `GameDefinition`

```ts
interface GameDefinition<Fam extends string> {
  id: string; // prefix for storage and for the save envelope
  cardSize: { w: number; h: number };
  family(def: CardDef): Fam | undefined;
  orientation(def: CardDef): 'portrait' | 'landscape';
  decks: DeckSpec<Fam>[];
  areas: AreaSpec<Fam>[];
  spots: SpotSpec<Fam>[];
  setup(cards: CardDef[]): Table;
  migrations: Migration[];
}
const engine = createEngine(grimmWorld); // placement, settle, layout… bound to the game
const store = createStore(engine); // instead of the singleton
```

The per-table caches (`WeakMap<Table, …>`) move inside `createEngine`, and `defs` goes in the engine's context instead of
being passed from function to function.

### B3. Composable place behaviours

The roughly 25 options of `Spot` are grouped into axes, each a module with its hooks (`place`, `settle`, `layer`):
arrangement (single card, fan, grid), facing (up, down, free), orientation, what it accepts, and layering (above or
below another card). Adding a behaviour no longer means touching `placement`, `settleSpots`, `drawOrder` and
`faceArrivals`.

### B4. Commands and UI extensions

- The action bar's actions are registered as commands (`{ id, label, icon, enabled(t, sel), run(t, sel) }`); each game
  declares its own. This makes keyboard shortcuts and tests easier.
- What is specific to an area (Shuffle below a place, Browse, the Battlefield bar) is drawn in _slots_ provided by the
  game.

### B5. Refusals as codes

`placement()` and `refusal()` return codes with data (`{ code: 'only-family', spot, families }`) and the game supplies
the text. This opens the door to translating the app.

### B6. Generic cards, images and content

- `CardDef` with `faces` (front and back URLs), size and free-form `attrs`; `sheet/row/col` stay in the pipeline.
- The Python scripts read the grid, the card size and the mirroring of backs from a per-game configuration file.
- The rules panel and the booklets become an optional content provider.

### B7. A minimal second game

A simple card solitaire, built only with the library. Whatever is hard to fit in there shows what is still coupled; it
is fixed before going further.

### B8. Packages

With two games working: npm workspaces (`engine`, `ui`, `pipeline`, and each game as an app). Not before.

## Open decisions

- The final shape of `At` (A3), in particular loose piles inside a growing area and the Battlefield's `alt` places.
- Which game serves as the second game in B7.
