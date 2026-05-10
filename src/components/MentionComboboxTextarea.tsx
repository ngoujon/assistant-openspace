import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { TreeMember } from "@/lib/teamTreeStorage";
import {
  filterMentionCandidates,
  findBracketMentionSpans,
  formatBracketMention,
} from "@/lib/discussionMention";

function getActiveMentionRange(
  value: string,
  cursor: number,
): { start: number; query: string } | null {
  if (cursor < 0) return null;
  for (const sp of findBracketMentionSpans(value)) {
    if (cursor > sp.start && cursor < sp.end) return null;
  }
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const charBefore = at > 0 ? before[at - 1] : "";
  if (charBefore && !/\s/.test(charBefore) && charBefore !== "\n") {
    return null;
  }
  const afterAt = before.slice(at + 1);
  if (afterAt.includes("@")) return null;
  if (afterAt.includes("[")) return null;
  if (/\s/.test(afterAt)) return null;
  return { start: at, query: afterAt };
}

/**
 * Retourne true si la touche a été gérée (mention verrouillée @[…] : pas d’édition partielle,
 * suppression du bloc entier au retour arrière).
 */
function tryHandleLockedBracketMentionKey(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  ta: HTMLTextAreaElement,
  onChange: (v: string) => void,
  setCursor: (n: number) => void,
): boolean {
  const spans = findBracketMentionSpans(value);
  if (spans.length === 0) return false;

  const selStart = ta.selectionStart;
  const selEnd = ta.selectionEnd;

  const inLabelInterior = (c: number) =>
    spans.some((sp) => c > sp.start && c < sp.end);

  if (e.key === "Backspace" || e.key === "Delete") {
    if (selStart !== selEnd) return false;
    const c = selStart;
    for (const sp of spans) {
      if (e.key === "Backspace" && sp.start < c && c <= sp.end) {
        e.preventDefault();
        const next = value.slice(0, sp.start) + value.slice(sp.end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = sp.start;
          ta.setSelectionRange(pos, pos);
          setCursor(pos);
        });
        return true;
      }
      if (e.key === "Delete" && c === sp.start) {
        e.preventDefault();
        const next = value.slice(0, sp.start) + value.slice(sp.end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(sp.start, sp.start);
          setCursor(sp.start);
        });
        return true;
      }
    }
    return false;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (selStart !== selEnd) {
      const overlaps = spans.some(
        (sp) => selEnd > sp.start && selStart < sp.end,
      );
      if (overlaps) {
        e.preventDefault();
        return true;
      }
      return false;
    }
    if (inLabelInterior(selStart)) {
      e.preventDefault();
      return true;
    }
  }

  return false;
}

export interface MentionComboboxTextareaProps {
  id?: string;
  className?: string;
  rows?: number;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  members: TreeMember[];
  disabled?: boolean;
  /** Si true : Entrée sans Maj envoie (uniquement lorsque le menu @ est fermé). */
  submitOnEnter?: boolean;
  onSubmit?: () => void;
}

export function MentionComboboxTextarea({
  id,
  className,
  rows,
  placeholder,
  value,
  onChange,
  members,
  disabled,
  submitOnEnter,
  onSubmit,
}: MentionComboboxTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const escBlockAtRef = useRef<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    if (value === "") setCursor(0);
  }, [value]);

  const ctx = getActiveMentionRange(value, cursor);
  const blocked =
    ctx !== null &&
    escBlockAtRef.current !== null &&
    escBlockAtRef.current === ctx.start;
  const candidates =
    ctx && !blocked ? filterMentionCandidates(members, ctx.query) : [];
  const menuOpen = Boolean(ctx && !blocked && candidates.length > 0);

  useEffect(() => {
    setMentionIndex(0);
  }, [ctx?.start, ctx?.query, blocked]);

  useLayoutEffect(() => {
    if (!menuOpen || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-mention-index="${mentionIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [menuOpen, mentionIndex]);

  const pickMember = useCallback(
    (m: TreeMember) => {
      const el = textareaRef.current;
      if (!el || !ctx) return;
      const sel = el.selectionStart;
      const liveCtx = getActiveMentionRange(value, sel);
      if (!liveCtx || liveCtx.start !== ctx.start) return;
      const before = value.slice(0, liveCtx.start);
      const after = value.slice(sel);
      const insert = formatBracketMention(m);
      const spacer = after.length && !/^[\s@]/.test(after) ? " " : "";
      const newVal = before + insert + spacer + after;
      const newPos = before.length + insert.length + spacer.length;
      escBlockAtRef.current = null;
      onChange(newVal);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(newPos, newPos);
        setCursor(newPos);
      });
    },
    [ctx, onChange, value],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = textareaRef.current;
    if (ta && tryHandleLockedBracketMentionKey(e, value, ta, onChange, setCursor)) {
      return;
    }

    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) =>
          Math.min(i + 1, candidates.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const m = candidates[mentionIndex];
        if (m) pickMember(m);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (ctx) escBlockAtRef.current = ctx.start;
        return;
      }
    }

    if (
      submitOnEnter &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !menuOpen
    ) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const listboxId = `mention-listbox-${id ?? "ta"}`;

  return (
    <div className="mention-combobox-wrap">
      {menuOpen && (
        <div
          ref={listRef}
          id={listboxId}
          className="mention-menu"
          role="listbox"
          aria-label="Membres de l’équipe"
        >
          {candidates.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              id={`mention-opt-${id ?? "ta"}-${m.id}`}
              data-mention-index={i}
              aria-selected={i === mentionIndex}
              className={
                "mention-option" +
                (i === mentionIndex ? " mention-option--active" : "")
              }
              onMouseDown={(ev) => {
                ev.preventDefault();
                pickMember(m);
              }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              <span className="mention-option-label">{m.label}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        id={id}
        className={className}
        rows={rows}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? listboxId : undefined}
        aria-activedescendant={
          menuOpen
            ? `mention-opt-${id ?? "ta"}-${candidates[mentionIndex]?.id}`
            : undefined
        }
        onChange={(e) => {
          onChange(e.target.value);
          setCursor(e.target.selectionStart);
          const c = getActiveMentionRange(
            e.target.value,
            e.target.selectionStart,
          );
          if (!c || escBlockAtRef.current !== c.start) {
            escBlockAtRef.current = null;
          }
        }}
        onSelect={(e) => {
          setCursor(e.currentTarget.selectionStart);
          const c = getActiveMentionRange(
            e.currentTarget.value,
            e.currentTarget.selectionStart,
          );
          if (!c || escBlockAtRef.current !== c.start) {
            escBlockAtRef.current = null;
          }
        }}
        onClick={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
