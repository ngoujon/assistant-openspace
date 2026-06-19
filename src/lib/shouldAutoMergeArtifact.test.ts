import { describe, expect, it } from "vitest";
import { shouldAutoMergeArtifact } from "@/lib/shouldAutoMergeArtifact";

describe("shouldAutoMergeArtifact", () => {
  it("détecte une intention de modification", () => {
    expect(shouldAutoMergeArtifact("Peux-tu modifier la section risques ?")).toBe(
      true,
    );
  });

  it("ignore un message conversationnel", () => {
    expect(shouldAutoMergeArtifact("Merci, c’est clair pour moi.")).toBe(false);
  });
});
