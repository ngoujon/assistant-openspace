import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useStreamTokenBuffer } from "@/hooks/useStreamTokenBuffer";
import {
  bundleUserPayload,
  countMissionModelCalls,
  MAX_PAYLOAD_SLICE,
  runMissionPipeline,
  type BranchOutput,
  type MissionFile,
} from "@/orchestration/pipeline";
import { MentionComboboxTextarea } from "@/components/MentionComboboxTextarea";
import { buildMissionMentionPrefix } from "@/lib/discussionMention";
import { loadAgentSouls } from "@/lib/teamSoulsStorage";
import {
  ORCHESTRATOR_ID,
  loadTeamMembers,
  type TreeMember,
} from "@/lib/teamTreeStorage";
import { triggerMarkdownDownload } from "@/lib/downloadMarkdown";
import { unwrapMarkdownFence } from "@/lib/unwrapMarkdownFence";
import type { LlmProvider } from "@/lib/llmProvider";
import { MISSION_TEMPLATES } from "@/lib/missionTemplates";
import type { MissionAgentJournalEntry } from "@/types";

const TEXT_FILE_EXTENSIONS = [
  ".md",
  ".txt",
  ".markdown",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".css",
  ".sql",
  ".sh",
];

function isTextMissionFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  const lower = file.name.toLowerCase();
  return TEXT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface MissionWorkspaceProps {
  llmProvider: LlmProvider;
  ollamaApiKey: string;
  ollamaApiUrl: string;
  /** Température Ollama (0–1), Paramètres. */
  ollamaTemperature: number;
  model: string;
  /** Alimente la colonne droite (et la bande mobile) avec la progression. */
  onActivityReport?: (payload: {
    running: boolean;
    progress: string[];
    elapsedSec: number;
  }) => void;
  /** Quand une mission produit un Markdown, pour le lier à la conversation (Discussion). */
  onArtifactProduced?: (markdown: string, missionUserBrief: string) => void;
  onAgentJournal?: (entry: MissionAgentJournalEntry) => void;
  onMissionJournalClear?: () => void;
}

