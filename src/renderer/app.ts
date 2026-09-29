import { renderMarkdown } from './markdown.js'
import type {
  DemandePermission, EquipeResume, EtatEquipe, EvenementFenetre, EvenementFil, LivrableInfo, Membre,
  MissionResume, OpenspaceApi, PatchConfig, Piece, PieceMessage, PorteeLivrables, ReponsePermission,
  ResultatPieces,
} from '../contrat.mjs'

declare global {
  interface Window {
    openspace: OpenspaceApi
  }
}

type Evenement<K extends EvenementFenetre['k']> = Extract<EvenementFenetre, { k: K }>
type EtatMembre = 'travaille' | 'livre' | 'echec'

/** Un élément de la page, qui doit exister : sans lui, l'interface n'a pas de sens. */
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id)
  if (!n) throw new Error(`Élément #${id} introuvable.`)
  return n as T
}

const api = window.openspace
const thread = $('thread')
const scroll = $('scroll')
const input = $<HTMLTextAreaElement>('input')
const sendBtn = $<HTMLButtonElement>('btn-send')
const statusLine = $('status-line')
const panneauReglages = $('settings')
const modelSelect = $<HTMLSelectElement>('model')
const modeleEquipeSelect = $<HTMLSelectElement>('modele-equipe')
const ampleurSelect = $<HTMLSelectElement>('ampleur')
const langueSelect = $<HTMLSelectElement>('langue')
const autonomieSelect = $<HTMLSelectElement>('autonomie')
const cheminDossier = $('chemin-dossier')
const moteurEl = $('moteur')
const barre = $('barre')
const panneau = $('panneau')
const recherche = $<HTMLInputElement>('recherche')
const listeMissions = $('liste-missions')
const listeLivrables = $('liste-livrables')
const arbreEl = $('arbre')
const selectEquipe = $<HTMLSelectElement>('equipe-active')
const listeEquipesEl = $('liste-equipes')
const modaleEquipes = $('modale-equipes')
const piecesEl = $('pieces')
const depotEl = $('depot')

let busy = false
let currentText: { el: HTMLElement, raw: string } | null = null
let currentThinking: { el: HTMLElement, raw: string } | null = null
let toolEls = new Map<string, HTMLElement>()
/** La carte ouverte pour chaque membre en train de travailler. */
let convocEls = new Map<string, HTMLElement>()
let livrables: LivrableInfo[] = []
let missions: MissionResume[] = []
let missionCourante: string | null = null
let membres: Membre[] = []
/** Les équipes rangées, et celle qui travaille. */
let equipes: EquipeResume[] = []
let equipeActive: EtatEquipe['equipeActive'] | null = null
/** Les pièces jointes préparées pour le prochain message. */
let piecesEnCours: Piece[] = []
let dossier = ''
let porteeLivrables: PorteeLivrables = 'mission'
let totalLivrables = 0
/** Le modèle et l'effort de la session en cours, tels que le SDK les annonce. */
let moteur: { model: string, effort: string, modeleEquipe: string } | null = null
/** L'effort que l'app demandera : constant, décidé dans agent/session.mts. */
let effortPrevu = 'high'
/** L'état vivant de chaque membre pendant une mission : travaille, livre, echec. */
const etatsMembres = new Map<string, EtatMembre>()

interface PermissionEnAttente {
  id: string
  allow: () => void
  deny: () => void
  card: HTMLElement
}
const permsEnAttente: PermissionEnAttente[] = []
/** Messages écrits pendant qu'ils travaillaient, pas encore repris par l'orchestrateur. */
let enFile: HTMLElement[] = []

// ------------------------------------------------------------------ outils

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: unknown): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = String(text)
  return n
}

const nearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90
let stick = true
scroll.addEventListener('scroll', () => { stick = nearBottom() })

function scrollDown(force = false): void {
  if (force) stick = true
  if (stick) scroll.scrollTop = scroll.scrollHeight
}

function add<T extends HTMLElement>(node: T): T {
  thread.appendChild(node)
  scrollDown()
  return node
}

const membreParId = (id: string | null | undefined): Membre | null => membres.find((m) => m.id === id) || null
const enfantsDe = (id: string): Membre[] => membres.filter((m) => m.parentId === id)
/** Le message lisible d'une erreur, quelle que soit sa forme. */
const messageDe = (err: unknown) => String((err as { message?: unknown } | null)?.message || err)

const initiales = (label: string) => String(label || '?')
  .split(/[\s/-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

// ------------------------------------------------------------------ accueil

const SUGGESTIONS = [
  'Cadre le lancement de notre nouvelle offre : positionnement, technique, juridique',
  "Prépare le dossier de refonte du site vitrine, prêt à présenter",
  'Note de décision : faut-il internaliser notre outil de facturation ?',
  "Audit de notre parcours d'inscription, par pôle",
]

function showWelcome() {
  const box = el('div', 'welcome')
  const h = new Date().getHours()
  const salut = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'
  box.appendChild(el('h1', null, `${salut} 👋`))
  const poles = enfantsDe('orchestrateur')
  box.appendChild(el('p', null, poles.length
    ? `${poles.length} pôle${poles.length > 1 ? 's' : ''} t'attendent : ${poles.map((p) => p.label).join(', ')}. `
      + 'Donne-moi une mission : chacun travaille son angle, les directeurs recoupent, et je t\'en fais un livrable Markdown.'
    : "L'équipe est vide. Ajoute au moins un pôle dans la colonne de droite, puis donne-moi une mission."))
  const chips = el('div', 'chips')
  for (const s of SUGGESTIONS) {
    const c = el('button', 'chip', s)
    c.addEventListener('click', () => submit(s))
    chips.appendChild(c)
  }
  box.appendChild(chips)
  thread.appendChild(box)
}

/** Les pièces d'un message déjà parti : elles restent cliquables dans le fil. */
function pucesPieces(pieces: PieceMessage[]): HTMLElement {
  const box = el('div', 'pieces-msg')
  for (const piece of pieces) {
    const puce = el('span', 'pj')
    puce.appendChild(el('span', 'g', GLYPHES[piece.genre] || GLYPHES.fichier))
    puce.appendChild(el('span', 'n', piece.nom))
    puce.title = `${piece.libelle} · ${piece.taille}`
    puce.addEventListener('click', () => api.pieces.ouvrir(piece.chemin))
    box.appendChild(puce)
  }
  return box
}

function dropWelcome() {
  thread.querySelector('.welcome')?.remove()
}

// ---------------------------------------------------------- noms des outils

const OUTILS: Record<string, [string, string]> = {
  rediger_livrable: ['📄', 'Écrire le livrable'],
  lister_livrables: ['📚', 'Parcourir les livrables'],
  lire_livrable: ['📖', 'Relire le livrable'],
  versions_livrable: ['🗂', 'Historique du livrable'],
  lire_version: ['🕘', 'Lire une version'],
  restaurer_version: ['↩️', 'Restaurer une version'],
  ouvrir_livrable: ['↗', 'Ouvrir le livrable'],
  supprimer_livrable: ['🗑', 'Supprimer un livrable'],
  titrer_mission: ['🏷', 'Nommer la mission'],
  equipe: ['👥', "Consulter l'organigramme"],
}

const BUILTIN: Record<string, [string, string]> = {
  Bash: ['⌘', 'Terminal'],
  Read: ['📄', 'Lire un fichier'],
  Write: ['✏️', 'Écrire un fichier'],
  Edit: ['✏️', 'Modifier un fichier'],
  Glob: ['🔎', 'Chercher des fichiers'],
  Grep: ['🔎', 'Chercher dans les fichiers'],
  WebSearch: ['🌐', 'Recherche web'],
  WebFetch: ['🌐', 'Lire une page'],
  TodoWrite: ['📋', 'Plan de travail'],
  Agent: ['👤', 'Convoquer un membre'],
}

function describeTool(name: string): [string, string] {
  if (name.startsWith('mcp__openspace__')) {
    const court = name.slice('mcp__openspace__'.length)
    return OUTILS[court] || ['📄', court.replace(/_/g, ' ')]
  }
  const connu = BUILTIN[name]
  if (connu) return connu
  if (name.startsWith('mcp__')) return ['🔌', name.split('__').slice(1).join(' · ')]
  return ['•', name]
}

function summarizeInput(name: string, input: Record<string, unknown> | null | undefined): string {
  if (!input || typeof input !== 'object') return ''
  if (name === 'Bash') return String(input.command || '')
  if (name.endsWith('rediger_livrable')) return String(input.titre || '')
  if (input.file_path) return String(input.file_path).split('/').pop() || ''
  for (const k of ['subagent_type', 'url', 'query', 'nom', 'titre', 'description', 'pattern']) {
    const v = input[k]
    if (typeof v === 'string' && v) return v
  }
  const first = Object.values(input).find((v) => typeof v === 'string' && v)
  return first ? String(first) : ''
}

const MONO_TOOLS = new Set(['Bash', 'Write', 'Edit'])

const ETIQUETTES: Record<string, string> = {
  titre: 'titre', mission: 'mission', nom: 'fichier', markdown: 'document',
  subagent_type: 'membre', prompt: 'brief', description: 'objet',
  command: 'commande', file_path: 'fichier', query: 'recherche', url: 'adresse',
  numero: 'version',
}

function humanizeInput(value: unknown, depth = 0, lines: string[] = []): string[] {
  if (lines.length > 18) return lines
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item) => lines.push(`${'  '.repeat(depth)}• ${item}`))
    if (value.length > 8) lines.push(`${'  '.repeat(depth)}… +${value.length - 8}`)
    return lines
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (v == null || v === '') continue
      const label = ETIQUETTES[k] || k
      if (typeof v === 'object') {
        lines.push(`${'  '.repeat(depth)}${label} :`)
        humanizeInput(v, depth + 1, lines)
      } else {
        const s = String(v)
        lines.push(`${'  '.repeat(depth)}${label} : ${s.length > 220 ? `${s.slice(0, 220)}…` : s}`)
      }
    }
    return lines
  }
  lines.push(`${'  '.repeat(depth)}${value}`)
  return lines
}

