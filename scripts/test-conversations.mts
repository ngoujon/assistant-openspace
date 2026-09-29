// Les missions : un titre qui se fabrique tout seul, la recherche qui descend dans le
// contenu, et un fil qui se retrouve intact après un aller-retour.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'openspace-missions-'))
process.env.OPENSPACE_DATA_DIR = path.join(bac, 'donnees')
process.env.OPENSPACE_LIVRABLES = path.join(bac, 'livrables')

const M = await import('../src/espace/missions.mjs')

// 1. Une mission neuve n'a pas de titre : elle en prend un à la première demande.
const a = M.creer()
assert.equal(a.titre, null)
assert.equal(M.lister()[0].sansTitre, true)

M.ajouter(a.id, { k: 'user', texte: 'Cadre la refonte du site vitrine pour une présentation au comité' })
assert.equal(M.lister()[0].titre, 'Cadre la refonte du site vitrine pour une présentation au…')
assert.equal(M.lister()[0].sansTitre, false)

// 2. Le titre du livrable prend le dessus : c'est ce qu'on cherchera plus tard.
M.ajouter(a.id, { k: 'contribution', id: 'cto-dev', membre: 'Développeur', etat: 'livre', taille: 3200, apercu: 'Le socle tient.' })
M.ajouter(a.id, { k: 'contribution', id: 'cto', membre: 'CTO', etat: 'livre', taille: 4100, apercu: 'Deux dépendances abandonnées.' })
M.ajouter(a.id, { k: 'texte', texte: 'Trois pôles mobilisés.' })
M.ajouter(a.id, {
  k: 'livrable', nom: '2026-08-31-refonte.md', titre: 'Refonte du site vitrine', mots: 2900,
  equipe: ['CTO', 'Directeur artistique'], version: 1,
})
const resume = M.lister()[0]
assert.equal(resume.titre, 'Refonte du site vitrine')
assert.equal(resume.livrables, 1)
assert.equal(resume.messages, 1)
assert.equal(resume.equipe, 2, 'on sait combien de membres ont travaillé')
assert.deepEqual(M.equipeDe(a.id), ['Développeur', 'CTO'])
assert.deepEqual(M.livrablesDe(a.id), ['2026-08-31-refonte.md'])

// 3. Une deuxième mission, et la recherche qui doit les départager.
const b = M.creer()
M.ajouter(b.id, { k: 'user', texte: 'Faut-il internaliser la facturation ?' })
assert.equal(M.lister().length, 2)
assert.equal(M.lister()[0].id, b.id, 'la plus récemment touchée passe en tête')
assert.equal(M.lister('refonte').length, 1)
assert.equal(M.lister('facturation').length, 1)
assert.equal(M.lister('tokyo').length, 0)
// La recherche descend dans le contenu, pas seulement dans les titres.
assert.equal(M.lister('dépendances')[0].id, a.id, 'on retrouve une mission par le travail d\'un membre')

// 4. Un titre posé à la main ne se fait plus recouvrir.
M.renommer(a.id, 'Refonte — comité de mars')
M.ajouter(a.id, { k: 'livrable', nom: '2026-08-31-refonte.md', titre: 'Autre titre', mots: 3100, version: 2 })
assert.equal(M.lire(a.id)!.titre, 'Refonte — comité de mars')
assert.equal(M.livrablesDe(a.id).length, 1, 'republier ne duplique pas le livrable')

// 5. Le statut du dernier tour, et la session à reprendre.
M.marquerStatut(a.id, 'interrompu')
M.memoriserSession(a.id, 'sess-123')
assert.equal(M.fil(a.id)!.statut, 'interrompu')
assert.equal(M.fil(a.id)!.sessionId, 'sess-123')

// 6. Le fil se rejoue : tout ce qui a été affiché est là, dans l'ordre.
const fil = M.fil(a.id)!
assert.deepEqual(
  fil.evenements.map((e) => e.k),
  ['user', 'contribution', 'contribution', 'texte', 'livrable', 'livrable'],
)

// 7. Supprimer une mission ne touche pas aux autres.
M.supprimer(b.id)
assert.equal(M.lister().length, 1)
assert.equal(M.lire(b.id), null)

fs.rmSync(bac, { recursive: true, force: true })
console.log('test-conversations OK')
