import { useSyncExternalStore } from 'react'

/**
 * A short screen: a phone held landscape (the game isn't played in portrait). The toolbar and the actions move to the
 * sides, the Browse panel lies beside the table and the decks sidebar over it. Keep in step with the
 * `@media (max-height: 500px)` rules in styles.css.
 */
const COMPACT = '(max-height: 500px)'

const query = () => window.matchMedia(COMPACT)

const subscribe = (onChange: () => void) => {
  const q = query()
  q.addEventListener('change', onChange)
  return () => q.removeEventListener('change', onChange)
}

export const isCompact = () => query().matches

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompact)
}
