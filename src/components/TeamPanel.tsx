import { useCallback, useEffect, useState } from "react";
import { AgentSoulModal, type SoulModalNode } from "@/components/AgentSoulModal";
import { loadAgentSouls, saveAgentSouls } from "@/lib/teamSoulsStorage";

type NodeKind = "master" | "agent" | "sub";

export interface TeamNode {
  id: string;
  label: string;
  kind: NodeKind;
  children?: TeamNode[];
}

/** Hiérarchie : orchestrateur → agents → sous-agents. */
const TEAM_HIERARCHY: TeamNode = {
  id: "orchestrateur",
  label: "Orchestrateur",
  kind: "master",
  children: [
    {
      id: "da",
      label: "Directeur Artistique",
      kind: "agent",
      children: [
        { id: "da-uiux", label: "Designer UI / UX", kind: "sub" },
      ],
    },
    {
      id: "cto",
      label: "CTO",
      kind: "agent",
      children: [{ id: "cto-dev", label: "Développeur", kind: "sub" }],
    },
    {
      id: "juridique",
      label: "Directeur juridique",
      kind: "agent",
      children: [{ id: "jur-dpo", label: "DPO", kind: "sub" }],
    },
  ],
};

function toSoulModalNode(node: TeamNode): SoulModalNode {
  return { id: node.id, label: node.label, kind: node.kind };
}

function TeamBranch({
  node,
  onOpen,
}: {
  node: TeamNode;
  onOpen: (n: TeamNode) => void;
}) {
  const hasChildren = Boolean(node.children?.length);

  return (
    <li className={`team-tree-item team-tree-item-${node.kind}`}>
      <button
        type="button"
        className={`team-tree-node team-tree-node-${node.kind}`}
        role="treeitem"
        aria-expanded={hasChildren ? true : undefined}
        onClick={() => onOpen(node)}
      >
        {node.kind !== "master" && (
          <span className="team-tree-badge">{labelForKind(node.kind)}</span>
        )}
        <span className="team-tree-label">{node.label}</span>
      </button>
      {hasChildren && (
        <ul className="team-tree-children" role="group">
          {node.children!.map((child) => (
            <TeamBranch key={child.id} node={child} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

function labelForKind(kind: NodeKind): string {
  switch (kind) {
    case "master":
      return "Orchestrateur";
    case "agent":
      return "Agent";
    case "sub":
      return "Sous-agent";
    default:
      return "";
  }
}

export function TeamPanel() {
  const [souls, setSouls] = useState(loadAgentSouls);
  const [editing, setEditing] = useState<TeamNode | null>(null);

  useEffect(() => {
    saveAgentSouls(souls);
  }, [souls]);

  const handleOpen = useCallback((n: TeamNode) => {
    setEditing(n);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditing(null);
  }, []);

  const handleSaveSoul = useCallback((text: string, agentId: string) => {
    setSouls((prev) => ({ ...prev, [agentId]: text }));
  }, []);

  return (
    <div className="team-panel">
      <h2 className="team-heading">Équipe virtuelle</h2>
      <p className="team-copy">
        Clique sur un rôle pour ouvrir son <strong>âme et rôle</strong> (texte éditable,
        enregistré localement). Échap ferme la fenêtre ; Entrée enregistre ;
        Maj+Entrée insère un saut de ligne.
      </p>
      <div className="team-tree-wrap">
        <h3 className="team-tree-title">Organisation</h3>
        <ul
          className="team-tree-root"
          role="tree"
          aria-label="Hiérarchie des agents"
        >
          <TeamBranch node={TEAM_HIERARCHY} onOpen={handleOpen} />
        </ul>
      </div>

      <AgentSoulModal
        node={editing ? toSoulModalNode(editing) : null}
        initialText={editing ? souls[editing.id] ?? "" : ""}
        onClose={handleCloseModal}
        onSave={handleSaveSoul}
      />
    </div>
  );
}