export function MissionWorkspace({
  llmProvider,
  ollamaApiKey,
  ollamaApiUrl,
  ollamaTemperature,
  model,
  onActivityReport,
  onArtifactProduced,
  onAgentJournal,
  onMissionJournalClear,
}: MissionWorkspaceProps) {
  const [context, setContext] = useState("");
  const [teamMembers, setTeamMembers] = useState<TreeMember[]>(() =>
    loadTeamMembers(),
  );
  const [files, setFiles] = useState<
    { id: string; name: string; content: string }[]
  >([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [resultMd, setResultMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const missionElapsedT0Ref = useRef<number | null>(null);
  /**
   * Brief orchestrateur + branches déjà terminées lors du dernier run —
   * permet de reprendre après un échec (429 persistant, réseau…) sans
   * repayer les étapes déjà réussies. Vidé au lancement d'une mission
   * fraîche, conservé entre un échec et une reprise.
   */
  const resumeStateRef = useRef<{
    orchestratorBrief?: string;
    completedBranches: Record<string, BranchOutput>;
  }>({ completedBranches: {} });
  const [canResume, setCanResume] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamBuffer = useStreamTokenBuffer();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [fileDropActive, setFileDropActive] = useState(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setTeamMembers(loadTeamMembers());
    window.addEventListener("storage", refresh);
    window.addEventListener("openspace-team-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("openspace-team-updated", refresh);
    };
  }, []);

  /** Pendant l’exécution : compteur. À l’arrêt : conserve la durée finale (Activité + snapshot). */
  useEffect(() => {
    if (!running) return;
    setElapsedSec(0);
    const t0 = Date.now();
    missionElapsedT0Ref.current = t0;
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => {
      window.clearInterval(id);
      missionElapsedT0Ref.current = null;
    };
  }, [running]);

  useEffect(() => {
    onActivityReport?.({ running, progress, elapsedSec });
  }, [running, progress, elapsedSec, onActivityReport]);

  useEffect(() => {
    const onDragEnd = () => {
      dragDepthRef.current = 0;
      setFileDropActive(false);
    };
    window.addEventListener("dragend", onDragEnd);
    return () => window.removeEventListener("dragend", onDragEnd);
  }, []);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    const next: { id: string; name: string; content: string }[] = [];
    for (const file of list) {
      if (!isTextMissionFile(file)) continue;
      const text = await file.text();
      next.push({ id: crypto.randomUUID(), name: file.name, content: text });
    }
    if (next.length) setFiles((f) => [...f, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((f) => f.filter((x) => x.id !== id));
  }, []);

  const onFileZoneDragEnter = useCallback((e: DragEvent) => {
    if (running) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types?.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
      setFileDropActive(true);
    }
  }, [running]);

  const onFileZoneDragLeave = useCallback((e: DragEvent) => {
    if (running) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setFileDropActive(false);
  }, [running]);

  const onFileZoneDragOver = useCallback(
    (e: DragEvent) => {
      if (running) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [running],
  );

  const onFileZoneDrop = useCallback(
    (e: DragEvent) => {
      if (running) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setFileDropActive(false);
      void addFiles(e.dataTransfer.files);
    },
    [running, addFiles],
  );

  const onFileZoneKeyDown = useCallback((e: KeyboardEvent<HTMLLabelElement>) => {
    if (running) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, [running]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(async (opts?: { resume?: boolean }) => {
    const isResume = opts?.resume === true;
    if (running) return;
    if (!context.trim() && files.length === 0) {
      setError("Ajoute un contexte et/ou au moins un fichier texte (.txt, .md).");
      return;
    }
    if (!model) {
      setError(
        "Aucun modèle Ollama. Lance Ollama et télécharge un modèle.",
      );
      return;
    }

    setError(null);
    setResultMd(null);
    setRunning(true);
    streamBuffer.reset();
    if (isResume) {
      setProgress((p) => [...p, "— Reprise de la mission —"]);
    } else {
      setProgress([]);
      onMissionJournalClear?.();
      resumeStateRef.current = { completedBranches: {} };
      setCanResume(false);
    }
    const ac = new AbortController();
    abortRef.current = ac;

    const souls = loadAgentSouls();
    const membersTree = teamMembers;
    const missionFiles: MissionFile[] = files.map(({ name, content }) => ({
      name,
      content,
    }));

    const leads = membersTree.filter((m) => m.parentId === ORCHESTRATOR_ID);
    if (leads.length === 0) {
      setError(
        "Aucun membre sous l’orchestrateur. Ajoute au moins un pilier dans la colonne Organisation.",
      );
      setElapsedSec(0);
      setRunning(false);
      abortRef.current = null;
      return;
    }

    const contextForPipeline =
      buildMissionMentionPrefix(context, membersTree) + context;

    const resumeFrom =
      isResume && resumeStateRef.current.orchestratorBrief
        ? {
            orchestratorBrief: resumeStateRef.current.orchestratorBrief,
            completedBranches: resumeStateRef.current.completedBranches,
          }
        : undefined;

    try {
      const md = await runMissionPipeline({
        llmProvider,
        ollamaApiKey,
        ollamaApiUrl,
        ollamaTemperature,
        model,
        context: contextForPipeline,
        files: missionFiles,
        souls,
        teamMembers: membersTree,
        signal: ac.signal,
        resumeFrom,
        onProgress: (label) => {
          setProgress((p) => [...p, label]);
        },
        onAgentJournal: (entry) => onAgentJournal?.(entry),
        onFinalReportToken: (chunk) => {
          streamBuffer.push(chunk, (flushed) =>
            setResultMd((prev) => (prev ?? "") + flushed),
          );
        },
        onOrchestratorBrief: (brief) => {
          resumeStateRef.current.orchestratorBrief = brief;
        },
        onBranchComplete: (leadId, output) => {
          resumeStateRef.current.completedBranches[leadId] = output;
        },
      });
      const finalMd = unwrapMarkdownFence(md);
      setResultMd(finalMd);
      onArtifactProduced?.(finalMd, context);
      // Mission aboutie : plus rien à reprendre.
      resumeStateRef.current = { completedBranches: {} };
      setCanResume(false);
    } catch (e) {
      const hasResumableProgress = !!resumeStateRef.current.orchestratorBrief;
      if ((e as Error).name === "AbortError") {
        setProgress((p) => [...p, "Interrompu."]);
      } else {
        setError((e as Error).message || "Erreur pendant la mission.");
      }
      setCanResume(hasResumableProgress);
    } finally {
      const t0 = missionElapsedT0Ref.current;
      if (t0 != null) {
        setElapsedSec(Math.floor((Date.now() - t0) / 1000));
      }
      setRunning(false);
      abortRef.current = null;
    }
  }, [
    running,
    context,
    teamMembers,
    files,
    llmProvider,
    ollamaApiKey,
    ollamaApiUrl,
    ollamaTemperature,
    model,
    onArtifactProduced,
    onAgentJournal,
    onMissionJournalClear,
    streamBuffer,
  ]);

  const canStart = (context.trim().length > 0 || files.length > 0) && !!model;

  /** Aide à anticiper la durée et le risque de rate-limit avant de lancer. */
  const estimatedCalls = useMemo(
    () => countMissionModelCalls(teamMembers, false),
    [teamMembers],
  );

  /**
   * Le pipeline tronque silencieusement le contexte + fichiers au-delà de
   * `MAX_PAYLOAD_SLICE` caractères (voir `slicePayloadForModel`) — le signaler
   * ici plutôt que de laisser l'utilisateur découvrir après coup qu'une
   * partie de son texte ou de ses fichiers n'a pas été lue par le modèle.
   */
  const payloadOverflowChars = useMemo(() => {
    const total = bundleUserPayload(context, files).length;
    return Math.max(0, total - MAX_PAYLOAD_SLICE);
  }, [context, files]);

  const handleDownload = useCallback(() => {
    if (!resultMd) return;
    const stamp = new Date().toISOString().slice(0, 10);
    triggerMarkdownDownload(resultMd, `rapport-equipe-${stamp}.md`);
  }, [resultMd]);

  return (
    <div className="mission-workspace">
      <div className="mission-body">
        <label className="mission-label" htmlFor="mission-template">
          Modèle de mission
        </label>
        <select
          id="mission-template"
          className="mission-template-select"
          defaultValue=""
          onChange={(e) => {
            const tpl = MISSION_TEMPLATES.find((t) => t.id === e.target.value);
            if (tpl) setContext(tpl.context);
          }}
          disabled={running}
          aria-label="Choisir un modèle de contexte mission"
        >
          <option value="">— Choisir un modèle —</option>
          {MISSION_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="mission-label" htmlFor="mission-context">
          Contexte
        </label>
        <MentionComboboxTextarea
          id="mission-context"
          className="chat-input mission-context"
          rows={10}
          placeholder="Objectifs, @membre pour prioriser un angle, contraintes…"
          value={context}
          onChange={setContext}
          members={teamMembers}
          disabled={running}
        />

        <p className="mission-label mission-label--files" id="mission-files-label">
          Fichiers de contexte
        </p>
        <div className="mission-files-block">
          <input
            id="mission-files-input"
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.yaml,.yml,text/plain"
            multiple
            className="mission-file-input"
            disabled={running}
            aria-labelledby="mission-files-label"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <label
            className={
              "mission-drop-zone" +
              (fileDropActive ? " mission-drop-zone--active" : "") +
              (running ? " mission-drop-zone--disabled" : "")
            }
            htmlFor="mission-files-input"
            tabIndex={running ? -1 : 0}
            onDragEnter={onFileZoneDragEnter}
            onDragLeave={onFileZoneDragLeave}
            onDragOver={onFileZoneDragOver}
            onDrop={onFileZoneDrop}
            onKeyDown={onFileZoneKeyDown}
          >
            <span className="mission-drop-zone-icon" aria-hidden="true">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v10M8 9l4-4 4 4M5 19h14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="mission-drop-zone-title">
              Glisse-dépose des fichiers ici
            </span>
            <span className="mission-drop-zone-hint">
              Fichiers texte : .txt, .md — ou clique pour parcourir
            </span>
          </label>
        </div>

        {files.length > 0 && (
          <ul className="mission-file-chips" aria-label="Fichiers joints">
            {files.map((f) => (
              <li key={f.id} className="mission-file-chip">
                <span className="mission-file-name">{f.name}</span>
                <button
                  type="button"
                  className="mission-file-remove"
                  disabled={running}
                  aria-label={`Retirer ${f.name}`}
                  onClick={() => removeFile(f.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {payloadOverflowChars > 0 && (
          <div className="banner banner-warn">
            Contexte + fichiers dépasse la limite lue par le modèle à chaque étape (
            {MAX_PAYLOAD_SLICE.toLocaleString("fr-FR")} caractères) : les{" "}
            <strong>{payloadOverflowChars.toLocaleString("fr-FR")} derniers caractères</strong>{" "}
            seront ignorés. Raccourcis le contexte ou les fichiers si ce contenu est important.
          </div>
        )}

        {error && <div className="banner banner-error">{error}</div>}

        {!running && canResume && (
          <div className="banner banner-warn">
            Une partie du travail est déjà terminée (brief orchestrateur
            {Object.keys(resumeStateRef.current.completedBranches).length > 0
              ? ` + ${Object.keys(resumeStateRef.current.completedBranches).length} pôle${Object.keys(resumeStateRef.current.completedBranches).length > 1 ? "s" : ""}`
              : ""}
            ). « Reprendre » évite de refaire ces appels.
          </div>
        )}

        {!running && estimatedCalls > 0 && (
          <p className="mission-call-estimate" role="status">
            Cette mission va effectuer environ{" "}
            <strong>
              {estimatedCalls} appel{estimatedCalls > 1 ? "s" : ""} au modèle
            </strong>
            .
          </p>
        )}

        <div className="mission-actions">
          {running ? (
            <button type="button" className="btn-secondary" onClick={stop}>
              Arrêter la mission
            </button>
          ) : (
            <>
              {canResume && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void run({ resume: true })}
                  disabled={!canStart}
                >
                  Reprendre la mission
                </button>
              )}
              <button
                type="button"
                className={canResume ? "btn-secondary" : "btn-primary"}
                onClick={() => void run()}
                disabled={!canStart}
              >
                {canResume ? "Relancer depuis le début" : "Lancer la mission"}
              </button>
            </>
          )}
        </div>

        {resultMd && (
          <section className="mission-result" aria-label="Résultat">
            <div className="mission-result-head">
              <h3 className="mission-result-title">
                {running ? "Rédaction du rapport final…" : "Document généré"}
              </h3>
              {!running && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleDownload}
                >
                  Télécharger le .md
                </button>
              )}
            </div>
            <div
              className="mission-md-preview"
              role={running ? "status" : undefined}
              aria-live={running ? "off" : undefined}
            >
              {resultMd}
              {running ? <span className="mission-md-caret" aria-hidden="true" /> : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
