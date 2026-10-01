# Grimm World — tablet table

A virtual table for playing the print-and-play solo game **Grimm World** on a tablet.

## 1. Split the card sheets

The card PDF (`game-files/GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf`) has 60 A4 sheets, each with 3 × 3 poker-size cards.
Odd pages are fronts; even pages are the backs, mirrored left ↔ right.

```bash
uv run scripts/split_cards.py      # ~1 min → public/cards/{lg,sm}/NNN-{front,back}.webp + cards.json
uv run scripts/index_cards.py      # optional, ~15 min: OCR card numbers (Y003, B23, …) and card types
uv run scripts/split_rules.py      # ~15 s: rulebook pages → public/rules/ (page images, search text, contents)
```

- `lg` images are 750 × 1050 (300 dpi, full quality); `sm` images are 300 × 420 (table preview).
- Card ids `001`–`540` follow sheet order (sheet 1 = 001–009, row by row).
- `index_cards.py` writes `type`, `code` and `name` into `cards.json`. The app uses them to build the starting piles
  (rulebook chapter 6.1) and to search for cards. If a number was misread, fix it with
  `--override 123=Y456` or by editing `cards.json`.

Both scripts declare their own Python dependencies (PyMuPDF, Pillow, RapidOCR), so `uv run` is all you need.

## 2. Run the app

```bash
npm install
npm run dev -- --host      # open http://<your-pc-ip>:5173 on the tablet
```

On the tablet, use _Add to Home Screen_ for a full-screen app. The table saves automatically in the browser.
Use **☰ → Export save** to keep a copy.

## Controls

**Areas.** The table has a framed area for each part of the game (rulebook chapters 4 and 10). An area only takes
the cards that belong there; while you drag, it lights up green (allowed) or red (refused), and a refused card goes
back where it came from. Space outside the areas takes any card. **📍 Areas** jumps to an area.

| Area          | Takes                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Map           | Region Cards on its four Region Card places, Encounter Cards on the four Market Prices places beside them                |
| Encounter Bar | Y-Cards                                                                                                                  |
| Character     | Character Card, Alignment Cards, Y-Cards (titles, skills, quests, status upgrades, Damage Card), Encounter Cards (items) |
| Storage       | Storage Card and other Y-Cards, Encounter Cards (items, goods), Money Cards                                              |
| Storybook     | the storybook itself, one Encounter Card (see below)                                                                     |
| Home          | Y-Cards (house and extensions), Encounter Cards (stored items and goods)                                                 |
| Battlefield   | Terrain Cards, Hit Point Cards, Y-Cards (enemies)                                                                        |

Region, Character, Alignment, Money, Storybook, Terrain and Hit Point cards only fit in their own area.

**Region Cards.** Region Cards are printed sideways, so the app always shows them landscape — on the table, in the
sidebar, in lists and in the card viewer — and they can't be rotated. They turn over about their horizontal axis (other
cards turn about their vertical one). The Map area has four Region Card places, two by two, and takes nothing else. A
Region Card dropped anywhere on the table goes to the place it is dropped on if that is free, else to the first free
one; a fifth one is refused.

**Market Prices.** Left of each left Region Card place and right of each right one is a "Market Prices" place for the
Encounter Card that sets that region's goods prices (rulebook 7.1.2.5). It takes one Encounter Card, dropped on or near
it, and nothing else. The card lies landscape and face up, slid under the Region Card so that only its price strip
shows, as in the rulebook: on the left places it is turned a quarter right, so its prices lie beside the goods printed
on the Region Card's left edge; on the right places it is turned the other way. A card dropped there face down turns face
up, and it can't be flipped or rotated while it lies there (double-tap says so; **Flip** and **Rotate** are not
offered). Dragged away, it is an ordinary upright card again.

**Character and Alignment Card places.** The Character area has a place for the Character Card at its top center and,
half under its left side, one for the Alignment Card (dashed outlines). Wherever you drop one of these cards on the
table — dragged from the sidebar, the table or the Browse panel, drawn, or taken out with Find/Browse — it lands on its place,
and no other card can be put there. The Alignment Card always lies under the Character Card, with only its left half
showing (**Rotate** it to show the value on its other end); both Alignment Cards dropped there form one pile. Other
cards may still overlap the edges of these places.

**Storage Card place.** The Storage area has a place for the Storage Card at its top center. It takes any Y-card, since the
Storage Card is one of them: a Y-card dropped on or near it snaps onto it, and other cards are refused there. Unlike
the Character and Alignment Cards, Y-cards are not pulled there from elsewhere on the table.

**Money Cards.** Right of the Storage Card lies a row of up to three Money Cards (rulebook 4.3): the first slid half
under the right side of the Storage Card, each further one half under the one before, so the amounts on their right
halves show and add up to the character's money. The placeholder marks where the next one goes. Like the Alignment Card,
a Money Card dropped anywhere on the table joins the row: where you drop it when that is on the row, else at its end. A
fourth one is refused. Drag a card along the row to reorder it (the others make room while you drag); take one away and
the cards right of it close the gap. Each card lies on its own, so double-tap or **Rotate** it to show the amount you
need.

**Goods.** Encounter Cards held as goods (B-Encounters from the Encounter Deck and X-Encounters) go in two rows
beside the Storage Card, each under a "Goods" placeholder. Left of it, the first is slid under the left side of the
Storage Card so that only its left part shows. Below it, the first is slid under its bottom edge so that only its
bottom part shows. In both rows each further card lies likewise under the one before. Drop an Encounter Card on or near
a placeholder, or on a row, to add it there (where you drop it, or at the end); other cards are refused on it. There is
no limit: once a row reaches the edge of the Storage area its cards close up to stay inside it (the placeholder then
disappears — drop on the row). Unlike Money Cards, Encounter Cards are not pulled into a row from elsewhere on the
table. Reordering and taking cards away work as for Money Cards. Money Cards and Goods go into their rows one card at a
time; a whole pile dropped there is refused.

