import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  bookletImage,
  pageLabel,
  type Booklet,
  type BookletsManifest,
} from './booklets';

const TURN_MS = 420;
const PAD = 10;
/** Space between pages read one below the other. */
const GAP = 12;
/** Horizontal travel (px) that makes a swipe turn the page. */
const SWIPE = 40;

/** The six booklets, by their covers. */
export function BookletShelf({
  manifest,
  onOpen,
}: {
  manifest: BookletsManifest;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="booklet-shelf">
      {manifest.booklets.map((b) => (
        <button
          key={b.id}
          className="booklet-cover"
          onClick={() => onOpen(b.id)}
        >
          <img
            src={bookletImage(b.pages[0].file)}
            alt=""
            draggable={false}
            style={{ aspectRatio: `1 / ${manifest.aspect}` }}
          />
          <span>{b.title}</span>
        </button>
      ))}
    </div>
  );
}

/** A page being turned: the leaf over the book, its two sides and how it turns. */
interface Turn {
  to: number;
  front: number;
  back: number;
  /** Over the right page (turning forward) or the left one (turning back). */
  at: 'right' | 'left';
  toDeg: number;
}

/** Facing pages p−1 | p for spread s are 2s−1 | 2s: the front cover alone on the right, the back cover alone on the left. */
const spreadOf = (page: number) => Math.ceil(page / 2);

/**
 * An open booklet with facing pages, turned like a book. Tap the right side (or swipe left, or →) for the next page,
 * the left side for the previous one.
 */
