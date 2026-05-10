import { triggerMarkdownDownload } from "@/lib/downloadMarkdown";
import type {
  ActivityLinkedArtifact,
  RightActivityState,
} from "@/types/activity";

interface ExchangesSidebarProps {
  state: RightActivityState;
  variant?: "sidebar" | "inline";
  linkedArtifact?: ActivityLinkedArtifact | null;
}

/** Colonne « Échanges en cours » (discussion : routage, stream, livrable .md). */
export function ExchangesSidebar({
  state,
  variant = "sidebar",
  linkedArtifact = null,
}: ExchangesSidebarProps) {
  const isInline = variant === "inline";

  if (state.kind === "discussion") {
    const { isRouting, streaming, panelError, streamingSpeaker } = state;
    const busy = isRouting || streaming;
    return (
      <div
        className={
          isInline ? "activity-inline activity-inline-discussion" : "activity-sidebar"
        }
        role="status"
        aria-live="polite"
        aria-busy={busy}
      >
        <h2 className="activity-sidebar-title">Échanges en cours</h2>
        {panelError && (
          <p className="activity-sidebar-error" role="alert">
            {panelError}
          </p>
        )}
        {!panelError && isRouting && (
          <p className="activity-sidebar-status">
            L’orchestrateur choisit le membre le plus qualifié pour répondre…
          </p>
        )}
        {!panelError && !isRouting && streaming && (
          <p className="activity-sidebar-status">
            {streamingSpeaker ? (
              <>
                Réponse en cours de <strong>{streamingSpeaker}</strong>…
              </>
            ) : (
              "Réponse en cours de génération…"
            )}
          </p>
        )}
        {!panelError && !busy && linkedArtifact && (
          <div className="activity-artifact-download">
            <button
              type="button"
              className="btn-primary btn-compact"
              aria-label="Télécharger le livrable Markdown (.md)"
              onClick={() =>
                triggerMarkdownDownload(
                  linkedArtifact.markdown,
                  linkedArtifact.filename,
                )
              }
            >
              Télécharger le .md
            </button>
          </div>
        )}
        {!panelError && !busy && !linkedArtifact && (
          <p className="activity-sidebar-muted">
            Aucun envoi en cours. Écris un message et envoie pour lancer l’équipe.
          </p>
        )}
      </div>
    );
  }

  const placeholder =
    state.kind === "mission"
      ? "Après le livrable, en mode Discussion, les réponses de l’équipe s’affichent ici."
      : state.kind === "team"
        ? "Ouvre l’onglet Chat sur un projet pour suivre la discussion."
        : "Ouvre un projet et passe en Discussion pour suivre les échanges de l’équipe.";

  if (isInline) {
    return (
      <div className="activity-inline activity-inline-exchanges-placeholder">
        <h2 className="activity-sidebar-title">Échanges en cours</h2>
        <p className="activity-sidebar-muted">{placeholder}</p>
      </div>
    );
  }

  return (
    <div
      className="activity-sidebar"
      role="complementary"
      aria-label="Échanges en cours"
    >
      <h2 className="activity-sidebar-title">Échanges en cours</h2>
      <p className="activity-sidebar-muted">{placeholder}</p>
    </div>
  );
}
