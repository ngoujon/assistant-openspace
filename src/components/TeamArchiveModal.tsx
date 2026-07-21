import { useEffect, useId, useRef, type MouseEvent } from "react";
import { TeamArchiveSection } from "@/components/TeamArchiveSection";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { TreeMember } from "@/lib/teamTreeStorage";

interface TeamArchiveModalProps {
  open: boolean;
  onClose: () => void;
  members: TreeMember[];
  souls: Record<string, string>;
  onRestore: (members: TreeMember[], souls: Record<string, string>) => void;
}

export function TeamArchiveModal({
  open,
  onClose,
  members,
  souls,
  onRestore,
}: TeamArchiveModalProps) {
  const titleId = useId();
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
      className="modal-overlay modal-overlay--archive"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        ref={dialogRef}
        className="modal-dialog modal-dialog-archive"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker">Équipe</p>
            <h2 className="modal-title" id={titleId}>
              Archives des compositions
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
        <div className="modal-archive-scroll">
          <p className="modal-settings-intro">
            Enregistre l’arbre et les âmes actuels sous un nom, puis restaure une
            version antérieure si besoin. Les archives restent dans ce navigateur
            (localStorage).
          </p>
          <TeamArchiveSection
            variant="modal"
            members={members}
            souls={souls}
            onRestore={onRestore}
          />
        </div>
      </div>
    </div>
  );
}
