// Test d'intégration hors Electron : démarre une vraie session, avec une équipe
// réduite à deux membres, et vérifie que la chaîne complète tient — le spécialiste
// travaille, le pôle intègre, l'orchestrateur publie. Écrit dans un dossier temporaire.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'openspace-selftest-'))
process.env.OPENSPACE_DATA_DIR = path.join(bac, 'donnees')
process.env.OPENSPACE_LIVRABLES = path.join(bac, 'livrables')

const E = await import('../src/espace/equipe.mjs')
const { AgentSession } = await import('../src/agent/session.mjs')
const { listerLivrables, lireLivrable } = await import('../src/espace/livrables.mjs')

// Une équipe minuscule : un pôle, un spécialiste. De quoi vérifier l'ordre de
// passage sans payer une mission complète.
E.enregistrerEquipe([
  {
    id: 'orchestrateur',
    label: 'Orchestrateur',
    parentId: null,
    order: 0,
    ame: "Tu es l'orchestrateur. Tu fais travailler ton équipe, puis tu écris le livrable.",
  },
  {
    id: 'atelier',
    label: "Directeur d'atelier",
    parentId: 'orchestrateur',
    order: 0,
    ame: "Tu es le directeur d'atelier. Tu réponds des choix d'outillage et des méthodes de travail.",
  },
  {
    id: 'atelier-menuisier',
    label: 'Menuisier',
    parentId: 'atelier',
    order: 0,
    ame: 'Tu es le menuisier. Tu connais les essences, les assemblages et les temps de séchage.',
  },
])

const vu = { ready: null, texte: '', outils: [], membres: [], livrables: [], perms: [], fini: false }

const session = new AgentSession({
  emit: (e) => {
    if (e.k === 'ready') { vu.ready = e; console.log('PRÊT    outils =', e.outils, '| modèle =', e.model, '| effort =', e.effort, '| équipe =', e.equipe) }
    if (e.k === 'text-delta') vu.texte += e.text
    if (e.k === 'tool-use') { vu.outils.push(e.name); console.log('OUTIL  ', e.name, e.input?.subagent_type || '') }
    if (e.k === 'tool-result' && !e.ok) console.log('ERREUR OUTIL', e.name, e.preview?.slice(0, 200))
    if (e.k === 'membre') console.log('AU TRAVAIL', e.label)
    if (e.k === 'contribution') { vu.membres.push(e); console.log('RENDU  ', e.membre, e.etat, `${e.taille} car.`) }
    if (e.k === 'livrable') { vu.livrables.push(e.livrable); console.log('LIVRABLE', e.livrable.nom, e.livrable.mots, 'mots') }
    if (e.k === 'error') console.log('ERREUR ', e.message)
    if (e.k === 'result') vu.fini = true
  },
  askPermission: async (req) => {
    vu.perms.push(req.toolName)
    console.log('VALID. demandée pour', req.toolName, '->', req.title || '')
    return { behavior: 'deny', message: 'test automatique' }
  },
  getConfig: () => ({ model: 'claude-sonnet-5', ampleur: 'note', langue: 'français', autonomie: 'auto' }),
  ouvrirFichier: () => {},
})

session.start({})
session.send(
  "Mission courte : une note d'une page sur le choix du bois pour un plan de travail de cuisine "
  + '(chêne ou hêtre). Ne cherche rien sur le web : fais travailler ton équipe sur ce qu\'elle sait, '
  + 'puis publie le livrable.',
)

const debut = Date.now()
while (!vu.fini && Date.now() - debut < 300000) await new Promise((r) => setTimeout(r, 300))
session.stop()

const docs = listerLivrables()
console.log('\n--- réponse ---\n' + vu.texte.trim().slice(0, 600))
console.log('\noutils appelés  :', vu.outils.join(', ') || 'aucun')
console.log('membres rentrés :', vu.membres.map((m) => `${m.membre} (${m.taille})`).join(', ') || 'aucun')
console.log('livrables écrits:', docs.map((d) => `${d.nom} (${d.mots} mots, équipe : ${d.equipe.join(', ')})`).join(', ') || 'aucun')

// Le générique du livrable doit dire avec quoi il a été écrit : c'est cette ligne
// qu'on relit dans trois semaines pour comparer deux versions du même document.
const entete = docs.length ? lireLivrable(docs[0].nom).entete : {}
console.log('moteur du livrable:', entete.modele, '| effort', entete.effort)

const rendus = vu.membres.map((m) => m.id)
const ok = vu.ready?.outils === 'connected'
  && rendus.includes('atelier-menuisier')
  && rendus.includes('atelier')
  && rendus.indexOf('atelier-menuisier') < rendus.indexOf('atelier')
  && docs.length === 1
  && docs[0].equipe.length >= 1
  && lireLivrable(docs[0].nom).markdown.length > 400
  && entete.modele === 'claude-sonnet-5'
  && entete.effort === 'high'

console.log('\ndossier de test :', bac)
console.log(ok ? 'SELFTEST OK' : 'SELFTEST ÉCHEC')
if (ok) fs.rmSync(bac, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
