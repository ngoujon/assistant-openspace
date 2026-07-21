import { DEFAULT_LLM_PROVIDER, type LlmProvider } from "@/lib/llmProvider";
import type { MistralRateProfile } from "@/lib/mistralGateway";

const KEY = "openspace-app-settings-v1";

/** Assistant virtuel : une discipline dominante, arguments techniques autorisés, pas de persona fictionnelle. */
export const DEFAULT_SEED_SYSTEM_PROMPT =
  "Tu rédiges des consignes pour un **assistant virtuel de travail** (OpenSpace) : **spécialisation métier stricte** — tu infères le **domaine principal** à partir du libellé du poste et de sa place dans l’organigramme, puis tu **limites explicitement** le périmètre (ce que ce rôle couvre et **ce qu’il ne couvre pas**). L’assistant peut **prendre position**, **argumenter** et **expliquer techniquement** **à l’intérieur de ce domaine** (choix d’outils, architectures, méthodes, critères de qualité), sans dériver vers d’autres métiers. Aucun personnage fictionnel, aucun trait de personnalité « humain » au sens avatar. Réponds uniquement en français et respecte strictement la structure du message utilisateur.";

/**
 * Gabarit orienté pratiques professionnelles (ex. rigueur dev web : propreté du code, détails, qualité).
 * {{memberLabel}} = nom affiché ; {{place}} = phrase sur la position dans l’arbre (injectée par l’app).
 */
export const DEFAULT_SEED_USER_TEMPLATE = `## Contexte d’exécution

Tu remplis le champ stocké sous **« âme et rôle »** dans l’UI — le **fond** est celui d’un **expert de discipline**, pas d’un avatar. Tu peux être **exigeant et tranché sur le plan technique** tant que ça reste **dans le bon métier**.

### Libellé du membre
{{memberLabel}}

### Position dans l’organigramme
{{place}}

---

## Mission

Produire un texte **utilitaire et spécialisé** pour ce membre.

### Spécialisation (priorité absolue)

- Déduis **un domaine principal** à partir du libellé (ex. développement backend, UX recherche, finance, juridique, marketing, infra, etc.).
- **Rôle :** décris ce périmètre de façon **nette** : missions types, livrables, interfaces utiles avec d’autres pôles — et surtout ce que **ce rôle ne couvre pas** (ex. un **développeur backend** ne doit **pas** dispenser de conseils marketing, juridiques ou design produit sauf si le libellé l’indique explicitement ; un **sous-agent** reste **plus étroit** que son parent).
- Si le libellé est ambigu, **choisis la spécialisation la plus plausible** et **assume-la** en une phrase (sans diluer en généraliste « tout faire »).

### Pratiques, positions et standards

- **Pratiques et standards :** outils, méthodes, critères de qualité, risques typiques du métier — formulés de manière **prescriptive** (ce qu’il faut privilégier ou éviter).
- Tu peux inclure **des choix techniques assumés** avec **brève justification** (ex. préférence pour des patterns, des politiques de test, des exigences de sécurité) : ce sont des **positions d’expert**, pas du roleplay.
- **Interdit dans cette section :** compétences ou chapitres entiers **hors domaine** « au cas où » (liste fourre-tout), storytelling personnel, ton « personnage ».

**Interdit globalement :** section « Âme », traits de caractère fictionnels, humour de façade, métaphores de casting.

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
- Longueur cible : environ 12 à 22 lignes au total (les deux sections réunies) si le métier le justifie ; sinon rester concis.
- Ton : **professionnel, technique, tranché** dans sa discipline — fiche d’expert **spécialisé**, pas généraliste ni fiche de casting.`;

/** Température Mistral par défaut (0 = déterministe, 1 = plus créatif). */
export const DEFAULT_MISTRAL_TEMPERATURE = 0.45;

