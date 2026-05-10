import { completeLlmChat, streamLlmChat } from "@/lib/llmChat";
import type { OllamaChatMessage } from "@/lib/ollama";
import type { LlmProvider } from "@/lib/llmProvider";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";
import type { ChatMessage } from "@/types";

const MAX_MISSION_BRIEF_IN_CTX = 8000;
const MAX_ARTIFACT_EXCERPT_ROUTING = 5000;
const MAX_ARTIFACT_EXCERPT_STREAM = 14_000;

/** Consignes communes : le chat n’est pas le canal du document complet. */
const DISCUSSION_REPLY_STYLE_RULES = `## Règles pour tes messages dans ce chat

- Réponses **courtes** : questions de clarification, confirmation que tu as compris, points encore flous — quelques phrases, pas un rapport long.
- **Ne recopie pas** le livrable Markdown ni de longues portions du document : la version fichier à jour est produite par la **fusion** (formulation du type « appliquer la mise à jour » ou le bouton dédié) ; l’utilisateur récupère le fichier via **Télécharger**.
- Tu peux citer **au plus** une courte phrase ou un titre de section si indispensable pour poser une question ciblée.`;

function sliceText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 24).trimEnd()}\n\n[… tronqué …]`;
}

/**
 * Brief mission + extrait du livrable pour le routage ou le stream discussion.
 */
export function formatMissionAndArtifactForDiscussion(
  missionUserBrief: string | undefined | null,
  artifactMarkdown: string | undefined | null,
  artifactMaxChars: number,
): string {
  const parts: string[] = [];
  if (missionUserBrief?.trim()) {
    parts.push(
      `### Brief initial de la mission (première demande utilisateur)\n\n${sliceText(missionUserBrief, MAX_MISSION_BRIEF_IN_CTX)}`,
    );
  }
  if (artifactMarkdown?.trim()) {
    parts.push(
      `### Livrable Markdown (extrait — le document en interface peut être plus long)\n\n\`\`\`markdown\n${sliceText(artifactMarkdown, artifactMaxChars)}\n\`\`\``,
    );
  }
  if (!parts.length) return "";
  return `${parts.join("\n\n---\n\n")}\n\n---\n\n`;
}

export interface DiscussionRouting {
  responderId: string;
  brief: string;
  userNote?: string;
}

function soul(souls: Record<string, string>, id: string): string {
  return (
    souls[id]?.trim() ||
    "Tu es un assistant expert. Réponds en français, de façon claire."
  );
}

function formatRoster(members: TreeMember[]): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  const lines: string[] = [
    `- id: \`${ORCHESTRATOR_ID}\` — Orchestrateur (coordination, synthèses, arbitrage)`,
  ];
  for (const m of members) {
    if (m.parentId === null) continue;
    const parentLabel =
      m.parentId === ORCHESTRATOR_ID
        ? "directement sous l’orchestrateur"
        : `sous « ${byId.get(m.parentId)?.label ?? "?"} »`;
    lines.push(`- id: \`${m.id}\` — ${m.label} (${parentLabel})`);
  }
  return lines.join("\n");
}

export function formatHistoryForRouting(
  messages: ChatMessage[],
  maxChars = 8000,
): string {
  const parts = messages.map((m) => {
    const who =
      m.role === "user"
        ? "Utilisateur"
        : m.speakerLabel
          ? `Équipe (${m.speakerLabel})`
          : "Équipe";
    return `### ${who}\n${m.content}`;
  });
  let s = parts.join("\n\n");
  if (s.length > maxChars) {
    s = "[…début tronqué…]\n\n" + s.slice(-(maxChars - 40));
  }
  return s || "(début de conversation)";
}

function parseRouting(raw: string): DiscussionRouting {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("JSON de routage introuvable");
  }
  const obj = JSON.parse(t.slice(start, end + 1)) as {
    responderId?: string;
    brief?: string;
    userNote?: string;
  };
  if (!obj.responderId || typeof obj.responderId !== "string") {
    throw new Error("responderId manquant");
  }
  return {
    responderId: obj.responderId.trim(),
    brief:
      typeof obj.brief === "string" && obj.brief.trim()
        ? obj.brief.trim()
        : "Réponds de façon utile et structurée.",
    userNote:
      typeof obj.userNote === "string" && obj.userNote.trim()
        ? obj.userNote.trim()
        : undefined,
  };
}

function validateResponderId(id: string, members: TreeMember[]): string {
  if (members.some((m) => m.id === id)) return id;
  return ORCHESTRATOR_ID;
}

