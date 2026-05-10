import { completeLlmChat, streamLlmChat } from "@/lib/llmChat";
import type { OllamaChatMessage } from "@/lib/ollama";
import type { LlmProvider } from "@/lib/llmProvider";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";
import type { ChatMessage } from "@/types";

const MAX_MISSION_BRIEF_IN_CTX = 8000;
const MAX_ARTIFACT_EXCERPT_ROUTING = 5000;
const MAX_ARTIFACT_EXCERPT_STREAM = 14_000;

/** Consignes : après une 1ʳᵉ version du rapport, le chat pilote le .md — pas un chatbot générique. */
const DISCUSSION_REPLY_STYLE_RULES = `## Règles pour ce canal discussion (livrable déjà existant)

- **Ce n’est pas** un assistant conversationnel : **pas** de ton générique (« comment puis-je vous aider », long préambule), **pas** de reprise du rapport dans le chat.
- **Rôle du message dans le fil** : **très bref** — souvent **3–8 lignes** ou **4–7 puces** — **résumé des grandes lignes** de ce qui doit **changer dans le document** (sections visées, intention, ton, chiffres, structure). **Éventuellement** quelques **questions ciblées** si un point est ambigu pour bien appliquer la retouche.
- **Le détail des modifications** est porté par le **fichier Markdown** : il est **mis à jour automatiquement** après ton message (fusion orchestrateur) ; l’utilisateur lit le résultat surtout via **téléchargement** (colonne Activité).
- Tu **formules des intentions claires pour le fichier** même si ton message reste court : le merge suivant doit pouvoir **traduire** ça en changements concrets.
- Au plus **une** courte citation ou titre de section si indispensable pour clarifier.`;

