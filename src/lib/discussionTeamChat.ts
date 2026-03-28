import {
  completeOllamaChat,
  streamOllamaChat,
  type OllamaChatMessage,
} from "@/lib/ollama";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";
import type { ChatMessage } from "@/types";

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
  model: string;
  souls: Record<string, string>;
  members: TreeMember[];
  historyWithLatestUser: ChatMessage[];
  signal?: AbortSignal;
  /** Si défini (ex. @mention résolue), pas d’appel LLM pour le routage. */
  forcedResponderId?: string | null;
}): Promise<DiscussionRouting> {
  const {
    model,
    souls,
    members,
    historyWithLatestUser,
    signal,
    forcedResponderId,
  } = opts;

  if (forcedResponderId) {
    const id = validateResponderId(forcedResponderId, members);
    const label =
      members.find((m) => m.id === id)?.label ??
      (id === ORCHESTRATOR_ID ? "Orchestrateur" : id);
    return {
      responderId: id,
      brief: buildDirectMentionBrief(id, members),
      userNote: `Message adressé à **${label}** (@mention).`,
    };
  }

  const roster = formatRoster(members);
  const hist = formatHistoryForRouting(historyWithLatestUser);
  const orchSoul = soul(souls, ORCHESTRATOR_ID);

  const userBlock = `## Membres de l’équipe (utilise les ids exacts ci-dessous)\n${roster}\n\n---\n## Fil de discussion\n${hist}\n\n---\nTâche : tu es **l’orchestrateur**. L’utilisateur s’adresse à **toute l’équipe** comme si c’était une réunion : **toi**, tu décides **qui est le plus qualifié** pour répondre au **dernier** message (sujet, compétence, contexte).\n\n- Si un **membre** doit répondre : mets son \`responderId\` et un \`brief\` concret pour lui.\n- Si **toi** l’orchestrateur dois répondre (synthèse, compte rendu, arbitrage, vision globale, ou l’utilisateur le demande explicitement) : \`responderId\` = \`${ORCHESTRATOR_ID}\`.\n\nRéponds par **un seul objet JSON** valide, sans markdown ni texte autour :\n{\n  "responderId": "…",\n  "brief": "…",\n  "userNote": "…"\n}\n\n\`userNote\` : une phrase **optionnelle** pour l’utilisateur (ex. qui prend la parole et pourquoi).`;

  const raw = await completeOllamaChat(
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
}): OllamaChatMessage[] {
  const { souls, responderId, brief, historyWithLatestUser } = opts;
  const responderSoul = soul(souls, responderId);
  const systemContent = `${responderSoul}\n\n— Canal **équipe** : l’orchestrateur t’a désigné·e pour ce tour. **Consigne :** ${brief}`;
  const rest: OllamaChatMessage[] = historyWithLatestUser.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  return [{ role: "system", content: systemContent }, ...rest];
}

export async function streamDiscussionReply(opts: {
  model: string;
  souls: Record<string, string>;
  responderId: string;
  brief: string;
  historyWithLatestUser: ChatMessage[];
  onToken: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const messages = buildDiscussionStreamMessages(opts);
  await streamOllamaChat(
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
  model: string;
  souls: Record<string, string>;
  /** Fil récent (markdown libre), déjà formaté. */
  recentTranscript: string;
  signal?: AbortSignal;
}): Promise<string> {
  const orchSoul = soul(opts.souls, ORCHESTRATOR_ID);
  const raw = await completeOllamaChat(
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

const MAX_ARTIFACT = 120_000;
const MAX_DISCUSS_FOR_PATCH = 48_000;

/**
 * L’orchestrateur fusionne la discussion dans le livrable Markdown existant.
 */
export async function applyDiscussionToArtifact(opts: {
  model: string;
  souls: Record<string, string>;
  discussionMessages: ChatMessage[];
  artifactMarkdown: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { model, souls, discussionMessages, artifactMarkdown, signal } = opts;
  const orchSoul = soul(souls, ORCHESTRATOR_ID);
  const discussion = formatHistoryForRouting(
    discussionMessages,
    MAX_DISCUSS_FOR_PATCH,
  );
  let doc = artifactMarkdown;
  if (doc.length > MAX_ARTIFACT) {
    doc = doc.slice(0, MAX_ARTIFACT) + "\n\n[… document tronqué pour le contexte …]";
  }

  const userBlock = `Tu es l’**orchestrateur**. L’utilisateur a discuté avec l’équipe pour **ajuster** un livrable Markdown déjà produit (mission / rapport).

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

1. Synthétise **implicitement** les demandes de la discussion dans le document révisé (pas besoin de répéter toute la conversation dans le fichier).
2. **Modifie le Markdown** aux bons endroits : sections concernées, ajouts, suppressions, reformulations, listes, tableaux.
3. **Conserve** la structure générale (\`#\` \`##\` \`###\`) sauf si la discussion impose une réorganisation claire.
4. **Ne mets pas** le document dans un bloc de code : renvoie **uniquement** le Markdown final, prêt à enregistrer en \`.md\`.
5. Si la discussion est floue, fais au mieux et reste cohérent avec le ton du document.

Réponds par **le document Markdown complet révisé**, sans préambule ni post-scriptum.`;

  return completeOllamaChat(
    model,
    [
      { role: "system", content: orchSoul },
      { role: "user", content: userBlock },
    ],
    signal,
    { temperature: 0.35 },
  );
}
