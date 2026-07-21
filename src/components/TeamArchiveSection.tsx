import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTeamWorkspace } from "@/components/TeamWorkspaceContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { generateMemberSoulSeed } from "@/lib/generateMemberSeed";
import {
  appendTeamArchive,
  deleteTeamArchive,
  loadTeamArchives,
  replaceTeamArchiveEntry,
  soulsAfterRestore,
  type TeamArchiveEntry,
} from "@/lib/teamArchiveStorage";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

interface TeamArchiveSectionProps {
  members: TreeMember[];
  souls: Record<string, string>;
  onRestore: (members: TreeMember[], souls: Record<string, string>) => void;
  /** Affichage dans la modale archives (sans carte ni titre « Archives » dupliqué). */
  variant?: "default" | "modal";
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

function sortedMembersForSeedPass(members: TreeMember[]): TreeMember[] {
  const copy = [...members];
  copy.sort((a, b) => {
    if (a.id === ORCHESTRATOR_ID) return -1;
    if (b.id === ORCHESTRATOR_ID) return 1;
    return a.order - b.order || a.id.localeCompare(b.id);
  });
  return copy;
}

export function TeamArchiveSection({
  members,
  souls,
  onRestore,
  variant = "default",
}: TeamArchiveSectionProps) {
  const { model, llmProvider, mistralApiKey } = useTeamWorkspace();
  const nameFieldId = useId();
  const seedAbortRef = useRef<AbortController | null>(null);
  const [archives, setArchives] = useState<TeamArchiveEntry[]>(loadTeamArchives);
  const [draftName, setDraftName] = useState("");
  const [seedingArchiveId, setSeedingArchiveId] = useState<string | null>(null);
  const [seedBulkError, setSeedBulkError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "restore"; entry: TeamArchiveEntry }
    | { kind: "delete"; entry: TeamArchiveEntry }
    | { kind: "regenerateSouls"; entry: TeamArchiveEntry }
    | null
  >(null);

  useEffect(() => {
    return () => {
      seedAbortRef.current?.abort();
    };
  }, []);

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

  const applyRestore = useCallback(
    (entry: TeamArchiveEntry) => {
      const nextMembers = structuredClone(entry.members);
      const nextSouls = soulsAfterRestore(nextMembers, entry.souls);
      onRestore(nextMembers, nextSouls);
    },
    [onRestore],
  );

  const applyDelete = useCallback(
    (entry: TeamArchiveEntry) => {
      deleteTeamArchive(entry.id);
      refresh();
    },
    [refresh],
  );

  const runRegenerateArchiveSouls = useCallback(
    async (entry: TeamArchiveEntry) => {
      const m = model.trim();
      if (!m) {
        setSeedBulkError(
          "Aucun modèle de chat configuré. Choisis-en un dans Paramètres.",
        );
        return;
      }
      setSeedBulkError(null);
      setSeedingArchiveId(entry.id);
      const ac = new AbortController();
      seedAbortRef.current = ac;
      try {
        const ordered = sortedMembersForSeedPass(entry.members);
        const byId = new Map(ordered.map((x) => [x.id, x]));
        const nextSouls: Record<string, string> = { ...entry.souls };
        for (let i = 0; i < ordered.length; i++) {
          const mem = ordered[i]!;
          const parent = mem.parentId ? byId.get(mem.parentId) : undefined;
          const text = await generateMemberSoulSeed({
            llmProvider,
            mistralApiKey,
            model: m,
            memberLabel: mem.label.trim(),
            parentId: mem.parentId,
            parentLabel: parent?.label ?? null,
            signal: ac.signal,
          });
          nextSouls[mem.id] = text;
        }
        replaceTeamArchiveEntry({
          ...entry,
          souls: nextSouls,
        });
        refresh();
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setSeedBulkError(
          (e as Error).message || "Échec de la régénération des âmes.",
        );
      } finally {
        setSeedingArchiveId(null);
        seedAbortRef.current = null;
      }
    },
    [llmProvider, mistralApiKey, model, refresh],
  );

  const wrapClass =
    variant === "modal"
      ? "team-archive-wrap team-archive-wrap--modal"
      : "team-archive-wrap";

  const seedingBusy = seedingArchiveId !== null;
  const canBulkSeed = Boolean(model.trim());

  return (
    <div className={wrapClass}>
      {variant === "default" ? (
        <h3 className="team-tree-title">Archives</h3>
      ) : null}
      <div className="team-archive-form">
        <label className="team-archive-label" htmlFor={nameFieldId}>
          Nom de la composition
        </label>
        <div className="team-archive-form-row">
          <input
            id={nameFieldId}
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
      {seedBulkError ? (
        <p className="team-archive-seed-error" role="alert">
          {seedBulkError}
        </p>
      ) : null}
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
                  className="btn-secondary btn-compact"
                  disabled={
                    !canBulkSeed || seedingBusy || a.members.length === 0
                  }
                  title={
                    canBulkSeed
                      ? "Régénérer les textes « âme et rôle » (LLM) pour chaque membre de cette composition, puis enregistrer dans l’archive."
                      : "Configure un modèle dans Paramètres pour régénérer les âmes."
                  }
                  aria-busy={seedingArchiveId === a.id}
                  onClick={() => setConfirm({ kind: "regenerateSouls", entry: a })}
                >
                  {seedingArchiveId === a.id
                    ? "Régénération…"
                    : "Régénérer les âmes"}
                </button>
                <button
                  type="button"
                  className="btn-primary btn-compact"
                  disabled={seedingBusy}
                  onClick={() => setConfirm({ kind: "restore", entry: a })}
                >
                  Restaurer
                </button>
                <button
                  type="button"
                  className="btn-link team-archive-delete"
                  disabled={seedingBusy}
                  onClick={() => setConfirm({ kind: "delete", entry: a })}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirm ? (
        <ConfirmDialog
          open
          title={
            confirm.kind === "restore"
              ? "Restaurer cette composition ?"
              : confirm.kind === "delete"
                ? "Supprimer cette archive ?"
                : "Régénérer toutes les âmes ?"
          }
          description={
            confirm.kind === "restore" ? (
              <p className="modal-confirm-text">
                Remplacer l’équipe active par «{" "}
                <strong>{confirm.entry.name}</strong> » ? L’arbre et les âmes en
                cours seront écrasés. Une copie reste dans les archives tant que tu
                ne la supprimes pas.
              </p>
            ) : confirm.kind === "delete" ? (
              <p className="modal-confirm-text">
                Supprimer définitivement «{" "}
                <strong>{confirm.entry.name}</strong> » ? Cette action ne peut pas
                être annulée.
              </p>
            ) : (
              <p className="modal-confirm-text">
                La composition « <strong>{confirm.entry.name}</strong> » compte{" "}
                <strong>{confirm.entry.members.length}</strong> membre
                {confirm.entry.members.length > 1 ? "s" : ""}. Un appel au modèle
                sera fait <strong>par membre</strong> pour réécrire les textes « âme
                et rôle », puis l’archive sera mise à jour (l’équipe active ne change
                pas tant que tu ne restaures pas).
              </p>
            )
          }
          confirmLabel={
            confirm.kind === "restore"
              ? "Restaurer"
              : confirm.kind === "delete"
                ? "Supprimer"
                : "Régénérer"
          }
          confirmTone={
            confirm.kind === "delete" ? "danger" : "primary"
          }
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === "restore") applyRestore(confirm.entry);
            else if (confirm.kind === "delete") applyDelete(confirm.entry);
            else void runRegenerateArchiveSouls(confirm.entry);
          }}
        />
      ) : null}
    </div>
  );
}
