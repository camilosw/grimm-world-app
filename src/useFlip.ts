import { useLayoutEffect, useState, type RefObject } from 'react'
import type { CardRef } from './types'

const HALF_MS = 110
const PERSPECTIVE = 'perspective(1500px)'

/**
 * Turn a card over where it can be seen. When `card` stays the same card but changes sides, `el` turns edge-on
 * still showing the old side, then back showing the new one, about its vertical axis (`y`) or its horizontal one
 * (`x`, Region Cards). Returns whether to show the card's front.
 */
export function useFlip(el: RefObject<HTMLElement | null>, card: CardRef, axis: 'x' | 'y'): boolean {
  const [shown, setShown] = useState(card)
  // Another card (a pile's top card taken away): nothing turns.
  if (card.id !== shown.id) setShown(card)
  const turning =
    card.id === shown.id && card.faceUp !== shown.faceUp && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const { id, faceUp } = card

  useLayoutEffect(() => {
    const node = el.current
    if (!turning || !node) return
    const turn = (deg: number) => ({ transform: `${PERSPECTIVE} rotate${axis.toUpperCase()}(${deg}deg)` })
    const first = node.animate([turn(0), turn(90)], { duration: HALF_MS, easing: 'ease-in' })
    first.onfinish = () => {
      // Edge-on: show the other side while turning back.
      node.animate([turn(-90), turn(0)], { duration: HALF_MS, easing: 'ease-out' })
      setShown({ id, faceUp })
    }
    // Turned back before halfway (flipped again, or gone): stop turning.
    return () => first.cancel()
  }, [el, id, faceUp, turning, axis])

  return turning ? shown.faceUp : faceUp
}
