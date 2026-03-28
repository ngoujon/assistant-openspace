export type MissionStepVisualKind =
  | "done"
  | "final-doc"
  | "orchestrator"
  | "delegation"
  | "specialist"
  | "synthesis"
  | "pole-solo"
  | "default";

export interface ParsedMissionStep {
  step: number | null;
  total: number | null;
  description: string;
  kind: MissionStepVisualKind;
}

/**
 * Interprète les lignes émises par `runMissionPipeline` (`onProgress`).
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
  if (/terminé/.test(full)) {
    kind = "done";
  } else if (
    d.includes("document final") ||
    d.includes("readme") ||
    (d.startsWith("orchestrateur") && d.includes("rédaction"))
  ) {
    kind = "final-doc";
  } else if (d.startsWith("orchestrateur")) {
    kind = "orchestrator";
  } else if (d.includes("consignes au sous-agent")) {
    kind = "delegation";
  } else if (d.includes("travail spécialisé")) {
    kind = "specialist";
  } else if (d.includes("synthèse et ajustements")) {
    kind = "synthesis";
  } else if (d.includes("analyse directe")) {
    kind = "pole-solo";
  }

  return { step, total, description, kind };
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
