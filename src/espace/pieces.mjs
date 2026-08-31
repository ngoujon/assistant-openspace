// Les pièces jointes : ce que l'utilisateur dépose dans le champ de saisie.
//
// Une capture d'écran, un PDF d'appel d'offres, un enregistrement de réunion, un
// export CSV : c'est la matière de la mission, et l'équipe doit pouvoir la lire.
// On ne devine rien du contenu ici — on **copie** le fichier dans les données de
// l'app et on passe son chemin à l'agent, qui l'ouvre avec ses propres outils.
//
// Pourquoi copier plutôt que pointer l'original : la session travaille sous le
// dossier personnel, un fichier posé depuis un disque externe ou une clé USB ne
// serait plus lisible ; et un fil rouvert dans trois semaines doit retrouver ses
// pièces même si l'original a bougé.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { P } from './paths.mjs'

/** Au-delà, on ne copie pas : un fichier de cette taille se travaille sur place. */
export const TAILLE_MAX = 512 * 1024 * 1024

const GENRES = [
  ['image', 'image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'svg', 'avif']],
  ['video', 'vidéo', ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mpg', 'mpeg', 'wmv']],
  ['audio', 'audio', ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'aiff', 'aif', 'caf', 'wma', 'opus']],
  ['document', 'document', ['pdf', 'doc', 'docx', 'odt', 'rtf', 'pages', 'ppt', 'pptx', 'key', 'epub']],
  ['tableur', 'tableur', ['csv', 'tsv', 'xls', 'xlsx', 'ods', 'numbers']],
  ['texte', 'texte', ['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'log', 'srt', 'vtt']],
  ['code', 'code', ['js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'swift', 'sh', 'sql', 'php', 'css']],
  ['archive', 'archive', ['zip', 'tar', 'gz', 'tgz', 'rar', '7z']],
]

/** Ce qu'est ce fichier, en un mot — pour l'afficher et pour le dire à l'agent. */
export function genreDe(nom) {
  const ext = path.extname(String(nom || '')).slice(1).toLowerCase()
  for (const [genre, libelle, exts] of GENRES) {
    if (exts.includes(ext)) return { genre, libelle: ext ? `${libelle} ${ext.toUpperCase()}` : libelle, ext }
  }
  return { genre: 'fichier', libelle: ext ? `fichier ${ext.toUpperCase()}` : 'fichier', ext }
}

export function tailleLisible(octets) {
  const n = Number(octets) || 0
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ko`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} Go`
}

/** Un nom de fichier sain, qui reste reconnaissable dans une liste. */
function nomSain(nom) {
  const base = path.basename(String(nom || 'piece')).replace(/[/\\:]/g, '-').trim()
  return base.slice(0, 120) || 'piece'
}

function cheminLibre(dossier, nom) {
  const ext = path.extname(nom)
  const base = nom.slice(0, nom.length - ext.length) || 'piece'
  let candidat = path.join(dossier, nom)
  for (let i = 2; fs.existsSync(candidat) && i < 999; i += 1) {
    candidat = path.join(dossier, `${base}-${i}${ext}`)
  }
  return candidat
}

function decrire(chemin) {
  const stat = fs.statSync(chemin)
  const nom = path.basename(chemin)
  return { ...genreDe(nom), nom, chemin, octets: stat.size, taille: tailleLisible(stat.size) }
}

/**
 * Copie un fichier dans les pièces de la mission.
 * @param {string} missionId
 * @param {string} source chemin absolu du fichier déposé ou choisi
 */
export function joindre(missionId, source) {
  const stat = fs.statSync(source)
  if (!stat.isFile()) throw new Error(`« ${path.basename(source)} » n'est pas un fichier.`)
  if (stat.size > TAILLE_MAX) {
    throw new Error(`« ${path.basename(source)} » fait ${tailleLisible(stat.size)} : trop gros pour être joint (${tailleLisible(TAILLE_MAX)} maximum).`)
  }
  const dossier = P.pieces(missionId)
  fs.mkdirSync(dossier, { recursive: true })
  const cible = cheminLibre(dossier, nomSain(path.basename(source)))
  fs.copyFileSync(source, cible)
  return decrire(cible)
}

/**
 * Enregistre des octets bruts — une image collée depuis le presse-papiers, qui n'a
 * pas de fichier d'origine.
 */
export function joindreDonnees(missionId, { nom, base64 }) {
  const octets = Buffer.from(String(base64 || ''), 'base64')
  if (!octets.length) throw new Error('Presse-papiers vide.')
  if (octets.length > TAILLE_MAX) throw new Error('Contenu trop gros pour être joint.')
  const dossier = P.pieces(missionId)
  fs.mkdirSync(dossier, { recursive: true })
  const propre = nomSain(nom || `capture-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`)
  const cible = cheminLibre(dossier, propre)
  fs.writeFileSync(cible, octets)
  return decrire(cible)
}

/**
 * Retire une pièce que l'utilisateur a jointe puis retirée avant l'envoi. On ne supprime
 * que dans le dossier des pièces : une erreur de chemin ne doit pas effacer ses
 * fichiers à lui.
 */
export function oublier(chemin) {
  const racine = P.pieces('')
  const cible = path.resolve(String(chemin || ''))
  if (!cible.startsWith(path.dirname(racine) + path.sep)) return false
  try { fs.rmSync(cible, { force: true }); return true } catch { return false }
}

/** Le bloc ajouté au message : des chemins absolus, et ce qu'ils contiennent. */
export function blocPieces(pieces) {
  if (!pieces?.length) return ''
  const lignes = pieces.map((p) => `- « ${p.nom} » — ${p.libelle}, ${p.taille} : ${p.chemin}`)
  return [
    '',
    '---',
    `Pièces jointes par l'utilisateur (${pieces.length}) — chemins absolus sur son Mac, à ouvrir avant de répondre :`,
    ...lignes,
  ].join('\n')
}

/** Les adresses http(s) trouvées dans un message : ce sont des sources, pas du décor. */
export function liensDuTexte(texte) {
  const trouves = String(texte || '').match(/https?:\/\/[^\s<>()"']+/gi) || []
  return [...new Set(trouves.map((u) => u.replace(/[.,;:!?]+$/, '')))]
}

export function blocLiens(liens) {
  if (!liens.length) return ''
  return [
    '',
    `Adresses citées dans le message (${liens.length}) — ouvre-les, ce sont des sources :`,
    ...liens.map((u) => `- ${u}`),
  ].join('\n')
}
