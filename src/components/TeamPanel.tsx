type NodeKind = "master" | "agent" | "sub";

interface TeamNode {
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

function TeamBranch({ node }: { node: TeamNode }) {
  const hasChildren = Boolean(node.children?.length);

  return (
    <li className={`team-tree-item team-tree-item-${node.kind}`}>
      <div
        className={`team-tree-node team-tree-node-${node.kind}`}
        role="treeitem"
        aria-expanded={hasChildren ? true : undefined}
      >
        {node.kind !== "master" && (
          <span className="team-tree-badge">{labelForKind(node.kind)}</span>
        )}
        <span className="team-tree-label">{node.label}</span>
      </div>
      {hasChildren && (
        <ul className="team-tree-children" role="group">
          {node.children!.map((child) => (
            <TeamBranch key={child.id} node={child} />
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
  return (
    <div className="team-panel">
      <h2 className="team-heading">Équipe virtuelle</h2>
      <p className="team-copy">
        Hiérarchie cible : l’orchestrateur coordonne les agents métiers, chacun pouvant
        déléguer à des sous-agents spécialisés (comportement Ollama à brancher plus tard).
      </p>
      <div className="team-tree-wrap">
        <h3 className="team-tree-title">Organisation</h3>
        <ul
          className="team-tree-root"
          role="tree"
          aria-label="Hiérarchie des agents"
        >
          <TeamBranch node={TEAM_HIERARCHY} />
        </ul>
      </div>
    </div>
  );
}
