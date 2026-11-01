# Architecture plan

Long-term goal: make this project the base of a library for building other card and board games for the browser. There
is no rush for the library: first the current app's architecture is made solid (phase A), then the engine is separated
from the game (phase B). This repo stays Grimm World's: the reusable code lies apart in `src/lib/`, and if other games
come, it moves to a library repo of its own and each game gets a repo.

## Progress

Update this table when a step starts and when it lands on `main` (in the same commit).

Status: ⬜ Not started · 🟡 In progress · ✅ Done · 🔁 Ongoing

| Step                                     | Model                                                                                               | Status         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| A1. Test safety net                      | Opus designs the invariants, property tests and save fixtures; Sonnet writes the bulk of unit tests | ✅ Done        |
| A2. A single path for loading and saving | Opus                                                                                                | ✅ Done        |
| A3.1 Add `at` next to `x, y`             | Opus                                                                                                | ✅ Done        |
| A3.2 Move the readers over to `at`       | Opus                                                                                                | ✅ Done        |
| A3.3 Derive `x, y`, stop saving layout   | Opus                                                                                                | ✅ Done        |
| A3.4 Remove the geometric inference      | Opus                                                                                                | ✅ Done        |
| A4.1 Gesture reducer, generic TableView  | Opus                                                                                                | ✅ Done        |
| A4.2 Hooks out of App.tsx                | Sonnet                                                                                              | ✅ Done        |
| A5. Documentation                        | Sonnet                                                                                              | 🔁 Ongoing     |
| B1. Folders and boundary                 | Sonnet (moving code); Opus sets the import rule and reviews                                         | ✅ Done        |
| B2. Injected `GameDefinition`            | Opus                                                                                                | ⬜ Not started |
| B3. Composable place behaviours          | Opus                                                                                                | ⬜ Not started |
| B4. Commands and UI extensions           | Opus designs the registry and slots; Sonnet moves the actions over                                  | ⬜ Not started |
| B5. Refusals as codes                    | Sonnet, once Opus has fixed the list of codes                                                       | ⬜ Not started |
| B6. Generic cards, images and content    | Opus for `CardDef`; Sonnet for the pipeline configuration and the content provider                  | ⬜ Not started |
| B7. A minimal second game                | Opus                                                                                                | ⬜ Not started |
| B8. Library repo                         | Sonnet                                                                                              | ⬜ Not started |

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

Outcome of A3.1 (October 2026, on top of A2; `CLAUDE.md` describes it under **Table model**):

- `Stack.at` (`At` in `types.ts`), for table piles only: `{ place }` (the pile's `place`, `slot` or `deck`, in that
  order: the three fixed-place mechanisms already share one namespace), `{ grid, col, row }`, `{ spot, index }` (the
  index in the row, as `stacksOnSpot()` orders it), `{ area, x, y }` and `{ x, y }`. A grid place wins over a spot, as
  in `measure()`.
- A loose pile in an area lies relative to the area's _own_ corner in `AREAS` (moved by `Table.shifts`), not to its
  frame: a growing area's frame changes as cards come and go, its own place only moves with the layout, so `at` stays
  the same when an area is moved or pushed (tested). This settles that part of the open decision on `At`; A3.3 has to
  keep an equivalent origin once `shifts` is no longer saved.
- `settleAt()` in `areas.ts`, the last step of `settle()`, reads `at` off `x, y` with `measure()`, `stacksOnSpot()` and
  `gridCells()`, and returns the same table when nothing changed. It costs about 0.4 ms per change.
- Save format version 2: its migration is `settle`, which records `at` in a version-1 save. The schema checks `at`'s
  shape.
- Tests: `misplaced()` (`src/test/play.ts`) works each pile's coordinates back out of its `at`, and is checked after
  every move of the random games and on every save fixture; that inverse is the starting point for A3.2. The fixtures'
  snapshot now shows each pile's `at`, with every coordinate unchanged.

Outcome of A3.2 (October 2026, on top of A3.1; `CLAUDE.md` describes it under **Table model**):