export function BookletSpread({
  manifest,
  booklet,
  page,
  zoom,
  onPage,
}: {
  manifest: BookletsManifest;
  booklet: Booklet;
  /** The page shown (the left one of a spread). */
  page: number;
  zoom: number;
  onPage: (page: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [turn, setTurn] = useState<Turn | null>(null);
  const last = booklet.pages.length - 1;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () =>
      setSize({ w: box.clientWidth - 2 * PAD, h: box.clientHeight - 2 * PAD });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Fetch the whole booklet up front, so turned pages show at once.
  useEffect(() => {
    for (const p of booklet.pages) new Image().src = bookletImage(p.file);
  }, [booklet]);

  const s = spreadOf(page);
  const canTurn = (dir: 1 | -1) => (dir > 0 ? s < spreadOf(last) : s > 0);

  const turnPage = (dir: 1 | -1) => {
    if (turn || !canTurn(dir)) return;
    const to = dir > 0 ? 2 * s + 1 : Math.max(0, 2 * s - 3);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return onPage(to);
    setTurn(
      dir > 0
        ? { to, front: 2 * s, back: 2 * s + 1, at: 'right', toDeg: -180 }
        : { to, front: 2 * s - 1, back: 2 * s - 2, at: 'left', toDeg: 180 },
    );
  };

  const onPageRef = useRef(onPage);
  useEffect(() => {
    onPageRef.current = onPage;
  });

  useLayoutEffect(() => {
    const leaf = leafRef.current;
    if (!turn || !leaf) return;
    const anim = leaf.animate(
      [
        { transform: 'rotateY(0deg)' },
        { transform: `rotateY(${turn.toDeg}deg)` },
      ],
      {
        duration: TURN_MS,
        easing: 'ease-in-out',
        fill: 'forwards',
      },
    );
    anim.onfinish = () => {
      onPageRef.current(turn.to);
      setTurn(null);
    };
    return () => anim.cancel();
  }, [turn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowRight') turnPage(1);
      else if (e.key === 'ArrowLeft') turnPage(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pageW = Math.max(
    0,
    Math.floor(Math.min(size.w / 2, size.h / manifest.aspect) * zoom),
  );
  const pageH = Math.round(pageW * manifest.aspect);

  // What lies under the turning leaf: the pages it uncovers, and the ones staying put.
  const left = turn?.at === 'left' ? 2 * s - 3 : 2 * s - 1;
  const right = turn?.at === 'right' ? 2 * s + 2 : 2 * s;
  // A closed booklet (a cover alone) lies in the middle; it slides over as it opens or closes.
  const target = spreadOf(turn ? turn.to : page);
  const shift =
    2 * target - 1 < 0 ? -pageW / 2 : 2 * target > last ? pageW / 2 : 0;

  const img = (p: number) =>
    p >= 0 && p <= last ? <PageImage booklet={booklet} page={p} /> : null;

  const onClick = (e: React.MouseEvent) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    const back = canTurn(-1);
    const forward = canTurn(1);
    // A closed booklet opens (or closes) wherever it is tapped.
    if (!back || !forward) return turnPage(forward ? 1 : -1);
    const rect = e.currentTarget.getBoundingClientRect();
    turnPage(e.clientX < rect.left + rect.width / 2 ? -1 : 1);
  };

  const where =
    2 * s - 1 < 0
      ? 'Cover'
      : 2 * s > last
        ? 'Back cover'
        : `Pages ${2 * s - 1}–${2 * s} of ${last - 1}`;

  return (
    <>
      <div
        ref={boxRef}
        className="booklet-view"
        // Fitted, nothing scrolls: a page turning towards the viewer overhangs the view for a moment, without scroll bars.
        style={{
          padding: PAD,
          ...(zoom === 1 && { overflow: 'hidden', touchAction: 'pan-y' }),
        }}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerCancel={() => (swipe.current = null)}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || zoom !== 1) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) < SWIPE || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
          swiped.current = true;
          turnPage(dx < 0 ? 1 : -1);
        }}
      >
        {/* The booklet's place: a closed booklet slides within it, its empty half cut off rather than scrolled to. */}
        <div
          className="booklet-frame"
          style={{ width: 2 * pageW, height: pageH }}
        >
          {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a tap shortcut for the Previous and Next page buttons (and the arrow keys) */}
          <div
            className="booklet-book"
            onClick={onClick}
            style={{
              transform: `translateX(${shift}px)`,
              transition: `transform ${TURN_MS}ms ease-in-out`,
            }}
          >
            <div className="booklet-page" style={{ left: 0, width: pageW }}>
              {img(left)}
            </div>
            <div className="booklet-page" style={{ left: pageW, width: pageW }}>
              {img(right)}
            </div>
            {turn && (
              <div
                ref={leafRef}
                className="booklet-leaf"
                style={{
                  left: turn.at === 'right' ? pageW : 0,
                  width: pageW,
                  // Turning about the spine.
                  transformOrigin:
                    turn.at === 'right' ? 'left center' : 'right center',
                }}
              >
                <div className="booklet-face">{img(turn.front)}</div>
                <div className="booklet-face back">{img(turn.back)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="rules-foot booklet-foot">
        <button
          className="icon"
          onClick={() => turnPage(-1)}
          disabled={!canTurn(-1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <Where booklet={booklet} where={where} />
        <button
          className="icon"
          onClick={() => turnPage(1)}
          disabled={!canTurn(1)}
          aria-label="Next page"
        >
          ›
        </button>
      </footer>
    </>
  );
}

function scrollToPage(
  box: HTMLElement | null,
  el: HTMLElement | undefined,
  y = 0,
) {
  if (box && el) box.scrollTop = el.offsetTop + y * el.offsetHeight - PAD;
}

function PageImage({
  booklet,
  page,
  lazy,
  style,
}: {
  booklet: Booklet;
  page: number;
  lazy?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <img
      style={style}
      src={bookletImage(booklet.pages[page].file)}
      alt={`${booklet.title}, ${pageLabel(booklet, page)}`}
      className={
        page === 0 || page === booklet.pages.length - 1 ? 'cover' : undefined
      }
      loading={lazy ? 'lazy' : undefined}
      draggable={false}
    />
  );
}

function Where({ booklet, where }: { booklet: Booklet; where: string }) {
  return (
    <span className="booklet-where">
      <span className="booklet-title">{booklet.title}</span> · {where}
    </span>
  );
}

/**
 * An open booklet one page at a time, the pages one below the other across the whole width, read by scrolling like
 * the rulebook.
 */
export function BookletScroll({
  manifest,
  booklet,
  page,
  jump,
  zoom,
  onPage,
}: {
  manifest: BookletsManifest;
  booklet: Booklet;
  /** The page being read; where the view opens. */
  page: number;
  /** Scroll to this page; a new object means "scroll again". */
  jump: { page: number } | null;
  zoom: number;
  onPage: (page: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const last = booklet.pages.length - 1;
  // Reading position: the page just below the top of the view, and how far down it (0–1).
  const place = useRef({ page, y: 0 });
  const [opening] = useState(page);

  // Left and right pages have the paper on opposite sides, and the covers are a little wider: every page is placed
  // so that the book on it lies in the middle, the widest one across the width (in `body` units), leaving room at the
  // sides for the corner pieces sticking out.
  const widest = Math.max(...booklet.pages.map((p) => p.body[1] - p.body[0]));
  const overhang = Math.max(
    ...booklet.pages.map((p) =>
      Math.max(p.body[0] - p.extent[0], p.extent[1] - p.body[1]),
    ),
  );
  const side = overhang / widest;
  const width = (zoom * 100) / (1 + 2 * side);

  // Opening at the page being read, then to every new jump (a search result).
  const jumped = useRef<object | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (jumped.current === undefined)
      scrollToPage(boxRef.current, pageRefs.current.get(opening));
    else if (jump && jump !== jumped.current)
      scrollToPage(boxRef.current, pageRefs.current.get(jump.page));
    jumped.current = jump;
  }, [jump, opening]);

  // Zooming keeps the place being read.
  const zoomed = useRef(zoom);
  useLayoutEffect(() => {
    if (zoomed.current === zoom) return;
    zoomed.current = zoom;
    scrollToPage(
      boxRef.current,
      pageRefs.current.get(place.current.page),
      place.current.y,
    );
  }, [zoom]);

  const onScroll = () => {
    const box = boxRef.current;
    if (!box) return;
    const at = box.scrollTop + 40;
    for (const [p, el] of pageRefs.current) {
      if (at >= el.offsetTop && at < el.offsetTop + el.offsetHeight + GAP) {
        place.current = {
          page: p,
          y: (box.scrollTop + PAD - el.offsetTop) / el.offsetHeight,
        };
        if (p !== page) onPage(p);
        break;
      }
    }
  };

  return (
    <>
      <div
        ref={boxRef}
        className="booklet-view booklet-scroll"
        style={{ padding: PAD, overflowX: zoom === 1 ? 'hidden' : undefined }}
        onScroll={onScroll}
      >
        {booklet.pages.map((p) => (
          <div
            key={p.page}
            ref={(el) => {
              if (el) pageRefs.current.set(p.page, el);
              else pageRefs.current.delete(p.page);
            }}
            className="booklet-scroll-page"
            style={{
              width: `${width}%`,
              marginLeft: `${side * width}%`,
              aspectRatio: `${widest} / ${manifest.aspect}`,
              marginBottom: GAP,
            }}
          >
            <PageImage
              booklet={booklet}
              page={p.page}
              lazy
              style={{
                width: `${100 / widest}%`,
                left: `${(0.5 - (p.body[0] + p.body[1]) / 2 / widest) * 100}%`,
              }}
            />
          </div>
        ))}
      </div>
      <footer className="rules-foot">
        <Where
          booklet={booklet}
          where={`${pageLabel(booklet, page)}${page > 0 && page < last ? ` of ${last - 1}` : ''}`}
        />
      </footer>
    </>
  );
}
