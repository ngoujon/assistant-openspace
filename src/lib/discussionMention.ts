import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .trim();
}

function memberMatchesQuery(m: TreeMember, qNorm: string): boolean {
  if (!qNorm) return true;
  if (m.id === ORCHESTRATOR_ID) {
    const orchKeys = [
      ORCHESTRATOR_ID,
      "orchestrateur",
      "orchestre",
      normalizeKey(m.label),
    ];
    return orchKeys.some((k) => k.includes(qNorm) || qNorm.includes(k));
  }
  const lab = normalizeKey(m.label);
  const idn = normalizeKey(m.id);
  return (
    lab.includes(qNorm) ||
    idn.includes(qNorm) ||
    (qNorm.length >= 2 &&
      lab.split(/\s+/).some((w) => w.startsWith(qNorm) || w.includes(qNorm)))
  );
}

/** Membres affichables après `@` + filtre texte (orchestrateur en tête si match). */
export function filterMentionCandidates(
  members: TreeMember[],
  query: string,
): TreeMember[] {
  const qNorm = normalizeKey(query);
  const orch = members.find((m) => m.id === ORCHESTRATOR_ID);
  const rest = members.filter((m) => m.id !== ORCHESTRATOR_ID);
  const filteredRest = rest.filter((m) => memberMatchesQuery(m, qNorm));
  const out: TreeMember[] = [];
  if (orch && memberMatchesQuery(orch, qNorm)) out.push(orch);
  out.push(...filteredRest);
  return out;
}

/**
 * Résout un @token unique (sans espace) vers l’id membre si non ambigu, sinon null.
 */
export function resolveMentionToken(
  rawToken: string,
  members: TreeMember[],
): string | null {
  const token = rawToken.trim();
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
    (m) =>
      normalizeKey(m.label) === n ||
      normalizeKey(m.label).replace(/\s+/g, "-") === n,
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

/**
 * Premier @token du message → id membre si résolu sans ambiguïté, sinon null (routage auto).
 */
export function resolveForcedResponderFromMessage(
  text: string,
  members: TreeMember[],
): string | null {
  const match = /@([^\s@]+)/.exec(text);
  if (!match) return null;
  return resolveMentionToken(match[1], members);
}

/** Tous les @tokens résolus, sans doublon, ordre d’apparition dans le texte. */
export function collectMentionedMemberIds(
  text: string,
  members: TreeMember[],
): string[] {
  const re = /@([^\s@]+)/g;
  const seen = new Set<string>();
  const order: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = resolveMentionToken(m[1], members);
    if (id && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

/** Bloc Markdown à préfixer au brief mission pour prioriser les membres @mentionnés. */
export function buildMissionMentionPrefix(
  text: string,
  members: TreeMember[],
): string {
  const ids = collectMentionedMemberIds(text, members);
  if (ids.length === 0) return "";
  const byId = new Map(members.map((x) => [x.id, x]));
  const bullets = ids.map((id) => {
    const mem = byId.get(id);
    const label = mem?.label ?? id;
    return `- **${label}** (référence \`@${id}\`)`;
  });
  return (
    `## Mentions (@) dans le brief utilisateur\n\n` +
    `L’utilisateur s’adresse en particulier aux personnes ci-dessous. **Donne davantage le poids** à leur perspective dans les analyses, risques et recommandations lorsque le sujet touche leur périmètre.\n\n` +
    `${bullets.join("\n")}\n\n` +
    `---\n\n`
  );
}

/** Phrases qui déclenchent la fusion discussion → livrable. */
const APPLY_INTENT =
  /\b(appliquer\s+la\s+mise\s+à\s+jour|appliquer\s+les\s+changements|appliquer\s+les\s+modifications|applique(r)?\s+les\s+modifications|mets?\s+à\s+jour\s+le\s+(document|livrable|markdown|fichier))\b/i;

export function isArtifactApplyIntent(text: string): boolean {
  return APPLY_INTENT.test(text.trim());
}
