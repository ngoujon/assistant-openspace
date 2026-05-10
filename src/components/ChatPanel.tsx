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
  applyDiscussionToArtifact,
  formatHistoryForRouting,
  generateDiscussionConversationTitle,
  routeDiscussionMessage,
  streamDiscussionReply,
} from "@/lib/discussionTeamChat";
import {
  isArtifactApplyIntent,
  resolveForcedResponderFromMessage,
} from "@/lib/discussionMention";
import {
  markdownFilenameFromConversationTitle,
  triggerMarkdownDownload,
} from "@/lib/downloadMarkdown";
import { unwrapMarkdownFence } from "@/lib/unwrapMarkdownFence";
import { loadAgentSouls } from "@/lib/teamSoulsStorage";
import { loadTeamMembers } from "@/lib/teamTreeStorage";
import type { RightActivityState } from "@/types/activity";
import type { ChatMessage, Conversation } from "@/types";

type ChatMode = "mission" | "free";

/** Messages à envoyer à l’orchestrateur pour une fusion : uniquement après la dernière mise à jour. */
function messagesAfterArtifactCutoff(
  messages: ChatMessage[],
  cutoffAfterId?: string,
): ChatMessage[] {
  if (!cutoffAfterId?.trim()) return messages;
  const idx = messages.findIndex((m) => m.id === cutoffAfterId);
  if (idx === -1) return messages;
  return messages.slice(idx + 1);
}

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
  /** Titre court proposé par l’orchestrateur après une réponse (mode Discussion). */
  onConversationTitle: (conversationId: string, title: string) => void;
  /** Met à jour le Markdown livrable lié à cette conversation (mission + fusions). */
  onConversationArtifact: (
    conversationId: string,
    markdown: string,
    opts?: {
      discussionCutoffAfterId?: string;
      clearDiscussionCutoff?: boolean;
    },
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
  onConversationTitle,
  onConversationArtifact,
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
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setIsRouting(false);
    if (conversation.messages.length === 0) {
      setMode("mission");
    }
  }, [conversation.id]);

  /** Colonne Activité : en mode Mission, suivre le projet actif (pas le précédent). */
  useEffect(() => {
    if (mode !== "mission") return;
    setRightActivity({
      kind: "mission",
      running: false,
      progress: [],
      elapsedSec: 0,
    });
  }, [conversation.id, mode, setRightActivity]);

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

  const downloadLinkedArtifact = useCallback(() => {
    const md = conversation.artifactMarkdown?.trim();
    if (!md) return;
    triggerMarkdownDownload(
      md,
      markdownFilenameFromConversationTitle(conversation.title),
    );
  }, [conversation.artifactMarkdown, conversation.title]);

  const trimmedArtifact = conversation.artifactMarkdown?.trim();
  const linkedArtifactForActivity =
    trimmedArtifact && trimmedArtifact.length > 0
      ? {
          markdown: trimmedArtifact,
          filename: markdownFilenameFromConversationTitle(conversation.title),
        }
      : null;

  const patchArtifactFromDiscussion = useCallback(
    async (instructionText: string) => {
      const art = conversation.artifactMarkdown?.trim();
      if (!art) {
        setError(
          "Aucun livrable lié. Termine une mission (onglet Mission équipe), puis reviens en Discussion.",
        );
        return;
      }
      if (!model) {
        setError(
          "Aucun modèle Ollama détecté. Installe un modèle : ollama pull llama3.2",
        );
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: instructionText,
      };
      const historyWithUser = [...conversation.messages, userMsg];
      const discussionForPatch = [
        ...messagesAfterArtifactCutoff(
          conversation.messages,
          conversation.artifactDiscussionCutoffAfterId,
        ),
        userMsg,
      ];
      setInput("");
      setError(null);
      setMessages(() => historyWithUser);

      const ac = new AbortController();
      abortRef.current = ac;
      setIsRouting(true);

      try {
        const souls = loadAgentSouls();
        const raw = await applyDiscussionToArtifact({
          model,
          souls,
          discussionMessages: discussionForPatch,
          artifactMarkdown: art,
          signal: ac.signal,
        });
        const finalMd = unwrapMarkdownFence(raw);
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Le livrable Markdown a été révisé d’après la discussion. Tu peux le télécharger depuis la barre « Livrable lié » ou poursuivre les échanges.",
          speakerLabel: "Orchestrateur",
          routingNote: "Synthèse de la discussion intégrée au document.",
          artifactPatchNote: true,
        };
        onConversationArtifact(conversation.id, finalMd, {
          discussionCutoffAfterId: assistantMsg.id,
        });
        setMessages(() => [...historyWithUser, assistantMsg]);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Erreur réseau");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setIsRouting(false);
        abortRef.current = null;
      }
    },
    [
      conversation.id,
      conversation.messages,
      conversation.artifactMarkdown,
      conversation.artifactDiscussionCutoffAfterId,
      model,
      setMessages,
      onConversationArtifact,
    ],
  );

  const sendDiscussion = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || isRouting) return;
    if (!model) {
      setError("Aucun modèle Ollama détecté. Installe un modèle : ollama pull llama3.2");
      return;
    }

    if (isArtifactApplyIntent(text)) {
      if (!conversation.artifactMarkdown?.trim()) {
        setError(
          "Aucun livrable lié. Termine une mission pour produire un Markdown, puis reviens en Discussion.",
        );
        return;
      }
      await patchArtifactFromDiscussion(text);
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
      const forcedResponderId =
        resolveForcedResponderFromMessage(text, members) ?? undefined;

      const routing = await routeDiscussionMessage({
        model,
        souls,
        members,
        historyWithLatestUser: historyWithUser,
        signal: ac.signal,
        forcedResponderId,
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

      let assistantAccum = "";
      await streamDiscussionReply({
        model,
        souls,
        responderId: routing.responderId,
        brief: routing.brief,
        historyWithLatestUser: historyWithUser,
        onToken: (chunk) => {
          assistantAccum += chunk;
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

      const transcriptMessages: ChatMessage[] = [
        ...historyWithUser,
        {
          id: assistantId,
          role: "assistant",
          content: assistantAccum,
          speakerLabel,
          routingNote: routing.userNote,
        },
      ];
      const recentTranscript = formatHistoryForRouting(transcriptMessages, 6000);
      const convId = conversation.id;
      void generateDiscussionConversationTitle({
        model,
        souls,
        recentTranscript,
      })
        .then((t) => {
          if (t) onConversationTitle(convId, t);
        })
        .catch(() => {
          /* titre optionnel : on garde l’extrait utilisateur si échec */
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
    conversation.id,
    conversation.messages,
    conversation.artifactMarkdown,
    setMessages,
    onConversationTitle,
    patchArtifactFromDiscussion,
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
        <ActivitySidebar
          state={activityState}
          variant="inline"
          linkedArtifact={linkedArtifactForActivity}
        />
      </div>

      {mode === "mission" ? (
        <MissionWorkspace
          key={conversation.id}
          model={model}
          onActivityReport={reportMissionActivity}
          onArtifactProduced={(md) =>
            onConversationArtifact(conversation.id, md, {
              clearDiscussionCutoff: true,
            })
          }
          onConversationTitleSuggested={(title) =>
            onConversationTitle(conversation.id, title)
          }
        />
      ) : (
        <>
          {conversation.artifactMarkdown?.trim() && (
            <div
              className="discussion-artifact-bar"
              aria-label="Livrable Markdown lié à cette conversation"
            >
              <div className="discussion-artifact-bar-row">
                <span className="discussion-artifact-title">Livrable lié</span>
                <div className="discussion-artifact-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    onClick={downloadLinkedArtifact}
                  >
                    Télécharger .md
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-compact"
                    disabled={busy}
                    onClick={() =>
                      void patchArtifactFromDiscussion(
                        "Appliquer la mise à jour.",
                      )
                    }
                  >
                    Appliquer la discussion au livrable
                  </button>
                </div>
              </div>
              <pre className="discussion-artifact-preview">
                {conversation.artifactMarkdown.length > 2800
                  ? `${conversation.artifactMarkdown.slice(0, 2800)}\n\n…`
                  : conversation.artifactMarkdown}
              </pre>
            </div>
          )}
          <p className="discussion-routing-hint" role="note">
            <strong>@mention</strong> : cible un membre ou l’orchestrateur (
            <code>@orchestrateur</code>, id ou nom tel qu’affiché dans{" "}
            <strong>Équipe</strong>). Sans @, l’orchestrateur choisit qui répond.
            {conversation.artifactMarkdown?.trim()
              ? " Pour intégrer la discussion dans le document : écris « appliquer la mise à jour » ou le bouton ci-dessus."
              : " Après une mission, le livrable est lié ici pour affinage."}
          </p>
          <div className="chat-messages" role="log" aria-live="polite">
            {conversation.messages.length === 0 && (
              <p className="chat-empty">
                Tu t’adresses à <strong>toute l’équipe</strong>. L’
                <strong>orchestrateur</strong> route chaque message vers le membre le
                plus pertinent (ou répond lui-même pour une synthèse ou un arbitrage).
                Utilise <strong>@</strong> pour parler à quelqu’un en direct. Configure
                les rôles dans l’onglet <strong>Équipe</strong>.
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
                  className={`bubble bubble-${m.role}${m.artifactPatchNote ? " bubble-artifact-patch" : ""}`}
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
              placeholder="Message ou @membre… (ex. appliquer la mise à jour)"
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