// -------------------------------------------------------------------- rendu

function pushUserMessage(text: string, enAttente: boolean, pieces: Piece[]): void {
  dropWelcome()
  const node = el('div', `msg user${enAttente ? ' enfile' : ''}`, text)
  if (pieces?.length) node.appendChild(pucesPieces(pieces))
  if (enAttente) {
    node.appendChild(el('span', 'attente', 'pris en compte à la prochaine étape'))
    enFile.push(node)
  }
  add(node)
  scrollDown(true)
}

/**
 * L'orchestrateur vient de reprendre la parole ou d'appeler un outil : le SDK lui a
 * donc remis les messages en attente à cette respiration-là. On retire le marqueur.
 */
function videEnFile() {
  for (const n of enFile.splice(0, enFile.length)) {
    n.classList.remove('enfile')
    n.querySelector('.attente')?.remove()
  }
}

function startTextBlock(): { el: HTMLElement, raw: string } {
  dropWelcome()
  videEnFile()
  finishThinking()
  const node = el('div', 'msg assistant md')
  currentText = { el: node, raw: '' }
  add(node)
  return currentText
}

let renderQueued = false
function appendText(chunk: string): void {
  const bloc = currentText || startTextBlock()
  bloc.raw += chunk
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    if (!currentText) return
    currentText.el.innerHTML = renderMarkdown(currentText.raw)
    scrollDown()
  })
}

function finishText() {
  if (currentText) {
    currentText.el.innerHTML = renderMarkdown(currentText.raw)
    if (!currentText.raw.trim()) currentText.el.remove()
  }
  currentText = null
}

function startThinking(): { el: HTMLElement, raw: string } {
  finishText()
  if (currentThinking) return currentThinking
  const node = el('div', 'msg thinking')
  currentThinking = { el: node, raw: '' }
  add(node)
  return currentThinking
}

function appendThinking(chunk: string): void {
  const bloc = currentThinking || startThinking()
  bloc.raw += chunk
  bloc.el.textContent = bloc.raw
  bloc.el.scrollTop = bloc.el.scrollHeight
  scrollDown()
}

function finishThinking() {
  if (currentThinking) currentThinking.el.classList.add('done')
  currentThinking = null
}

function addTool(evt: Evenement<'tool-use'>): void {
  videEnFile()
  finishText()
  finishThinking()
  // Une convocation a sa propre carte : elle dit qui travaille, pas quel outil tourne.
  if (evt.name === 'Agent') return
  const node = noeudOutil(evt.name, summarizeInput(evt.name, evt.input), humanizeInput(evt.input).join('\n'))
  node.classList.add('running')
  toolEls.set(evt.id, node)
  add(node)
}

/** La ligne d'un appel d'outil. Sert aussi à rejouer un fil enregistré. */
function noeudOutil(nom: string, arg: string, detail: string): HTMLElement {
  const [glyph, label] = describeTool(nom)
  const node = el('div', 'msg tool')
  const head = el('div', 'head')
  head.appendChild(el('span', 'glyph', glyph))
  head.appendChild(el('span', 'label', label))
  if (arg) head.appendChild(el('span', 'arg', arg))
  head.appendChild(el('span', 'state'))
  node.appendChild(head)
  const body = el('div', 'body')
  body.textContent = detail || ''
  node.appendChild(body)
  head.addEventListener('click', () => node.classList.toggle('open'))
  return node
}

function endTool(evt: Evenement<'tool-result'>): void {
  const node = toolEls.get(evt.id)
  if (!node) return
  node.classList.remove('running')
  node.classList.add(evt.ok ? 'ok' : 'err')
  const body = node.querySelector<HTMLElement>('.body')!
  if (evt.preview) body.textContent = `${body.textContent}\n\n— — —\n${evt.preview}`
  if (!evt.ok) node.classList.add('open')
}

// ------------------------------------------------- le travail de l'équipe

/** La carte d'un membre convoqué : elle s'allume au départ, se remplit au retour. */
function carteConvocation({ label, brief = '', etat = 'travaille', texte = '', taille = 0 }: {
  label: string
  brief?: string
  etat?: EtatMembre
  texte?: string
  taille?: number
}): HTMLElement {
  const node = el('div', `msg convoc ${etat}`)
  const head = el('div', 'head')
  head.appendChild(el('span', 'qui', label))
  head.appendChild(el('span', 'quoi', brief || ''))
  head.appendChild(el('span', 'etat', etat === 'travaille' ? '' : (etat === 'echec' ? '✕' : `${(taille / 1000).toFixed(1)} k`)))
  node.appendChild(head)
  const body = el('div', 'body')
  body.textContent = texte || ''
  node.appendChild(body)
  head.addEventListener('click', () => {
    if (body.textContent?.trim()) node.classList.toggle('open')
  })
  return node
}

function addConvocation(evt: Evenement<'membre'>): void {
  videEnFile()
  finishText()
  finishThinking()
  const node = carteConvocation({ label: evt.label, brief: evt.brief })
  convocEls.set(evt.id, node)
  add(node)
  marquerMembre(evt.id, 'travaille')
  scrollDown(true)
}

function finirConvocation(evt: Evenement<'contribution'>): void {
  const node = convocEls.get(evt.id)
  marquerMembre(evt.id, evt.etat)
  if (!node) {
    // Rien à compléter (fil rouvert en cours de route) : on pose la carte finie.
    add(carteConvocation({
      label: evt.membre, etat: evt.etat, texte: evt.texte || evt.apercu, taille: evt.taille,
    }))
    return
  }
  convocEls.delete(evt.id)
  node.className = `msg convoc ${evt.etat}`
  const etat = node.querySelector<HTMLElement>('.etat')!
  etat.textContent = evt.etat === 'echec' ? '✕' : `${Math.max(1, Math.round((evt.taille || 0) / 100) / 10)} k`
  const body = node.querySelector<HTMLElement>('.body')!
  body.textContent = evt.texte || evt.apercu || ''
  if (evt.etat === 'echec') node.classList.add('open')
  scrollDown()
}

function marquerMembre(id: string, etat: EtatMembre | null): void {
  if (etat) etatsMembres.set(id, etat)
  else etatsMembres.delete(id)
  const ligne = arbreEl.querySelector(`[data-membre="${CSS.escape(id)}"]`)
  if (!ligne) return
  ligne.classList.remove('travaille', 'livre', 'echec')
  if (etat) ligne.classList.add(etat)
  const fanion = ligne.querySelector('.fanion')
  if (fanion) fanion.textContent = (etat && FANIONS[etat]) || ''
}

const FANIONS: Record<EtatMembre, string> = { travaille: 'au travail', livre: 'a rendu', echec: 'en échec' }

// -------------------------------------------------------- livrable produit

