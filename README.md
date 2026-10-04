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
- The card art is copyrighted, so the deployed app asks for a 6-character access code (letters and digits, not
  case-sensitive) before it shows anything (`middleware.ts`). The code is not in the repository: set it once in the
  Vercel project under **Settings → Environment Variables** as `ACCESS_CODE` (Production), then deploy. Until it is
  set, the deployment answers "ACCESS_CODE is not set". Each device asks once, then remembers the code for a year;
  changing `ACCESS_CODE` and redeploying asks every device again. `npm run dev` has no code.

## 4. Commits and releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat(areas): …`,
`fix(save): …`); a hook in `.githooks/`, switched on by `npm install`, refuses others. Versions follow
[SemVer](https://semver.org) and every release is listed in [CHANGELOG.md](CHANGELOG.md). To release:

```bash
npm run release              # bump the version, add the commits since the last tag to CHANGELOG.md, commit, tag
git push --follow-tags origin main
```

Before 1.0, `feat` bumps the patch number and a breaking change (`feat!:`) the minor one; pick the bump yourself with
`npm run release -- --release-as minor` (or `patch`, `major`, `1.0.0`). Add `--dry-run` to preview.

## Controls

**Areas.** The table has a framed area for each part of the game (rulebook chapters 4 and 10). An area only takes
the cards that belong there; while you drag, it lights up green (allowed) or red (refused), as does the place the card
would go to — also for cards dragged in from the sidebar, the set-aside cards or the Browse panel — and a refused card
goes back where it came from. Space outside the areas takes any card. **📍 Areas** jumps to an area.

The Map, Encounter Bar, Character, Storage, Actions, Home and Battlefield areas are only as large as their places and
the cards lying in them: a card dropped on or overlapping one of their frames lies in that area (in the one it
overlaps most), and the frame grows around it — there is no limit.

The areas lie close together, a small gap apart, in rows: the Encounter Bar on top, growing right; below it the Map,
the Encounter Deck and the Storybook (taller, so it reaches up beside the bar, until the bar grows that far and it moves
down in line with the Map); below them Storage, Character and Actions, with the four deck areas two by two right of
Actions (Banned Cards and Enemy Deck above Quest and Training Deck); and Home below Storage and Character, with the
Battlefield right of it, below the areas it reaches under. A growing area pushes the areas right of it and below it away,
with everything lying in them (cards, places, figures), and Home and the battlefield move down below any area they
grow under. An area growing toward the one before it (Storage or Home growing left with their Goods, say) moves itself
instead. Pushed areas move back as the area pushing them shrinks. Undo puts everything back as it was.

**Rearranging the areas.** Drag the `⠿` tab in the top-right corner of an area to move the area, with
everything lying in it, wherever you like; the table shows where it will go while you drag. It snaps into line with the
edge of another area, or a gap beside it, when it comes close. Areas in its way are pushed aside to their nearest free
side and stay there. Loose cards it would cover move off to the right, past the areas (figures stay where they are). From then on each
area stays where you put it: a growing area still pushes the areas in its way aside, and they move back to their own
places as it shrinks. **📍 Areas → ↺ Reset layout** packs the areas together again in the rows above.

**⤢ Fit** zooms to the areas used every round: the Encounter Bar, Map, Encounter Deck, Storybook, Storage, Character,
Actions, Banned Cards and the Enemy Deck. While Terrain Cards lie on the Battlefield, it zooms to the combat instead:
Character, Actions, the Enemy Deck and the Battlefield. Tap it again to see the whole table (also **📍 Areas → ⤢ Whole
table**).

| Area          | Takes                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Map           | Region Cards edge to edge (see below), Encounter Cards on the Market Prices place beside each                           |
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
cards turn about their vertical one). The Map is laid out like the Battlefield, with any number of Region Cards: while
it is empty it shows one place for a Region Card. Once a card lies there, a narrow strip marked + runs along its top
and, in the first column, its right side: a Region Card dropped on a strip lies right beside that card, edge to edge,
as the rulebook lays a region entered beside the one left, the way its compass points (7.1.1). So the Map grows up
without limit, two columns wide at most. A Region Card dropped anywhere else in the Map goes to the nearest strip; one
at a time, and nothing else goes on top of a Region Card. Region Cards on the Map lie face up: one put there turns face
up, however it came, and can't be turned over (double-tap says so; **Flip** is not offered). A card on the Map moves to
another strip by dragging it there, and the area grows with its cards. A Region Card dropped outside the Map lies where
it is dropped, unless that is another area, which refuses it.