- The readers moved, in the planned order. Fanned rows and spots: `stacksOnSpot()` and `fanRow()` gather the piles by
  `at.spot`, in `index` order, and `spotOf()` gives the spot of one pile from its own `at`, behind `facedSpot()`,
  `turnedSpot()`, `slidesUnder()` and `upsideDownSpot()`; `spotPlace()` and `placement()` take the pile on a spot of a
  single place from there (`pileOn()`). Grids: `gridCells()`, `gridOf()`, `onGrid()`, `battlefieldInUse()` and the
  cards `gridPlaces()` lays strips beside read `at.grid`. Fixed places: `placeStack()` finds any of them by `at.place`
  (the Encounter Deck's, a table deck's for `intoDeck()`, the storybook's for `drawOrder()`). Loose piles: `areaOf()`
  gives a pile's area from its `at` (a place's area, a spot's or grid's, `at.area`), which `gridPlaces()` asks instead
  of `measure()`.
- Refined: `{ place }` wins over `{ spot }`, so the Damage Card's place, which lies on the damage spot, would drop out
  of that spot's piles. `PLACE_SPOTS` says which spot a place lies on (only `damage`), and `placeArea()` which area
  each place lies in. The shape of `At` didn't need to change.
- What still reads the coordinates, renamed `inferred*` (`inferredOnSpot()`, `inferredRow()`, `inferredGridCells()`,
  `inferredGridPiles()`, `inferredArea()`) so that A3.4 finds it: everything `settle()` runs before `settleAt()`
  (`settleSpots()`, `faceArrivals()`, `settleEnemies()`, `settleLayout()` with `measure()`), since the piles have just
  moved and their `at` is stale there; and what they share with the drawing: where the spots lie (`spotsOf()`: the rows
  after another row, the Market Prices places), the placeholders and frames (`freePlace()`, `freePlaces()`,
  `fanHasPlace()`, `splitBox()`, `framedPlaces()`, `gridBox()`). Those are the layout that A3.3 derives from `at`.
  `rearrange()` keeps `areaForCard()` too, as the migration of version-0 saves lays their areas out with it before
  their piles have an `at`; point queries for a drop (`areaForCard()`, `stackTargetAt()`, `intoStory()`) are not
  readers of where a pile lies, and `deckStack()` and `isFixed()` read the pile's identity, in the sidebar too.
