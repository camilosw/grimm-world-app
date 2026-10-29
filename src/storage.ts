/** Prefix of every key the app keeps in `localStorage`. */
const PREFIX = 'grimm-world:';

/** A value kept on this device. */
export interface Stored {
  /** The value, or null when there is none or storage is blocked. */
  get(): string | null;
  /** Whether it was kept (false: storage full or blocked). */
  set(value: string): boolean;
  remove(): void;
}

/** A value kept in `localStorage` under the app's prefix; reading or writing it never throws. */
export function storage(key: string): Stored {
  const name = PREFIX + key;
  return {
    get() {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        localStorage.setItem(name, value);
        return true;
      } catch {
        return false;
      }
    },
    remove() {
      try {
        localStorage.removeItem(name);
      } catch {
        // Nothing kept to remove.
      }
    },
  };
}
