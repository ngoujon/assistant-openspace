import { useCallback, useRef, useState } from "react";
import { streamOllamaChat } from "@/lib/ollama";
import type { ChatMessage, Conversation } from "@/types";

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
}

export function ChatPanel({
  conversation,
  models,
  model,
  onModelChange,
  ollamaError,
  onRetryOllama,
  setMessages,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!model) {
      setError("Aucun modèle Ollama détecté. Installe un modèle : ollama pull llama3.2");
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setInput("");
    setError(null);

    const history = [...conversation.messages, userMsg];
    const assistantId = crypto.randomUUID();
    setMessages(() => [
      ...history,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;

    const apiMessages = history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    try {
      await streamOllamaChat(
        model,
        apiMessages,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m,
            ),
          );
        },
        ac.signal,
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message || "Erreur réseau");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    input,
    streaming,
    model,
    conversation.messages,
    setMessages,
  ]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="chat-panel">
      <header className="chat-toolbar">
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
      </header>

      <div className="chat-messages" role="log" aria-live="polite">
        {conversation.messages.length === 0 && (
          <p className="chat-empty">
            Écris un message pour parler au modèle via Ollama (localhost).
          </p>
        )}
        {conversation.messages.map((m, i) => {
          const isPendingAssistant =
            streaming &&
            m.role === "assistant" &&
            !m.content &&
            i === conversation.messages.length - 1;
          return (
            <article
              key={m.id}
              className={`bubble bubble-${m.role}`}
            >
              <span className="bubble-role">
                {m.role === "user" ? "Toi" : "Assistant"}
              </span>
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
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={streaming}
        />
        <div className="chat-actions">
          {streaming ? (
            <button type="button" className="btn-secondary" onClick={stop}>
              Arrêter
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void send()}
              disabled={!input.trim()}
            >
              Envoyer
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