function sliceText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 24).trimEnd()}\n\n[… tronqué …]`;
}

/**
 * Si le 1er message utilisateur du fil reprend déjà le brief mission (ex. écho après mission),
 * ne pas réinjecter le brief dans les blocs « contexte documentaire » (routage / stream / fusion).
 */
export function missionBriefUnlessEchoedInHistory(
  missionUserBrief: string | null | undefined,
  history: ChatMessage[],
): string | undefined {
  const b = missionUserBrief?.trim();
  if (!b) return undefined;
  const firstUser = history.find((m) => m.role === "user");
  if (firstUser && firstUser.content.trim() === b) {
    return undefined;
  }
  return missionUserBrief ?? undefined;
}

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
    return `L’utilisateur t’a ciblé avec une **@mention** (orchestrateur). **Priorité** : piloter les **retouches du livrable Markdown** (quoi changer, où, pourquoi). Dans le **fil** : **très court** compte-rendu (grandes lignes) + éventuellement **questions ciblées** — pas de ton d’assistant générique, pas de reprise du rapport dans le chat.`;
  }
  const subs = members.filter((c) => c.parentId === responderId);
  if (subs.length > 0) {
    const names = subs.map((s) => s.label).join(", ");
    return `L’utilisateur t’a **mentionné·e** (@). Tu es **${m.label}** (directeur·rice de pôle). **Objectif** : **consignes de modification du document** (le .md est mis à jour après ton message). Dans le **fil** : **quelques lignes ou puces** — intentions concrètes (sections, ton, risques, données), éventuellement **questions** ; tu peux indiquer en une phrase comment **${names}** affine certains points — **sans** simuler un long dialogue ni noyer le chat.`;
  }
  return `L’utilisateur t’a **mentionné·e** (@). Tu es **${m.label}**. **Oriente la retouche du rapport** : message **très bref** dans le fil (résumé + questions si utiles), **sans** refaire le document dans le chat ni adopter un ton générique d’assistant.`;
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
  /** Plusieurs @[…] résolus : consigne pour l’orchestrateur (un seul orateur chat, angles combinés). */
  multiMentionRoutingHint?: string | null;
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
    multiMentionRoutingHint: multiMentionRaw,
  } = opts;

  const multiMentionRoutingHint = multiMentionRaw?.trim();

  if (forcedResponderId) {
    const id = validateResponderId(forcedResponderId, members);
    const label =
      members.find((m) => m.id === id)?.label ??
      (id === ORCHESTRATOR_ID ? "Orchestrateur" : id);
    return {
      responderId: id,
      brief: `${buildDirectMentionBrief(id, members)}\n\n${DISCUSSION_REPLY_STYLE_RULES}`,
      userNote: `Message adressé à **${label}** (@mention). Le chat reste **factuel et bref** ; le détail des changements va dans le .md après fusion.`,
    };
  }

  const roster = formatRoster(members);
  const hist = formatHistoryForRouting(historyWithLatestUser);
  const orchSoul = soul(souls, ORCHESTRATOR_ID);
  const docCtx = formatMissionAndArtifactForDiscussion(
    missionBriefUnlessEchoedInHistory(
      missionUserBrief,
      historyWithLatestUser,
    ),
    artifactMarkdown,
    MAX_ARTIFACT_EXCERPT_ROUTING,
  );

  const multiSection = multiMentionRoutingHint
    ? `## Mentions multiples (dernier message utilisateur)\n\n${multiMentionRoutingHint}\n\n---\n\n`
    : "";

  const userBlock = `${docCtx}${multiSection}## Membres de l’équipe (utilise les ids exacts ci-dessous)\n${roster}\n\n---\n## Fil de discussion\n${hist}\n\n---\nTâche : tu es **l’orchestrateur**. **Priorité absolue** : la discussion sert à **faire évoluer le rapport Markdown** après une première version — **pas** à tenir une conversation générique ni à « rassurer » l’utilisateur.\n\nL’utilisateur s’adresse à l’équipe : **toi**, tu choisis **un seul** \`responderId\` pour la réponse **dans le fil** ce tour. Ce message doit être **très court** (résumé des retouches + questions éventuelles) ; le **détail** des modifications est appliqué dans le **fichier** par une **fusion** après l’échange. Un **livrable** et le **brief initial** peuvent apparaître ci-dessus : sers-t’en pour le routage.\n\n- Si une section **Mentions multiples** figure plus haut : un **seul** membre parle dans le chat, mais son \`brief\` doit **intégrer les angles** de **toutes** les personnes nommées pour guider la retouche du document.\n- Si un **membre** doit répondre : mets son \`responderId\` et un \`brief\` qui impose : chat **minimal**, **orienté retouches document**, questions ciblées si besoin.\n- Si **toi** l’orchestrateur dois répondre (arbitrage, vision transverse) : \`responderId\` = \`${ORCHESTRATOR_ID}\`.\n\nRéponds par **un seul objet JSON** valide, sans markdown ni texte autour :\n{\n  "responderId": "…",\n  "brief": "…",\n  "userNote": "…"\n}\n\n\`userNote\` : une phrase **optionnelle** pour l’utilisateur (ex. qui répond ce tour et pourquoi).`;

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
    missionBriefUnlessEchoedInHistory(
      missionUserBrief,
      historyWithLatestUser,
    ),
    artifactMarkdown,
    MAX_ARTIFACT_EXCERPT_STREAM,
  );
  const systemParts = [
    responderSoul,
    DISCUSSION_REPLY_STYLE_RULES,
    docBlock
      ? `## Contexte documentaire (pour t’orienter — ne pas recopier dans le chat)\n\n${docBlock}`
      : "",
    `— Canal **équipe** : l’orchestrateur t’a désigné·e pour ce tour. **Consigne :** ${brief}\n\n**Rappel** : tu **pilotes la retouche** du livrable ; le message dans le fil doit rester **court** (grandes lignes + questions ciblées si besoin) — le **détail** des modifications est porté par le fichier après fusion.`,
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

  const mbForPatch = missionBriefUnlessEchoedInHistory(
    missionUserBrief,
    discussionMessages,
  );
  const missionSection = mbForPatch?.trim()
    ? `## Brief initial de la mission (première demande utilisateur)\n\n${sliceText(mbForPatch, MAX_MISSION_BRIEF_IN_CTX)}\n\n---\n\n`
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

1. Si les derniers échanges ne demandent **aucune retouche** au document (salutations, question générale sans consigne de modification, hors sujet), renvoie le Markdown **strictement inchangé** (même texte que le document actuel).
2. Les messages de l’équipe dans le fil peuvent être **volontairement très courts** (résumé + questions) : c’est **normal** — **infère** quand même les **intentions de modification** et applique-les dans le Markdown (ne pas exiger un long « rapport » dans le chat pour agir).
3. **Respecte l’intention** du brief initial et le **fil** (y compris les **intervenants** indiqués par le libellé « Équipe (…) ») pour savoir **qui** visait **quoi** ; si plusieurs voix se succèdent, **agrège** leurs consignes sans perdre la cohérence du document.
4. **Modifie le Markdown** aux endroits concernés : sections visées, ajouts, suppressions, reformulations, listes, tableaux — évite de réécrire des parties non évoquées.
5. **Conserve** la structure générale (\`#\` \`##\` \`###\`) sauf si la discussion impose une réorganisation claire.
6. **Ne mets pas** le document dans un bloc de code : renvoie **uniquement** le Markdown final, prêt à enregistrer en \`.md\`.
7. Si une retouche est ambiguë, fais au mieux et reste cohérent avec le ton du document.

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
