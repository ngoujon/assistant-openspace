import { useCallback, useEffect, useRef, useState } from "react";
import {
  countMissionModelCalls,
  runMissionPipeline,
  type MissionFile,
} from "@/orchestration/pipeline";
import { loadAgentSouls } from "@/lib/teamSoulsStorage";
import { ORCHESTRATOR_ID, loadTeamMembers } from "@/lib/teamTreeStorage";
import { unwrapMarkdownFence } from "@/lib/unwrapMarkdownFence";

interface MissionWorkspaceProps {
  model: string;
  /** Alimente la colonne droite (et la bande mobile) avec la progression. */
  onActivityReport?: (payload: {
    running: boolean;
    progress: string[];
    elapsedSec: number;
  }) => void;
  /** Quand une mission produit un Markdown, pour le lier à la conversation (Discussion). */
  onArtifactProduced?: (markdown: string) => void;
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MissionWorkspace({
  model,
  onActivityReport,
  onArtifactProduced,
}: MissionWorkspaceProps) {
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<
    { id: string; name: string; content: string }[]
  >([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [resultMd, setResultMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!running) {
      setElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    onActivityReport?.({ running, progress, elapsedSec });
  }, [running, progress, elapsedSec, onActivityReport]);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    const next: { id: string; name: string; content: string }[] = [];
    for (const file of list) {
      const lower = file.name.toLowerCase();
      const ok =
        file.type === "text/plain" ||
        lower.endsWith(".md") ||
        lower.endsWith(".txt") ||
        lower.endsWith(".markdown");
      if (!ok) continue;
      const text = await file.text();
      next.push({ id: crypto.randomUUID(), name: file.name, content: text });
    }
    if (next.length) setFiles((f) => [...f, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((f) => f.filter((x) => x.id !== id));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    if (!context.trim() && files.length === 0) {
      setError("Ajoute un contexte et/ou au moins un fichier texte (.txt, .md).");
      return;
    }
    if (!model) {
      setError("Aucun modèle Ollama. Lance Ollama et télécharge un modèle.");
      return;
    }

    setError(null);
    setResultMd(null);
    setProgress([]);
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;

    const souls = loadAgentSouls();
    const teamMembers = loadTeamMembers();
    const missionFiles: MissionFile[] = files.map(({ name, content }) => ({
      name,
      content,
    }));

    const leads = teamMembers.filter((m) => m.parentId === ORCHESTRATOR_ID);
    if (leads.length === 0) {
      setError(
        "Aucun membre sous l’orchestrateur. Ajoute au moins un pilier dans l’onglet Équipe.",
      );
      setRunning(false);
      abortRef.current = null;
      return;
    }

    const planned = countMissionModelCalls(teamMembers);
    setProgress([
      `Démarrage — ${planned} requête(s) vers le modèle « ${model} » (une par une). Tant qu’une étape tourne chez Ollama, la liste ne grossit pas : c’est normal (plusieurs minutes possibles).`,
    ]);

    try {
      const md = await runMissionPipeline({
        model,
        context,
        files: missionFiles,
        souls,
        teamMembers,
        signal: ac.signal,
        onProgress: (label) => {
          setProgress((p) => [...p, label]);
        },
      });
      const finalMd = unwrapMarkdownFence(md);
      setResultMd(finalMd);
      onArtifactProduced?.(finalMd);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setProgress((p) => [...p, "Interrompu."]);
      } else {
        setError((e as Error).message || "Erreur pendant la mission.");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running, context, files, model, onArtifactProduced]);

  const canStart = (context.trim().length > 0 || files.length > 0) && !!model;

  const handleDownload = useCallback(() => {
    if (!resultMd) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadMarkdown(resultMd, `rapport-equipe-${stamp}.md`);
  }, [resultMd]);

  return (
    <div className="mission-workspace">
      <div className="mission-body">
        <label className="mission-label" htmlFor="mission-context">
          Contexte
        </label>
        <textarea
          id="mission-context"
          className="chat-input mission-context"
          rows={10}
          placeholder="Objectifs, contraintes, public visé, ce que tu attends du document…"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={running}
        />

        <div className="mission-files-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain"
            multiple
            className="mission-file-input"
            disabled={running}
            onChange={(e) => void addFiles(e.target.files)}
          />
          <button
            type="button"
            className="btn-secondary mission-file-btn"
            disabled={running}
            onClick={() => fileInputRef.current?.click()}
          >
            Ajouter des fichiers (.txt, .md)
          </button>
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

        {error && <div className="banner banner-error">{error}</div>}

        <div className="mission-actions">
          {running ? (
            <button type="button" className="btn-secondary" onClick={stop}>
              Arrêter la mission
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void run()}
              disabled={!canStart}
            >
              Lancer la mission
            </button>
          )}
        </div>

        {resultMd && (
          <section className="mission-result" aria-label="Résultat">
            <div className="mission-result-head">
              <h3 className="mission-result-title">Document généré</h3>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownload}
              >
                Télécharger le .md
              </button>
            </div>
            <div className="mission-md-preview">{resultMd}</div>
          </section>
        )}
      </div>
    </div>
  );
}
