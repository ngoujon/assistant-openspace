// Plusieurs missions qui travaillent en même temps.
//
// Une session = un processus Claude Code, et derrière lui toute une équipe de
// sous-agents. On en laisse deux tourner de front : au-delà, la machine rame et les
// missions se marchent dessus. Les demandes suivantes attendent leur tour, et
// partent dès qu'une place se libère.
//
// Le point important : **naviguer n'interrompt rien**. Changer de mission ne fait
// que changer ce qu'on regarde ; ce qui tourne continue de tourner, et son fil se
// remplit en arrière-plan.
import { tracer } from '../espace/journal.mjs'
import type { AgentSession } from './session.mjs'

/** `travaille` (un tour est en cours), `attend` (une place se libère), ou `libre`. */
export type EtatFil = 'travaille' | 'attend' | 'libre'

interface EntreeFil {
  session: AgentSession | null
  occupe: boolean
  enAttente: string[]
}

export const MAX_EN_PARALLELE = 2

export class Pool {
  /** Fabrique une session branchée sur ce fil. */
  creerSession: (missionId: string) => AgentSession
  /** L'identifiant de session à reprendre, s'il y en a un. */
  repriseDe: (missionId: string) => string | undefined
  /** Prévient d'un changement d'état. */
  surEtat: (missionId: string, etat: EtatFil) => void
  max: number
  fils = new Map<string, EntreeFil>()
  /** Ordre d'arrivée des fils qui attendent une place. */
  file: string[] = []
  /** Le fil affiché : sa session reste chaude, pour que la frappe réponde tout de suite. */
  affiche: string | null = null

  constructor({ creerSession, repriseDe, surEtat, max = MAX_EN_PARALLELE }: {
    creerSession: (missionId: string) => AgentSession
    repriseDe?: (missionId: string) => string | undefined
    surEtat?: (missionId: string, etat: EtatFil) => void
    max?: number
  }) {
    this.creerSession = creerSession
    this.repriseDe = repriseDe || (() => undefined)
    this.surEtat = surEtat || (() => {})
    this.max = max
  }

  // ------------------------------------------------------------------ états

  etat(missionId: string): EtatFil {
    const f = this.fils.get(missionId)
    if (f?.occupe) return 'travaille'
    if (f?.enAttente.length) return 'attend'
    return 'libre'
  }

  etats(): Map<string, EtatFil> {
    const out = new Map<string, EtatFil>()
    for (const [id] of this.fils) out.set(id, this.etat(id))
    return out
  }

  occupes(): number {
    let n = 0
    for (const f of this.fils.values()) if (f.occupe) n += 1
    return n
  }

  #entree(missionId: string): EntreeFil {
    let f = this.fils.get(missionId)
    if (!f) {
      f = { session: null, occupe: false, enAttente: [] }
      this.fils.set(missionId, f)
    }
    return f
  }

  #demarrer(missionId: string): AgentSession {
    const f = this.#entree(missionId)
    if (f.session?.running) return f.session
    const session = this.creerSession(missionId)
    f.session = session
    session.start({ resume: this.repriseDe(missionId) })
    return session
  }

  // ------------------------------------------------------------------ envoi

  /**
   * Envoie une demande. Trois cas : le fil travaille déjà (le message rejoint sa file
   * d'entrée et il en tiendra compte), une place est libre (on part tout de suite), ou
   * tout est pris (on attend son tour).
   */
  envoyer(missionId: string, texte: string): 'envoye' | 'attente' {
    const f = this.#entree(missionId)

    if (f.occupe) {
      f.session?.send(texte)
      return 'envoye'
    }

    if (this.occupes() >= this.max) {
      f.enAttente.push(texte)
      if (!this.file.includes(missionId)) this.file.push(missionId)
      tracer('mission mise en attente', missionId, `(${this.occupes()} en traitement)`)
      this.surEtat(missionId, 'attend')
      return 'attente'
    }

    this.#lancer(missionId, texte)
    return 'envoye'
  }

  #lancer(missionId: string, texte: string): void {
    const f = this.#entree(missionId)
    const session = this.#demarrer(missionId)
    f.occupe = true
    this.file = this.file.filter((id) => id !== missionId)
    session.send(texte)
    this.surEtat(missionId, 'travaille')
  }

  /** Un tour vient de se terminer : on libère la place et on fait avancer la file. */
  finDeTour(missionId: string): void {
    const f = this.fils.get(missionId)
    if (!f) return
    f.occupe = false

    if (f.enAttente.length) {
      // Ses propres messages en attente passent en premier : c'est son tour.
      const texte = f.enAttente.splice(0, f.enAttente.length).join('\n\n')
      this.#lancer(missionId, texte)
      return
    }

    // Un fil qui ne travaille plus et qu'on ne regarde pas rend son processus. Son
    // contexte, lui, est enregistré : il se reprend sans rien perdre.
    if (missionId !== this.affiche) this.#liberer(missionId)
    else this.surEtat(missionId, 'libre')

    this.#promouvoir()
  }

  #promouvoir(): void {
    while (this.occupes() < this.max && this.file.length) {
      const suivant = this.file[0]
      const f = this.fils.get(suivant)
      if (!f?.enAttente.length) { this.file.shift(); continue }
      const texte = f.enAttente.splice(0, f.enAttente.length).join('\n\n')
      tracer('mission sortie de la file', suivant)
      this.#lancer(suivant, texte)
    }
  }

  #liberer(missionId: string): void {
    const f = this.fils.get(missionId)
    if (!f) return
    try { f.session?.stop() } catch {}
    this.fils.delete(missionId)
    this.file = this.file.filter((id) => id !== missionId)
    this.surEtat(missionId, 'libre')
  }

  // ------------------------------------------------------------- navigation

  /**
   * Change le fil regardé. Ne touche à rien d'autre : ce qui travaille continue.
   * L'ancien fil, s'il ne fait rien, rend son processus.
   */
  afficher(missionId: string | null): void {
    const ancien = this.affiche
    this.affiche = missionId
    if (ancien && ancien !== missionId && this.etat(ancien) === 'libre') this.#liberer(ancien)
    if (missionId) this.#entree(missionId)
  }

  session(missionId: string): AgentSession | null {
    return this.fils.get(missionId)?.session || null
  }

  interrompre(missionId: string): void {
    const f = this.fils.get(missionId)
    if (!f?.occupe) return
    f.session?.interrupt()
  }

  /** Le fil est supprimé : on arrête tout et on oublie. */
  oublier(missionId: string): void {
    const f = this.fils.get(missionId)
    if (!f) return
    f.enAttente.length = 0
    this.#liberer(missionId)
    this.#promouvoir()
  }

  setModel(model: string): void {
    for (const f of this.fils.values()) f.session?.setModel(model)
  }

  /** Redémarre tout le monde : l'équipe ou les règles ont changé sous leurs pieds. */
  toutArreter(): void {
    for (const id of [...this.fils.keys()]) this.#liberer(id)
    this.file = []
  }
}