**Market Prices.** Beside each Region Card on the Map is a "Market Prices" place for the Encounter Card that sets that
region's goods prices (rulebook 7.1.2.5), on the side where the card's goods are printed: the regions lie two by two
side by side, odd numbers left and even right (as their compasses show), with their goods on the outer edges, so it
lies left of the cards in the first column and right of those in the second. It takes one Encounter Card, dropped on or near it, and nothing else. The card lies landscape and face up, slid
under the Region Card so that only its price strip shows, as in the rulebook: on the left it is turned a quarter right,
so its prices lie beside the goods printed on the Region Card's left edge; on the right it is turned the other way. A card dropped there face down turns face
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

**Encounter Deck.** The Encounter Deck lies on the table in its own area, right of the Map, with three
places: **Time Passes**, **Next Chapter** and **Used Cards**. The 'Time Passes' and 'Next Chapter' cards lie face down
(hourglass up) at the bottom of their places for good: they can't be dragged, taken out (Find, Browse) or put anywhere
else, and **Shuffle**, **Sort**, **Top → bottom**, **Turn pile over** and cards slid under the deck all leave them at the
bottom (double-tap still flips one over, to read it). A new game starts with the shuffled B-Encounter Cards on the
'Time Passes' card. The **⤮ Shuffle** button below each time card's place shuffles the cards lying on it (the time card
stays at the bottom). A pile on the table shuffled (with this button or **Shuffle** in the action bar) shows it: its
top cards split to both sides and slide back together. The deck works like the other table decks: drag it to take its top card; tap it for **Draw**,
**Shuffle** and the rest. Drag the `⠿` grip to move all its cards (but the time card) onto another place, e.g. onto
'Next Chapter' once 'Time Passes' comes up. Used cards go on the Used Cards place (on top, as dropped); its grip moves
the whole pile. The places' grips don't show how many cards lie on them. The places only take Encounter Cards: a card dropped anywhere in the area goes onto the place nearest
to where it is dropped; cards dropped on the deck go under it, just above the time card. Cards going back "under the
Encounter Deck" (a drop on the sidebar, **Return to deck**, **Put under…** on the deck) go under the deck wherever it
lies: on whichever of the two time cards has more cards on it.

**Character and Alignment Card places.** The Character area has a place for the Character Card at its top center and,
half under its left side, one for the Alignment Card (dashed outlines). Wherever you drop one of these cards on the
table — dragged from the sidebar, the table or the Browse panel, drawn, or taken out with Find/Browse — it lands on its place,
and no other card can be put there. The Alignment Card always lies under the Character Card, with only its left half
showing (**Rotate** it to show the value on its other end); both Alignment Cards dropped there form one pile. Other
cards may still overlap the edges of these places.

**Titles and Skills.** Above the Character Card lie the titles and skills received (rulebook 4.1), in one column:
first the titles, the first slid under the Character Card's top edge so that its bottom fifth shows, each further one
likewise under the one before; then the skills, the first slid under the last title (or under the Character Card while
there are none), each showing only its name banner. Above them all is one placeholder, split in two: drop a Y-card on
its left half ("Titles") to add it as the last title, on its right half ("Skills") to add it as the last skill. The cards
lie upside down, so that the strip printed upside down at their bottom reads the right way up; they can't be rotated
there. Titles always stay below the skills: a title dragged along the column is only reordered among the titles, a
skill among the skills (drop it on the other half of the placeholder to move it to the other group). Other cards are
refused. Any number of each: the area grows up with the column.

**Status Upgrades & Items.** Right of the Character Card lies a row of Status Upgrades, Conditions and equipped items
(rulebook 4.1, 4.7.5, 7.3.8), under a "Status Upgrades & Items" placeholder: the first slid under its right side, each
further one likewise under the one before. The cards lie face up and upside down, so that only the strip of status values
printed upside down along their left edge shows, the right way up (as in rulebook figure 18); a card put there face down
turns face up, and they can't be turned over or rotated there. It takes Y-cards and Encounter Cards: drop one on or near
the placeholder, or on the row, to add it there; other cards are refused on it. Any number of them: the area grows right
with the row.

