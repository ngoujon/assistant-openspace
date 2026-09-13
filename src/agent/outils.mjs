// Les outils que l'orchestrateur a sous la main : un serveur MCP interne au processus.
//
// L'application ne fait qu'une chose — faire produire à une équipe un livrable
// Markdown qui tient debout — et ces outils tracent le seul chemin qui y mène :
// l'équipe travaille (outil `Agent`, hors d'ici), puis l'orchestrateur publie. Aucun
// membre n'a accès à ce serveur : publier est le métier de l'orchestrateur, et de
// lui seul.
import { z } from 'zod'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import {
  ecrireLivrable, listerLivrables, lireLivrable, supprimerLivrable, nomFichier,
  versionsLivrable, lireVersion, restaurerVersion,
} from '../espace/livrables.mjs'
import { chargerEquipe, arbre, ORCHESTRATEUR, enfantsDe } from '../espace/equipe.mjs'
import { P } from '../espace/paths.mjs'

const texte = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] })
const erreur = (m) => ({ content: [{ type: 'text', text: `ERREUR : ${m}` }], isError: true })

class Refus extends Error {}

/** Enveloppe commune : une panne revient au modèle en clair, jamais en exception. */
const sur = (fn) => async (args, extra) => {
  try {
    return texte(await fn(args, extra))
  } catch (err) {
    if (err instanceof Refus) return texte({ execute: false, refuse: true, message: err.message })
    return erreur(err?.message || String(err))
  }
}

