import {
  ORCHESTRATOR_ID,
  type TreeMember,
} from "@/lib/teamTreeStorage";

export type DisplayKind = "master" | "agent" | "sub";

export interface DisplayNode {
  id: string;
  label: string;
  kind: DisplayKind;
  children?: DisplayNode[];
}

export function membersToDisplayTree(
  members: TreeMember[],
): DisplayNode | null {
  const orch = members.find((m) => m.id === ORCHESTRATOR_ID);
  if (!orch) return null;

  function build(id: string, depth: number): DisplayNode {
    const m = members.find((x) => x.id === id);
    if (!m) {
      return { id, label: "?", kind: "sub" };
    }
    const kids = members
      .filter((c) => c.parentId === id)
      .sort((a, b) => a.order - b.order);
    const kind: DisplayKind =
      depth === 0 ? "master" : depth === 1 ? "agent" : "sub";
    const children = kids.map((c) => build(c.id, depth + 1));
    return {
      id: m.id,
      label: m.label,
      kind,
      children: children.length ? children : undefined,
    };
  }

  return build(ORCHESTRATOR_ID, 0);
}

export function parentLabelFor(
  memberId: string,
  members: TreeMember[],
): string | null {
  const m = members.find((x) => x.id === memberId);
  if (!m?.parentId) return null;
  if (m.parentId === ORCHESTRATOR_ID) return "Orchestrateur";
  const p = members.find((x) => x.id === m.parentId);
  return p?.label ?? null;
}
