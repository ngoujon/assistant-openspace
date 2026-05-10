import { generateMissionConversationTitle } from "@/lib/discussionTeamChat";
import { completeLlmChat } from "@/lib/llmChat";
import {
  MISTRAL_MISSION_AFTER_TITLE_MS,
  MISTRAL_MISSION_INTER_STEP_MS,
  MISTRAL_MISSION_LEAD_TO_SUB_MS,
  sleepMs,
} from "@/lib/llmRateLimit";
import type { OllamaChatMessage } from "@/lib/ollama";
import type { LlmProvider } from "@/lib/llmProvider";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";

export interface MissionFile {
  name: string;
  content: string;
}

export interface RunMissionOptions {
  llmProvider: LlmProvider;
  mistralApiKey?: string;
  model: string;
  context: string;
  files: MissionFile[];
  /** Textes « âme et rôle » par id de nœud. */
  souls: Record<string, string>;
  /** Arbre courant (colonne Organisation). */
  teamMembers: TreeMember[];
  signal?: AbortSignal;
  onProgress: (label: string) => void;
  /**
   * Après le brief orchestrateur : titre pour la sidebar (liste des conversations).
   * Si absent, aucun appel supplémentaire.
   */
  onConversationTitleSuggested?: (title: string) => void;
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

/**
 * Nombre d’appels au modèle (chaque étape peut durer longtemps en local ou en cloud).
 * @param withConversationTitle inclure l’appel « titre sidebar » après le brief orchestrateur (si activé côté UI).
 */
export function countMissionModelCalls(
  teamMembers: TreeMember[],
  withConversationTitle = true,
): number {
  const leads = leadsOf(teamMembers);
  let n = 1;
  for (const lead of leads) {
    const subs = childrenOf(lead.id, teamMembers);
    if (subs.length === 0) n += 1;
    else n += subs.length * 2 + 1;
  }
  n += 1;
  if (withConversationTitle) n += 1;
  return n;
}

const TEMP = 0.38;
/** Plus bas pour limiter les squelettes / placeholders en fin de pipeline. */
const TEMP_FINAL = 0.22;

const ORCHESTRATOR_FINAL_SYSTEM_APPEND = `

— **Livrable final (obligatoire)** —
Tu rédiges un **rapport complet** à partir des blocs fournis par l’utilisateur dans le message suivant.
**Interdit** : squelette avec crochets du type \`[nom du projet]\`, \`[liste des …]\`, \`[à compléter]\`, \`[contexte]\`, ou toute ligne où le contenu utile serait **entre crochets** comme placeholder.
**Interdit** : préambule du type « Voici le document » puis un bloc de code ; commence directement par \`# Titre\`.
Chaque section doit contenir du **texte réel** (paragraphes, listes à puces avec éléments rédigés) issu des analyses fournies, pas un plan à trous.`;

/** Rappel contexte/fichiers par étape (augmenter si le modèle le supporte). */
const MAX_PAYLOAD_SLICE = 24_000;

/** Délai max par requête mission (Ollama peut être très lent ; au-delà = message clair). */
const MISSION_CHAT_TIMEOUT_MS = 40 * 60 * 1000;

const MISSION_KEEP_ALIVE = "45m";

function slicePayloadForModel(payload: string): string {
  if (payload.length <= MAX_PAYLOAD_SLICE) return payload;
  return (
    payload.slice(0, MAX_PAYLOAD_SLICE) +
    "\n\n[… Tronqué à " +
    MAX_PAYLOAD_SLICE +
    " caractères pour limiter le temps de traitement. Les étapes suivantes reçoivent le même rappel tronqué. …]"
  );
}

async function missionComplete(
  llmProvider: LlmProvider,
  mistralApiKey: string | undefined,
  model: string,
  messages: OllamaChatMessage[],
  signal: AbortSignal | undefined,
  temperature: number,
): Promise<string> {
  const out = await completeLlmChat(llmProvider, mistralApiKey, model, messages, signal, {
    temperature,
    ...(llmProvider === "ollama"
      ? { keepAlive: MISSION_KEEP_ALIVE }
      : {}),
    timeoutMs: MISSION_CHAT_TIMEOUT_MS,
  });
  if (llmProvider === "mistral") {
    await sleepMs(MISTRAL_MISSION_INTER_STEP_MS, signal);
  }
  return out;
}

interface BranchOutput {
  leadLabel: string;
  /** Synthèse directeur (niveau pôle). */
  synthesis: string;
  /** Travail brut des sous-agents, pour intégration au README (évite de tout perdre à la compression). */
  subContributionsMarkdown?: string;
  /** Noms des spécialistes sous ce pôle (prompt final). */
  specialistLabels?: string[];
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
    } else {
      detailParts.push(
        `### Pôle ${b.leadLabel} — analyse du responsable (sans sous-agent)\n\n${b.synthesis.trim()}`,
      );
    }
  }
  const specialistBlock = detailParts.join("\n\n---\n\n");

  const contributorLines = branches
    .map((b) => {
      const subs =
        b.specialistLabels && b.specialistLabels.length > 0
          ? ` — spécialistes : ${b.specialistLabels.join(", ")}`
          : " — travail du responsable de pôle seul";
      return `- **${b.leadLabel}**${subs}`;
    })
    .join("\n");

  return `Tu as piloté une équipe virtuelle. Les analyses ci-dessous sont le **contenu réel** à intégrer dans le rapport (pas un plan).

---

## Cadre initial (orchestrateur)

${orchestratorBrief}

---

## 1) Matière brute — retours détaillés des membres (TU DOIS T’EN SERVIR POUR RÉDIGER)

**C’est la source principale du rapport.** Recopie ou reformule **sans la vider** : paragraphes denses, listes avec éléments rédigés, chiffres, exemples.

Contributeurs concernés :
${contributorLines}

---

${specialistBlock}

---

## 2) Intégrations « directeur de pôle » (arbitrages — en complément du bloc 1)

${poleSyntheses}

---

## Consignes de rédaction du rapport final

Tu produis un **rapport long** (souvent **plusieurs milliers de mots** si la matière ci-dessus est fournie), destiné à être lu comme un **dossier complet**, pas comme un README de structure.

### Interdictions absolues

- **Aucun** placeholder entre crochets : pas de \`[nom du projet]\`, \`[liste des …]\`, \`[contexte]\`, \`[à compléter]\`, \`[description …]\`, etc. Les crochets \`[ ]\` pour marquer un trou sont **interdits**.
- Pas de **squelette** : si une sous-partie n’a pas assez de matière, **tu la supprimes** ou tu la remplis avec du texte tiré du bloc 1, mais tu n’écris pas de titre suivi uniquement de puces génériques.
- Pas de préambule « Voici le document », pas d’enveloppe \`\`\`markdown\`\`\` autour du tout : commence par \`# Titre du rapport\` (titre réel, pas « [titre] »).

### Obligations

- Sous chaque grand titre, du **texte rédigé** : paragraphes complets, listes dont **chaque puce** est une phrase ou un segment informatif (pas « - [point à traiter] »).
- **Analyses par domaine** : pour chaque pôle, section **longue** ; pour chaque spécialiste listé ci-dessus, un sous-titre \`####\` avec **le nom réel** du membre (comme dans le bloc 1), suivi de **plusieurs paragraphes** repris ou étroitement dérivés de son texte.
- **Interdit** : section \`## Annexes\`, « fiches contributeurs », ou tout équivalent en fin de document — intègre la matière dans le corps du rapport (notamment sous **Analyses par domaine**), sans dupliquer en annexe.

Structure type (adapte les titres au sujet, mais **remplis** chaque partie) :

- \`#\` Titre du rapport (concret)
- \`## Contexte et problématique\`
- \`## Analyses par domaine\` puis \`###\` par pôle puis \`####\` par spécialiste avec contenu dense
- \`## Synthèse transversale et arbitrages\`
- \`## Recommandations et plan d’action\`

Renvoie **uniquement** le Markdown du rapport, du premier \`#\` jusqu’à la fin, sans texte avant ni après.`;
}

