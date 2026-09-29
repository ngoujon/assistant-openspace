// Les pièces jointes : ce que l'utilisateur dépose est copié, reconnu, et présenté à
// l'agent sous forme de chemins qu'il peut réellement ouvrir.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const bac = fs.mkdtempSync(path.join(os.tmpdir(), 'openspace-pieces-'))
process.env.OPENSPACE_DATA_DIR = path.join(bac, 'donnees')
process.env.OPENSPACE_LIVRABLES = path.join(bac, 'livrables')

const Pieces = await import('../src/espace/pieces.mjs')

// 1. Chaque extension dit ce qu'on peut faire du fichier.
assert.equal(Pieces.genreDe('maquette.PNG').genre, 'image')
assert.equal(Pieces.genreDe('reunion.m4a').genre, 'audio')
assert.equal(Pieces.genreDe('demo.mov').genre, 'video')
assert.equal(Pieces.genreDe('appel-offres.pdf').genre, 'document')
assert.equal(Pieces.genreDe('ventes.csv').genre, 'tableur')
assert.equal(Pieces.genreDe('notes.md').genre, 'texte')
assert.equal(Pieces.genreDe('index.mjs').genre, 'code')
assert.equal(Pieces.genreDe('truc.bidule').genre, 'fichier')
assert.equal(Pieces.genreDe('sans-extension').libelle, 'fichier')

// 2. Joindre copie le fichier : l'original peut disparaître, la mission garde le sien.
const source = path.join(bac, 'brief client.md')
fs.writeFileSync(source, '# Brief\n\nUn paragraphe.\n')
const piece = Pieces.joindre('m1', source)
assert.equal(piece.nom, 'brief client.md')
assert.equal(piece.genre, 'texte')
assert.ok(piece.chemin.includes(path.join('pieces', 'm1')))
assert.equal(fs.readFileSync(piece.chemin, 'utf8'), '# Brief\n\nUn paragraphe.\n')
fs.rmSync(source)
assert.ok(fs.existsSync(piece.chemin), "la copie survit à l'original")

// 3. Deux fichiers du même nom ne s'écrasent pas.
const source2 = path.join(bac, 'brief client.md')
fs.writeFileSync(source2, 'autre contenu')
const piece2 = Pieces.joindre('m1', source2)
assert.notEqual(piece2.chemin, piece.chemin)
assert.equal(fs.readFileSync(piece2.chemin, 'utf8'), 'autre contenu')

// 4. Une image collée n'a pas de fichier d'origine : on l'enregistre telle quelle.
const collee = Pieces.joindreDonnees('m1', { nom: 'capture.png', base64: Buffer.from('PNGFAKE').toString('base64') })
assert.equal(collee.genre, 'image')
assert.equal(fs.readFileSync(collee.chemin, 'utf8'), 'PNGFAKE')
assert.throws(() => Pieces.joindreDonnees('m1', { base64: '' }), /vide/i)

// 5. Le bloc ajouté au message : des chemins absolus, et ce qu'ils contiennent.
const bloc = Pieces.blocPieces([piece, collee])
assert.ok(bloc.includes(piece.chemin))
assert.ok(bloc.includes('« capture.png »'))
assert.ok(bloc.includes('image PNG'))
assert.equal(Pieces.blocPieces([]), '', 'aucune pièce : rien à ajouter')

// 6. Les adresses collées sont des sources, dédoublonnées et sans ponctuation parasite.
const liens = Pieces.liensDuTexte('Regarde https://exemple.fr/a, puis https://exemple.fr/a et http://autre.org.')
assert.deepEqual(liens, ['https://exemple.fr/a', 'http://autre.org'])
assert.ok(Pieces.blocLiens(liens).includes('ouvre-les'))
assert.equal(Pieces.blocLiens([]), '')

// 7. On ne supprime que dans le dossier des pièces : une erreur de chemin ne doit pas
//    effacer les fichiers de l'utilisateur.
const horsZone = path.join(bac, 'precieux.txt')
fs.writeFileSync(horsZone, 'à ne pas perdre')
assert.equal(Pieces.oublier(horsZone), false)
assert.ok(fs.existsSync(horsZone))
assert.equal(Pieces.oublier(collee.chemin), true)
assert.equal(fs.existsSync(collee.chemin), false)

// 8. Les tailles se lisent en français, et un fichier énorme est refusé.
assert.equal(Pieces.tailleLisible(900), '900 o')
assert.equal(Pieces.tailleLisible(2048), '2 ko')
assert.equal(Pieces.tailleLisible(5 * 1024 * 1024), '5.0 Mo')
assert.ok(Pieces.TAILLE_MAX >= 100 * 1024 * 1024)

fs.rmSync(bac, { recursive: true, force: true })
console.log('test-pieces OK')
