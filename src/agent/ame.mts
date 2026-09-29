// Écrire l'âme d'un membre à sa place.
//
// Un organigramme se remplit vite ; les sept paragraphes qui disent qui est chacun,
// beaucoup moins. Ce petit appel isolé — un tour, aucun outil, rien qui touche au
// disque — propose un texte que l'utilisateur relit et corrige. Il n'a rien à voir avec la
// session de mission : ni contexte, ni équipe, ni livrable.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { ORCHESTRATEUR, enfantsDe, membre } from '../espace/equipe.mjs'
import { tracer, messageDe } from '../espace/journal.mjs'
import type { Membre } from '../contrat.mjs'

const SYSTEME = `Tu écris la fiche d'un membre d'une équipe virtuelle, telle qu'elle sera donnée au modèle
qui jouera ce rôle. Elle tient en trois paragraphes courts, en français, au tutoiement :

1. « Tu es <le rôle>. » — une phrase.
2. « Rôle : … » — ce dont il répond, ce qu'il produit, sur quoi il cadre les autres. Deux à
   quatre phrases concrètes.
3. « Âme : … » — sa manière de travailler, ses réflexes, ce sur quoi il ne cède pas. Une à
   deux phrases.

Tu écris le texte, rien d'autre : pas de titre, pas de puces, pas de guillemets autour,
pas de commentaire avant ou après. Pas de superlatif creux (« expert de renommée »), pas de
promesse marketing. Ce qui compte, c'est ce que ce membre regarde que personne d'autre ne
regarde dans cette équipe-là.`

/** Propose une âme pour un membre. */
export async function proposerAme({ id, label, membres, model = 'claude-sonnet-5' }: {
  id: string
  label: string
  membres: Membre[]
  model?: string
}): Promise<string> {
  const m = membre(id, membres)
  const nom = String(label || m?.label || '').trim()
  if (!nom) throw new Error('Ce membre n\'a pas encore de nom.')

  const orchestrateur = membre(ORCHESTRATEUR, membres)
  const parent = m?.parentId ? membre(m.parentId, membres) : null
  const enfants = m ? enfantsDe(m.id, membres) : []
  const voisins = parent ? enfantsDe(parent.id, membres).filter((x) => x.id !== m?.id) : []

  const contexte = [
    `Équipe pilotée par « ${orchestrateur?.label || 'Orchestrateur'} ».`,
    parent && parent.id !== ORCHESTRATEUR
      ? `Ce membre est rattaché au pôle « ${parent.label} ».`
      : 'Ce membre est un pôle, rattaché directement à l\'orchestrateur.',
    voisins.length ? `À ses côtés : ${voisins.map((v) => v.label).join(', ')}.` : null,
    enfants.length ? `Il encadre : ${enfants.map((e) => e.label).join(', ')}.` : null,
    'L\'équipe produit des livrables Markdown : notes, documents de travail, dossiers.',
  ].filter(Boolean).join('\n')

  const prompt = `${contexte}\n\nÉcris la fiche du membre suivant : **${nom}**.`

  let texte = ''
  const q = query({
    prompt,
    options: {
      model,
      systemPrompt: SYSTEME,
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      maxTurns: 1,
      permissionMode: 'default',
      canUseTool: async () => ({ behavior: 'deny' as const, message: 'Pas d\'outil pour écrire une fiche.' }),
    },
  })
  try {
    for await (const msg of q) {
      if (msg.type === 'assistant') {
        for (const bloc of msg.message?.content || []) {
          if (bloc.type === 'text') texte += bloc.text
        }
      }
      if (msg.type === 'result') break
    }
  } catch (err) {
    tracer('âme — échec', messageDe(err).slice(0, 300))
    throw new Error(`Impossible d'écrire la fiche : ${messageDe(err)}`)
  }

  const propre = texte
    .replace(/^```[a-z]*\n?|```$/g, '')
    .trim()
  if (!propre) throw new Error('Le modèle n\'a rien renvoyé.')
  return propre.slice(0, 4000)
}