/**
 * Orchestrateur → chaque pilier (sous-orchestrateur) → sous-agents optionnels → README.
 */
export async function runMissionPipeline(
  opts: RunMissionOptions,
): Promise<string> {
  const {
    llmProvider,
    mistralApiKey,
    model,
    context,
    files,
    souls,
    teamMembers,
    signal,
    onProgress,
    onConversationTitleSuggested,
  } = opts;
  const payload = bundleUserPayload(context, files);
  const leads = leadsOf(teamMembers);

  if (leads.length === 0) {
    throw new Error(
      "Aucun membre sous l’orchestrateur. Ajoute au moins un pilier dans la colonne Organisation.",
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
  const payloadSlice = slicePayloadForModel(payload);
  const orchestratorBrief = await missionComplete(
    llmProvider,
    mistralApiKey,
    model,
    [
      { role: "system", content: soul(souls, ORCHESTRATOR_ID) },
      {
        role: "user",
        content: `${payloadSlice}\n\n---\nTâche : en tant qu’orchestrateur, pose un **cadre** pour l’équipe — **sans** réaliser toi tout l’analyse à leur place (sinon les pôles copient une synthèse courte et perdent en profondeur).\n\n1) **## Synthèse globale** : **10–18 lignes maximum** — enjeux, périmètre, risques transverses, hypothèses. Ajoute **2–4 angles que l’utilisateur n’a probablement pas explicités** (questions ouvertes, risques oubliés, dépendances) à explorer par les pôles. Pas de liste exhaustive : les détails seront produits par chaque pôle.\n\n2) Pour **chaque pôle** ci-dessous, un brief **## Pôle …** de **6–12 lignes** : questions à trancher, livrables attendus, contraintes, liens avec d’autres pôles — style **briefing**, pas rapport final. Inclut au moins **une piste « hors prompt initial »** par pôle (ce que l’utilisateur n’a peut-être pas envisagé dans son premier message).\n\nEn-têtes obligatoires :\n\n## Synthèse globale\n${poleHeaders}\n\nSois précis mais **bref** : chaque membre doit encore **développer** largement.`,
      },
    ],
    signal,
    TEMP,
  );

  if (onConversationTitleSuggested) {
    prog("Orchestrateur — titre de la conversation (sidebar)…");
    try {
      const title = await generateMissionConversationTitle({
        llmProvider,
        mistralApiKey,
        model,
        souls,
        orchestratorBrief,
        userPayloadPreview: slicePayloadForModel(payload),
        signal,
      });
      if (title) onConversationTitleSuggested(title);
    } catch {
      /* titre optionnel : ne pas interrompre la mission */
    }
    if (llmProvider === "mistral") {
      await sleepMs(MISTRAL_MISSION_AFTER_TITLE_MS, signal);
    }
  }

  const branchOutputs: BranchOutput[] = [];

  for (const lead of leads) {
    const subs = childrenOf(lead.id, teamMembers);

    if (subs.length === 0) {
      prog(`${lead.label} — analyse directe (sans sous-agent)…`);
      const synthesis = await missionComplete(
        llmProvider,
        mistralApiKey,
        model,
        [
          { role: "system", content: soul(souls, lead.id) },
          {
            role: "user",
            content: `Vision de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nContexte et fichiers (rappel) :\n\n${slicePayloadForModel(payload)}\n\n---\nTu es **${lead.label}**, seul sur ce pôle. Tu es responsable d’une **analyse approfondie** (pas un résumé de l’orchestrateur).\n\nExige-toi :\n- **Au moins 5 sous-sections \`###\`** sur des angles différents de ton domaine.\n- **Listes, risques, recommandations, critères, exemples** : chaque \`###\` contient plusieurs paragraphes **ou** 5–12 puces utiles.\n- Inclure une sous-section **### Angles hors premier jet utilisateur** : questions ou risques que le porteur de projet n’a probablement pas formulés dans son message initial.\n- Vise **l’équivalent d’environ 55–95 lignes** de contenu dense (si le sujet est riche, va au-delà).\n- Cite ou paraphrase le **contexte et fichiers** quand c’est pertinent.\n\n**Interdit** : placeholders \`[…]\` pour remplacer du contenu — tout doit être rédigé.\n\nPas de méta-discussion sur le processus.`,
          },
        ],
        signal,
        TEMP,
      );
      branchOutputs.push({
        leadLabel: lead.label,
        synthesis,
        specialistLabels: [],
      });
      continue;
    }

    const subBlocks: string[] = [];

    for (const sub of subs) {
      prog(`${lead.label} → ${sub.label} — consignes au sous-agent…`);
      const delegation = await missionComplete(
        llmProvider,
        mistralApiKey,
        model,
        [
          { role: "system", content: soul(souls, lead.id) },
          {
            role: "user",
            content: `Vision globale de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nEn tant que **${lead.label}**, rédige des **consignes exigeantes** pour **${sub.label}** : objectifs, périmètre, angles d’analyse **obligatoires**, livrables (sous-parties attendues), contraintes, critères de qualité, questions ouvertes à traiter. **22–36 lignes** utiles — tu veux un rapport **long et argumenté** de sa part.`,
          },
        ],
        signal,
        TEMP,
      );

      if (llmProvider === "mistral") {
        await sleepMs(MISTRAL_MISSION_LEAD_TO_SUB_MS, signal);
      }

      prog(`${sub.label} — travail spécialisé…`);
      const subWork = await missionComplete(
        llmProvider,
        mistralApiKey,
        model,
        [
          { role: "system", content: soul(souls, sub.id) },
          {
            role: "user",
            content: `Consignes de **${lead.label}** :\n\n${delegation}\n\n---\nContexte et fichiers initiaux (rappel) :\n\n${slicePayloadForModel(payload)}\n\n---\nTu es **${sub.label}**. Tu dois produire une **analyse de référence** sur ton périmètre : ce texte alimentera directement le rapport final — **ne te limite pas** à une synthèse courte.\n\n- **Minimum 6 sous-sections \`###\`** (thèmes distincts).\n- Chaque \`###\` : plusieurs paragraphes **et/ou** listes détaillées (risques, options, recommandations, exemples, critères mesurables).\n- Inclure une sous-section **### Angles et questions non couverts par le premier jet utilisateur** : au moins **6–10 questions** ou hypothèses à creuser pour un cahier des charges complet (ce que le porteur de projet pourrait avoir oublié).\n- Vise **l’équivalent d’environ 60–100 lignes** de contenu utile ; si le sujet l’exige, **dépasse** ce volume.\n- T’appuyer explicitement sur le **contexte et les fichiers** (citations courtes, renvois).\n\n**Interdit** : lignes du type \`[liste des …]\`, \`[à compléter]\`, \`[nom]\` ou tout contenu utile uniquement entre crochets — chaque puce et paragraphe doit être **rédigé**.\n\nPas de méta sur les « agents ».`,
          },
        ],
        signal,
        TEMP,
      );

      subBlocks.push(`### ${sub.label}\n\n${subWork}`);
    }

    const combined = subBlocks.join("\n\n---\n\n");

    const subNameList = subs.map((s) => s.label).join(", ");
    prog(`${lead.label} — intégration des apports du pôle (reprise du détail)…`);
    const synthesis = await missionComplete(
      llmProvider,
      mistralApiKey,
      model,
      [
        { role: "system", content: soul(souls, lead.id) },
        {
          role: "user",
          content: `Tu es **${lead.label}**, responsable du pôle. Voici le travail **complet** de tes sous-agents (c’est la matière première du dossier final) :\n\n${combined}\n\n---\n\n## Ta mission (critique)\n\n**Interdit** : produire une « synthèse » courte qui réécrit tout en plus petit. Le rédacteur final doit pouvoir **s’appuyer sur ton texte** sans perdre le détail des spécialistes.\n\n**Interdit** : titres avec crochets du type \`#### [nom]\` — utilise les **vrais noms** : ${subNameList}.\n\n**Obligation** : ton livrable doit être **long et dense** — vise **au minimum** une longueur proche du **texte cumulé** des sous-agents (tu peux dépasser avec ton arbitrage), et **jamais** en dessous d’**environ 60 %** de ce volume en supprimant des arguments.\n\nStructure **obligatoire** en Markdown :\n\n### Arbitrage du responsable (court)\n**10–18 lignes maximum** : tensions entre sous-agents, priorités, décisions tranchées, ce que tu retiens ou écarts — **sans** résumer leur contenu ici.\n\n### Reprise quasi intégrale par spécialiste (corps principal)\n\nPour **chaque** sous-agent (${subNameList}), une section \`####\` dont le titre est **exactement** le nom du spécialiste (sans crochets), suivie **dans l’ord** de :\n\n1. **Reprise fidèle** : paragraphes et listes issus de son texte — **reformulation légère autorisée**, mais **conserve** les listes à puces, chiffres, exemples et nuances (**interdit** de les remplacer par une ou deux phrases).\n2. **Complément** : seulement après, 2–5 paragraphes de ton commentaire, arbitrage ou lien avec les autres si utile.\n\nSi un spécialiste a écrit long, **le bloc \`####\` correspondant doit être long** ; ne « compresse » pas en résumé.\n\nPas de méta-discussion sur le processus ou les « agents ».`,
        },
      ],
      signal,
      TEMP,
    );

    branchOutputs.push({
      leadLabel: lead.label,
      synthesis,
      subContributionsMarkdown: combined,
      specialistLabels: subs.map((s) => s.label),
    });
  }

  prog("Orchestrateur — rédaction du rapport final (dossier complet)…");
  const finalUserPrompt = buildFinalDocumentPrompt(
    orchestratorBrief,
    branchOutputs,
  );

  const readme = await missionComplete(
    llmProvider,
    mistralApiKey,
    model,
    [
      {
        role: "system",
        content: soul(souls, ORCHESTRATOR_ID) + ORCHESTRATOR_FINAL_SYSTEM_APPEND,
      },
      {
        role: "user",
        content: finalUserPrompt,
      },
    ],
    signal,
    TEMP_FINAL,
  );

  onProgress("Terminé — document prêt ci-dessous.");
  return readme;
}
