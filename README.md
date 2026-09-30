# Grimm World — tablet table

A virtual table for playing the print-and-play solo game **Grimm World** on a tablet.

## 1. Split the card sheets

The card PDF (`game-files/GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf`) has 60 A4 sheets, each with 3 × 3 poker-size cards.
Odd pages are fronts; even pages are the backs, mirrored left ↔ right.

```bash
uv run scripts/split_cards.py      # ~1 min → public/cards/{lg,sm}/NNN-{front,back}.webp + cards.json
uv run scripts/index_cards.py      # optional, ~15 min: OCR card numbers (Y003, B23, …) and card types
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
| Map           | Region Cards, Encounter Cards (goods prices), Y-Cards (e.g. Save Card Location)                                          |
| Encounter Bar | Y-Cards                                                                                                                  |
| Character     | Character Card, Alignment Cards, Y-Cards (titles, skills, quests, status upgrades, Damage Card), Encounter Cards (items) |
| Storage       | Storage Card and other Y-Cards, Encounter Cards (items, goods), Money Cards                                              |
| Storybook     | the storybook itself (see below)                                                                                         |
| Home          | Y-Cards (house and extensions), Encounter Cards (stored items and goods)                                                 |
| Battlefield   | Terrain Cards, Hit Point Cards, Y-Cards (enemies)                                                                        |

Region, Character, Alignment, Money, Storybook, Terrain and Hit Point cards only fit in their own area.

**Storybook area.** The storybook lies face down on the right; the revealed cards lie on the left, the top one being
the current chapter. Tap the storybook to turn over its next card; tap the revealed cards to put the top one back on
the storybook, face down. The storybook can't be looked through, sorted or moved; long-press the revealed card to read
it. A revealed Y-card (sub-chapter card) can be dragged out, e.g. to the Encounter Bar. To put Y-cards "into the
corresponding chapter", use **Put under…** on them, tap the storybook and pick the chapter: they go directly under that
Chapter Card.

**🂠 Decks sidebar (left).** The other 14 decks of the game, sorted as in the rulebook (chapter 6.1); the table starts
empty apart from the storybook. The Quest, Enemy and Training Decks and the Banned Cards pile start empty: the
campaign start builds them (cards Y003 and Y009), and each empty deck says which card fills it. The title card is
left out; it isn't needed to play.

| On a deck  | Action                                             |
| ---------- | -------------------------------------------------- |
| Drag       | Take the top card onto the table or into your hand |
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
**Browse** (look through, take out, move to top/bottom, or pick cards to form a new pile), **Shuffle**, **Sort** (by card
number), **Put under…** (slide cards under another pile or a deck, e.g. X-cards under the Encounter Deck), **All to hand**,
**Rotate**, **Front/Back** (overlap order, e.g. tucking the Alignment card under the Character card), **Return to
deck** and **Name**.

**🔍 Find card** searches every card by number or name ("Take card Y003 and resolve it") and can take it out of its deck.
**● Figures** adds the player marker and the character, ally and enemy figures.

**✋ Hand** shows a tray for your Action Cards. Drag cards onto the tray to take them into your hand, and drag them back
up to play them onto the table, a pile or a deck. Swipe sideways to scroll the tray, tap a card to read it.

**⚔ Battle** builds the battlefield of a Conflict Card in its own framed area. Type the Terrain Cards row by row, adding
`v` to cards whose arrows point down and `-` for empty cells, e.g. `01 07v 15v` / `19 30 31`. Check the preview, then
_Lay out_: the cards are taken from the Terrain deck and placed edge to edge in the Battlefield area below the others,
with room for the Enemy Cards and their Hit Point Cards on the right. When the combat is over, tap
**↩ Return to deck** on the battlefield to put all Terrain Cards back into the Terrain deck in order.
