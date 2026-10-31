import { describe, expect, it } from 'vitest';
import { deckStack } from '../decks';
import { readSave } from '../save';
import { realManifest, SAVES } from '../test/fixtures';
import type { Table } from '../types';
import { tableProblems } from '../validate';
import type { OldTable } from './table';

// The migrations of the saves from before version 3 are frozen: saves.test.ts loads the saves of each released version
// through them. These cover what those saves don't hold.

const manifest = realManifest();

const sources = import.meta.glob<string>('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The oldest save, bare as it was kept then, changed by `fn`, loaded as the app loads it. */
function loadChanged(fn: (t: OldTable) => void): Table {
  const t: OldTable = JSON.parse(SAVES['v0.1.0']);
  fn(t);
  const loaded = readSave(JSON.stringify(t), manifest);
  expect(tableProblems(loaded, manifest)).toEqual([]);
  return loaded;
}

/** Take a card out of a pile of the save. */
function takeOut(t: OldTable, pile: string, card: string) {
  const s = t.stacks[pile];
  s.cards = s.cards.filter((c) => c.id !== card);
}

const cardsIn = (t: Table, kind: Parameters<typeof deckStack>[1]) =>
  deckStack(t, kind)!.cards.map((c) => c.id);

describe('the migrations of saves from before version 3', () => {
  it("depend on nothing of the app's layout or actions, only on the cards, the decks and the table's shape", () => {
    for (const [file, text] of Object.entries(sources)) {
      if (file.endsWith('.test.ts')) continue;
      const from = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      const outside = from.filter(
        (path) =>
          !path.startsWith('./') &&
          !['../cards', '../decks', '../types'].includes(path),
      );
      expect(outside, file).toEqual([]);
    }
  });

  it('send the cards held in the removed hand back to their decks', () => {
    // Y001b, from the table, and an Encounter Card, from the Encounter Deck.
    const t = loadChanged((t) => {
      t.z = t.z.filter((id) => id !== 's18');
      delete t.stacks.s18;
      takeOut(t, 's1', '084');
      t.hand = [
        { id: '292', faceUp: true },
        { id: '084', faceUp: true },
      ];
    });
    expect('hand' in t).toBe(false);
    expect(cardsIn(t, 'lost-pages')).toContain('292');
    expect(cardsIn(t, 'encounter')).toContain('084');
  });

  it('put the cards of a deck the player made back where they belong', () => {
    const t = loadChanged((t) => {
      t.z = t.z.filter((id) => id !== 's24');
      t.stacks.s24 = { ...t.stacks.s24, label: 'Mine' };
      t.dock = [...t.dock!, 's24'];
    });
    expect(t.stacks.s24).toBeUndefined();
    // X01, sorted into the X-Encounters.
    expect(cardsIn(t, 'x-encounters').at(-1)).toBe('116');
  });

  it('lay the cards having a place of their own onto it, one pile', () => {
    const t = loadChanged((t) => {
      takeOut(t, 's9', '003');
      takeOut(t, 's9', '004');
      for (const [i, id] of ['003', '004'].entries()) {
        const pile = `a${i}`;
        t.stacks[pile] = {
          id: pile,
          x: 6000 + i * 400,
          y: 6000,
          rot: 0,
          cards: [{ id, faceUp: true }],
        };
        t.z.push(pile);
      }
    });
    const piles = t.z.filter((id) =>
      t.stacks[id].cards.some((c) => c.id === '003' || c.id === '004'),
    );
    expect(piles).toHaveLength(1);
    expect(t.stacks[piles[0]].at).toEqual({ spot: 'alignment', index: 0 });
    expect(t.stacks[piles[0]].cards.map((c) => c.id)).toEqual(['003', '004']);
  });

  it('move the storybook from the sidebar into its area, the storybook cards lying on the table revealed', () => {
    // Its top card (the Book Cover) lying on the table.
    const cover = '067';
    const t = loadChanged((t) => {
      const book = t.stacks.s15;
      expect(book.cards.at(-1)?.id).toBe(cover);
      t.stacks.s15 = {
        id: 's15',
        x: 0,
        y: 0,
        rot: 0,
        label: 'Storybook',
        cards: book.cards.slice(0, -1),
      };
      t.z = t.z.filter((id) => id !== 's15');
      t.dock = [...t.dock!, 's15'];
      t.stacks.s16 = {
        id: 's16',
        x: 6000,
        y: 6000,
        rot: 0,
        cards: [{ id: cover, faceUp: false }],
      };
    });
    const story = t.z
      .map((id) => t.stacks[id])
      .find((s) => s.slot === 'story')!;
    const revealed = t.z
      .map((id) => t.stacks[id])
      .find((s) => s.slot === 'story-revealed')!;
    expect(story.at).toEqual({ place: 'story' });
    expect(story.cards.every((c) => !c.faceUp)).toBe(true);
    expect(revealed.cards).toEqual([{ id: cover, faceUp: true }]);
  });
});