export function serveurOpenspace(contexte = {}) {
  const confirmer = contexte.confirmer || (async () => true)
  const signaler = contexte.signaler || (() => {})
  const ouvrir = contexte.ouvrir || (() => {})
  // Supprimer envoie à la corbeille : puisque l'orchestrateur décide seul, ce qu'il
  // décide doit rester rattrapable.
  const corbeille = contexte.corbeille || (async () => false)
  const titrer = contexte.titrer || (() => {})
  const modele = contexte.modele || (() => null)
  const effort = contexte.effort || (() => null)
  /** Qui a réellement travaillé sur cette mission — mesuré, pas déclaré. */
  const contributeurs = contexte.contributeurs || (() => [])

  async function valider(demande) {
    const ok = await confirmer(demande)
    if (!ok) throw new Refus(demande.refus || "Refusé par l'utilisateur — rien n'a été fait.")
  }

  const equipe = [
    tool(
      'equipe',
      "L'organigramme complet, avec l'âme et le rôle de chaque membre. Utile pour choisir qui " +
      "convoquer sur une question précise, et pour écrire un brief qui parle à ce membre-là. " +
      "L'identifiant de chaque membre est le `subagent_type` à passer à l'outil Agent.",
      {},
      sur(async () => {
        const membres = chargerEquipe()
        return {
          orchestrateur: membres.find((m) => m.id === ORCHESTRATEUR)?.label || 'Orchestrateur',
          poles: enfantsDe(ORCHESTRATEUR, membres).map((p) => ({
            id: p.id,
            label: p.label,
            ame: p.ame || null,
            specialistes: enfantsDe(p.id, membres).map((e) => ({ id: e.id, label: e.label, ame: e.ame || null })),
          })),
          arbre: arbre(membres),
          note: 'Un pôle se convoque APRÈS ses spécialistes, avec leurs textes entiers dans le brief.',
        }
      }),
    ),

    tool(
      'titrer_mission',
      'Donne un titre à la mission en cours, pour la retrouver dans la liste. Appelle-le dès que ' +
      'tu as compris la demande, avant de convoquer qui que ce soit. Trois à sept mots qui disent ' +
      "le sujet, pas la formulation de l'utilisateur : « Refonte du site vitrine », pas « Fais-moi un " +
      'rapport ». Sans point final.',
      { titre: z.string().describe('trois à sept mots') },
      sur(async ({ titre }) => {
        const propre = String(titre).replace(/\s+/g, ' ').trim().replace(/[.。]$/, '').slice(0, 90)
        if (!propre) throw new Error('Titre vide.')
        titrer(propre)
        return { titre: propre }
      }),
    ),
  ]

  const livrables = [
    tool(
      'rediger_livrable',
      "Enregistre le livrable Markdown dans le dossier de l'utilisateur. Le sommaire et le bloc « À " +
      "propos » (version, dates, équipe mobilisée) sont composés automatiquement — ne les écris pas.\n\n" +
      "Rappeler cet outil sur un livrable existant (même `nom`) en publie une NOUVELLE VERSION : " +
      "l'ancienne est archivée, rien n'est perdu, et l'utilisateur n'a rien à valider. C'est ainsi qu'on " +
      'retouche — tu passes le texte complet à chaque fois, jamais un extrait ni un diff.',
      {
        titre: z.string().describe('titre du livrable, tel qu\'il apparaîtra en tête'),
        markdown: z.string().describe('le corps ENTIER du document, en Markdown, sans sommaire ni bloc « À propos »'),
        mission: z.string().optional().describe('la demande de l'utilisateur, en une phrase'),
        nom: z.string().optional().describe('nom de fichier d\'un livrable existant pour en publier une nouvelle version ; sinon composé depuis le titre et la date'),
      },
      sur(async ({ titre, markdown, mission, nom }) => {
        const cible = nom || nomFichier(titre)
        const info = ecrireLivrable({
          titre, mission, markdown, nom: cible, equipe: contributeurs(),
          modele: modele(), effort: effort(),
        })
        signaler({ k: 'livrable', livrable: info })
        // On n'ouvre jamais le fichier de soi-même : l'utilisateur le lit quand il décide
        // de le lire, depuis la colonne des livrables.
        return {
          ...info,
          note: info.remplace
            ? `Version ${info.version} publiée ; la version ${info.version - 1} reste consultable. Dis à l'utilisateur ce qui a changé, en quelques lignes — ne recopie pas le document dans la discussion.`
            : "Livrable enregistré. Annonce-le en quelques lignes — ne recopie pas le document dans la discussion.",
        }
      }),
    ),

    tool(
      'lister_livrables',
      'Les livrables déjà produits : nom de fichier, titre, mission, nombre de mots, version, dates.',
      {},
      sur(async () => ({ dossier: P.livrables(), livrables: listerLivrables() })),
    ),

    tool(
      'lire_livrable',
      "Le contenu d'un livrable, pour le retoucher, le compléter ou s'en inspirer. À appeler avant " +
      'toute republication si tu n\'as plus le texte exact en tête.',
      { nom: z.string().describe('nom de fichier, ex : « 2026-08-31-refonte-site-vitrine.md »') },
      sur(async ({ nom }) => lireLivrable(nom)),
    ),

    tool(
      'versions_livrable',
      "L'historique d'un livrable : chaque version publiée, son numéro, sa longueur et sa date.",
      { nom: z.string() },
      sur(async ({ nom }) => ({ nom, versions: versionsLivrable(nom) })),
    ),

    tool(
      'lire_version',
      "Le contenu d'une version précédente, pour comparer ou récupérer un passage supprimé.",
      { nom: z.string(), numero: z.number().describe('numéro de version, vu dans versions_livrable') },
      sur(async ({ nom, numero }) => lireVersion(nom, numero)),
    ),

    tool(
      'restaurer_version',
      'Remet une ancienne version en place. Elle devient la version courante, sous un nouveau ' +
      "numéro : l'état d'où l'on revient reste consultable.",
      { nom: z.string(), numero: z.number() },
      sur(async ({ nom, numero }) => {
        const info = restaurerVersion(nom, numero)
        signaler({ k: 'livrable', livrable: { ...info, remplace: true } })
        return info
      }),
    ),

    tool(
      'ouvrir_livrable',
      "Ouvre un livrable dans l'application Markdown de l'utilisateur. Seulement s'il le demande.",
      { nom: z.string() },
      sur(async ({ nom }) => {
        const doc = lireLivrable(nom)
        ouvrir(doc.chemin)
        return { ouvert: doc.nom }
      }),
    ),

    tool(
      'supprimer_livrable',
      'Retire un livrable du dossier. Il part à la corbeille du Mac, avec son historique.',
      { nom: z.string() },
      sur(async ({ nom }) => {
        const doc = lireLivrable(nom)
        await valider({
          outil: 'supprimer_livrable',
          entree: { nom },
          titre: `Supprimer « ${doc.titre} » ?`,
          lignes: [`${doc.nom}\n${doc.mots} mots, ${doc.versions + 1} version(s)`],
          indice: 'Le livrable et son historique partent à la corbeille.',
          danger: true,
          refus: 'Refusé : le livrable est toujours là.',
        })
        const aCorbeille = await corbeille(doc.chemin)
        if (!aCorbeille) supprimerLivrable(nom)
        return {
          supprime: doc.nom,
          corbeille: aCorbeille,
          note: aCorbeille
            ? 'Le livrable est dans la corbeille du Mac : l'utilisateur peut le récupérer.'
            : 'Le livrable a été effacé du disque.',
        }
      }),
    ),
  ]

  return createSdkMcpServer({
    name: 'openspace',
    version: '2.0.0',
    instructions:
      "Outils de l'orchestrateur d'OpenSpace. L'équipe se convoque avec l'outil Agent " +
      '(`subagent_type` = identifiant du membre, donné par `equipe`) : les spécialistes ' +
      "d'abord, leur directeur ensuite avec leurs textes entiers. `rediger_livrable` publie " +
      "le document et compose lui-même sommaire et générique ; le rappeler sur le même `nom` " +
      "crée une nouvelle version, sans rien écraser et sans rien demander. Seule la " +
      'suppression ouvre une validation.',
    tools: [...equipe, ...livrables],
  })
}
