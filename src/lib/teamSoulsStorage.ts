import { AGENT_SOUL_SEEDS } from "@/data/teamSeeds";

const KEY = "openspace-team-souls-v1";

function baseSouls(): Record<string, string> {
  return { ...AGENT_SOUL_SEEDS };
}

export function loadAgentSouls(): Record<string, string> {
  const out = baseSouls();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return out;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(saved)) {
      const v = saved[k];
      if (typeof v === "string") out[k] = v;
    }
  } catch {
    /* garde les seeds */
  }
  return out;
}

/** Persiste toutes les entrées (ids dynamiques inclus). */
export function saveAgentSouls(souls: Record<string, string>): void {
  localStorage.setItem(KEY, JSON.stringify(souls));
}
