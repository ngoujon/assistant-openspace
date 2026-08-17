import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { generateMemberSoulSeed } from "@/lib/generateMemberSeed";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { LlmProvider } from "@/lib/llmProvider";

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
  /** Vide pour l’orchestrateur ; sinon liste pour le sélecteur « Rattaché sous ». */
  parentOptions: { id: string; label: string }[];
  model: string;
  llmProvider: LlmProvider;
  ollamaApiKey: string;
  ollamaApiUrl: string;
  onClose: () => void;
  onSave: (
    text: string,
    agentId: string,
    label: string,
    newParentId?: string,
  ) => void;
}

export function AgentSoulModal({
  node,
  initialText,
  initialLabel,
  parentId,
  parentLabel,
  parentOptions,
  model,
  llmProvider,
  ollamaApiKey,
  ollamaApiUrl,
  onClose,
  onSave,
}: AgentSoulModalProps) {
  const titleId = useId();
  const descId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(initialText);
  const [nameDraft, setNameDraft] = useState(initialLabel);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [parentChoice, setParentChoice] = useState<string | null>(parentId);

  useEffect(() => {
    if (node) {
      setDraft(initialText);
      setNameDraft(initialLabel);
      setParentChoice(parentId);
      setGenError(null);
      queueMicrotask(() => {
        if (node.kind === "master") textareaRef.current?.focus();
        else nameInputRef.current?.focus();
      });
    }
  }, [node, initialText, initialLabel, parentId]);

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

  useFocusTrap(!!node, dialogRef);

  if (!node) return null;

  const handleOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const save = () => {
    const label = nameDraft.trim() || node.label;
    if (node.kind === "master") {
      onSave(draft, node.id, label);
    } else {
      const pid = parentChoice ?? parentId;
      onSave(draft, node.id, label, pid ?? undefined);
    }
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

  const effectiveParentId = parentChoice ?? parentId;
  const seedParentLabel =
    parentOptions.find((o) => o.id === effectiveParentId)?.label ??
    parentLabel;

  const handleGenerateSeed = async () => {
    if (!canGenerateSeed) return;
    setGenError(null);
    setGenerating(true);
    try {
      const text = await generateMemberSoulSeed({
        llmProvider,
        ollamaApiKey,
        ollamaApiUrl,
        model,
        memberLabel: nameDraft.trim(),
        parentId: effectiveParentId,
        parentLabel: seedParentLabel,
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
      className="modal-overlay modal-overlay--soul"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={dialogRef}
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
          <div className="modal-name-seed-row">
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
              <button
                type="button"
                className="btn-secondary btn-compact"
                disabled={!canGenerateSeed}
                onClick={() => void handleGenerateSeed()}
              >
                {generating ? "Génération…" : "Générer un seed"}
              </button>
            )}
          </div>
          {node.kind !== "master" && parentOptions.length > 0 && (
            <div className="modal-field-block modal-field-tight">
              <label className="modal-field-label" htmlFor="soul-parent-select">
                Rattaché sous (hiérarchie)
              </label>
              <select
                id="soul-parent-select"
                className="modal-parent-select"
                value={parentChoice ?? parentId ?? ""}
                onChange={(e) => setParentChoice(e.target.value)}
              >
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
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
