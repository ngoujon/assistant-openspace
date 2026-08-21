import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampOllamaTemperature,
  consumeAppSettingsResetNotice,
  loadAppSettings,
} from "@/lib/appSettingsStorage";
import { pickDefaultChatModel } from "@/lib/llmModelPreference";
import type { LlmProvider } from "@/lib/llmProvider";
import { fetchOllamaModels } from "@/lib/ollama";
import { ActivitySidebar } from "@/components/ActivitySidebar";
import { markdownFilenameFromConversationTitle } from "@/lib/downloadMarkdown";
import { ChatPanel } from "@/components/ChatPanel";
import { Layout } from "@/components/Layout";
import { SettingsModal } from "@/components/SettingsModal";
import { Sidebar } from "@/components/Sidebar";
import { TeamCentrePanel } from "@/components/TeamCentrePanel";
import { TeamOrganisationAside } from "@/components/TeamOrganisationAside";
import { TeamWorkspaceProvider } from "@/components/TeamWorkspaceContext";
import {
  appendArtifactVersion,
  loadConversations,
  saveConversations,
} from "@/lib/storage";
import type { RightActivityState } from "@/types/activity";
import type {
  Conversation,
  MissionActivitySnapshot,
  MissionAgentJournalEntry,
} from "@/types";

const SAVE_DEBOUNCE_MS = 300;

/** Colonne Activité au chargement (évite un flash « vide » avant les effets du ChatPanel). */
function deriveInitialRightActivity(c: Conversation): RightActivityState {
  const hasArtifact = Boolean(c.artifactMarkdown?.trim());
  const hasMessages = c.messages.length > 0;
  if (hasArtifact || hasMessages) {
    return {
      kind: "discussion",
      isRouting: false,
      streaming: false,
      panelError: null,
      streamingSpeaker: null,
      discussionProgress: [],
      lastCompletedTurnSec: null,
    };
  }
  const snap = c.missionActivitySnapshot;
  return {
    kind: "mission",
    running: false,
    progress: snap?.progress ?? [],
    elapsedSec: snap?.elapsedSec ?? 0,
  };
}