export function buildDirectMentionBrief(
  responderId: string,
  members: TreeMember[],
): string {
  const m = members.find((x) => x.id === responderId);
  if (responderId === ORCHESTRATOR_ID || !m) {
    return `L’utilisateur t’a ciblé avec une **@mention** (orchestrateur). Réponds : synthèse, arbitrage, ou mise en cohérence avec le reste de l’équipe. Si un **livrable Markdown** a été évoqué, tu peux indiquer comment tes briefs s’y appliquent.`;
  }
  const subs = members.filter((c) => c.parentId === responderId);
  if (subs.length > 0) {
    const names = subs.map((s) => s.label).join(", ");
    return `L’utilisateur t’a **mentionné·e directement** (@). Tu es **${m.label}** (directeur·rice de pôle). Réponds en profondeur sous ton angle. Tu peux indiquer comment **${names}** (ton équipe) préciserait certains points ou quels aspects ils traiteraient — reste bref sur les dialogues fictifs, concret sur le fond.`;
  }
  return `L’utilisateur t’a **mentionné·e directement** (@). Tu es **${m.label}**. Réponds de façon complète et personnelle au message.`;
}

export async function routeDiscussionMessage(opts: {
  llmProvider: LlmProvider;
  mistralApiKey?: string;
  model: string;
  souls: Record<string, string>;
  members: TreeMember[];
  historyWithLatestUser: ChatMessage[];
  signal?: AbortSignal;
  /** Si défini (ex. @mention résolue), pas d’appel LLM pour le routage. */
  forcedResponderId?: string | null;
  /** Texte « Contexte » de la mission (première demande). */
  missionUserBrief?: string | null;
  /** Livrable actuel (tronqué côté prompt). */
  artifactMarkdown?: string | null;
}): Promise<DiscussionRouting> {
  const {
    llmProvider,
    mistralApiKey,
    model,
    souls,
    members,
    historyWithLatestUser,
    signal,
    forcedResponderId,
    missionUserBrief,
    artifactMarkdown,
  } = opts;

  if (forcedResponderId) {
    const id = validateResponderId(forcedResponderId, members);
    const label =
      members.find((m) => m.id === id)?.label ??
      (id === ORCHESTRATOR_ID ? "Orchestrateur" : id);
    return {
      responderId: id,
      brief: `${buildDirectMentionBrief(id, members)}\n\n${DISCUSSION_REPLY_STYLE_RULES}`,
      userNote: `Message adressé à **${label}** (@mention).`,
    };
  }

  const roster = formatRoster(members);
  const hist = formatHistoryForRouting(historyWithLatestUser);
  const orchSoul = soul(souls, ORCHESTRATOR_ID);
  const docCtx = formatMissionAndArtifactForDiscussion(
    missionUserBrief,
    artifactMarkdown,
    MAX_ARTIFACT_EXCERPT_ROUTING,
  );

  const userBlock = `${docCtx}## Membres de l’équipe (utilise les ids exacts ci-dessous)\n${roster}\n\n---\n## Fil de discussion\n${hist}\n\n---\nTâche : tu es **l’orchestrateur**. L’utilisateur s’adresse à **toute l’équipe** comme si c’était une réunion : **toi**, tu décides **qui est le plus qualifié** pour répondre au **dernier** message (sujet, compétence, contexte). Un **livrable Markdown** et le **brief initial** peuvent apparaître ci-dessus : sers-t’en pour le routage ; les réponses dans le fil restent **courtes** (pas de recopie du document dans le chat).\n\n- Si un **membre** doit répondre : mets son \`responderId\` et un \`brief\` concret pour lui (rappelle-lui de rester bref dans le chat, pas de livrable complet).\n- Si **toi** l’orchestrateur dois répondre (synthèse, compte rendu, arbitrage, vision globale, ou l’utilisateur le demande explicitement) : \`responderId\` = \`${ORCHESTRATOR_ID}\`.\n\nRéponds par **un seul objet JSON** valide, sans markdown ni texte autour :\n{\n  "responderId": "…",\n  "brief": "…",\n  "userNote": "…"\n}\n\n\`userNote\` : une phrase **optionnelle** pour l’utilisateur (ex. qui prend la parole et pourquoi).`;

  const raw = await completeLlmChat(
    llmProvider,
    mistralApiKey,
    model,
    [
      { role: "system", content: orchSoul },
      { role: "user", content: userBlock },
    ],
    signal,
    { temperature: 0.25 },
  );

  let routing: DiscussionRouting;
  try {
    routing = parseRouting(raw);
  } catch {
    routing = {
      responderId: ORCHESTRATOR_ID,
      brief: "Réponds de façon utile en t’appuyant sur le contexte.",
      userNote:
        "L’orchestrateur reprend la main (routage indisponible, réponse par défaut).",
    };
  }

  routing.responderId = validateResponderId(routing.responderId, members);
  return routing;
}

