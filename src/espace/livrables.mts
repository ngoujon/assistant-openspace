// Les livrables : des fichiers .md ordinaires, dans un dossier ordinaire.
// Rien d'exotique — l'utilisateur doit pouvoir les ouvrir, les déplacer et les
// sauvegarder sans l'application.
import fs from 'node:fs'
import path from 'node:path'
import { P, ensureDirs, VERSIONS } from './paths.mjs'
import type { LivrableInfo, VersionLivrable } from '../contrat.mjs'

/** Les métadonnées rangées en fin de fichier, dans un commentaire HTML. */
export interface MetaLivrable {
  titre?: string
  mission?: string
  cree_le?: string
  mis_a_jour_le?: string
  version?: number
  equipe?: string[]
  mots?: number
  modele?: string
  effort?: string
  restaure_depuis?: number
}

export interface Livrable extends LivrableInfo {
  entete: MetaLivrable
  markdown: string
}

export interface VersionLue extends VersionLivrable {
  nom: string
  entete: MetaLivrable
  markdown: string
}

export const LISEZ_MOI = 'LISEZ-MOI.md'

export function slug(titre: unknown): string {
  return String(titre || 'livrable')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'livrable'
}

function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function jolieDate(iso: string | undefined): string {
  const d = new Date(iso ?? '')
  if (Number.isNaN(+d)) return String(iso || '')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function nomFichier(titre: string): string {
  return `${aujourdhui()}-${slug(titre)}.md`
}

/** Un nom de fichier qui reste dans le dossier des livrables, quoi qu'on lui donne. */
function nomSur(nom: unknown): string {
  const base = path.basename(String(nom || '').trim())
  if (!base || base === '.' || base === '..') throw new Error('Nom de livrable invalide.')
  return base.endsWith('.md') ? base : `${base}.md`
}

// -------------------------------------------------------------- métadonnées
//
// Les informations de production (version, dates, équipe) ne sont pas ce qu'on
// vient lire : elles vivent en fin de document, dans une section lisible, et sous
// forme lisible par la machine dans un commentaire HTML — invisible à l'affichage,
// mais suffisant pour retrouver la version d'un livrable sans le relire en entier.

const MARQUEUR = 'openspace:'
const RE_META = /\n?<!--\s*openspace:\s*(\{[\s\S]*?\})\s*-->\s*$/
const RE_APROPOS = /\n+(?:---\n+)?##\s+À propos de ce livrable[\s\S]*$/

export function separerMeta(brut: unknown): { meta: MetaLivrable, corps: string } {
  const texte = String(brut)
  const m = texte.match(RE_META)
  if (!m) return { meta: {}, corps: texte }
  let meta: MetaLivrable = {}
  try { meta = JSON.parse(m[1]) } catch {}
  return { meta, corps: texte.slice(0, m.index).replace(RE_APROPOS, '').trimEnd() }
}

/** L'ancre d'un titre, à la façon de GitHub : c'est ce que suivent les liseuses. */
export function ancre(titre: string): string {
  return String(titre)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Le sommaire, construit à partir des titres réellement présents. Composé ici et
 * non par le modèle : une table des matières qui ment est pire que pas de table.
 */
export function composerSommaire(corps: string): string {
  const titres: { niveau: number, texte: string }[] = []
  let dansCode = false
  for (const ligne of String(corps).split('\n')) {
    if (/^\s*```/.test(ligne)) { dansCode = !dansCode; continue }
    if (dansCode) continue
    const m = ligne.match(/^(#{2,3})\s+(.+?)\s*$/)
    if (m) titres.push({ niveau: m[1].length, texte: m[2].replace(/\s*#+\s*$/, '') })
  }
  if (titres.length < 3) return ''
  const lignes = titres.map((t) => `${t.niveau === 3 ? '  ' : ''}- [${t.texte}](#${ancre(t.texte)})`)
  return `## Sommaire\n\n${lignes.join('\n')}\n`
}

/**
 * Le générique. Un livrable d'équipe dit qui l'a écrit : c'est ce qui distingue ce
 * document d'un texte sorti d'un seul modèle, et c'est ce que l'utilisateur relit quand il
 * veut savoir quel pôle a couvert quoi.
 */
function blocAPropos(meta: MetaLivrable): string {
  const lignes = [
    '## À propos de ce livrable',
    '',
    `- **Version ${meta.version}** — mise à jour le ${jolieDate(meta.mis_a_jour_le)}`,
    `- Créé le ${jolieDate(meta.cree_le)}`,
  ]
  if (meta.mission) lignes.push(`- Mission : « ${meta.mission} »`)
  if (meta.equipe?.length) {
    lignes.push(`- Équipe mobilisée : ${meta.equipe.join(', ')}`)
  }
  // Le moteur qui a écrit : le modèle et l'effort demandé. Trois semaines plus tard,
  // c'est ce qui explique pourquoi deux versions du même document ne se valent pas.
  const moteur = [meta.modele, meta.effort && `effort ${meta.effort}`].filter(Boolean).join(', ')
  lignes.push(`- Produit par l'Assistant OpenSpace${moteur ? ` (${moteur})` : ''}`)
  lignes.push('', `<!-- ${MARQUEUR} ${JSON.stringify(meta)} -->`, '')
  return lignes.join('\n')
}

// ----------------------------------------------------------------- lecture

export function compterMots(texte: unknown): number {
  return (String(texte).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
}

function infoDepuisFichier(nom: string): LivrableInfo {
  const chemin = P.livrable(nom)
  const stat = fs.statSync(chemin)
  const brut = fs.readFileSync(chemin, 'utf8')
  const { meta: entete, corps } = separerMeta(brut)
  return {
    nom,
    chemin,
    titre: entete.titre || corps.match(/^#\s+(.*)$/m)?.[1] || nom.replace(/\.md$/, ''),
    mission: entete.mission || null,
    equipe: Array.isArray(entete.equipe) ? entete.equipe : [],
    cree_le: entete.cree_le || stat.birthtime.toISOString().slice(0, 10),
    mis_a_jour_le: entete.mis_a_jour_le || stat.mtime.toISOString().slice(0, 10),
    version: Number(entete.version || 1),
    versions: compterVersions(nom),
    mots: Number(entete.mots) || compterMots(corps),
    octets: stat.size,
    modifie_a: stat.mtime.toISOString(),
  }
}

export function listerLivrables(): LivrableInfo[] {
  ensureDirs()
  let noms: string[] = []
  try { noms = fs.readdirSync(P.livrables()) } catch { return [] }
  const out: LivrableInfo[] = []
  for (const nom of noms) {
    if (!nom.endsWith('.md') || nom.startsWith('.') || nom === VERSIONS) continue
    // Le mot d'accueil posé à la première ouverture n'est pas un livrable.
    if (nom === LISEZ_MOI) continue
    try { out.push(infoDepuisFichier(nom)) } catch {}
  }
  // Le plus récent d'abord. Deux écritures dans la même milliseconde sont
  // départagées par le nom, pour que l'ordre affiché ne bouge pas d'un appel à l'autre.
  return out.sort((a, b) => b.modifie_a.localeCompare(a.modifie_a) || b.nom.localeCompare(a.nom))
}

export function existe(nom: unknown): boolean {
  try { return fs.statSync(P.livrable(nomSur(nom))).isFile() } catch { return false }
}

export function lireLivrable(nom: unknown): Livrable {
  const fichier = nomSur(nom)
  if (!existe(fichier)) throw new Error(`Aucun livrable « ${fichier} » dans le dossier.`)
  const brut = fs.readFileSync(P.livrable(fichier), 'utf8')
  const { meta: entete, corps } = separerMeta(brut)
  return { ...infoDepuisFichier(fichier), entete, markdown: corps }
}

export function supprimerLivrable(nom: unknown): string {
  const fichier = nomSur(nom)
  fs.rmSync(P.livrable(fichier), { force: true })
  supprimerVersions(fichier)
  return fichier
}

// -------------------------------------------------------------- écriture

/** Retire un sommaire ou un bloc « À propos » que le modèle aurait écrit lui-même. */
function sansSommaire(markdown: string): string {
  return String(markdown).replace(/^#{2,3}\s*(Sommaire|Table des mati[eè]res)\s*\n[\s\S]*?(?=\n#{1,3}\s)/im, '')
}

function sansAPropos(markdown: string): string {
  return String(markdown).replace(/\n+(?:---\n+)?#{2,3}\s+À propos de ce livrable[\s\S]*$/i, '\n').trimEnd()
}

/** Glisse le sommaire juste avant la première section : après le titre et le résumé. */
function avecSommaire(corps: string): string {
  const sommaire = composerSommaire(corps)
  if (!sommaire) return corps
  const lignes = corps.split('\n')
  const i = lignes.findIndex((l, n) => n > 0 && /^##\s+/.test(l))
  if (i < 0) return `${corps}\n\n${sommaire}`
  return `${lignes.slice(0, i).join('\n').trimEnd()}\n\n${sommaire}\n${lignes.slice(i).join('\n')}`
}

/**
 * Enregistre un livrable. Le corps vient de l'orchestrateur ; le sommaire et le
 * générique sont composés ici.
 */
export function ecrireLivrable({ titre, mission, markdown, equipe = [], nom, modele, effort }: {
  titre: string
  markdown: string
  mission?: string
  equipe?: string[]
  nom?: string
  modele?: string | null
  effort?: string | null
}): LivrableInfo {
  ensureDirs()
  if (!titre?.trim()) throw new Error('Un livrable a besoin d\'un titre.')
  if (!markdown?.trim()) throw new Error('Le livrable est vide.')

  const fichier = nom ? nomSur(nom) : nomFichier(titre)
  const chemin = P.livrable(fichier)
  const dejaLa = existe(fichier)
  // Réécrire ne détruit rien : la version en place part d'abord aux archives.
  // C'est ce qui permet de retoucher un livrable en discussion sans jamais avoir à
  // demander « tu confirmes ? ».
  const ancien: MetaLivrable = dejaLa ? separerMeta(fs.readFileSync(chemin, 'utf8')).meta : {}
  if (dejaLa) archiver(fichier)

  let corps = sansSommaire(sansAPropos(String(markdown).trim()))
  if (!/^#\s+/.test(corps.split('\n')[0] || '')) corps = `# ${titre.trim()}\n\n${corps}`

  const meta: MetaLivrable = {
    titre: titre.trim(),
    mission: mission?.trim() || ancien.mission || undefined,
    cree_le: ancien.cree_le || aujourdhui(),
    mis_a_jour_le: aujourdhui(),
    version: Number(ancien.version || 0) + 1,
    equipe: equipe.length ? [...new Set(equipe)] : (ancien.equipe || []),
    mots: compterMots(corps),
    modele: modele || undefined,
    effort: effort || undefined,
  }

  fs.writeFileSync(chemin, `${avecSommaire(corps)}\n\n---\n\n${blocAPropos(meta)}`)
  return { ...infoDepuisFichier(fichier), remplace: dejaLa }
}

// -------------------------------------------------------------- versions
//
// Un livrable se retouche en discussion : chaque écriture pousse la précédente
// dans « Versions/ », numérotée. Rien ne se perd, donc rien ne se valide.

function dossierVersions(nom: string): string {
  return P.versions(nom)
}

function compterVersions(nom: string): number {
  try {
    return fs.readdirSync(dossierVersions(nom)).filter((f) => /^v\d+\.md$/.test(f)).length
  } catch {
    return 0
  }
}

/** Range la version en place dans les archives, sous son propre numéro. */
function archiver(fichier: string): string | null {
  const chemin = P.livrable(fichier)
  let brut: string
  try { brut = fs.readFileSync(chemin, 'utf8') } catch { return null }
  const { meta: entete } = separerMeta(brut)
  const n = Number(entete.version || compterVersions(fichier) + 1) || 1
  const dossier = dossierVersions(fichier)
  fs.mkdirSync(dossier, { recursive: true })
  const cible = path.join(dossier, `v${n}.md`)
  fs.writeFileSync(cible, brut)
  return cible
}

/** L'historique d'un livrable : la version en place, puis les précédentes. */
export function versionsLivrable(nom: unknown): VersionLivrable[] {
  const fichier = nomSur(nom)
  const out: VersionLivrable[] = []
  if (existe(fichier)) {
    const info = infoDepuisFichier(fichier)
    out.push({
      numero: info.version, courante: true, chemin: info.chemin,
      mots: info.mots, equipe: info.equipe, date: info.mis_a_jour_le, modifie_a: info.modifie_a,
    })
  }
  let noms: string[] = []
  try { noms = fs.readdirSync(dossierVersions(fichier)) } catch { noms = [] }
  for (const f of noms) {
    const m = f.match(/^v(\d+)\.md$/)
    if (!m) continue
    const chemin = path.join(dossierVersions(fichier), f)
    try {
      const brut = fs.readFileSync(chemin, 'utf8')
      const { meta: entete, corps } = separerMeta(brut)
      const stat = fs.statSync(chemin)
      out.push({
        numero: Number(m[1]), courante: false, chemin,
        mots: compterMots(corps), equipe: Array.isArray(entete.equipe) ? entete.equipe : [],
        date: entete.mis_a_jour_le || stat.mtime.toISOString().slice(0, 10),
        modifie_a: stat.mtime.toISOString(),
      })
    } catch {}
  }
  return out.sort((a, b) => b.numero - a.numero)
}

export function lireVersion(nom: unknown, numero: unknown): VersionLue {
  const v = versionsLivrable(nom).find((x) => x.numero === Number(numero))
  if (!v) throw new Error(`Le livrable « ${nomSur(nom)} » n'a pas de version ${numero}.`)
  const brut = fs.readFileSync(v.chemin, 'utf8')
  const { meta: entete, corps } = separerMeta(brut)
  return { ...v, nom: nomSur(nom), entete, markdown: corps }
}

/**
 * Remet une ancienne version en place. Elle devient la version courante — sous un
 * nouveau numéro : revenir en arrière est aussi un pas en avant, et l'état d'où
 * l'on revient reste consultable.
 */
export function restaurerVersion(nom: unknown, numero: unknown): LivrableInfo {
  const fichier = nomSur(nom)
  const v = lireVersion(fichier, numero)
  if (v.courante) throw new Error(`La version ${numero} est déjà celle en place.`)
  const enPlace = separerMeta(fs.readFileSync(P.livrable(fichier), 'utf8')).meta
  archiver(fichier)
  // Le texte revient tel quel ; seules les métadonnées avancent d'un cran, avec la
  // trace de ce qu'on a restauré.
  const meta: MetaLivrable = {
    ...v.entete,
    mis_a_jour_le: aujourdhui(),
    version: Number(enPlace.version || 1) + 1,
    restaure_depuis: Number(numero),
  }
  fs.writeFileSync(P.livrable(fichier), `${v.markdown.trimEnd()}\n\n---\n\n${blocAPropos(meta)}`)
  return { ...infoDepuisFichier(fichier), restaure_depuis: Number(numero) }
}

export function supprimerVersions(nom: unknown): void {
  try { fs.rmSync(dossierVersions(nomSur(nom)), { recursive: true, force: true }) } catch {}
}
