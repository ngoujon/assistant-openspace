import type {
  ArtifactVersion,
  ChatMessage,
  Conversation,
  MissionActivitySnapshot,
  MissionAgentJournalEntry,
} from "@/types";

const KEY = "openspace-conversations-v1";
const MAX_ARTIFACT_VERSIONS = 20;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseChatMessage(v: unknown): ChatMessage | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.content !== "string") return null;
  const role = v.role;
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  return {
    id: v.id,
    role,
    content: v.content,
    speakerLabel:
      typeof v.speakerLabel === "string" ? v.speakerLabel : undefined,
    routingNote: typeof v.routingNote === "string" ? v.routingNote : undefined,
    artifactPatchNote:
      typeof v.artifactPatchNote === "boolean" ? v.artifactPatchNote : undefined,
  };
}

function parseMissionSnapshot(v: unknown): MissionActivitySnapshot | undefined {
  if (!isRecord(v)) return undefined;
  if (!Array.isArray(v.progress)) return undefined;
  const progress = v.progress.filter((p): p is string => typeof p === "string");
  return {
    progress,
    elapsedSec: typeof v.elapsedSec === "number" ? v.elapsedSec : 0,
    running: v.running === true,
  };
}

function parseArtifactVersions(v: unknown): ArtifactVersion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ArtifactVersion[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.markdown !== "string") {
      continue;
    }
    out.push({
      id: item.id,
      markdown: item.markdown,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
      label: typeof item.label === "string" ? item.label : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseAgentJournal(v: unknown): MissionAgentJournalEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MissionAgentJournalEntry[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    if (
      typeof item.memberLabel !== "string" ||
      typeof item.stepLabel !== "string" ||
      typeof item.content !== "string"
    ) {
      continue;
    }
    out.push({
      memberLabel: item.memberLabel,
      stepLabel: item.stepLabel,
      content: item.content,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseConversation(v: unknown): Conversation | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.title !== "string") return null;
  if (typeof v.updatedAt !== "number") return null;
  if (!Array.isArray(v.messages)) return null;
  const messages: ChatMessage[] = [];
  for (const m of v.messages) {
    const parsed = parseChatMessage(m);
    if (parsed) messages.push(parsed);
  }
  return {
    id: v.id,
    title: v.title,
    updatedAt: v.updatedAt,
    messages,
    artifactMarkdown:
      typeof v.artifactMarkdown === "string" ? v.artifactMarkdown : undefined,
    artifactVersions: parseArtifactVersions(v.artifactVersions),
    missionUserBrief:
      typeof v.missionUserBrief === "string" ? v.missionUserBrief : undefined,
    artifactDiscussionCutoffAfterId:
      typeof v.artifactDiscussionCutoffAfterId === "string"
        ? v.artifactDiscussionCutoffAfterId
        : undefined,
    missionActivitySnapshot: parseMissionSnapshot(v.missionActivitySnapshot),
    missionAgentJournal: parseAgentJournal(v.missionAgentJournal),
    pendingArtifactMerge: v.pendingArtifactMerge === true ? true : undefined,
  };
}

function normalizeConversation(c: Conversation): Conversation {
  const snap = c.missionActivitySnapshot;
  if (snap?.running && c.artifactMarkdown?.trim()) {
    return {
      ...c,
      missionActivitySnapshot: { ...snap, running: false },
    };
  }
  return c;
}

export function appendArtifactVersion(
  conversation: Conversation,
  markdown: string,
  label?: string,
): ArtifactVersion[] {
  const prev = conversation.artifactVersions ?? [];
  const entry: ArtifactVersion = {
    id: crypto.randomUUID(),
    markdown,
    createdAt: Date.now(),
    label,
  };
  return [...prev, entry].slice(-MAX_ARTIFACT_VERSIONS);
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Conversation[] = [];
    for (const item of parsed) {
      const c = parseConversation(item);
      if (c) out.push(normalizeConversation(c));
    }
    return out;
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}
