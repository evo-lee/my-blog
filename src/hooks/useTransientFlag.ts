import { useCallback, useEffect, useRef, useState } from 'react';

// Boolean flag that auto-resets to false after `durationMs`.
// Timer is canceled on unmount and on every re-trigger to avoid orphaned
// state updates after the component is gone.
export function useTransientFlag(durationMs: number) {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const trigger = useCallback(() => {
    clear();
    setActive(true);
    timerRef.current = setTimeout(() => {
      setActive(false);
      timerRef.current = null;
    }, durationMs);
  }, [clear, durationMs]);

  useEffect(() => clear, [clear]);

  return [active, trigger] as const;
}
