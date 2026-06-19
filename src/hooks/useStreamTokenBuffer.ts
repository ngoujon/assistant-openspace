import { useCallback, useEffect, useRef } from "react";

const DEFAULT_FLUSH_MS = 80;

/**
 * Accumule les tokens streamés et flush vers React par batch (moins de re-renders).
 */
export function useStreamTokenBuffer(
  flushMs = DEFAULT_FLUSH_MS,
): {
  push: (chunk: string, onFlush: (accumulated: string) => void) => void;
  flushNow: (onFlush: (accumulated: string) => void) => void;
  reset: () => void;
} {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = useRef<((accumulated: string) => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushNow = useCallback(
    (onFlush: (accumulated: string) => void) => {
      clearTimer();
      if (!bufferRef.current) return;
      const text = bufferRef.current;
      bufferRef.current = "";
      onFlush(text);
    },
    [clearTimer],
  );

  const push = useCallback(
    (chunk: string, onFlush: (accumulated: string) => void) => {
      bufferRef.current += chunk;
      onFlushRef.current = onFlush;
      if (timerRef.current != null) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const cb = onFlushRef.current;
        if (!cb || !bufferRef.current) return;
        const text = bufferRef.current;
        bufferRef.current = "";
        cb(text);
      }, flushMs);
    },
    [flushMs],
  );

  const reset = useCallback(() => {
    clearTimer();
    bufferRef.current = "";
    onFlushRef.current = null;
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { push, flushNow, reset };
}
