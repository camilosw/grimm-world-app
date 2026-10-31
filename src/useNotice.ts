import { useCallback, useRef, useState } from 'react';

/** The short message shown over the table, and how to show one: `notify(text)` for a refusal, `notify(text, true)` for a success. */
export function useNotice() {
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback((text: string, ok = false) => {
    setNotice({ text, ok });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 2500);
  }, []);
  return { notice, notify };
}