function carteLivrable(d: Pick<LivrableInfo, 'nom' | 'titre' | 'mots' | 'version' | 'remplace'> & { equipe?: string[] }): HTMLElement {
  const version = Number(d.version || 1)
  const carte = el('div', 'doc-carte')
  const entete = el('div', 'entete')
  entete.appendChild(el('span', 'glyph', version > 1 ? '♻️' : '📄'))
  entete.appendChild(el('div', 't', d.titre))
  if (version > 1) entete.appendChild(el('span', 'v', `v${version}`))
  carte.appendChild(entete)
  const equipe = Array.isArray(d.equipe) ? d.equipe : []
  carte.appendChild(el('div', 'm', [
    `${(d.mots || 0).toLocaleString('fr-FR')} mots`,
    equipe.length ? `${equipe.length} membre${equipe.length > 1 ? 's' : ''} mobilisé${equipe.length > 1 ? 's' : ''}` : null,
    version > 1 ? `version ${version}` : 'nouveau livrable',
  ].filter(Boolean).join(' · ')))
  if (equipe.length) carte.appendChild(el('div', 'm', equipe.join(' · ')))
  // Ni bouton ni chemin de fichier ici : le livrable s'ouvre depuis la colonne de
  // droite, où toutes ses versions sont réunies au même endroit.
  const vers = el('button', 'vers-doc', '→ dans les livrables, à droite')
  vers.addEventListener('click', () => {
    panneauVisible(true)
    changerOnglet('livrables')
    surlignerLivrable(d.nom)
  })
  carte.appendChild(vers)
  return carte
}

function addLivrable(evt: Evenement<'livrable'>): void {
  finishText()
  finishThinking()
  add(carteLivrable(evt.livrable))
  scrollDown(true)
}

function addNote(text: string, kind?: string): void {
  finishText()
  add(el('div', `note${kind ? ` ${kind}` : ''}`, text))
}

/**
 * Un tour s'est arrêté en route. Plutôt qu'un message d'erreur, on offre la reprise :
 * l'application rebranche la session sur son contexte et redemande la suite.
 */
function proposerReprise(texte?: string): void {
  thread.querySelector('.reprise')?.remove()
  const box = el('div', 'reprise')
  const bouton = el('button', 'chip', texte || '↻ Reprendre où tu t\'es arrêté')
  bouton.addEventListener('click', async () => {
    box.remove()
    setBusy(true)
    await api.mission.resume(missionCourante)
  })
  box.appendChild(bouton)
  add(box)
  scrollDown(true)
}

// ------------------------------------------- largeur des colonnes latérales

const LARGEUR_MIN = 190

function appliquerLargeur(colonne: HTMLElement, px: number | null): void {
  colonne.style.flex = px ? `0 0 ${px}px` : ''
}

function poser(poignee: HTMLElement, colonne: HTMLElement, cote: 'gauche' | 'droite', cle: 'largeurBarre' | 'largeurPanneau'): void {
  poignee.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    poignee.setPointerCapture(e.pointerId)
    poignee.classList.add('glisse')
    document.body.classList.add('redimensionne')
    const depart = e.clientX
    const initiale = colonne.offsetWidth
    let derniere = initiale

    const bouge = (ev: PointerEvent) => {
      const delta = cote === 'gauche' ? ev.clientX - depart : depart - ev.clientX
      // On garde toujours de quoi lire le fil : au moins un quart de la fenêtre.
      const max = Math.max(LARGEUR_MIN, Math.round(window.innerWidth * 0.45))
      derniere = Math.min(max, Math.max(LARGEUR_MIN, initiale + delta))
      appliquerLargeur(colonne, derniere)
    }
    const fin = () => {
      poignee.removeEventListener('pointermove', bouge)
      poignee.removeEventListener('pointerup', fin)
      poignee.classList.remove('glisse')
      document.body.classList.remove('redimensionne')
      api.setConfig({ [cle]: derniere })
    }
    poignee.addEventListener('pointermove', bouge)
    poignee.addEventListener('pointerup', fin)
  })

  poignee.addEventListener('dblclick', () => {
    appliquerLargeur(colonne, null)
    api.setConfig({ [cle]: null })
  })
}

poser($('poignee-barre'), barre, 'gauche', 'largeurBarre')
poser($('poignee-panneau'), panneau, 'droite', 'largeurPanneau')

// ============================================================ l'équipe

function ligneMembre(m: Membre, rang: number): HTMLElement {
  const ligne = el('div', `membre rang-${rang}${rang === 0 ? ' orchestrateur' : ''}`)
  ligne.dataset.membre = m.id
  const etat = etatsMembres.get(m.id)
  if (etat) ligne.classList.add(etat)

  ligne.appendChild(el('div', 'pastille', initiales(m.label)))
  const infos = el('div', 'infos')
  const titre = el('div', 't', m.label)
  infos.appendChild(titre)
  const sousTitre = m.ame?.trim()
    ? premiereLigneUtile(m.ame)
    : 'âme à écrire'
  infos.appendChild(el('div', `m${m.ame?.trim() ? '' : ' sans-ame'}`, sousTitre))
  ligne.appendChild(infos)
  ligne.appendChild(el('span', 'fanion', (etat && FANIONS[etat]) || ''))

  // Le nom se tape sur la carte, sans ouvrir la fiche : créer un membre doit aller
  // vite. La fiche, elle, s'ouvre quand on veut écrire son âme.
  const finEdition = async (garder: boolean) => {
    if (!titre.isContentEditable) return
    const valeur = (titre.textContent || '').replace(/\s+/g, ' ').trim()
    titre.contentEditable = 'false'
    titre.classList.remove('edition')
    if (garder && valeur && valeur !== m.label) {
      membres = await api.equipe.rename(m.id, valeur)
      renderEquipe()
      return
    }
    titre.textContent = m.label
  }
  titre.addEventListener('blur', () => finEdition(true))
  titre.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); finEdition(true) }
    if (e.key === 'Escape') { e.preventDefault(); finEdition(false) }
  })
  titre.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    editerLigne(ligne)
  })

  // Ajouter sous ce membre : un pôle sous l'orchestrateur, un spécialiste sous un pôle.
  if (rang < 2) {
    const plus = el('button', 'plus', '+')
    plus.title = rang === 0 ? 'Ajouter un pôle' : 'Ajouter un spécialiste'
    plus.addEventListener('click', async (e) => {
      e.stopPropagation()
      await ajouterMembre(m.id, rang === 0 ? 'Nouveau pôle' : 'Nouveau spécialiste')
    })
    ligne.appendChild(plus)
  }

  ligne.addEventListener('click', () => {
    if (titre.isContentEditable) return
    ouvrirModale(m.id)
  })

  // Glisser-déposer : c'est la façon naturelle de réorganiser un organigramme.
  if (rang > 0) {
    ligne.draggable = true
    ligne.addEventListener('dragstart', (e) => {
      // Un nom en cours de saisie se sélectionne à la souris : ce n'est pas un glisser.
      if (titre.isContentEditable) { e.preventDefault(); return }
      e.dataTransfer?.setData('text/plain', m.id)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      ligne.classList.add('glisse')
    })
    ligne.addEventListener('dragend', () => ligne.classList.remove('glisse'))
  }
  if (rang < 2) {
    ligne.addEventListener('dragover', (e) => {
      const id = e.dataTransfer?.getData('text/plain')
      if (id === m.id) return
      e.preventDefault()
      ligne.classList.add('cible')
    })
    ligne.addEventListener('dragleave', () => ligne.classList.remove('cible'))
    ligne.addEventListener('drop', async (e) => {
      e.preventDefault()
      ligne.classList.remove('cible')
      const id = e.dataTransfer?.getData('text/plain')
      if (!id || id === m.id) return
      const res = await api.equipe.reparent(id, m.id)
      if ('refus' in res) {
        addNote(res.refus, 'err')
        membres = res.membres
      } else {
        membres = res
      }
      renderEquipe()
    })
  }
  return ligne
}

function premiereLigneUtile(ame: string): string {
  const ligne = String(ame).split('\n').map((l) => l.trim())
    .find((l) => l && !/^tu es\b/i.test(l))
  return (ligne || String(ame).trim().split('\n')[0] || '').replace(/^(Rôle|Âme)\s*:\s*/i, '').slice(0, 90)
}

/** Passe le nom d'une carte en saisie, tout sélectionné : on tape par-dessus. */
function editerLigne(ligne: HTMLElement | null): void {
  const titre = ligne?.querySelector<HTMLElement>('.t')
  if (!titre) return
  ligne!.scrollIntoView({ block: 'nearest' })
  titre.contentEditable = 'plaintext-only'
  titre.classList.add('edition')
  titre.focus()
  document.getSelection()?.selectAllChildren(titre)
}

/**
 * Crée un membre et laisse le curseur dans son nom. Pas de fiche qui s'ouvre : on
 * tape, on valide, on enchaîne. L'âme s'écrit plus tard, en cliquant sur la carte.
 */
async function ajouterMembre(parentId: string, label: string): Promise<void> {
  membres = await api.equipe.add(parentId, label)
  const cree = [...membres].reverse().find((x) => x.parentId === parentId)
  renderEquipe()
  if (cree) editerLigne(arbreEl.querySelector<HTMLElement>(`[data-membre="${CSS.escape(cree.id)}"]`))
}