- The readers are called on settled tables (the store's, the Battlefield preview, an area dragged), or within an action
  only on a pile it hasn't moved (`dropOnto()` asks `slidesUnder()` about its target beside the new pile of dropped
  cards: `spotOf()` reads only that pile's `at`). Where an unsettled table met a reader, `at` is first read off its
  coordinates with `settleAt()`, which moves nothing: the preview of a card dragged along a row (`Table.tsx`), the
  version-0 migrations `fillBar` and `placeOnSpots` (`setup.ts`), and `rearrange()` once it has moved the loose piles an
  area now covers off to the right (the area drag draws its result as it is).
- Tests: `misread()` (`src/test/play.ts`) compares each reader with the inference on every move of the random games and
  every save fixture. A temporary tripwire comparing both on every call, over 3000 random games, found no other
  disagreement than `dropOnto()`'s; the code review found the area drag's (tested now). Snapshots unchanged.
- Left for A3.3: a save of version 2 is trusted to hold an `at` matching its `x, y` (the app only writes such saves);
  `placement()` still works out the area of the pile dropped onto with `areaForCard()`; and once actions set `at` and
  `x, y` follow from it, the `inferred*` functions remain only for the migration (A3.4).

Outcome of A3.3 (October 2026, on top of A3.2; `CLAUDE.md` describes it under **Table model**, **Area layout** and
**Saves**):

- `at` is what the actions set and what the save holds. `placement()` returns it (`Placement.at`, beside the `x, y`
  where the dragged card is drawn meanwhile); `addStack`, `moveStack`, `takeTop`, `liftPile`, `drawTop`,
  `extractCard`, `playCards` and `fromTray` take an `At` instead of `x, y`; App's `dropAt` gives one. A pile put loose
  lies where `looseAt()` says: in the area `areaForCard()` gives the point (from its own corner), else on the table. A
  card put into a row gets an index half way between two (`spotPlace()`), which `settleSpots()` numbers again, as it
  closed the gaps of the half-unit positions before.
- `x, y` stay on `Stack`, but as a cache of the layout: `settle()` ends with `placePiles()`, which lays each table pile
  where `pointOf()` says (and the piles off the table at 0, without `at`). Removing them from `Stack` would have meant
  passing the layout to every reader (the drawing, hit-testing, `gridPlaces()`, the drag previews) for no gain: they read
  a settled table, where the cache is up to date. Actions never read the cache of a pile they have moved.
- The layout reads `at` throughout: `spotsOf()`, the placeholders, `gridBox()` and `allAreas()` (now framed around the
  spots, grids and the piles lying loose in each area by their `at`, no longer `measure()`), and `settleSpots()` and
  `settleLayout()`. What `measure()` did beyond that is `takeIn()`: a pile loose outside the areas that an area comes to
  lie over joins it, before and after the areas move, as `measure()` did in `settleLayout()` and `settleAt()`. The
  battlefield's Enemy Card places need no `settleEnemies()`: the cards on them lie there by their `at`.
- Loose piles in an area keep the origin of A3.1, the area's own corner moved by its shift. `Table.shifts` stays in
  memory, as the layout last laid out (figures move by the difference, and the drag previews keep the areas where they
  lie), but it is a function of where the piles lie and of `anchors`: `layOut()` works it out from scratch on loading.
  An area back on its own place now has no shift rather than `{ x: 0, y: 0 }`, so that a table saved and loaded again
  is the same table.
- Save format version 3: `saveText` writes the table `withoutLayout()` (no `x, y`, `shifts`, `frames` or `enemies`), so
  only the player's intent is saved besides where the piles lie (`anchors`); the migration to version 3 drops them from
  older saves, and `migrate()` (all of `readSave` but parsing and checking) lays every save out with `layOut()`. The
  schema takes `x, y` as optional; `tableProblems()` also finds table piles without an `at`, fixed piles off their place,
  piles on a spot or area there is not, and piles off the table with one.
- The migrations of version-0 and version-1 saves move piles by their coordinates, so they keep the layout of A3.2
  under `inferred*` names (`inferredSettle()`: `inferredSettleEnemies()`, `inferredSettleSpots()`,
  `inferredSettleLayout()`, `settleAt()`; `inferredRearrange()`, `inferredSpots()`, `inferredAreas()`), the layout
  helpers taking a reader (`By`: `'at'` or `'xy'`) where the two share code. Nothing else uses them.
- Tests. Key test (`saves.test.ts`): for each fixture, every pile laid out from its `at` lies where the save, as of
  version 2, drew it, with the same `at`, figures and anchors; to within float rounding, as a loose pile's place in its
  area added back to the area's corner can differ in the last digit (3·10⁻¹⁴ for one pile of `v0.3.0-moved`, whose
  snapshot line changed by that much; nothing else in the snapshots did). A new property test plays every random move
  through both layouts (the old one given the frames and Enemy Card places it kept) and finds them equal; in a one-off
  run of 3,000 games of up to 50 moves the only difference was a bug of the coordinates: the Home area's Goods (or
  Equipment) and the House Extensions beside them lie on one line, so the inference took a Goods card for a House
  Extension while that row had room. Now it stays among the Goods, as the README says; the test stops a game there. `misread()` still checks the
  fixtures, but no longer the random games, where that case makes it disagree.
- Left for A3.4: the geometric inference is used only by the migrations of saves from before version 3 (`measure()`,
  `settleAt()`, the `inferred*` functions, the `'xy'` reader, `Table.frames` and `enemies`). Removing it means either
  freezing it into a migrations module or no longer loading those saves; `misread()` and the comparison property test
  go with it. `areaForCard()` and `looseAt()`, the point queries for a drop, stay.

Done when: no data derived from the layout is saved, changing the size or order of the areas no longer needs a
migration, and the fixtures look the same as before.

Outcome of A3.4 (October 2026, on top of A3.3; `CLAUDE.md` describes it under **Table model**, **Setup & migration**
and **Saves**):

