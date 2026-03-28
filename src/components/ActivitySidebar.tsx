import type { RightActivityState } from "@/types/activity";

interface ActivitySidebarProps {
  state: RightActivityState;
  /** Sur mobile la colonne droite est masquée : version compacte au-dessus du fil. */
  variant?: "sidebar" | "inline";
}

export function ActivitySidebar({
  state,
  variant = "sidebar",
}: ActivitySidebarProps) {
  const isInline = variant === "inline";

  if (state.kind === "idle") {
    if (isInline) return null;
    return (
      <div className="activity-sidebar" role="complementary" aria-label="Activité">
        <h2 className="activity-sidebar-title">Activité</h2>
        <p className="activity-sidebar-muted">
          Les états « en cours » (discussion, mission) s’affichent ici.
        </p>
      </div>
    );
  }

  if (state.kind === "team") {
    if (isInline) return null;
    return (
      <div className="activity-sidebar" role="complementary" aria-label="Activité">
        <h2 className="activity-sidebar-title">Activité</h2>
        <p className="activity-sidebar-muted">
          Tu es sur l’onglet <strong>Équipe</strong>. Les échanges en cours liés au
          chat apparaissent ici lorsque tu reviens sur <strong>Chat</strong>.
        </p>
      </div>
    );
  }

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
        {!panelError && !busy && (
          <p className="activity-sidebar-muted">
            Aucun envoi en cours. Écris un message et envoie pour lancer l’équipe.
          </p>
        )}
      </div>
    );
  }

  const { running, progress, elapsedSec } = state;
  const last = progress.length > 0 ? progress[progress.length - 1] : null;
  const fmt =
    elapsedSec >= 60
      ? `${Math.floor(elapsedSec / 60)} min ${(elapsedSec % 60).toString().padStart(2, "0")} s`
      : `${elapsedSec} s`;

  return (
    <div
      className={
        isInline ? "activity-inline activity-inline-mission" : "activity-sidebar"
      }
      role="status"
      aria-live="polite"
      aria-busy={running}
    >
      <h2 className="activity-sidebar-title">Mission en cours</h2>
      {running && (
        <p className="activity-sidebar-timer" aria-label="Durée écoulée">
          Durée : {fmt}
        </p>
      )}
      {running && last && (
        <div className="activity-sidebar-current">
          <span className="activity-sidebar-current-label">Étape</span>
          <span className="activity-sidebar-current-text">{last}</span>
        </div>
      )}
      {running && elapsedSec >= 45 && (
        <p className="activity-sidebar-wait-hint">
          Tant qu’Ollama travaille sur une étape, le journal ne grossit pas — c’est
          normal.
        </p>
      )}
      {!running && progress.length === 0 && (
        <p className="activity-sidebar-muted">
          Lance une mission depuis l’onglet <strong>Mission équipe</strong> pour voir
          la progression ici.
        </p>
      )}
      {!running && progress.length > 0 && (
        <p className="activity-sidebar-muted">Dernière mission terminée.</p>
      )}
      {progress.length > 0 && (
        <pre className="activity-sidebar-log">{progress.join("\n")}</pre>
      )}
    </div>
  );
}
