/**
 * Guichet unique pour **tous** les appels Mistral de l'app (mission, discussion,
 * seeds d'équipe, régénération d'archive, liste de modèles).
 *
 * Remplace les pauses locales dispersées par appelant : une file FIFO, une
 * concurrence réglable, et surtout — si un appel reçoit un 429/502/503 avec un
 * délai d'attente, ce délai s'applique à **toute la file**, pas seulement à
 * l'appel fautif. C'est la différence entre « chaque requête retente dans son
 * coin et se re-heurte au même mur » et « l'app ralentit une fois, proprement,
 * pour tout le monde ».
 *
 * Ollama n'a pas besoin de ce guichet (pas de quota externe) : seuls les
 * appels `src/lib/mistral.ts` y passent.
 */

export interface MistralGatewayStatus {
  /** Appels en attente d'une place. */
  queueLength: number;
  /** Appels actuellement en vol. */
  active: number;
  /** Horodatage (ms epoch) jusqu'auquel aucune nouvelle requête ne démarre. 0 = pas de pause. */
  pausedUntil: number;
}

export type MistralGatewayListener = (status: MistralGatewayStatus) => void;

/** Réglages par profil de compte — voir Paramètres → « Débit Mistral ». */
export type MistralRateProfile = "free" | "tier1" | "tier2";

const PROFILE_CONFIG: Record<
  MistralRateProfile,
  { concurrency: number; minIntervalMs: number }
> = {
  // Compte gratuit : quotas RPM très bas — un seul appel à la fois, bien espacé.
  free: { concurrency: 1, minIntervalMs: 1500 },
  // Palier payant d'entrée : un peu plus de marge.
  tier1: { concurrency: 2, minIntervalMs: 400 },
  // Palier payant élevé : proche du comportement historique (jusqu'à 6 en //).
  tier2: { concurrency: 4, minIntervalMs: 150 },
};

class MistralGateway {
  private queue: Array<() => void> = [];
  private active = 0;
  private pausedUntil = 0;
  private maxConcurrent = PROFILE_CONFIG.free.concurrency;
  private minIntervalMs = PROFILE_CONFIG.free.minIntervalMs;
  private lastStartAt = 0;
  private timerScheduled = false;
  private listeners = new Set<MistralGatewayListener>();

  /** Applique un profil de débit (Paramètres). */
  configure(profile: MistralRateProfile): void {
    const cfg = PROFILE_CONFIG[profile] ?? PROFILE_CONFIG.free;
    this.maxConcurrent = cfg.concurrency;
    this.minIntervalMs = cfg.minIntervalMs;
    this.pump();
  }

  /**
   * Appelé par le client Mistral (`llmRateLimit.ts`) dès qu'une réponse
   * 429/502/503 est reçue, avant même l'épuisement des tentatives. Met en
   * pause **toute** la file, pas seulement l'appel qui a échoué.
   */
  reportRateLimited(waitMs: number): void {
    const until = Date.now() + Math.max(0, waitMs);
    if (until > this.pausedUntil) {
      this.pausedUntil = until;
      this.notify();
      this.pump();
    }
  }

  subscribe(fn: MistralGatewayListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => {
      this.listeners.delete(fn);
    };
  }

  status(): MistralGatewayStatus {
    return {
      queueLength: this.queue.length,
      active: this.active,
      pausedUntil: this.pausedUntil,
    };
  }

  private notify(): void {
    const s = this.status();
    for (const fn of this.listeners) fn(s);
  }

  /** Fait passer `task` par le guichet : attend une place libre puis l'exécute. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.notify();
      this.pump();
    });
    // `pump()` a déjà incrémenté `active` de façon synchrone au moment de
    // libérer cette place — voir le commentaire dans `pump()`.
    try {
      return await task();
    } finally {
      this.active = Math.max(0, this.active - 1);
      this.notify();
      this.pump();
    }
  }

  /**
   * Boucle synchrone : libère autant d'entrées de la file que la concurrence
   * et l'espacement le permettent. `active` est incrémenté **ici**, pas dans
   * le `.then()` du `run()` appelant — sinon deux `pump()` rapprochés
   * pourraient libérer plus d'entrées que `maxConcurrent` avant qu'aucune
   * des tâches libérées n'ait eu la chance d'incrémenter `active` elle-même
   * (la continuation d'une promesse résolue est toujours asynchrone).
   */
  private pump(): void {
    while (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const now = Date.now();
      const readyAt = Math.max(
        this.pausedUntil,
        this.lastStartAt + this.minIntervalMs,
      );
      if (now < readyAt) {
        this.scheduleWake(readyAt - now);
        return;
      }
      const next = this.queue.shift()!;
      this.active += 1;
      this.lastStartAt = now;
      this.notify();
      next();
    }
  }

  private scheduleWake(delayMs: number): void {
    if (this.timerScheduled) return;
    this.timerScheduled = true;
    // `setTimeout` global (pas `window.setTimeout`) : portable navigateur/Node,
    // ce qui permet de tester le guichet avec les timers simulés de Vitest.
    setTimeout(
      () => {
        this.timerScheduled = false;
        this.pump();
      },
      Math.max(0, delayMs) + 5,
    );
  }
}

export const mistralGateway = new MistralGateway();
