import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentSoulModal, type SoulModalNode } from "@/components/AgentSoulModal";
import {
  membersToDisplayTree,
  parentLabelFor,
  type DisplayNode,
} from "@/lib/teamTreeDisplay";
import { loadAgentSouls, saveAgentSouls } from "@/lib/teamSoulsStorage";
import {
  ORCHESTRATOR_ID,
  addMemberUnder,
  canReparent,
  loadTeamMembers,
  removeMemberSubtree,
  reparentMember,
  saveTeamMembers,
  subtreeIds,
  updateMemberLabel,
  type TreeMember,
} from "@/lib/teamTreeStorage";

interface TeamPanelProps {
  model: string;
}

function toSoulModalNode(node: DisplayNode): SoulModalNode {
  return { id: node.id, label: node.label, kind: node.kind };
}

function TeamBranch({
  node,
  members,
  draggingId,
  dropTargetId,
  onOpen,
  onDragStart,
  onDragEnd,
  onSetDropTarget,
  onDropOn,
  onDelete,
}: {
  node: DisplayNode;
  members: TreeMember[];
  draggingId: string | null;
  dropTargetId: string | null;
  onOpen: (n: DisplayNode) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSetDropTarget: (id: string | null) => void;
  onDropOn: (newParentId: string) => void;
  onDelete: (id: string) => void;
}) {
  const isOrch = node.kind === "master";
  const targetId = isOrch ? ORCHESTRATOR_ID : node.id;
  const canBeDropTarget =
    (isOrch || node.kind === "agent") &&
    draggingId &&
    canReparent(draggingId, targetId, members);
  const isDropHighlight = canBeDropTarget && dropTargetId === targetId;
  const hasChildren = Boolean(node.children?.length);

  const rowContent = (
    <>
      {!isOrch && (
        <span
          className="team-drag-handle"
          draggable
          role="button"
          tabIndex={0}
          aria-label={`Glisser ${node.label}`}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", node.id);
            e.dataTransfer.effectAllowed = "move";
            onDragStart(node.id);
          }}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
          }}
        >
          ⣿
        </span>
      )}
      <button
        type="button"
        className={`team-tree-node team-tree-node-${node.kind}`}
        role="treeitem"
        aria-expanded={hasChildren ? true : undefined}
        onClick={() => onOpen(node)}
      >
        {node.kind !== "master" && (
          <span className="team-tree-badge">{badgeForKind(node.kind)}</span>
        )}
        <span className="team-tree-label">{node.label}</span>
      </button>
      {!isOrch && (
        <button
          type="button"
          className="team-tree-delete"
          aria-label={`Supprimer ${node.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
        >
          ×
        </button>
      )}
    </>
  );

  return (
    <li
      className={`team-tree-item team-tree-item-${node.kind} ${isDropHighlight ? "team-tree-drop-target" : ""}`}
      onDragOver={
        canBeDropTarget
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              onSetDropTarget(targetId);
            }
          : undefined
      }
      onDragLeave={(e) => {
        if (!canBeDropTarget) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onSetDropTarget(null);
        }
      }}
      onDrop={
        canBeDropTarget
          ? (e) => {
              e.preventDefault();
              onDropOn(targetId);
            }
          : undefined
      }
    >
      <div className="team-tree-row">{rowContent}</div>
      {hasChildren && (
        <ul className="team-tree-children" role="group">
          {node.children!.map((child) => (
            <TeamBranch
              key={child.id}
              node={child}
              members={members}
              draggingId={draggingId}
              dropTargetId={dropTargetId}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onSetDropTarget={onSetDropTarget}
              onDropOn={onDropOn}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function badgeForKind(kind: DisplayNode["kind"]): string {
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

export function TeamPanel({ model }: TeamPanelProps) {
  const [members, setMembers] = useState(loadTeamMembers);
  const [souls, setSouls] = useState(loadAgentSouls);
  const [editing, setEditing] = useState<DisplayNode | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    saveTeamMembers(members);
  }, [members]);

  useEffect(() => {
    saveAgentSouls(souls);
  }, [souls]);

  const root = useMemo(
    () => membersToDisplayTree(members),
    [members],
  );

  const handleOpen = useCallback((n: DisplayNode) => {
    setEditing(n);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditing(null);
  }, []);

  const handleSaveSoul = useCallback(
    (text: string, agentId: string, label: string) => {
      setMembers((prev) => updateMemberLabel(prev, agentId, label));
      setSouls((prev) => ({ ...prev, [agentId]: text }));
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  const handleDropOn = useCallback(
    (newParentId: string) => {
      if (!draggingId) return;
      setMembers((prev) => reparentMember(prev, draggingId, newParentId));
      handleDragEnd();
    },
    [draggingId, handleDragEnd],
  );

  const handleDelete = useCallback((id: string) => {
    setMembers((prev) => {
      const removed = subtreeIds(id, prev);
      const nextMembers = removeMemberSubtree(prev, id);
      queueMicrotask(() => {
        setSouls((s) => {
          const next = { ...s };
          removed.forEach((rid) => {
            delete next[rid];
          });
          return next;
        });
        setEditing((cur) => (cur && removed.has(cur.id) ? null : cur));
      });
      return nextMembers;
    });
  }, []);

  const addUnderOrchestrator = useCallback(() => {
    setMembers((prev) => addMemberUnder(prev, ORCHESTRATOR_ID));
  }, []);

  if (!root) {
    return <div className="team-panel">Arbre d’équipe invalide.</div>;
  }

  const editingMember = editing
    ? members.find((m) => m.id === editing.id)
    : null;
  const editParentLabel = editing
    ? parentLabelFor(editing.id, members)
    : null;

  return (
    <div className="team-panel">
      <h2 className="team-heading">Équipe virtuelle</h2>
      <p className="team-copy">
        <strong>Ajoute</strong> des membres sous l’orchestrateur,{" "}
        <strong>glisse</strong> une poignée (
        <span className="team-copy-mono">⣿</span>) pour placer un membre{" "}
        <strong>sous l’orchestrateur</strong> (directeurs) ou{" "}
        <strong>sous un agent</strong> (sous-agent). Un membre qui a déjà des
        subordonnés ne peut pas devenir sous-agent. Clique sur un rôle pour l’
        <strong>âme et rôle</strong> ; tu peux <strong>générer un seed</strong>{" "}
        via Ollama selon le nom (modèle choisi dans l’onglet Chat).
      </p>

      <div className="team-actions-bar">
        <button
          type="button"
          className="btn-primary"
          onClick={addUnderOrchestrator}
        >
          Nouveau membre (sous orchestrateur)
        </button>
      </div>

      <div className="team-tree-wrap">
        <h3 className="team-tree-title">Organisation</h3>
        <p className="team-drop-hint">
          Pendant un glisser, dépose sur l’orchestrateur ou sur un agent (ligne
          entière se surligne).
        </p>
        <ul className="team-tree-root" role="tree" aria-label="Hiérarchie des agents">
          <TeamBranch
            node={root}
            members={members}
            draggingId={draggingId}
            dropTargetId={dropTargetId}
            onOpen={handleOpen}
            onDragStart={setDraggingId}
            onDragEnd={handleDragEnd}
            onSetDropTarget={setDropTargetId}
            onDropOn={handleDropOn}
            onDelete={handleDelete}
          />
        </ul>
      </div>

      <AgentSoulModal
        node={editing ? toSoulModalNode(editing) : null}
        initialText={editing ? souls[editing.id] ?? "" : ""}
        initialLabel={editing?.label ?? ""}
        parentId={editingMember?.parentId ?? null}
        parentLabel={editParentLabel}
        model={model}
        onClose={handleCloseModal}
        onSave={handleSaveSoul}
      />
    </div>
  );
}
