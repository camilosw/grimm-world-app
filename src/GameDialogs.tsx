// Grimm World's own dialogs: About, and the chapter picker for the storybook (built on the dialogs of src/lib/ui/).

import { cardImage } from './cards';
import type { CardDef } from './lib/engine/types';
import { Modal, Thumb } from './lib/ui/dialogs';

/** Who made the game, and which version of the app this is. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About" onClose={onClose}>
      <div className="about">
        <img
          src={cardImage('001', true, 'sm')}
          alt="Grimm World"
          draggable={false}
        />
        <div>
          <h3>Grimm World</h3>
          <p>
            A solo print-and-play card game by <strong>Raoul Schaupp</strong>.
          </p>
          <p>
            <a
              href="https://raoulschaupp.itch.io/grimm-world"
              target="_blank"
              rel="noopener noreferrer"
            >
              raoulschaupp.itch.io/grimm-world ↗
            </a>
          </p>
          <p className="muted small">
            An unofficial companion app for playing the game on a phone, tablet
            or computer.
            <br />
            <a
              href="https://github.com/camilosw/grimm-world-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/camilosw/grimm-world-app ↗
            </a>
            <br />
            Game version 1.3 · App version {__APP_VERSION__}
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** The Storybook cards that cards can be put under: its chapters and the Epilogue, in card order. */
const UNDER_STORY = /^(Chapter \d+|Epilogue)$/;

/**
 * Which Storybook card the cards are put under. Their backs are shown at the top, where the white book symbol says
 * which chapter they belong to; chapters already turned over can't be picked.
 */
export function ChapterDialog({
  cards,
  defs,
  progress,
  onPick,
  onClose,
}: {
  cards: string[];
  defs: Record<string, CardDef>;
  progress: { revealed: Set<string>; current: string | null };
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const names = Object.values(defs)
    .filter((d) => d.type === 'storybook' && d.name && UNDER_STORY.test(d.name))
    .map((d) => d.name!);
  return (
    <Modal title="Put under which chapter?" onClose={onClose}>
      <div className="chapter-cards">
        {cards.map((id) => (
          <Thumb key={id} id={id} faceUp={false} def={defs[id]} />
        ))}
      </div>
      <div className="chapter-grid">
        {names.map((name) => {
          const current = name === progress.current;
          const past = progress.revealed.has(name) && !current;
          return (
            <button
              key={name}
              className={`${current ? 'current' : ''}${name === 'Epilogue' ? ' wide' : ''}`}
              disabled={past}
              onClick={() => onPick(name)}
            >
              {name.replace(/^Chapter /, '')}
              {current && <small>now</small>}
            </button>
          );
        })}
      </div>
      <p className="dialog-note muted">
        {cards.length > 1 ? `All ${cards.length} cards go` : 'The card goes'}{' '}
        face down directly under that Storybook Card, to come up right after it;
        under the current chapter, on top of the storybook, to come up next.
      </p>
    </Modal>
  );
}