- The geometric inference is gone from the app: `measure()`, `settleAt()`, `placesOf()`, the `inferred*` functions and
  the reader parameter (`By`, `'xy'`) left `areas.ts` and `actions.ts`, and the layout helpers (`freePlace()`,
  `splitBox()`, `gridBox()`, `spotsOf()`, `allAreas()`, …) read `Stack.at` only. `areaForCard()` and `looseAt()` stay,
  as point queries for a drop. `Table` lost `frames`, `enemies`, `battlefield` and `hand`, which only older saves hold.
- The migrations of saves from before version 3 were frozen in `src/legacy/`, rather than dropping those saves: a
  self-contained copy of the layout of then cut down to what they use (`layout.ts`: its own areas and spots, the
  coordinate inference, `settle()` and `rearrange()` by coordinates), the pile operations they use (`piles.ts`, with its
  own list of the cards pinned on top) and the steps (`migrate.ts`: `migrateTable`, version 0 → 1, moved out of
  `setup.ts`; `recordAt`, version 1 → 2). They import only `cards.ts`, `decks.ts` (the decks' rules; the lists of the
  sidebar and table decks are frozen too) and the types, which a test checks, so a change to the app's layout or
  actions can no longer change how an old save migrates. `OldTable` is the shape of those saves. `setup.ts` keeps only
  the new game, its helpers cut down to it.
- Checked before removing anything: on every fixture, and on 750 random tables, 600 of them at every older `Table.layout` (with
  and without anchors and an old battlefield), the frozen migrations gave the same table as the code they were copied
  from, to the byte of its JSON; a new game and random play (drops, area moves, layout reset) gave the same tables as
  before. Snapshots unchanged; the save format stays at version 3 (nothing saved changes).
- Tests: `misread()` and the property test comparing the app's layout with the coordinate layout went, as they compared
  against the inference removed (the one bug that comparison found, Goods taken for a House Extension, has a test of
  its own). The safety net is `misplaced()`, `tableProblems()`, the settle fixed point in the random games, and the
  save fixtures, whose key test still compares the frozen layout's coordinates with the app's while the app's layout is
  the one of then. `src/legacy/migrate.test.ts` covers what the fixtures don't hold (the removed hand, a home-made deck,
  the storybook in the sidebar, attracted cards merged on their spot); `src/legacy/*.ts` has its coverage threshold.

