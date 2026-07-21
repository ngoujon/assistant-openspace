import { describe, expect, it } from "vitest";
import {
  resolveBracketMentionInner,
  resolveMentionToken,
} from "@/lib/discussionMention";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

const members: TreeMember[] = [
  { id: ORCHESTRATOR_ID, label: "Orchestrateur", parentId: null, order: 0 },
  { id: "dev-1", label: "Développeur Backend", parentId: ORCHESTRATOR_ID, order: 0 },
  // Deux membres au même libellé (cas réaliste : deux "Designer" dans des
  // pôles différents) — la résolution doit rester ambiguë, pas basculer
  // silencieusement sur le premier trouvé.
  { id: "design-1", label: "Designer", parentId: ORCHESTRATOR_ID, order: 1 },
  { id: "design-2", label: "Designer", parentId: ORCHESTRATOR_ID, order: 2 },
];

describe("resolveBracketMentionInner", () => {
  it("résout un libellé exact et non ambigu", () => {
    expect(resolveBracketMentionInner("Développeur Backend", members)).toBe(
      "dev-1",
    );
  });

  it("retourne null pour un libellé ambigu (plusieurs membres identiques) au lieu de choisir le premier", () => {
    expect(resolveBracketMentionInner("Designer", members)).toBeNull();
  });

  it("retourne null pour un libellé inconnu", () => {
    expect(resolveBracketMentionInner("Inexistant", members)).toBeNull();
  });

  it("se comporte comme resolveMentionToken sur le même cas ambigu", () => {
    // Les deux chemins de résolution (mention verrouillée vs @token libre)
    // doivent converger : ambigu => null, jamais un choix silencieux.
    expect(resolveBracketMentionInner("Designer", members)).toBe(
      resolveMentionToken("Designer", members),
    );
    expect(resolveMentionToken("Designer", members)).toBeNull();
  });
});
