export type MissionStepVisualKind =
  | "done"
  | "final-doc"
  | "orchestrator"
  | "delegation"
  | "specialist"
  | "synthesis"
  | "pole-solo"
  | "handoff"
  | "default";

export interface ParsedMissionStep {
  step: number | null;
  total: number | null;
  /** Texte brut après l’éventuel préfixe « Étape n/m — » (conservé pour clés / debug). */
  description: string;
  kind: MissionStepVisualKind;
  /** Libellé court pour la pastille (membre) ; `null` → utiliser le libellé de type (ex. Terminé). */
  displayPill: string | null;
  /** Texte d’action seul, sans préfixe « Nom — » (affiché dans mission-step-desc). */
  detailText: string;
}

/** Séparateur « acteur — détail » tel qu’émis par la mission (`—`) ou variantes (copie / historique). */
const ACTOR_DETAIL_SEP = /\s[—–]\s|\s-\s/;

function extractActorPathAndDetail(description: string): {
  actorPath: string | null;
  detailText: string;
} {
  const t = description.trim();
  const intervenant = /^Intervenant\s*:\s*(.+)$/i.exec(t);
  if (intervenant) {
    return {
      actorPath: intervenant[1].trim(),
      detailText: "",
    };
  }
  const m = ACTOR_DETAIL_SEP.exec(t);
  if (!m) {
    return { actorPath: null, detailText: t };
  }
  const left = t.slice(0, m.index).trim();
  const rest = t.slice(m.index + m[0].length).trim();
  return { actorPath: left || null, detailText: rest };
}

function pillActorFromPath(
  actorPath: string | null,
  kind: MissionStepVisualKind,
): string | null {
  if (!actorPath) return null;
  const bits = actorPath
    .split(/\s*→\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bits.length >= 2) {
    if (kind === "delegation") return bits[0];
    return bits[1];
  }
  return actorPath;
}

/**
 * Interprète les lignes émises par `runMissionPipeline` (`onProgress`) et le journal Discussion.
 */
export function parseMissionProgressLine(raw: string): ParsedMissionStep {
  const trimmed = raw.trim();
  const m = /^Étape\s+(\d+)\s*\/\s*(\d+)\s*—\s*(.+)$/i.exec(trimmed);
  let step: number | null = null;
  let total: number | null = null;
  let description = trimmed;
  if (m) {
    step = Number.parseInt(m[1], 10);
    total = Number.parseInt(m[2], 10);
    description = m[3].trim();
  }

  const d = description.toLowerCase();
  const full = trimmed.toLowerCase();

  let kind: MissionStepVisualKind = "default";
  if (/^intervenant\s*:/i.test(description)) {
    kind = "handoff";
  } else if (/terminé/.test(full)) {
    kind = "done";
  } else if (
    d.includes("document final") ||
    d.includes("readme") ||
    d.includes("livrable markdown") ||
    (d.startsWith("orchestrateur") && d.includes("rédaction"))
  ) {
    kind = "final-doc";
  } else if (d.startsWith("orchestrateur") || d.startsWith("routage")) {
    kind = "orchestrator";
  } else if (d.includes("consignes au sous-agent")) {
    kind = "delegation";
  } else if (d.includes("travail spécialisé")) {
    kind = "specialist";
  } else if (
    d.includes("synthèse et ajustements") ||
    d.includes("intégration des apports du pôle")
  ) {
    kind = "synthesis";
  } else if (d.includes("analyse directe")) {
    kind = "pole-solo";
  }

  const { actorPath, detailText } = extractActorPathAndDetail(description);

  let displayPill: string | null = null;
  if (kind === "done") {
    displayPill = null;
  } else if (kind === "handoff") {
    displayPill = actorPath;
  } else {
    displayPill = pillActorFromPath(actorPath, kind);
  }

  return { step, total, description, kind, displayPill, detailText };
}

/** Pourcentage 0–100 pour la barre, ou `null` si indéterminé. */
export function missionProgressPercent(lines: string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = parseMissionProgressLine(lines[i]);
    if (p.kind === "done") return 100;
    if (p.step != null && p.total != null && p.total > 0) {
      return Math.min(100, Math.round((p.step / p.total) * 100));
    }
  }
  return null;
}
