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

  const system = `Tu écris des fiches de personnage pour une équipe virtuelle pilotée par LLM. Réponds uniquement en français.`;

  const user = `Nom du membre : **${memberLabel}**

${place}

Rédige un texte structuré pour le champ « âme et rôle » du membre, au format :

Rôle : … (missions, périmètre, interactions avec le reste de l’équipe)

Âme : … (ton, valeurs, style de décision)

Longueur : environ 8–15 lignes au total. Pas de titre markdown de niveau 1. Pas de mention de « prompt » ou « LLM ».`;

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
