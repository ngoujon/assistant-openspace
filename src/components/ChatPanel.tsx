import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { MissionWorkspace } from "@/components/MissionWorkspace";
import {
  applyDiscussionToArtifact,
  formatHistoryForRouting,
  generateDiscussionConversationTitle,
  routeDiscussionMessage,
  streamDiscussionReply,
} from "@/lib/discussionTeamChat";
import { resolveForcedResponderFromMessage } from "@/lib/discussionMention";
import { sleepMs } from "@/lib/llmRateLimit";
import { MentionComboboxTextarea } from "@/components/MentionComboboxTextarea";
import { unwrapMarkdownFence } from "@/lib/unwrapMarkdownFence";
import type { LlmProvider } from "@/lib/llmProvider";
import { loadAgentSouls } from "@/lib/teamSoulsStorage";
import { loadTeamMembers, type TreeMember } from "@/lib/teamTreeStorage";
import type { RightActivityState } from "@/types/activity";
import type {
  ChatMessage,
  Conversation,
  MissionActivitySnapshot,
} from "@/types";

type ChatMode = "mission" | "free";

function initialChatMode(conversation: Conversation): ChatMode {
  const hasArtifact = Boolean(conversation.artifactMarkdown?.trim());
  const hasMessages = conversation.messages.length > 0;
  return hasArtifact || hasMessages ? "free" : "mission";
}

interface DiscussionQueuedMessage {
  id: string;
  text: string;
}

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
  model: string;
  llmProvider: LlmProvider;
  mistralApiKey: string;
  llmError: string | null;
  onRetryLlm: () => void;
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
      missionUserBrief?: string;
    },
  ) => void;
  /** Persiste la progression mission sur la conversation (localStorage). */
  onMissionActivitySnapshot?: (
    conversationId: string,
    snapshot: MissionActivitySnapshot,
  ) => void;
  setRightActivity: Dispatch<SetStateAction<RightActivityState>>;
}

