const KEY = "openspace-app-settings-v1";

/** Aligné sur l’esprit des prompts OpenClaw : sections fixes, mission explicite, format de sortie et garde-fous. */
export const DEFAULT_SEED_SYSTEM_PROMPT =
  "Tu rédiges des profils « persona » pour une équipe virtuelle OpenSpace (équivalent d’une couche SOUL : identité + règles d’exécution). Réponds uniquement en français et respecte strictement la structure demandée dans le message utilisateur.";

/**
 * Gabarit type OpenClaw : contexte d’exécution → mission → format → contraintes.
 * {{memberLabel}} = nom affiché ; {{place}} = phrase sur la position dans l’arbre (injectée par l’app).
 */
export const DEFAULT_SEED_USER_TEMPLATE = `## Contexte d’exécution

Tu produis la couche **âme et rôle** pour **un seul** membre de l’équipe virtuelle.

### Identité affichée
{{memberLabel}}

### Position dans l’organigramme
{{place}}

---

## Mission

Rédiger le texte qui sera collé dans le champ **« âme et rôle »** : missions concrètes, périmètre, interactions avec le reste de l’équipe, puis personnalité opérationnelle (ton, valeurs, style de décision).

---

## Format de sortie (obligatoire)

Réponds **uniquement** avec le corps du champ, en respectant **exactement** ces deux libellés de ligne (pas de ligne avant le premier) :

**Rôle :** …

**Âme :** …

- Pas de titre markdown de niveau 1 (\`#\`).
- Pas de préambule du type « Voici… » ni de post-scriptum.
- Pas de mention explicite de « prompt », « LLM », « modèle », « OpenClaw », « système » ou « IA générative ».

---

## Contraintes

- Langue : français.
- Longueur cible : environ 8 à 15 lignes au total (Rôle + Âme).
- Style : précis, actionnable, crédible dans un contexte produit / conseil / craft métier.`;

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
