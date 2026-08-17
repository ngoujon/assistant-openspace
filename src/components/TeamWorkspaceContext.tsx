import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  loadTeamMembers,
  removeMemberSubtree,
  reparentMember,
  saveTeamMembers,
  subtreeIds,
  updateMemberLabel,
  type TreeMember,
} from "@/lib/teamTreeStorage";

export interface TeamWorkspaceProviderProps {
  children: ReactNode;
  model: string;
  llmProvider: LlmProvider;
  ollamaApiKey: string;
  ollamaApiUrl: string;
}

export interface TeamWorkspaceValue {
  members: TreeMember[];
  souls: Record<string, string>;
  root: ReturnType<typeof membersToDisplayTree> | null;
  editing: DisplayNode | null;
  editingMember: TreeMember | undefined;
  editParentLabel: string | null;
  model: string;
  llmProvider: LlmProvider;
  ollamaApiKey: string;
  ollamaApiUrl: string;
  draggingId: string | null;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  handleOpen: (n: DisplayNode) => void;
  handleCloseModal: () => void;
  handleSaveSoul: (
    text: string,
    agentId: string,
    label: string,
    newParentId?: string,
  ) => void;
  handleDragStart: (id: string) => void;
  handleDragEnd: () => void;
  handleDropOn: (newParentId: string, draggedMemberId?: string) => void;
  handleDelete: (id: string) => void;
  addUnderOrchestrator: () => void;
  handleRestoreArchive: (
    nextMembers: TreeMember[],
    nextSouls: Record<string, string>,
  ) => void;
}

const TeamWorkspaceContext = createContext<TeamWorkspaceValue | null>(null);

export function useTeamWorkspace(): TeamWorkspaceValue {
  const v = useContext(TeamWorkspaceContext);
  if (!v) {
    throw new Error("useTeamWorkspace doit être utilisé dans TeamWorkspaceProvider");
  }
  return v;
}

export function TeamWorkspaceProvider({
  children,
  model,
  llmProvider,
  ollamaApiKey,
  ollamaApiUrl,
}: TeamWorkspaceProviderProps) {
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

  const root = useMemo(() => membersToDisplayTree(members), [members]);

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

  const editingMember = editing
    ? members.find((m) => m.id === editing.id)
    : undefined;
  const editParentLabel = editing
    ? parentLabelFor(editing.id, members)
    : null;

  const value = useMemo<TeamWorkspaceValue>(
    () => ({
      members,
      souls,
      root,
      editing,
      editingMember,
      editParentLabel,
      model,
      llmProvider,
      ollamaApiKey,
      ollamaApiUrl,
      draggingId,
      dropTargetId,
      setDropTargetId,
      handleOpen,
      handleCloseModal,
      handleSaveSoul,
      handleDragStart,
      handleDragEnd,
      handleDropOn,
      handleDelete,
      addUnderOrchestrator,
      handleRestoreArchive,
    }),
    [
      members,
      souls,
      root,
      editing,
      editingMember,
      editParentLabel,
      model,
      llmProvider,
      ollamaApiKey,
      ollamaApiUrl,
      draggingId,
      dropTargetId,
      handleOpen,
      handleCloseModal,
      handleSaveSoul,
      handleDragStart,
      handleDragEnd,
      handleDropOn,
      handleDelete,
      addUnderOrchestrator,
      handleRestoreArchive,
    ],
  );

  return (
    <TeamWorkspaceContext.Provider value={value}>
      {children}
    </TeamWorkspaceContext.Provider>
  );
}
