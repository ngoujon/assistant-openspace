/** Exécute `fn` sur chaque élément avec au plus `limit` tâches concurrentes. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (items.length === 0) return [];
  const cap = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  };

  await Promise.all(Array.from({ length: cap }, () => worker()));
  return results;
}
