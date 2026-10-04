import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { BattlefieldLayout } from './actions'
import type { CardDef } from './types'

interface Props {
  text: string
  layout: BattlefieldLayout
  defs: Record<string, CardDef>
  onText: (text: string) => void
  onLayOut: () => void
  onClose: () => void
  /** The bar's height in screen pixels, so the view can fit the battlefield below it. */
  onHeight: (h: number) => void
}

/** Most lines the text box grows to before it scrolls. */
const MAX_ROWS = 5

/**
 * The battlefield of a Conflict Card typed row by row, docked at the top of the table: the table previews it while it
 * is typed (App), and Ok puts the cards there. The right sidebar of cards set aside stays beside it, so the
 * Conflict Card can be read there meanwhile.
 */
export function BattlefieldBar({ text, layout, defs, onText, onLayOut, onClose, onHeight }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const codes = useMemo(() => new Set(Object.values(defs).map((d) => d.code)), [defs])
  const typed = layout.rows.flat().flatMap((s) => (s ? [s.code] : []))
  const unknown = [...new Set(typed.filter((c) => !codes.has(c)))].map((c) => c.slice(1))
  const twice = [...new Set(typed.filter((c, i) => typed.indexOf(c) !== i))].map((c) => c.slice(1))
  const ok = typed.length > 0 && !unknown.length && !twice.length && !layout.invalid.length
  const lines = Math.min(MAX_ROWS, Math.max(3, text.split('\n').length))

  useLayoutEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    return () => {
      ro.disconnect()
      onHeight(0)
    }
  }, [onHeight])

  // Ready to type, the cursor after what is already there (the battlefield lying on the table).
  useEffect(() => {
    const el = inputRef.current!
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  return (
    <div className="battle-bar" ref={ref}>
      <div className="battle-field">
        <label htmlFor="battle-text">
          ⚔ Terrain <small>row by row</small>
        </label>
        <textarea
          id="battle-text"
          ref={inputRef}
          className="battle-input"
          rows={lines}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          placeholder={'One row per line, "v" = pointing down, "-" = empty\ne.g.  01 07v 15v\n       19 30 31'}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ok) {
              e.preventDefault()
              onLayOut()
            }
          }}
        />
        {layout.invalid.length > 0 && <p className="dialog-note warn">Not a Terrain Card number: {layout.invalid.join(', ')}</p>}
        {unknown.length > 0 && <p className="dialog-note warn">Unknown terrain: {unknown.join(', ')}</p>}
        {twice.length > 0 && <p className="dialog-note warn">Typed more than once: {twice.join(', ')}</p>}
      </div>
      <div className="battle-buttons">
        <button className="primary" disabled={!ok} onClick={onLayOut}>
          ✓ Ok
        </button>
        <button onClick={onClose}>✕ Cancel</button>
      </div>
    </div>
  )
}
