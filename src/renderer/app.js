import { renderMarkdown } from './markdown.js'

const api = window.openspace
const thread = document.getElementById('thread')
const scroll = document.getElementById('scroll')
const input = document.getElementById('input')
const sendBtn = document.getElementById('btn-send')
const statusLine = document.getElementById('status-line')
const panneauReglages = document.getElementById('settings')
const modelSelect = document.getElementById('model')
const modeleEquipeSelect = document.getElementById('modele-equipe')
const ampleurSelect = document.getElementById('ampleur')
const langueSelect = document.getElementById('langue')
const autonomieSelect = document.getElementById('autonomie')
const cheminDossier = document.getElementById('chemin-dossier')
const barre = document.getElementById('barre')
const panneau = document.getElementById('panneau')
const recherche = document.getElementById('recherche')
const listeMissions = document.getElementById('liste-missions')
const listeLivrables = document.getElementById('liste-livrables')
const arbreEl = document.getElementById('arbre')
const selectEquipe = document.getElementById('equipe-active')
const listeEquipesEl = document.getElementById('liste-equipes')
const modaleEquipes = document.getElementById('modale-equipes')
const piecesEl = document.getElementById('pieces')
const depotEl = document.getElementById('depot')

let busy = false
let currentText = null
let currentThinking = null
let toolEls = new Map()
/** La carte ouverte pour chaque membre en train de travailler. */
let convocEls = new Map()
let livrables = []
let missions = []
let missionCourante = null
let membres = []
/** Les équipes rangées, et celle qui travaille. */
let equipes = []
let equipeActive = null
/** Les pièces jointes préparées pour le prochain message. */
let piecesEnCours = []
let dossier = ''
let porteeLivrables = 'mission'
let totalLivrables = 0
/** L'état vivant de chaque membre pendant une mission : travaille, livre, echec. */
const etatsMembres = new Map()
const permsEnAttente = []
/** Messages écrits pendant qu'ils travaillaient, pas encore repris par l'orchestrateur. */
let enFile = []

// ------------------------------------------------------------------ outils

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

const nearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90
let stick = true
scroll.addEventListener('scroll', () => { stick = nearBottom() })

function scrollDown(force) {
  if (force) stick = true
  if (stick) scroll.scrollTop = scroll.scrollHeight
}

function add(node) {
  thread.appendChild(node)
  scrollDown()
  return node
}

