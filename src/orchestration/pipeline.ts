import { completeOllamaChat } from "@/lib/ollama";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

export interface MissionFile {
  name: string;
  content: string;
}

export interface RunMissionOptions {
  model: string;
  context: string;
  files: MissionFile[];
  /** Textes « âme et rôle » par id de nœud. */
  souls: Record<string, string>;
  /** Arbre courant (onglet Équipe). */
  teamMembers: TreeMember[];
  signal?: AbortSignal;
  onProgress: (label: string) => void;
}

function soul(souls: Record<string, string>, id: string): string {
  return (
    souls[id]?.trim() ||
    "Tu es un assistant expert. Réponds en français, de façon structurée."
  );
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

function leadsOf(members: TreeMember[]): TreeMember[] {
  return members
    .filter((m) => m.parentId === ORCHESTRATOR_ID)
    .sort((a, b) => a.order - b.order);
}

function childrenOf(
  parentId: string,
  members: TreeMember[],
): TreeMember[] {
  return members
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

const TEMP = 0.35;

/**
 * Orchestrateur → chaque pilier (sous-orchestrateur) → sous-agents optionnels → README.
 */
export async function runMissionPipeline(
  opts: RunMissionOptions,
): Promise<string> {
  const { model, context, files, souls, teamMembers, signal, onProgress } =
    opts;
  const payload = bundleUserPayload(context, files);
  const leads = leadsOf(teamMembers);

  if (leads.length === 0) {
    throw new Error(
      "Aucun membre sous l’orchestrateur. Ajoute au moins un pilier dans l’onglet Équipe.",
    );
  }

  const poleHeaders = leads
    .map((l) => `## Pôle ${l.label}`)
    .join("\n");

  onProgress("Orchestrateur — analyse du contexte et des fichiers…");
  const orchestratorBrief = await completeOllamaChat(
    model,
    [
      { role: "system", content: soul(souls, ORCHESTRATOR_ID) },
      {
        role: "user",
        content: `${payload}\n\n---\nTâche : en tant qu’orchestrateur, analyse ce contenu. Rédige une synthèse opérationnelle puis, **pour chaque pôle listé ci-dessous**, un **brief ciblé** (8–15 lignes chacun) que le responsable du pôle pourra exécuter.\n\nUtilise exactement ces en-têtes markdown :\n\n## Synthèse globale\n${poleHeaders}\n\nSois concret et actionnable.`,
      },
    ],
    signal,
    { temperature: TEMP },
  );

  const branchOutputs: { title: string; synthesis: string }[] = [];

  for (const lead of leads) {
    const subs = childrenOf(lead.id, teamMembers);

    if (subs.length === 0) {
      onProgress(`${lead.label} — analyse directe (sans sous-agent)…`);
      const synthesis = await completeOllamaChat(
        model,
        [
          { role: "system", content: soul(souls, lead.id) },
          {
            role: "user",
            content: `Vision de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nContexte et fichiers (rappel) :\n\n${payload.slice(0, 12000)}${payload.length > 12000 ? "\n\n[… tronqué …]" : ""}\n\n---\nTu es **${lead.label}**, seul sur ce pôle. Produis une synthèse directrice claire pour l’orchestrateur (15–25 lignes ou sections markdown courtes). Pas de méta-discussion sur le processus.`,
          },
        ],
        signal,
        { temperature: TEMP },
      );
      branchOutputs.push({ title: lead.label, synthesis });
      continue;
    }

    const subBlocks: string[] = [];

    for (const sub of subs) {
      onProgress(`${lead.label} → ${sub.label} — consignes…`);
      const delegation = await completeOllamaChat(
        model,
        [
          { role: "system", content: soul(souls, lead.id) },
          {
            role: "user",
            content: `Vision globale de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nEn tant que **${lead.label}**, rédige des **consignes précises** uniquement pour ton sous-agent **${sub.label}** : objectifs, contraintes, livrables, vigilance. 12–18 lignes maximum.`,
          },
        ],
        signal,
        { temperature: TEMP },
      );

      onProgress(`${sub.label} — travail spécialisé…`);
      const subWork = await completeOllamaChat(
        model,
        [
          { role: "system", content: soul(souls, sub.id) },
          {
            role: "user",
            content: `Consignes de **${lead.label}** :\n\n${delegation}\n\n---\nContexte et fichiers initiaux (rappel) :\n\n${payload.slice(0, 12000)}${payload.length > 12000 ? "\n\n[… tronqué …]" : ""}\n\n---\nExécute ta mission : analyse, recommandations et éléments concrets. Réponse structurée en sections courtes.`,
          },
        ],
        signal,
        { temperature: TEMP },
      );

      subBlocks.push(`### ${sub.label}\n\n${subWork}`);
    }

    const combined = subBlocks.join("\n\n---\n\n");

    onProgress(`${lead.label} — synthèse et ajustements…`);
    const synthesis = await completeOllamaChat(
      model,
      [
        { role: "system", content: soul(souls, lead.id) },
        {
          role: "user",
          content: `Retours des sous-agents de ton pôle :\n\n${combined}\n\n---\nSynthétise au niveau **directeur** : intègre, ajuste si nécessaire. Livrable clair pour l’orchestrateur (pas de méta sur le processus), 15–30 lignes ou sections markdown courtes.`,
        },
      ],
      signal,
      { temperature: TEMP },
    );

    branchOutputs.push({ title: lead.label, synthesis });
  }

  onProgress("Orchestrateur — rédaction du document final (README)…");
  const branchesBlock = branchOutputs
    .map((o) => `### ${o.title}\n\n${o.synthesis}`)
    .join("\n\n---\n\n");

  const readme = await completeOllamaChat(
    model,
    [
      { role: "system", content: soul(souls, ORCHESTRATOR_ID) },
      {
        role: "user",
        content: `Tu as piloté une équipe virtuelle. Voici ta **première analyse** :\n\n${orchestratorBrief}\n\n---\nVoici les **synthèses finales des responsables de pôle** :\n\n${branchesBlock}\n\n---\n**Tâche finale :** produis **un seul document Markdown**, prêt à être enregistré comme \`README.md\` de projet. Il doit :\n- intégrer **toutes** les informations pertinentes remontées ;\n- être lisible pour un lecteur externe (pas de jargon sur « agents » ou « orchestration ») ;\n- utiliser \`#\` \`##\` \`###\`, listes et paragraphes clairs ;\n- commencer par un titre de niveau 1 adapté au sujet.\n\nNe rajoute pas de bloc de code fence autour du document entier ; renvoie uniquement le markdown.`,
      },
    ],
    signal,
    { temperature: 0.45 },
  );

  onProgress("Terminé.");
  return readme;
}
