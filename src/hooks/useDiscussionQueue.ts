import { useCallback, useEffect, useRef, useState } from "react";

export interface DiscussionQueuedMessage {
  id: string;
  text: string;
}

export function useDiscussionQueue(
  runSend: (text: string) => Promise<void>,
  busy: boolean,
) {
  const queueRef = useRef<DiscussionQueuedMessage[]>([]);
  const pumpingRef = useRef(false);
  const runSendRef = useRef(runSend);
  const [queue, setQueue] = useState<DiscussionQueuedMessage[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    runSendRef.current = runSend;
  }, [runSend]);

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    if (busy) return;
    const head = queueRef.current[0];
    if (!head) return;
    pumpingRef.current = true;
    const claimed = queueRef.current.shift()!;
    setQueue([...queueRef.current]);
    let scheduleAgain = true;
    try {
      await runSendRef.current(claimed.text);
    } catch {
      queueRef.current = [claimed, ...queueRef.current];
      setQueue([...queueRef.current]);
      scheduleAgain = false;
    } finally {
      pumpingRef.current = false;
      if (scheduleAgain) {
        queueMicrotask(() => void pump());
      }
    }
  }, [busy]);

  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  useEffect(() => {
    if (busy) return;
    void pumpRef.current();
  }, [busy]);

  const enqueue = useCallback(
    (text: string) => {
      queueRef.current = [
        ...queueRef.current,
        { id: crypto.randomUUID(), text },
      ];
      setQueue([...queueRef.current]);
      if (busy) setQueueOpen(true);
      void pumpRef.current();
    },
    [busy],
  );

  /**
   * Toujours passer par `enqueue` + `pump` : un appel direct à `runSendRef`
   * ici (« si pas busy, envoie tout de suite ») créait une fenêtre de course —
   * `busy` ne se met à jour qu'au rendu React suivant, donc deux envois
   * rapprochés (double Entrée) pouvaient tous deux passer le test et créer
   * chacun leur propre `AbortController`, s'écrasant l'un l'autre. `pump()`
   * lit un ref synchrone (`pumpingRef`) et sérialise correctement.
   */
  const trySendNow = useCallback(
    (text: string) => {
      enqueue(text);
      return false;
    },
    [enqueue],
  );

  const removeQueued = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((x) => x.id !== id);
    setQueue([...queueRef.current]);
  }, []);

  const updateQueuedText = useCallback((id: string, next: string) => {
    queueRef.current = queueRef.current.map((x) =>
      x.id === id ? { ...x, text: next } : x,
    );
    setQueue([...queueRef.current]);
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setQueue([]);
    setQueueOpen(false);
  }, []);

  return {
    queue,
    queueOpen,
    setQueueOpen,
    trySendNow,
    enqueue,
    removeQueued,
    updateQueuedText,
    clearQueue,
    resetQueue: clearQueue,
  };
}