function renderEquipe(): void {
  arbreEl.replaceChildren()
  const orch = membreParId('orchestrateur')
  if (!orch) return
  arbreEl.appendChild(ligneMembre(orch, 0))
  for (const p of enfantsDe(orch.id).sort((a, b) => a.order - b.order)) {
    arbreEl.appendChild(ligneMembre(p, 1))
    for (const s of enfantsDe(p.id).sort((a, b) => a.order - b.order)) {
      arbreEl.appendChild(ligneMembre(s, 2))
    }
  }
  renderSelecteurEquipes()
}

// =========================================== le gestionnaire d'équipes
//
// Une équipe par type de mission : refonte de site, appel d'offres, note
// juridique. Une seule travaille à la fois — c'est elle que la session branche en
// sous-agents — et le sélecteur en tête de colonne dit laquelle.

/** Reprend ce que le processus principal vient de dire de l'équipe. */
function appliquerEtatEquipe(etat: (Partial<EtatEquipe> & { refus?: string }) | null | undefined): void {
  if (!etat) return
  if (etat.refus) addNote(etat.refus, 'err')
  if (Array.isArray(etat.membres)) membres = etat.membres
  if (Array.isArray(etat.equipes)) equipes = etat.equipes
  if (etat.equipeActive) equipeActive = etat.equipeActive
  renderEquipe()
  if (!modaleEquipes.classList.contains('hidden')) renderListeEquipes()
}

function renderSelecteurEquipes(): void {
  if (!equipes.length) return
  selectEquipe.replaceChildren()
  for (const e of equipes) {
    const opt = el('option', null, `${e.nom} — ${e.membres - 1} membre${e.membres > 2 ? 's' : ''}`)
    opt.value = e.id
    selectEquipe.appendChild(opt)
  }
  selectEquipe.value = equipeActive?.id || equipes.find((e) => e.actif)?.id || ''
}

selectEquipe.addEventListener('change', async () => {
  appliquerEtatEquipe(await api.equipe.activer(selectEquipe.value))
})

function renderListeEquipes(): void {
  listeEquipesEl.replaceChildren()
  for (const e of equipes) {
    const ligne = el('div', `equipe-ligne${e.actif ? ' active' : ''}`)
    const infos = el('div', 'infos')
    const nom = document.createElement('input')
    nom.className = 'en'
    nom.value = e.nom
    nom.spellcheck = false
    nom.setAttribute('aria-label', 'Nom de l\'équipe')
    const renommer = async () => {
      const propre = nom.value.trim()
      if (!propre || propre === e.nom) { nom.value = e.nom; return }
      appliquerEtatEquipe(await api.equipe.renommer(e.id, propre))
    }
    nom.addEventListener('blur', renommer)
    nom.addEventListener('keydown', (ev) => {
      ev.stopPropagation()
      if (ev.key === 'Enter') { ev.preventDefault(); nom.blur() }
      if (ev.key === 'Escape') { ev.preventDefault(); nom.value = e.nom; nom.blur() }
    })
    infos.appendChild(nom)

    const meta = el('div', 'em')
    if (e.actif) meta.appendChild(el('span', 'badge', 'au travail'))
    meta.appendChild(el('span', null, `${e.poles} pôle${e.poles > 1 ? 's' : ''}`))
    meta.appendChild(el('span', null, `${e.membres - 1} membre${e.membres > 2 ? 's' : ''}`))
    meta.appendChild(el('span', null, dateCourte(e.maj_le)))
    infos.appendChild(meta)
    ligne.appendChild(infos)

    const actions = el('div', 'actions')
    if (!e.actif) {
      const utiliser = el('button', 'pt', 'Utiliser')
      utiliser.title = 'Faire travailler cette équipe'
      utiliser.addEventListener('click', async () => {
        appliquerEtatEquipe(await api.equipe.activer(e.id))
      })
      actions.appendChild(utiliser)
    }
    const dupliquer = el('button', 'pt', 'Dupliquer')
    dupliquer.title = 'En faire une copie pour la modifier sans toucher à celle-ci'
    dupliquer.addEventListener('click', async () => {
      appliquerEtatEquipe(await api.equipe.dupliquer(e.id))
    })
    actions.appendChild(dupliquer)
    if (equipes.length > 1) {
      const sup = el('button', 'pt danger', 'Supprimer')
      sup.addEventListener('click', async () => {
        appliquerEtatEquipe(await api.equipe.supprimer(e.id))
      })
      actions.appendChild(sup)
    }
    ligne.appendChild(actions)
    listeEquipesEl.appendChild(ligne)
  }
}

function ouvrirModaleEquipes(): void {
  renderListeEquipes()
  modaleEquipes.classList.remove('hidden')
  listeEquipesEl.querySelector<HTMLElement>('.en')?.focus()
}

function fermerModaleEquipes(): void {
  modaleEquipes.classList.add('hidden')
}

$('btn-equipes').addEventListener('click', ouvrirModaleEquipes)
$('equipes-fermer').addEventListener('click', fermerModaleEquipes)
modaleEquipes.querySelector('.modale-fond')!.addEventListener('click', fermerModaleEquipes)
$('equipes-fichier').addEventListener('click', () => api.equipe.openFile())
$('equipes-nouvelle').addEventListener('click', async () => {
  appliquerEtatEquipe(await api.equipe.creer(`Équipe ${equipes.length + 1}`, 'defaut'))
})
$('equipes-copie').addEventListener('click', async () => {
  appliquerEtatEquipe(await api.equipe.creer(`${equipeActive?.nom || 'Équipe'} (copie)`, 'actuelle'))
})
modaleEquipes.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') { e.preventDefault(); fermerModaleEquipes() }
})

// ------------------------------------------------------------- modale âme

const modale = $('modale')
const modaleNom = $<HTMLInputElement>('modale-nom')
const modaleSous = $('modale-titre')
const modaleAme = $<HTMLTextAreaElement>('modale-ame')
const modaleParent = $<HTMLSelectElement>('modale-rattachement')
const modaleParentRow = modale.querySelector<HTMLElement>('.modale-parent')!
const btnProposer = $<HTMLButtonElement>('modale-proposer')
const btnSupprimer = $<HTMLButtonElement>('modale-supprimer')
const btnEnregistrer = $<HTMLButtonElement>('modale-enregistrer')

let membreOuvert: string | null = null

function rangDe(id: string): number {
  const m = membreParId(id)
  if (!m || !m.parentId) return 0
  return membreParId(m.parentId)?.parentId ? 2 : 1
}

function ouvrirModale(id: string): void {
  const m = membreParId(id)
  if (!m) return
  membreOuvert = id
  modaleNom.value = m.label
  modaleAme.value = m.ame || ''
  const rang = rangDe(id)
  const enfants = enfantsDe(id)
  modaleSous.textContent = rang === 0
    ? `Orchestrateur — il pilote ${enfants.length} pôle${enfants.length > 1 ? 's' : ''} et écrit le livrable`
    : rang === 1
      ? `Pôle — il intègre le travail de ${enfants.length || 'aucun'} spécialiste${enfants.length > 1 ? 's' : ''} · sous-agent \`${id}\``
      : `Spécialiste — il défriche son sujet · sous-agent \`${id}\``

  // Le rattachement : seulement pour ceux qui peuvent bouger.
  modaleParentRow.classList.toggle('hidden', rang === 0)
  modaleParent.replaceChildren()
  if (rang > 0) {
    const cibles = [membreParId('orchestrateur'), ...enfantsDe('orchestrateur')]
      .filter((c): c is Membre => c !== null)
      .filter((c) => c.id !== id)
      .filter((c) => c.id === m.parentId || c.id === 'orchestrateur' || !enfantsDe(id).length)
    for (const c of cibles) {
      const opt = el('option', null, c.id === 'orchestrateur' ? 'Orchestrateur (pôle)' : c.label)
      opt.value = c.id
      modaleParent.appendChild(opt)
    }
    modaleParent.value = m.parentId || ''
  }

  btnSupprimer.classList.toggle('hidden', rang === 0)
  modale.classList.remove('hidden')
  modaleAme.focus()
}

function fermerModale(): void {
  modale.classList.add('hidden')
  membreOuvert = null
}

