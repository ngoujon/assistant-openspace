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

/** Nombre d’appels `completeOllamaChat` (chaque étape peut durer longtemps en local). */
export function countMissionModelCalls(teamMembers: TreeMember[]): number {
  const leads = leadsOf(teamMembers);
  let n = 1;
  for (const lead of leads) {
    const subs = childrenOf(lead.id, teamMembers);
    if (subs.length === 0) n += 1;
    else n += subs.length * 2 + 1;
  }
  n += 1;
  return n;
}

const TEMP = 0.38;
const TEMP_FINAL = 0.42;

/** Rappel contexte/fichiers par étape (augmenter si le modèle le supporte). */
const MAX_PAYLOAD_SLICE = 24_000;

interface BranchOutput {
  leadLabel: string;
  /** Synthèse directeur (niveau pôle). */
  synthesis: string;
  /** Travail brut des sous-agents, pour intégration au README (évite de tout perdre à la compression). */
  subContributionsMarkdown?: string;
}

function buildFinalDocumentPrompt(
  orchestratorBrief: string,
  branches: BranchOutput[],
): string {
  const poleSyntheses = branches
    .map((b) => `### Pôle : ${b.leadLabel}\n\n${b.synthesis}`)
    .join("\n\n---\n\n");

  const detailParts: string[] = [];
  for (const b of branches) {
    if (b.subContributionsMarkdown?.trim()) {
      detailParts.push(
        `### Pôle ${b.leadLabel} — contributions des spécialistes\n\n${b.subContributionsMarkdown.trim()}`,
      );
    }
  }
  const specialistBlock =
    detailParts.length > 0
      ? detailParts.join("\n\n---\n\n")
      : "(Aucun sous-agent : chaque pôle a travaillé en directeur seul.)";

  return `Tu as piloté une équipe virtuelle. Les **âmes et rôles** de chaque membre ont guidé leurs réponses.

---

## Cadre initial (orchestrateur — ne pas substituer au travail des pôles)

${orchestratorBrief}

---

## Textes « directeur » par pôle (peuvent ajouter arbitrages ; le détail vient surtout des spécialistes)

${poleSyntheses}

---

## Matière brute prioritaire — travail détaillé des spécialistes

**C’est la source la plus riche.** Le document final doit **la conserver** (reprendre listes, arguments, exemples, risques, chiffres). Ne pas la remplacer par une phrase de synthèse.

${specialistBlock}

---

**Tâche finale — document unique en Markdown**

Objectif : un **dossier long et exploitable**, pas un résumé de résumés. Les lecteurs doivent sentir que **chaque membre** est allé **en profondeur**.

Règles anti-perte :

1. **Interdit** de « tout tasser » dans une synthèse globale qui efface les sous-sections : le corps du document doit contenir **beaucoup de texte repris ou étroitement dérivé** des blocs spécialistes ci-dessus.
2. **Priorité** au bloc « Matière brute prioritaire » : pour chaque spécialiste, le lecteur doit retrouver **plusieurs paragraphes ou listes** issues de son travail (tu peux réorganiser et clarifier, mais **une idée = au moins une phrase ou une puce**, pas une fusion vague).
3. **Cadre initial orchestrateur** : t’en sers pour l’intro et l’articulation, **pas** pour remplacer les analyses des pôles.

Structure **obligatoire** (titres adaptés au sujet) :

- \`# …\` titre principal.
- \`## Vue d’ensemble\` : 1–2 pages équivalent **maximum** (intro + enjeux) — reste **court** pour laisser la place au détail.
- \`## Analyses détaillées par domaine\` : pour **chaque pôle**, une section \`### [nom du pôle]\` **longue** : enchaîne (a) rappel du cadre directeur si utile, puis (b) **développement dense** des apports (sous-\`####\` par spécialiste si besoin). Vise **plusieurs écrans de contenu** par pôle lorsque les sources sont fournies.
- \`## Synthèse transversale\` : liens entre pôles, tensions, arbitrages (sans répéter tout le détail, mais sans banalités vides).
- \`## Recommandations et plan d’action\` : actions concrètes, priorités, critères de succès.
- \`## Annexes — contributions par membre\` : pour **chaque personne** ayant produit du texte dans les blocs ci-dessus, une sous-section \`### [rôle]\` de **15–35 lignes utiles** (rappel fidèle des positions, listes, risques), pas un simple qualificatif.

**Volume** : document **très fourni** ; si les sources sont longues, le livrable doit **croître** en conséquence (plusieurs milliers de mots acceptables).

**Forme** : \`#\` à \`####\`, listes, tableaux si utile ; pas de fence englobant tout le document.

Renvoie **uniquement** le markdown du document.`;
}

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

  const totalSteps = countMissionModelCalls(teamMembers);
  let stepIndex = 0;
  const prog = (label: string) => {
    stepIndex += 1;
    onProgress(`Étape ${stepIndex} / ${totalSteps} — ${label}`);
  };

  const poleHeaders = leads
    .map((l) => `## Pôle ${l.label}`)
    .join("\n");

  prog("Orchestrateur — analyse du contexte et des fichiers…");
  const orchestratorBrief = await completeOllamaChat(
    model,
    [
      { role: "system", content: soul(souls, ORCHESTRATOR_ID) },
      {
        role: "user",
        content: `${payload}\n\n---\nTâche : en tant qu’orchestrateur, pose un **cadre** pour l’équipe — **sans** réaliser toi tout l’analyse à leur place (sinon les pôles copient une synthèse courte et perdent en profondeur).\n\n1) **## Synthèse globale** : **10–18 lignes maximum** — enjeux, périmètre, risques transverses, hypothèses. Pas de liste exhaustive : les détails seront produits par chaque pôle.\n\n2) Pour **chaque pôle** ci-dessous, un brief **## Pôle …** de **6–12 lignes** : questions à trancher, livrables attendus, contraintes, liens avec d’autres pôles — style **briefing**, pas rapport final.\n\nEn-têtes obligatoires :\n\n## Synthèse globale\n${poleHeaders}\n\nSois précis mais **bref** : chaque membre doit encore **développer** largement.`,
      },
    ],
    signal,
    { temperature: TEMP },
  );

  const branchOutputs: BranchOutput[] = [];

  for (const lead of leads) {
    const subs = childrenOf(lead.id, teamMembers);

    if (subs.length === 0) {
      prog(`${lead.label} — analyse directe (sans sous-agent)…`);
      const synthesis = await completeOllamaChat(
        model,
        [
          { role: "system", content: soul(souls, lead.id) },
          {
            role: "user",
            content: `Vision de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nContexte et fichiers (rappel) :\n\n${payload.slice(0, MAX_PAYLOAD_SLICE)}${payload.length > MAX_PAYLOAD_SLICE ? "\n\n[… tronqué …]" : ""}\n\n---\nTu es **${lead.label}**, seul sur ce pôle. Tu es responsable d’une **analyse approfondie** (pas un résumé de l’orchestrateur).\n\nExige-toi :\n- **Au moins 5 sous-sections \`###\`** sur des angles différents de ton domaine.\n- **Listes, risques, recommandations, critères, exemples** : chaque \`###\` contient plusieurs paragraphes **ou** 5–12 puces utiles.\n- Vise **l’équivalent d’environ 55–95 lignes** de contenu dense (si le sujet est riche, va au-delà).\n- Cite ou paraphrase le **contexte et fichiers** quand c’est pertinent.\n\nPas de méta-discussion sur le processus.`,
          },
        ],
        signal,
        { temperature: TEMP },
      );
      branchOutputs.push({
        leadLabel: lead.label,
        synthesis,
      });
      continue;
    }

    const subBlocks: string[] = [];

    for (const sub of subs) {
      prog(`${lead.label} → ${sub.label} — consignes au sous-agent…`);
      const delegation = await completeOllamaChat(
        model,
        [
          { role: "system", content: soul(souls, lead.id) },
          {
            role: "user",
            content: `Vision globale de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nEn tant que **${lead.label}**, rédige des **consignes exigeantes** pour **${sub.label}** : objectifs, périmètre, angles d’analyse **obligatoires**, livrables (sous-parties attendues), contraintes, critères de qualité, questions ouvertes à traiter. **22–36 lignes** utiles — tu veux un rapport **long et argumenté** de sa part.`,
          },
        ],
        signal,
        { temperature: TEMP },
      );

      prog(`${sub.label} — travail spécialisé…`);
      const subWork = await completeOllamaChat(
        model,
        [
          { role: "system", content: soul(souls, sub.id) },
          {
            role: "user",
            content: `Consignes de **${lead.label}** :\n\n${delegation}\n\n---\nContexte et fichiers initiaux (rappel) :\n\n${payload.slice(0, MAX_PAYLOAD_SLICE)}${payload.length > MAX_PAYLOAD_SLICE ? "\n\n[… tronqué …]" : ""}\n\n---\nTu es **${sub.label}**. Tu dois produire une **analyse de référence** sur ton périmètre : ce texte alimentera directement le rapport final — **ne te limite pas** à une synthèse courte.\n\n- **Minimum 6 sous-sections \`###\`** (thèmes distincts).\n- Chaque \`###\` : plusieurs paragraphes **et/ou** listes détaillées (risques, options, recommandations, exemples, critères mesurables).\n- Vise **l’équivalent d’environ 60–100 lignes** de contenu utile ; si le sujet l’exige, **dépasse** ce volume.\n- T’appuyer explicitement sur le **contexte et les fichiers** (citations courtes, renvois).\n\nPas de méta sur les « agents ».`,
          },
        ],
        signal,
        { temperature: TEMP },
      );

      subBlocks.push(`### ${sub.label}\n\n${subWork}`);
    }

    const combined = subBlocks.join("\n\n---\n\n");

    prog(`${lead.label} — synthèse et ajustements du pôle…`);
    const synthesis = await completeOllamaChat(
      model,
      [
        { role: "system", content: soul(souls, lead.id) },
        {
          role: "user",
          content: `Retours des sous-agents de ton pôle :\n\n${combined}\n\n---\nTu es **${lead.label}**. **Ne produis pas une synthèse courte qui jette le détail** : le rapport final doit pouvoir **retrouver** presque tout ce que chaque sous-agent a écrit.\n\nProduit un document structuré en deux parties :\n\n**### Cadre directeur (arbitrage)** — 10–18 lignes : vision, priorités, tensions entre sous-agents, décisions tranchées.\n\n**### Intégration détaillée des apports** — pour **chaque** sous-agent, une sous-partie \`#### [son nom]\` où tu **reprends** ses arguments importants : **minimum 8–15 puces ou 3–6 paragraphes** par personne, en reprenant listes, risques, chiffres ou exemples qu’il a mentionnés (reformulation autorisée, **pas** réduction à une phrase).\n\nSi un sous-agent a écrit long, **garde la matière** : mieux vaut un texte long qu’une synthèse pauvre.`,
        },
      ],
      signal,
      { temperature: TEMP },
    );

    branchOutputs.push({
      leadLabel: lead.label,
      synthesis,
      subContributionsMarkdown: combined,
    });
  }

  prog("Orchestrateur — rédaction du document final (README)…");
  const finalUserPrompt = buildFinalDocumentPrompt(
    orchestratorBrief,
    branchOutputs,
  );

  const readme = await completeOllamaChat(
    model,
    [
      { role: "system", content: soul(souls, ORCHESTRATOR_ID) },
      {
        role: "user",
        content: finalUserPrompt,
      },
    ],
    signal,
    { temperature: TEMP_FINAL },
  );

  onProgress("Terminé — document prêt ci-dessous.");
  return readme;
}