const membreParId = (id) => membres.find((m) => m.id === id) || null
const enfantsDe = (id) => membres.filter((m) => m.parentId === id)
const initiales = (label) => String(label || '?')
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
  box.appendChild(el('h1', null, `${salut} l'utilisateur 👋`))
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
function pucesPieces(pieces) {
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

const OUTILS = {
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

const BUILTIN = {
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

function describeTool(name) {
  if (name.startsWith('mcp__openspace__')) {
    const court = name.slice('mcp__openspace__'.length)
    return OUTILS[court] || ['📄', court.replace(/_/g, ' ')]
  }
  if (BUILTIN[name]) return BUILTIN[name]
  if (name.startsWith('mcp__')) return ['🔌', name.split('__').slice(1).join(' · ')]
  return ['•', name]
}

function summarizeInput(name, input) {
  if (!input || typeof input !== 'object') return ''
  if (name === 'Bash') return String(input.command || '')
  if (name.endsWith('rediger_livrable')) return String(input.titre || '')
  if (input.file_path) return String(input.file_path).split('/').pop()
  for (const k of ['subagent_type', 'url', 'query', 'nom', 'titre', 'description', 'pattern']) {
    if (typeof input[k] === 'string' && input[k]) return input[k]
  }
  const first = Object.values(input).find((v) => typeof v === 'string' && v)
  return first ? String(first) : ''
}

const MONO_TOOLS = new Set(['Bash', 'Write', 'Edit'])

const ETIQUETTES = {
  titre: 'titre', mission: 'mission', nom: 'fichier', markdown: 'document',
  subagent_type: 'membre', prompt: 'brief', description: 'objet',
  command: 'commande', file_path: 'fichier', query: 'recherche', url: 'adresse',
  numero: 'version',
}

function humanizeInput(value, depth = 0, lines = []) {
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

function pushUserMessage(text, enAttente, pieces) {
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

function startTextBlock() {
  dropWelcome()
  videEnFile()
  finishThinking()
  const node = el('div', 'msg assistant md')
  currentText = { el: node, raw: '' }
  add(node)
}

let renderQueued = false
function appendText(chunk) {
  if (!currentText) startTextBlock()
  currentText.raw += chunk
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

function startThinking() {
  finishText()
  if (currentThinking) return
  const node = el('div', 'msg thinking')
  currentThinking = { el: node, raw: '' }
  add(node)
}

function appendThinking(chunk) {
  if (!currentThinking) startThinking()
  currentThinking.raw += chunk
  currentThinking.el.textContent = currentThinking.raw
  currentThinking.el.scrollTop = currentThinking.el.scrollHeight
  scrollDown()
}

function finishThinking() {
  if (currentThinking) currentThinking.el.classList.add('done')
  currentThinking = null
}

function addTool(evt) {
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
function noeudOutil(nom, arg, detail) {
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

function endTool(evt) {
  const node = toolEls.get(evt.id)
  if (!node) return
  node.classList.remove('running')
  node.classList.add(evt.ok ? 'ok' : 'err')
  const body = node.querySelector('.body')
  if (evt.preview) body.textContent = `${body.textContent}\n\n— — —\n${evt.preview}`
  if (!evt.ok) node.classList.add('open')
}

// ------------------------------------------------- le travail de l'équipe

/** La carte d'un membre convoqué : elle s'allume au départ, se remplit au retour. */
function carteConvocation({ label, brief, etat = 'travaille', texte = '', taille = 0 }) {
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
    if (node.querySelector('.body').textContent.trim()) node.classList.toggle('open')
  })
  return node
}

function addConvocation(evt) {
  videEnFile()
  finishText()
  finishThinking()
  const node = carteConvocation({ label: evt.label, brief: evt.brief })
  convocEls.set(evt.id, node)
  add(node)
  marquerMembre(evt.id, 'travaille')
  scrollDown(true)
}

function finirConvocation(evt) {
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
  const etat = node.querySelector('.etat')
  etat.textContent = evt.etat === 'echec' ? '✕' : `${Math.max(1, Math.round((evt.taille || 0) / 100) / 10)} k`
  const body = node.querySelector('.body')
  body.textContent = evt.texte || evt.apercu || ''
  if (evt.etat === 'echec') node.classList.add('open')
  scrollDown()
}

function marquerMembre(id, etat) {
  if (etat) etatsMembres.set(id, etat)
  else etatsMembres.delete(id)
  const ligne = arbreEl.querySelector(`[data-membre="${CSS.escape(id)}"]`)
  if (!ligne) return
  ligne.classList.remove('travaille', 'livre', 'echec')
  if (etat) ligne.classList.add(etat)
  const fanion = ligne.querySelector('.fanion')
  if (fanion) fanion.textContent = FANIONS[etat] || ''
}

const FANIONS = { travaille: 'au travail', livre: 'a rendu', echec: 'en échec' }

// -------------------------------------------------------- livrable produit

function carteLivrable(d) {
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

function addLivrable(evt) {
  finishText()
  finishThinking()
  add(carteLivrable(evt.livrable))
  scrollDown(true)
}

function addNote(text, kind) {
  finishText()
  add(el('div', `note${kind ? ` ${kind}` : ''}`, text))
}

/**
 * Un tour s'est arrêté en route. Plutôt qu'un message d'erreur, on offre la reprise :
 * l'application rebranche la session sur son contexte et redemande la suite.
 */
function proposerReprise(texte) {
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

function appliquerLargeur(colonne, px) {
  colonne.style.flex = px ? `0 0 ${px}px` : ''
}

function poser(poignee, colonne, cote, cle) {
  poignee.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    poignee.setPointerCapture(e.pointerId)
    poignee.classList.add('glisse')
    document.body.classList.add('redimensionne')
    const depart = e.clientX
    const initiale = colonne.offsetWidth
    let derniere = initiale

    const bouge = (ev) => {
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

poser(document.getElementById('poignee-barre'), barre, 'gauche', 'largeurBarre')
poser(document.getElementById('poignee-panneau'), panneau, 'droite', 'largeurPanneau')

// ============================================================ l'équipe

function ligneMembre(m, rang) {
  const ligne = el('div', `membre rang-${rang}${rang === 0 ? ' orchestrateur' : ''}`)
  ligne.dataset.membre = m.id
  const etat = etatsMembres.get(m.id)
  if (etat) ligne.classList.add(etat)

  ligne.appendChild(el('div', 'pastille', initiales(m.label)))
  const infos = el('div', 'infos')
  infos.appendChild(el('div', 't', m.label))
  const sousTitre = m.ame?.trim()
    ? premiereLigneUtile(m.ame)
    : 'âme à écrire'
  infos.appendChild(el('div', `m${m.ame?.trim() ? '' : ' sans-ame'}`, sousTitre))
  ligne.appendChild(infos)
  ligne.appendChild(el('span', 'fanion', FANIONS[etat] || ''))

  // Ajouter sous ce membre : un pôle sous l'orchestrateur, un spécialiste sous un pôle.
  if (rang < 2) {
    const plus = el('button', 'plus', '+')
    plus.title = rang === 0 ? 'Ajouter un pôle' : 'Ajouter un spécialiste'
    plus.addEventListener('click', async (e) => {
      e.stopPropagation()
      const label = rang === 0 ? 'Nouveau pôle' : 'Nouveau spécialiste'
      membres = await api.equipe.add(m.id, label)
      renderEquipe()
      const cree = [...membres].reverse().find((x) => x.parentId === m.id)
      if (cree) ouvrirModale(cree.id)
    })
    ligne.appendChild(plus)
  }

  ligne.addEventListener('click', () => ouvrirModale(m.id))

  // Glisser-déposer : c'est la façon naturelle de réorganiser un organigramme.
  if (rang > 0) {
    ligne.draggable = true
    ligne.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', m.id)
      e.dataTransfer.effectAllowed = 'move'
      ligne.classList.add('glisse')
    })
    ligne.addEventListener('dragend', () => ligne.classList.remove('glisse'))
  }
  if (rang < 2) {
    ligne.addEventListener('dragover', (e) => {
      const id = e.dataTransfer.getData('text/plain')
      if (id === m.id) return
      e.preventDefault()
      ligne.classList.add('cible')
    })
    ligne.addEventListener('dragleave', () => ligne.classList.remove('cible'))
    ligne.addEventListener('drop', async (e) => {
      e.preventDefault()
      ligne.classList.remove('cible')
      const id = e.dataTransfer.getData('text/plain')
      if (!id || id === m.id) return
      const res = await api.equipe.reparent(id, m.id)
      if (res?.refus) {
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

function premiereLigneUtile(ame) {
  const ligne = String(ame).split('\n').map((l) => l.trim())
    .find((l) => l && !/^tu es\b/i.test(l))
  return (ligne || String(ame).trim().split('\n')[0] || '').replace(/^(Rôle|Âme)\s*:\s*/i, '').slice(0, 90)
}

function renderEquipe() {
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
function appliquerEtatEquipe(etat) {
  if (!etat) return
  if (etat.refus) addNote(etat.refus, 'err')
  if (Array.isArray(etat.membres)) membres = etat.membres
  if (Array.isArray(etat.equipes)) equipes = etat.equipes
  if (etat.equipeActive) equipeActive = etat.equipeActive
  renderEquipe()
  if (!modaleEquipes.classList.contains('hidden')) renderListeEquipes()
}

function renderSelecteurEquipes() {
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

function renderListeEquipes() {
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

function ouvrirModaleEquipes() {
  renderListeEquipes()
  modaleEquipes.classList.remove('hidden')
  listeEquipesEl.querySelector('.en')?.focus()
}

function fermerModaleEquipes() {
  modaleEquipes.classList.add('hidden')
}

document.getElementById('btn-equipes').addEventListener('click', ouvrirModaleEquipes)
document.getElementById('equipes-fermer').addEventListener('click', fermerModaleEquipes)
modaleEquipes.querySelector('.modale-fond').addEventListener('click', fermerModaleEquipes)
document.getElementById('equipes-fichier').addEventListener('click', () => api.equipe.openFile())
document.getElementById('equipes-nouvelle').addEventListener('click', async () => {
  appliquerEtatEquipe(await api.equipe.creer(`Équipe ${equipes.length + 1}`, 'defaut'))
})
document.getElementById('equipes-copie').addEventListener('click', async () => {
  appliquerEtatEquipe(await api.equipe.creer(`${equipeActive?.nom || 'Équipe'} (copie)`, 'actuelle'))
})
modaleEquipes.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') { e.preventDefault(); fermerModaleEquipes() }
})

// ------------------------------------------------------------- modale âme

const modale = document.getElementById('modale')
const modaleNom = document.getElementById('modale-nom')
const modaleSous = document.getElementById('modale-titre')
const modaleAme = document.getElementById('modale-ame')
const modaleParent = document.getElementById('modale-rattachement')
const modaleParentRow = modale.querySelector('.modale-parent')
const btnProposer = document.getElementById('modale-proposer')
const btnSupprimer = document.getElementById('modale-supprimer')
const btnEnregistrer = document.getElementById('modale-enregistrer')

let membreOuvert = null

function rangDe(id) {
  const m = membreParId(id)
  if (!m || !m.parentId) return 0
  return membreParId(m.parentId)?.parentId ? 2 : 1
}

function ouvrirModale(id) {
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
      .filter(Boolean)
      .filter((c) => c.id !== id)
      .filter((c) => c.id === m.parentId || c.id === 'orchestrateur' || !enfantsDe(id).length)
    for (const c of cibles) {
      const opt = el('option', null, c.id === 'orchestrateur' ? 'Orchestrateur (pôle)' : c.label)
      opt.value = c.id
      modaleParent.appendChild(opt)
    }
    modaleParent.value = m.parentId
  }

  btnSupprimer.classList.toggle('hidden', rang === 0)
  modale.classList.remove('hidden')
  modaleAme.focus()
}

function fermerModale() {
  modale.classList.add('hidden')
  membreOuvert = null
}

async function enregistrerModale() {
  if (!membreOuvert) return
  const id = membreOuvert
  const m = membreParId(id)
  const label = modaleNom.value.trim()
  const ame = modaleAme.value
  btnEnregistrer.disabled = true
  try {
    if (label && label !== m.label) membres = await api.equipe.rename(id, label)
    if (ame !== (m.ame || '')) membres = await api.equipe.setAme(id, ame)
    if (modaleParent.value && modaleParent.value !== m.parentId) {
      const res = await api.equipe.reparent(id, modaleParent.value)
      if (res?.refus) addNote(res.refus, 'err')
      membres = res?.refus ? res.membres : res
    }
  } finally {
    btnEnregistrer.disabled = false
  }
  renderEquipe()
  fermerModale()
}

btnEnregistrer.addEventListener('click', enregistrerModale)
document.getElementById('modale-fermer').addEventListener('click', fermerModale)
modale.querySelector('.modale-fond').addEventListener('click', fermerModale)

btnSupprimer.addEventListener('click', async () => {
  if (!membreOuvert) return
  membres = await api.equipe.remove(membreOuvert)
  renderEquipe()
  fermerModale()
})

btnProposer.addEventListener('click', async () => {
  if (!membreOuvert) return
  const label = modaleNom.value.trim() || membreParId(membreOuvert)?.label
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

document.getElementById('btn-ajouter-pole').addEventListener('click', async () => {
  membres = await api.equipe.add('orchestrateur', 'Nouveau pôle')
  renderEquipe()
  const cree = [...membres].reverse().find((x) => x.parentId === 'orchestrateur')
  if (cree) ouvrirModale(cree.id)
})

document.getElementById('btn-equipe-defaut').addEventListener('click', async () => {
  membres = await api.equipe.reset()
  renderEquipe()
})

// ====================================================== les pièces jointes
//
// Tout ce que l'utilisateur dépose devient une source que l'équipe ouvrira : image, PDF,
// enregistrement, export de tableur, dossier de code. On ne lit rien ici — on
// prépare la liste, et le message emporte les chemins.

const GLYPHES = {
  image: '🖼', video: '🎬', audio: '🎧', document: '📄',
  tableur: '📊', texte: '📝', code: '💻', archive: '🗜', fichier: '📎',
}

function renderPieces() {
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
function accuserPieces(resultat) {
  for (const piece of resultat?.pieces || []) {
    if (!piecesEnCours.some((x) => x.chemin === piece.chemin)) piecesEnCours.push(piece)
  }
  for (const refus of resultat?.refus || []) addNote(refus, 'err')
  renderPieces()
  input.focus()
}

/** Un fichier sans chemin sur le disque (collé, ou glissé depuis une page web). */
function lireEnBase64(file) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error(`Impossible de lire « ${file.name} ».`))
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1] || '')
    lecteur.readAsDataURL(file)
  })
}

async function joindreFichiers(fichiers) {
  const chemins = []
  const sansChemin = []
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
      addNote(String(err?.message || err), 'err')
    }
  }
}

document.getElementById('btn-joindre').addEventListener('click', async () => {
  accuserPieces(await api.pieces.choisir())
})

// Glisser-déposer sur toute la fenêtre : c'est le geste naturel, et viser le champ
// de saisie au pixel près ne l'est pas.
const porteFichiers = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
let profondeurGlisse = 0

window.addEventListener('dragenter', (e) => {
  if (!porteFichiers(e)) return
  profondeurGlisse += 1
  depotEl.classList.remove('hidden')
})
window.addEventListener('dragover', (e) => {
  if (!porteFichiers(e)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
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
  input.value = input.value ? `${input.value.trimEnd()}\n${lien}` : lien
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

function changerOnglet(nom) {
  document.getElementById('onglet-equipe').classList.toggle('actif', nom === 'equipe')
  document.getElementById('onglet-livrables').classList.toggle('actif', nom === 'livrables')
  document.getElementById('vue-equipe').classList.toggle('hidden', nom !== 'equipe')
  document.getElementById('vue-livrables').classList.toggle('hidden', nom !== 'livrables')
  api.setConfig({ onglet: nom })
}

document.getElementById('onglet-equipe').addEventListener('click', () => changerOnglet('equipe'))
document.getElementById('onglet-livrables').addEventListener('click', () => changerOnglet('livrables'))

async function changerPortee(portee) {
  porteeLivrables = portee
  document.getElementById('portee-mission').classList.toggle('actif', portee === 'mission')
  document.getElementById('portee-tous').classList.toggle('actif', portee === 'tous')
  api.setConfig({ porteeLivrables: portee })
  livrables = await api.livrables.list(portee)
  renderLivrables()
}

document.getElementById('portee-mission').addEventListener('click', () => changerPortee('mission'))
document.getElementById('portee-tous').addEventListener('click', () => changerPortee('tous'))

function panneauVisible(v) {
  document.body.classList.toggle('panneau-cache', !v)
  api.setConfig({ panneauVisible: v })
}

function surlignerLivrable(nom) {
  const fiche = listeLivrables.querySelector(`[data-nom="${CSS.escape(nom)}"]`)
  if (!fiche) return
  fiche.scrollIntoView({ block: 'nearest' })
  fiche.classList.add('recent')
}

/** Les versions d'un livrable, la plus récente en tête. */
async function remplirVersions(hote, nom) {
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

function ficheLivrable(d) {
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

function renderLivrables() {
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

function addPermission(evt) {
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
  const entree = { id: evt.id }
  const repondre = (a) => {
    if (!permsEnAttente.includes(entree)) return
    permsEnAttente.splice(permsEnAttente.indexOf(entree), 1)
    api.replyPermission(evt.id, a)
    card.classList.add('answered')
    card.classList.remove('active')
    card.appendChild(el('div', 's', a.behavior === 'allow' ? (a.always ? '✓ Toujours autorisé' : '✓ Autorisé') : '✕ Refusé'))
    refreshActivePerm()
    input.focus()
  }
  entree.allow = () => repondre({ behavior: 'allow' })
  entree.deny = () => repondre({ behavior: 'deny', message: 'Refusé par l'utilisateur.' })
  entree.card = card
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

function refreshActivePerm() {
  for (const p of permsEnAttente) p.card.classList.remove('active')
  permsEnAttente[0]?.card.classList.add('active')
}

// --------------------------------------------------------------------- état

function setBusy(v) {
  busy = v
  document.body.classList.toggle('busy', v)
  sendBtn.disabled = !v && !input.value.trim() && !piecesEnCours.length
  if (!v) {
    // Personne ne travaille plus : les fanions « au travail » restés allumés
    // mentiraient sur l'état de l'équipe.
    for (const [id, etat] of etatsMembres) if (etat === 'travaille') marquerMembre(id, null)
  }
}

function setStatus(text, kind) {
  statusLine.replaceChildren(el('span', `dot ${kind || ''}`), document.createTextNode(text))
}

function statutEquipe() {
  const n = Math.max(0, membres.length - 1)
  setStatus(totalLivrables
    ? `${n} membre${n > 1 ? 's' : ''} · ${totalLivrables} livrable${totalLivrables > 1 ? 's' : ''}`
    : `${n} membre${n > 1 ? 's' : ''} dans l'équipe`, 'ok')
}

// -------------------------------------------------------------------- envoi

/**
 * Envoie, même si l'équipe travaille encore : le message rejoint la file d'entrée et
 * l'orchestrateur refait son plan avec. C'est le comportement de Claude Code, et
 * c'est ce qui permet de réorienter une mission en cours.
 */
function submit(forced) {
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
function majBouton() {
  const aQuoiEnvoyer = !!input.value.trim() || piecesEnCours.length > 0
  document.body.classList.toggle('peut-envoyer', aQuoiEnvoyer)
  if (!busy) sendBtn.disabled = !aQuoiEnvoyer
}

function autoGrow() {
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

document.getElementById('btn-new').addEventListener('click', nouvelleMission)
document.getElementById('btn-settings').addEventListener('click', () => panneauReglages.classList.toggle('hidden'))
document.getElementById('btn-panneau').addEventListener('click', () => {
  panneauVisible(document.body.classList.contains('panneau-cache'))
})
document.getElementById('btn-ouvrir-dossier').addEventListener('click', () => api.openDossier())
document.getElementById('btn-ouvrir-dossier-2').addEventListener('click', () => api.openDossier())
document.getElementById('btn-choisir').addEventListener('click', async () => {
  const res = await api.choisirDossier()
  dossier = res.dossier
  livrables = res.livrables
  cheminDossier.textContent = dossier
  renderLivrables()
  statutEquipe()
})

modelSelect.addEventListener('change', () => api.setConfig({ model: modelSelect.value }))
modeleEquipeSelect.addEventListener('change', () => api.setConfig({ modeleEquipe: modeleEquipeSelect.value }))
ampleurSelect.addEventListener('change', () => api.setConfig({ ampleur: ampleurSelect.value }))
langueSelect.addEventListener('change', () => api.setConfig({ langue: langueSelect.value }))
autonomieSelect.addEventListener('change', () => api.setConfig({ autonomie: autonomieSelect.value }))

document.addEventListener('click', (e) => {
  const lien = e.target.closest('a[data-ext]')
  if (!lien) return
  e.preventDefault()
  api.openExternal(lien.getAttribute('href'))
})

// ------------------------------------------------------- fils enregistrés

/**
 * Repeint un fil à partir de ce que l'application avait enregistré. On ne rejoue ni
 * la réflexion ni les demandes de validation : ce sont des instants, pas des traces.
 * Le reste — ce que l'utilisateur a demandé, qui a travaillé, ce qui a été publié — se
 * retrouve exactement à sa place.
 */
function restaurer(evenements) {
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

function barreVisible(v) {
  document.body.classList.toggle('barre-cachee', !v)
  api.setConfig({ barreVisible: v })
}

function montrerBarre() {
  if (document.body.classList.contains('barre-cachee')) barreVisible(true)
}

/** Ce qu'on veut voir d'un coup d'œil : ce qui tourne, et ce qui est resté en plan. */
const ETATS = {
  en_cours: { texte: 'en cours', cls: 'vif' },
  en_attente: { texte: 'en attente', cls: 'calme' },
  interrompu: { texte: 'interrompue', cls: 'tiede' },
  incomplet: { texte: 'inachevée', cls: 'tiede' },
}

function dateCourte(iso) {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  const jours = Math.floor((Date.now() - d) / 86400000)
  if (jours <= 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (jours === 1) return 'hier'
  if (jours < 7) return `il y a ${jours} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function renderMissions() {
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
    const badge = ETATS[c.statut]
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
    const finEdition = async (garder) => {
      if (!titre.isContentEditable) return
      const valeur = titre.textContent.trim()
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

async function ouvrirMission(id) {
  missionCourante = await api.mission.open(id)
  input.focus()
}

async function nouvelleMission() {
  montrerBarre()
  recherche.value = ''
  missionCourante = await api.mission.create()
  input.focus()
}

let minuteurRecherche = null
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

document.getElementById('btn-new-barre').addEventListener('click', nouvelleMission)
document.getElementById('btn-barre').addEventListener('click', () => {
  barreVisible(document.body.classList.contains('barre-cachee'))
})

// -------------------------------------------------------------- événements

api.onEvent((evt) => {
  switch (evt.k) {
    case 'ready':
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
document.getElementById('portee-tous').classList.toggle('actif', porteeLivrables === 'tous')
document.getElementById('portee-mission').classList.toggle('actif', porteeLivrables !== 'tous')
changerOnglet(state.config.onglet || 'equipe')
renderEquipe()
renderPieces()
renderLivrables()
renderMissions()
statutEquipe()
showWelcome()
setBusy(false)
input.focus()
