import type { Conversation } from "@/types";

const KEY = "openspace-conversations-v1";

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

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeConversation);
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}
