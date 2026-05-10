import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { AgentSoulModal, type SoulModalNode } from "@/components/AgentSoulModal";
import { TeamArchiveSection } from "@/components/TeamArchiveSection";
import {
  membersToDisplayTree,
  parentLabelFor,
  type DisplayNode,
} from "@/lib/teamTreeDisplay";
import { loadAgentSouls, saveAgentSouls } from "@/lib/teamSoulsStorage";
import type { LlmProvider } from "@/lib/llmProvider";
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
  validParentTargetsForMember,
  type TreeMember,
} from "@/lib/teamTreeStorage";

interface TeamPanelProps {
  model: string;
  llmProvider: LlmProvider;
  mistralApiKey: string;
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
  onDropOn: (newParentId: string, draggedMemberId?: string) => void;
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

  const startRowDrag = (e: DragEvent<HTMLDivElement>) => {
    if (isOrch) return;
    const target = e.target as HTMLElement;
    if (target.closest(".team-tree-delete")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", node.id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("application/x-openspace-member", node.id);
    } catch {
      /* certains navigateurs restreignent les types MIME custom */
    }
    onDragStart(node.id);
  };

  const rowContent = (
    <>
      {!isOrch && (
        <span className="team-drag-handle" aria-hidden="true">
          <span className="team-drag-dots">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        </span>
      )}
      <button
        type="button"
        className={`team-tree-node team-tree-node-${node.kind}`}
        draggable={false}
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
          draggable={false}
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
      className={`team-tree-item team-tree-item-${node.kind} team-tree-lineage-node`}
      onDragOver={
        canBeDropTarget
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              onSetDropTarget(targetId);
            }
          : undefined
      }
      onDrop={
        canBeDropTarget
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              let id =
                e.dataTransfer.getData("text/plain").trim() ||
                e.dataTransfer.getData("application/x-openspace-member").trim();
              if (!id) id = draggingId ?? "";
              if (id) onDropOn(targetId, id);
            }
          : undefined
      }
    >
      <div
        className={`team-tree-row ${!isOrch ? "team-tree-row-draggable" : ""} ${draggingId === node.id ? "team-tree-row--dragging" : ""} ${isDropHighlight ? "team-tree-drop-target" : ""}`}
        draggable={!isOrch}
        onDragStart={startRowDrag}
        onDragEnd={onDragEnd}
        title={
          isOrch
            ? undefined
            : "Glisser cette ligne vers l’orchestrateur ou un directeur"
        }
      >
        {rowContent}
      </div>
      {hasChildren && (
        <ul
          className="team-tree-children team-tree-lineage-children"
          role="group"
          onDragOver={
            draggingId
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              : undefined
          }
        >
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

export function TeamPanel({
  model,
  llmProvider,
  mistralApiKey,
}: TeamPanelProps) {
  const [members, setMembers] = useState(loadTeamMembers);
  const [souls, setSouls] = useState(loadAgentSouls);
  const [editing, setEditing] = useState<DisplayNode | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

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
    (
      text: string,
      agentId: string,
      label: string,
      newParentId?: string,
    ) => {
      setMembers((prev) => {
        let next = updateMemberLabel(prev, agentId, label);
        const cur = prev.find((m) => m.id === agentId);
        if (
          newParentId !== undefined &&
          cur &&
          cur.parentId !== newParentId
        ) {
          next = reparentMember(next, agentId, newParentId);
        }
        return next;
      });
      setSouls((prev) => ({ ...prev, [agentId]: text }));
    },
    [],
  );

  const handleDragStart = useCallback((id: string) => {
    draggingRef.current = id;
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  const handleDropOn = useCallback(
    (newParentId: string, draggedMemberId?: string) => {
      const id =
        (draggedMemberId && draggedMemberId.trim()) ||
        draggingRef.current ||
        draggingId;
      if (!id) return;
      setMembers((prev) => reparentMember(prev, id, newParentId));
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

  const handleRestoreArchive = useCallback(
    (nextMembers: TreeMember[], nextSouls: Record<string, string>) => {
      setMembers(nextMembers);
      setSouls(nextSouls);
      setEditing(null);
    },
    [],
  );

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

      <div className="team-actions-bar">
        <button
          type="button"
          className="btn-primary"
          onClick={addUnderOrchestrator}
        >
          Nouveau membre (sous orchestrateur)
        </button>
      </div>

      <TeamArchiveSection
        members={members}
        souls={souls}
        onRestore={handleRestoreArchive}
      />

      <div className="team-tree-wrap">
        <h3 className="team-tree-title">Organisation</h3>
        <ul
          className="team-tree-root team-tree-lineage-root"
          role="tree"
          aria-label="Hiérarchie des agents"
          onDragOver={
            draggingId
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              : undefined
          }
        >
          <TeamBranch
            node={root}
            members={members}
            draggingId={draggingId}
            dropTargetId={dropTargetId}
            onOpen={handleOpen}
            onDragStart={handleDragStart}
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