Whether A3 is done: no data derived from the layout is saved (`withoutLayout()`: no pile coordinates, `shifts`,
`frames` or `enemies`; only `at`, `anchors`, figures' `x, y`). Changing the size or order of the areas needs no
migration: piles lie by `at` (a spot, grid place, fixed place, or loose from an area's own corner), and the frozen
migrations no longer follow the app's layout. Two caveats, left under the open decisions: the area-relative
coordinates of a loose pile are measured from the area's own place in `AREAS`, so moving an area's _own_ place (not its
laid-out place) or renaming a spot or area still needs a migration; and figures (`tokens`) still lie by plain
coordinates. The fixtures look the same as before (snapshots unchanged since A3.1, but for the 3·10⁻¹⁴ of A3.3).

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

Goal: what could become the library lies in `src/lib/`, the game everywhere else in `src/`, and lint says where the two
are still tied. This repo stays Grimm World's: if other games come, `src/lib/` moves to a library repo of its own (B8).

```
src/
  lib/
    engine/   pure TypeScript, no React: model, pile actions, spots, grids, layout, placement, settle, store
    ui/       generic React: table view and gestures, sidebar, Hand, Browse panel, dialogs, action bar, toolbar
  …           Grimm World: its types, cards, decks, areas and spots, battlefield, storybook, setup, saves and
              migrations, rules and booklets, its own UI, App.tsx, main.tsx, styles.css, test/
```

**Only code moves.** No function changes what it does; the commits are `refactor`, and the tests, the save snapshots
and Playwright at the four sizes show nothing changed. Allowed besides moving: exporting a helper that the other side
now needs (`setStack`, `withCards`, `newId`, `cardsOf`, `shiftOf`, `gridPiles`…), and updating import paths. A
function with a Grimm branch inside (`pointOf()`'s storybook case, `allAreas()`'s battlefield) moves as it is; making
it generic is B2/B3.

**What goes where.** A declaration goes to `src/lib/` when its job is the same in any card game laid out in areas
(piles, spots, fans, grids, frames, layout, placement, settling, pile actions, the generic UI), even when it still reads
Grimm data; it stays in `src/` when it _is_ Grimm data (areas, spots, decks, sizes, texts, ids) or a Grimm-only rule.
A file moving to `src/lib/` leaves its Grimm constants behind in a game file.

The split of the files that mix both, declaration by declaration (`→ lib`: to the file of the same name in
`src/lib/engine/` unless another is named; `stays`: in the game's file of that name):

- `types.ts` → lib: `CardDef`, `CardManifest`, `CardRef`, `Rotation`, `Stack`, `At`, `Token`, `Table`, `View`.
  Stays: `CardType`, `StorySlot`, `EncounterPlace`, `Place`.
- `cards.ts` → `src/lib/engine/geometry.ts`, a leaf importing nothing but types: `CARD_W`, `CARD_H`, `cardBox`,
  `tokenSize`, `clampScale`, `Turn`, and from `areas.ts` `AREA_PAD`, `AREA_HEADER`, `GAP`, `box()`, `Point`, `Rect`,
  `Side`, `OPPOSITE`, `inRect`, `overlap`, `cardRect`, `distanceTo`, `rightOf`, `bottomOf`. → lib (`cards.ts`):
  `cardLabel`, `compareCards`, `queryTerms`, `matchesQuery`. → `src/lib/ui/cardClasses.ts`: `turnedClass`,
  `landscapeClass`. Stays: `Family`, `family`, `isLandscape`, `loadManifest`, `cardImage` (the card images' paths).
- `decks.ts` → lib: `DeckSpec`, `deckStack`. Stays: `DeckKind`, `DECKS`, `DECK_SPECS`, `TABLE_DECKS`, `returnsCards`,
  `SIDEBAR_DECKS`, `storySlot`, `defaultDeck`, `homeDeck`.
- `areas.ts` → lib, the mechanics: `Area`, `Spot`; the fan geometry (`fanMax` … `fanHasPlace`, `splitBox`,
  `splitHalves`); `lying`, `stacksOnSpot`, `fanRow`, `spotOf`, `spotsById`, `pileOn`, `areaOf`, `spotPlace`, `indexOf`,
  `takes` and the spot queries (`facedSpot` … `coveredSide`, `holdsOne`); `placeStack`; the grid mechanics
  (`cellPlace`, `cellBox`, `cellKey`, `allGridPiles`, `gridPiles`, `gridCells`, `cellsOf`, `gridOf`, `onGrid`,
  `GridPlace`, `SIDE_STEPS`, `stripBox`, `gridPlaces`, `terrainPlaces`, `gridBox`); `framedPlaces`, `NO_SHIFT`,
  `shiftOf`, `spotsOf`, `baseSpots`, `frameAround`, `mostOverlapped`, `allAreas`, `pointOf` … `sameAt`, `takeIn`,
  `isFixedPile`, `placePiles`, `bottomUnder`, `crowd`, `pushAside`, `anchorsOf`, `anchoredPlaces`, `SNAP`, `snapArea`,
  `anchorsAfterMove`, `arrange`, `shifted`, `settleLayout`, `layOut`, `areaForCard`, `spotAt`, `drawOrder`,
  `Placement`, `placement`, `pairedRow`, `withinRow`, `GRID_REACH`, `ontoGrid`, `intoDeck`, `areaSpot`, `oneEach`,
  `familyNames`, `full`. Stays, the data and the Grimm-only rules: every size and `*_SHOWS` constant and the areas' own
  boxes (`map`, `bar`, `encounter`, …, `battlefield`, `deckArea`, the enemies' block), `AREAS`, the spots' anchors
  (`characterSpot`, `storageSpot`, `houseSpot`, …, `regionGrid`, `handSpot`) and `SPOTS`, `BROWSE_DECKS`,
  `PLACE_BUTTON`, `PLACE_GAP`, `STORY_SLOTS`, `ENCOUNTER_PLACES`, `encounterPlace`, `deckPlace`, `PLACE_SPOTS`,
  `placeArea`, `GridId`, `GRIDS`, `GRID_FAMILY`, `gridOrigin`, `MAP_COLS`, `grows`, `terrainPlace`, `marketSide`,
  `marketCache`, `mapSpots`, `battlefieldSpots`, `battlefieldBoxes`, `battlefieldInUse`, `gridFaceUp`, `GROWING`,
  `ABOVE_PLAY`, `DECK_BLOCK`, `PLAY_AREAS`, `COMBAT_AREAS`, `packedPlaces`, `battlefieldPlace`, `HOME_AREA`,
  `FAMILY_NAMES`, `SHORT_NAMES`, `CARD_NAMES`, `acceptsText`, `refusal`, `gridLabel`, `ontoPlace`, and `RAIL_AREAS`
  (from `Toolbar.tsx`). A cache goes with the function that fills it.
- `actions.ts` → lib: all but two blocks, which stay in game files of their own: `battlefield.ts` (`TerrainSlot`,
  `BattlefieldLayout`, `parseBattlefield`, `battlefieldText`, `buildBattlefield`, `clearBattlefield`; `takeCard`, in
  that block, is generic and goes to lib) and `storybook.ts` (`revealStory`, `storyToBar`, `unrevealStory`,
  `putUnderChapter`, `storyProgress`, `storyAt`, `intoStory`).
- `store.ts` → lib: all but the React hooks, `useTable` and `useHistory`, which go to `src/lib/ui/useStore.ts`
  (`subscribe` is exported for them).
- `storage.ts` → lib, whole (its `grimm-world:` prefix stays for now: it is B2's `GameDefinition.id`).
- `validate.ts` → lib: `tableProblems`. Stays: `isValidTable`, which checks the shape of an old save (`OldTable`).

A declaration not named here goes with what uses it; if both sides do, to lib.

`src/lib/ui/`, whole files: `Table.tsx`, `TablePieces.tsx`, `TablePlaces.tsx`, `tableGestures.ts`,
`useTableGestures.ts`, `Sidebar.tsx`, `Tray.tsx`, `CardGhost.tsx`, `useFlip.ts`, `useDragOut.ts`, `usePanel.ts`,
`useNotice.ts`, `useFitView.ts`, `useTransient.ts`, `useDialogs.ts`, `compact.ts`, `dropRouting.ts`, `ActionBar.tsx`,
`Popovers.tsx`, `Toolbar.tsx` (its `RAIL_AREAS` stays in the game's `areas.ts`), and `dialogs.tsx` but for
`ChapterDialog` and `AboutDialog`, which go to `src/GameDialogs.tsx`. Staying in `src/`, whole: `App.tsx`, `main.tsx`,
`styles.css`, `env.d.ts`, `AreaIcon.tsx`, `BattlefieldBar.tsx`, `useBattlefieldBar.ts`, `useTableEvents.ts`,
`RulesPanel.tsx`, `Booklets.tsx`, `booklets.ts`, `rules.ts`, `useRulesPanel.ts`, `setup.ts`, `save.ts`, `legacy/`,
`test/`. `styles.css` isn't split yet: the `src/lib/ui/` components still use its classes.

Tests move with the module they are named after (`areas.test.ts` → `src/lib/engine/`, `tableGestures.test.ts` and
`dropRouting.test.ts` → `src/lib/ui/`); `properties.test.ts`, `saves.test.ts`, `save.test.ts`, `decks.test.ts`,
`cards.test.ts`, `BattlefieldBar.test.tsx` and `src/test/` stay, since they play the real game. A test may import from
both sides.

**The import rule** (`.oxlintrc.json`, `overrides`; checked to work with oxlint 1.86):

- `src/lib/**` imports nothing of `src/` outside `src/lib/` (`no-restricted-imports`, pattern `../../*` but
  `../../lib/**`, so `src/lib/engine/` and `src/lib/ui/` hold no subfolders yet);
- `src/lib/engine/**` doesn't import `src/lib/ui/` nor `react`;
- tests (`src/lib/**/*.test.ts(x)`) are exempt.

Each import that still breaks the rule is marked where it is, one per import:

```ts
// oxlint-disable-next-line no-restricted-imports -- B2
import { AREAS, SPOTS } from '../../areas';
```

So `grep -rn -- '-- B2' src/lib` is B2's list of what to inject, and B2 is done when it is empty. Grimm literals inside
`src/lib/` functions (`'battlefield'`, `'story'`…) aren't marked: those functions all import from the game anyway.

**Import cycles.** `src/lib/engine/areas.ts` imports the game's `areas.ts` for its data, which imports the engine's for
`shiftOf`, `cellPlace`, `gridPiles`… That works as long as the top level of a game data module (what runs on import:
`AREAS`, `SPOTS`, their boxes) uses only `src/lib/engine/geometry.ts`, other game data and types, never a function of a
module it is in a cycle with; otherwise loading fails with a `ReferenceError` (a binding used before initialization),
which the tests show at once. That is why `geometry.ts` is a leaf.

**What changes besides `src/`:**

- `vite.config.ts`: coverage `include` gets `src/lib/**/*.ts`; the thresholds cover every file the covered modules
  were split into (`src/lib/engine/{areas,actions,decks,validate}.ts`, the game's `areas.ts`, `actions`' two blocks in
  `battlefield.ts` and `storybook.ts`, `decks.ts`, `save.ts`, `setup.ts`, `validate.ts`). A new small file falling below
  its threshold is reported, not given a lower one.
- `src/legacy/migrate.test.ts`: the imports the frozen migrations may have become the files `cards.ts`, `decks.ts` and
  `types.ts` were split into (on both sides). Only their import paths change.
- `CLAUDE.md`: the thorough reorganization A5 left for this step. The architecture section becomes a map by folder,
  each module gets a header comment saying what it holds, and the rule and its `-- B2` markers are described.

Done when: lint passes with the rule on, every remaining tie is a `-- B2` import, `typecheck`, the tests (with coverage)
and the build pass, the save snapshots are unchanged, and Playwright shows nothing changed at the four sizes.

Outcome (November 2026; `CLAUDE.md` describes the folders and the rule):

- Every top-level declaration of `src/` before the step is in the new tree with the same text (checked by a script
  comparing them, ignoring `export` and formatting), except for the expected changes. Calls such as
  `A.revealStory()` became `revealStory()` once those functions left `actions.ts`, and `store.ts`'s two hooks moved to
  `src/lib/ui/useStore.ts` over a new `historyFlags()`. The save snapshots didn't change. The development server and
  the production build load and play without console errors (the import cycles between the engine and the game's data
  load in both).
- 37 `-- B2` imports remain, all from `src/lib/` into `areas` (8), `cards` (8), `decks` (6), `types`, `storybook`,
  `setup`, `save`, `AreaIcon` (2 each), `rules` and `legacy/table` (1 each; `tableProblems` checks for the removed
  hand of old saves).
- Differences from the list above: `SPLIT_SHOWS` went to the engine with `splitBox()`, its only user, a generic minimum
  rather than Grimm data. The rule's patterns are `../../**`, since `../../*` let deeper paths like `../../legacy/table`
  through.
- Coverage of the files split from the covered modules: 85–100% of lines, 83–94% of branches, every one above its
  threshold.

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

A simple card solitaire, built only with `src/lib/`, as a throwaway test in this repo: whatever is hard to fit in there
shows what is still coupled, and is fixed in `src/lib/` before going further. The solitaire itself is then deleted.

### B8. Library repo

Only once another game is actually wanted: `src/lib/` (and the pipeline's configurable scripts) move to a library repo
of their own, published as a package that this repo and the new game's repo depend on. Not before.

## Open decisions

- The final shape of `At` (A3), in particular loose piles inside a growing area and the Battlefield's `alt` places.
- After A3: a loose pile in an area lies from the area's own place in `AREAS` (and `SPOTS` ids name the spots), so
  changing an own place or an id still needs a migration of the saves; figures still lie by table coordinates, and
  move with an area only by lying over it. The 1-unit offsets between rows on one line (`Spot.after`) only matter to
  the frozen migrations now and could go with a layout change.
- Which solitaire serves as B7's throwaway test.