export function buildDiscussionStreamMessages(opts: {
  souls: Record<string, string>;
  responderId: string;
  brief: string;
  historyWithLatestUser: ChatMessage[];
  missionUserBrief?: string | null;
  artifactMarkdown?: string | null;
}): OllamaChatMessage[] {
  const {
    souls,
    responderId,
    brief,
    historyWithLatestUser,
    missionUserBrief,
    artifactMarkdown,
  } = opts;
  const responderSoul = soul(souls, responderId);
  const docBlock = formatMissionAndArtifactForDiscussion(
    missionUserBrief,
    artifactMarkdown,
    MAX_ARTIFACT_EXCERPT_STREAM,
  );
  const systemParts = [
    responderSoul,
    DISCUSSION_REPLY_STYLE_RULES,
    docBlock
      ? `## Contexte documentaire (pour t’orienter — ne pas recopier dans le chat)\n\n${docBlock}`
      : "",
    `— Canal **équipe** : l’orchestrateur t’a désigné·e pour ce tour. **Consigne :** ${brief}`,
  ].filter((p) => p.trim().length > 0);
  const systemContent = systemParts.join("\n\n");
  const rest: OllamaChatMessage[] = historyWithLatestUser.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  return [{ role: "system", content: systemContent }, ...rest];
}