async function enregistrerModale(): Promise<void> {
  if (!membreOuvert) return
  const id = membreOuvert
  const m = membreParId(id)
  if (!m) return
  const label = modaleNom.value.trim()
  const ame = modaleAme.value
  btnEnregistrer.disabled = true
  try {
    // Le renommage passe en dernier : il peut changer l'identifiant du sous-agent
    // (voir renommerMembre), et les appels suivants viseraient un membre disparu.
    if (ame !== (m.ame || '')) membres = await api.equipe.setAme(id, ame)
    if (modaleParent.value && modaleParent.value !== m.parentId) {
      const res = await api.equipe.reparent(id, modaleParent.value)
      if ('refus' in res) addNote(res.refus, 'err')
      membres = 'refus' in res ? res.membres : res
    }
    if (label && label !== m.label) membres = await api.equipe.rename(id, label)
  } finally {
    btnEnregistrer.disabled = false
  }
  renderEquipe()
  fermerModale()
}

btnEnregistrer.addEventListener('click', enregistrerModale)
$('modale-fermer').addEventListener('click', fermerModale)
modale.querySelector('.modale-fond')!.addEventListener('click', fermerModale)

btnSupprimer.addEventListener('click', async () => {
  if (!membreOuvert) return
  membres = await api.equipe.remove(membreOuvert)
  renderEquipe()
  fermerModale()
})

btnProposer.addEventListener('click', async () => {
  if (!membreOuvert) return
  const label = modaleNom.value.trim() || membreParId(membreOuvert)?.label || ''
  btnProposer.textContent = 'Il y réfléchit…'
  btnProposer.disabled = true
  try {
    const res = await api.equipe.proposerAme(membreOuvert, label)
    if (res?.ame) modaleAme.value = res.ame
    else if (res?.erreur) addNote(res.erreur, 'err')
  } finally {
    btnProposer.textContent = 'Proposer une âme'
    btnProposer.disabled = false
  }
})

modale.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') { e.preventDefault(); fermerModale() }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enregistrerModale() }
})

$('btn-ajouter-pole').addEventListener('click', () => (
  ajouterMembre('orchestrateur', 'Nouveau pôle')
))

$('btn-equipe-defaut').addEventListener('click', async () => {
  membres = await api.equipe.reset()
  renderEquipe()
})

// ====================================================== les pièces jointes
//
// Tout ce que l'utilisateur dépose devient une source que l'équipe ouvrira : image, PDF,
// enregistrement, export de tableur, dossier de code. On ne lit rien ici — on
// prépare la liste, et le message emporte les chemins.

const GLYPHES: Record<string, string> = {
  image: '🖼', video: '🎬', audio: '🎧', document: '📄',
  tableur: '📊', texte: '📝', code: '💻', archive: '🗜', fichier: '📎',
}

function renderPieces(): void {
  piecesEl.replaceChildren()
  piecesEl.classList.toggle('hidden', !piecesEnCours.length)
  for (const piece of piecesEnCours) {
    const puce = el('div', 'piece')
    puce.appendChild(el('span', 'g', GLYPHES[piece.genre] || GLYPHES.fichier))
    const nom = el('span', 'n', piece.nom)
    nom.title = `${piece.libelle} · ${piece.taille}\n${piece.chemin}`
    nom.addEventListener('click', () => api.pieces.ouvrir(piece.chemin))
    puce.appendChild(nom)
    puce.appendChild(el('span', 'm', piece.taille))
    const retirer = el('button', 'x', '×')
    retirer.title = 'Retirer cette pièce'
    retirer.addEventListener('click', () => {
      piecesEnCours = piecesEnCours.filter((x) => x.chemin !== piece.chemin)
      api.pieces.oublier(piece.chemin)
      renderPieces()
      majBouton()
    })
    puce.appendChild(retirer)
    piecesEl.appendChild(puce)
  }
  majBouton()
}

/** Le retour du processus principal : ce qui a été joint, et ce qui a été refusé. */
function accuserPieces(resultat: ResultatPieces | null | undefined): void {
  for (const piece of resultat?.pieces || []) {
    if (!piecesEnCours.some((x) => x.chemin === piece.chemin)) piecesEnCours.push(piece)
  }
  for (const refus of resultat?.refus || []) addNote(refus, 'err')
  renderPieces()
  input.focus()
}

/** Un fichier sans chemin sur le disque (collé, ou glissé depuis une page web). */
function lireEnBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error(`Impossible de lire « ${file.name} ».`))
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1] || '')
    lecteur.readAsDataURL(file)
  })
}

async function joindreFichiers(fichiers: File[]): Promise<void> {
  const chemins: string[] = []
  const sansChemin: File[] = []
  for (const file of fichiers) {
    const chemin = api.pieces.cheminDe(file)
    if (chemin) chemins.push(chemin)
    else sansChemin.push(file)
  }
  if (chemins.length) accuserPieces(await api.pieces.deposer(chemins))
  for (const file of sansChemin) {
    try {
      const base64 = await lireEnBase64(file)
      accuserPieces(await api.pieces.coller(file.name, base64))
    } catch (err) {
      addNote(messageDe(err), 'err')
    }
  }
}

$('btn-joindre').addEventListener('click', async () => {
  accuserPieces(await api.pieces.choisir())
})

// Glisser-déposer sur toute la fenêtre : c'est le geste naturel, et viser le champ
// de saisie au pixel près ne l'est pas.
const porteFichiers = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files')
let profondeurGlisse = 0

