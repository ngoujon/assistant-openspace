import { AgentSoulModal, type SoulModalNode } from "@/components/AgentSoulModal";
import type { DisplayNode } from "@/lib/teamTreeDisplay";
import {
  validParentTargetsForMember,
} from "@/lib/teamTreeStorage";
import { useTeamWorkspace } from "@/components/TeamWorkspaceContext";

function toSoulModalNode(node: DisplayNode): SoulModalNode {
  return { id: node.id, label: node.label, kind: node.kind };
}

/** Zone centrale onglet Équipe : titre, modale âme (sans l’arbre). Archives : colonne Organisation. */
export function TeamCentrePanel() {
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
  } = useTeamWorkspace();

  return (
    <div className="team-panel team-panel--centre">
      <header className="team-centre-head">
        <h2 className="team-heading">Équipe virtuelle</h2>
      </header>

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
