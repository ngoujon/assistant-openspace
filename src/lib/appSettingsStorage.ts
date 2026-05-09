const KEY = "openspace-app-settings-v1";

export const DEFAULT_SEED_SYSTEM_PROMPT =
  "Tu écris des fiches de personnage pour une équipe virtuelle pilotée par LLM. Réponds uniquement en français.";

/** {{memberLabel}} = nom affiché ; {{place}} = phrase sur la position dans l’arbre (injectée par l’app). */
export const DEFAULT_SEED_USER_TEMPLATE = `Nom du membre : **{{memberLabel}}**

{{place}}

Rédige un texte structuré pour le champ « âme et rôle » du membre, au format :

Rôle : … (missions, périmètre, interactions avec le reste de l’équipe)

Âme : … (ton, valeurs, style de décision)

Longueur : environ 8–15 lignes au total. Pas de titre markdown de niveau 1. Pas de mention de « prompt » ou « LLM ».`;

export interface AppSettings {
  seedSystemPrompt: string;
  seedUserTemplate: string;
}

function defaults(): AppSettings {
  return {
    seedSystemPrompt: DEFAULT_SEED_SYSTEM_PROMPT,
    seedUserTemplate: DEFAULT_SEED_USER_TEMPLATE,
  };
}

export function loadAppSettings(): AppSettings {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return base;
    const o = parsed as Record<string, unknown>;
    const sys =
      typeof o.seedSystemPrompt === "string" && o.seedSystemPrompt.trim()
        ? o.seedSystemPrompt.trim()
        : base.seedSystemPrompt;
    const usr =
      typeof o.seedUserTemplate === "string" && o.seedUserTemplate.trim()
        ? o.seedUserTemplate.trim()
        : base.seedUserTemplate;
    return { seedSystemPrompt: sys, seedUserTemplate: usr };
  } catch {
    return base;
  }
}

export function saveAppSettings(s: AppSettings): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      seedSystemPrompt: s.seedSystemPrompt.trim(),
      seedUserTemplate: s.seedUserTemplate.trim(),
    }),
  );
}

export function interpolateSeedUserTemplate(
  template: string,
  memberLabel: string,
  place: string,
): string {
  return template
    .replaceAll("{{memberLabel}}", memberLabel)
    .replaceAll("{{place}}", place);
}
