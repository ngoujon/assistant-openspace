import { Fragment } from "react";
import { splitBracketMentionsForVisual } from "@/lib/discussionMention";

interface MentionRichTextProps {
  text: string;
  /** Classe sur le conteneur (ex. bulle de chat). */
  className?: string;
  /**
   * Superposition compositeur : `@Libellé` sans crochets visibles ; largeur min. en `ch`
   * pour se rapprocher de la chaîne `@[…]` sous-jacente (curseur).
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
                className="agent-mention-badge agent-mention-badge--metric-mirror"
                style={{
                  minWidth: `${Math.max(
                    part.raw.length,
                    part.displayLabel.length + 2,
                  )}ch`,
                }}
                title={part.raw}
                translate="no"
              >
                @{part.displayLabel}
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
