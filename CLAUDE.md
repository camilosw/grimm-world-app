# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A tablet-first React app (Vite + TypeScript, no backend) for playing the solo print-and-play card game **Grimm World**. Game rules are in `game-files/Grimm World - The Rulebook.pdf`; the card sheets are in `game-files/GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf` (628 MB, not something to open casually). `README.md` documents the player-facing controls and rules the app enforces — keep it in sync when behaviour changes.

## Commands

```bash
npm run dev -- --host        # dev server on :5173, reachable from the tablet on the LAN
npm run build                # tsc -b + vite build
npx tsc -b                   # type-check only
npm run lint                 # oxlint
uv run scripts/split_cards.py    # PDF → public/cards/{lg,sm}/NNN-{front,back}.webp + cards.json (~1 min)
uv run scripts/index_cards.py    # OCR card types/numbers into cards.json (~15 min; --cards 120,130 to redo a few)
uv run scripts/split_rules.py    # rulebook → public/rules/ page images + rules.json (~15 s)
```

There is no test suite. Verify UI changes in a browser with the `playwright-cli` skill (tablet size: `resize 1180 820`). The table state is autosaved in `localStorage` under `grimm-world:table:v1`; clear it (`localStorage.clear()`) to start from the initial setup.

`public/cards/` and `public/rules/` are generated and git-ignored. Python scripts use PEP 723 inline dependencies — run them with `uv run`, not pip/venv (the system Python has no pip).

## Card data pipeline

- `split_cards.py`: each PDF page is one 300 dpi JPEG with a centred 3×3 grid of 63.5×88.9 mm cards. Odd pages are fronts, even pages backs, **mirrored left↔right** (back of (row, col) is at (row, 2−col)). Card ids `001`–`540` follow sheet order. It crops the embedded JPEG (no re-render).
- `index_cards.py` adds `type`, `code` (e.g. `Y291c`, `B23`, `X05`, `T07`, `R1-111`) and `name`. Card ranges per type, Region/Terrain numbers and hand-verified OCR corrections (`KNOWN`) are hardcoded for this specific PDF. Fronts are the reliable OCR source; backs are only a cross-check.
- The app only needs `public/cards/cards.json` plus the images; card types drive the deck setup, deck/area rules and search. The title card (`type: 'title'`) is excluded from play (`playableCards`).
- `split_rules.py`: the rulebook has no PDF outline and its extracted text loses the inline game symbols, so the app shows page images and uses text only for search. `rules.json` holds per-page text and a table of contents parsed from the Contents pages, with each heading's page and vertical position (`y`). Printed page N is PDF page N+1 (page 0 is the cover).

## App architecture (`src/`)

**State.** `store.ts` is a tiny external store (`useSyncExternalStore`) holding one immutable `Table` with undo/redo history and debounced localStorage autosave. All mutations go through `update(fn)` where `fn` is a pure `(Table) => Table` from `actions.ts`; returning the same object means "no change" (no history entry). `update` also runs `settleFans` on the result, so table-wide layout invariants hold whatever action ran. View state (pan/zoom, selection, dialogs, drag hover) lives in React state in `App.tsx`, not in the store.

**Table model** (`types.ts`):
- `stacks: Record<id, Stack>` — every pile of cards, wherever it is. `Stack.cards` is ordered **bottom → top** (top card = last element).
- `z` — ids of stacks lying on the table, back to front. `dock` — ids of the sidebar decks, in sidebar order. A stack is in exactly one of them.
- `Stack.deck` marks a fixed deck (`DeckKind`); `Stack.slot` marks the storybook's two fixed table places (`story` face-down deck, `story-revealed`). Deck and slot stacks stay when empty; plain table piles are removed when their last card leaves (`withCards` in `actions.ts` enforces this and also records `origin`).
- `origin` — the deck each card last came out of; `hand` — cards in the hand tray; `battlefield` — the on-demand battlefield area; `tokens` — figures.
- Table coordinates are world units: a card is `CARD_W × CARD_H` = 250 × 350 (`cards.ts`); the view is a CSS transform of the world div.

