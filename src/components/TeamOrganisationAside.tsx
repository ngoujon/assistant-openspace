import { type DragEvent, useState } from "react";
import { TeamArchiveModal } from "@/components/TeamArchiveModal";
import {
  canReparent,
  ORCHESTRATOR_ID,
  type TreeMember,
} from "@/lib/teamTreeStorage";
import type { DisplayNode } from "@/lib/teamTreeDisplay";
import { useTeamWorkspace } from "@/components/TeamWorkspaceContext";

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

/** Colonne pleine hauteur à gauche de l’activité : arbre Organisation. */
export function TeamOrganisationAside() {
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const {
    members,
    souls,
    root,
    draggingId,
    dropTargetId,
    setDropTargetId,
    handleOpen,
    handleDragStart,
    handleDragEnd,
    handleDropOn,
    handleDelete,
    addUnderOrchestrator,
    handleRestoreArchive,
  } = useTeamWorkspace();

  if (!root) {
    return (
      <div className="team-org-aside-inner">
        <p className="team-org-aside-error">Arbre d’équipe invalide.</p>
      </div>
    );
  }

  return (
    <div className="team-org-aside-inner">
      <header className="team-org-aside-header">
        <div className="team-org-aside-title-group">
          <h2 className="team-org-aside-title">Organisation</h2>
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
        </div>
        <button
          type="button"
          className="btn-primary team-org-aside-add"
          onClick={addUnderOrchestrator}
        >
          Nouveau membre
        </button>
      </header>
      <TeamArchiveModal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        members={members}
        souls={souls}
        onRestore={handleRestoreArchive}
      />
      <div className="team-tree-wrap team-tree-wrap--aside">
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
    </div>
  );
}
