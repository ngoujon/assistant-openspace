import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ActivitySidebar } from "@/components/ActivitySidebar";
import { MissionWorkspace } from "@/components/MissionWorkspace";
import {
  routeDiscussionMessage,
  streamDiscussionReply,
} from "@/lib/discussionTeamChat";
import { loadAgentSouls } from "@/lib/teamSoulsStorage";
import { loadTeamMembers } from "@/lib/teamTreeStorage";
import type { RightActivityState } from "@/types/activity";
import type { ChatMessage, Conversation } from "@/types";

type ChatMode = "mission" | "free";

interface ChatPanelProps {
  conversation: Conversation;
  models: string[];
  model: string;
  onModelChange: (m: string) => void;
  ollamaError: string | null;
  onRetryOllama: () => void;
  setMessages: (
    fn: (prev: ChatMessage[]) => ChatMessage[],
  ) => void;
  activityState: RightActivityState;
  setRightActivity: Dispatch<SetStateAction<RightActivityState>>;
}

export function ChatPanel({
  conversation,
  models,
  model,
  onModelChange,
  ollamaError,
  onRetryOllama,
  setMessages,
  activityState,
  setRightActivity,
}: ChatPanelProps) {
  const [mode, setMode] = useState<ChatMode>("mission");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setInput("");
    setError(null);
  }, [conversation.id]);

  const reportMissionActivity = useCallback(
    (payload: {
      running: boolean;
      progress: string[];
      elapsedSec: number;
    }) => {
      setRightActivity({
        kind: "mission",
        ...payload,
      });
    },
    [setRightActivity],
  );

  useEffect(() => {
    if (mode === "mission") {
      return;
    }
    const msgs = conversation.messages;
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
    const streamingSpeaker =
      streaming && lastAssistant?.speakerLabel
        ? lastAssistant.speakerLabel
        : null;
    setRightActivity({
      kind: "discussion",
      isRouting,
      streaming,
      panelError: error,
      streamingSpeaker,
    });
  }, [
    mode,
    isRouting,
    streaming,
    error,
    conversation.messages,
    conversation.id,
    setRightActivity,
  ]);

  const sendDiscussion = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || isRouting) return;
    if (!model) {
      setError("Aucun modèle Ollama détecté. Installe un modèle : ollama pull llama3.2");
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const historyWithUser = [...conversation.messages, userMsg];
    setInput("");
    setError(null);
    setMessages(() => historyWithUser);

    const ac = new AbortController();
    abortRef.current = ac;
    setIsRouting(true);
    let assistantId: string | undefined;

    try {
      const members = loadTeamMembers();
      const souls = loadAgentSouls();

      const routing = await routeDiscussionMessage({
        model,
        souls,
        members,
        historyWithLatestUser: historyWithUser,
        signal: ac.signal,
      });

      const speakerLabel =
        members.find((m) => m.id === routing.responderId)?.label ??
        routing.responderId;

      assistantId = crypto.randomUUID();
      const assistantShell: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        speakerLabel,
        routingNote: routing.userNote,
      };

      setMessages(() => [...historyWithUser, assistantShell]);
      setIsRouting(false);
      setStreaming(true);

      await streamDiscussionReply({
        model,
        souls,
        responderId: routing.responderId,
        brief: routing.brief,
        historyWithLatestUser: historyWithUser,
        onToken: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m,
            ),
          );
        },
        signal: ac.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message || "Erreur réseau");
      setMessages((prev) =>
        prev.filter(
          (m) => m.id !== userMsg.id && m.id !== assistantId,
        ),
      );
    } finally {
      setIsRouting(false);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    input,
    streaming,
    isRouting,
    model,
    conversation.messages,
    setMessages,
  ]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const busy = streaming || isRouting;

  return (
    <div className="chat-panel">
      <header className="chat-toolbar chat-toolbar-stack">
        <div
          className="chat-mode-switch"
          role="tablist"
          aria-label="Mode du chat"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "mission"}
            className={mode === "mission" ? "chat-mode-tab active" : "chat-mode-tab"}
            onClick={() => setMode("mission")}
          >
            Mission équipe
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "free"}
            className={mode === "free" ? "chat-mode-tab active" : "chat-mode-tab"}
            onClick={() => setMode("free")}
          >
            Discussion
          </button>
        </div>
        <div className="chat-toolbar-row">
          <label className="model-label">
            Modèle Ollama
            <select
              className="model-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={!models.length}
            >
              {models.length === 0 ? (
                <option value="">—</option>
              ) : (
                models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              )}
            </select>
          </label>
          {ollamaError && (
            <div className="banner banner-warn">
              {ollamaError}
              <button type="button" className="btn-link" onClick={onRetryOllama}>
                Réessayer
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="activity-inline-wrap" aria-hidden={false}>
        <ActivitySidebar state={activityState} variant="inline" />
      </div>

      {mode === "mission" ? (
        <MissionWorkspace
          model={model}
          onActivityReport={reportMissionActivity}
        />
      ) : (
        <>
          <div className="chat-messages" role="log" aria-live="polite">
            {conversation.messages.length === 0 && (
              <p className="chat-empty">
                Tu t’adresses à <strong>toute l’équipe</strong>. L’
                <strong>orchestrateur</strong> route chaque message vers le membre le
                plus pertinent (ou répond lui-même pour une synthèse, un compte rendu
                ou une vision globale si tu le demandes). Configure les rôles dans
                l’onglet <strong>Équipe</strong>.
              </p>
            )}
            {conversation.messages.map((m, i) => {
              const isPendingAssistant =
                streaming &&
                m.role === "assistant" &&
                !m.content &&
                i === conversation.messages.length - 1;
              const roleLine =
                m.role === "user"
                  ? "Toi"
                  : m.speakerLabel
                    ? `Équipe · ${m.speakerLabel}`
                    : "Assistant";
              return (
                <article
                  key={m.id}
                  className={`bubble bubble-${m.role}`}
                >
                  <span className="bubble-role">{roleLine}</span>
                  {m.routingNote && (
                    <p className="bubble-routing-note">{m.routingNote}</p>
                  )}
                  <div className="bubble-content">
                    {m.content || (isPendingAssistant ? "…" : "")}
                  </div>
                </article>
              );
            })}
          </div>

          {error && <div className="banner banner-error">{error}</div>}

          <footer className="chat-input-row">
            <textarea
              className="chat-input"
              rows={3}
              placeholder="Message à toute l’équipe…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendDiscussion();
                }
              }}
              disabled={busy}
            />
            <div className="chat-actions">
              {busy ? (
                <button type="button" className="btn-secondary" onClick={stop}>
                  Arrêter
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void sendDiscussion()}
                  disabled={!input.trim()}
                >
                  Envoyer
                </button>
              )}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
