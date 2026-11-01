import { useCallback, useState } from 'react';
import { storage } from '../engine/storage';

/** A remembered on/off panel setting (per device). */
export function usePanel(
  key: string,
  openFirst = true,
): [boolean, () => void, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    const saved = storage(key).get();
    return saved === null ? openFirst : saved !== '0';
  });
  const toggle = () => {
    storage(key).set(open ? '0' : '1');
    setOpen(!open);
  };
  const set = useCallback(
    (open: boolean) => {
      storage(key).set(open ? '1' : '0');
      setOpen(open);
    },
    [key],
  );
  return [open, toggle, set];
}
