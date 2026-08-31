// L'organigramme : trois niveaux, pas quatre ; des identifiants stables ; et une
// équipe qui devient vraiment des sous-agents.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'openspace-equipe-'))
process.env.OPENSPACE_DATA_DIR = path.join(bac, 'donnees')
process.env.OPENSPACE_LIVRABLES = path.join(bac, 'livrables')

const E = await import('../src/espace/equipe.mjs')
const { definitionsAgents, organigrammeTexte } = await import('../src/agent/equipe.mjs')

// 1. Sans fichier, l'équipe par défaut : un orchestrateur, trois pôles, trois spécialistes.
let membres = E.chargerEquipe()
assert.equal(membres.length, 7)
assert.equal(E.poles(membres).length, 3)
assert.equal(E.profondeur('da-uiux', membres), 2)
assert.ok(membres.every((m) => m.ame.trim()), 'chaque membre par défaut a une âme')

// 2. Ajouter : un pôle sous l'orchestrateur, un spécialiste sous un pôle.
membres = E.ajouterMembre(membres, E.ORCHESTRATEUR, 'Directeur financier')
const cfo = membres.at(-1)
assert.equal(cfo.id, 'directeur-financier', 'l\'identifiant vient du nom')
assert.equal(E.profondeur(cfo.id, membres), 1)

membres = E.ajouterMembre(membres, cfo.id, 'Contrôleur de gestion')
const controleur = membres.at(-1)
assert.equal(E.profondeur(controleur.id, membres), 2)

// 3. Le quatrième niveau n'existe pas.
assert.throws(() => E.ajouterMembre(membres, controleur.id, 'Stagiaire'), /spécialiste/)

// 4. Deux membres du même nom ne partagent pas un identifiant : ce sont deux sous-agents.
membres = E.ajouterMembre(membres, E.ORCHESTRATEUR, 'Directeur financier')
assert.equal(membres.at(-1).id, 'directeur-financier-2')
membres = E.supprimerMembre(membres, 'directeur-financier-2')

// 5. Rattachement : sous l'orchestrateur ou sous un pôle, jamais sous un spécialiste,
//    et jamais dans son propre sous-arbre.
assert.equal(E.peutRattacher(controleur.id, 'cto', membres), true)
assert.equal(E.peutRattacher(controleur.id, 'cto-dev', membres), false, 'un spécialiste n\'encadre personne')
assert.equal(E.peutRattacher(cfo.id, controleur.id, membres), false, 'pas dans son propre sous-arbre')
assert.equal(E.peutRattacher(E.ORCHESTRATEUR, 'cto', membres), false)

const deplacee = E.rattacher(membres, controleur.id, 'cto')
assert.equal(E.membre(controleur.id, deplacee).parentId, 'cto')

// 6. Un pôle qui encadre ne devient pas spécialiste : ses enfants tomberaient au quatrième niveau.
assert.equal(E.peutRattacher('cto', 'da', membres), false)
assert.equal(E.peutRattacher('directeur-financier', 'da', E.supprimerMembre(membres, controleur.id)), true)

// 7. Supprimer emporte le sous-arbre, jamais l'orchestrateur.
const sansCto = E.supprimerMembre(membres, 'cto')
assert.equal(sansCto.some((m) => m.id === 'cto-dev'), false, 'le spécialiste part avec son pôle')
assert.equal(E.supprimerMembre(membres, E.ORCHESTRATEUR).length, membres.length)

// 8. Enregistrer, relire : c'est le même organigramme.
E.enregistrerEquipe(membres)
const relue = E.chargerEquipe()
assert.deepEqual(relue.map((m) => m.id).sort(), membres.map((m) => m.id).sort())

// 9. Le gestionnaire d'équipes : plusieurs organigrammes, un seul au travail.
assert.equal(E.equipes().length, 1, 'une seule équipe au départ')
assert.equal(E.equipes()[0].actif, true)

const idProduit = E.creerEquipe('Équipe produit', membres)
assert.equal(E.equipes().length, 2)
assert.equal(E.equipeActive().nom, 'Équipe produit', 'créer une équipe bascule dessus')
assert.equal(E.chargerEquipe().length, membres.length)

// L'équipe active est celle qu'on modifie — les autres ne bougent pas.
const [premiere] = E.equipes().filter((e) => !e.actif)
E.enregistrerEquipe(E.supprimerMembre(E.chargerEquipe(), 'cto'))
assert.equal(E.equipes().find((e) => e.id === idProduit).membres, membres.length - 2, 'le pôle et son spécialiste sont partis')
E.activerEquipe(premiere.id)
assert.equal(E.chargerEquipe().some((m) => m.id === 'cto'), true, "l'autre équipe est intacte")

// Dupliquer, renommer.
const idCopie = E.dupliquerEquipe(idProduit)
assert.equal(E.equipeActive().id, idCopie)
assert.match(E.equipeActive().nom, /copie/)
E.renommerEquipe(idCopie, 'Appel d\'offres')
assert.equal(E.equipes().find((e) => e.id === idCopie).nom, "Appel d'offres")

// Supprimer celle qui travaille bascule sur une autre ; la dernière ne part pas.
E.supprimerEquipe(idCopie)
assert.equal(E.equipes().length, 2)
assert.ok(E.equipes().some((e) => e.actif), 'il reste toujours une équipe au travail')
E.supprimerEquipe(E.equipes().find((e) => !e.actif).id)
assert.throws(() => E.supprimerEquipe(E.equipeActive().id), /au moins une équipe/)

// 10. L'équipe devient des sous-agents : un par membre, sauf l'orchestrateur.
const agents = definitionsAgents(membres, { ampleur: 'document', langue: 'français' })
assert.equal(Object.keys(agents).length, membres.length - 1)
assert.equal(agents.orchestrateur, undefined, 'l\'orchestrateur est la session, pas un sous-agent')
assert.ok(agents.cto.prompt.includes('Développeur'), 'un pôle sait qui il encadre')
assert.ok(agents.cto.prompt.includes('deuxième passe'), 'un pôle intègre, il ne compile pas')
assert.ok(!agents['cto-dev'].prompt.includes('deuxième passe'), 'un spécialiste défriche')
assert.ok(agents['cto-dev'].prompt.includes('Points ouverts'), 'chacun finit par ses trous')
for (const [id, def] of Object.entries(agents)) {
  assert.ok(def.disallowedTools.includes('mcp__openspace'), `${id} ne publie pas le livrable`)
  assert.ok(def.description.trim().length > 10, `${id} a une description utilisable`)
}

// 11. L'organigramme en texte : ce que l'orchestrateur lit dans son prompt.
const texte = organigrammeTexte(membres)
assert.ok(texte.includes('`cto`') && texte.includes('`cto-dev`'))
assert.ok(texte.includes('pôle') && texte.includes('spécialiste'))

fs.rmSync(bac, { recursive: true, force: true })
console.log('test-equipe OK')
