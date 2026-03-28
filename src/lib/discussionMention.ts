import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .trim();
}

/**
 * Premier @token du message → id membre si résolu sans ambiguïté, sinon null (routage auto).
 */
export function resolveForcedResponderFromMessage(
  text: string,
  members: TreeMember[],
): string | null {
  const match = /@([^\s@]+)/.exec(text);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const n = normalizeKey(token);

  if (
    token === ORCHESTRATOR_ID ||
    n === "orchestrateur" ||
    n === "orchestre"
  ) {
    return ORCHESTRATOR_ID;
  }

  const byId = members.find((m) => m.id === token);
  if (byId) return byId.id;

  const nonOrch = members.filter((m) => m.id !== ORCHESTRATOR_ID);
  const exact = nonOrch.filter(
    (m) => normalizeKey(m.label) === n || normalizeKey(m.label).replace(/\s+/g, "-") === n,
  );
  if (exact.length === 1) return exact[0].id;

  const partial = nonOrch.filter((m) => {
    const lab = normalizeKey(m.label);
    return (
      lab.includes(n) ||
      (n.length >= 3 && lab.split(/\s+/).some((w) => w.startsWith(n)))
    );
  });
  if (partial.length === 1) return partial[0].id;

  return null;
}

/** Phrases qui déclenchent la fusion discussion → livrable. */
const APPLY_INTENT =
  /\b(appliquer\s+la\s+mise\s+à\s+jour|appliquer\s+les\s+changements|appliquer\s+les\s+modifications|applique(r)?\s+les\s+modifications|mets?\s+à\s+jour\s+le\s+(document|livrable|markdown|fichier))\b/i;

export function isArtifactApplyIntent(text: string): boolean {
  return APPLY_INTENT.test(text.trim());
}
