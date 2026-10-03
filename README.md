# Grimm World — tablet table

A virtual table for playing the print-and-play solo game **Grimm World** on a tablet.

## 1. Split the card sheets

The card PDF (`game-files/GrimmWorld_ENG_BaseGame_9_Cards_A4.pdf`) has 60 A4 sheets, each with 3 × 3 poker-size cards.
Odd pages are fronts; even pages are the backs, mirrored left ↔ right.

```bash
uv run scripts/split_cards.py      # ~1 min → public/cards/{lg,sm}/NNN-{front,back}.webp + cards.json
uv run scripts/index_cards.py      # optional, ~15 min: OCR card numbers (Y003, B23, …) and card types
uv run scripts/split_rules.py      # ~15 s: rulebook pages → public/rules/ (page images, search text, contents)
uv run scripts/split_booklets.py   # ~1 min: rule booklets → public/booklets/ (page images, OCR search text)
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

On the tablet, use _Add to Home Screen_ (or _Install_) for a full-screen app. The table saves automatically in the browser.
Once deployed (`npm run build` / step 3; the service worker is off in `npm run dev`), the app works offline: its files, card
images and rules pages are cached as you use them, so open what you need once while online. When you deploy a new
version, it shows up on the next online launch. Bump `CACHE` in `public/sw.js` to drop cached files that changed
under the same name. Icons: `uv run scripts/make_icons.py`.
Use **☰ → Export save** to keep a copy.

## 3. Deploy to Vercel

`public/cards/`, `public/rules/` and `public/booklets/` are generated and not in Git, so a deploy triggered by a
GitHub push would be missing them. Instead, build on your PC (where the images exist) and upload the result with the
Vercel CLI:

```bash
npm i -g vercel
vercel login
vercel link        # once: pick or create the project, don't connect the GitHub repo
npm run deploy     # vercel build --prod && vercel deploy --prebuilt --prod
```

- Run the scripts from step 1 first, so `public/` is complete before `npm run deploy`.
- If the project is connected to GitHub, turn off Git deployments in the project settings.
- If Vercel doesn't detect Vite, set the build command to `npm run build` and the output directory to `dist`.
- The card art is copyrighted: the deployed URL is public unless you enable deployment protection.

## Controls

**Areas.** The table has a framed area for each part of the game (rulebook chapters 4 and 10). An area only takes
the cards that belong there; while you drag, it lights up green (allowed) or red (refused), and a refused card goes
back where it came from. Space outside the areas takes any card. **📍 Areas** jumps to an area.

The Map area is just large enough for its places. The Encounter Bar, Character, Storage, Actions and Home areas are only as large
as their places and the cards lying in them: a card dropped on or overlapping one of their frames lies in that area (in the one it
overlaps most), and the frame grows around it — there is no limit.

The areas lie close together, a small gap apart, in three rows: the Map with the Encounter Bar and the Encounter Deck
right of it (the Encounter Deck area moves right as the bar grows); below them
Character, Storage, the Storybook and the four deck areas, two by two (Quest and Enemy Deck above Training Deck and Banned
Cards), then Actions; and Home below Character and Storage. The battlefield goes below them all. A growing area pushes the areas right
of it and below it away, with everything lying in them (cards, places, figures), and Home moves down below any area it
grows under. An area growing toward the one before it (Storage or Home growing left with their Goods, say) moves itself
instead. Pushed areas move back as the area pushing them shrinks. Undo puts everything back as it was.

**Rearranging the areas.** Drag the `⠿` tab in the top-right corner of an area (the battlefield's too) to move the area, with
everything lying in it, wherever you like; the table shows where it will go while you drag. It snaps into line with the
edge of another area, or a gap beside it, when it comes close. Areas in its way are pushed aside to their nearest free
side and stay there. Loose cards it would cover move off to the right, past the areas (figures stay where they are). From then on each
area stays where you put it: a growing area still pushes the areas in its way aside, and they move back to their own
places as it shrinks. **📍 Areas → ↺ Reset layout** packs the areas together again in the three rows above.

| Area          | Takes                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Map           | Region Cards on its four Region Card places, Encounter Cards on the four Market Prices places beside them                |
| Encounter Bar | Y-Cards, in a row (see below)                                                                                             |
| Character     | Character Card, Alignment Cards, Y-Cards (titles, skills, quests, status upgrades, Damage Card), Encounter Cards (items) |
| Storage       | Storage Card and other Y-Cards, Encounter Cards (items, goods), Money Cards                                              |
| Storybook     | the storybook itself, one Encounter Card (see below)                                                                     |
| Home          | Y-Cards (House Card and extensions, on their places), Encounter Cards (stored items and goods)                           |
| Quest Deck    | the Quest Deck: Quest Cards Y705–Y707 (see below)                                                                        |
| Enemy Deck    | the Enemy Deck: Y013 and the Enemy Cards Y800–Y849                                                                       |
| Training Deck | the Training Deck: Y012 and the training cards Y749–Y799                                                                 |
| Banned Cards  | the Banned Cards pile: Y011 and any banished card                                                                        |
| Actions       | Y-Cards, upside down: the hand (a column), the discard pile and the Damage Card (see below)                              |
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

**Encounter Bar.** The Y-cards placed in the Encounter Bar (rulebook 5.2) lie in a row, landscape and face down, as in
the rulebook's figure 29: each card lies over the one right of it, leaving just the strip on the right of its back (card
number, location, chapter) showing. A Y-card dropped anywhere in the area goes first in the row, on top of the
others, which slide right; the placeholder always stays left of the cards, partly under the first one. Once the bar has
cards, a second placeholder shows right of the last one, partly under it: a Y-card dropped there (or anywhere in line to
the right of the row) goes last. Dropped on the row itself, it goes where you drop it. Several Y-cards at once (a pile dragged by its `⠿` grip, or cards selected in **Browse**) are spread out in the row at that place, one card per place, the pile's top card first, still on top. The bar takes Y-cards and nothing else, any number of them: it grows to the right. A card there
can't be flipped or rotated (long-press it and tap **Other side** to read it); dragged out, it is an ordinary upright
card again. Reordering and taking cards away work as for Money Cards (below).

**Encounter Deck.** The Encounter Deck lies on the table in its own area, right of the Encounter Bar, with three
places: **Time Passes**, **Next Chapter** and **Used Cards**. The 'Time Passes' and 'Next Chapter' cards lie face down
(hourglass up) at the bottom of their places for good: they can't be dragged, taken out (Find, Browse) or put anywhere
else, and **Shuffle**, **Sort**, **Top → bottom**, **Turn pile over** and cards slid under the deck all leave them at the
bottom (double-tap still flips one over, to read it). A new game starts with the shuffled B-Encounter Cards on the
'Time Passes' card. The **⤮ Shuffle** button below each time card's place shuffles the cards lying on it (the time card
stays at the bottom). A pile on the table shuffled (with this button or **Shuffle** in the action bar) shows it: its
top cards split to both sides and slide back together. The deck works like the other table decks: drag it to take its top card; tap it for **Draw**,
**Shuffle** and the rest. Drag the `⠿` grip to move all its cards (but the time card) onto another place, e.g. onto
'Next Chapter' once 'Time Passes' comes up. Used cards go on the Used Cards place (on top, as dropped); its grip moves
the whole pile. The places only take Encounter Cards: a card dropped anywhere in the area goes onto the place nearest
to where it is dropped; cards dropped on the deck go under it, just above the time card. Cards going back "under the
Encounter Deck" (a drop on the sidebar, **Return to deck**, **Put under…** on the deck) go under the deck wherever it
lies: on whichever of the two time cards has more cards on it.

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
no limit: the Storage area grows with the rows. Unlike Money Cards, Encounter Cards are not pulled into a row from elsewhere on the
table. Reordering and taking cards away work as for Money Cards. Money Cards and Goods go into their rows one card at a
time; a whole pile dropped there is refused.

**Home.** The middle of the Home area is a place for the House Card (Y730), with "House Extension" places for the
Y-cards of its extensions around it (rulebook 10: the house card is on top, the extensions underneath). Left and right
of it, up to two extensions each: the first slid half under the House Card, the second half under the first. Above it,
one extension with only its top part showing; below it, one with only its bottom part showing. Each place takes Y-cards
dropped on or near it, one at a time, and nothing else; reordering and taking cards away work as for Money Cards.

Left of the extensions is a row of up to 16 Goods, right of them a row of up to 4 Equipment cards (Encounter Cards). The
first card of each row is slid under the outer extension, each further one under the one before: Goods show their left
third, as in the Storage area, Equipment only a narrow strip. The Home area grows to the left as Goods are added and to
the right as Equipment is added, always leaving room for the next card; since the area keeps its left edge in line with
the Character area, the House Card moves right as Goods are added. A 17th Goods card or a 5th Equipment card is refused.

**Actions.** Right of the deck areas, the Actions area holds the Y-cards in your hand (Action Cards, rulebook 4.7.7),
their discard pile (rulebook 8.2.1.1.1) and the Damage Card (rulebook 4.7.9). Every card in the hand and the discard
pile lies turned 180°, so the strip printed upside down at the bottom of an Action Card reads the right way up at its
top; it can't be rotated there (**Rotate** is not offered), but it can be flipped. On the left is the **Hand**: a column of cards, each lying on the one
before, a little lower, so that the top 22% of every card under it shows. A Y-card dropped anywhere in the area goes at
the end of the column, on top; dropped on the column itself, it goes where you drop it. Any number of them: the area
grows down. On the right is the **Discard** place: a Y-card or a pile of them dropped on or near it goes onto the pile
there. Below it lies the **Damage Card** (Y010), upright, for good: a new game starts with it there (older saves get it
there too, taken from wherever it was), and it can't be dragged, drawn, taken out (Find, Browse), returned to its deck
or rotated. Cards dropped on it go under it, as the Action Cards discarded as damage do, so they aren't mixed up with
the played ones; **Shuffle**, **Sort** and **Turn pile over** leave it on top. To take the cards under it back, drag
its `⠿` grip (all of them, e.g. onto the hand or the discard pile), drag them out of **Browse**, or use **Return to
deck**, **Put under…**: the Damage Card always stays. A pile dropped on the hand (say the cards under the Damage Card, dragged by its grip, or the discard pile) is spread
out in the column, one card per place, in its order. The area takes nothing but Y-cards. Reordering and taking cards away work as for Money Cards. Dragged out of the area, a
card keeps lying upside down until you rotate it.

**Storybook area.** The storybook lies face down on the right; the revealed cards lie on the left, the top one being
the current chapter. Tap the storybook to turn over its next card; tap the revealed cards to put the top one back on
the storybook, face down. A sub-chapter card (Y-card) on top of the storybook isn't turned over: a tap puts it unseen
into the Encounter Bar, first in the row, so keep tapping until the next Chapter Card comes up (rulebook 9.1.2). The storybook can't be looked through, sorted or moved; long-press the revealed card to read
it. A revealed Y-card (sub-chapter card) can be dragged out, e.g. to the Encounter Bar. To put Y-cards "into the
corresponding chapter", drop them on the face-down storybook (from the table, the Browse panel, the top of a deck, or
the revealed cards), or use **Put under…** on them and tap the storybook. A dialog shows the backs of the cards, where
the white book symbol gives their chapter, and asks under which Storybook Card they go: Chapter 1–14 or the Epilogue.
They go face down directly under that card; chapters already turned over can't be picked, and under the current
chapter (marked "now") they go on top of the storybook and come up next. All the cards of one drop go under the same
card, so drop the cards of each chapter together (e.g. select them in the Browse panel).

**Storybook Encounter Card.** Below the revealed cards is a place for one Encounter Card, lying on top of the bottom
edge of the current chapter (about a tenth of it). An Encounter Card dropped anywhere in the Storybook area lands on
that place; a second one, a pile, or any other card is refused there.

**Quest, Enemy and Training Deck, Banned Cards.** The decks built during play (cards Y003 and Y009) lie right of the
Storybook area, each in its own area on a placeholder that says which card builds it. The Quest and Enemy Deck start
empty; the Training Deck starts with the Training Card Y012 and Banned Cards with the 'Banned Cards' card Y011, face up,
which lie on top of their decks for good (older saves get them there too, taken from wherever they lie): they can't be
dragged, drawn, taken out by Browse or **Find card**, and shuffling, sorting or turning the deck over leaves them on top.
Drop a card, or a whole pile, anywhere in one of these areas (from the table, the top of a sidebar deck or the Browse
panel) and it goes into that deck: face down on top of the Quest Deck, face up under the cards of the others, so the Enemy Card
Y013, put there first, and Y012 and Y011 stay on top. A deck only takes the cards it may hold (table below); others are
refused. Each works like a sidebar deck: drag it to take its top card, tap it for **Draw**, **Browse**, **Shuffle** and
the other deck actions, double-tap to flip its top card; it can't be moved, and it stays (as its placeholder) when its
last card is taken. The Training Deck and Banned Cards have no **Draw**, and dragging them takes nothing: take the cards
under their top card out with **Browse**. The Training Deck has a **☰ Browse** button below it, for training (rulebook
7.1.2.3.3.2: look through all its cards and buy the ones you pay for); it opens the Browse panel on the deck (tap it
again to close it) and stays disabled while Y012 lies there alone. Cards taken out remember it, so **Return to deck** (or a drop on the sidebar)
puts a Quest, Enemy or training card back into its deck; banished cards go back to their own decks. A card dragged
from one of these decks (or out of its Browse panel) onto the sidebar goes back to the deck it came from: Lost Pages for
the Y-cards, its own deck for a banished card.

**🂠 Decks sidebar (left).** The other 8 decks of the game, sorted as in the rulebook (chapter 6.1); the table starts
empty apart from the storybook, the Encounter Deck and the four decks in their areas. The title card is left out; it
isn't needed to play.

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
deck to another, except from the four decks built during play back to the sidebar (above).

Moves between decks that the rules ask for use **Put under…** on a card or pile on the table, or on the cards selected
in the Browse panel, then tap the deck (in the sidebar or on the table). A deck only accepts the cards it may hold:

| Deck           | Holds                                                             |
| -------------- | ----------------------------------------------------------------- |
| Encounter Deck | B- and X-Encounter Cards                                          |
| Quest Deck     | Quest Cards Y705–Y707                                             |
| Enemy Deck     | Y013 and the Enemy Cards Y800–Y849                                |
| Training Deck  | Y012 and the training cards Y749–Y799                             |
| Banned Cards   | any card (banished)                                               |
| other decks    | only their own cards                                              |

**Set aside (right sidebar).** A place to keep cards at hand while you move about the table, e.g. the setup cards.
It is hidden while empty: drag a card (from the table, a sidebar deck or the Browse panel) to the right edge of the
table and it opens; drop the card there. A whole pile dragged by its `⠿` grip goes in as one pile. The cards lie one
below the other, upright, each as wide as the sidebar: drag its left edge to make it wider or narrower (it remembers
the width). Dropped on a card already there, a card goes before it (on its upper half) or after it (lower half), so
you can also reorder them. **›** minimizes it to a narrow bar showing how many cards are set aside; cards can still be
dropped on the bar, and a tap opens it again. To take a card out, drag it onto the table (where the same area rules
apply as for any drop), onto the left sidebar (back to its deck) or onto the storybook; or tap it and use **⤴ To
table**. Tap selects a card (for **Flip**, **Browse**, **Put under…**, **Return to deck**…), double-tap flips it,
long-press reads it. When the last card leaves, the sidebar hides again. **Find card** finds cards set aside too.

**Table**

| Gesture                   | Action                                                    |
| ------------------------- | --------------------------------------------------------- |
| Tap a card or pile        | Select it                                                 |
| Double-tap                | Flip the top card                                         |
| Long-press                | Read the card at full size (tap it to see the other side) |
| Drag a card               | Move it; dragging a pile takes its top card               |
| Drag the `⠿ 42` handle    | Move the whole pile                                       |
| Drag an area's `⠿` grip   | Move the area with everything in it                       |
| Drop onto another pile    | Put it on top of that pile                                |
| One finger on the table   | Pan                                                       |
| Two fingers / mouse wheel | Zoom                                                      |

Pile and deck actions: **Draw** (top card face up onto the table), **Top → bottom** (after reading a Fate Number),
**Browse** (see below), **Shuffle**, **Sort** (by card number), **Put under…** (slide cards under another pile or a
deck, e.g. X-cards under the Encounter Deck), **Rotate**, **Front/Back** (overlap order, e.g. tucking the Alignment card under the Character card), **Return to
deck** and **Name**.

**📖 Rules** opens the rulebook beside the table (over it in portrait): the real pages, a contents list, search
(e.g. "fate number", "banish") and zoom. Drag its left edge to make it wider or narrower — as far as almost the left edge of the screen, over the table and sidebar. It remembers the page you
were reading and its width. The **ⓘ** next to an area's name,
**📖 Rules** in the action bar of a selected deck or card, in the card viewer and in the Battle dialog open the rulebook
at the section that explains it. **Booklets** at the top of the panel switches to the six rule booklets
(`game-files/GrimmWorld_ENG_RuleBooklets_A4.pdf`, "The Encyclopedia"): tap a cover to open it. Two reading modes,
switched with the buttons at the top: **📖 Two pages** — the booklet lies open with facing pages, as printed, and you
turn the pages like a book: tap the right side (or swipe left, or press →) for the next page, the left side for the
previous one, or use ‹ › below; **📄 One page** — the pages lie one below the other across the whole width of the panel,
and you scroll through them like the rulebook. **☰ Shelf** (or tapping **Booklets** again) goes back to the covers, and
from there back to the booklet you were reading; **☰ Contents** belongs to the rulebook only. The panel remembers the
booklet, the page and the reading mode. The search
also finds text in the booklets (read by OCR, so a word may now and then be missed). When a new rulebook version comes out, replace the PDF in `game-files/` and re-run
`scripts/split_rules.py`.

**🔍 Find card** searches every card by number or name ("Take card Y003 and resolve it") and can take it out of its deck.
A search finds every card with that text anywhere in its number or name, and several searches can be separated by commas:
"44, 41" finds Y044, Y344, Y441, Y041, B41… The Browse panel's filter works the same way.
**● Figures** adds the player marker (a small cube) and the character, ally and enemy figures. A figure belongs to no
area or place: it goes in the middle of the screen, on top of whatever lies there (an area, a placeholder, a card),
beside any figure already there, and can be dragged anywhere. A figure lying in an area moves with it.

**☰ Browse** opens a panel over the bottom half of the screen with the pile's cards, top card first. The table above
stays in use (pan, zoom, move cards) until you close the panel with ✕ or tap **Browse** again. Filter by number or
name, switch between **Fronts** and **Backs**, and swipe up and down to scroll.

| In the Browse panel | Action                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| Tap a card          | Select / unselect it (✓)                                                            |
| 🔍 or long-press    | Read it at full size                                                                |
| **Take out (n)**    | Put the selected cards face up on the table as one pile                             |
| **Put under…**      | Then tap a pile, a deck or the storybook to slide the selected cards under it       |
| Drag its `⠿` grip   | Put it (with the other selected cards, if it is selected) where you drop it: on the table or a pile, with the same area rules as any drop, or on the sidebar to send a table pile's cards back to their decks |

**⚔ Battle** builds the battlefield of a Conflict Card in its own framed area. Type the Terrain Cards row by row, adding
`v` to cards whose arrows point down and `-` for empty cells, e.g. `01 07v 15v` / `19 30 31`. Check the preview, then
_Lay out_: the cards are taken from the Terrain deck and placed edge to edge in the Battlefield area below the others,
with room for the Enemy Cards and their Hit Point Cards on the right. When the combat is over, tap
**↩ Return to deck** on the battlefield to put all Terrain Cards back into the Terrain deck in order.
