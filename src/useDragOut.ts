import { useRef, useState } from 'react'

const SLOP = 8
const LONG_PRESS_MS = 500

export interface DragOut<T> {
  item: T
  x: number
  y: number
}

interface Options<T> {
  onTap: (item: T) => void
  onLongPress?: (item: T) => void
  /** The item was dragged and released at this screen point. Without it, moving the finger cancels the press (e.g. to let a list scroll). */
  onDrop?: (item: T, clientX: number, clientY: number) => void
}

/**
 * Pointer handling for things that live outside the table (sidebar, browse panel):
 * tap, long-press, or drag a card out with a floating ghost image.
 */
export function useDragOut<T>({ onTap, onLongPress, onDrop }: Options<T>) {
  const [drag, setDrag] = useState<DragOut<T> | null>(null)
  const press = useRef<{ item: T; x: number; y: number; timer: number; active: boolean; done: boolean } | null>(null)

  const end = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
    setDrag(null)
  }

  const bind = (item: T) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const timer = window.setTimeout(() => {
        if (!press.current || press.current.active || !onLongPress) return
        press.current.done = true
        onLongPress(item)
      }, LONG_PRESS_MS)
      press.current = { item, x: e.clientX, y: e.clientY, timer, active: false, done: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (!p || p.done) return
      if (!p.active && Math.hypot(e.clientX - p.x, e.clientY - p.y) < SLOP) return
      if (!onDrop) return end()
      if (!p.active) window.clearTimeout(p.timer)
      p.active = true
      setDrag({ item: p.item, x: e.clientX, y: e.clientY })
    },
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current
      end()
      if (!p || p.done) return
      if (p.active) onDrop?.(p.item, e.clientX, e.clientY)
      else onTap(p.item)
    },
    onPointerCancel: end,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  return { drag, bind }
}
