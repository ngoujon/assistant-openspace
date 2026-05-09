import { AGENT_SOUL_SEEDS } from "@/data/teamSeeds";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

const KEY = "openspace-team-archives-v1";

export interface TeamArchiveEntry {
  id: string;
  name: string;
  createdAt: number;
  members: TreeMember[];
  souls: Record<string, string>;
}

function isTreeMember(x: unknown): x is TreeMember {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.label === "string" &&
    (m.parentId === null || typeof m.parentId === "string") &&
    typeof m.order === "number"
  );
}

function validateTeamMembers(list: unknown): TreeMember[] | null {
  if (!Array.isArray(list)) return null;
  const members = list.filter(isTreeMember);
  const orch = members.find(
    (m) => m.id === ORCHESTRATOR_ID && m.parentId === null,
  );
  if (!orch) return null;
  return members;
}

function parseSouls(x: unknown): Record<string, string> {
  if (!x || typeof x !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function loadTeamArchives(): TeamArchiveEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: TeamArchiveEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.name !== "string") continue;
      const createdAt =
        typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
          ? o.createdAt
          : Date.now();
      const members = validateTeamMembers(o.members);
      if (!members) continue;
      const souls = parseSouls(o.souls);
      out.push({
        id: o.id,
        name: o.name.trim() || "Sans titre",
        createdAt,
        members: structuredClone(members),
        souls,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveTeamArchives(entries: TeamArchiveEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** Capture les textes « âme » pour chaque membre de l’arbre (ids dynamiques inclus). */
function soulsSliceForMembers(
  members: TreeMember[],
  souls: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of members) {
    out[m.id] = souls[m.id] ?? "";
  }
  return out;
}

/**
 * Reconstruit la map d’âmes après restauration : valeurs archivées, sinon seeds pour les ids connus.
 */
export function soulsAfterRestore(
  members: TreeMember[],
  archivedSouls: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of members) {
    if (Object.prototype.hasOwnProperty.call(archivedSouls, m.id)) {
      out[m.id] = archivedSouls[m.id];
    } else {
      out[m.id] = AGENT_SOUL_SEEDS[m.id] ?? "";
    }
  }
  return out;
}

export function appendTeamArchive(
  name: string,
  members: TreeMember[],
  souls: Record<string, string>,
): void {
  const trimmed = name.trim() || "Sans titre";
  const entry: TeamArchiveEntry = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: Date.now(),
    members: structuredClone(members),
    souls: soulsSliceForMembers(members, souls),
  };
  const list = loadTeamArchives();
  list.push(entry);
  saveTeamArchives(list.sort((a, b) => b.createdAt - a.createdAt));
}

export function deleteTeamArchive(id: string): void {
  const list = loadTeamArchives().filter((e) => e.id !== id);
  saveTeamArchives(list);
}
