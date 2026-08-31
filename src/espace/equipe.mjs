// L'équipe : un organigramme et, pour chaque membre, son « âme et rôle ».
//
// C'est le seul vrai réglage de cette application. Tout le reste en découle : les
// sous-agents branchés sur la session, l'ordre du travail pendant une mission, le
// choix de qui répond en discussion. On la garde donc dans un fichier JSON lisible,
// que l'utilisateur peut ouvrir, sauvegarder ou copier d'une machine à l'autre.
//
// Trois niveaux, pas quatre : l'orchestrateur, ses directeurs (les pôles), et leurs
// spécialistes. Au-delà, personne ne saurait plus qui intègre le travail de qui.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { P, ensureDonnees } from './paths.mjs'

export const ORCHESTRATEUR = 'orchestrateur'
export const PROFONDEUR_MAX = 2

const EQUIPE_PAR_DEFAUT = [
  {
    id: ORCHESTRATEUR,
    label: 'Orchestrateur',
    parentId: null,
    order: 0,
    ame: `Tu es l'orchestrateur de l'équipe.

Rôle : comprendre la demande, la découper par pôle, faire travailler les bonnes personnes dans le bon ordre, puis écrire le livrable final d'une seule plume. Tu tranches les désaccords de priorité, tu gardes le fil, tu assures la cohérence du ton.

Âme : calme, structuré, orienté résultat ; tu préfères les décisions explicites et les livrables traçables.`,
  },
  {
    id: 'da',
    label: 'Directeur artistique',
    parentId: ORCHESTRATEUR,
    order: 0,
    ame: `Tu es le directeur artistique.

Rôle : définir et défendre l'identité visuelle, la qualité esthétique et la lisibilité sensible des propositions. Tu alignes créativité et contraintes de marque ; tu cadres le designer UI/UX sur les choix de style, d'accessibilité visuelle et de cohérence.

Âme : exigeant sur le détail, curieux des tendances, toujours au service du message et de l'utilisateur final.`,
  },
  {
    id: 'cto',
    label: 'CTO',
    parentId: ORCHESTRATEUR,
    order: 1,
    ame: `Tu es le CTO.

Rôle : porter la stratégie technique, l'architecture, la sécurité, la performance et la dette. Tu évalues la faisabilité, les risques et les compromis ; tu encadres le développeur sur les standards, la qualité du code et la livraison.

Âme : rigoureux, pragmatique ; tu privilégies la simplicité maintenable et la traçabilité des choix techniques.`,
  },
  {
    id: 'juridique',
    label: 'Directeur juridique',
    parentId: ORCHESTRATEUR,
    order: 2,
    ame: `Tu es le directeur juridique.

Rôle : encadrer les aspects contractuels, réglementaires et de responsabilité. Tu identifies les risques juridiques, tu proposes des formulations prudentes et des cadrages ; tu supervises le DPO sur la conformité des traitements de données.

Âme : précis, prudent sans être bloquant ; tu expliques les risques en langage actionnable.`,
  },
  {
    id: 'da-uiux',
    label: 'Designer UI / UX',
    parentId: 'da',
    order: 0,
    ame: `Tu es le designer UI / UX.

Rôle : concevoir des parcours et des interfaces claires. Tu t'appuies sur l'ergonomie, un design system cohérent et une micro-copie utile ; tu proposes des alternatives et des critères d'acceptation visuels pour itérer.

Âme : empathique envers l'utilisateur, obsédé par le flux simple et le retour visible.`,
  },
  {
    id: 'cto-dev',
    label: 'Développeur',
    parentId: 'cto',
    order: 0,
    ame: `Tu es le développeur.

Rôle : implémenter, tester et maintenir le code avec clarté. Tu suis les conventions du projet, tu documentes l'essentiel et tu remontes tôt les blocages techniques au CTO.

Âme : curieux, honnête sur les limites ; tu préfères le code lisible aux astuces obscures.`,
  },
  {
    id: 'jur-dpo',
    label: 'DPO',
    parentId: 'juridique',
    order: 0,
    ame: `Tu es le DPO (délégué à la protection des données).

Rôle : veiller au respect du RGPD et des bonnes pratiques vie privée : bases légales, minimisation, sous-traitants, analyse d'impact si besoin, information des personnes, documentation.

Âme : méthodique, pédagogue ; tu relies toujours l'exigence légale à une mesure concrète.`,
  },
]

