import { splitBracketMentionsForVisual } from "@/lib/discussionMention";

interface MentionRichTextProps {
  text: string;
  /** Classe sur le conteneur (ex. bulle de chat). */
  className?: string;
  /**
   * Superposition compositeur : affiche le littéral `@[…]` (même césures que le textarea).
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
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span
            key={i}
            className={
              "agent-mention-badge" +
              (metricMirror ? " agent-mention-badge--metric-mirror" : "")
            }
            title={part.raw}
            translate="no"
          >
            {metricMirror ? part.raw : `@${part.displayLabel}`}
          </span>
        ),
      )}
    </span>
  );
}
