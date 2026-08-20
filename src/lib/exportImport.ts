import { loadAppSettings } from "@/lib/appSettingsStorage";
import { loadConversations } from "@/lib/storage";
import { loadTeamArchives } from "@/lib/teamArchiveStorage";
import { loadAgentSouls } from "@/lib/teamSoulsStorage";
import { loadTeamMembers } from "@/lib/teamTreeStorage";
import type { Conversation } from "@/types";

export const EXPORT_FORMAT_VERSION = 1;

export interface WorkspaceExportPayload {
  formatVersion: number;
  exportedAt: number;
  conversations: Conversation[];
  teamMembers: ReturnType<typeof loadTeamMembers>;
  teamSouls: ReturnType<typeof loadAgentSouls>;
  teamArchives: ReturnType<typeof loadTeamArchives>;
  appSettings: ReturnType<typeof loadAppSettings>;
}

export function buildWorkspaceExport(): WorkspaceExportPayload {
  const { ollamaApiKey: _ollamaApiKey, ...appSettingsWithoutSecrets } =
    loadAppSettings();
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    conversations: loadConversations(),
    teamMembers: loadTeamMembers(),
    teamSouls: loadAgentSouls(),
    teamArchives: loadTeamArchives(),
    appSettings: { ...appSettingsWithoutSecrets, ollamaApiKey: "" },
  };
}

export function downloadWorkspaceExport(): void {
  const payload = buildWorkspaceExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `openspace-export-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  conversations: number;
  teamMembers: number;
  archives: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseWorkspaceImport(raw: string): WorkspaceExportPayload {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("Fichier d'import invalide.");
  }
  if (parsed.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(
      `Version d'export non supportée (${String(parsed.formatVersion)}).`,
    );
  }
  if (!Array.isArray(parsed.conversations)) {
    throw new Error("Conversations manquantes dans l'export.");
  }
  if (!Array.isArray(parsed.teamMembers)) {
    throw new Error("Équipe manquante dans l'export.");
  }
  return parsed as unknown as WorkspaceExportPayload;
}

export function applyWorkspaceImport(payload: WorkspaceExportPayload): ImportResult {
  localStorage.setItem(
    "openspace-conversations-v1",
    JSON.stringify(payload.conversations),
  );
  localStorage.setItem(
    "openspace-team-tree-v1",
    JSON.stringify(payload.teamMembers),
  );
  localStorage.setItem(
    "openspace-team-souls-v1",
    JSON.stringify(payload.teamSouls),
  );
  localStorage.setItem(
    "openspace-team-archives-v1",
    JSON.stringify(payload.teamArchives),
  );
  localStorage.setItem(
    "openspace-app-settings-v1",
    JSON.stringify(payload.appSettings),
  );
  window.dispatchEvent(new Event("openspace-team-updated"));
  return {
    conversations: payload.conversations.length,
    teamMembers: payload.teamMembers.length,
    archives: payload.teamArchives.length,
  };
}
