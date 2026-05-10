import type { LlmProvider } from "@/lib/llmProvider";

/** Choisit un modèle de chat par défaut dans la liste API (Mistral : préférence produit). */
export function pickDefaultChatModel(
  models: string[],
  provider: LlmProvider,
): string {
  if (!models.length) return "";
  if (provider === "mistral") {
    const preferred = [
      "mistral-small-latest",
      "open-mistral-nemo",
      "mistral-large-latest",
    ];
    for (const id of preferred) {
      if (models.includes(id)) return id;
    }
  }
  return models[0] ?? "";
}
