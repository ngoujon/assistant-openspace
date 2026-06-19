import { describe, expect, it } from "vitest";
import { parseMissionProgressLine } from "@/lib/parseMissionProgressLine";

describe("parseMissionProgressLine", () => {
  it("parse une ligne mission classique", () => {
    const p = parseMissionProgressLine(
      "Étape 2 / 11 — CTO — analyse directe (sans sous-agent)…",
    );
    expect(p.step).toBe(2);
    expect(p.total).toBe(11);
    expect(p.displayPill).toBe("CTO");
  });

  it("parse une ligne discussion intervenant", () => {
    const p = parseMissionProgressLine("Intervenant : Designer UI/UX");
    expect(p.kind).toBe("handoff");
    expect(p.displayPill).toBe("Designer UI/UX");
  });
});
