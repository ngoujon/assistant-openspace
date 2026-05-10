import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAppSettings } from "@/lib/appSettingsStorage";
import { pickDefaultChatModel } from "@/lib/llmModelPreference";
import type { LlmProvider } from "@/lib/llmProvider";
import { fetchMistralModels } from "@/lib/mistral";
import { ActivitySidebar } from "@/components/ActivitySidebar";
import { ExchangesSidebar } from "@/components/ExchangesSidebar";
import { markdownFilenameFromConversationTitle } from "@/lib/downloadMarkdown";
import { ChatPanel } from "@/components/ChatPanel";
import { Layout } from "@/components/Layout";
import { SettingsModal } from "@/components/SettingsModal";
import { Sidebar } from "@/components/Sidebar";
import { TeamCentrePanel } from "@/components/TeamCentrePanel";
import { TeamOrganisationAside } from "@/components/TeamOrganisationAside";
import { TeamWorkspaceProvider } from "@/components/TeamWorkspaceContext";
import { fetchOllamaModels } from "@/lib/ollama";
import { loadConversations, saveConversations } from "@/lib/storage";
import type { RightActivityState } from "@/types/activity";
import type { Conversation, MainTab } from "@/types";

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
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? "");
  const [mainTab, setMainTab] = useState<MainTab>("chat");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(
    () => loadAppSettings().llmProvider,
  );
  const [mistralApiKey, setMistralApiKey] = useState(
    () => loadAppSettings().mistralApiKey,
  );
  const [llmError, setLlmError] = useState<string | null>(null);
  const [rightActivity, setRightActivity] = useState<RightActivityState>({
    kind: "idle",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  /** Colonne droite : sur l’onglet Équipe on affiche « équipe » sans écraser l’état chat (mission / discussion). */
  const activityForShell = useMemo<RightActivityState>(() => {
    if (mainTab === "team") return { kind: "team" };
    if (rightActivity.kind === "team")
      return { kind: "idle" };
    return rightActivity;
  }, [mainTab, rightActivity]);

  const refreshLlmModels = useCallback(() => {
    const s = loadAppSettings();
    setLlmProvider(s.llmProvider);
    setMistralApiKey(s.mistralApiKey);

    if (s.llmProvider === "mistral" && !s.mistralApiKey.trim()) {
      setModels([]);
      setModel("");
      setLlmError(
        "Mistral AI : renseigne ta clé API dans Paramètres (menu latéral).",
      );
      return;
    }

    const run =
      s.llmProvider === "mistral"
        ? () => fetchMistralModels(s.mistralApiKey.trim())
        : fetchOllamaModels;

    run()
      .then((m) => {
        setModels(m);
        setModel((prev) => {
          if (s.llmProvider === "mistral") {
            const saved = s.mistralChatModel?.trim() ?? "";
            if (saved && m.includes(saved)) return saved;
          }
          if (prev && m.includes(prev)) return prev;
          return pickDefaultChatModel(m, s.llmProvider);
        });
        setLlmError(null);
      })
      .catch((e: Error) => setLlmError(e.message));
  }, []);

  useEffect(() => {
    refreshLlmModels();
  }, [refreshLlmModels]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    if (!conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0]!.id);
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

  const setActiveMessages = useCallback(
    (updater: (prev: Conversation["messages"]) => Conversation["messages"]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== active?.id) return c;
          const messages = updater(c.messages);
          const hasAssistant = messages.some((m) => m.role === "assistant");
          const firstUser = messages.find((m) => m.role === "user");
          /** Avant la 1ʳᵉ réponse : extrait du message utilisateur ; ensuite l’orchestrateur renomme via setActiveConversationTitle. */
          const title =
            !hasAssistant && firstUser
              ? firstUser.content.slice(0, 48).trim() ||
                c.title ||
                "Nouveau projet"
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
    [active?.id],
  );

  const setConversationTitleById = useCallback(
    (conversationId: string, newTitle: string) => {
      const t = newTitle.trim();
      if (!t) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, title: t.slice(0, 80), updatedAt: Date.now() }
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
          return {
            ...c,
            artifactMarkdown: markdown,
            updatedAt: Date.now(),
            artifactDiscussionCutoffAfterId,
            missionUserBrief,
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
    setMainTab("chat");
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
    setMainTab("chat");
  }, []);

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

  const exchangesAsideEl = (
    <ExchangesSidebar
      state={activityForShell}
      linkedArtifact={activityLinkedArtifact}
    />
  );

  const activityAsideEl = (
    <ActivitySidebar
      state={activityForShell}
      linkedArtifact={activityLinkedArtifact}
      llmProvider={llmProvider}
    />
  );

  const mainEl = (
    <>
      <nav className="main-tabs" aria-label="Zones principales">
        <button
          type="button"
          className={mainTab === "chat" ? "tab active" : "tab"}
          onClick={() => setMainTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className={mainTab === "team" ? "tab active" : "tab"}
          onClick={() => setMainTab("team")}
        >
          Équipe
        </button>
      </nav>
      <div className="main-body">
        {mainTab === "chat" ? (
          <ChatPanel
            conversation={active}
            models={models}
            model={model}
            onModelChange={setModel}
            llmProvider={llmProvider}
            mistralApiKey={mistralApiKey}
            llmError={llmError}
            onRetryLlm={refreshLlmModels}
            setMessages={setActiveMessages}
            onConversationTitle={setConversationTitleById}
            onConversationArtifact={setConversationArtifactMarkdown}
            setRightActivity={setRightActivity}
          />
        ) : (
          <TeamCentrePanel />
        )}
      </div>
    </>
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
        mistralApiKey={mistralApiKey}
      >
        <Layout
          sidebar={sidebarEl}
          main={mainEl}
          organisationAside={<TeamOrganisationAside />}
          exchangesAside={exchangesAsideEl}
          activityAside={activityAsideEl}
        />
      </TeamWorkspaceProvider>
    </>
  );
}
