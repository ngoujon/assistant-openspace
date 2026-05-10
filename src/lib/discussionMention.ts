import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

/** Mention verrouillée insérée depuis le menu : `@[Libellé visible]` (échappement \ et ]). */
export function escapeMentionLabelForBracket(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function unescapeMentionLabelFromBracket(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && i + 1 < raw.length) {
      out += raw[i + 1];
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/** Insère une mention affichée par le libellé du membre (routage via le même libellé). */
export function formatBracketMention(member: TreeMember): string {
  return `@[${escapeMentionLabelForBracket(member.label)}]`;
}

/**
 * Segment `@[…]` commençant à `at` (index du `@`).
 * `innerEscaped` est le littéral entre crochets (avec `\]` / `\\` conservés) pour un seul `unescape`.
 */
export function parseBracketMentionAt(
  text: string,
  at: number,
): { end: number; innerEscaped: string } | null {
  if (text.slice(at, at + 2) !== "@[") return null;
  let k = at + 2;
  let innerEscaped = "";
  while (k < text.length) {
    if (text[k] === "\\") {
      innerEscaped += text[k];
      k++;
      if (k >= text.length) return null;
      innerEscaped += text[k];
      k++;
      continue;
    }
    if (text[k] === "]") {
      return { end: k + 1, innerEscaped };
    }
    innerEscaped += text[k];
    k++;
  }
  return null;
}

/** Plages `@[…]` complètes dans le texte (indices `[start, end)` end exclus). */
export function findBracketMentionSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < text.length) {
    if (text.slice(i, i + 2) !== "@[") {
      i++;
      continue;
    }
    const p = parseBracketMentionAt(text, i);
    if (p) {
      spans.push({ start: i, end: p.end });
      i = p.end;
    } else {
      i++;
    }
  }
  return spans;
}

/** Résout le libellé affiché dans `@[…]` vers un id membre. */
export function resolveBracketMentionInner(
  innerEscaped: string,
  members: TreeMember[],
): string | null {
  const label = unescapeMentionLabelFromBracket(innerEscaped).trim();
  if (!label) return null;
  const exact = members.filter((m) => m.label.trim() === label);
  if (exact.length === 1) return exact[0].id;
  const n = normalizeKey(label);
  const byNorm = members.filter((m) => normalizeKey(m.label) === n);
  if (byNorm.length >= 1) return byNorm[0].id;
  return null;
}

type ScannedMention =
  | { kind: "bracket"; start: number; end: number; innerEscaped: string }
  | { kind: "plain"; start: number; end: number; token: string };

function scanMentionsInOrder(text: string): ScannedMention[] {
  const out: ScannedMention[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "@") {
      i++;
      continue;
    }
    if (text.slice(i, i + 2) === "@[") {
      const p = parseBracketMentionAt(text, i);
      if (p) {
        out.push({
          kind: "bracket",
          start: i,
          end: p.end,
          innerEscaped: p.innerEscaped,
        });
        i = p.end;
        continue;
      }
      i++;
      continue;
    }
    const rest = text.slice(i + 1);
    const m = /^([^\s@\[]+)/.exec(rest);
    if (m) {
      out.push({
        kind: "plain",
        start: i,
        end: i + 1 + m[1].length,
        token: m[1],
      });
      i += 1 + m[1].length;
      continue;
    }
    i++;
  }
  return out;
}

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
  for (const x of scanMentionsInOrder(text)) {
    const id =
      x.kind === "bracket"
        ? resolveBracketMentionInner(x.innerEscaped, members)
        : resolveMentionToken(x.token, members);
    if (id) return id;
  }
  return null;
}

/** Tous les @tokens résolus, sans doublon, ordre d’apparition dans le texte. */
export function collectMentionedMemberIds(
  text: string,
  members: TreeMember[],
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const x of scanMentionsInOrder(text)) {
    const id =
      x.kind === "bracket"
        ? resolveBracketMentionInner(x.innerEscaped, members)
        : resolveMentionToken(x.token, members);
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
