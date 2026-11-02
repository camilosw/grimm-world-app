// Values kept per device in localStorage, under the game's prefix (`GameDefinition.id`).

import { game } from './game';

/** A value kept on this device. */
export interface Stored {
  /** The value, or null when there is none or storage is blocked. */
  get(): string | null;
  /** Whether it was kept (false: storage full or blocked). */
  set(value: string): boolean;
  remove(): void;
}

/**
 * A value kept in `localStorage` under the game's prefix ("grimm-world:" + key); reading or writing it never throws once
 * the game is registered. The prefix is read on use, so a module may make one on import, before the game is registered.
 */
export function storage(key: string): Stored {
  // Outside the try blocks: read before the game is registered, it throws rather than finding nothing.
  const name = () => `${game().id}:${key}`;
  return {
    get() {
      const n = name();
      try {
        return localStorage.getItem(n);
      } catch {
        return null;
      }
    },
    set(value) {
      const n = name();
      try {
        localStorage.setItem(n, value);
        return true;
      } catch {
        return false;
      }
    },
    remove() {
      const n = name();
      try {
        localStorage.removeItem(n);
      } catch {
        // Nothing kept to remove.
      }
    },
  };
}
