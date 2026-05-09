import {
  interpolateSeedUserTemplate,
  loadAppSettings,
} from "@/lib/appSettingsStorage";
import { completeOllamaChat } from "@/lib/ollama";
import { ORCHESTRATOR_ID } from "@/lib/teamTreeStorage";

export interface GenerateSeedInput {
  model: string;
  memberLabel: string;
  parentId: string | null;
  parentLabel: string | null;
  signal?: AbortSignal;
}

/**
 * Propose un texte « âme et rôle » en français pour un membre, selon son nom et sa place dans l’arbre.
 */
export async function generateMemberSoulSeed(
  input: GenerateSeedInput,
): Promise<string> {
  const { model, memberLabel, parentId, parentLabel, signal } = input;
  const place =
    parentId === ORCHESTRATOR_ID || parentId === null
      ? "Ce membre est **directement sous l’orchestrateur** (niveau directeur / pilier métier)."
      : `Ce membre est **sous le responsable** « ${parentLabel ?? "—"} » (sous-agent / spécialiste).`;

  const { seedSystemPrompt, seedUserTemplate } = loadAppSettings();
  const system = seedSystemPrompt;
  const user = interpolateSeedUserTemplate(
    seedUserTemplate,
    memberLabel,
    place,
  );

  return completeOllamaChat(
    model,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal,
    { temperature: 0.5 },
  );
}
