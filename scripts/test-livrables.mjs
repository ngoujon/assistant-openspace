// Les livrables : des .md ordinaires, un sommaire composé par l'app, un générique
// qui dit qui a travaillé, et un historique où rien ne s'écrase.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'openspace-livrables-'))
process.env.OPENSPACE_DATA_DIR = path.join(bac, 'donnees')
process.env.OPENSPACE_LIVRABLES = path.join(bac, 'livrables')

const L = await import('../src/espace/livrables.mjs')

const corps = [
  '# Refonte du site vitrine',
  '',
  'Le site actuel ne convertit plus. Ce document arbitre le périmètre et le calendrier.',
  '',
  '## En bref',
  '',
  '- Refonte complète, pas un lifting.',
  '- Livraison visée : mars.',
  '',
  '## Ce que dit la technique',
  '',
  'Le socle tient, le thème non.',
  '',
  '### Dette',
  '',
  'Deux dépendances abandonnées.',
  '',
  '## Ce que dit le juridique',
  '',
  'Mentions légales à reprendre.',
  '',
  '## Ce qui reste à trancher',
  '',
  "- Le budget photo n'est pas arbitré.",
].join('\n')

// 1. Écrire : le fichier existe, le sommaire est composé, le générique ferme le document.
const info = L.ecrireLivrable({
  titre: 'Refonte du site vitrine',
  mission: 'Cadrer la refonte',
  markdown: corps,
  equipe: ['CTO', 'Directeur juridique'],
  modele: 'claude-opus-5',
  effort: 'high',
})
assert.equal(info.version, 1)
assert.equal(info.remplace, false)
assert.match(info.nom, /^\d{4}-\d{2}-\d{2}-refonte-du-site-vitrine\.md$/)

const brut = fs.readFileSync(info.chemin, 'utf8')
assert.ok(brut.includes('## Sommaire'), 'le sommaire est composé par l\'app')
assert.ok(brut.includes('- [En bref](#en-bref)'))
assert.ok(brut.includes('  - [Dette](#dette)'), 'les sous-titres sont indentés')
assert.ok(brut.includes('## À propos de ce livrable'))
assert.ok(brut.includes('Équipe mobilisée : CTO, Directeur juridique'))
// Le générique dit avec quoi le document a été écrit : le modèle et l'effort demandé.
assert.ok(brut.includes("Produit par l'Assistant OpenSpace (claude-opus-5, effort high)"))
assert.equal(L.lireLivrable(info.nom).entete.effort, 'high')
assert.ok(brut.indexOf('## Sommaire') < brut.indexOf('## Ce que dit la technique'), 'le sommaire précède le fond')

// 2. Relire : le corps revient sans le générique ni le sommaire de l'app.
const relu = L.lireLivrable(info.nom)
assert.equal(relu.titre, 'Refonte du site vitrine')
assert.deepEqual(relu.equipe, ['CTO', 'Directeur juridique'])
assert.ok(!relu.markdown.includes('À propos de ce livrable'))
assert.ok(relu.markdown.includes('## Ce que dit la technique'))

// 3. Republier : nouvelle version, l'ancienne est archivée, rien n'est perdu.
const v2 = L.ecrireLivrable({
  titre: 'Refonte du site vitrine',
  markdown: `${corps}\n\n## Budget\n\nArbitré : 12 k€.\n`,
  nom: info.nom,
  equipe: ['CTO', 'Directeur juridique', 'Directeur artistique'],
})
assert.equal(v2.version, 2)
assert.equal(v2.remplace, true)
assert.equal(v2.cree_le, info.cree_le, 'la date de création ne bouge pas')

const versions = L.versionsLivrable(info.nom)
assert.equal(versions.length, 2)
assert.equal(versions[0].numero, 2)
assert.equal(versions[0].courante, true)
assert.equal(versions[1].courante, false)
assert.ok(L.lireVersion(info.nom, 1).markdown.includes('Refonte du site vitrine'))
assert.ok(!L.lireVersion(info.nom, 1).markdown.includes('## Budget'), 'la v1 est bien la v1')

// 4. Restaurer : on revient en arrière en avançant d'un numéro.
const restaure = L.restaurerVersion(info.nom, 1)
assert.equal(restaure.version, 3)
assert.equal(restaure.restaure_depuis, 1)
assert.ok(!L.lireLivrable(info.nom).markdown.includes('## Budget'))
assert.equal(L.versionsLivrable(info.nom).length, 3, 'l\'état d\'où l\'on revient reste consultable')

// 5. Un titre absent du corps est ajouté ; un livrable vide est refusé.
const sansTitre = L.ecrireLivrable({ titre: 'Note express', markdown: 'Juste un paragraphe.' })
assert.ok(L.lireLivrable(sansTitre.nom).markdown.startsWith('# Note express'))
assert.throws(() => L.ecrireLivrable({ titre: 'Vide', markdown: '   ' }), /vide/i)

// 6. La liste : le plus récent d'abord, le mot d'accueil n'en fait pas partie.
fs.writeFileSync(path.join(process.env.OPENSPACE_LIVRABLES, L.LISEZ_MOI), '# Tes livrables\n')
const liste = L.listerLivrables()
assert.equal(liste.length, 2)
assert.equal(liste.some((d) => d.nom === L.LISEZ_MOI), false)

// 7. Supprimer emporte l'historique.
L.supprimerLivrable(info.nom)
assert.equal(L.existe(info.nom), false)
assert.equal(L.versionsLivrable(info.nom).length, 0)

fs.rmSync(bac, { recursive: true, force: true })
console.log('test-livrables OK')