**Storybook area.** The storybook lies face down on the right; the revealed cards lie on the left, the top one being
the current chapter. Tap the storybook to turn over its next card; tap the revealed cards to put the top one back on
the storybook, face down. The storybook can't be looked through, sorted or moved; long-press the revealed card to read
it. A revealed Y-card (sub-chapter card) can be dragged out, e.g. to the Encounter Bar. To put Y-cards "into the
corresponding chapter", use **Put under…** on them, tap the storybook and pick the chapter: they go directly under that
Chapter Card.

**Storybook Encounter Card.** Below the revealed cards is a place for one Encounter Card, lying on top of the bottom
edge of the current chapter (about a tenth of it). An Encounter Card dropped anywhere in the Storybook area lands on
that place; a second one, a pile, or any other card is refused there.

**🂠 Decks sidebar (left).** The other 14 decks of the game, sorted as in the rulebook (chapter 6.1); the table starts
empty apart from the storybook. The Quest, Enemy and Training Decks and the Banned Cards pile start empty: the
campaign start builds them (cards Y003 and Y009), and each empty deck says which card fills it. The title card is
left out; it isn't needed to play.

| On a deck  | Action                                             |
| ---------- | -------------------------------------------------- |
| Drag       | Take the top card onto the table                   |
| Tap        | Select it (actions appear at the bottom)           |
| Double-tap | Flip the top card                                  |
| Long-press | Read the top card at full size                     |

Every card knows which deck it belongs to: the deck it last came out of (so an Enemy Card goes back to the Enemy
Deck), or else the deck of its type. **Drop a card (or a whole pile) anywhere on the sidebar and it goes back into its
own deck**; the deck lights up while you drag. It goes where the rules want it: sorted by number in Lost Pages,
X-Encounters, Regions and Terrain, under the Encounter Deck, on top of the others. Cards can't be dragged from one
deck to another.

Moves between decks that the rules ask for use **Put under…** on a card or pile on the table, then tap the deck. A
deck only accepts the cards it may hold:

| Deck           | Holds                                                             |
| -------------- | ----------------------------------------------------------------- |
| Encounter Deck | B- and X-Encounter Cards, the 'Time Passes' / 'Next Chapter' card |
| Quest Deck     | Quest Cards Y705–Y707                                             |
| Enemy Deck     | Y013 and the Enemy Cards Y800–Y849                                |
| Training Deck  | Y012 and the training cards Y749–Y799                             |
| Banned Cards   | any card (banished)                                               |
| other decks    | only their own cards                                              |

**Table**

| Gesture                   | Action                                                    |
| ------------------------- | --------------------------------------------------------- |
| Tap a card or pile        | Select it                                                 |
| Double-tap                | Flip the top card                                         |
| Long-press                | Read the card at full size (tap it to see the other side) |
| Drag a card               | Move it; dragging a pile takes its top card               |
| Drag the `⠿ 42` handle    | Move the whole pile                                       |
| Drop onto another pile    | Put it on top of that pile                                |
| One finger on the table   | Pan                                                       |
| Two fingers / mouse wheel | Zoom                                                      |

Pile and deck actions: **Draw** (top card face up onto the table), **Top → bottom** (after reading a Fate Number),
**Browse** (see below), **Shuffle**, **Sort** (by card number), **Put under…** (slide cards under another pile or a
deck, e.g. X-cards under the Encounter Deck), **Rotate**, **Front/Back** (overlap order, e.g. tucking the Alignment card under the Character card), **Return to
deck** and **Name**.

**📖 Rules** opens the rulebook beside the table (over it in portrait): the real pages, a contents list, search
(e.g. "fate number", "banish") and zoom. Drag its left edge to make it wider or narrower. It remembers the page you
were reading and its width. The **ⓘ** next to an area's name,
**📖 Rules** in the action bar of a selected deck or card, in the card viewer and in the Battle dialog open the rulebook
at the section that explains it. When a new rulebook version comes out, replace the PDF in `game-files/` and re-run
`scripts/split_rules.py`.

**🔍 Find card** searches every card by number or name ("Take card Y003 and resolve it") and can take it out of its deck.
**● Figures** adds the player marker and the character, ally and enemy figures.

**☰ Browse** opens a panel over the bottom half of the screen with the pile's cards, top card first. The table above
stays in use (pan, zoom, move cards) until you close the panel with ✕ or tap **Browse** again. Filter by number or
name, switch between **Fronts** and **Backs**, and swipe up and down to scroll.

| In the Browse panel | Action                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| Tap a card          | Select / unselect it (✓)                                                            |
| 🔍 or long-press    | Read it at full size                                                                |
| **Take out (n)**    | Put the selected cards face up on the table as one pile                             |
| Drag its `⠿` grip   | Put it (with the other selected cards, if it is selected) where you drop it: on the table or a pile, with the same area rules as any drop, or on the sidebar to send a table pile's cards back to their decks |

**⚔ Battle** builds the battlefield of a Conflict Card in its own framed area. Type the Terrain Cards row by row, adding
`v` to cards whose arrows point down and `-` for empty cells, e.g. `01 07v 15v` / `19 30 31`. Check the preview, then
_Lay out_: the cards are taken from the Terrain deck and placed edge to edge in the Battlefield area below the others,
with room for the Enemy Cards and their Hit Point Cards on the right. When the combat is over, tap
**↩ Return to deck** on the battlefield to put all Terrain Cards back into the Terrain deck in order.
