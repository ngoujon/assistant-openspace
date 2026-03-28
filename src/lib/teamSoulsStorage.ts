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
    for (const id of Object.keys(out)) {
      if (Object.prototype.hasOwnProperty.call(saved, id)) {
        const v = saved[id];
        if (typeof v === "string") out[id] = v;
      }
    }
  } catch {
    /* garde les seeds */
  }
  return out;
}

export function saveAgentSouls(souls: Record<string, string>): void {
  const seeds = baseSouls();
  const toStore: Record<string, string> = {};
  for (const id of Object.keys(seeds)) {
    if (Object.prototype.hasOwnProperty.call(souls, id)) {
      toStore[id] = souls[id] ?? seeds[id];
    }
  }
  localStorage.setItem(KEY, JSON.stringify(toStore));
}
