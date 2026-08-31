// Les missions : un fichier JSON par fil, avec de quoi le rejouer à l'écran.
//
// Le SDK sait reprendre une conversation côté modèle (`resume`), mais il ne rend
// pas ce qui a été affiché. On garde donc ici une trace légère de ce qui a défilé
// dans la fenêtre — demandes, passages d'équipe, livrables — pour qu'un retour sur
// une ancienne mission retrouve exactement ce qu'on y avait vu.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { P, ensureDonnees } from './paths.mjs'

/** Au-delà, un fil très long est tronqué par le début : seul l'affichage y perd. */
const MAX_EVENEMENTS = 500

const maintenant = () => new Date().toISOString()

export function nouvelId() {
  return `m${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`
}

function chemin(id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''))) throw new Error('Identifiant de mission invalide.')
  return P.mission(id)
}

export function lire(id) {
  try {
    const m = JSON.parse(fs.readFileSync(chemin(id), 'utf8'))
    return m && m.id ? m : null
  } catch {
    return null
  }
}

function ecrire(mission) {
  ensureDonnees()
  fs.writeFileSync(chemin(mission.id), JSON.stringify(mission))
  return mission
}

export function creer({ titre } = {}) {
  return ecrire({
    id: nouvelId(),
    titre: titre || null,
    cree_le: maintenant(),
    maj_le: maintenant(),
    sessionId: null,
    livrables: [],
    /** Qui a travaillé sur cette mission, dans l'ordre de première intervention. */
    equipe: [],
    evenements: [],
  })
}

/** Les métadonnées seules : de quoi peindre la liste sans charger les fils. */
const resume = (m) => ({
  id: m.id,
  titre: m.titre || 'Nouvelle mission',
  sansTitre: !m.titre,
  cree_le: m.cree_le,
  maj_le: m.maj_le,
  livrables: m.livrables?.length || 0,
  equipe: m.equipe?.length || 0,
  messages: m.evenements?.filter((e) => e.k === 'user').length || 0,
  // « termine », « interrompu », « incomplet » — ce qu'est devenu le dernier tour.
  statut: m.statut || null,
  vide: !m.evenements?.length,
})

/** Le texte où l'on cherche : titre, messages, livrables, membres mobilisés. */
function corpusDeRecherche(m) {
  const bouts = [m.titre || '']
  for (const e of m.evenements || []) {
    if (e.k === 'user' || e.k === 'texte') bouts.push(e.texte || '')
    else if (e.k === 'livrable') bouts.push(e.titre || '', e.nom || '')
    else if (e.k === 'contribution') bouts.push(e.membre || '', e.apercu || '')
    else if (e.k === 'outil') bouts.push(e.arg || '')
  }
  return bouts.join('\n').toLowerCase()
}

export function lister(recherche) {
  ensureDonnees()
  let noms = []
  try { noms = fs.readdirSync(P.missions()) } catch { return [] }
  const q = String(recherche || '').trim().toLowerCase()
  const out = []
  for (const nom of noms) {
    if (!nom.endsWith('.json')) continue
    const m = lire(nom.slice(0, -5))
    if (!m) continue
    if (q && !corpusDeRecherche(m).includes(q)) continue
    out.push(resume(m))
  }
  // La plus récemment touchée d'abord. Deux écritures dans la même milliseconde sont
  // départagées par l'identifiant, qui commence par l'instant de création : l'ordre
  // affiché ne saute donc pas d'un appel à l'autre.
  return out.sort((a, b) => b.maj_le.localeCompare(a.maj_le) || b.id.localeCompare(a.id))
}

export function supprimer(id) {
  try { fs.rmSync(chemin(id), { force: true }) } catch {}
  return true
}

/**
 * Renomme une mission. Un titre posé à la main est définitif : ni le modèle ni le
 * titre d'un livrable ne le recouvrent ensuite.
 */
export function renommer(id, titre, { manuel = true } = {}) {
  const m = lire(id)
  if (!m) return null
  if (!manuel && m.titreManuel) return resume(m)
  m.titre = String(titre || '').trim().slice(0, 120) || null
  if (manuel) m.titreManuel = true
  m.maj_le = maintenant()
  return resume(ecrire(m))
}

/** Où en est le dernier tour : c'est ce qui distingue « fini » de « en plan ». */
export function marquerStatut(id, statut) {
  const m = lire(id)
  if (!m || m.statut === statut) return null
  m.statut = statut
  return resume(ecrire(m))
}

export function memoriserSession(id, sessionId) {
  const m = lire(id)
  if (!m || m.sessionId === sessionId) return
  m.sessionId = sessionId
  ecrire(m)
}

/**
 * Ajoute un événement au fil. Le titre se fabrique tout seul : la première demande
 * de l'utilisateur, puis le titre du livrable dès qu'il en sort un — c'est ce qu'on
 * cherche des semaines plus tard, pas « Nouvelle mission ».
 */
export function ajouter(id, evenement) {
  const m = lire(id)
  if (!m) return null
  m.evenements.push({ ...evenement, t: maintenant() })
  if (m.evenements.length > MAX_EVENEMENTS) m.evenements.splice(0, m.evenements.length - MAX_EVENEMENTS)
  if (evenement.k === 'user' && !m.titre) m.titre = titreDepuisTexte(evenement.texte)
  if (evenement.k === 'contribution' && evenement.membre && !m.equipe.includes(evenement.membre)) {
    m.equipe.push(evenement.membre)
  }
  if (evenement.k === 'livrable') {
    if (evenement.nom && !m.livrables.includes(evenement.nom)) m.livrables.push(evenement.nom)
    if (evenement.titre && !m.titreManuel) m.titre = evenement.titre.slice(0, 120)
  }
  m.maj_le = maintenant()
  ecrire(m)
  return resume(m)
}

export function titreDepuisTexte(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (t.length <= 60) return t
  const coupe = t.slice(0, 60)
  const espace = coupe.lastIndexOf(' ')
  return `${(espace > 30 ? coupe.slice(0, espace) : coupe).trim()}…`
}

/**
 * Les noms de fichiers des livrables produits par cette mission.
 *
 * À ne pas confondre avec le `livrables` du résumé, qui en est le **nombre** : ce
 * sont deux réponses à deux questions différentes, et les mélanger casse.
 */
export function livrablesDe(id) {
  const m = lire(id)
  return Array.isArray(m?.livrables) ? [...m.livrables] : []
}

/** Les membres qui ont déjà travaillé sur cette mission. */
export function equipeDe(id) {
  const m = lire(id)
  return Array.isArray(m?.equipe) ? [...m.equipe] : []
}

/** Le fil complet, prêt à être rejoué par l'interface. */
export function fil(id) {
  const m = lire(id)
  return m ? { ...resume(m), sessionId: m.sessionId, evenements: m.evenements } : null
}
