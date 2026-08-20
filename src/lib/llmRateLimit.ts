/**
 * Gestion centralisée des rate limits (429 / quotas) — un
 * guichet unique partagé par tous les appelants, plutôt que des pauses
 * fixes dispersées par site d'appel.
 */

/** Statuts HTTP souvent liés à surcharge / limite de débit (retry raisonnable). */
export function isRetryableRateLimitStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503;
}

/**
 * `Retry-After` en secondes entières ou date HTTP (RFC 7231).
 * Retourne un délai en ms borné (0–120s).
 */
export function parseRetryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("Retry-After");
  if (!h?.trim()) return undefined;
  const t = h.trim();
  const sec = Number.parseInt(t, 10);
  if (!Number.isNaN(sec) && sec >= 0) {
    return Math.min(sec * 1000, 120_000);
  }
  const abs = Date.parse(t);
  if (!Number.isNaN(abs)) {
    return Math.max(0, Math.min(abs - Date.now(), 120_000));
  }
  return undefined;
}

/** Backoff exponentiel + léger jitter ; priorité à `retryAfterMs` si fourni. */
export function rateLimitBackoffMs(
  attemptIndex: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, 120_000);
  }
  const base = 1800 * 2 ** attemptIndex;
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(base + jitter, 60_000);
}

export async function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      window.clearTimeout(id);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Relance `doFetch` après attente si le serveur signale surcharge / rate limit.
 * Retourne la dernière `Response` (ok ou non) après épuisement des essais.
 */
export async function fetchWithRateLimitRetries(
  doFetch: () => Promise<Response>,
  signal?: AbortSignal,
  options?: {
    maxAttempts?: number;
    /**
     * Appelé dès qu'un statut 429/502/503 est reçu, avant l'attente — permet
     * de prévenir un guichet partagé pour qu'il mette en pause les *autres*
     * appels en cours, pas seulement celui-ci.
     */
    onRateLimited?: (waitMs: number, status: number, attempt: number) => void;
  },
): Promise<Response> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 6);
  let lastBody = "";
  let lastStatus = 503;
  let lastStatusText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await doFetch();

    if (res.ok) return res;

    lastStatus = res.status;
    lastStatusText = res.statusText;
    const retryAfterMs = parseRetryAfterMs(res);
    lastBody = await res.text();

    if (!isRetryableRateLimitStatus(res.status) || attempt >= maxAttempts - 1) {
      return new Response(lastBody, {
        status: lastStatus,
        statusText: lastStatusText,
      });
    }

    const waitMs = rateLimitBackoffMs(attempt, retryAfterMs);
    options?.onRateLimited?.(waitMs, res.status, attempt);
    await sleepMs(waitMs, signal);
  }

  return new Response(lastBody, {
    status: lastStatus,
    statusText: lastStatusText,
  });
}
