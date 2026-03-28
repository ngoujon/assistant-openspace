import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { generateMemberSoulSeed } from "@/lib/generateMemberSeed";

export interface SoulModalNode {
  id: string;
  label: string;
  kind: "master" | "agent" | "sub";
}

interface AgentSoulModalProps {
  node: SoulModalNode | null;
  initialText: string;
  initialLabel: string;
  parentId: string | null;
  parentLabel: string | null;
  model: string;
  onClose: () => void;
  onSave: (text: string, agentId: string, label: string) => void;
}

export function AgentSoulModal({
  node,
  initialText,
  initialLabel,
  parentId,
  parentLabel,
  model,
  onClose,
  onSave,
}: AgentSoulModalProps) {
  const titleId = useId();
  const descId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(initialText);
  const [nameDraft, setNameDraft] = useState(initialLabel);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (node) {
      setDraft(initialText);
      setNameDraft(initialLabel);
      setGenError(null);
      queueMicrotask(() => {
        if (node.kind === "master") textareaRef.current?.focus();
        else nameInputRef.current?.focus();
      });
    }
  }, [node, initialText, initialLabel]);

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
    const label = nameDraft.trim() || node.label;
    if (node) onSave(draft, node.id, label);
    onClose();
  };

  const kindLabel =
    node.kind === "master"
      ? "Orchestrateur"
      : node.kind === "agent"
        ? "Agent"
        : "Sous-agent";

  const canGenerateSeed =
    !!model && nameDraft.trim().length > 0 && !generating;

  const handleGenerateSeed = async () => {
    if (!canGenerateSeed) return;
    setGenError(null);
    setGenerating(true);
    try {
      const text = await generateMemberSoulSeed({
        model,
        memberLabel: nameDraft.trim(),
        parentId,
        parentLabel,
      });
      setDraft(text);
    } catch (e) {
      setGenError((e as Error).message || "Échec de la génération");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        className="modal-dialog modal-dialog-wide"
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
              {nameDraft.trim() || node.label}
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

        <div className="modal-field-block">
          <label className="modal-field-label" htmlFor="soul-member-name">
            Nom du membre
          </label>
          <input
            ref={nameInputRef}
            id="soul-member-name"
            type="text"
            className="modal-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            disabled={node.kind === "master"}
            autoComplete="off"
          />
          {node.kind !== "master" && (
            <div className="modal-seed-row">
              <button
                type="button"
                className="btn-secondary"
                disabled={!canGenerateSeed}
                onClick={() => void handleGenerateSeed()}
              >
                {generating ? "Génération…" : "Générer un seed"}
              </button>
              <span className="modal-seed-hint">
                Utilise Ollama ({model || "aucun modèle"}) selon le nom et la place
                dans l’équipe
                {parentLabel ? ` (sous « ${parentLabel} »)` : ""}.
              </span>
            </div>
          )}
          {genError && <p className="modal-gen-error">{genError}</p>}
        </div>

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
