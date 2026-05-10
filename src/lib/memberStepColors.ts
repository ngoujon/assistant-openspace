import type { CSSProperties } from "react";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

function memberById(members: TreeMember[]): Map<string, TreeMember> {
  return new Map(members.map((m) => [m.id, m]));
}

/** Hue 0–359 stable à partir de l’id (visuellement « aléatoire » mais reproductible). */
export function stableHueFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

/**
 * Pôle (enfant direct de l’orchestrateur) dont dépend ce membre ;
 * `null` pour l’orchestrateur lui-même.
 */
export function pillarMemberFor(
  member: TreeMember,
  members: TreeMember[],
): TreeMember | null {
  if (member.id === ORCHESTRATOR_ID) return null;
  const map = memberById(members);
  let cur: TreeMember | undefined = member;
  while (cur?.parentId && cur.parentId !== ORCHESTRATOR_ID) {
    cur = map.get(cur.parentId);
  }
  if (!cur || cur.parentId !== ORCHESTRATOR_ID) return null;
  return cur;
}

function childrenSorted(parentId: string, members: TreeMember[]): TreeMember[] {
  return members
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Luminosité (sous-agents : variantes clair / foncé du même hue que le pôle). */
function accentLightness(member: TreeMember, members: TreeMember[]): number {
  if (member.id === ORCHESTRATOR_ID) return 50;
  if (member.parentId === ORCHESTRATOR_ID) return 46;
  const pillar = pillarMemberFor(member, members);
  if (!pillar) return 48;
  const subs = childrenSorted(pillar.id, members);
  const idx = Math.max(0, subs.findIndex((s) => s.id === member.id));
  const cycle = [62, 34, 56, 32, 66, 38];
  return cycle[idx % cycle.length];
}

function accentHue(member: TreeMember, members: TreeMember[]): number {
  const pillar = pillarMemberFor(member, members);
  if (pillar) return stableHueFromId(pillar.id);
  return stableHueFromId(member.id);
}

/** Variables CSS pour `--step-accent` (point + connecteur + bordure carte). */
export function memberStepAccentStyle(
  member: TreeMember | null,
  members: TreeMember[],
): CSSProperties | undefined {
  if (!member) return undefined;
  const h = accentHue(member, members);
  const l = accentLightness(member, members);
  const s = 56;
  return {
    "--step-accent": `hsl(${h} ${s}% ${l}%)`,
  } as CSSProperties;
}

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Résout un libellé affiché dans la frise (ex. « CTO », « Orchestrateur ») vers un membre. */
export function findMemberByProgressLabel(
  label: string,
  members: TreeMember[],
): TreeMember | null {
  const t = normLabel(label);
  if (!t) return null;
  const orch = members.find((m) => m.id === ORCHESTRATOR_ID);
  if (orch) {
    const ol = normLabel(orch.label);
    if (t === ol || t === "orchestrateur") return orch;
  }
  const hit = members.find((m) => normLabel(m.label) === t);
  return hit ?? null;
}
