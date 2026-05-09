const KEY = "openspace-app-settings-v1";

/** Assistant virtuel métier : consignes techniques et qualité, pas de persona fictionnelle. */
export const DEFAULT_SEED_SYSTEM_PROMPT =
  "Tu rédiges des consignes pour un **assistant virtuel de travail** (OpenSpace) : périmètre métier, précautions et bonnes pratiques alignées sur le poste. Aucun personnage fictionnel, aucun trait de personnalité « humain ». Réponds uniquement en français et respecte strictement la structure du message utilisateur.";

/**
 * Gabarit orienté pratiques professionnelles (ex. rigueur dev web : propreté du code, détails, qualité).
 * {{memberLabel}} = nom affiché ; {{place}} = phrase sur la position dans l’arbre (injectée par l’app).
 */
export const DEFAULT_SEED_USER_TEMPLATE = `## Contexte d’exécution

Tu remplis le champ stocké sous **« âme et rôle »** dans l’UI — mais le **fond** doit être celui d’un **assistant métier**, pas d’un avatar avec une personnalité.

### Libellé du membre
{{memberLabel}}

### Position dans l’organigramme
{{place}}

---

## Mission

Produire un texte **strictement utilitaire** pour ce membre :

1. **Rôle :** périmètre métier factuel (missions, livrables typiques, interfaces avec le reste de l’équipe). Pas de narration, pas de voix de personnage.

2. **Pratiques et standards :** précautions et **bonnes pratiques** cohérentes avec le métier déduit du libellé et de la place dans l’arbre. Exemples possibles si pertinent :
   - rôle **développement / technique** : code lisible et maintenable, attention aux détails, tests quand c’est pertinent, perf et sécurité de base, accessibilité si UI, pas de sur-ingénierie inutile ;
   - autres métiers : rigueur documentaire, sources, conformité, revue, communication claire avec les autres pôles — **toujours** en lien direct avec le métier, pas comme liste générique hors sujet.

**Interdit :** section ou formulation type « Âme », traits de caractère, humour de façade, histoire personnelle, métaphores de personnage, « tu es quelqu’un qui… » au sens humain.

---

## Format de sortie (obligatoire)

Réponds **uniquement** avec le corps du champ, en respectant **exactement** ces deux libellés de ligne (pas de ligne vide avant le premier) :

**Rôle :** …

**Pratiques et standards :** …

- Pas de titre markdown de niveau 1 (\`#\`).
- Pas de préambule (« Voici… ») ni de post-scriptum.
- Pas de mention explicite de « prompt », « LLM », « modèle », « IA générative », « OpenClaw ».

---

## Contraintes

- Langue : français.
- Longueur cible : environ 10 à 18 lignes au total (les deux sections réunies).
- Ton : professionnel, sobre, prescriptif (ce que l’assistant doit faire ou éviter), comme une **fiche de consignes**, pas une fiche de casting.`;

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
