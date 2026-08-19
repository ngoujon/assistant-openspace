import {
  clampOllamaTemperature,
  interpolateSeedUserTemplate,
  loadAppSettings,
} from "@/lib/appSettingsStorage";
import { completeLlmChat } from "@/lib/llmChat";
import { LLM_MAX_TOKENS_SEED } from "@/lib/llmOutputLimits";
import type { LlmProvider } from "@/lib/llmProvider";
import { ORCHESTRATOR_ID } from "@/lib/teamTreeStorage";

export interface GenerateSeedInput {
  llmProvider: LlmProvider;
  model: string;
  memberLabel: string;
  parentId: string | null;
  parentLabel: string | null;
  ollamaApiKey?: string;
  ollamaApiUrl?: string;
  signal?: AbortSignal;
}

/**
 * Propose un texte pour le champ « âme et rôle » (**Rôle** + **Pratiques et standards** si gabarit par défaut), spécialisation métier selon les réglages utilisateur.
 */
export async function generateMemberSoulSeed(
  input: GenerateSeedInput,
): Promise<string> {
  const {
    model,
    memberLabel,
    parentId,
    parentLabel,
    ollamaApiKey,
    ollamaApiUrl,
    signal,
  } = input;
  const place =
    parentId === ORCHESTRATOR_ID || parentId === null
      ? "Ce membre est **directement sous l’orchestrateur** (niveau directeur / pilier métier)."
      : `Ce membre est **sous le responsable** « ${parentLabel ?? "—"} » (sous-agent / spécialiste).`;

  const settings = loadAppSettings();
  const { seedSystemPrompt, seedUserTemplate } = settings;
  const system = seedSystemPrompt;
  const user = interpolateSeedUserTemplate(
    seedUserTemplate,
    memberLabel,
    place,
  );
  const temperature = clampOllamaTemperature(settings.ollamaTemperature);

  return completeLlmChat(
    model,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal,
    {
      temperature,
      maxTokens: LLM_MAX_TOKENS_SEED,
      ollamaApiKey,
      ollamaApiUrl,
    },
  );
}
