import { clampMistralTemperature } from "@/lib/appSettingsStorage";
import { generateMissionConversationTitle } from "@/lib/discussionTeamChat";
import { completeLlmChat, streamLlmChat } from "@/lib/llmChat";
import {
  LLM_AGENT_OUTPUT_BUDGET_FR,
  LLM_MAX_TOKENS_AGENT_STEP,
  LLM_MAX_TOKENS_DOCUMENT,
} from "@/lib/llmOutputLimits";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import type { OllamaChatMessage } from "@/lib/ollama";
import type { LlmProvider } from "@/lib/llmProvider";
import { ORCHESTRATOR_ID, type TreeMember } from "@/lib/teamTreeStorage";
import type { MissionAgentJournalEntry } from "@/types";

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
  /** Température Mistral (0–1) pour toute la mission ; ignoré si Ollama. */
  mistralTemperature?: number;
  /** Journal des sorties intermédiaires par membre. */
  onAgentJournal?: (entry: MissionAgentJournalEntry) => void;
  /**
   * Si fourni, le rapport final (l'étape la plus longue — jusqu'à
   * `LLM_MAX_TOKENS_DOCUMENT` tokens) est **streamé** token par token au lieu
   * d'un appel bloquant : retour visuel pendant la génération plutôt qu'une
   * attente silencieuse. Les étapes intermédiaires restent non-stream.
   */
  onFinalReportToken?: (chunk: string) => void;
  /** Reprise après échec : réutilise le brief et les branches déjà terminées. */
  resumeFrom?: MissionResumeState;
  /** Appelé dès que le brief orchestrateur est disponible (repris ou frais). */
  onOrchestratorBrief?: (brief: string) => void;
  /** Appelé à chaque pilier terminé (repris ou frais) — pour permettre une reprise ultérieure. */
  onBranchComplete?: (leadId: string, output: BranchOutput) => void;
}

function soul(souls: Record<string, string>, id: string): string {
  return (
    souls[id]?.trim() ||
    "Tu es un assistant expert. Réponds en français, de façon structurée."
  );
}

export function bundleUserPayload(context: string, files: MissionFile[]): string {
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
Tu rédiges un **rapport synthétique mais exploitable** à partir des blocs fournis dans le message suivant : **priorité à la densité** (faits, listes, arbitrages) plutôt qu’au volume — le budget de sortie est **plafonné** côté technique.
**Interdit** : squelette avec crochets du type \`[nom du projet]\`, \`[liste des …]\`, \`[à compléter]\`, \`[contexte]\`, ou toute ligne où le contenu utile serait **entre crochets** comme placeholder.
**Interdit** : préambule du type « Voici le document » puis un bloc de code ; commence directement par \`# Titre\`.
Chaque section doit contenir du **texte réel** (paragraphes, listes à puces avec éléments rédigés) issu des analyses fournies, pas un plan à trous.`;

/**
 * Rappel contexte/fichiers par étape (augmenter si le modèle le supporte).
 * Exporté pour que l'UI (`MissionWorkspace`) puisse avertir avant l'envoi
 * si le contexte + fichiers dépasse cette limite et sera tronqué.
 */
export const MAX_PAYLOAD_SLICE = 24_000;

/** Délai max par requête mission (Ollama peut être très lent ; au-delà = message clair). */
const MISSION_CHAT_TIMEOUT_MS = 40 * 60 * 1000;

const MISSION_KEEP_ALIVE = "45m";

function missionConcurrencyLimit(): number {
  const raw = import.meta.env.VITE_OPENSPACE_MISSION_CONCURRENCY;
  const n = raw ? Number.parseInt(String(raw), 10) : 3;
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(6, Math.max(1, n));
}

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
  maxTokens: number,
): Promise<string> {
  // L'espacement entre appels Mistral est géré de façon centralisée par
  // `mistralGateway` (voir src/lib/mistralGateway.ts) — plus de pause locale
  // ici, elle ferait double emploi avec le guichet.
  return completeLlmChat(llmProvider, mistralApiKey, model, messages, signal, {
    temperature,
    maxTokens,
    ...(llmProvider === "ollama"
      ? { keepAlive: MISSION_KEEP_ALIVE }
      : {}),
    timeoutMs: MISSION_CHAT_TIMEOUT_MS,
  });
}

