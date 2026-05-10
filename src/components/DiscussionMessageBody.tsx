import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitBracketMentionsForVisual } from "@/lib/discussionMention";

function isSafeHref(href: string | undefined): boolean {
  if (!href || href.trim() === "") return false;
  const h = href.trim();
  return (
    h.startsWith("https://") ||
    h.startsWith("http://") ||
    h.startsWith("/") ||
    h.startsWith("#") ||
    h.startsWith("mailto:")
  );
}

/** Détecte listes, titres, tableaux, blocs de code : layout bloc plutôt que segments inline. */
function messageNeedsFullBlockMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /(^|\n)#{1,6}\s|(^|\n)[ \t]*[-*+]\s|(^|\n)[ \t]*\d+\.\s|(^|\n)```|^\|.*\|/m.test(
    t,
  );
}

const mdBlockBreak: Components = {
  p: ({ children }) => <p className="discussion-md-p">{children}</p>,
  h1: ({ children }) => (
    <h1 className="discussion-md-h discussion-md-h1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="discussion-md-h discussion-md-h2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="discussion-md-h discussion-md-h3">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="discussion-md-h discussion-md-h4">{children}</h4>
  ),
  ul: ({ children }) => <ul className="discussion-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="discussion-md-ol">{children}</ol>,
  li: ({ children }) => <li className="discussion-md-li">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="discussion-md-bq">{children}</blockquote>
  ),
  pre: ({ children }) => <pre className="discussion-md-pre">{children}</pre>,
  code: ({ className, children, ...props }) => {
    const inline = !className?.includes("language-");
    if (inline) {
      return (
        <code className="discussion-md-code discussion-md-code--inline" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="discussion-md-table-wrap">
      <table className="discussion-md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  a: ({ href, children, ...rest }) => {
    if (!isSafeHref(href)) {
      return <span className="discussion-md-link-text">{children}</span>;
    }
    const external = href!.startsWith("http://") || href!.startsWith("https://");
    return (
      <a
        href={href}
        className="discussion-md-a"
        {...rest}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  hr: () => <hr className="discussion-md-hr" />,
  img: ({ alt }) => (
    <span className="discussion-md-img-fallback" title={alt}>
      [image]
    </span>
  ),
};

/** Puces / paragraphes dans un segment entre deux mentions : flux plutôt inline. */
const mdSegmentComponents: Components = {
  ...mdBlockBreak,
  p: ({ children }) => (
    <span className="discussion-md-p discussion-md-p--inline">{children}</span>
  ),
};

/**
 * Contenu d’une bulle de discussion : Markdown (GFM) + mentions `@[…]` en pastilles.
 */
export function DiscussionMessageBody({ text }: { text: string }) {
  const parts = splitBracketMentionsForVisual(text);
  const hasMention = parts.some((p) => p.kind === "mention");
  const blockMode = messageNeedsFullBlockMarkdown(text);
  const mdComponents = blockMode ? mdBlockBreak : mdSegmentComponents;

  if (!hasMention) {
    return (
      <div className="discussion-message-md discussion-message-md--block">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdBlockBreak}>
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div
      className={
        "discussion-message-md" +
        (blockMode
          ? " discussion-message-md--block discussion-message-md--with-mentions"
          : " discussion-message-md--segments")
      }
    >
      {parts.map((part, i) =>
        part.kind === "text" ? (
          part.text.length > 0 ? (
            blockMode ? (
              <div
                key={i}
                className="discussion-md-segment discussion-md-segment--block"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={mdComponents}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            ) : (
              <span key={i} className="discussion-md-segment">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={mdComponents}
                >
                  {part.text}
                </ReactMarkdown>
              </span>
            )
          ) : null
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
    </div>
  );
}
