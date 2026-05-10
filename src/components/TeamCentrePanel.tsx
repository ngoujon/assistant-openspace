import { useState } from "react";
import { AgentSoulModal, type SoulModalNode } from "@/components/AgentSoulModal";
import { TeamArchiveModal } from "@/components/TeamArchiveModal";
import type { DisplayNode } from "@/lib/teamTreeDisplay";
import {
  validParentTargetsForMember,
} from "@/lib/teamTreeStorage";
import { useTeamWorkspace } from "@/components/TeamWorkspaceContext";

function toSoulModalNode(node: DisplayNode): SoulModalNode {
  return { id: node.id, label: node.label, kind: node.kind };
}

/** Zone centrale onglet Équipe : titre, accès archives (modale), modale âme (sans l’arbre). */
export function TeamCentrePanel() {
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const {
    members,
    souls,
    editing,
    editingMember,
    editParentLabel,
    model,
    llmProvider,
    mistralApiKey,
    handleCloseModal,
    handleSaveSoul,
    handleRestoreArchive,
  } = useTeamWorkspace();

  return (
    <div className="team-panel team-panel--centre">
      <header className="team-centre-head">
        <h2 className="team-heading">Équipe virtuelle</h2>
        <button
          type="button"
          className="team-archive-open-btn"
          aria-label="Ouvrir les archives de l’équipe"
          title="Archives des compositions"
          onClick={() => setArchiveModalOpen(true)}
        >
          <svg
            className="team-archive-open-icon"
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
            <path d="M3 10h18" />
            <path d="M9 5V3h6v2" />
          </svg>
        </button>
      </header>

      <TeamArchiveModal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        members={members}
        souls={souls}
        onRestore={handleRestoreArchive}
      />

      <AgentSoulModal
        node={editing ? toSoulModalNode(editing) : null}
        initialText={editing ? souls[editing.id] ?? "" : ""}
        initialLabel={editing?.label ?? ""}
        parentId={editingMember?.parentId ?? null}
        parentLabel={editParentLabel}
        parentOptions={
          editing && editing.kind !== "master"
            ? validParentTargetsForMember(editing.id, members)
            : []
        }
        model={model}
        llmProvider={llmProvider}
        mistralApiKey={mistralApiKey}
        onClose={handleCloseModal}
        onSave={handleSaveSoul}
      />
    </div>
  );
}
