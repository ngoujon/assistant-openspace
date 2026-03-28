import { completeOllamaChat } from "@/lib/ollama";

export interface MissionFile {
  name: string;
  content: string;
}

export interface RunMissionOptions {
  model: string;
  context: string;
  files: MissionFile[];
  /** Textes « âme et rôle » par id de nœud (orchestrateur, da, …). */
  souls: Record<string, string>;
  signal?: AbortSignal;
  onProgress: (label: string) => void;
}

const BRANCHES = [
  {
    agentId: "da",
    agentName: "Directeur Artistique",
    subId: "da-uiux",
    subName: "Designer UI / UX",
  },
  {
    agentId: "cto",
    agentName: "CTO",
    subId: "cto-dev",
    subName: "Développeur",
  },
  {
    agentId: "juridique",
    agentName: "Directeur juridique",
    subId: "jur-dpo",
    subName: "DPO",
  },
] as const;

function soul(souls: Record<string, string>, id: string): string {
  return souls[id]?.trim() || "Tu es un assistant expert. Réponds en français, de façon structurée.";
}

function bundleUserPayload(context: string, files: MissionFile[]): string {
  const parts: string[] = [];
  if (context.trim()) {
    parts.push("## Contexte utilisateur\n\n" + context.trim());
  }
  if (files.length) {
    parts.push(
      "## Fichiers fournis\n\n" +
        files
          .map(
            (f) =>
              `### Fichier : ${f.name}\n\n\`\`\`\n${f.content}\n\`\`\`\n`,
          )
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

const TEMP = 0.35;

/**
 * Enchaîne orchestrateur → agents → sous-agents → synthèses → document README final.
 */
export async function runMissionPipeline(opts: RunMissionOptions): Promise<string> {
  const { model, context, files, souls, signal, onProgress } = opts;
  const payload = bundleUserPayload(context, files);

  onProgress("Orchestrateur — analyse du contexte et des fichiers…");
  const orchestratorBrief = await completeOllamaChat(
    model,
    [
      { role: "system", content: soul(souls, "orchestrateur") },
      {
        role: "user",
        content: `${payload}\n\n---\nTâche : en tant qu’orchestrateur, analyse ce contenu. Rédige une synthèse opérationnelle puis, pour chaque pôle ci-dessous, un **brief ciblé** (8–15 lignes chacun) que le directeur concerné pourra exécuter.\n\nUtilise exactement ces en-têtes markdown :\n\n## Synthèse globale\n## Pôle Artistique\n## Pôle Technique\n## Pôle Juridique\n\nSois concret et actionnable.`,
      },
    ],
    signal,
    { temperature: TEMP },
  );

  const branchOutputs: { title: string; synthesis: string }[] = [];

  for (const b of BRANCHES) {
    onProgress(`${b.agentName} — découpe pour ${b.subName}…`);
    const delegation = await completeOllamaChat(
      model,
      [
        { role: "system", content: soul(souls, b.agentId) },
        {
          role: "user",
          content: `Voici la vision globale de l’orchestrateur (à prendre en compte pour ton périmètre) :\n\n${orchestratorBrief}\n\n---\nEn tant que **${b.agentName}**, rédige des **consignes précises** pour ton sous-agent **${b.subName}** : objectifs, contraintes, livrables attendus, points de vigilance. Texte structuré, 12–20 lignes maximum.`,
        },
      ],
      signal,
      { temperature: TEMP },
    );

    onProgress(`${b.subName} — travail spécialisé…`);
    const subWork = await completeOllamaChat(
      model,
      [
        { role: "system", content: soul(souls, b.subId) },
        {
          role: "user",
          content: `Consignes de ton responsable (${b.agentName}) :\n\n${delegation}\n\n---\nContexte et fichiers initiaux (rappel) :\n\n${payload.slice(0, 12000)}${payload.length > 12000 ? "\n\n[… contenu tronqué pour la taille …]" : ""}\n\n---\nExécute ta mission : analyse, recommandations et éléments concrets. Réponse structurée en sections courtes.`,
        },
      ],
      signal,
      { temperature: TEMP },
    );

    onProgress(`${b.agentName} — synthèse et ajustements…`);
    const synthesis = await completeOllamaChat(
      model,
      [
        { role: "system", content: soul(souls, b.agentId) },
        {
          role: "user",
          content: `Retour de **${b.subName}** :\n\n${subWork}\n\n---\nSynthétise au niveau **directeur** : intègre, ajuste si nécessaire, tranche les ambiguïtés. Livrable : texte clair pour l’orchestrateur (pas de méta-discussion sur le processus), 15–25 lignes ou sections markdown courtes.`,
        },
      ],
      signal,
      { temperature: TEMP },
    );

    branchOutputs.push({ title: b.agentName, synthesis });
  }

  onProgress("Orchestrateur — rédaction du document final (README)…");
  const branchesBlock = branchOutputs
    .map((o) => `### ${o.title}\n\n${o.synthesis}`)
    .join("\n\n---\n\n");

  const readme = await completeOllamaChat(
    model,
    [
      { role: "system", content: soul(souls, "orchestrateur") },
      {
        role: "user",
        content: `Tu as piloté une équipe virtuelle. Voici ta **première analyse** :\n\n${orchestratorBrief}\n\n---\nVoici les **synthèses finales des trois directeurs** (après travail avec leurs sous-agents) :\n\n${branchesBlock}\n\n---\n**Tâche finale :** produis **un seul document Markdown**, prêt à être enregistré comme \`README.md\` de projet. Il doit :\n- intégrer **toutes** les informations pertinentes remontées ;\n- être lisible pour un lecteur externe (pas de jargon sur « agents » ou « orchestration ») ;\n- utiliser \`#\` \`##\` \`###\`, listes et paragraphes clairs ;\n- commencer par un titre de niveau 1 adapté au sujet.\n\nNe rajoute pas de bloc de code fence autour du document entier ; renvoie uniquement le markdown.`,
      },
    ],
    signal,
    { temperature: 0.45 },
  );

  onProgress("Terminé.");
  return readme;
}
