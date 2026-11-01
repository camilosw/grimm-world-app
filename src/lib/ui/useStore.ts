// React hooks reading the store (src/lib/engine/store.ts).

import { useSyncExternalStore } from 'react';
import { getTable, historyFlags, subscribe } from '../engine/store';
import type { Table } from '../engine/types';

export function useTable(): Table | null {
  return useSyncExternalStore(subscribe, getTable);
}

export function useHistory() {
  return useSyncExternalStore(subscribe, historyFlags);
}
