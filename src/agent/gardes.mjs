// Garde-fous déterministes. Le prompt demande à l'orchestrateur de faire travailler
// son équipe dans l'ordre ; ces hooks PreToolUse le lui imposent. Ils refusent
// l'appel et expliquent quoi faire — le modèle corrige au lieu de publier un
// document qu'il aurait écrit tout seul.
//
// C'est ce qui sépare cette application d'un chat où l'on aurait collé un
// organigramme dans le prompt : un pôle non convoqué ne peut littéralement pas
// finir dans le générique du livrable.
import { chargerEquipe, ORCHESTRATEUR, enfantsDe, membre, profondeur } from '../espace/equipe.mjs'
import { existe, nomFichier } from '../espace/livrables.mjs'

const PREFIXE = 'mcp__openspace__'

/**
 * Un directeur doit recevoir les textes de ses spécialistes, pas un résumé. On ne
 * sait pas lire dans un brief, mais on sait le mesurer : en dessous de la moitié de
 * ce que les spécialistes ont écrit, ce n'est pas une transmission.
 */
const PART_MINIMALE = 0.45
const PLANCHER_BRIEF = 700

/**
 * Combien de fois, au maximum, on renvoie l'orchestrateur au travail dans un même
 * tour. Assez pour rattraper une mission laissée au milieu ; pas assez pour boucler
 * si quelque chose l'empêche vraiment d'avancer.
 */
const MAX_RELANCES = 4

export class GardeEquipe {
  constructor(membres) {
    this.membres = membres || chargerEquipe()
    /** id -> { label, taille, apercu } : ce que chaque membre a réellement rendu ici. */
    this.contributions = new Map()
    /** Un livrable est-il sorti depuis le début de la session ? */
    this.livrablePublie = false
    this.relances = 0
  }

  /** Nouvelle demande de l'utilisateur : le budget de relances repart à zéro. */
  nouveauTour() {
    this.relances = 0
  }

  /** Un livrable vient d'être écrit : la mission a produit quelque chose. */
  noterLivrable() {
    this.livrablePublie = true
  }

  /** L'équipe a pu changer entre deux tours : on repart de l'organigramme en place. */
  rafraichir(membres) {
    this.membres = membres || chargerEquipe()
  }

  /** Un membre vient de rendre son travail. Mesuré à la sortie de l'outil Agent. */
  noteContribution(id, texte) {
    const m = membre(id, this.membres)
    if (!m) return null
    const contenu = String(texte || '')
    const entree = {
      label: m.label,
      taille: contenu.length,
      apercu: contenu.trim().slice(0, 600),
    }
    this.contributions.set(id, entree)
    return entree
  }

  aContribue(id) {
    return this.contributions.has(id)
  }

  /** Les pôles qui n'ont pas encore rendu leur intégration. */
  polesManquants() {
    return enfantsDe(ORCHESTRATEUR, this.membres).filter((p) => !this.aContribue(p.id))
  }

  // ------------------------------------------------------------- vérifications

  #verifierAgent(i) {
    const type = String(i.subagent_type || '').trim()
    if (!type) return null
    const cible = membre(type, this.membres)
    if (!cible) {
      // Les sous-agents généralistes de Claude Code restent utilisables : on ne
      // refuse que ce qui prétend être un membre de l'équipe sans en être un.
      return null
    }
    if (cible.id === ORCHESTRATEUR) {
      return "L'orchestrateur, c'est toi : tu ne te convoques pas toi-même."
    }

    const specialistes = enfantsDe(cible.id, this.membres)
    if (profondeur(cible.id, this.membres) !== 1 || !specialistes.length) return null

