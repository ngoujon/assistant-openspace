import { Fragment } from "react";
import { splitBracketMentionsForVisual } from "@/lib/discussionMention";

interface MentionRichTextProps {
  text: string;
  /** Classe sur le conteneur (ex. bulle de chat). */
  className?: string;
  /**
   * Superposition compositeur : badge `@Libellé` calé sur une copie invisible du
   * littéral `@[…]` (même largeur que le textarea pour aligner le curseur).
   */
  metricMirror?: boolean;
}

/**
 * Affiche le texte en stylisant les mentions `@[Libellé]` comme des badges.
 */
export function MentionRichText({
  text,
  className,
  metricMirror = false,
}: MentionRichTextProps) {
  const parts = splitBracketMentionsForVisual(text);
  return (
    <span
      className={["mention-rich-text", className].filter(Boolean).join(" ")}
    >
      {metricMirror
        ? parts.map((part, i) =>
            part.kind === "text" ? (
              <Fragment key={`t-${i}`}>{part.text}</Fragment>
            ) : (
              <span
                key={`m-${i}`}
                className="mention-metric-slot"
                title={part.raw}
                translate="no"
              >
                <span className="mention-metric-measure" aria-hidden>
                  {part.raw}
                </span>
                <span className="mention-metric-overlay agent-mention-badge agent-mention-badge--metric-mirror">
                  @{part.displayLabel}
                </span>
              </span>
            ),
          )
        : parts.map((part, i) =>
            part.kind === "text" ? (
              <span key={i}>{part.text}</span>
            ) : (
              <span
                key={i}
                className="agent-mention-badge"
                title={part.raw}
                translate="no"
              >
                @{part.displayLabel}
              </span>
            ),
          )}
    </span>
  );
}
