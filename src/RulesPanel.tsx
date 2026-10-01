import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rulePageImage, type RuleSection, type RulesManifest, type RuleTarget } from './rules'

interface Props {
  rules: RulesManifest
  /** Where to jump to; a new object means "jump again". */
  target: RuleTarget | null
  onClose: () => void
}

const PAGE_KEY = 'grimm-world:rules-page'
const WIDTH_KEY = 'grimm-world:rules-width'
const MIN_WIDTH = 320
/** Table space that always stays visible next to the panel. */
const MIN_TABLE = 200
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

/** The section a page position belongs to: the last heading at or above it. */
function sectionAt(toc: RuleSection[], page: number, y = 1): RuleSection | undefined {
  return [...toc].reverse().find((s) => s.page < page || (s.page === page && s.y <= y))
}

/** The rulebook beside the table: its real pages, with contents and search. */
export function RulesPanel({ rules, target, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(savedWidth)
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

  const jump = (page: number, y = 0) => {
    setMode('read')
    setQuery('')
    setJumpTo({ page, y })
  }

  // A new help link: jump there (adjusting state while rendering, as React recommends).
  const [seenTarget, setSeenTarget] = useState<RuleTarget | null>(null)
  if (target !== seenTarget) {
    setSeenTarget(target)
    const section = target && 'section' in target ? rules.toc.find((s) => s.id === target.section) : null
    if (target && 'page' in target) jump(target.page)
    else if (section) jump(section.page, section.y)
  }

  const reading = mode === 'read' && !query.trim()
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
      const table = panel?.previousElementSibling
      if (!resizing.current || !panel || !table) return
      const right = panel.getBoundingClientRect().right
      // The table (whatever the sidebar leaves of it) keeps at least MIN_TABLE.
      const max = table.getBoundingClientRect().width + panel.getBoundingClientRect().width - MIN_TABLE
      setWidth(Math.round(Math.max(MIN_WIDTH, Math.min(max, right - e.clientX))))
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

  const results = useMemo(() => search(rules, query), [rules, query])
  const section = sectionAt(rules.toc, current, currentY)
  const lastPage = rules.pages[rules.pages.length - 1].page

  return (
    <aside
      ref={panelRef}
      className="rules"
      aria-label="Rulebook"
      style={width ? ({ '--rules-width': `${width}px` } as React.CSSProperties) : undefined}
    >
      <div className="rules-resize" {...resize} onPointerCancel={resize.onPointerUp} role="separator" aria-orientation="vertical" aria-label="Resize the rules" />
      <header className="rules-bar">
        <strong>📖 Rules</strong>
        <span className="muted small">v{rules.version}</span>
        <span className="spacer" />
        <button className={mode === 'contents' ? 'on' : ''} onClick={() => setMode(mode === 'contents' ? 'read' : 'contents')}>
          ☰ <span>Contents</span>
        </button>
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
          {!results.sections.length && !results.pages.length && <p className="muted">Nothing found.</p>}
        </div>
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

      <footer className="rules-foot muted small">
        <span>{current === 0 ? 'Cover' : `${(section ?? rules.toc[0]).id} ${(section ?? rules.toc[0]).title}`}</span>
        <span>
          p. {current} / {lastPage}
        </span>
      </footer>
    </aside>
  )
}

interface PageHit {
  page: number
  section?: RuleSection
  before: string
  match: string
  after: string
}

/** Sections whose title matches, then pages whose text matches (one snippet per page). */
function search(rules: RulesManifest, query: string): { sections: RuleSection[]; pages: PageHit[] } {
  const q = query.trim().toLowerCase()
  if (!q) return { sections: [], pages: [] }
  const sections = rules.toc.filter((s) => s.title.toLowerCase().includes(q) || s.id === q)
  const pages: PageHit[] = []
  for (const p of rules.pages) {
    const at = p.text.toLowerCase().indexOf(q)
    if (at < 0) continue
    pages.push({
      page: p.page,
      section: sectionAt(rules.toc, p.page, at / Math.max(1, p.text.length)),
      before: p.text.slice(Math.max(0, at - 50), at),
      match: p.text.slice(at, at + q.length),
      after: p.text.slice(at + q.length, at + q.length + 70),
    })
  }
  return { sections, pages }
}