/**
 * Profil de débit par défaut : le plus prudent — un compte gratuit a des
 * quotas RPM très bas, mieux vaut sous-solliciter que déclencher des rafales
 * de 429 dès la première mission.
 */
export const DEFAULT_MISTRAL_RATE_PROFILE: MistralRateProfile = "free";

/** Valide/retombe sur le profil par défaut si la valeur stockée est inconnue. */
export function normalizeMistralRateProfile(v: unknown): MistralRateProfile {
  return v === "free" || v === "tier1" || v === "tier2"
    ? v
    : DEFAULT_MISTRAL_RATE_PROFILE;
}

/** Borne la température Mistral pour l’API (0–1). */
export function clampMistralTemperature(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.min(1, Math.max(0, n));
  }
  if (typeof n === "string" && n.trim() !== "") {
    const p = Number(n.replace(",", "."));
    if (Number.isFinite(p)) return Math.min(1, Math.max(0, p));
  }
  return DEFAULT_MISTRAL_TEMPERATURE;
}

export interface AppSettings {
  seedSystemPrompt: string;
  seedUserTemplate: string;
  /** Fournisseur LLM : Mistral (cloud) par défaut, ou Ollama local. */
  llmProvider: LlmProvider;
  /** Stockée dans ce navigateur uniquement (localStorage). */
  mistralApiKey: string;
  /** Modèle Mistral pour le chat / mission / équipe (choisi dans Paramètres uniquement). */
  mistralChatModel: string;
  /** Température (0–1) pour tous les appels Mistral ; ignorée si fournisseur Ollama. */
  mistralTemperature: number;
  /**
   * Palier de compte Mistral — ajuste la concurrence et l'espacement du
   * guichet (`mistralGateway`) pour rester sous le quota RPM réel.
   */
  mistralRateProfile: MistralRateProfile;
  /** Modèle Ollama pour le chat / mission / équipe (choisi dans Paramètres uniquement). */
  ollamaChatModel: string;
}

function defaults(): AppSettings {
  return {
    seedSystemPrompt: DEFAULT_SEED_SYSTEM_PROMPT,
    seedUserTemplate: DEFAULT_SEED_USER_TEMPLATE,
    llmProvider: DEFAULT_LLM_PROVIDER,
    mistralApiKey: "",
    mistralChatModel: "",
    mistralTemperature: DEFAULT_MISTRAL_TEMPERATURE,
    mistralRateProfile: DEFAULT_MISTRAL_RATE_PROFILE,
    ollamaChatModel: "",
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
    const prov: LlmProvider =
      o.llmProvider === "ollama" || o.llmProvider === "mistral"
        ? o.llmProvider
        : base.llmProvider;
    const key =
      typeof o.mistralApiKey === "string" ? o.mistralApiKey : base.mistralApiKey;
    const mistralModel =
      typeof o.mistralChatModel === "string"
        ? o.mistralChatModel
        : base.mistralChatModel;
    const mistralTemperature = clampMistralTemperature(
      o.mistralTemperature ?? base.mistralTemperature,
    );
    const mistralRateProfile = normalizeMistralRateProfile(
      o.mistralRateProfile,
    );
    const ollamaModel =
      typeof o.ollamaChatModel === "string"
        ? o.ollamaChatModel
        : base.ollamaChatModel;
    return {
      seedSystemPrompt: sys,
      seedUserTemplate: usr,
      llmProvider: prov,
      mistralApiKey: key,
      mistralChatModel: mistralModel,
      mistralTemperature,
      mistralRateProfile,
      ollamaChatModel: ollamaModel,
    };
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
      llmProvider: s.llmProvider,
      mistralApiKey: s.mistralApiKey,
      mistralChatModel: s.mistralChatModel,
      mistralTemperature: clampMistralTemperature(s.mistralTemperature),
      mistralRateProfile: normalizeMistralRateProfile(s.mistralRateProfile),
      ollamaChatModel: s.ollamaChatModel,
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