// ------------------------------------------------------------------ lecture

function valide(liste) {
  if (!Array.isArray(liste)) return null
  const orch = liste.find((m) => m?.id === ORCHESTRATEUR && !m.parentId)
  if (!orch) return null
  return liste
    .filter((m) => m && typeof m.id === 'string' && typeof m.label === 'string')
    .map((m, i) => ({
      id: m.id,
      label: m.label,
      parentId: m.id === ORCHESTRATEUR ? null : (m.parentId || ORCHESTRATEUR),
      order: Number.isFinite(m.order) ? m.order : i,
      ame: typeof m.ame === 'string' ? m.ame : '',
    }))
}

export function chargerEquipe() {
  try {
    const brut = JSON.parse(fs.readFileSync(P.equipe(), 'utf8'))
    const liste = valide(brut?.membres || brut)
    if (liste?.length) return liste
  } catch {}
  return structuredClone(EQUIPE_PAR_DEFAUT)
}

export function enregistrerEquipe(membres) {
  const liste = valide(membres)
  if (!liste) throw new Error("Équipe invalide : l'orchestrateur est obligatoire.")
  ensureDonnees()
  fs.writeFileSync(P.equipe(), JSON.stringify({ membres: liste }, null, 2))
  return liste
}

export function equipeParDefaut() {
  return structuredClone(EQUIPE_PAR_DEFAUT)
}

// ---------------------------------------------------------------- structure

export function membre(id, membres = chargerEquipe()) {
  return membres.find((m) => m.id === id) || null
}

export function enfantsDe(id, membres) {
  return membres.filter((m) => m.parentId === id).sort((a, b) => a.order - b.order)
}

/** Les pôles : les directeurs rattachés directement à l'orchestrateur. */
export function poles(membres) {
  return enfantsDe(ORCHESTRATEUR, membres)
}

export function profondeur(id, membres) {
  let d = 0
  let cur = membre(id, membres)
  const vus = new Set()
  while (cur?.parentId) {
    if (vus.has(cur.id)) break
    vus.add(cur.id)
    d += 1
    cur = membre(cur.parentId, membres)
  }
  return d
}

export function sousArbre(racine, membres) {
  const out = new Set([racine])
  let front = [racine]
  while (front.length) {
    const suivant = []
    for (const pid of front) {
      for (const m of membres) {
        if (m.parentId === pid && !out.has(m.id)) {
          out.add(m.id)
          suivant.push(m.id)
        }
      }
    }
    front = suivant
  }
  return out
}

/** L'arbre prêt à peindre : chaque membre avec ses enfants, dans l'ordre. */
export function arbre(membres = chargerEquipe()) {
  const noeud = (m) => ({
    id: m.id,
    label: m.label,
    parentId: m.parentId,
    ame: m.ame || '',
    role: m.id === ORCHESTRATEUR ? 'orchestrateur' : (profondeur(m.id, membres) === 1 ? 'pole' : 'specialiste'),
    enfants: enfantsDe(m.id, membres).map(noeud),
  })
  const racine = membre(ORCHESTRATEUR, membres)
  return racine ? noeud(racine) : null
}

// ---------------------------------------------------------------- édition

/** Sous l'orchestrateur, ou sous un pôle. Un spécialiste n'encadre personne. */
export function peutRattacher(id, nouveauParent, membres) {
  if (id === ORCHESTRATEUR) return false
  if (!membre(id, membres) || !membre(nouveauParent, membres)) return false
  if (nouveauParent === id) return false
  if (sousArbre(id, membres).has(nouveauParent)) return false
  if (nouveauParent === ORCHESTRATEUR) return true
  if (profondeur(nouveauParent, membres) !== 1) return false
  // Un pôle qui a des spécialistes ne peut pas devenir lui-même spécialiste :
  // ses enfants se retrouveraient à un quatrième niveau.
  return !membres.some((m) => m.parentId === id)
}

