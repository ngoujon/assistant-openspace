/**
 * Retire préambule du type « Voici le document » et une enveloppe
 * ```markdown … ``` si le modèle en a ajouté une.
 */
export function unwrapMarkdownFence(s: string): string {
  let t = s.trim();
  const firstFence = t.indexOf("```");
  if (firstFence > 0) {
    const pre = t.slice(0, firstFence).trim();
    if (!/^#\s/m.test(pre) && pre.length < 600) {
      t = t.slice(firstFence).trim();
    }
  }
  if (!t.startsWith("```")) return t;
  const lines = t.split("\n");
  if (lines[0]?.startsWith("```")) lines.shift();
  if (lines[lines.length - 1]?.trim() === "```") lines.pop();
  return lines.join("\n").trim();
}
