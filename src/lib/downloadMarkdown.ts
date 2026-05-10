/** Téléchargement d’un fichier Markdown côté client (blob). */
export function triggerMarkdownDownload(
  content: string,
  filename: string,
): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nom de fichier stable à partir du titre de conversation. */
export function markdownFilenameFromConversationTitle(title: string): string {
  const slug =
    title
      .slice(0, 48)
      .replace(/[^\wÀ-ÿ-]+/g, "-")
      .replace(/^-|-$/g, "") || "livrable";
  return `${slug}.md`;
}