export function rattacher(membres, id, nouveauParent) {
  if (!peutRattacher(id, nouveauParent, membres)) return membres
  const ordreMax = membres
    .filter((m) => m.parentId === nouveauParent && m.id !== id)
    .reduce((a, m) => Math.max(a, m.order), -1)
  return membres.map((m) => (m.id === id ? { ...m, parentId: nouveauParent, order: ordreMax + 1 } : m))
}

const ACCENTS = /[̀-ͯ]/g

export function identifiant(label, membres) {
  const base = String(label || 'membre')
    .normalize('NFD').replace(ACCENTS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'membre'
  if (!membres.some((m) => m.id === base)) return base
  for (let i = 2; i < 60; i += 1) {
    const essai = `${base}-${i}`
    if (!membres.some((m) => m.id === essai)) return essai
  }
  return `${base}-${crypto.randomBytes(2).toString('hex')}`
}

export function ajouterMembre(membres, parentId, label = 'Nouveau membre') {
  const parent = membre(parentId, membres)
  if (!parent) throw new Error('Parent inconnu.')
  if (profondeur(parentId, membres) >= PROFONDEUR_MAX) {
    throw new Error("Trois niveaux suffisent : un spécialiste n'encadre personne.")
  }
  const id = identifiant(label, membres)
  const ordreMax = membres.filter((m) => m.parentId === parentId).reduce((a, m) => Math.max(a, m.order), -1)
  return [...membres, { id, label: String(label).trim() || 'Nouveau membre', parentId, order: ordreMax + 1, ame: '' }]
}

export function renommerMembre(membres, id, label) {
  const propre = String(label || '').trim().slice(0, 60)
  return membres.map((m) => (m.id === id ? { ...m, label: propre || m.label } : m))
}

export function definirAme(membres, id, ame) {
  return membres.map((m) => (m.id === id ? { ...m, ame: String(ame || '').slice(0, 8000) } : m))
}

export function supprimerMembre(membres, id) {
  if (id === ORCHESTRATEUR) return membres
  const partent = sousArbre(id, membres)
  return membres.filter((m) => !partent.has(m.id))
}

// ---------------------------------------------------------------- archives
//
// Une composition d'équipe est un objet de travail : on en essaie une pour un type
// de mission, on revient à la précédente ensuite. Les archiver évite de refaire
// l'organigramme à la main.

export function archives() {
  try {
    const liste = JSON.parse(fs.readFileSync(P.archives(), 'utf8'))
    return Array.isArray(liste) ? liste : []
  } catch {
    return []
  }
}

function ecrireArchives(liste) {
  ensureDonnees()
  fs.writeFileSync(P.archives(), JSON.stringify(liste, null, 2))
  return liste
}

export function archiver(nom, membres) {
  const propre = String(nom || '').trim().slice(0, 80) || `Composition du ${new Date().toLocaleDateString('fr-FR')}`
  const entree = {
    id: `a${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`,
    nom: propre,
    cree_le: new Date().toISOString(),
    membres: structuredClone(membres),
  }
  return ecrireArchives([entree, ...archives()].slice(0, 40))
}

export function supprimerArchive(id) {
  return ecrireArchives(archives().filter((a) => a.id !== id))
}

export function restaurerArchive(id) {
  const trouvee = archives().find((a) => a.id === id)
  if (!trouvee) throw new Error('Composition introuvable.')
  return enregistrerEquipe(trouvee.membres)
}

/** Le résumé d'un membre pour les prompts : qui il est, qui il encadre. */
export function descriptionMembre(m, membres) {
  const enfants = enfantsDe(m.id, membres)
  const encadre = enfants.length ? ` — encadre ${enfants.map((e) => e.label).join(', ')}` : ''
  return `${m.label}${encadre}`
}
