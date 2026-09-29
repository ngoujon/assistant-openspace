// Les règles d'organisation, imposées et pas seulement demandées : un directeur
// après ses spécialistes, avec leurs textes ; aucun livrable neuf sans l'équipe.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'openspace-gardes-'))
process.env.OPENSPACE_DATA_DIR = path.join(bac, 'donnees')
process.env.OPENSPACE_LIVRABLES = path.join(bac, 'livrables')

const { GardeEquipe } = await import('../src/agent/gardes.mjs')
const E = await import('../src/espace/equipe.mjs')
const L = await import('../src/espace/livrables.mjs')

const membres = E.chargerEquipe()
const texteLong = (n) => 'x'.repeat(n)

// 1. Un pôle ne passe pas avant ses spécialistes.
let garde = new GardeEquipe(membres)
let raison = garde.verifier('Agent', { subagent_type: 'cto', prompt: texteLong(2000) })
assert.match(raison, /APRÈS ses spécialistes/)
assert.match(raison, /cto-dev/, 'la garde dit qui convoquer d\'abord')

// 2. Un spécialiste, lui, part quand il veut.
assert.equal(garde.verifier('Agent', { subagent_type: 'cto-dev', prompt: 'Ton angle technique.' }), null)

// 3. Un sous-agent qui n'est pas de l'équipe ne concerne pas la garde.
assert.equal(garde.verifier('Agent', { subagent_type: 'general-purpose', prompt: 'cherche' }), null)

// 4. L'orchestrateur ne se convoque pas lui-même.
assert.match(garde.verifier('Agent', { subagent_type: 'orchestrateur', prompt: 'vas-y' }), /toi/)

// 5. Le spécialiste a rendu : le pôle peut passer — mais avec le travail, pas un résumé.
garde.noteContribution('cto-dev', texteLong(4000))
raison = garde.verifier('Agent', { subagent_type: 'cto', prompt: 'Intègre le travail de ton spécialiste.' })
assert.match(raison, /texte entier/, 'un brief famélique est refusé')
assert.equal(garde.verifier('Agent', { subagent_type: 'cto', prompt: texteLong(2000) }), null)

// 6. Un livrable neuf a besoin de tous les pôles.
assert.match(garde.verifier('mcp__openspace__rediger_livrable', { titre: 'Plan', markdown: '' }), /vide/)
garde.noteContribution('cto', texteLong(3000))
raison = garde.verifier('mcp__openspace__rediger_livrable', { titre: 'Plan produit', markdown: '# Plan\n\nDu texte.' })
assert.match(raison, /`da`/)
assert.match(raison, /`juridique`/)
assert.doesNotMatch(raison, /`cto`/, 'le pôle qui a rendu n\'est pas réclamé')

garde.noteContribution('da', texteLong(3000))
garde.noteContribution('juridique', texteLong(3000))
assert.equal(
  garde.verifier('mcp__openspace__rediger_livrable', { titre: 'Plan produit', markdown: '# Plan\n\nDu texte.' }),
  null,
  'toute l\'équipe a nourri le livrable : il part',
)

// 7. Une retouche ne remobilise personne : le fichier existe déjà.
const info = L.ecrireLivrable({
  titre: 'Plan produit',
  markdown: '# Plan produit\n\nRésumé.\n\n## En bref\n\n- un\n- deux\n',
  equipe: ['CTO'],
})
const neuve = new GardeEquipe(membres)
assert.equal(
  neuve.verifier('mcp__openspace__rediger_livrable', { nom: info.nom, titre: 'Plan produit', markdown: '# Plan produit\n\nAutre chose.' }),
  null,
  'republier une version ne repasse pas par toute l\'équipe',
)

// 8. Sans pôle, l'orchestrateur travaille seul : la règle ne s'invente pas un blocage.
const seul = new GardeEquipe([{ id: 'orchestrateur', label: 'Orchestrateur', parentId: null, order: 0, ame: '' }])
assert.equal(seul.verifier('mcp__openspace__rediger_livrable', { titre: 'Note', markdown: '# Note\n\nDu texte.' }), null)

// 9. Rendre la main au milieu d'une mission : refusé tant qu'il reste une étape évidente.
const arret = new GardeEquipe(membres)
assert.equal(arret.raisonDeRelancer(), null, 'une simple discussion se termine normalement')

arret.noteContribution('cto-dev', texteLong(1200))
let relance = arret.raisonDeRelancer()
assert.match(relance, /`da`/, 'on dit quel pôle manque')
assert.match(relance, /`cto`/)

arret.noteContribution('cto', texteLong(1200))
arret.noteContribution('da', texteLong(1200))
arret.noteContribution('juridique', texteLong(1200))
relance = arret.raisonDeRelancer()
assert.match(relance, /rediger_livrable/, 'tous rentrés, rien publié : on réclame le document')

arret.noterLivrable()
assert.equal(arret.raisonDeRelancer(), null, 'le livrable est sorti : il peut rendre la main')

// Et on ne s'acharne pas : le budget de relances est borné, puis remis à zéro au tour suivant.
const teigneux = new GardeEquipe(membres)
teigneux.noteContribution('cto-dev', texteLong(1200))
const relances = [1, 2, 3, 4, 5].map(() => teigneux.raisonDeRelancer())
assert.equal(relances.filter(Boolean).length, 4)
teigneux.nouveauTour()
assert.ok(teigneux.raisonDeRelancer(), "un nouveau message de l'utilisateur redonne du crédit")

// 10. Les hooks passés au SDK couvrent bien les deux familles d'outils, et l'arrêt.
const hooks = arret.hooks()
assert.equal(hooks.PreToolUse.length, 2)
assert.deepEqual(hooks.PreToolUse.map((h) => h.matcher), ['mcp__openspace__.*', 'Agent'])
assert.equal(hooks.Stop.length, 1)
assert.deepEqual(await hooks.Stop[0].hooks[0]({}), { continue: true }, 'mission finie : on laisse partir')
assert.equal((await new GardeEquipe(membres).hooks().Stop[0].hooks[0]({})).continue, true)

fs.rmSync(bac, { recursive: true, force: true })
console.log('test-gardes OK')