window.addEventListener('dragenter', (e) => {
  if (!porteFichiers(e)) return
  profondeurGlisse += 1
  depotEl.classList.remove('hidden')
})
window.addEventListener('dragover', (e) => {
  if (!porteFichiers(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})
window.addEventListener('dragleave', () => {
  profondeurGlisse = Math.max(0, profondeurGlisse - 1)
  if (!profondeurGlisse) depotEl.classList.add('hidden')
})
window.addEventListener('drop', async (e) => {
  profondeurGlisse = 0
  depotEl.classList.add('hidden')
  const fichiers = [...(e.dataTransfer?.files || [])]
  // Un lien glissé depuis le navigateur n'est pas un fichier : il rejoint le texte,
  // où il sera lu comme une source.
  const lien = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
  if (!fichiers.length && !/^https?:\/\//i.test(lien || '')) return
  e.preventDefault()
  if (fichiers.length) {
    await joindreFichiers(fichiers)
    return
  }
  input.value = input.value ? `${input.value.trimEnd()}\n${lien}` : lien || ''
  autoGrow()
  majBouton()
  input.focus()
})

// Coller une capture d'écran : elle n'a pas de fichier d'origine, on l'enregistre.
input.addEventListener('paste', async (e) => {
  const fichiers = [...(e.clipboardData?.files || [])]
  if (!fichiers.length) return
  e.preventDefault()
  await joindreFichiers(fichiers)
})

// ---------------------------------------------------- colonne des livrables

function changerOnglet(nom: 'equipe' | 'livrables'): void {
  $('onglet-equipe').classList.toggle('actif', nom === 'equipe')
  $('onglet-livrables').classList.toggle('actif', nom === 'livrables')
  $('vue-equipe').classList.toggle('hidden', nom !== 'equipe')
  $('vue-livrables').classList.toggle('hidden', nom !== 'livrables')
  api.setConfig({ onglet: nom })
}

$('onglet-equipe').addEventListener('click', () => changerOnglet('equipe'))
$('onglet-livrables').addEventListener('click', () => changerOnglet('livrables'))

async function changerPortee(portee: PorteeLivrables): Promise<void> {
  porteeLivrables = portee
  $('portee-mission').classList.toggle('actif', portee === 'mission')
  $('portee-tous').classList.toggle('actif', portee === 'tous')
  api.setConfig({ porteeLivrables: portee })
  livrables = await api.livrables.list(portee)
  renderLivrables()
}

$('portee-mission').addEventListener('click', () => changerPortee('mission'))
$('portee-tous').addEventListener('click', () => changerPortee('tous'))

function panneauVisible(v: boolean): void {
  document.body.classList.toggle('panneau-cache', !v)
  api.setConfig({ panneauVisible: v })
}

function surlignerLivrable(nom: string): void {
  const fiche = listeLivrables.querySelector(`[data-nom="${CSS.escape(nom)}"]`)
  if (!fiche) return
  fiche.scrollIntoView({ block: 'nearest' })
  fiche.classList.add('recent')
}

/** Les versions d'un livrable, la plus récente en tête. */
async function remplirVersions(hote: HTMLElement, nom: string): Promise<void> {
  hote.replaceChildren(el('div', 'vide', 'Chargement…'))
  const versions = await api.livrables.versions(nom)
  hote.replaceChildren()
  for (const v of versions) {
    const ligne = el('div', `vligne${v.courante ? ' courante' : ''}`)
    ligne.appendChild(el('span', 'vn', v.courante ? `v${v.numero} · en place` : `v${v.numero}`))
    const meta = el('span', 'vd', `${v.mots.toLocaleString('fr-FR')} mots`)
    meta.title = `${v.date}${v.equipe?.length ? ` · ${v.equipe.join(', ')}` : ''}`
    ligne.appendChild(meta)
    const ouvrir = el('button', null, 'Ouvrir')
    ouvrir.addEventListener('click', () => (v.courante ? api.livrables.open(nom) : api.livrables.openVersion(nom, v.numero)))
    const exporter = el('button', null, 'Exporter')
    exporter.title = 'Enregistrer une copie de cette version'
    exporter.addEventListener('click', () => api.livrables.export(nom, v.courante ? undefined : v.numero))
    ligne.append(ouvrir, exporter)
    hote.appendChild(ligne)
  }
}

function ficheLivrable(d: LivrableInfo): HTMLElement {
  const fiche = el('div', 'doc-fiche')
  fiche.dataset.nom = d.nom
  fiche.appendChild(el('div', 't', d.titre))

  const meta = el('div', 'm')
  if (d.version > 1) meta.appendChild(el('span', 'v', `version ${d.version}`))
  meta.appendChild(el('span', null, d.mis_a_jour_le))
  meta.appendChild(el('span', null, `${d.mots.toLocaleString('fr-FR')} mots`))
  fiche.appendChild(meta)
  if (d.equipe?.length) fiche.appendChild(el('div', 'equipe-mini', d.equipe.join(' · ')))

  // Des mots, pas des symboles : on doit savoir ce qu'on clique sans deviner.
  const actions = el('div', 'actions-doc')
  const ouvrir = el('button', 'primary', 'Ouvrir')
  ouvrir.title = `Ouvrir ${d.nom} dans ton éditeur Markdown`
  ouvrir.addEventListener('click', () => api.livrables.open(d.nom))
  const exporter = el('button', null, 'Exporter…')
  exporter.title = 'Enregistrer une copie ailleurs'
  exporter.addEventListener('click', () => api.livrables.export(d.nom))
  actions.append(ouvrir, exporter)
  fiche.appendChild(actions)

  const liens = el('div', 'liens-doc')
  const finder = el('button', 'lien', 'Dans le Finder')
  finder.addEventListener('click', () => api.livrables.reveal(d.nom))
  const sup = el('button', 'lien danger', 'Supprimer')
  sup.addEventListener('click', async () => {
    livrables = await api.livrables.remove(d.nom)
    renderLivrables()
  })
  liens.append(finder, sup)

  if (d.version > 1) {
    const vlist = el('div', 'vlist hidden')
    const plier = el('button', 'lien plier', `${d.version} versions ▾`)
    plier.title = 'Voir les versions précédentes'
    plier.addEventListener('click', () => {
      const ouverte = !vlist.classList.toggle('hidden')
      plier.textContent = `${d.version} versions ${ouverte ? '▴' : '▾'}`
      if (ouverte && !vlist.childElementCount) remplirVersions(vlist, d.nom)
    })
    liens.appendChild(plier)
    fiche.append(liens, vlist)
  } else {
    fiche.appendChild(liens)
  }
  return fiche
}

function renderLivrables(): void {
  listeLivrables.replaceChildren()
  if (!livrables.length) {
    listeLivrables.appendChild(el('div', 'vide', porteeLivrables === 'tous'
      ? 'Aucun livrable pour l\'instant. Donne une mission à l\'équipe.'
      : 'Aucun livrable dans cette mission. Il apparaîtra ici, avec ses versions.'))
    return
  }
  for (const d of livrables) listeLivrables.appendChild(ficheLivrable(d))
}

// --------------------------------------------------------------- permissions

function addPermission(evt: DemandePermission): void {
  finishText()
  finishThinking()
  const [glyph, label] = describeTool(evt.toolName)
  const card = el('div', `msg perm${evt.summary?.danger ? ' danger' : ''}`)
  if (evt.origine) card.appendChild(el('div', 'origine', `Demandé par « ${evt.origine} »`))
  card.appendChild(el('div', 't', evt.title || `${glyph} ${label} ?`))
  const sub = evt.subtitle || evt.reason
  if (sub) card.appendChild(el('div', 's', sub))
  if (evt.hint) card.appendChild(el('div', 's warn', evt.hint))

  const lignes = evt.summary?.lines || []
  if (lignes.length) {
    const mono = MONO_TOOLS.has(evt.toolName)
    const box = el('div', 'summary')
    for (const ligne of lignes) {
      const [tete, ...reste] = String(ligne).split('\n')
      const item = el('div', mono ? 'sline mono' : 'sline')
      item.appendChild(el('span', 'head', tete))
      if (reste.length) item.appendChild(el('span', 'meta', reste.join(' ')))
      box.appendChild(item)
    }
    card.appendChild(box)
    const brut = humanizeInput(evt.input).join('\n')
    if (brut) {
      const pre = el('pre', 'hidden', brut)
      const toggle = el('button', 'detail-toggle', 'Voir le détail technique')
      toggle.addEventListener('click', () => {
        const cache = pre.classList.toggle('hidden')
        toggle.textContent = cache ? 'Voir le détail technique' : 'Masquer le détail'
      })
      card.append(toggle, pre)
    }
  } else {
    const detail = evt.toolName === 'Bash' ? String(evt.input?.command || '') : humanizeInput(evt.input).join('\n')
    if (detail) card.appendChild(el('pre', null, detail))
  }

  const btns = el('div', 'btns')
  const repondre = (a: ReponsePermission) => {
    if (!permsEnAttente.includes(entree)) return
    permsEnAttente.splice(permsEnAttente.indexOf(entree), 1)
    api.replyPermission(evt.id, a)
    card.classList.add('answered')
    card.classList.remove('active')
    card.appendChild(el('div', 's', a.behavior === 'allow' ? (a.always ? '✓ Toujours autorisé' : '✓ Autorisé') : '✕ Refusé'))
    refreshActivePerm()
    input.focus()
  }
  const entree: PermissionEnAttente = {
    id: evt.id,
    allow: () => repondre({ behavior: 'allow' }),
    deny: () => repondre({ behavior: 'deny', message: "Refusé par l'utilisateur." }),
    card,
  }
  permsEnAttente.push(entree)

  const oui = el('button', 'primary')
  oui.append(document.createTextNode('Autoriser'), el('kbd', null, '↩'))
  oui.addEventListener('click', () => entree.allow())
  const non = el('button', null)
  non.append(document.createTextNode('Refuser'), el('kbd', null, 'esc'))
  non.addEventListener('click', () => entree.deny())

  if (evt.allowAlways) {
    const toujours = el('button', null, 'Toujours')
    toujours.addEventListener('click', () => repondre({ behavior: 'allow', always: true }))
    btns.append(oui, toujours, non)
  } else {
    btns.append(oui, non)
  }
  card.appendChild(btns)
  card.appendChild(el('div', 'kb-hint', 'Champ vide : ↩ autorise, esc refuse.'))
  add(card)
  refreshActivePerm()
  scrollDown(true)
}

function refreshActivePerm(): void {
  for (const p of permsEnAttente) p.card.classList.remove('active')
  permsEnAttente[0]?.card.classList.add('active')
}

// --------------------------------------------------------------------- état

function setBusy(v: boolean): void {
  busy = v
  document.body.classList.toggle('busy', v)
  sendBtn.disabled = !v && !input.value.trim() && !piecesEnCours.length
  if (!v) {
    // Personne ne travaille plus : les fanions « au travail » restés allumés
    // mentiraient sur l'état de l'équipe.
    for (const [id, etat] of etatsMembres) if (etat === 'travaille') marquerMembre(id, null)
  }
}

function setStatus(text: string, kind?: string): void {
  statusLine.replaceChildren(el('span', `dot ${kind || ''}`), document.createTextNode(text))
}

function statutEquipe(): void {
  const n = Math.max(0, membres.length - 1)
  const socle = totalLivrables
    ? `${n} membre${n > 1 ? 's' : ''} · ${totalLivrables} livrable${totalLivrables > 1 ? 's' : ''}`
    : `${n} membre${n > 1 ? 's' : ''} dans l'équipe`
  const bref = afficherMoteur()
  setStatus(bref ? `${socle} · ${bref}` : socle, 'ok')
  // La ligne est tronquée dans une fenêtre étroite : la phrase entière reste en bulle.
  statusLine.title = moteurEl.textContent || ''
}

// ------------------------------------------------------ le moteur du moment

/** Les identifiants d'API, tels qu'ils s'écrivent dans la fenêtre. */
const NOMS_MODELES: Record<string, string> = {
  'claude-opus-5': 'Opus 5',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-haiku-4-5': 'Haiku 4.5',
}
const NOMS_EFFORT: Record<string, string> = {
  low: 'faible', medium: 'moyen', high: 'élevé', xhigh: 'très élevé', max: 'maximal',
}
const nomModele = (id: string) => NOMS_MODELES[id] || id || 'modèle inconnu'
const nomEffort = (e: string) => NOMS_EFFORT[e] || e || 'inconnu'

/**
 * Écrit dans les réglages ce qui tourne vraiment — pas ce qui est coché dans les deux
 * menus au-dessus : le modèle vient de ce que le SDK annonce au démarrage de la
 * session, et les deux diffèrent tant qu'elle n'a pas redémarré. Renvoie la version
 * courte, pour la ligne sous le titre.
 */
function afficherMoteur(): string {
  // Avant le premier message, aucune session n'est ouverte et le SDK n'a rien annoncé :
  // on montre alors ce qui partira, tel qu'il est coché juste au-dessus.
  const vif = Boolean(moteur)
  const modele = moteur ? moteur.model : modelSelect.value
  const effort = moteur ? moteur.effort : effortPrevu
  const eq = (moteur ? moteur.modeleEquipe : modeleEquipeSelect.value) || 'inherit'

  const m = nomModele(modele)
  const e = nomEffort(effort)
  const equipe = eq === 'inherit'
    ? "L'équipe travaille avec le même modèle."
    : `L'équipe travaille avec ${nomModele(eq)}.`
  moteurEl.textContent = `${vif ? 'En ce moment' : 'Au prochain message'} : ${m}, effort ${e}. ${equipe}`
  return `${m} · effort ${e}`
}

// -------------------------------------------------------------------- envoi

/**
 * Envoie, même si l'équipe travaille encore : le message rejoint la file d'entrée et
 * l'orchestrateur refait son plan avec. C'est le comportement de Claude Code, et
 * c'est ce qui permet de réorienter une mission en cours.
 */
function submit(forced?: string): void {
  const text = (forced ?? input.value).trim()
  const pieces = piecesEnCours
  // Des pièces sans un mot valent une demande : « regarde ça ».
  if (!text && !pieces.length) return
  pushUserMessage(text || 'Analyse la ou les pièces jointes.', busy, pieces)
  api.send(text, pieces)
  piecesEnCours = []
  renderPieces()
  input.value = ''
  autoGrow()
  setBusy(true)
  majBouton()
}

/** Le bouton envoie tant qu'il y a de quoi ; il n'arrête l'équipe que sur un champ vide. */
function majBouton(): void {
  const aQuoiEnvoyer = !!input.value.trim() || piecesEnCours.length > 0
  document.body.classList.toggle('peut-envoyer', aQuoiEnvoyer)
  if (!busy) sendBtn.disabled = !aQuoiEnvoyer
}

function autoGrow(): void {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 168)}px`
}

input.addEventListener('input', () => {
  autoGrow()
  majBouton()
})

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
})

// Le zoom. Le menu Affichage porte ⌘+, ⌘− et ⌘0 ; on rattrape ici les touches
// qu'il ne voit pas — ⌘= (le « + » d'un clavier français demande Maj) et le pavé
// numérique. Avant tout le reste : le zoom marche même une carte ouverte.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return
  const t = e.key === 'Add' ? '+' : e.key
  if (t === '+' || t === '=') { e.preventDefault(); api.zoom(+1) }
  else if (t === '-' || t === '_' || t === 'Subtract') { e.preventDefault(); api.zoom(-1) }
  else if (t === '0') { e.preventDefault(); api.zoom(0) }
}, true)

document.addEventListener('keydown', (e) => {
  if (!modale.classList.contains('hidden') || !modaleEquipes.classList.contains('hidden')) return
  const pending = permsEnAttente[0]
  if (pending) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !input.value.trim()) {
      e.preventDefault(); e.stopPropagation(); pending.allow(); return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pending.deny(); return }
    return
  }
  if (e.key === 'Escape' && busy) { e.preventDefault(); api.interrupt() }
  if (e.key.toLowerCase() === 'a' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    api.pieces.choisir().then(accuserPieces)
  }
}, true)

sendBtn.addEventListener('click', () => {
  if (input.value.trim() || piecesEnCours.length) submit()
  else if (busy) api.interrupt()
})

$('btn-new').addEventListener('click', nouvelleMission)
$('btn-settings').addEventListener('click', () => panneauReglages.classList.toggle('hidden'))
$('btn-panneau').addEventListener('click', () => {
  panneauVisible(document.body.classList.contains('panneau-cache'))
})
$('btn-ouvrir-dossier').addEventListener('click', () => api.openDossier())
$('btn-ouvrir-dossier-2').addEventListener('click', () => api.openDossier())
$('btn-choisir').addEventListener('click', async () => {
  const res = await api.choisirDossier()
  dossier = res.dossier
  livrables = res.livrables
  cheminDossier.textContent = dossier
  renderLivrables()
  statutEquipe()
})

modelSelect.addEventListener('change', () => {
  api.setConfig({ model: modelSelect.value })
  // L'orchestrateur change de modèle à chaud, sans redémarrer la session : il n'y aura
  // pas de nouvel « init » à attendre pour rafraîchir l'affichage.
  if (moteur) { moteur.model = modelSelect.value; statutEquipe() }
})
modeleEquipeSelect.addEventListener('change', () => {
  api.setConfig({ modeleEquipe: modeleEquipeSelect.value })
  // Changer le modèle de l'équipe repart sur des sessions neuves : plus rien de vivant
  // à annoncer, on retombe sur ce qui est coché.
  moteur = null
  statutEquipe()
})
ampleurSelect.addEventListener('change', () => api.setConfig({ ampleur: ampleurSelect.value as PatchConfig['ampleur'] }))
langueSelect.addEventListener('change', () => api.setConfig({ langue: langueSelect.value }))
autonomieSelect.addEventListener('change', () => api.setConfig({ autonomie: autonomieSelect.value as PatchConfig['autonomie'] }))

document.addEventListener('click', (e) => {
  const lien = (e.target as Element | null)?.closest('a[data-ext]')
  if (!lien) return
  e.preventDefault()
  api.openExternal(lien.getAttribute('href') || '')
})

// ------------------------------------------------------- fils enregistrés

/**
 * Repeint un fil à partir de ce que l'application avait enregistré. On ne rejoue ni
 * la réflexion ni les demandes de validation : ce sont des instants, pas des traces.
 * Le reste — ce que l'utilisateur a demandé, qui a travaillé, ce qui a été publié — se
 * retrouve exactement à sa place.
 */
function restaurer(evenements: EvenementFil[]): void {
  permsEnAttente.length = 0
  enFile = []
  toolEls = new Map()
  convocEls = new Map()
  currentText = null
  currentThinking = null
  etatsMembres.clear()
  renderEquipe()
  thread.replaceChildren()

  if (!evenements?.length) {
    showWelcome()
    return
  }

  for (const e of evenements) {
    switch (e.k) {
      case 'user': {
        const bulle = el('div', 'msg user', e.texte)
        if (e.pieces?.length) bulle.appendChild(pucesPieces(e.pieces))
        thread.appendChild(bulle)
        break
      }
      case 'texte': {
        const n = el('div', 'msg assistant md')
        n.innerHTML = renderMarkdown(e.texte)
        thread.appendChild(n)
        break
      }
      case 'outil':
        thread.appendChild(noeudOutil(e.nom, e.arg, ''))
        break
      case 'contribution':
        thread.appendChild(carteConvocation({
          label: e.membre, etat: e.etat || 'livre', texte: e.apercu, taille: e.taille,
        }))
        break
      case 'livrable':
        thread.appendChild(carteLivrable({
          nom: e.nom, titre: e.titre, mots: e.mots || 0, equipe: e.equipe || [],
          version: e.version, remplace: e.remplace,
        }))
        break
      case 'note':
        thread.appendChild(el('div', `note${e.kind ? ` ${e.kind}` : ''}`, e.texte))
        break
    }
  }
  scrollDown(true)
}

// -------------------------------------------------------- barre latérale

function barreVisible(v: boolean): void {
  document.body.classList.toggle('barre-cachee', !v)
  api.setConfig({ barreVisible: v })
}

function montrerBarre(): void {
  if (document.body.classList.contains('barre-cachee')) barreVisible(true)
}

/** Ce qu'on veut voir d'un coup d'œil : ce qui tourne, et ce qui est resté en plan. */
const ETATS: Partial<Record<string, { texte: string, cls: string }>> = {
  en_cours: { texte: 'en cours', cls: 'vif' },
  en_attente: { texte: 'en attente', cls: 'calme' },
  interrompu: { texte: 'interrompue', cls: 'tiede' },
  incomplet: { texte: 'inachevée', cls: 'tiede' },
}

function dateCourte(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  const jours = Math.floor((Date.now() - +d) / 86400000)
  if (jours <= 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (jours === 1) return 'hier'
  if (jours < 7) return `il y a ${jours} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function renderMissions(): void {
  listeMissions.replaceChildren()
  if (!missions.length) {
    listeMissions.appendChild(el('div', 'vide', recherche.value.trim()
      ? 'Rien qui corresponde.'
      : 'Tes missions s\'empileront ici, une par sujet.'))
    return
  }
  for (const c of missions) {
    const ligne = el('div', `conv${c.id === missionCourante ? ' active' : ''}${c.sansTitre ? ' sans-titre' : ''}`)
    const infos = el('div', 'infos')
    const titre = el('div', 't', c.titre)
    const meta = el('div', 'm')
    meta.appendChild(el('span', null, dateCourte(c.maj_le)))
    if (c.livrables) meta.appendChild(el('span', 'docs-n', `${c.livrables} livrable${c.livrables > 1 ? 's' : ''}`))
    const badge = ETATS[c.statut ?? '']
    if (badge) meta.appendChild(el('span', `etat ${badge.cls}`, badge.texte))
    infos.append(titre, meta)

    infos.addEventListener('click', () => {
      if (titre.isContentEditable || c.id === missionCourante) return
      ouvrirMission(c.id)
    })
    // Renommer sur place : le titre automatique n'est pas toujours le bon.
    titre.addEventListener('dblclick', () => {
      titre.contentEditable = 'plaintext-only'
      titre.focus()
      document.getSelection()?.selectAllChildren(titre)
    })
    const finEdition = async (garder: boolean) => {
      if (!titre.isContentEditable) return
      const valeur = (titre.textContent || '').trim()
      titre.contentEditable = 'false'
      if (garder && valeur && valeur !== c.titre) {
        missions = await api.mission.rename(c.id, valeur)
      }
      renderMissions()
    }
    titre.addEventListener('blur', () => finEdition(true))
    titre.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finEdition(true) }
      if (e.key === 'Escape') { e.preventDefault(); finEdition(false) }
      e.stopPropagation()
    })

    ligne.appendChild(infos)
    if (c.statut === 'interrompu' || c.statut === 'incomplet') {
      const rep = el('button', 'rep', '↻')
      rep.title = 'Reprendre cette mission'
      rep.addEventListener('click', async (e) => {
        e.stopPropagation()
        setBusy(true)
        await api.mission.resume(c.id)
      })
      ligne.appendChild(rep)
    }
    const sup = el('button', 'sup', '×')
    sup.title = 'Supprimer cette mission'
    sup.addEventListener('click', async (e) => {
      e.stopPropagation()
      missions = await api.mission.remove(c.id)
      renderMissions()
    })
    ligne.appendChild(sup)
    listeMissions.appendChild(ligne)
  }
}

