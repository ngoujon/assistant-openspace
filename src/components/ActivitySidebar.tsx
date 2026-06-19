import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentJournalPanel } from "@/components/AgentJournalPanel";
import { ArtifactPreviewPanel } from "@/components/ArtifactPreviewPanel";
import { useTeamWorkspace } from "@/components/TeamWorkspaceContext";
import { triggerMarkdownDownload } from "@/lib/downloadMarkdown";
import {
  findMemberByProgressLabel,
  memberStepAccentStyle,
} from "@/lib/memberStepColors";
import {
  missionProgressPercent,
  parseMissionProgressLine,
  type MissionStepVisualKind,
} from "@/lib/parseMissionProgressLine";
import type { ActivityLinkedArtifact, RightActivityState } from "@/types/activity";
import type { ArtifactVersion, MissionActivitySnapshot, MissionAgentJournalEntry } from "@/types";

export type { ActivityLinkedArtifact } from "@/types/activity";

function formatElapsedSec(elapsedSec: number): string {
  return elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)} min ${(elapsedSec % 60).toString().padStart(2, "0")} s`
    : `${elapsedSec} s`;
}

const STEP_KIND_LABELS: Record<MissionStepVisualKind, string | null> = {
  done: "Terminé",
  "final-doc": "Document final",
  orchestrator: "Orchestrateur",
  delegation: "Brief",
  specialist: "Spécialiste",
  synthesis: "Synthèse",
  "pole-solo": null,
  handoff: null,
  default: "SYSTEME",
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
  const { members } = useTeamWorkspace();
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
          const kindFallback = STEP_KIND_LABELS[p.kind];
          const pillTextRaw =
            p.displayPill?.trim() ||
            (typeof kindFallback === "string" ? kindFallback : "");
          const pillText = pillTextRaw || null;
          const member = pillText
            ? findMemberByProgressLabel(pillText, members)
            : null;
          const pillDisplay = (member?.label ?? pillText)?.trim() || null;
          const accentStyle = memberStepAccentStyle(member, members);
          const defaultUnnumbered =
            p.kind === "default" &&
            (p.step == null || p.total == null);
          const desc =
            p.detailText.trim() ||
            (p.kind === "handoff"
              ? "Attribution de la réponse à ce membre."
              : "");
          return (
            <li
              key={`${i}-${line.slice(0, 48)}`}
              className={`mission-step mission-step--${p.kind}${isActive ? " mission-step--active" : ""}`}
              style={accentStyle}
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
                  ) : p.kind === "default" ? (
                    <span className="mission-step-pill mission-step-pill--systeme">
                      {kindFallback}
                    </span>
                  ) : (
                    <span className="mission-step-num mission-step-num--dot">·</span>
                  )}
                  {pillDisplay && !defaultUnnumbered ? (
                    <span className="mission-step-pill">{pillDisplay}</span>
                  ) : null}
                </div>
                {desc ? <p className="mission-step-desc">{desc}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const EMPTY_PROGRESS: string[] = [];

interface ActivitySidebarProps {
  state: RightActivityState;
  variant?: "sidebar" | "inline";
  linkedArtifact?: ActivityLinkedArtifact | null;
  missionHistory?: MissionActivitySnapshot | null;
  agentJournal?: MissionAgentJournalEntry[];
  artifactVersions?: ArtifactVersion[];
  pendingArtifactMerge?: boolean;
  onRestoreVersion?: (versionId: string) => void;
  onRequestArtifactMerge?: () => void;
}

function ArtifactActions({
  linkedArtifact,
  artifactVersions,
  pendingArtifactMerge,
  onRestoreVersion,
  onRequestArtifactMerge,
}: {
  linkedArtifact: ActivityLinkedArtifact;
  artifactVersions?: ArtifactVersion[];
  pendingArtifactMerge?: boolean;
  onRestoreVersion?: (versionId: string) => void;
  onRequestArtifactMerge?: () => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkedArtifact.markdown);
      setCopyFeedback("Copié !");
      window.setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Échec");
    }
  };

  return (
    <div className="activity-artifact-actions">
      <ArtifactPreviewPanel
        markdown={linkedArtifact.markdown}
        versions={artifactVersions}
        onSelectVersion={onRestoreVersion}
        onCopy={() => void handleCopy()}
        copyFeedback={copyFeedback}
      />
      <div className="activity-sidebar-footer">
        {pendingArtifactMerge && onRequestArtifactMerge ? (
          <button
            type="button"
            className="btn-primary btn-compact activity-merge-md-btn"
            onClick={onRequestArtifactMerge}
          >
            Mettre à jour le livrable
          </button>
        ) : null}
        <button
          type="button"
          className="btn-primary btn-compact activity-download-md-btn"
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
    </div>
  );
}

export function ActivitySidebar({
  state,
  variant = "sidebar",
  linkedArtifact = null,
  missionHistory = null,
  agentJournal = [],
  artifactVersions,
  pendingArtifactMerge,
  onRestoreVersion,
  onRequestArtifactMerge,
}: ActivitySidebarProps) {
  const isInline = variant === "inline";

  const discussionMissionHist = missionHistory?.progress?.length
    ? missionHistory.progress
    : EMPTY_PROGRESS;
  const discussionSessionProgress =
    state.kind === "discussion" ? state.discussionProgress : EMPTY_PROGRESS;
  const discussionCombinedProgress = useMemo(
    () => [...discussionMissionHist, ...discussionSessionProgress],
    [discussionMissionHist, discussionSessionProgress],
  );

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
    if (isInline && !linkedArtifact && discussionCombinedProgress.length === 0) {
      return null;
    }
    const { isRouting, streaming, panelError, lastCompletedTurnSec, streamingSpeaker } =
      state;
    const busy = isRouting || streaming;

    return (
      <div
        className={
          isInline
            ? "activity-inline activity-inline-discussion"
            : "activity-sidebar activity-sidebar--discussion"
        }
        role="status"
        aria-live="polite"
        aria-busy={busy}
      >
        <h2 className="activity-sidebar-title">Activité</h2>
        <div className="activity-discussion-main">
          {streamingSpeaker && busy ? (
            <p className="activity-streaming-speaker" aria-live="polite">
              En train de répondre : <strong>{streamingSpeaker}</strong>
            </p>
          ) : null}
          {panelError && (
            <p className="activity-sidebar-error" role="alert">
              {panelError}
            </p>
          )}
          {discussionCombinedProgress.length > 0 ? (
            <MissionStepTimeline
              progress={discussionCombinedProgress}
              running={busy}
              compact={isInline}
            />
          ) : !panelError && busy ? (
            <p className="activity-sidebar-status">En cours…</p>
          ) : null}
          {!panelError && !busy && lastCompletedTurnSec != null ? (
            <p className="activity-sidebar-timer" aria-label="Temps de traitement">
              Temps de traitement : {formatElapsedSec(lastCompletedTurnSec)}
            </p>
          ) : null}
          {!panelError && !busy && !linkedArtifact && (
            <p className="activity-sidebar-muted">
              {discussionCombinedProgress.length === 0
                ? "Aucun envoi en cours. Écris un message et envoie pour lancer l’équipe."
                : "Prêt pour le prochain message."}
            </p>
          )}
        </div>
        {!panelError && !busy && linkedArtifact ? (
          <ArtifactActions
            linkedArtifact={linkedArtifact}
            artifactVersions={artifactVersions}
            pendingArtifactMerge={pendingArtifactMerge}
            onRestoreVersion={onRestoreVersion}
            onRequestArtifactMerge={onRequestArtifactMerge}
          />
        ) : null}
        {!isInline && agentJournal.length > 0 ? (
          <AgentJournalPanel entries={agentJournal} />
        ) : null}
      </div>
    );
  }

  const { running, progress, elapsedSec } = state;
  const showMissionDownload =
    !running && linkedArtifact && progress.length > 0;

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
      <div className="activity-mission-main">
        <h2 className="activity-sidebar-title">Activité</h2>
        {running && (
          <p className="activity-sidebar-timer" aria-label="Durée écoulée">
            Durée : {formatElapsedSec(elapsedSec)}
          </p>
        )}
        {!running && progress.length > 0 && (
          <p className="activity-sidebar-timer" aria-label="Temps de traitement">
            Temps de traitement : {formatElapsedSec(elapsedSec)}
          </p>
        )}
        {!running && progress.length === 0 && (
          <p className="activity-sidebar-muted">
            Lance une mission en phase <strong>Mission équipe</strong> pour voir la
            progression ici.
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
      {showMissionDownload && linkedArtifact ? (
        <div className="activity-sidebar-footer">
          <ArtifactActions
            linkedArtifact={linkedArtifact}
            artifactVersions={artifactVersions}
            onRestoreVersion={onRestoreVersion}
          />
        </div>
      ) : null}
      {!isInline && agentJournal.length > 0 ? (
        <AgentJournalPanel entries={agentJournal} />
      ) : null}
    </div>
  );
}