export interface BranchOutput {
  leadLabel: string;
  /** Synthèse directeur (niveau pôle). */
  synthesis: string;
  /** Travail brut des sous-agents, pour intégration au README (évite de tout perdre à la compression). */
  subContributionsMarkdown?: string;
  /** Noms des spécialistes sous ce pôle (prompt final). */
  specialistLabels?: string[];
}

/**
 * État réutilisable après un échec de mission (429 persistant, réseau,
 * annulation…) : évite de repayer les étapes déjà réussies au relancement.
 */
export interface MissionResumeState {
  orchestratorBrief: string;
  /** Sorties de branche déjà obtenues, par id de pilier (lead.id). */
  completedBranches: Record<string, BranchOutput>;
}

/** Nombre d'appels modèle qu'une branche (pilier + sous-agents) représente. */
function leadCallCount(leadId: string, teamMembers: TreeMember[]): number {
  const subs = childrenOf(leadId, teamMembers);
  return subs.length === 0 ? 1 : subs.length * 2 + 1;
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

## 1) Matière brute — retours des membres (source à intégrer)

**Synthétise** sans vider le sens : paragraphes courts, listes à puces **avec éléments rédigés**, chiffres et exemples quand ils figurent dans la source.

Contributeurs concernés :
${contributorLines}

---

${specialistBlock}

---

## 2) Intégrations « directeur de pôle » (arbitrages)

${poleSyntheses}

---

## Consignes de rédaction du rapport final

Tu produis un **rapport condensé** (équivalent **quelques pages** au plus une fois rendu), **dense** et **actionnable** : priorité aux décisions, risques, recommandations et liens transverses — **pas** une recopie exhaustive de tout le détail (celui-ci reste dans les étapes intermédiaires déjà produites).

### Interdictions absolues

- **Aucun** placeholder entre crochets : pas de \`[nom du projet]\`, \`[liste des …]\`, \`[contexte]\`, \`[à compléter]\`, \`[description …]\`, etc.
- Pas de **squelette** vide : pas de titre suivi uniquement de puces génériques.
- Pas de préambule « Voici le document », pas d’enveloppe \`\`\`markdown\`\`\` autour du tout : commence par \`# Titre du rapport\` (titre réel).

### Obligations

- Sous chaque grand titre : **texte rédigé** ; listes avec puces **informatives** (pas de tirets placeholders).
- **Analyses par domaine** : pour chaque pôle, un \`###\` avec l’essentiel ; pour chaque spécialiste listé, un \`####\` avec **le nom réel** + **paragraphes courts** captant les points forts de son texte (pas une reprise intégrale).
- **Interdit** : section \`## Annexes\` ou « fiches contributeurs » en doublon — tout tient dans le corps.

Structure type (adapte, **remplis** chaque partie utilement) :

- \`#\` Titre du rapport (concret)
- \`## Contexte et problématique\`
- \`## Analyses par domaine\` puis \`###\` par pôle puis \`####\` par spécialiste si pertinent
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
    mistralTemperature: mistralTempOpt,
    onAgentJournal,
    onFinalReportToken,
    resumeFrom,
    onOrchestratorBrief,
    onBranchComplete,
  } = opts;
  const mistralTemp = clampMistralTemperature(mistralTempOpt);
  const agentStepTemp = llmProvider === "mistral" ? mistralTemp : TEMP;
  const finalStepTemp = llmProvider === "mistral" ? mistralTemp : TEMP_FINAL;
  const payload = bundleUserPayload(context, files);
  const leads = leadsOf(teamMembers);
  const concurrency = missionConcurrencyLimit();

  const journal = (memberLabel: string, stepLabel: string, content: string) => {
    onAgentJournal?.({
      memberLabel,
      stepLabel,
      content,
      createdAt: Date.now(),
    });
  };

  if (leads.length === 0) {
    throw new Error(
      "Aucun membre sous l’orchestrateur. Ajoute au moins un pilier dans la colonne Organisation.",
    );
  }

  const resumedBranches = resumeFrom?.completedBranches ?? {};
  const resumedCallCount =
    (resumeFrom?.orchestratorBrief ? 1 : 0) +
    Object.keys(resumedBranches).reduce(
      (sum, leadId) => sum + leadCallCount(leadId, teamMembers),
      0,
    );
  const totalSteps = Math.max(
    1,
    countMissionModelCalls(teamMembers) - resumedCallCount,
  );
  let stepIndex = 0;
  const prog = (label: string) => {
    stepIndex += 1;
    onProgress(`Étape ${stepIndex} / ${totalSteps} — ${label}`);
  };

  const poleHeaders = leads
    .map((l) => `## Pôle ${l.label}`)
    .join("\n");

  const payloadSlice = slicePayloadForModel(payload);
  let orchestratorBrief: string;
  if (resumeFrom?.orchestratorBrief) {
    orchestratorBrief = resumeFrom.orchestratorBrief;
    onProgress("Reprise — brief orchestrateur déjà disponible.");
  } else {
    prog("Orchestrateur — analyse du contexte et des fichiers…");
    orchestratorBrief = await missionComplete(
      llmProvider,
      mistralApiKey,
      model,
      [
        { role: "system", content: soul(souls, ORCHESTRATOR_ID) },
        {
          role: "user",
          content: `${payloadSlice}\n\n---\nTâche : en tant qu’**orchestrateur**, pose un **cadre** pour l’équipe — **sans** réaliser toi toute l’analyse à leur place.\n\n1) **## Synthèse globale** : **6–10 lignes maximum** — enjeux, périmètre, risques transverses, hypothèses. Indique **2–3 angles** que l’utilisateur n’a probablement **pas** explicités (risques oubliés, dépendances).\n\n2) Pour **chaque pôle** ci-dessous, un brief **## Pôle …** de **4–8 lignes** : questions à trancher, livrables attendus, liens entre pôles — style **briefing**. **Une** piste « hors prompt initial » par pôle.\n\nEn-têtes obligatoires :\n\n## Synthèse globale\n${poleHeaders}\n\n---\n\n${LLM_AGENT_OUTPUT_BUDGET_FR}`,
        },
      ],
      signal,
      agentStepTemp,
      LLM_MAX_TOKENS_AGENT_STEP,
    );
    journal("Orchestrateur", "Brief global", orchestratorBrief);
  }
  onOrchestratorBrief?.(orchestratorBrief);

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
        mistralTemperature: mistralTemp,
      });
      if (title) onConversationTitleSuggested(title);
    } catch {
      /* titre optionnel : ne pas interrompre la mission */
    }
  }

  const branchOutputs = await mapWithConcurrency(
    leads,
    concurrency,
    async (lead) => {
      const resumed = resumedBranches[lead.id];
      if (resumed) {
        onProgress(`Reprise — ${lead.label} déjà terminé.`);
        onBranchComplete?.(lead.id, resumed);
        return resumed;
      }

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
              content: `Vision de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nContexte et fichiers (rappel) :\n\n${slicePayloadForModel(payload)}\n\n---\nTu es **${lead.label}**, seul sur ce pôle. **Analyse utile** (pas un simple résumé de l’orchestrateur).\n\n- **3 à 5 sous-sections \`###\`** sur des angles distincts.\n- Chaque \`###\` : paragraphes courts **et/ou** listes à puces **rédigées** (risques, options, recommandations).\n- Une sous-section **### Angles hors premier jet utilisateur** : 3–6 questions ou risques peu couverts par le message initial.\n- T’appuie sur le **contexte et fichiers** quand c’est pertinent.\n\n**Interdit** : placeholders \`[…]\` — tout est rédigé.\n\n---\n\n${LLM_AGENT_OUTPUT_BUDGET_FR}`,
            },
          ],
          signal,
          agentStepTemp,
          LLM_MAX_TOKENS_AGENT_STEP,
        );
        journal(lead.label, "Analyse directe", synthesis);
        const branchOutput: BranchOutput = {
          leadLabel: lead.label,
          synthesis,
          specialistLabels: [] as string[],
        };
        onBranchComplete?.(lead.id, branchOutput);
        return branchOutput;
      }

      const subResults = await mapWithConcurrency(
        subs,
        concurrency,
        async (sub) => {
          prog(`${lead.label} → ${sub.label} — consignes au sous-agent…`);
          const delegation = await missionComplete(
            llmProvider,
            mistralApiKey,
            model,
            [
              { role: "system", content: soul(souls, lead.id) },
              {
                role: "user",
                content: `Vision globale de l’orchestrateur :\n\n${orchestratorBrief}\n\n---\nEn tant que **${lead.label}**, rédige des **consignes claires** pour **${sub.label}** : objectifs, périmètre, angles **obligatoires**, livrables attendus (sous-parties), contraintes, critères de qualité, questions ouvertes. **12–18 lignes** utiles maximum, style briefing.\n\n---\n\n${LLM_AGENT_OUTPUT_BUDGET_FR}`,
              },
            ],
            signal,
            agentStepTemp,
            LLM_MAX_TOKENS_AGENT_STEP,
          );
          journal(lead.label, `Consignes → ${sub.label}`, delegation);

          prog(`${sub.label} — travail spécialisé…`);
          const subWork = await missionComplete(
            llmProvider,
            mistralApiKey,
            model,
            [
              { role: "system", content: soul(souls, sub.id) },
              {
                role: "user",
                content: `Consignes de **${lead.label}** :\n\n${delegation}\n\n---\nContexte et fichiers initiaux (rappel) :\n\n${slicePayloadForModel(payload)}\n\n---\nTu es **${sub.label}**. Produis une **analyse structurée** sur ton périmètre (matière pour le rapport final).\n\n- **4 à 6 sous-sections \`###\`** (thèmes distincts).\n- Chaque \`###\` : paragraphes courts et/ou listes **réelles** (risques, options, recommandations, critères).\n- **### Angles et questions hors premier jet utilisateur** : 4–8 questions ou hypothèses à creuser.\n- T’appuie sur le **contexte et les fichiers** (citations courtes).\n\n**Interdit** : placeholders entre crochets.\n\n---\n\n${LLM_AGENT_OUTPUT_BUDGET_FR}`,
              },
            ],
            signal,
            agentStepTemp,
            LLM_MAX_TOKENS_AGENT_STEP,
          );
          journal(sub.label, "Travail spécialisé", subWork);
          return { sub, subWork };
        },
        signal,
      );

      const subBlocks = subResults.map(
        ({ sub, subWork }) => `### ${sub.label}\n\n${subWork}`,
      );
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
            content: `Tu es **${lead.label}**, responsable du pôle. Voici le travail de tes sous-agents :\n\n${combined}\n\n---\n\n## Ta mission\n\n**Synchronise** leurs apports (cohérence, doublons, trous) et **arbitre** en **restant dense** : le détail brut reste dans les sections ci-dessus ; ici tu produis une **vue pôle** exploitable pour le rapport final.\n\n**Interdit** : titres \`#### [nom]\` — utilise les **vrais noms** : ${subNameList}.\n\nStructure **obligatoire** en Markdown :\n\n### Arbitrage du responsable\n**6–10 lignes maximum** : tensions, priorités, décisions — pas de répétition exhaustive des textes des sous-agents.\n\n### Synthèse par spécialiste\n\nPour **chaque** sous-agent (${subNameList}), un \`####\` titre = nom exact, puis **paragraphes courts** qui captent l’**essentiel** (faits, listes clés) + **2–4 phrases** d’arbitrage ou de lien avec les autres.\n\n---\n\n${LLM_AGENT_OUTPUT_BUDGET_FR}`,
          },
        ],
        signal,
        agentStepTemp,
        LLM_MAX_TOKENS_AGENT_STEP,
      );
      journal(lead.label, "Synthèse du pôle", synthesis);

      const branchOutput: BranchOutput = {
        leadLabel: lead.label,
        synthesis,
        subContributionsMarkdown: combined,
        specialistLabels: subs.map((s) => s.label),
      };
      onBranchComplete?.(lead.id, branchOutput);
      return branchOutput;
    },
    signal,
  );

  prog("Orchestrateur — rédaction du rapport final (dossier complet)…");
  const finalUserPrompt = buildFinalDocumentPrompt(
    orchestratorBrief,
    branchOutputs,
  );

  const finalMessages: OllamaChatMessage[] = [
    {
      role: "system",
      content: soul(souls, ORCHESTRATOR_ID) + ORCHESTRATOR_FINAL_SYSTEM_APPEND,
    },
    {
      role: "user",
      content: finalUserPrompt,
    },
  ];

  let readme: string;
  if (onFinalReportToken) {
    let accum = "";
    await streamLlmChat(
      llmProvider,
      mistralApiKey,
      model,
      finalMessages,
      (chunk) => {
        accum += chunk;
        onFinalReportToken(chunk);
      },
      signal,
      { temperature: finalStepTemp, maxTokens: LLM_MAX_TOKENS_DOCUMENT },
    );
    readme = accum;
  } else {
    readme = await missionComplete(
      llmProvider,
      mistralApiKey,
      model,
      finalMessages,
      signal,
      finalStepTemp,
      LLM_MAX_TOKENS_DOCUMENT,
    );
  }

  journal("Orchestrateur", "Rapport final", readme);

  onProgress("Terminé — document prêt ci-dessous.");
  return readme;
}
