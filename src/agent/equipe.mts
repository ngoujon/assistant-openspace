// L'organigramme devient une équipe de sous-agents.
//
// Chaque membre de l'arbre (tout le monde sauf l'orchestrateur, qui est la session
// principale) est déclaré au SDK comme un sous-agent : son « âme » devient son
// prompt système, son rang décide de ce qu'on attend de lui. C'est le cœur de
// l'application — le reste n'est que tuyauterie autour de ce passage-là.
//
// Deux rangs, deux métiers :
//   • un **spécialiste** défriche son sujet et rend une matière dense ;
//   • un **pôle** (directeur) intervient APRÈS ses spécialistes, avec tous leurs
//     textes sous les yeux : il recoupe, arbitre, complète — sans compresser.
//
// Personne d'autre que l'orchestrateur n'écrit le livrable : les outils OpenSpace
// leur sont retirés. Un pôle qui publierait son coin de document ferait exactement
// ce que cette application cherche à éviter — un rapport en silos.
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk'
import { ORCHESTRATEUR, enfantsDe, profondeur } from '../espace/equipe.mjs'
import type { Ampleur, Membre } from '../contrat.mjs'

interface Gabarit {
  livrable: string
  membre: string
  note: string
}

export const AMPLEURS: Record<Ampleur, Gabarit> = {
  note: { livrable: '900 à 1 500 mots', membre: '250 à 400 mots', note: 'Une note : l\'essentiel, décidé, sans développement.' },
  document: { livrable: '2 500 à 4 000 mots', membre: '500 à 900 mots', note: 'Un document de travail : chaque volet du sujet a sa section.' },
  dossier: { livrable: '6 000 à 9 000 mots', membre: '900 à 1 600 mots', note: 'Un dossier : contexte, options, chiffres, risques, plan.' },
}

/** Outils laissés à l'équipe : de quoi se renseigner, rien pour publier. */
const OUTILS_MEMBRE = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite']

const CONSIGNES_COMMUNES = (a: Gabarit, langue: string) => `

# Ce qu'on attend de toi, ici

Tu travailles pour une équipe : ce que tu rends n'est pas une réponse à un utilisateur,
c'est **de la matière** que l'orchestrateur assemblera dans un livrable unique.

- Rends **${a.membre}** de Markdown structuré (des \`##\`, des puces, des tableaux quand il y a
  des chiffres ou une comparaison). Pas de préambule, pas de « voici », pas de formule de politesse.
- Écris en **${langue}**, au présent, au ton direct. Chaque phrase apporte une information.
- Tu **tranches** : quand une hypothèse manque, tu prends la plus raisonnable et tu l'annonces
  en gras plutôt que de poser une question qui bloquerait toute la chaîne.
- Tu distingues ce que tu **sais** de ce que tu **supposes**. Si tu as vérifié quelque chose
  (page lue, fichier ouvert), tu le dis et tu donnes la source.
- Tu finis par \`## Points ouverts\` : ce qui manque, ce qui reste à décider, ce qui dépend
  d'un autre pôle. Cette section n'est jamais vide et elle n'est pas décorative.
- Si le brief te donne des **chemins de fichiers** ou des **adresses**, ce sont les sources de
  l'utilisateur : tu les ouvres (\`Read\`, \`WebFetch\`) avant d'écrire, et tu dis ce que tu en tires.
- Tu ne rédiges **jamais** le document final et tu ne parles pas à la place des autres pôles.`

const CONSIGNES_POLE = (enfants: Membre[]) => `

# Ton tour vient après le leur

Tu diriges ${enfants.length > 1 ? 'les spécialistes suivants' : 'le spécialiste suivant'} : ${enfants.map((e) => e.label).join(', ')}.
L'orchestrateur te transmet **leurs textes entiers**. Ton travail est une **deuxième passe** :

1. **Recouper** — ce que deux d'entre eux disent différemment de la même chose, tu le tranches
   et tu dis pourquoi.
2. **Combler** — ce que personne n'a couvert dans ton périmètre, tu l'écris toi-même.
3. **Ordonner** — tu rends un texte unique pour ton pôle, pas une compilation d'annexes.

Tu **ne réduis pas** : tu intègres. Un détail utile qu'un spécialiste a trouvé doit se
retrouver dans ce que tu rends. Si tu supprimes quelque chose, c'est que c'est faux ou
redondant, et tu le signales en fin de texte.`

/** La première ligne utile d'une âme : ce qui décrit le mieux à quoi sert ce membre. */
function accroche(ame: string, label: string): string {
  const ligne = String(ame || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^tu es\b/i.test(l))
  return (ligne || label).replace(/^(Rôle|Âme)\s*:\s*/i, '').slice(0, 220)
}

/**
 * Les définitions de sous-agents à passer à `query()`.
 * @param membres l'organigramme
 */
export function definitionsAgents(
  membres: Membre[],
  { ampleur = 'document', langue = 'français', modele }: { ampleur?: string, langue?: string, modele?: string } = {},
): Record<string, AgentDefinition> {
  const a = AMPLEURS[ampleur as Ampleur] || AMPLEURS.document
  const out: Record<string, AgentDefinition> = {}
  for (const m of membres) {
    if (m.id === ORCHESTRATEUR) continue
    const enfants = enfantsDe(m.id, membres)
    const pole = profondeur(m.id, membres) === 1
    const ame = (m.ame || '').trim() || `Tu es « ${m.label} », membre de l'équipe.`
    out[m.id] = {
      description: pole
        ? `${m.label} — pôle. À convoquer APRÈS ses spécialistes (${enfants.map((e) => e.label).join(', ') || 'aucun'}) pour intégrer leur travail. ${accroche(m.ame, m.label)}`
        : `${m.label} — spécialiste. ${accroche(m.ame, m.label)}`,
      prompt: `${ame}${pole && enfants.length ? CONSIGNES_POLE(enfants) : ''}${CONSIGNES_COMMUNES(a, langue)}`,
      tools: OUTILS_MEMBRE,
      // Publier est le métier de l'orchestrateur, et de lui seul.
      disallowedTools: ['mcp__openspace'],
      ...(modele && modele !== 'inherit' ? { model: modele } : { model: 'inherit' }),
    }
  }
  return out
}

/** L'organigramme en texte, pour le prompt de l'orchestrateur. */
export function organigrammeTexte(membres: Membre[]): string {
  const lignes: string[] = []
  for (const p of enfantsDe(ORCHESTRATEUR, membres)) {
    const enfants = enfantsDe(p.id, membres)
    lignes.push(`- **${p.label}** — pôle, sous-agent \`${p.id}\``)
    for (const e of enfants) lignes.push(`  - ${e.label} — spécialiste, sous-agent \`${e.id}\``)
    if (!enfants.length) lignes.push('  - _(aucun spécialiste : ce pôle travaille seul)_')
  }
  return lignes.join('\n') || '_(équipe vide : seul l\'orchestrateur travaille)_'
}

/** L'ordre de passage imposé : chaque pôle, ses spécialistes d'abord. */
export function ordreDePassage(membres: Membre[]): { pole: string, label: string, specialistes: { id: string, label: string }[] }[] {
  return enfantsDe(ORCHESTRATEUR, membres).map((p) => ({
    pole: p.id,
    label: p.label,
    specialistes: enfantsDe(p.id, membres).map((e) => ({ id: e.id, label: e.label })),
  }))
}
