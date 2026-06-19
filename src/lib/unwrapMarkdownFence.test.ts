import { describe, expect, it } from "vitest";
import { unwrapMarkdownFence } from "@/lib/unwrapMarkdownFence";

describe("unwrapMarkdownFence", () => {
  it("retire une enveloppe markdown", () => {
    const input = "```markdown\n# Titre\n\nContenu.\n```";
    expect(unwrapMarkdownFence(input)).toBe("# Titre\n\nContenu.");
  });

  it("laisse un document sans fence intact", () => {
    const input = "# Rapport\n\nTexte.";
    expect(unwrapMarkdownFence(input)).toBe(input);
  });
});
