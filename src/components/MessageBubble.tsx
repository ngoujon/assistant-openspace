import { memo } from "react";
import { DiscussionMessageBody } from "@/components/DiscussionMessageBody";
import {
  markdownFilenameFromConversationTitle,
  triggerMarkdownDownload,
} from "@/lib/downloadMarkdown";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  roleLine: string;
  isPendingAssistant: boolean;
  /** Nom du membre en train de répondre — non `null` seulement si `isPendingAssistant`. */
  pendingSpeakerLabel: string | null;
  /** Nécessaires uniquement pour le bouton de téléchargement du rapport final. */
  artifactMarkdown: string | undefined;
  conversationTitle: string;
}

/**
 * Mémoïsé sur l'identité de `message` (et les quelques primitives qui en dérivent) :
 * pendant un stream, seule la bulle en cours d'écriture change de référence — les
 * autres gardent le même `message` d'un flush à l'autre et ne sont donc pas
 * re-rendues (pas de re-parse Markdown pour tout l'historique à chaque token).
 */
function MessageBubbleImpl({
  message: m,
  roleLine,
  isPendingAssistant,
  pendingSpeakerLabel,
  artifactMarkdown,
  conversationTitle,
}: MessageBubbleProps) {
  return (
    <article
      className={`bubble bubble-${m.role}${m.artifactPatchNote ? " bubble-artifact-patch" : ""}`}
    >
      <span className="bubble-role">{roleLine}</span>
      {isPendingAssistant && pendingSpeakerLabel ? (
        <p className="bubble-streaming-speaker" aria-live="polite">
          En train de répondre : {pendingSpeakerLabel}
        </p>
      ) : null}
      {m.routingNote && <p className="bubble-routing-note">{m.routingNote}</p>}
      <div className="bubble-content bubble-content--md">
        {m.content ? (
          <DiscussionMessageBody text={m.content} />
        ) : isPendingAssistant ? (
          <span className="bubble-streaming-placeholder">…</span>
        ) : (
          ""
        )}
      </div>
      {m.interrupted ? (
        <p className="bubble-interrupted-note">
          Réponse interrompue avant la fin — envoie un nouveau message pour relancer.
        </p>
      ) : null}
      {m.missionDeliverableNote && artifactMarkdown?.trim() ? (
        <button
          type="button"
          className="btn-primary btn-compact bubble-download-md-btn"
          onClick={() =>
            triggerMarkdownDownload(
              artifactMarkdown,
              markdownFilenameFromConversationTitle(conversationTitle),
            )
          }
        >
          Télécharger le rapport (.md)
        </button>
      ) : null}
    </article>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
