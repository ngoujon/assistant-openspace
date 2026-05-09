import { useCallback, useState } from "react";
import {
  appendTeamArchive,
  deleteTeamArchive,
  loadTeamArchives,
  soulsAfterRestore,
  type TeamArchiveEntry,
} from "@/lib/teamArchiveStorage";
import type { TreeMember } from "@/lib/teamTreeStorage";

interface TeamArchiveSectionProps {
  members: TreeMember[];
  souls: Record<string, string>;
  onRestore: (members: TreeMember[], souls: Record<string, string>) => void;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function TeamArchiveSection({
  members,
  souls,
  onRestore,
}: TeamArchiveSectionProps) {
  const [archives, setArchives] = useState<TeamArchiveEntry[]>(loadTeamArchives);
  const [draftName, setDraftName] = useState("");

  const refresh = useCallback(() => {
    setArchives(loadTeamArchives());
  }, []);

  const handleArchive = useCallback(() => {
    const n = draftName.trim();
    if (!n) return;
    appendTeamArchive(n, members, souls);
    setDraftName("");
    refresh();
  }, [draftName, members, souls, refresh]);

  const handleRestore = useCallback(
    (entry: TeamArchiveEntry) => {
      const ok = window.confirm(
        `Remplacer l’équipe active par « ${entry.name} » ? L’arbre et les âmes en cours seront écrasés (une copie reste dans les archives tant que tu ne la supprimes pas).`,
      );
      if (!ok) return;
      const nextMembers = structuredClone(entry.members);
      const nextSouls = soulsAfterRestore(nextMembers, entry.souls);
      onRestore(nextMembers, nextSouls);
    },
    [onRestore],
  );

  const handleDelete = useCallback(
    (entry: TeamArchiveEntry) => {
      const ok = window.confirm(
        `Supprimer l’archive « ${entry.name} » ? Cette action est définitive.`,
      );
      if (!ok) return;
      deleteTeamArchive(entry.id);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="team-archive-wrap">
      <h3 className="team-tree-title">Archives</h3>
      <div className="team-archive-form">
        <label className="team-archive-label" htmlFor="team-archive-name">
          Nom de la composition
        </label>
        <div className="team-archive-form-row">
          <input
            id="team-archive-name"
            type="text"
            className="team-archive-input"
            placeholder="Ex. Équipe minimale, POC juridique…"
            maxLength={120}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleArchive();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary btn-compact"
            disabled={!draftName.trim()}
            onClick={handleArchive}
          >
            Archiver
          </button>
        </div>
      </div>
      {archives.length === 0 ? (
        <p className="team-archive-empty">Aucune archive pour l’instant.</p>
      ) : (
        <ul className="team-archive-list" aria-label="Compositions archivées">
          {archives.map((a) => (
            <li key={a.id} className="team-archive-row">
              <div className="team-archive-meta">
                <span className="team-archive-name">{a.name}</span>
                <span className="team-archive-date">
                  {dateFmt.format(new Date(a.createdAt))}
                </span>
              </div>
              <div className="team-archive-actions">
                <button
                  type="button"
                  className="btn-primary btn-compact"
                  onClick={() => handleRestore(a)}
                >
                  Restaurer
                </button>
                <button
                  type="button"
                  className="btn-link team-archive-delete"
                  onClick={() => handleDelete(a)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