export function ChatPanel({
  conversation,
  model,
  llmProvider,
  mistralApiKey,
  llmError,
  onRetryLlm,
  setMessages,
  onConversationTitle,
  onConversationArtifact,
  onMissionActivitySnapshot,
  setRightActivity,
}: ChatPanelProps) {
  const [mode, setMode] = useState<ChatMode>(() =>
    initialChatMode(conversation),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TreeMember[]>(() =>
    loadTeamMembers(),
  );
  const abortRef = useRef<AbortController | null>(null);
  const discussionQueueRef = useRef<DiscussionQueuedMessage[]>([]);
  const pumpingRef = useRef(false);
  const busyRef = useRef(false);
  const runDiscussionSendOrPatchRef = useRef<(text: string) => Promise<void>>(
    async () => {},
  );
  const pumpDiscussionQueueRef = useRef<() => Promise<void>>(async () => {});
  const lastMissionPersistSigRef = useRef<string>("");

  const [discussionQueue, setDiscussionQueue] = useState<
    DiscussionQueuedMessage[]
  >([]);
  const [discussionQueueOpen, setDiscussionQueueOpen] = useState(false);
  const [showMissionDraftHint, setShowMissionDraftHint] = useState(false);
  const discussionRootRef = useRef<HTMLDivElement | null>(null);
  const prevModeRef = useRef<ChatMode>(initialChatMode(conversation));

  useEffect(() => {
    const refresh = () => setTeamMembers(loadTeamMembers());
    window.addEventListener("storage", refresh);
    const onTeamSaved = () => refresh();
    window.addEventListener("openspace-team-updated", onTeamSaved);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("openspace-team-updated", onTeamSaved);
    };
  }, []);

  useEffect(() => {
    setError(null);
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setIsRouting(false);
    discussionQueueRef.current = [];
    setDiscussionQueue([]);
    setDiscussionQueueOpen(false);
    const hasArtifact = !!conversation.artifactMarkdown?.trim();
    const hasMessages = conversation.messages.length > 0;
    const nextMode = hasArtifact || hasMessages ? "free" : "mission";
    setMode(nextMode);
    prevModeRef.current = nextMode;
    if (
      nextMode === "free" &&
      !hasMessages &&
      conversation.missionUserBrief?.trim()
    ) {
      setInput(conversation.missionUserBrief.trim());
      setShowMissionDraftHint(true);
    } else {
      setInput("");
      setShowMissionDraftHint(false);
    }
  }, [conversation.id]);

  /** Après passage Mission → Discussion : faire défiler vers le compositeur. */
  useEffect(() => {
    if (prevModeRef.current === "mission" && mode === "free") {
      const id = window.requestAnimationFrame(() => {
        discussionRootRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
      prevModeRef.current = mode;
      return () => cancelAnimationFrame(id);
    }
    prevModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!showMissionDraftHint) return;
    const t = window.setTimeout(() => setShowMissionDraftHint(false), 6500);
    return () => window.clearTimeout(t);
  }, [showMissionDraftHint]);

  /**
   * Colonne Activité : en mode Mission, réhydrater depuis le snapshot du projet
   * (sans dépendre du snapshot pour ne pas écraser une mission en cours à chaque persistance).
   */
  useEffect(() => {
    if (mode !== "mission") return;
    const snap = conversation.missionActivitySnapshot;
    setRightActivity({
      kind: "mission",
      running: false,
      progress: snap?.progress ?? [],
      elapsedSec: snap?.elapsedSec ?? 0,
    });
    lastMissionPersistSigRef.current = "";
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
      const last = payload.progress[payload.progress.length - 1] ?? "";
      const sig = `${payload.running}:${payload.progress.length}:${last}`;
      const skipPersistIdle =
        !payload.running && payload.progress.length === 0;
      const skipPersistWarmup =
        payload.running && payload.progress.length === 0;
      if (skipPersistIdle || skipPersistWarmup) {
        /* ne pas écraser un snapshot disque avec l’état initial du workspace */
      } else if (sig !== lastMissionPersistSigRef.current) {
        lastMissionPersistSigRef.current = sig;
        onMissionActivitySnapshot?.(conversation.id, payload);
      }
    },
    [conversation.id, onMissionActivitySnapshot, setRightActivity],
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

  /** Fusion discussion → livrable (sans message factice dans le fil). */
  const artifactMergeFromDiscussion = useCallback(
    async (opts: {
      discussionMessages: ChatMessage[];
      artifactMarkdown: string;
      cutoffAfterAssistantId: string;
      signal: AbortSignal;
    }) => {
      const souls = loadAgentSouls();
      const raw = await applyDiscussionToArtifact({
        llmProvider,
        mistralApiKey,
        model,
        souls,
        discussionMessages: opts.discussionMessages,
        artifactMarkdown: opts.artifactMarkdown,
        missionUserBrief: conversation.missionUserBrief,
        signal: opts.signal,
      });
      const finalMd = unwrapMarkdownFence(raw);
      onConversationArtifact(conversation.id, finalMd, {
        discussionCutoffAfterId: opts.cutoffAfterAssistantId,
      });
    },
    [
      conversation.id,
      conversation.missionUserBrief,
      llmProvider,
      mistralApiKey,
      model,
      onConversationArtifact,
    ],
  );

  const runDiscussionSendOrPatch = useCallback(
    async (text: string) => {
      let skipPump = false;
      try {
        if (!model) {
          setError(
            llmProvider === "mistral"
              ? "Aucun modèle Mistral disponible. Vérifie ta clé API dans Paramètres."
              : "Aucun modèle Ollama détecté. Installe un modèle : ollama pull llama3.2",
          );
          skipPump = true;
          return;
        }

        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
        };
        const historyWithUser = [...conversation.messages, userMsg];
        setError(null);
        setMessages(() => historyWithUser);

        const ac = new AbortController();
        abortRef.current = ac;
        setIsRouting(true);
        let assistantId: string | undefined;

        try {
          const members = teamMembers;
          const souls = loadAgentSouls();
          const forcedResponderId =
            resolveForcedResponderFromMessage(text, members) ?? undefined;

          const routing = await routeDiscussionMessage({
            llmProvider,
            mistralApiKey,
            model,
            souls,
            members,
            historyWithLatestUser: historyWithUser,
            signal: ac.signal,
            forcedResponderId,
            missionUserBrief: conversation.missionUserBrief,
            artifactMarkdown: conversation.artifactMarkdown,
          });

          if (llmProvider === "mistral") {
            await sleepMs(320, ac.signal);
          }

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
            llmProvider,
            mistralApiKey,
            model,
            souls,
            responderId: routing.responderId,
            brief: routing.brief,
            historyWithLatestUser: historyWithUser,
            missionUserBrief: conversation.missionUserBrief,
            artifactMarkdown: conversation.artifactMarkdown,
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
          const recentTranscript =
            formatHistoryForRouting(transcriptMessages, 6000);
          const convId = conversation.id;
          void generateDiscussionConversationTitle({
            llmProvider,
            mistralApiKey,
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

          const art = conversation.artifactMarkdown?.trim();
          if (art && assistantId) {
            const discussionForPatch = messagesAfterArtifactCutoff(
              transcriptMessages,
              conversation.artifactDiscussionCutoffAfterId,
            );
            setIsRouting(true);
            try {
              await artifactMergeFromDiscussion({
                discussionMessages: discussionForPatch,
                artifactMarkdown: art,
                cutoffAfterAssistantId: assistantId,
                signal: ac.signal,
              });
            } catch (mergeErr) {
              if ((mergeErr as Error).name === "AbortError") {
                skipPump = true;
                return;
              }
              setError(
                (mergeErr as Error).message ||
                  "La mise à jour automatique du livrable a échoué ; télécharge le .md existant depuis Activité si besoin.",
              );
            } finally {
              setIsRouting(false);
            }
          }
        } catch (e) {
          if ((e as Error).name === "AbortError") {
            skipPump = true;
            return;
          }
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
      } finally {
        if (!skipPump) {
          queueMicrotask(() => void pumpDiscussionQueueRef.current());
        }
      }
    },
    [
      llmProvider,
      mistralApiKey,
      model,
      conversation.id,
      conversation.messages,
      conversation.artifactMarkdown,
      conversation.artifactDiscussionCutoffAfterId,
      conversation.missionUserBrief,
      setMessages,
      onConversationTitle,
      artifactMergeFromDiscussion,
      teamMembers,
    ],
  );

  useEffect(() => {
    runDiscussionSendOrPatchRef.current = runDiscussionSendOrPatch;
  }, [runDiscussionSendOrPatch]);

  const pumpDiscussionQueue = useCallback(async () => {
    if (pumpingRef.current) return;
    if (busyRef.current) return;
    const head = discussionQueueRef.current[0];
    if (!head) return;
    pumpingRef.current = true;
    const claimed = discussionQueueRef.current.shift()!;
    setDiscussionQueue([...discussionQueueRef.current]);
    let scheduleAgain = true;
    try {
      await runDiscussionSendOrPatchRef.current(claimed.text);
    } catch {
      discussionQueueRef.current = [claimed, ...discussionQueueRef.current];
      setDiscussionQueue([...discussionQueueRef.current]);
      scheduleAgain = false;
    } finally {
      pumpingRef.current = false;
      if (scheduleAgain) {
        queueMicrotask(() => void pumpDiscussionQueueRef.current());
      }
    }
  }, []);

  useEffect(() => {
    pumpDiscussionQueueRef.current = pumpDiscussionQueue;
  }, [pumpDiscussionQueue]);

  const removeQueuedMessage = useCallback((id: string) => {
    discussionQueueRef.current = discussionQueueRef.current.filter(
      (x) => x.id !== id,
    );
    setDiscussionQueue([...discussionQueueRef.current]);
  }, []);

  const updateQueuedMessageText = useCallback((id: string, next: string) => {
    discussionQueueRef.current = discussionQueueRef.current.map((x) =>
      x.id === id ? { ...x, text: next } : x,
    );
    setDiscussionQueue([...discussionQueueRef.current]);
  }, []);

  const busy = streaming || isRouting;

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  /** Reprend la file après routage / stream (ex. après « Arrêter » sans pompe). */
  useEffect(() => {
    if (busy) return;
    void pumpDiscussionQueueRef.current();
  }, [busy]);

  const submitDiscussionComposer = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (!model) {
      setError(
        llmProvider === "mistral"
          ? "Aucun modèle Mistral disponible. Vérifie ta clé API dans Paramètres."
          : "Aucun modèle Ollama détecté. Installe un modèle : ollama pull llama3.2",
      );
      return;
    }
    setInput("");
    setShowMissionDraftHint(false);
    setError(null);
    if (!busy && discussionQueueRef.current.length === 0) {
      void runDiscussionSendOrPatchRef.current(text);
      return;
    }
    discussionQueueRef.current = [
      ...discussionQueueRef.current,
      { id: crypto.randomUUID(), text },
    ];
    setDiscussionQueue([...discussionQueueRef.current]);
    if (busy) {
      setDiscussionQueueOpen(true);
    }
    void pumpDiscussionQueueRef.current();
  }, [input, model, llmProvider, busy]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div
      className={`chat-panel${mode === "free" ? " chat-panel--discussion-fullwidth" : ""}`}
    >
      <header className="chat-toolbar chat-toolbar-stack">
        <div className="chat-toolbar-row chat-toolbar-row--phase">
          <p className="chat-phase-label" aria-live="polite">
            {mode === "mission"
              ? "Mission équipe"
              : "Discussion"}
          </p>
          {llmError && (
            <div className="banner banner-warn">
              {llmError}
              <button type="button" className="btn-link" onClick={onRetryLlm}>
                Réessayer
              </button>
            </div>
          )}
        </div>
      </header>

      {mode === "mission" ? (
        <div
          className="chat-phase-surface chat-phase-surface--mission"
          key={`mission-${conversation.id}`}
        >
          <MissionWorkspace
            llmProvider={llmProvider}
            mistralApiKey={mistralApiKey}
            model={model}
            onActivityReport={reportMissionActivity}
            onArtifactProduced={(md, missionUserBrief) => {
              onConversationArtifact(conversation.id, md, {
                clearDiscussionCutoff: true,
                missionUserBrief,
              });
              if (md.trim()) {
                setInput(missionUserBrief.trim());
                setShowMissionDraftHint(true);
                setMode("free");
              }
            }}
            onConversationTitleSuggested={(title) =>
              onConversationTitle(conversation.id, title)
            }
          />
        </div>
      ) : (
        <div
          ref={discussionRootRef}
          className="chat-phase-surface chat-phase-surface--discussion"
          key={`discussion-${conversation.id}`}
        >
          {showMissionDraftHint && (
            <div className="mission-draft-hint" role="status">
              {input.trim() ? (
                <>
                  Ton <strong>contexte mission</strong> est repris dans le champ ci-dessous.
                  Tu peux le modifier avant d’envoyer à l’équipe.
                </>
              ) : (
                <>
                  <strong>Discussion</strong> ouverte — écris à l’équipe pour ajuster le
                  livrable.
                </>
              )}
            </div>
          )}
          <div className="chat-messages" role="log" aria-live="polite">
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
            {discussionQueue.length > 0 && (
              <div className="discussion-queue-block">
                <div className="discussion-queue-toolbar">
                  <span className="discussion-queue-badge" aria-live="polite">
                    {discussionQueue.length === 1
                      ? "1 message en file"
                      : `${discussionQueue.length} messages en file`}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    aria-expanded={discussionQueueOpen}
                    onClick={() => setDiscussionQueueOpen((o) => !o)}
                  >
                    {discussionQueueOpen
                      ? "Replier la file"
                      : "Voir / modifier la file"}
                  </button>
                </div>
                {discussionQueueOpen && (
                  <ol
                    className="discussion-queue-list"
                    aria-label="Messages en attente d’envoi"
                  >
                    {discussionQueue.map((item, index) => (
                      <li key={item.id} className="discussion-queue-item">
                        <span className="discussion-queue-item-index">
                          {index + 1}.
                        </span>
                        <textarea
                          className="discussion-queue-item-text"
                          rows={2}
                          value={item.text}
                          onChange={(e) =>
                            updateQueuedMessageText(item.id, e.target.value)
                          }
                          aria-label={`Message ${index + 1} en file`}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-compact discussion-queue-remove"
                          onClick={() => removeQueuedMessage(item.id)}
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <MentionComboboxTextarea
              className="chat-input"
              rows={3}
              placeholder="Message ou @membre… (le livrable se met à jour après chaque échange)"
              value={input}
              onChange={setInput}
              members={teamMembers}
              disabled={false}
              submitOnEnter
              onSubmit={() => void submitDiscussionComposer()}
            />
            <div className="chat-actions chat-actions--discussion">
              {busy ? (
                <>
                  <button type="button" className="btn-secondary" onClick={stop}>
                    Arrêter
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void submitDiscussionComposer()}
                    disabled={!input.trim()}
                  >
                    Mettre en file
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void submitDiscussionComposer()}
                  disabled={!input.trim()}
                >
                  Envoyer
                </button>
              )}
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
