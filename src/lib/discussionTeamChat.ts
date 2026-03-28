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

function formatHistoryForRouting(
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

export async function routeDiscussionMessage(opts: {
  model: string;
  souls: Record<string, string>;
  members: TreeMember[];
  historyWithLatestUser: ChatMessage[];
  signal?: AbortSignal;
}): Promise<DiscussionRouting> {
  const { model, souls, members, historyWithLatestUser, signal } = opts;
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
