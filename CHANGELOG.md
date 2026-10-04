# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.5.0](https://github.com/camilosw/grimm-world-app/compare/v0.4.0...v0.5.0) (2026-10-04)


### Features

* **deploy:** ask for an access code before showing the deployed app ([f4a4d96](https://github.com/camilosw/grimm-world-app/commit/f4a4d96))

## [0.4.0](https://github.com/camilosw/grimm-world-app/compare/v0.3.0...v0.4.0) (2026-10-03)


### Features

* **areas:** give the Encounter Deck its own table area with the Time Passes and Next Chapter cards pinned at the bottom of their places, a Used Cards place, Shuffle buttons and an animated shuffle ([4b5ce84](https://github.com/camilosw/grimm-world-app/commit/4b5ce84))
* **areas:** add the Actions area with the hand, the discard pile and the Damage Card ([395f876](https://github.com/camilosw/grimm-world-app/commit/395f876))
* **areas:** add a Quest Cards column under the Character Card ([2cbdf31](https://github.com/camilosw/grimm-world-app/commit/2cbdf31))
* **areas:** add Titles and Skills places above the Character Card ([72289f6](https://github.com/camilosw/grimm-world-app/commit/72289f6))
* **areas:** add a Broken Items place above the Storage Card ([93ad09d](https://github.com/camilosw/grimm-world-app/commit/93ad09d))
* **areas:** add a Status Upgrades & Items place right of the Character Card ([fbe44b3](https://github.com/camilosw/grimm-world-app/commit/fbe44b3))
* **areas:** add a Stowed Items place before the Money Cards ([2470b43](https://github.com/camilosw/grimm-world-app/commit/2470b43))
* **areas:** lay the areas out in rows for a landscape screen; Fit frames the areas used every round, pressed again the whole table ([661a059](https://github.com/camilosw/grimm-world-app/commit/661a059))
* **areas:** reduce the space between areas to a third ([e77c325](https://github.com/camilosw/grimm-world-app/commit/e77c325))
* **battlefield:** make the Battlefield a permanent area, built up card by card on a grid of Terrain Cards; Fit frames the combat while it is in use ([a9a57ad](https://github.com/camilosw/grimm-world-app/commit/a9a57ad))
* **battlefield:** add Enemy Card and Hit Point Card places right of the Terrain Cards ([b690ab2](https://github.com/camilosw/grimm-world-app/commit/b690ab2))
* **browse:** pick cards at random, unseen, and move selected cards in the order they were selected ([0d645c1](https://github.com/camilosw/grimm-world-app/commit/0d645c1))
* **browse:** add Select all, with a row of group actions for the selected cards ([f43f927](https://github.com/camilosw/grimm-world-app/commit/f43f927))
* **browse:** drop cards dragged out of the panel showing the side the panel shows ([fd3d6f1](https://github.com/camilosw/grimm-world-app/commit/fd3d6f1))
* **decks:** keep Y012 and Y011 on top of their decks, and add a Browse button below the Training Deck ([5a41d8b](https://github.com/camilosw/grimm-world-app/commit/5a41d8b))
* **decks:** keep the Enemy Card Y013 on top of the Enemy Deck for good ([5c240fe](https://github.com/camilosw/grimm-world-app/commit/5c240fe))
* **decks:** put cards into the Quest Deck face down ([1a46324](https://github.com/camilosw/grimm-world-app/commit/1a46324))
* **decks:** put cards into the Enemy Deck as they lie, without turning them over ([15316a8](https://github.com/camilosw/grimm-world-app/commit/15316a8))
* **encounter-bar:** let the Encounter Bar take several Y-cards at once ([daf1d54](https://github.com/camilosw/grimm-world-app/commit/daf1d54))
* **figures:** make the Player marker smaller and let figures lie on any area or place ([0042ca2](https://github.com/camilosw/grimm-world-app/commit/0042ca2))
* **rules:** put the rules search in the panel's top bar and the panel beside the toolbar ([160284f](https://github.com/camilosw/grimm-world-app/commit/160284f))
* **search:** search cards by several comma-separated terms ([ee142d2](https://github.com/camilosw/grimm-world-app/commit/ee142d2))
* **sidebar:** lay the Terrain deck landscape in the sidebar like the Regions deck ([1e7fd83](https://github.com/camilosw/grimm-world-app/commit/1e7fd83))
* **tray:** add a right sidebar for setting cards aside ([7c08b4a](https://github.com/camilosw/grimm-world-app/commit/7c08b4a))
* light up the area and place cards dragged in from the sidebar, the set-aside cards or the Browse panel would go to ([2470b43](https://github.com/camilosw/grimm-world-app/commit/2470b43))


### Bug Fixes

* **decks:** let cards from the Quest, Enemy, Training Deck and Banned Cards go back to the sidebar instead of being refused as a deck-to-deck move ([003ce7a](https://github.com/camilosw/grimm-world-app/commit/003ce7a))
* **encounter-bar:** keep a long spread row in the bar's area, and stop the drag preview crashing on spread cards ([daf1d54](https://github.com/camilosw/grimm-world-app/commit/daf1d54))
* **save:** load old saves with a 'time' sidebar deck again ([b534a10](https://github.com/camilosw/grimm-world-app/commit/b534a10))
* **scripts:** read card number suffixes past d and fix the misread Lost Pages codes ([3864bcf](https://github.com/camilosw/grimm-world-app/commit/3864bcf))
* **search:** stop matching card searches against the internal card id ([260040b](https://github.com/camilosw/grimm-world-app/commit/260040b))

## [0.3.0](https://github.com/camilosw/grimm-world-app/compare/v0.2.0...v0.3.0) (2026-10-02)


### Features

* **areas:** fit areas to their cards and let growing areas push their neighbours ([7baa45a](https://github.com/camilosw/grimm-world-app/commit/7baa45a))
* **areas:** give the Quest, Enemy and Training Decks and Banned Cards their own table areas ([c1bd0a2](https://github.com/camilosw/grimm-world-app/commit/c1bd0a2))
* **areas:** lay the areas out close together in three rows ([9b0592e](https://github.com/camilosw/grimm-world-app/commit/9b0592e))
* **areas:** let the player drag the areas by a grip to rearrange them, with Areas → Reset layout ([afcfca4](https://github.com/camilosw/grimm-world-app/commit/afcfca4), [cbc3cf6](https://github.com/camilosw/grimm-world-app/commit/cbc3cf6), [e3eb41c](https://github.com/camilosw/grimm-world-app/commit/e3eb41c))
* **encounter-bar:** lay out the Encounter Bar as a row of face-down landscape Y-cards ([41b6915](https://github.com/camilosw/grimm-world-app/commit/41b6915))
* **encounter-bar:** add a second placeholder after the last card, for adding at the end ([62617ce](https://github.com/camilosw/grimm-world-app/commit/62617ce))
* **storybook:** put cards into storybook chapters by dropping them on the storybook (chapter picker), and send a revealed sub-chapter card into the Encounter Bar ([fc1a219](https://github.com/camilosw/grimm-world-app/commit/fc1a219))
* **rules:** add the six rule booklets to the rules panel, read as facing pages or one page below the other, and include them in the search ([d298e73](https://github.com/camilosw/grimm-world-app/commit/d298e73))
* **rules:** let the rules panel be widened over the table almost to the left edge ([392b017](https://github.com/camilosw/grimm-world-app/commit/392b017))
* **pwa:** make the app an installable, offline-capable PWA ([41c02ff](https://github.com/camilosw/grimm-world-app/commit/41c02ff))
* **deploy:** add a Vercel deploy script and README steps ([d019f9b](https://github.com/camilosw/grimm-world-app/commit/d019f9b))


### Bug Fixes

* **save:** stop an old-save migration from misfiring on reload ([41b6915](https://github.com/camilosw/grimm-world-app/commit/41b6915))

## [0.2.0](https://github.com/camilosw/grimm-world-app/compare/v0.1.0...v0.2.0) (2026-10-01)


### Features

* **rules:** add an in-app rulebook panel with contents, search and contextual help links ([6235de0](https://github.com/camilosw/grimm-world-app/commit/6235de0))
* **areas:** add reserved card places for the Character, Alignment, Storage and Money Cards ([599a13c](https://github.com/camilosw/grimm-world-app/commit/599a13c))
* **areas:** add Goods rows left of and below the Storage Card ([da9e8da](https://github.com/camilosw/grimm-world-app/commit/da9e8da))
* **areas:** add an Encounter Card place below the revealed storybook cards ([eea309b](https://github.com/camilosw/grimm-world-app/commit/eea309b))
* **areas:** show Region Cards landscape, give the Map four Region Card places, and animate turning cards over ([6d6d716](https://github.com/camilosw/grimm-world-app/commit/6d6d716))
* **areas:** add Market Prices places beside the Region Cards ([d63923c](https://github.com/camilosw/grimm-world-app/commit/d63923c))
* **areas:** add House, House Extension, Goods and Equipment places to the Home area ([ebf7186](https://github.com/camilosw/grimm-world-app/commit/ebf7186))
* **browse:** replace the hand with a non-modal Browse panel ([7658d12](https://github.com/camilosw/grimm-world-app/commit/7658d12))

## 0.1.0 (2026-09-30)


### Features

* first version of the tablet table: the card sheets split into card images and indexed by OCR, sidebar decks set up as in the rulebook, a pannable and zoomable table with framed areas, drag-and-drop with deck rules, the storybook, pile actions, Find card, figures, a hand, the battlefield builder, undo/redo and autosave ([45ba9e2](https://github.com/camilosw/grimm-world-app/commit/45ba9e2))
