import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mistralGateway } from "@/lib/mistralGateway";

describe("mistralGateway", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mistralGateway.configure("free"); // concurrency 1, espacement 1500ms
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sérialise les appels à concurrence 1 (pas de chevauchement)", async () => {
    let concurrentNow = 0;
    let maxConcurrent = 0;
    const order: number[] = [];

    const makeTask = (id: number) => async () => {
      concurrentNow += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentNow);
      order.push(id);
      await new Promise((r) => setTimeout(r, 10));
      concurrentNow -= 1;
      return id;
    };

    const p1 = mistralGateway.run(makeTask(1));
    const p2 = mistralGateway.run(makeTask(2));
    const p3 = mistralGateway.run(makeTask(3));

    await vi.runAllTimersAsync();
    const results = await Promise.all([p1, p2, p3]);

    expect(maxConcurrent).toBe(1);
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("respecte l'espacement minimum entre deux démarrages", async () => {
    mistralGateway.configure("tier1"); // concurrency 2, minIntervalMs 400
    const startTimes: number[] = [];

    const makeTask = () => async () => {
      startTimes.push(Date.now());
      return null;
    };

    const tasks = [1, 2, 3, 4].map(() => mistralGateway.run(makeTask()));
    await vi.runAllTimersAsync();
    await Promise.all(tasks);

    expect(startTimes).toHaveLength(4);
    // Avec concurrency=2 et minIntervalMs=400, les 4 démarrages ne peuvent
    // pas tous être simultanés : au moins un écart de 400ms doit apparaître.
    const gaps = startTimes.slice(1).map((t, i) => t - startTimes[i]!);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(400);
  });

  it("une pause signalée par reportRateLimited bloque toute la file, pas seulement l'appel fautif", async () => {
    const startTimes: number[] = [];

    const makeTask = (id: number) => async () => {
      startTimes.push(Date.now());
      if (id === 1) {
        // Le premier appel encaisse un 429 avec Retry-After 5000ms.
        mistralGateway.reportRateLimited(5000);
      }
      return id;
    };

    const p1 = mistralGateway.run(makeTask(1));
    const p2 = mistralGateway.run(makeTask(2));

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    expect(startTimes).toHaveLength(2);
    // Le 2e appel doit démarrer au moins ~5s après le 1er (pause globale),
    // pas juste après le petit espacement minimal habituel (1500ms en profil "free").
    expect(startTimes[1]! - startTimes[0]!).toBeGreaterThanOrEqual(4900);
  });
});
