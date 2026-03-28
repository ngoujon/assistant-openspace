const KEY = "openspace-team-tree-v1";

export const ORCHESTRATOR_ID = "orchestrateur";

export interface TreeMember {
  id: string;
  label: string;
  /** `null` uniquement pour l’orchestrateur */
  parentId: string | null;
  order: number;
}

const DEFAULT_TEAM_MEMBERS: TreeMember[] = [
  { id: ORCHESTRATOR_ID, label: "Orchestrateur", parentId: null, order: 0 },
  { id: "da", label: "Directeur Artistique", parentId: ORCHESTRATOR_ID, order: 0 },
  { id: "cto", label: "CTO", parentId: ORCHESTRATOR_ID, order: 1 },
  { id: "juridique", label: "Directeur juridique", parentId: ORCHESTRATOR_ID, order: 2 },
  { id: "da-uiux", label: "Designer UI / UX", parentId: "da", order: 0 },
  { id: "cto-dev", label: "Développeur", parentId: "cto", order: 0 },
  { id: "jur-dpo", label: "DPO", parentId: "juridique", order: 0 },
];

export function loadTeamMembers(): TreeMember[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_TEAM_MEMBERS);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return structuredClone(DEFAULT_TEAM_MEMBERS);
    const list = parsed as TreeMember[];
    const orch = list.find(
      (m) => m.id === ORCHESTRATOR_ID && m.parentId === null,
    );
    if (!orch) return structuredClone(DEFAULT_TEAM_MEMBERS);
    return list;
  } catch {
    return structuredClone(DEFAULT_TEAM_MEMBERS);
  }
}

export function saveTeamMembers(members: TreeMember[]): void {
  localStorage.setItem(KEY, JSON.stringify(members));
}

export function depthOf(id: string, members: TreeMember[]): number {
  let d = 0;
  let cur: TreeMember | undefined = members.find((x) => x.id === id);
  const seen = new Set<string>();
  while (cur?.parentId) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    d++;
    const pid = cur.parentId;
    cur = members.find((x) => x.id === pid);
  }
  return d;
}

export function subtreeIds(rootId: string, members: TreeMember[]): Set<string> {
  const s = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const pid of frontier) {
      for (const m of members) {
        if (m.parentId === pid && !s.has(m.id)) {
          s.add(m.id);
          next.push(m.id);
        }
      }
    }
    frontier = next;
  }
  return s;
}

/** Sous l’orchestrateur ou sous un membre de profondeur 1. Les feuilles (prof. 2) ne reçoivent pas de drop. */
export function canReparent(
  dragId: string,
  newParentId: string,
  members: TreeMember[],
): boolean {
  if (dragId === ORCHESTRATOR_ID) return false;
  if (newParentId === dragId) return false;
  const sub = subtreeIds(dragId, members);
  if (sub.has(newParentId)) return false;

  if (newParentId === ORCHESTRATOR_ID) return true;

  const parentDepth = depthOf(newParentId, members);
  if (parentDepth !== 1) return false;

  const dragHasChildren = members.some((m) => m.parentId === dragId);
  if (dragHasChildren) return false;

  return true;
}

export function reparentMember(
  members: TreeMember[],
  dragId: string,
  newParentId: string,
): TreeMember[] {
  if (!canReparent(dragId, newParentId, members)) return members;

  const siblings = members.filter(
    (m) => m.parentId === newParentId && m.id !== dragId,
  );
  const maxOrder = siblings.reduce((a, m) => Math.max(a, m.order), -1);

  return members.map((m) =>
    m.id === dragId
      ? { ...m, parentId: newParentId, order: maxOrder + 1 }
      : m,
  );
}

export function addMemberUnder(
  members: TreeMember[],
  parentId: string,
  label = "Nouveau membre",
): TreeMember[] {
  const id = crypto.randomUUID();
  const siblings = members.filter((m) => m.parentId === parentId);
  const maxOrder = siblings.reduce((a, m) => Math.max(a, m.order), -1);
  return [...members, { id, label, parentId, order: maxOrder + 1 }];
}

export function updateMemberLabel(
  members: TreeMember[],
  id: string,
  label: string,
): TreeMember[] {
  return members.map((m) =>
    m.id === id ? { ...m, label: label.trim() || m.label } : m,
  );
}

export function removeMemberSubtree(
  members: TreeMember[],
  id: string,
): TreeMember[] {
  if (id === ORCHESTRATOR_ID) return members;
  const drop = subtreeIds(id, members);
  return members.filter((m) => !drop.has(m.id));
}
