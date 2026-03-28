/** Retire une seule enveloppe ```markdown … ``` si le modèle en a ajouté une. */
export function unwrapMarkdownFence(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const lines = t.split("\n");
  if (lines[0]?.startsWith("```")) lines.shift();
  if (lines[lines.length - 1]?.trim() === "```") lines.pop();
  return lines.join("\n").trim();
}