async function ouvrirMission(id: string): Promise<void> {
  missionCourante = await api.mission.open(id)
  input.focus()
}

async function nouvelleMission(): Promise<void> {
  montrerBarre()
  recherche.value = ''
  missionCourante = await api.mission.create()
  input.focus()
}

let minuteurRecherche: ReturnType<typeof setTimeout> | undefined
recherche.addEventListener('input', () => {
  clearTimeout(minuteurRecherche)
  minuteurRecherche = setTimeout(async () => {
    missions = await api.mission.list(recherche.value)
    renderMissions()
  }, 130)
})
recherche.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') {
    recherche.value = ''
    recherche.dispatchEvent(new Event('input'))
  }
})

$('btn-new-barre').addEventListener('click', nouvelleMission)
$('btn-barre').addEventListener('click', () => {
  barreVisible(document.body.classList.contains('barre-cachee'))
})

// -------------------------------------------------------------- événements

api.onEvent((evt) => {
  switch (evt.k) {
    case 'ready':
      moteur = { model: evt.model, effort: evt.effort, modeleEquipe: evt.modeleEquipe }
      afficherMoteur()
      if (evt.outils === 'connected') statutEquipe()
      else setStatus(`Outils OpenSpace : ${evt.outils}`, 'err')
      break
    case 'equipe':
      appliquerEtatEquipe(evt)
      statutEquipe()
      break
    case 'livrables':
      livrables = evt.livrables
      if (evt.portee) porteeLivrables = evt.portee
      if (typeof evt.total === 'number') totalLivrables = evt.total
      renderLivrables()
      statutEquipe()
      break
    case 'status':
      setBusy(evt.state === 'thinking')
      if (evt.state === 'idle') statutEquipe()
      break
    case 'turn-start': setBusy(true); break
    case 'queued': setBusy(true); break
    case 'text-start': startTextBlock(); break
    case 'text-delta': appendText(evt.text); break
    case 'thinking-start': startThinking(); break
    case 'thinking-delta': appendThinking(evt.text); break
    case 'tool-use': addTool(evt); break
    case 'tool-result': endTool(evt); break
    case 'membre': addConvocation(evt); break
    case 'contribution': finirConvocation(evt); break
    case 'livrable': addLivrable(evt); break
    case 'permission': addPermission(evt); break
    case 'result':
      finishText(); finishThinking()
      if (evt.isError && evt.text) {
        addNote(evt.text, 'err')
        if (evt.reprenable) proposerReprise()
      }
      setBusy(false)
      break
    case 'interrupted':
      finishText(); finishThinking()
      addNote('Interrompu.')
      proposerReprise()
      setBusy(false)
      break
    case 'note': addNote(evt.text); break
    case 'reprise-possible': proposerReprise(); break
    case 'resumed': addNote('Reprise de la mission précédente.'); break
    case 'mission':
      // Changer de fil : les pièces préparées pour l'autre mission ne partent pas
      // avec celle-ci. On les oublie, fichiers copiés compris.
      if (missionCourante && evt.id !== missionCourante && piecesEnCours.length) {
        for (const piece of piecesEnCours) api.pieces.oublier(piece.chemin)
        piecesEnCours = []
        renderPieces()
      }
      missionCourante = evt.id
      restaurer(evt.evenements)
      // Une mission qui travaillait pendant qu'on regardait ailleurs travaille toujours.
      setBusy(evt.statut === 'en_cours')
      if (evt.statut === 'en_attente') {
        addNote("En attente d'une place : deux missions travaillent déjà. Elle partira toute seule.")
      }
      // Une mission laissée en plan se signale à l'ouverture, pas seulement dans la liste.
      if (evt.evenements?.length && (evt.statut === 'interrompu' || evt.statut === 'incomplet')) {
        proposerReprise('↻ Reprendre cette mission')
      }
      break
    case 'missions':
      missions = evt.liste
      if (evt.courante) missionCourante = evt.courante
      renderMissions()
      break
    case 'basculer-barre':
      barreVisible(document.body.classList.contains('barre-cachee'))
      break
    case 'basculer-panneau':
      panneauVisible(document.body.classList.contains('panneau-cache'))
      break
    case 'ouvrir-equipes':
      panneauVisible(true)
      changerOnglet('equipe')
      ouvrirModaleEquipes()
      break
    case 'error':
      finishText(); finishThinking()
      addNote(evt.message, 'err')
      setBusy(false)
      break
  }
})

