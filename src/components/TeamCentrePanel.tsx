import { AgentSoulModal, type SoulModalNode } from "@/components/AgentSoulModal";
import type { DisplayNode } from "@/lib/teamTreeDisplay";
import {
  validParentTargetsForMember,
} from "@/lib/teamTreeStorage";
import { useTeamWorkspace } from "@/components/TeamWorkspaceContext";

function toSoulModalNode(node: DisplayNode): SoulModalNode {
  return { id: node.id, label: node.label, kind: node.kind };
}

/** Modale âme / rôle (ouverture depuis un membre dans la colonne Organisation). */
export function TeamCentrePanel() {
  const {
    members,
    souls,
    editing,
    editingMember,
    editParentLabel,
    model,
    llmProvider,
    ollamaApiKey,
    ollamaApiUrl,
    handleCloseModal,
    handleSaveSoul,
  } = useTeamWorkspace();

  return (
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
      ollamaApiKey={ollamaApiKey}
      ollamaApiUrl={ollamaApiUrl}
      onClose={handleCloseModal}
      onSave={handleSaveSoul}
    />
  );
}