**Quest Cards.** Below the Character Card lies a column of Quest Cards, under a "Quest Cards" placeholder: the first
slid under its bottom edge so that only its bottom quarter shows, each further one likewise under the one before. It
takes any Y-card (Lost Pages): drop one on or near the placeholder, or on the column, to add it there (where you drop
it, or at the end); other cards are refused on it. Any number of them: the area grows with the column.

**Storage Card place.** The Storage area has a place for the Storage Card at its top center. It takes any Y-card, since the
Storage Card is one of them: a Y-card dropped on or near it snaps onto it, and other cards are refused there. Unlike
the Character and Alignment Cards, Y-cards are not pulled there from elsewhere on the table.

**Broken Items.** Above the Storage Card lies a column of broken items (rulebook 4.7.4, 7.2.4), under a "Broken Items"
placeholder: the first slid under its top edge, each further one likewise under the one before. The cards lie face up
and upside down, so that only the item strip printed upside down at the bottom of an Encounter Card shows, the right way
up, with the item's name and repair costs (as in rulebook figure 16); a card put there face down turns face up, and they
can't be turned over or rotated there. It takes Encounter Cards and Y-cards (some items are printed on Y-cards): drop
one on or near the placeholder, or on the column, to add it there; other cards are refused on it. Any number of them:
the area grows up with the column.

**Items.** Right of the Storage Card lies a row of the whole items stowed in the bag (rulebook 4.7.4, 7.2.4): the first
slid under its right side, each further one likewise under the one before. The cards lie face up and upside down, so that
only the strip of status values printed upside down along their left edge shows, the right way up (as in rulebook
figure 16); a card put there face down turns face up, and they can't be turned over or rotated there. It takes Encounter
Cards and Y-cards, any number. The Money Cards lie beyond the items, and the two rows share one placeholder beyond them
both, split in two: drop a card on its upper half ("Items") to add it as the last item, before the Money Cards; on its
lower half ("Money Card") to add a Money Card. Once there are three Money Cards, the whole placeholder is for items. An
item dragged along the row is only reordered among the items, a Money Card among the Money Cards.

**Money Cards.** Beyond the items lies a row of up to three Money Cards (rulebook 4.3): the first slid half under the
last item (or under the right side of the Storage Card while there are none), each further one half under the one
before, so the amounts on their right halves show and add up to the character's money. Like the Alignment Card, a Money
Card dropped anywhere on the table joins the row: where you drop it when that is on the row, else at its end. A fourth
one is refused. Drag a card along the row to reorder it (the others make room while you drag); take one away and the
cards right of it close the gap. Each card lies on its own, so double-tap or **Rotate** it to show the amount you need.

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

