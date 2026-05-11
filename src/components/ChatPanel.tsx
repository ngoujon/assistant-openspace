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
  DISCUSSION_FIL_LINES_JSON,
  routeDiscussionMessage,
  streamDiscussionReply,
} from "@/lib/discussionTeamChat";
import {
  collectMentionedMemberIds,
  resolveForcedResponderFromMessage,
} from "@/lib/discussionMention";
import {
  MISTRAL_DISCUSSION_ROUTE_TO_STREAM_MS,
  MISTRAL_DISCUSSION_STREAM_TO_MERGE_MS,
  sleepMs,
} from "@/lib/llmRateLimit";
import { MentionComboboxTextarea } from "@/components/MentionComboboxTextarea";
import { DiscussionMessageBody } from "@/components/DiscussionMessageBody";
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

const DISCUSSION_ACTIVITY_MAX_LINES = 100;

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
  /** Température Mistral (0–1) depuis Paramètres. */
  mistralTemperature: number;
  llmError: string | null;
  onRetryLlm: () => void;
  /** Premier argument = conversation ciblée (obligatoire pour les tours async). */
  setMessages: (
    conversationId: string,
    fn: (prev: ChatMessage[]) => ChatMessage[],
  ) => void;
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
  mistralTemperature,
  llmError,
  onRetryLlm,
  setMessages,
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
  const discussionActivityConvIdRef = useRef(conversation.id);
  const discussionBusySinceRef = useRef<number | null>(null);

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
      setInput("");
      setShowMissionDraftHint(true);
    } else {
      setInput("");
      setShowMissionDraftHint(false);
    }
  }, [conversation.id]);

  /**
   * Livrable mission + brief persistés mais fil discussion vide : afficher le brief
   * comme premier message (données anciennes ou tout juste après la mission).
   */
  useEffect(() => {
    const brief = conversation.missionUserBrief?.trim();
    if (!brief || !conversation.artifactMarkdown?.trim()) return;
    if (conversation.messages.length > 0) return;
    setMessages(conversation.id, () => [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: brief,
        routingNote: "Demande envoyée en phase Mission équipe.",
      },
    ]);
  }, [
    conversation.id,
    conversation.missionUserBrief,
    conversation.artifactMarkdown,
    conversation.messages.length,
    setMessages,
  ]);

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

  const appendDiscussionProgressLine = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      setRightActivity((prev) => {
        const cap = (lines: string[]) =>
          lines.length > DISCUSSION_ACTIVITY_MAX_LINES
            ? lines.slice(-DISCUSSION_ACTIVITY_MAX_LINES)
            : lines;
        if (prev.kind !== "discussion") {
          return {
            kind: "discussion",
            isRouting: false,
            streaming: false,
            panelError: null,
            streamingSpeaker: null,
            discussionProgress: cap([trimmed]),
            lastCompletedTurnSec: null,
          };
        }
        return {
          ...prev,
          discussionProgress: cap([...prev.discussionProgress, trimmed]),
        };
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

    setRightActivity((prev) => {
      const idChanged =
        discussionActivityConvIdRef.current !== conversation.id;
      if (idChanged) {
        discussionActivityConvIdRef.current = conversation.id;
        discussionBusySinceRef.current = null;
      }
      const discussionProgress =
        !idChanged && prev.kind === "discussion"
          ? prev.discussionProgress
          : [];
      const busy = isRouting || streaming;
      const wasBusy =
        prev.kind === "discussion" && (prev.isRouting || prev.streaming);
      let lastCompletedTurnSec: number | null =
        prev.kind === "discussion" && !idChanged
          ? prev.lastCompletedTurnSec
          : null;
      if (busy && !wasBusy) {
        discussionBusySinceRef.current = Date.now();
        lastCompletedTurnSec = null;
      }
      if (!busy && wasBusy && discussionBusySinceRef.current != null) {
        lastCompletedTurnSec = Math.floor(
          (Date.now() - discussionBusySinceRef.current) / 1000,
        );
        discussionBusySinceRef.current = null;
      }
      return {
        kind: "discussion",
        isRouting,
        streaming,
        panelError: error,
        streamingSpeaker,
        discussionProgress,
        lastCompletedTurnSec,
      };
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
      conversationId: string;
      missionUserBrief?: string | null;
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
        missionUserBrief: opts.missionUserBrief ?? undefined,
        signal: opts.signal,
        mistralTemperature:
          llmProvider === "mistral" ? mistralTemperature : undefined,
      });
      const finalMd = unwrapMarkdownFence(raw);
      onConversationArtifact(opts.conversationId, finalMd, {
        discussionCutoffAfterId: opts.cutoffAfterAssistantId,
      });
    },
    [llmProvider, mistralApiKey, mistralTemperature, model, onConversationArtifact],
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

        const convId = conversation.id;
        const turnMessages = conversation.messages;
        const turnMissionBrief = conversation.missionUserBrief;
        const turnArtifactMd = conversation.artifactMarkdown;
        const turnCutoffAfterId = conversation.artifactDiscussionCutoffAfterId;

        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
        };
        const historyWithUser = [...turnMessages, userMsg];
        setError(null);
        setMessages(convId, () => historyWithUser);
        appendDiscussionProgressLine("Consigne enregistrée dans le fil.");

        const ac = new AbortController();
        abortRef.current = ac;
        setIsRouting(true);
        appendDiscussionProgressLine(
          "Routage — l’orchestrateur choisit le membre le plus qualifié pour répondre.",
        );
        let assistantId: string | undefined;

        try {
          const members = teamMembers;
          const souls = loadAgentSouls();
          const mentionedIds = collectMentionedMemberIds(text, members);
          const forcedResponderId =
            mentionedIds.length <= 1
              ? (resolveForcedResponderFromMessage(text, members) ??
                undefined)
              : undefined;
          let multiMentionRoutingHint: string | undefined;
          if (mentionedIds.length > 1) {
            const labels = mentionedIds
              .map((id) => members.find((m) => m.id === id)?.label ?? id)
              .join(", ");
            multiMentionRoutingHint =
              `L’utilisateur a mentionné **plusieurs** membres dans ce message : **${labels}**. ` +
              `Désigne **un seul** \`responderId\` pour la réponse **dans le fil** ; dans \`brief\`, fais **combiner** leurs angles pour **guider la retouche du livrable** (pas une conversation séparée par personne). La fusion du .md lira tout le fil. ` +
              `Réponse **dans le fil** : **${DISCUSSION_FIL_LINES_JSON}**, style télégraphique ; le détail reste pour le .md.`;
          }

          const routing = await routeDiscussionMessage({
            llmProvider,
            mistralApiKey,
            model,
            souls,
            members,
            historyWithLatestUser: historyWithUser,
            signal: ac.signal,
            forcedResponderId,
            multiMentionRoutingHint,
            missionUserBrief: turnMissionBrief,
            artifactMarkdown: turnArtifactMd,
            mistralTemperature:
              llmProvider === "mistral" ? mistralTemperature : undefined,
          });

          if (llmProvider === "mistral") {
            await sleepMs(MISTRAL_DISCUSSION_ROUTE_TO_STREAM_MS, ac.signal);
          }

          const speakerLabel =
            members.find((m) => m.id === routing.responderId)?.label ??
            routing.responderId;
          appendDiscussionProgressLine(`Intervenant : ${speakerLabel}`);

          assistantId = crypto.randomUUID();
          const assistantShell: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            speakerLabel,
            routingNote: routing.userNote,
          };

          setMessages(convId, () => [...historyWithUser, assistantShell]);
          setIsRouting(false);
          setStreaming(true);
          appendDiscussionProgressLine("Rédaction de la réponse (flux du modèle)…");

          let assistantAccum = "";
          await streamDiscussionReply({
            llmProvider,
            mistralApiKey,
            model,
            souls,
            responderId: routing.responderId,
            brief: routing.brief,
            historyWithLatestUser: historyWithUser,
            missionUserBrief: turnMissionBrief,
            artifactMarkdown: turnArtifactMd,
            mistralTemperature:
              llmProvider === "mistral" ? mistralTemperature : undefined,
            onToken: (chunk) => {
              assistantAccum += chunk;
              setMessages(convId, (prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + chunk }
                    : m,
                ),
              );
            },
            signal: ac.signal,
          });
          appendDiscussionProgressLine("Réponse de l’équipe reçue.");

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
          const art = turnArtifactMd?.trim();
          if (art && assistantId) {
            const discussionForPatch = messagesAfterArtifactCutoff(
              transcriptMessages,
              turnCutoffAfterId,
            );
            if (llmProvider === "mistral") {
              await sleepMs(MISTRAL_DISCUSSION_STREAM_TO_MERGE_MS, ac.signal);
            }
            setIsRouting(true);
            appendDiscussionProgressLine(
              "Application des retouches au livrable Markdown…",
            );
            try {
              await artifactMergeFromDiscussion({
                conversationId: convId,
                missionUserBrief: turnMissionBrief,
                discussionMessages: discussionForPatch,
                artifactMarkdown: art,
                cutoffAfterAssistantId: assistantId,
                signal: ac.signal,
              });
              appendDiscussionProgressLine("Livrable Markdown mis à jour.");
            } catch (mergeErr) {
              if ((mergeErr as Error).name === "AbortError") {
                appendDiscussionProgressLine(
                  "Mise à jour du livrable interrompue.",
                );
                skipPump = true;
                return;
              }
              appendDiscussionProgressLine(
                `Échec fusion livrable : ${((mergeErr as Error).message || "?").slice(0, 100)}`,
              );
              setError(
                (mergeErr as Error).message ||
                  "La mise à jour automatique du livrable a échoué ; télécharge le .md existant depuis Activité si besoin.",
              );
            } finally {
              setIsRouting(false);
            }
          } else {
            appendDiscussionProgressLine(
              "Pas de fusion automatique : aucun livrable Markdown lié à ce projet.",
            );
          }
        } catch (e) {
          if ((e as Error).name === "AbortError") {
            appendDiscussionProgressLine("Échange interrompu.");
            skipPump = true;
            return;
          }
          appendDiscussionProgressLine(
            `Erreur : ${((e as Error).message || "réseau").slice(0, 120)}`,
          );
          setError((e as Error).message || "Erreur réseau");
          setMessages(convId, (prev) =>
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
      mistralTemperature,
      model,
      conversation.id,
      conversation.messages,
      conversation.artifactMarkdown,
      conversation.artifactDiscussionCutoffAfterId,
      conversation.missionUserBrief,
      setMessages,
      artifactMergeFromDiscussion,
      teamMembers,
      appendDiscussionProgressLine,
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
            mistralTemperature={mistralTemperature}
            model={model}
            onActivityReport={reportMissionActivity}
            onArtifactProduced={(md, missionUserBrief) => {
              onConversationArtifact(conversation.id, md, {
                clearDiscussionCutoff: true,
                missionUserBrief,
              });
              if (md.trim()) {
                setInput("");
                setShowMissionDraftHint(true);
                setMode("free");
              }
            }}
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
                  <div className="bubble-content bubble-content--md">
                    {m.content ? (
                      <DiscussionMessageBody text={m.content} />
                    ) : isPendingAssistant ? (
                      "…"
                    ) : (
                      ""
                    )}
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
                    className="btn-secondary discussion-queue-toggle"
                    aria-expanded={discussionQueueOpen}
                    aria-label={
                      discussionQueueOpen
                        ? "Replier la file d’attente"
                        : "Voir ou modifier la file d’attente"
                    }
                    title={
                      discussionQueueOpen
                        ? "Replier la file"
                        : "Voir / modifier la file"
                    }
                    onClick={() => setDiscussionQueueOpen((o) => !o)}
                  >
                    {discussionQueueOpen ? (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                      </svg>
                    )}
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
                          className="btn-secondary discussion-queue-remove"
                          aria-label={`Retirer le message ${index + 1} de la file`}
                          title="Retirer de la file"
                          onClick={() => removeQueuedMessage(item.id)}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
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
