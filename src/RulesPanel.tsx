import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadBooklets, pageLabel, type BookletPlace, type BookletsManifest } from './booklets'
import { BookletScroll, BookletShelf, BookletSpread } from './Booklets'
import { rulePageImage, type RuleSection, type RulesManifest, type RuleTarget } from './rules'

interface Props {
  rules: RulesManifest
  /** Where to jump to; a new object means "jump again". */
  target: RuleTarget | null
  onClose: () => void
}

const PAGE_KEY = 'grimm-world:rules-page'
const WIDTH_KEY = 'grimm-world:rules-width'
const BOOK_KEY = 'grimm-world:rules-book'
const BOOKLET_KEY = 'grimm-world:booklet'
const LAYOUT_KEY = 'grimm-world:booklet-layout'
const MIN_WIDTH = 320
/** Table space that always stays visible next to the panel. */
const MIN_TABLE = 200
/** Strip left uncovered at the left edge when the panel is widened over the sidebar. */
const MIN_EDGE = 48
const ZOOMS = [1, 1.5, 2, 2.5]
const GAP = 12

function savedWidth(): number | null {
  try {
    return Number(localStorage.getItem(WIDTH_KEY)) || null
  } catch {
    return null
  }
}

function savedPage(): number {
  try {
    return Number(localStorage.getItem(PAGE_KEY)) || 1
  } catch {
    return 1
  }
}

type Book = 'rulebook' | 'booklets'
/** How a booklet is read: facing pages turned like a book, or one page below the other. */
type Layout = 'spread' | 'scroll'

function savedBook(): Book {
  try {
    return localStorage.getItem(BOOK_KEY) === 'booklets' ? 'booklets' : 'rulebook'
  } catch {
    return 'rulebook'
  }
}

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'scroll' ? 'scroll' : 'spread'
  } catch {
    return 'spread'
  }
}

function savedBooklet(): BookletPlace | null {
  try {
    const place = JSON.parse(localStorage.getItem(BOOKLET_KEY) ?? 'null')
    return typeof place?.id === 'number' && typeof place?.page === 'number' ? place : null
  } catch {
    return null
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Only a convenience.
  }
}

/** The section a page position belongs to: the last heading at or above it. */
function sectionAt(toc: RuleSection[], page: number, y = 1): RuleSection | undefined {
  return [...toc].reverse().find((s) => s.page < page || (s.page === page && s.y <= y))
}

