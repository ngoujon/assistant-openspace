import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";

export interface SoulModalNode {
  id: string;
  label: string;
  kind: "master" | "agent" | "sub";
}

interface AgentSoulModalProps {
  node: SoulModalNode | null;
  initialText: string;
  onClose: () => void;
  /** `agentId` = identifiant stable du nœud dans l’arbre (ex. orchestrateur, da-uiux). */
  onSave: (text: string, agentId: string) => void;
}

export function AgentSoulModal({
  node,
  initialText,
  onClose,
  onSave,
}: AgentSoulModalProps) {
  const titleId = useId();
  const descId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(initialText);

  useEffect(() => {
    if (node) {
      setDraft(initialText);
      queueMicrotask(() => textareaRef.current?.focus());
    }
  }, [node, initialText]);

  useEffect(() => {
    if (!node) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [node, onClose]);

  if (!node) return null;

  const handleOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const save = () => {
    if (node) onSave(draft, node.id);
    onClose();
  };

  const kindLabel =
    node.kind === "master"
      ? "Orchestrateur"
      : node.kind === "agent"
        ? "Agent"
        : "Sous-agent";

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker" id={descId}>
              {kindLabel} · Âme et rôle
            </p>
            <h2 className="modal-title" id={titleId}>
              {node.label}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <textarea
          ref={textareaRef}
          className="modal-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          spellCheck
          rows={14}
        />
        <footer className="modal-footer">
          <span className="modal-hint">
            Échap : fermer sans enregistrer · Entrée : enregistrer · Maj+Entrée
            : saut de ligne
          </span>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={save}>
              Enregistrer
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