function newConversation(): Conversation {
  const id = crypto.randomUUID();
  return {
    id,
    title: "Nouveau projet",
    updatedAt: Date.now(),
    messages: [],
  };
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const loaded = loadConversations();
    return loaded.length ? loaded : [newConversation()];
  });
  const [activeId, setActiveId] = useState(() => conversations[0]!.id);
  const [model, setModel] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(
    () => loadAppSettings().llmProvider,
  );
  const [ollamaApiKey, setOllamaApiKey] = useState(
    () => loadAppSettings().ollamaApiKey,
  );
  const [ollamaApiUrl, setOllamaApiUrl] = useState(
    () => loadAppSettings().ollamaApiUrl,
  );
  const [ollamaTemperature, setOllamaTemperature] = useState(() =>
    clampOllamaTemperature(loadAppSettings().ollamaTemperature),
  );
  const [llmError, setLlmError] = useState<string | null>(null);
  const [rightActivity, setRightActivity] = useState<RightActivityState>(() =>
    deriveInitialRightActivity(conversations[0]!),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  /** Colonne Activité : éviter un état « équipe » résiduel qui masquerait mission / discussion. */
  const activityForShell = useMemo<RightActivityState>(() => {
    if (rightActivity.kind === "team") return { kind: "idle" };
    return rightActivity;
  }, [rightActivity]);

  const refreshLlmModels = useCallback(() => {
    const s = loadAppSettings();
    const resetNotice = consumeAppSettingsResetNotice();
    setLlmProvider(s.llmProvider);
    setOllamaApiKey(s.ollamaApiKey);
    setOllamaApiUrl(s.ollamaApiUrl);
    setOllamaTemperature(clampOllamaTemperature(s.ollamaTemperature));

    if (s.llmProvider === "ollama" && !s.ollamaApiUrl.trim()) {
      setModel("");
      setLlmError(
        resetNotice ??
          "Ollama Cloud : renseigne l'URL API dans Paramètres (menu latéral).",
      );
      return;
    }

    fetchOllamaModels(s.ollamaApiUrl, s.ollamaApiKey)
      .then((m) => {
        setModel((prev) => {
          const saved = s.ollamaChatModel?.trim() ?? "";
          if (saved && m.includes(saved)) return saved;
          if (prev && m.includes(prev)) return prev;
          return pickDefaultChatModel(m);
        });
        setLlmError(resetNotice);
      })
      .catch((e: Error) => setLlmError(resetNotice ?? e.message));
  }, []);

  useEffect(() => {
    refreshLlmModels();
  }, [refreshLlmModels]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveConversations(conversations);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [conversations]);

  useEffect(() => {
    if (!conversations.some((c) => c.id === activeId)) {
      const next = conversations[0]!;
      setActiveId(next.id);
      setRightActivity(deriveInitialRightActivity(next));
    }
  }, [conversations, activeId]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? conversations[0],
    [conversations, activeId],
  );

  const activityLinkedArtifact = useMemo(() => {
    const md = active.artifactMarkdown?.trim();
    if (!md) return null;
    return {
      markdown: md,
      filename: markdownFilenameFromConversationTitle(active.title),
    };
  }, [active.artifactMarkdown, active.title]);

  /** Toujours passer `conversationId` (tour async) — ne pas se fier à `active` au moment du flush. */
  const setConversationMessages = useCallback(
    (
      conversationId: string,
      updater: (prev: Conversation["messages"]) => Conversation["messages"],
    ) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          const messages = updater(c.messages);
          const hasAssistant = messages.some((m) => m.role === "assistant");
          const firstUser = messages.find((m) => m.role === "user");
          const suggestedFromFirstUser =
            firstUser?.content.slice(0, 48).trim() ?? "";
          /**
           * Avant la 1ʳᵉ réponse : titre depuis le 1er message utilisateur,
           * sauf si le titre a déjà été personnalisé (≠ « Nouveau projet »).
           */
          const title =
            !hasAssistant && firstUser
              ? c.title.trim() && c.title !== "Nouveau projet"
                ? c.title
                : suggestedFromFirstUser || c.title || "Nouveau projet"
              : c.title;
          return {
            ...c,
            messages,
            title,
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [],
  );

  const persistMissionActivitySnapshot = useCallback(
    (conversationId: string, snapshot: MissionActivitySnapshot) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                missionActivitySnapshot: { ...snapshot },
                updatedAt: Date.now(),
              }
            : c,
        ),
      );
    },
    [],
  );

  const setConversationArtifactMarkdown = useCallback(
    (
      conversationId: string,
      markdown: string,
      opts?: {
        /** Après fusion : ne reprendre la discussion qu’à partir d’après ce message. */
        discussionCutoffAfterId?: string;
        /** Nouveau livrable (mission) : annule la coupure pour le prochain apply. */
        clearDiscussionCutoff?: boolean;
        /** Contexte mission au moment du livrable (première demande utilisateur). */
        missionUserBrief?: string;
        /** Libellé de version (mission, fusion, etc.). */
        versionLabel?: string;
        /** Fusion en attente (message sans intention de retouche). */
        pendingArtifactMerge?: boolean;
        /** Remplace le journal mission (nouvelle mission). */
        replaceAgentJournal?: MissionAgentJournalEntry[];
      },
    ) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          let artifactDiscussionCutoffAfterId = c.artifactDiscussionCutoffAfterId;
          if (opts?.clearDiscussionCutoff) {
            artifactDiscussionCutoffAfterId = undefined;
          }
          if (opts?.discussionCutoffAfterId !== undefined) {
            artifactDiscussionCutoffAfterId = opts.discussionCutoffAfterId;
          }
          const missionUserBrief =
            opts?.missionUserBrief !== undefined
              ? opts.missionUserBrief
              : c.missionUserBrief;
          const artifactVersions = appendArtifactVersion(
            c,
            markdown,
            opts?.versionLabel,
          );
          return {
            ...c,
            artifactMarkdown: markdown,
            artifactVersions,
            updatedAt: Date.now(),
            artifactDiscussionCutoffAfterId,
            missionUserBrief,
            pendingArtifactMerge:
              opts?.pendingArtifactMerge !== undefined
                ? opts.pendingArtifactMerge
                : c.pendingArtifactMerge,
            missionAgentJournal:
              opts?.replaceAgentJournal !== undefined
                ? opts.replaceAgentJournal
                : c.missionAgentJournal,
          };
        }),
      );
    },
    [],
  );

  const clearMissionAgentJournal = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, missionAgentJournal: [] } : c,
      ),
    );
  }, []);

  const appendMissionAgentJournal = useCallback(
    (conversationId: string, entry: MissionAgentJournalEntry) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                missionAgentJournal: [...(c.missionAgentJournal ?? []), entry],
                updatedAt: Date.now(),
              }
            : c,
        ),
      );
    },
    [],
  );

  const setPendingArtifactMerge = useCallback(
    (conversationId: string, pending: boolean) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, pendingArtifactMerge: pending, updatedAt: Date.now() }
            : c,
        ),
      );
    },
    [],
  );

  const restoreArtifactVersion = useCallback(
    (conversationId: string, versionId: string) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          const v = c.artifactVersions?.find((x) => x.id === versionId);
          if (!v) return c;
          return {
            ...c,
            artifactMarkdown: v.markdown,
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [],
  );

  const handleNewChat = useCallback(() => {
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setRightActivity(deriveInitialRightActivity(c));
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      const c = conversations.find((x) => x.id === id);
      if (c) setRightActivity(deriveInitialRightActivity(c));
    },
    [conversations],
  );

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      return filtered.length === 0 ? [newConversation()] : filtered;
    });
  }, []);

  if (!active) {
    return <div className="app-loading">Chargement…</div>;
  }

  const sidebarEl = (
    <Sidebar
      conversations={conversations}
      activeId={active.id}
      onSelect={handleSelectConversation}
      onNew={handleNewChat}
      onDelete={handleDeleteConversation}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );

  const activityAsideEl = (
    <ActivitySidebar
      state={activityForShell}
      linkedArtifact={activityLinkedArtifact}
      missionHistory={active.missionActivitySnapshot}
      agentJournal={active.missionAgentJournal}
      artifactVersions={active.artifactVersions}
      pendingArtifactMerge={active.pendingArtifactMerge}
      onRestoreVersion={(versionId) =>
        restoreArtifactVersion(active.id, versionId)
      }
      onRequestArtifactMerge={() => {
        window.dispatchEvent(
          new CustomEvent("openspace-request-artifact-merge", {
            detail: { conversationId: active.id },
          }),
        );
      }}
    />
  );

  const mainEl = (
    <div className="main-body">
      <ChatPanel
        conversation={active}
        model={model}
        llmProvider={llmProvider}
        ollamaApiKey={ollamaApiKey}
        ollamaApiUrl={ollamaApiUrl}
        ollamaTemperature={ollamaTemperature}
        llmError={llmError}
        onRetryLlm={refreshLlmModels}
        setMessages={setConversationMessages}
        onConversationArtifact={setConversationArtifactMarkdown}
        onMissionActivitySnapshot={persistMissionActivitySnapshot}
        onMissionAgentJournal={appendMissionAgentJournal}
        onMissionJournalClear={clearMissionAgentJournal}
        onPendingArtifactMerge={setPendingArtifactMerge}
        setRightActivity={setRightActivity}
        activityAside={
          <ActivitySidebar
            state={activityForShell}
            variant="inline"
            linkedArtifact={activityLinkedArtifact}
            missionHistory={active.missionActivitySnapshot}
            agentJournal={active.missionAgentJournal}
            artifactVersions={active.artifactVersions}
            pendingArtifactMerge={active.pendingArtifactMerge}
            onRestoreVersion={(versionId) =>
              restoreArtifactVersion(active.id, versionId)
            }
            onRequestArtifactMerge={() => {
              window.dispatchEvent(
                new CustomEvent("openspace-request-artifact-merge", {
                  detail: { conversationId: active.id },
                }),
              );
            }}
          />
        }
      />
      <TeamCentrePanel />
    </div>
  );

  return (
    <>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshLlmModels}
      />
      <TeamWorkspaceProvider
        model={model}
        llmProvider={llmProvider}
        ollamaApiKey={ollamaApiKey}
        ollamaApiUrl={ollamaApiUrl}
      >
        <Layout
          sidebar={sidebarEl}
          main={mainEl}
          organisationAside={<TeamOrganisationAside />}
          activityAside={activityAsideEl}
        />
      </TeamWorkspaceProvider>
    </>
  );
}