**Rules modules** — the game logic the UI must respect:
- `decks.ts`: the fixed decks (`DECKS`; `SIDEBAR_DECKS` excludes the storybook), what each may `holds`, how returned cards are inserted (`top` / `bottom` / `sorted`), and `homeDeck()` (origin deck if it may hold the card, else the default deck for the card type; time cards always go to the Time Card slot). Any drop on the sidebar returns cards to their home deck; deck-to-deck drags are refused; explicit cross-deck moves go through "Put under…" (`putUnderDeck`, `putUnderChapter`), which checks `holds`.
- `areas.ts`: fixed framed areas of the play area (Map, Encounter Bar, Character, Storage, Storybook, Home) plus the battlefield area, which card families each accepts, and `refusal()` for drops. Space outside all areas accepts anything. `SPOTS` are card-sized places reserved for one family: nothing else may lie on a spot, and cards of that family dropped near it snap onto it. Spots with `attracts` (the Character Card at the top center of the Character area, the Alignment Card half under its left side, the Money Cards half under the right side of the Storage Card) also pull their cards from anywhere on the table; the Storage Card spot doesn't (it takes any Y-card). A spot with `under` lies beneath the card of the spot beside it (`coveredSide()` says which half is hidden); a spot with `fan` is a row of at most `count` single cards, every card half under the one before (Money Cards, so each can be turned to its amount). The row's order is left to right: `spotPlace()` inserts a dropped card by giving it a position half a unit beside a place, and `settleFans()` (applied by `store.update` after every change, and by `migrateTable`) closes gaps and snaps the row onto its places. `Table.tsx` previews that result while a card is dragged along the row. `drawOrder()` enforces both layerings at render time instead of in `z`. `placement()` combines both rules and returns where dropped cards really go — every way of putting cards on the table uses it. Area geometry is constant, not saved state.

**UI components.** `App.tsx` wires everything: toolbar, action bar for the selected pile, drop routing between table / hand / sidebar (`zoneAt` uses `elementFromPoint` on `data-deck` / `data-dock` / `.hand`), placement (`dropAt` finds a free spot respecting areas and spots, or returns null and notifies when the cards can't go on the table) and dialogs. `Table.tsx` owns all pointer gestures on the canvas (tap, double-tap flip, long-press inspect, drag top card vs. `⠿` grip for the whole pile, one-finger pan, pinch/wheel zoom) and renders areas, stacks, slots and tokens. `Sidebar.tsx` and `Hand.tsx` share `useDragOut.ts` for tap / long-press / drag-out with a floating `CardGhost`. `dialogs.tsx` holds the modal UIs (card viewer, browse pile, find card, battlefield builder, chapter picker). `RulesPanel.tsx` is the rulebook drawer (lazy-loaded page images, contents, search); `rules.ts` maps areas, decks and card types/number ranges to rulebook section ids for the help links — section ids must exist in `rules.json`'s `toc`.

**Setup & migration.** `setup.ts` `initialTable()` builds the rulebook chapter 6.1 setup (shuffled B-Encounters with Time Passes at the bottom, sorted Lost Pages/X/Regions/Terrain, storybook in its area, empty campaign decks). `migrateTable()` upgrades older saves (decks on the table, free-form sidebar decks, title card, storybook in the sidebar, Storage area a card narrower, cards off their attracting spots) — when changing the `Table` shape, extend it so existing saves on the tablet keep working, and keep `isValidTable` in `App.tsx` consistent (every playable card exactly once).

## Conventions

- Put game rules in `decks.ts` / `areas.ts` / pure functions in `actions.ts`, not in components; components call `update(...)` and show feedback with `notify(...)` (refusals) or `notify(text, true)` (success).
- Any new way of placing cards on the table or into decks must go through the same checks as drag-and-drop (`placement` for the table, `holds` / `homeDeck` for decks).
- Style tokens are CSS variables in `styles.css`; world-space elements (areas, stacks) use world-unit sizes, screen-space UI uses ≥44 px touch targets.
- The project also has an OpenSpec setup (`openspec/`, `/opsx:*` commands) for spec-driven changes; no specs exist yet.
