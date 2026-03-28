import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { Layout } from "@/components/Layout";
import { Sidebar } from "@/components/Sidebar";
import { TeamPanel } from "@/components/TeamPanel";
import { fetchOllamaModels } from "@/lib/ollama";
import { loadConversations, saveConversations } from "@/lib/storage";
import type { Conversation, MainTab } from "@/types";

function newConversation(): Conversation {
  const id = crypto.randomUUID();
  return {
    id,
    title: "Nouvelle conversation",
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
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  useEffect(() => {
    fetchOllamaModels()
      .then((m) => {
        setModels(m);
        setModel((prev) => prev || m[0] || "");
        setOllamaError(null);
      })
      .catch((e: Error) => setOllamaError(e.message));
  }, []);

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

  const setActiveMessages = useCallback(
    (updater: (prev: Conversation["messages"]) => Conversation["messages"]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== active?.id) return c;
          const messages = updater(c.messages);
          const firstUser = messages.find((m) => m.role === "user");
          const title =
            firstUser?.content.slice(0, 48).trim() ||
            c.title ||
            "Nouvelle conversation";
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

  return (
    <Layout
      sidebar={
        <Sidebar
          conversations={conversations}
          activeId={active.id}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
        />
      }
      main={
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
                ollamaError={ollamaError}
                onRetryOllama={() => {
                  fetchOllamaModels()
                    .then((m) => {
                      setModels(m);
                      setModel((prev) => prev || m[0] || "");
                      setOllamaError(null);
                    })
                    .catch((e: Error) => setOllamaError(e.message));
                }}
                setMessages={setActiveMessages}
              />
            ) : (
              <TeamPanel model={model} />
            )}
          </div>
        </>
      }
    />
  );
}
