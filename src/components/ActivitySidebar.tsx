import { useLayoutEffect, useRef } from "react";
import {
  missionProgressPercent,
  parseMissionProgressLine,
  type MissionStepVisualKind,
} from "@/lib/parseMissionProgressLine";
import type { RightActivityState } from "@/types/activity";

const STEP_KIND_LABELS: Record<MissionStepVisualKind, string | null> = {
  done: "Terminé",
  "final-doc": "Document final",
  orchestrator: "Orchestrateur",
  delegation: "Brief",
  specialist: "Spécialiste",
  synthesis: "Synthèse",
  "pole-solo": "Pôle",
  default: null,
};

function MissionStepTimeline({
  progress,
  running,
  compact,
}: {
  progress: string[];
  running: boolean;
  compact?: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const pct = missionProgressPercent(progress);
  const showBar = progress.length > 0;
  const indeterminate = running && pct === null && progress.length > 0;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [progress]);

  return (
    <div
      className={
        compact
          ? "mission-step-panel mission-step-panel--compact"
          : "mission-step-panel"
      }
    >
      {showBar && (
        <div
          className={`mission-progress-bar-wrap${indeterminate ? " mission-progress-bar-wrap--indeterminate" : ""}`}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : pct ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avancement de la mission"
        >
          <div
            className="mission-progress-bar-fill"
            style={
              !indeterminate && pct != null
                ? { width: `${pct}%` }
                : undefined
            }
          />
        </div>
      )}
      <ol
        ref={listRef}
        className="mission-step-list"
        aria-label="Étapes de la mission"
      >
        {progress.map((line, i) => {
          const p = parseMissionProgressLine(line);
          const isLast = i === progress.length - 1;
          const isActive = running && isLast && p.kind !== "done";
          const kindLabel = STEP_KIND_LABELS[p.kind];
          return (
            <li
              key={`${i}-${line.slice(0, 48)}`}
              className={`mission-step mission-step--${p.kind}${isActive ? " mission-step--active" : ""}`}
            >
              <div className="mission-step-track" aria-hidden>
                <span className="mission-step-dot-wrap">
                  <span className="mission-step-dot" />
                </span>
                {i < progress.length - 1 ? (
                  <span className="mission-step-connector" />
                ) : null}
              </div>
              <div className="mission-step-card">
                <div className="mission-step-card-head">
                  {p.step != null && p.total != null ? (
                    <span className="mission-step-num">
                      {p.step}
                      <span className="mission-step-num-sep">/</span>
                      {p.total}
                    </span>
                  ) : p.kind === "done" ? (
                    <span className="mission-step-num mission-step-num--check" title="Terminé">
                      ✓
                    </span>
                  ) : (
                    <span className="mission-step-num mission-step-num--dot">·</span>
                  )}
                  {kindLabel ? (
                    <span className="mission-step-pill">{kindLabel}</span>
                  ) : null}
                </div>
                <p className="mission-step-desc">{p.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

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
  const fmt =
    elapsedSec >= 60
      ? `${Math.floor(elapsedSec / 60)} min ${(elapsedSec % 60).toString().padStart(2, "0")} s`
      : `${elapsedSec} s`;

  return (
    <div
      className={
        isInline
          ? "activity-inline activity-inline-mission"
          : "activity-sidebar activity-sidebar--mission"
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
      {running && elapsedSec >= 8 && (
        <p className="activity-sidebar-wait-hint">
          La <strong>1<sup>re</sup> réponse</strong> charge souvent le modèle dans Ollama
          (plusieurs minutes en CPU). La liste d’étapes ne change qu’à la fin de chaque
          appel — ce n’est pas un blocage de l’app.
        </p>
      )}
      {running && elapsedSec >= 120 && (
        <p className="activity-sidebar-wait-hint activity-sidebar-wait-hint--strong">
          Si tu n’as <strong>aucune</strong> réponse au-delà de ~15–20&nbsp;min, teste dans
          un terminal : <code>ollama run</code> + ton modèle, ou redémarre Ollama. Un
          modèle volumineux sur disque externe peut aussi expliquer des délais très
          longs.
        </p>
      )}
      {!running && progress.length === 0 && (
        <p className="activity-sidebar-muted">
          Lance une mission depuis l’onglet <strong>Mission équipe</strong> pour voir
          la progression ici.
        </p>
      )}
      {!running && progress.length > 0 && (
        <p className="activity-sidebar-muted activity-sidebar-muted--success">
          Dernière mission terminée — détail des étapes ci-dessous.
        </p>
      )}
      {progress.length > 0 && (
        <MissionStepTimeline
          progress={progress}
          running={running}
          compact={isInline}
        />
      )}
    </div>
  );
}