**Actions.** Right of Character, the Actions area holds the Y-cards in your hand (Action Cards, rulebook 4.7.7),
their discard pile (rulebook 8.2.1.1.1) and the Damage Card (rulebook 4.7.9). Every card in the hand and the discard
pile lies turned 180°, so the strip printed upside down at the bottom of an Action Card reads the right way up at its
top; it can't be rotated there (**Rotate** is not offered). On the left is the **Hand**: a column of cards, each lying on the one
before, a little lower, so that the top 22% of every card under it shows. The cards in the hand lie face up: a card put there
face down turns face up, and they can't be turned over there; the discard pile's can. A Y-card dropped anywhere in the area goes at
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
Actions area, each in its own area on a placeholder that says which card builds it. The Quest Deck starts empty; the
Enemy Deck starts with the Enemy Card Y013, the Training Deck with the Training Card Y012 and Banned Cards with the
'Banned Cards' card Y011, face up, which lie on top of their decks for good (older saves get them there too, taken from wherever they lie): they can't be
dragged, drawn, taken out by Browse or **Find card**, and shuffling, sorting or turning the deck over leaves them on top.
Drop a card, or a whole pile, anywhere in one of these areas (from the table, the top of a sidebar deck or the Browse
panel) and it goes into that deck: face down on top of the Quest Deck, under the cards of the others, so Y013, Y012 and
Y011 stay on top. Cards go into the Enemy Deck as they lie, without being turned
over; into the Training Deck and Banned Cards face up. A deck only takes the cards it may hold (table below); others are
refused. Each works like a sidebar deck: drag it to take its top card, tap it for **Draw**, **Browse**, **Shuffle** and
the other deck actions, double-tap to flip its top card; it can't be moved, and it stays (as its placeholder) when its
last card is taken. The Enemy Deck, the Training Deck and Banned Cards have no **Draw**, and dragging them takes nothing:
take the cards under their top card out with **Browse**. The Training Deck has a **☰ Browse** button below it, for training (rulebook
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

**📖 Rules** opens the rulebook beside the table and the toolbar, from the top of the screen (over both in portrait): the
real pages, a contents list, search (e.g. "fate number", "banish"; in the panel's top bar, or on a row of its own below
it when the panel is too narrow) and zoom. Drag its left edge to make it wider or narrower — as far as almost the left edge of the screen, over the table and sidebar. It remembers the page you
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
name, switch between **Backs** and **Fronts** (it opens on the backs; cards dragged out land showing the side shown), and swipe up and down to scroll. Selected cards
move in their numbered order, card 1 on top; the pile they come from keeps its order. The actions for the selected
cards (or those picked at random) appear in a row of their own below the bar.

| In the Browse panel | Action                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| Tap a card          | Select / unselect it (✓; with several selected, numbered in the order you tapped them) |
| **Select all**      | Select all the shown cards (those the filter leaves), after any already selected, top first, so they keep the pile's order |
| **⚄ Random**        | Pick that many of the shown cards at random, unseen, in random order (by default all of them: shuffle them). Nothing marks them and the panel turns to the backs; drag them by the `⠿ n random cards` grip below the bar, or **Take out face down** / **Put under…**: they stay face down (**Take out face up** turns them face up). E.g. filter `Y705`, 2, **⚄ Random**, then drag them onto the Quest Deck (Y009). Tapping a card drops the random pick |
| 🔍 or long-press    | Read it at full size                                                                |
| **Take out face up** | Put the selected cards face up on the table as one pile (**Take out face down**: face down) |
| **Put under…**      | Then tap a pile, a deck or the storybook to slide the selected cards under it       |
| Drag `⠿ n cards`    | Put all the selected cards where you drop it, like dragging a selected card's grip |
| Drag its `⠿` grip   | Put it (with the other selected cards, if it is selected) where you drop it, showing the side the panel shows: on the table or a pile, with the same area rules as any drop, or on the sidebar to send a table pile's cards back to their decks |

**Battlefield.** The Battlefield area, right of Home, is where a combat's Terrain Cards (rulebook 4.8, 8.1.2) are laid
out, with room for the Enemy Cards and their Hit Point Cards on the right. Terrain Cards always lie landscape, like
Region Cards, and face up there: one put on the Battlefield turns face up, however it came, and can't be turned over; **↻ Turn around** turns one half a turn, so that its triangles point down instead of up (they can't be
rotated otherwise). While the Battlefield is empty it shows one place for a Terrain Card. Once a card lies there, a
narrow strip marked + runs along each of its sides: a Terrain Card dropped on a strip lies right beside that card, edge
to edge, and gets strips of its own on its free sides. A strip only shows where nothing lies yet (a card in the way
hides it; not the cards on the Enemy Card places, which move aside with the grid). A Terrain Card dropped anywhere else in the Battlefield goes to the nearest strip; one at
a time, and nothing else goes on top of a Terrain Card. A card on the battlefield moves to another strip by dragging it
there. The area grows with its cards in every direction.

**Enemy Cards and Hit Point Cards.** Right of the Terrain Cards are four Enemy Card places, two by two (at most four
enemies, one per Hit Point Card): each takes one Y-card, the Enemy Card picked out for the combat, face up (a card put
there face down turns face up). The places stay right of the Terrain Cards as the battlefield grows or shrinks, the
cards on them moving along. Once an Enemy Card
lies there, a Hit Point Card placeholder shows over its lower part, a little to the left, as in rulebook figure 80: the
Hit Point Card dropped there lies on the Enemy Card, its chain pointing at the unspent reaction. Drag it a little to the
right to mark the reaction as spent, back to the left in the Refresh Phase (rulebook figure 91), or right over the Enemy
Card once the enemy is defeated (rulebook 8.2.1.3). It can be rotated and turned over there to show the hit points left.
Each Enemy Card place and its Hit Point Card hold one card each: another one dropped there is refused.

**⚔ Battle** builds the battlefield of a Conflict Card for you. Type the Terrain Cards row by row, adding `v` to cards
whose arrows point down and `-` for empty cells, e.g. `01 07v 15v` / `19 30 31`. Check the preview, then _Lay out_: the
cards are taken from the Terrain deck and laid out edge to edge in the Battlefield area, from its first place. When the
combat is over, tap **↩ Return to deck** on the battlefield to put all Terrain Cards back into the Terrain deck in
order.
