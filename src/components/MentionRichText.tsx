import { splitBracketMentionsForVisual } from "@/lib/discussionMention";

interface MentionRichTextProps {
  text: string;
  /** Classe sur le conteneur (ex. bulle de chat). */
  className?: string;
}

/**
 * Affiche le texte en stylisant les mentions `@[Libellé]` comme des badges.
 */
export function MentionRichText({ text, className }: MentionRichTextProps) {
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