    const absents = specialistes.filter((e) => !this.aContribue(e.id))
    if (absents.length) {
      return `« ${cible.label} » est un pôle : il intervient APRÈS ses spécialistes, avec leur travail sous les yeux. `
        + `Convoque d'abord ${absents.map((e) => `\`${e.id}\` (${e.label})`).join(', ')} — en parallèle, dans un seul message — `
        + 'puis rappelle-le avec leurs textes entiers dans le brief.'
    }

    const total = specialistes.reduce((n, e) => n + (this.contributions.get(e.id)?.taille || 0), 0)
    const attendu = Math.min(Math.round(total * PART_MINIMALE), 9000)
    const brief = String(i.prompt || '').length
    if (total > PLANCHER_BRIEF && brief < attendu) {
      return `Le brief de « ${cible.label} » fait ${brief} caractères alors que ses spécialistes en ont écrit ${total}. `
        + "Un directeur intègre le travail de son pôle : passe-lui **le texte entier** de chacun de ses spécialistes, "
        + 'pas ton résumé — c\'est exactement ce que ton résumé ferait perdre.'
    }
    return null
  }

  #verifierRedaction(i) {
    const markdown = String(i.markdown || '')
    if (!markdown.trim()) return 'Le livrable est vide.'

    const nouveau = !existe(i.nom || nomFichier(i.titre || ''))
    if (!nouveau) return null

    const poles = enfantsDe(ORCHESTRATEUR, this.membres)
    if (!poles.length) return null

    const manquants = this.polesManquants()
    if (manquants.length) {
      return `Ce livrable n'a pas été nourri par toute l'équipe : ${manquants.map((p) => `\`${p.id}\` (${p.label})`).join(', ')} `
        + `${manquants.length > 1 ? "n'ont" : "n'a"} rien rendu. Convoque ${manquants.length > 1 ? 'ces pôles' : 'ce pôle'} `
        + "avec l'outil Agent — leurs spécialistes d'abord — puis republie. Même un « rien à signaler » doit venir d'eux."
    }
    return null
  }

  /**
   * L'orchestrateur veut rendre la main. A-t-il le droit ?
   *
   * Une mission commencée et laissée au milieu — des pôles convoqués, aucun document —
   * ne laisse rien à l'utilisateur : c'est précisément ce que cette application doit rendre
   * impossible. Tant qu'il reste une étape évidente, on le renvoie au travail avec la
   * liste de ce qui manque. Rien ne commence ici : si personne n'a été convoqué, il
   * n'y a pas de mission en cours, et une simple discussion se termine normalement.
   *
   * @returns {null|string} la raison de le relancer, ou null pour le laisser partir
   */
  raisonDeRelancer() {
    if (this.relances >= MAX_RELANCES) return null
    if (!this.contributions.size) return null
    if (this.livrablePublie) return null

    const manquants = this.polesManquants()
    this.relances += 1
    if (!manquants.length) {
      return "Tous les pôles ont rendu et aucun livrable n'est sorti. Un travail d'équipe qui "
        + "s'arrête sans document ne laisse rien à l'utilisateur : écris-le maintenant avec "
        + '`rediger_livrable`, d\'une seule plume, à partir de ce que chaque pôle a produit.'
    }
    return `La mission n'est pas finie : ${manquants.map((p) => `\`${p.id}\` (${p.label})`).join(', ')} `
      + `${manquants.length > 1 ? "n'ont" : "n'a"} pas encore rendu. Enchaîne maintenant — les spécialistes `
      + "du pôle d'abord, puis son directeur avec leurs textes entiers — et publie le livrable. "
      + 'Ne rends pas la main en annonçant que tu attends : chaque convocation te répond dans la foulée.'
  }

  verifier(toolName, input) {
    const i = input || {}
    if (toolName === 'Agent') return this.#verifierAgent(i)
    if (!toolName.startsWith(PREFIXE)) return null
    if (toolName.slice(PREFIXE.length) === 'rediger_livrable') return this.#verifierRedaction(i)
    return null
  }

  /** Configuration `hooks` passée à query(). */
  hooks() {
    const refuser = (raison) => ({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: raison,
      },
    })
    const verifier = async (entree) => {
      const raison = this.verifier(entree?.tool_name, entree?.tool_input)
      return raison ? refuser(raison) : { continue: true }
    }
    return {
      PreToolUse: [
        { matcher: `${PREFIXE}.*`, hooks: [verifier] },
        { matcher: 'Agent', hooks: [verifier] },
      ],
      // Rendre la main au milieu d'une mission n'est pas une option : on renvoie
      // l'orchestrateur au travail avec la liste de ce qui manque.
      Stop: [
        {
          hooks: [async () => {
            const raison = this.raisonDeRelancer()
            return raison ? { decision: 'block', reason: raison } : { continue: true }
          }],
        },
      ],
    }
  }
}
