import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Corps du message (texte ou fragments avec emphase). */
  description: ReactNode;
  /** Libellé du bouton de validation. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Style du bouton de validation : action normale ou destructive. */
  confirmTone?: "primary" | "danger";
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuler",
  confirmTone = "primary",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [open, onClose]);

  useFocusTrap(open, dialogRef);

  if (!open) return null;

  const handleOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="modal-overlay modal-overlay--confirm"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={dialogRef}
        className="modal-dialog modal-dialog-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header modal-header--confirm">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="modal-confirm-body" id={descId}>
          {description}
        </div>
        <footer className="modal-footer">
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={
                confirmTone === "danger" ? "btn-danger" : "btn-primary"
              }
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
