import { describe, expect, it } from "vitest";
import {
  ORCHESTRATOR_ID,
  canReparent,
  type TreeMember,
} from "@/lib/teamTreeStorage";

const baseMembers: TreeMember[] = [
  { id: ORCHESTRATOR_ID, label: "Orchestrateur", parentId: null, order: 0 },
  { id: "a1", label: "CTO", parentId: ORCHESTRATOR_ID, order: 0 },
  { id: "s1", label: "Dev", parentId: "a1", order: 0 },
];

describe("teamTreeStorage", () => {
  it("autorise le reparentage sous un pilier", () => {
    expect(canReparent("s1", ORCHESTRATOR_ID, baseMembers)).toBe(true);
  });

  it("interdit le reparentage sur soi-même", () => {
    expect(canReparent("a1", "a1", baseMembers)).toBe(false);
  });
});