// ---------------------------------------------------------------- démarrage

const state = await api.init()
modelSelect.value = state.config.model
modeleEquipeSelect.value = state.config.modeleEquipe || 'inherit'
effortPrevu = state.config.effort || effortPrevu
ampleurSelect.value = state.config.ampleur || 'document'
langueSelect.value = state.config.langue || 'français'
autonomieSelect.value = state.config.autonomie || 'auto'
dossier = state.dossier
cheminDossier.textContent = dossier
livrables = state.livrables || []
totalLivrables = state.totalLivrables || 0
missions = state.missions || []
membres = state.membres || []
equipes = state.equipes || []
equipeActive = state.equipeActive || null
document.body.classList.toggle('barre-cachee', state.config.barreVisible === false)
document.body.classList.toggle('panneau-cache', state.config.panneauVisible === false)
appliquerLargeur(barre, state.config.largeurBarre)
appliquerLargeur(panneau, state.config.largeurPanneau)
porteeLivrables = state.config.porteeLivrables || 'mission'
$('portee-tous').classList.toggle('actif', porteeLivrables === 'tous')
$('portee-mission').classList.toggle('actif', porteeLivrables !== 'tous')
changerOnglet(state.config.onglet || 'equipe')
renderEquipe()
renderPieces()
renderLivrables()
renderMissions()
statutEquipe()
showWelcome()
setBusy(false)
input.focus()