/** The rulebook beside the table: its real pages, with contents and search; and the six rule booklets. */
export function RulesPanel({ rules, target, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(savedWidth)
  /** Wider than the room beside the table: the panel then lies over the table and the sidebar. */
  const [overlay, setOverlay] = useState(false)
  const resizing = useRef(false)
  const [mode, setMode] = useState<'read' | 'contents'>('read')
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(0)
  const [current, setCurrent] = useState(savedPage)
  /** Reading position within the current page (0–1), for the section shown in the footer. */
  const [currentY, setCurrentY] = useState(0)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  // Where to scroll next; starts at the page the player was reading last time.
  const [jumpTo, setJumpTo] = useState<{ page: number; y: number }>(() => ({ page: savedPage(), y: 0 }))
  const applied = useRef<object | null>(null)
  const [book, setBook] = useState(savedBook)
  // The booklets are optional: null while loading, an Error if they haven't been prepared.
  const [booklets, setBooklets] = useState<BookletsManifest | Error | null>(null)
  const [booklet, setBooklet] = useState(savedBooklet)
  const [shelf, setShelf] = useState(() => !savedBooklet())
  const [layout, setLayout] = useState(savedLayout)
  // Where to scroll a booklet read one page below the other; a new object means "scroll again".
  const [bookletJump, setBookletJump] = useState<{ page: number } | null>(null)

  useEffect(() => {
    loadBooklets().then(setBooklets, setBooklets)
  }, [])

  const showBook = (next: Book) => {
    setBook(next)
    remember(BOOK_KEY, next)
    // Back to the rulebook at the place the player left it.
    if (next === 'rulebook' && book !== 'rulebook') setJumpTo({ page: current, y: currentY })
  }

  const jump = (page: number, y = 0) => {
    showBook('rulebook')
    setMode('read')
    setQuery('')
    setJumpTo({ page, y })
  }

  /** The booklet page being read. */
  const setPlace = (id: number, page: number) => {
    setBooklet({ id, page })
    remember(BOOKLET_KEY, JSON.stringify({ id, page }))
  }

  const openBooklet = (id: number, page: number) => {
    showBook('booklets')
    setShelf(false)
    setQuery('')
    setPlace(id, page)
    setBookletJump({ page })
  }

  const setReadingLayout = (next: Layout) => {
    setLayout(next)
    remember(LAYOUT_KEY, next)
  }

  // A new help link: jump there (adjusting state while rendering, as React recommends).
  const [seenTarget, setSeenTarget] = useState<RuleTarget | null>(null)
  if (target !== seenTarget) {
    setSeenTarget(target)
    const section = target && 'section' in target ? rules.toc.find((s) => s.id === target.section) : null
    if (target && 'page' in target) jump(target.page)
    else if (section) jump(section.page, section.y)
  }

  // A saved width may not fit beside the table on this screen.
  useLayoutEffect(() => {
    const panel = panelRef.current
    const main = panel?.parentElement
    const table = main?.querySelector('.table-area')
    if (!width || !main || !table) return
    setOverlay(width > main.getBoundingClientRect().right - table.getBoundingClientRect().left - MIN_TABLE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reading = book === 'rulebook' && mode === 'read' && !query.trim()
  useLayoutEffect(() => {
    const el = pageRefs.current.get(jumpTo.page)
    const box = scrollRef.current
    if (!reading || !el || !box || applied.current === jumpTo) return
    applied.current = jumpTo
    box.scrollTop = el.offsetTop + jumpTo.y * el.offsetHeight - 8
  }, [jumpTo, reading])

  const onScroll = () => {
    const box = scrollRef.current
    if (!box) return
    // The reading position is just below the top edge of the view.
    const at = box.scrollTop + 40
    for (const [page, el] of pageRefs.current) {
      if (at >= el.offsetTop && at < el.offsetTop + el.offsetHeight + GAP) {
        setCurrentY((at - el.offsetTop) / el.offsetHeight)
        if (page !== current) {
          setCurrent(page)
          try {
            localStorage.setItem(PAGE_KEY, String(page))
          } catch {
            // Only a convenience.
          }
        }
        break
      }
    }
  }

  const setZoomKeepingPlace = (next: number) => {
    // A booklet keeps its own place.
    if (book === 'booklets') return setZoom(next)
    const box = scrollRef.current
    const ratio = box ? box.scrollTop / Math.max(1, box.scrollHeight) : 0
    setZoom(next)
    requestAnimationFrame(() => {
      if (box) box.scrollTop = ratio * box.scrollHeight
    })
  }

  /** Dragging the left edge: the panel's width follows the finger. */
  const resize = {
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      resizing.current = true
    },
    onPointerMove: (e: React.PointerEvent) => {
      const panel = panelRef.current
      const main = panel?.parentElement
      const table = main?.querySelector('.table-area')
      if (!resizing.current || !panel || !main || !table) return
      const mainBox = main.getBoundingClientRect()
      // Beside the table, which keeps at least MIN_TABLE; beyond that over it, up to MIN_EDGE from the left.
      const room = mainBox.right - table.getBoundingClientRect().left - MIN_TABLE
      const next = Math.round(Math.max(MIN_WIDTH, Math.min(mainBox.width - MIN_EDGE, mainBox.right - e.clientX)))
      setWidth(next)
      setOverlay(next > room)
    },
    onPointerUp: () => {
      resizing.current = false
      try {
        if (width) localStorage.setItem(WIDTH_KEY, String(width))
      } catch {
        // Only a convenience.
      }
    },
  }

  const loadedBooklets = booklets instanceof Error ? null : booklets
  const results = useMemo(() => search(rules, loadedBooklets, query), [rules, loadedBooklets, query])
  const openedBooklet = booklet && loadedBooklets?.booklets.find((b) => b.id === booklet.id)
  const onShelf = shelf || !openedBooklet
  const section = sectionAt(rules.toc, current, currentY)
  const lastPage = rules.pages[rules.pages.length - 1].page

  return (
    <aside
      ref={panelRef}
      className={overlay ? 'rules overlay' : 'rules'}
      aria-label="Rulebook"
      style={width ? ({ '--rules-width': `${width}px` } as React.CSSProperties) : undefined}
    >
      <div className="rules-resize" {...resize} onPointerCancel={resize.onPointerUp} role="separator" aria-orientation="vertical" aria-label="Resize the rules" />
      <header className="rules-bar">
        <div className="segmented rules-books" role="group" aria-label="Book">
          <button className={book === 'rulebook' ? 'on' : ''} onClick={() => showBook('rulebook')}>
            Rulebook
          </button>
          {/* Tapped again while reading a booklet: back to the covers. */}
          <button
            className={book === 'booklets' ? 'on' : ''}
            onClick={() => (book === 'booklets' ? setShelf(true) : showBook('booklets'))}
          >
            Booklets
          </button>
        </div>
        <span className="spacer" />
        {book === 'rulebook' ? (
          <button className={mode === 'contents' ? 'on' : ''} onClick={() => setMode(mode === 'contents' ? 'read' : 'contents')}>
            ☰ <span>Contents</span>
          </button>
        ) : (
          openedBooklet && (
            <>
              {/* Back to the covers, or from them back to the booklet being read. */}
              <button className={onShelf ? 'on' : ''} onClick={() => setShelf(!shelf)} aria-label="All booklets">
                ☰ <span>Shelf</span>
              </button>
              {!onShelf && (
                <div className="segmented" role="group" aria-label="Reading mode">
                  <button className={layout === 'spread' ? 'on' : ''} onClick={() => setReadingLayout('spread')} aria-label="Two pages" title="Two pages">
                    📖
                  </button>
                  <button className={layout === 'scroll' ? 'on' : ''} onClick={() => setReadingLayout('scroll')} aria-label="One page" title="One page">
                    📄
                  </button>
                </div>
              )}
            </>
          )
        )}
        <button onClick={() => setZoomKeepingPlace(Math.max(0, zoom - 1))} disabled={zoom === 0} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => setZoomKeepingPlace(Math.min(ZOOMS.length - 1, zoom + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom in">
          +
        </button>
        <button className="icon" onClick={onClose} aria-label="Close rules">
          ✕
        </button>
      </header>
      <div className="rules-search">
        <input type="search" placeholder="Search the rules, e.g. fate number, banish, hedge" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {query.trim() ? (
        <div className="rules-list">
          {results.sections.map((s) => (
            <button key={s.id} className="rules-item" onClick={() => jump(s.page, s.y)}>
              <span className="rules-num">{s.id}</span> {s.title}
            </button>
          ))}
          {results.pages.length > 0 && results.booklets.length > 0 && <p className="muted small rules-group">Rulebook</p>}
          {results.pages.map((r) => (
            <button key={r.page} className="rules-item" onClick={() => jump(r.page)}>
              <span className="rules-num">p. {r.page}</span>
              <span>
                <span className="muted rules-hit-section">{r.section ? `${r.section.id} ${r.section.title}` : ''}</span>
                <span className="rules-snippet">
                  …{r.before}
                  <mark>{r.match}</mark>
                  {r.after}…
                </span>
              </span>
            </button>
          ))}
          {results.booklets.length > 0 && <p className="muted small rules-group">Booklets</p>}
          {results.booklets.map((r) => (
            <button key={`${r.id}-${r.page}`} className="rules-item" onClick={() => openBooklet(r.id, r.page)}>
              <span className="rules-num">p. {r.page}</span>
              <span>
                <span className="muted rules-hit-section">{r.title}</span>
                <span className="rules-snippet">
                  …{r.before}
                  <mark>{r.match}</mark>
                  {r.after}…
                </span>
              </span>
            </button>
          ))}
          {!results.sections.length && !results.pages.length && !results.booklets.length && <p className="muted">Nothing found.</p>}
        </div>
      ) : book === 'booklets' ? (
        booklets instanceof Error ? (
          <p className="muted rules-missing">{booklets.message}</p>
        ) : !booklets ? null : openedBooklet && !onShelf ? (
          layout === 'spread' ? (
            <BookletSpread
              key={openedBooklet.id}
              manifest={booklets}
              booklet={openedBooklet}
              page={Math.min(booklet!.page, openedBooklet.pages.length - 1)}
              zoom={ZOOMS[zoom]}
              onPage={(page) => setPlace(openedBooklet.id, page)}
            />
          ) : (
            <BookletScroll
              key={openedBooklet.id}
              manifest={booklets}
              booklet={openedBooklet}
              page={Math.min(booklet!.page, openedBooklet.pages.length - 1)}
              jump={bookletJump}
              zoom={ZOOMS[zoom]}
              onPage={(page) => setPlace(openedBooklet.id, page)}
            />
          )
        ) : (
          <BookletShelf
            manifest={booklets}
            onOpen={(id) => openBooklet(id, id === booklet?.id ? booklet.page : 0)}
          />
        )
      ) : mode === 'contents' ? (
        <div className="rules-list">
          {rules.toc.map((s) => (
            <button
              key={s.id}
              className={`rules-item depth-${Math.min(s.depth, 2)}${section?.id === s.id ? ' current' : ''}`}
              onClick={() => jump(s.page, s.y)}
            >
              <span className="rules-num">{s.id}</span> {s.title}
              <span className="muted rules-page">{s.page}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="rules-pages"
        onScroll={onScroll}
        style={{ display: reading ? undefined : 'none' }}
      >
        {rules.pages.map((p) => (
          <div
            key={p.page}
            ref={(el) => {
              if (el) pageRefs.current.set(p.page, el)
              else pageRefs.current.delete(p.page)
            }}
            className="rules-page-img"
            style={{ width: `${ZOOMS[zoom] * 100}%`, aspectRatio: `1 / ${rules.aspect}`, marginBottom: GAP }}
          >
            <img src={rulePageImage(p.file)} alt={`Rulebook page ${p.page}`} loading="lazy" draggable={false} />
          </div>
        ))}
      </div>

      {book === 'rulebook' && (
        <footer className="rules-foot muted small">
          <span>{current === 0 ? 'Cover' : `${(section ?? rules.toc[0]).id} ${(section ?? rules.toc[0]).title}`}</span>
          <span>
            p. {current} / {lastPage} · v{rules.version}
          </span>
        </footer>
      )}
    </aside>
  )
}

interface Snippet {
  before: string
  match: string
  after: string
}

interface PageHit extends Snippet {
  page: number
  section?: RuleSection
}

interface BookletHit extends Snippet {
  /** Booklet id. */
  id: number
  title: string
  page: number
}

function snippet(text: string, at: number, length: number): Snippet {
  return {
    before: text.slice(Math.max(0, at - 50), at),
    match: text.slice(at, at + length),
    after: text.slice(at + length, at + length + 70),
  }
}

/** Sections whose title matches, then rulebook and booklet pages whose text matches (one snippet per page). */
function search(
  rules: RulesManifest,
  booklets: BookletsManifest | null,
  query: string,
): { sections: RuleSection[]; pages: PageHit[]; booklets: BookletHit[] } {
  const q = query.trim().toLowerCase()
  if (!q) return { sections: [], pages: [], booklets: [] }
  const sections = rules.toc.filter((s) => s.title.toLowerCase().includes(q) || s.id === q)
  const pages: PageHit[] = []
  for (const p of rules.pages) {
    const at = p.text.toLowerCase().indexOf(q)
    if (at < 0) continue
    pages.push({ page: p.page, section: sectionAt(rules.toc, p.page, at / Math.max(1, p.text.length)), ...snippet(p.text, at, q.length) })
  }
  const bookletHits: BookletHit[] = []
  for (const b of booklets?.booklets ?? []) {
    for (const p of b.pages) {
      const at = p.text.toLowerCase().indexOf(q)
      if (at >= 0) bookletHits.push({ id: b.id, title: `${b.title} · ${pageLabel(b, p.page)}`, page: p.page, ...snippet(p.text, at, q.length) })
    }
  }
  return { sections, pages, booklets: bookletHits }
}
