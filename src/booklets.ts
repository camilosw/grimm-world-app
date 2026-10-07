/** public/booklets/booklets.json, made by scripts/split_booklets.py. */
export interface BookletsManifest {
  /** Page height / width. */
  aspect: number;
  booklets: Booklet[];
}

export interface Booklet {
  id: number;
  title: string;
  /** Front cover (0), pages 1–6, back cover (last), in order. */
  pages: BookletPage[];
}

export interface BookletPage {
  page: number;
  file: string;
  /** OCR text, for search; empty for the covers. */
  text: string;
  /** Where the book lies across the page (fractions of its width, left and right): its frame… */
  body: [number, number];
  /** …and its corner pieces sticking out of it. */
  extent: [number, number];
}

/** Where a booklet is open: its id and the page shown (the left one of a spread). */
export interface BookletPlace {
  id: number;
  page: number;
}

const BASE = `${import.meta.env.BASE_URL}booklets`;

export async function loadBooklets(): Promise<BookletsManifest> {
  const res = await fetch(`${BASE}/booklets.json`);
  if (!res.ok)
    throw new Error(
      'The rule booklets have not been prepared yet: run "uv run scripts/split_booklets.py".',
    );
  return res.json();
}

export function bookletImage(file: string): string {
  return `${BASE}/${file}`;
}

/** "Cover", "Page 3" or "Back cover". */
export function pageLabel(booklet: Booklet, page: number): string {
  if (page === 0) return 'Cover';
  if (page === booklet.pages.length - 1) return 'Back cover';
  return `Page ${page}`;
}
