import { useSyncExternalStore } from 'react'
import { settle } from './actions'
import type { Table } from './types'

const STORAGE_KEY = 'grimm-world:table:v1'
const HISTORY_LIMIT = 200

let table: Table | null = null
let past: Table[] = []
let future: Table[] = []
const listeners = new Set<() => void>()
let saveTimer: number | undefined

function emit() {
  listeners.forEach((l) => l())
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(save, 300)
}

function save() {
  if (!table) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(table))
  } catch {
    // Storage full or blocked: the game keeps running, just without autosave.
  }
}

export function loadSaved(): Table | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Table) : null
  } catch {
    return null
  }
}

/** Replace the whole table (new game / import). Clears undo history. */
export function resetTable(next: Table) {
  table = next
  past = []
  future = []
  emit()
}

/** Apply a pure change. Returning the same object means "nothing happened". */
export function update(fn: (t: Table) => Table) {
  if (!table) return
  // However cards got there or left, a row of Money Cards stays without gaps and the areas keep apart.
  const next = settle(fn(table))
  if (next === table) return
  past.push(table)
  if (past.length > HISTORY_LIMIT) past.shift()
  future = []
  table = next
  emit()
}

export function undo() {
  const prev = past.pop()
  if (!prev || !table) return
  future.push(table)
  table = prev
  emit()
}

export function redo() {
  const next = future.pop()
  if (!next || !table) return
  past.push(table)
  table = next
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTable(): Table | null {
  return table
}

export function useTable(): Table | null {
  return useSyncExternalStore(subscribe, () => table)
}

export function useHistory() {
  return useSyncExternalStore(
    subscribe,
    () => (past.length ? 1 : 0) + (future.length ? 2 : 0),
  )
}
