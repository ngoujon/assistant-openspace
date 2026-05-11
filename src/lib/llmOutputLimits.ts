/**
 * Plafonds de **génération** (tokens de sortie) pour limiter durée / timeouts
 * (proxy nginx, API cloud). Les prompts mission/discussion doivent rester alignés.
 *
 * Pour ajuster sans rebuild de logique : `VITE_OPENSPACE_MAX_AGENT_TOKENS`,
 * `VITE_OPENSPACE_MAX_DOCUMENT_TOKENS` (nombre entier, bornes ci-dessous).
 */

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  try {
    const raw = import.meta.env[name] as string | undefined;
    if (raw == null || String(raw).trim() === "") return fallback;
    return clampInt(Number(raw), min, max);
  } catch {
    return fallback;
  }
}

/** ~½ page A4 dense : orchestrateur intermédiaire, piliers, sous-agents, synthèses pôle, stream discussion. */
export const LLM_MAX_TOKENS_AGENT_STEP = envInt(
  "VITE_OPENSPACE_MAX_AGENT_TOKENS",
  512,
  128,
  4096,
);

/** Routage discussion (JSON), titres sidebar. */
export const LLM_MAX_TOKENS_ROUTING = 384;

/**
 * Rapport final mission + fusion livrable discussion (sortie Markdown potentiellement longue).
 * Plafond pour éviter des générations infinies ; reste nettement au-dessus d’une étape « agent ».
 */
export const LLM_MAX_TOKENS_DOCUMENT = envInt(
  "VITE_OPENSPACE_MAX_DOCUMENT_TOKENS",
  8192,
  1024,
  32_768,
);

/** Génération « âme et rôle » (seed membre). */
export const LLM_MAX_TOKENS_SEED = 1536;

/** Rappel injecté dans les prompts d’étapes « agent » (cohérent avec LLM_MAX_TOKENS_AGENT_STEP). */
export const LLM_AGENT_OUTPUT_BUDGET_FR = `**Budget de sortie (obligatoire)** : environ **une demi-page A4** de texte utile au total — rédige **dense** (titres \`###\`, listes à puces courtes, phrases télégraphiques). **Pas** de remplissage, **pas** de répétition du contexte. Si le sujet est vaste, **priorise** les points à plus fort impact et termine par **une ligne** « Suite possible : … » listant ce qui resterait à creuser plus tard (sans promettre un rapport complet ici).`;
