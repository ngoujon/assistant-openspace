import type { LlmProvider } from "@/lib/llmProvider";

/** Choisit un modèle de chat par défaut dans la liste API. */
export function pickDefaultChatModel(
  models: string[],
  provider: LlmProvider,
): string {
  if (!models.length) return "";
  return models[0] ?? "";
}
