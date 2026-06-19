import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactVersion } from "@/types";

interface ArtifactPreviewPanelProps {
  markdown: string;
  versions?: ArtifactVersion[];
  onSelectVersion?: (versionId: string) => void;
  onCopy?: () => void;
  copyFeedback?: string | null;
}

export function ArtifactPreviewPanel({
  markdown,
  versions = [],
  onSelectVersion,
  onCopy,
  copyFeedback,
}: ArtifactPreviewPanelProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.createdAt - a.createdAt),
    [versions],
  );

  if (!markdown.trim()) return null;

  return (
    <div className="artifact-preview">
      <div className="artifact-preview-toolbar">
        <button
          type="button"
          className="btn-secondary btn-compact"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((o) => !o)}
        >
          {previewOpen ? "Masquer l’aperçu" : "Aperçu du livrable"}
        </button>
        {onCopy ? (
          <button
            type="button"
            className="btn-secondary btn-compact"
            onClick={onCopy}
            aria-label="Copier le livrable Markdown"
          >
            {copyFeedback ?? "Copier"}
          </button>
        ) : null}
      </div>
      {sortedVersions.length > 1 && onSelectVersion ? (
        <label className="artifact-version-select-wrap">
          <span className="artifact-version-select-label">Version</span>
          <select
            className="artifact-version-select"
            defaultValue={sortedVersions[0]?.id}
            onChange={(e) => onSelectVersion(e.target.value)}
            aria-label="Choisir une version du livrable"
          >
            {sortedVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label ??
                  new Date(v.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {previewOpen ? (
        <div
          className="artifact-preview-body markdown-body"
          aria-label="Aperçu Markdown du livrable"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