export async function streamDiscussionReply(opts: {
  llmProvider: LlmProvider;
  mistralApiKey?: string;
  model: string;
  souls: Record<string, string>;
  responderId: string;
  brief: string;
  historyWithLatestUser: ChatMessage[];
  missionUserBrief?: string | null;
  artifactMarkdown?: string | null;
  onToken: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const messages = buildDiscussionStreamMessages(opts);
  await streamLlmChat(
    opts.llmProvider,
    opts.mistralApiKey,
    opts.model,
    messages,
    opts.onToken,
    opts.signal,
  );
}

function sanitizeConversationTitle(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^["'#*\s]+|["'#*\s]+$/g, "");
  t = t.split(/\r?\n/)[0]?.trim() ?? "";
  t = t.replace(/^[\s\-–—]+/, "").replace(/\s+/g, " ");
  if (t.length > 72) t = t.slice(0, 69).trimEnd() + "…";
  return t;
}

/**
 * Titre court pour la liste des conversations (orchestrateur, après un échange).
 */
export async function generateDiscussionConversationTitle(opts: {
  llmProvider: LlmProvider;
  mistralApiKey?: string;
  model: string;
  souls: Record<string, string>;
  /** Fil récent (markdown libre), déjà formaté. */
  recentTranscript: string;
  signal?: AbortSignal;
}): Promise<string> {
  const orchSoul = soul(opts.souls, ORCHESTRATOR_ID);
  const raw = await completeLlmChat(
    opts.llmProvider,
    opts.mistralApiKey,
    opts.model,
    [
      { role: "system", content: orchSoul },
      {
        role: "user",
        content: `Tu coordonnes l’équipe. Choisis un **titre très court** pour nommer cette conversation dans un menu latéral (comme un titre d’e-mail ou de ticket).

Contraintes :
- **Une seule ligne**, sans guillemets ni préfixe du type « Titre : »
- **Maximum 8 mots** (idéalement 4 à 7)
- En français, concret, orienté sujet (pas « Conversation » ni « Discussion » vides)
- Pas de ponctuation finale inutile (point, deux-points)

Fil récent à résumer pour le nom :

---
${opts.recentTranscript.slice(0, 4500)}
---

Réponds par **le titre uniquement**, rien d’autre.`,
      },
    ],
    opts.signal,
    { temperature: 0.25 },
  );
  return sanitizeConversationTitle(raw);
}

/**
 * Titre court pour la liste des conversations (sidebar), après le cadre orchestrateur d’une mission.
 */
export async function generateMissionConversationTitle(opts: {
  llmProvider: LlmProvider;
  mistralApiKey?: string;
  model: string;
  souls: Record<string, string>;
  /** Sortie de la première passe orchestrateur (brief pôles). */
  orchestratorBrief: string;
  /** Contexte + fichiers (tronqué comme dans le pipeline mission). */
  userPayloadPreview: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const orchSoul = soul(opts.souls, ORCHESTRATOR_ID);
  const briefSlice = opts.orchestratorBrief.slice(0, 6000);
  const ctxSlice = opts.userPayloadPreview.slice(0, 3500);
  const raw = await completeLlmChat(
    opts.llmProvider,
    opts.mistralApiKey,
    opts.model,
    [
      { role: "system", content: orchSoul },
      {
        role: "user",
        content: `Tu pilotes une **mission équipe** : un rapport long va être produit à partir du cadre ci-dessous.

Choisis un **titre très court** pour nommer **cette conversation** dans un menu latéral gauche (liste de projets), comme un titre de ticket ou d’objet d’e-mail.

Contraintes :
- **Une seule ligne**, sans guillemets ni préfixe du type « Titre : »
- **Maximum 8 mots** (idéalement 4 à 7)
- En français, **concret**, orienté produit / sujet (évite seul « Mission », « Rapport », « Projet », « Nouveau projet »)
- Pas de ponctuation finale inutile (point, deux-points)

## Cadre orchestrateur (première passe)

${briefSlice}

## Rappel contexte utilisateur / fichiers (extrait)

${ctxSlice}

Réponds par **le titre uniquement**, rien d’autre.`,
      },
    ],
    opts.signal,
    { temperature: 0.25 },
  );
  const t = sanitizeConversationTitle(raw);
  return t.length >= 3 ? t : null;
}

const MAX_ARTIFACT = 120_000;
const MAX_DISCUSS_FOR_PATCH = 48_000;

/**
 * L’orchestrateur fusionne la discussion dans le livrable Markdown existant.
 */
export async function applyDiscussionToArtifact(opts: {
  llmProvider: LlmProvider;
  mistralApiKey?: string;
  model: string;
  souls: Record<string, string>;
  discussionMessages: ChatMessage[];
  artifactMarkdown: string;
  /** Brief « Contexte » de la mission (première demande), pour ancrer les retouches. */
  missionUserBrief?: string | null;
  signal?: AbortSignal;
}): Promise<string> {
  const {
    llmProvider,
    mistralApiKey,
    model,
    souls,
    discussionMessages,
    artifactMarkdown,
    missionUserBrief,
    signal,
  } = opts;
  const orchSoul = soul(souls, ORCHESTRATOR_ID);
  const discussion = formatHistoryForRouting(
    discussionMessages,
    MAX_DISCUSS_FOR_PATCH,
  );
  let doc = artifactMarkdown;
  if (doc.length > MAX_ARTIFACT) {
    doc = doc.slice(0, MAX_ARTIFACT) + "\n\n[… document tronqué pour le contexte …]";
  }

  const missionSection = missionUserBrief?.trim()
    ? `## Brief initial de la mission (première demande utilisateur)\n\n${sliceText(missionUserBrief, MAX_MISSION_BRIEF_IN_CTX)}\n\n---\n\n`
    : "";

  const userBlock = `${missionSection}Tu es l’**orchestrateur**. L’utilisateur a discuté avec l’équipe pour **ajuster** un livrable Markdown déjà produit (mission / rapport).

---

## Fil de discussion (consignes, corrections, précisions demandées)

${discussion}

---

## Document Markdown actuel (à réviser)

\`\`\`markdown
${doc}
\`\`\`

---

**Tâche**

1. **Respecte l’intention** du brief initial ci-dessus quand tu interprètes les retouches ; synthétise **implicitement** la discussion dans le document révisé (pas besoin de répéter toute la conversation dans le fichier).
2. **Modifie le Markdown** aux bons endroits : sections concernées, ajouts, suppressions, reformulations, listes, tableaux.
3. **Conserve** la structure générale (\`#\` \`##\` \`###\`) sauf si la discussion impose une réorganisation claire.
4. **Ne mets pas** le document dans un bloc de code : renvoie **uniquement** le Markdown final, prêt à enregistrer en \`.md\`.
5. Si la discussion est floue, fais au mieux et reste cohérent avec le ton du document.

Réponds par **le document Markdown complet révisé**, sans préambule ni post-scriptum.`;

  return completeLlmChat(
    llmProvider,
    mistralApiKey,
    model,
    [
      { role: "system", content: orchSoul },
      { role: "user", content: userBlock },
    ],
    signal,
    { temperature: 0.35 },
  );
}
