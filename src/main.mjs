import { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setDataRoot, setLivrables, livrablesParDefaut, P } from './espace/paths.mjs'
import { AgentSession, EFFORT } from './agent/session.mjs'
import { Pool, MAX_EN_PARALLELE } from './agent/pool.mjs'
import { PROMPT_VERSION } from './agent/prompt.mjs'
import { proposerAme } from './agent/ame.mjs'
import {
  listerLivrables, lireLivrable, supprimerLivrable, versionsLivrable, lireVersion, LISEZ_MOI,
} from './espace/livrables.mjs'
import * as Equipe from './espace/equipe.mjs'
import * as Missions from './espace/missions.mjs'
import * as Pieces from './espace/pieces.mjs'
import { tracer, cheminJournal } from './espace/journal.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG_DEFAUT = {
  model: 'claude-opus-5',
  // Le modèle des sous-agents. « inherit » : la même finesse pour toute l'équipe.
  modeleEquipe: 'inherit',
  // Longueur visée du livrable. Voir agent/equipe.mjs.
  ampleur: 'document',
  langue: 'français',
  // « auto » : l'équipe mène la mission seule, sans rien faire valider.
  // « prudent » : une carte s'ouvre avant ce qui sort du dossier des livrables et
  // avant un effacement.
  autonomie: 'auto',
  livrables: null,
  barreVisible: true,
  panneauVisible: true,
  // Largeur des colonnes latérales, en pixels. null = un tiers de la fenêtre.
  largeurBarre: null,
  largeurPanneau: null,
  // « equipe » (l'organigramme) ou « livrables » : ce que montre la colonne de droite.
  onglet: 'equipe',
  // « mission » : seuls les livrables du fil ouvert. « tous » : tout le dossier.
  porteeLivrables: 'mission',
  bounds: null,
  // Grossissement de l'interface, en crans (⌘+ / ⌘−). 0 = taille réelle.
  zoom: 0,
  mission: null,
  promptVersion: 0,
}

let config = { ...CONFIG_DEFAUT }
let configPath = ''
let win = null
let pool = null
let quitting = false

/** La mission regardée dans la fenêtre. Les autres continuent sans elle. */
let courante = null
/** Les règles ont changé : on n'essaie pas de reprendre les fils d'avant. */
let resumeInterdit = false

const permissionsEnAttente = new Map()
let seqPermission = 0

// ------------------------------------------------------------------ config

function loadConfig() {
  configPath = path.join(app.getPath('userData'), 'reglages.json')
  try {
    config = { ...CONFIG_DEFAUT, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }
  } catch {
    config = { ...CONFIG_DEFAUT }
  }
  // Des dimensions enregistrées incomplètes donneraient une fenêtre minuscule.
  const voulue = boundsParDefaut()
  if (config.bounds && !(config.bounds.width > 0 && config.bounds.height > 0)) {
    config.bounds = {
      ...config.bounds,
      width: config.bounds.width > 0 ? config.bounds.width : voulue.width,
      height: config.bounds.height > 0 ? config.bounds.height : voulue.height,
    }
  }
  saveConfig()
}

/**
 * Un peu moins de la moitié de l'écran : la fenêtre se partage en trois colonnes —
 * missions, fil, équipe — et l'organigramme a besoin d'air. Plancher à 560 px pour un
 * petit écran, où les colonnes latérales se replient de toute façon.
 */
function boundsParDefaut() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return {
    width: Math.max(560, Math.round(width * 0.44)),
    height: Math.round(height * 0.92),
  }
}

let saveTimer = null
function saveConfig() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    } catch {}
  }, 300)
}

function ensureDossier() {
  setLivrables(config.livrables || livrablesParDefaut())
  const lisezMoi = path.join(P.livrables(), LISEZ_MOI)
  if (!fs.existsSync(lisezMoi) && !listerLivrables().length) {
    fs.writeFileSync(lisezMoi, [
      '# Tes livrables',
      '',
      "Les documents produits par l'équipe OpenSpace atterrissent ici, en Markdown,",
      'un fichier par mission. Ce sont des fichiers ordinaires : ouvre-les, déplace-les,',
      'sauvegarde-les avec le reste de tes documents.',
      '',
      'Chacun se termine par un générique : version, dates, et les pôles qui ont réellement',
      'travaillé dessus. Les versions précédentes sont rangées dans « Versions ».',
      '',
    ].join('\n'))
  }
}

// ----------------------------------------------------------------- fenêtre

function createWindow() {
  const { width, height, x, y } = config.bounds || boundsParDefaut()
  win = new BrowserWindow({
    width, height, x, y,
    minWidth: 460,
    minHeight: 540,
    show: false,
    title: 'Assistant OpenSpace',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('did-start-loading', () => { rendererPret = false })
  // Un changement de page remet le zoom à zéro : on le repose à chaque chargement.
  win.webContents.on('did-finish-load', () => win.webContents.setZoomLevel(config.zoom || 0))
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.once('ready-to-show', () => win.show())

  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide() }
  })
  const memoriser = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return
    config.bounds = win.getBounds()
    saveConfig()
  }
  win.on('resize', memoriser)
  win.on('move', memoriser)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ------------------------------------------------------------------- zoom

// Le zoom d'Electron est logarithmique : un cran vaut 20 % de plus. On borne
// pour que l'interface reste utilisable, et on garde le réglage d'une fois sur l'autre.
const ZOOM_MIN = -4
const ZOOM_MAX = 6

function appliquerZoom(crans) {
  const n = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(crans)))
  config.zoom = n
  if (win && !win.isDestroyed()) win.webContents.setZoomLevel(n)
  saveConfig()
}

function zoomer(delta) {
  appliquerZoom((config.zoom || 0) + delta)
}

// Le renderer n'écoute qu'après son chargement : on met les événements de démarrage
// en attente pour ne pas perdre l'état de connexion.
let rendererPret = false
const enAttente = []

function emit(evt) {
  if (!rendererPret) {
    enAttente.push(evt)
    if (enAttente.length > 200) enAttente.shift()
    return
  }
  if (win && !win.isDestroyed()) win.webContents.send('agent', evt)
}

function viderAttente() {
  rendererPret = true
  for (const evt of enAttente.splice(0, enAttente.length)) {
    if (win && !win.isDestroyed()) win.webContents.send('agent', evt)
  }
}

// ------------------------------------------------------- mémoire des fils
//
// Ce que la fenêtre a affiché est réenregistré au fil de l'eau : le SDK sait
// reprendre le contexte du modèle, pas ce qu'on avait sous les yeux.

/** Le texte en cours de frappe du modèle, par fil : plusieurs écrivent à la fois. */
const tampons = new Map()

function viderTampon(missionId) {
  const t = (tampons.get(missionId) || '').trim()
  tampons.delete(missionId)
  if (t) majListe(Missions.ajouter(missionId, { k: 'texte', texte: t }))
}

/**
 * Les livrables à montrer : ceux de la mission ouverte, ou tout le dossier.
 *
 * Un livrable appartient à la mission qui l'a produit. Voir ceux des autres fils en
 * travaillant sur un sujet n'aide personne — d'où le tri par défaut.
 */
function livrablesAffiches(portee = config.porteeLivrables, missionId = courante?.id) {
  const tous = listerLivrables()
  if (portee === 'tous' || !missionId) return tous
  const siens = new Set(Missions.livrablesDe(missionId))
  return tous.filter((d) => siens.has(d.nom))
}

function diffuserLivrables() {
  emit({
    k: 'livrables',
    livrables: livrablesAffiches(),
    portee: config.porteeLivrables,
    total: listerLivrables().length,
  })
}

function diffuserEquipe() {
  emit({ k: 'equipe', ...etatEquipe() })
}

/** Ce que la colonne de droite a besoin de savoir : l'organigramme en service, et les autres. */
function etatEquipe() {
  const membres = Equipe.chargerEquipe()
  const active = Equipe.equipeActive()
  return {
    membres,
    arbre: Equipe.arbre(membres),
    equipes: Equipe.equipes(),
    equipeActive: { id: active.id, nom: active.nom },
  }
}

/** La liste des missions, chacune portant son état réel : en cours, en attente, en plan. */
const ETAT_VISIBLE = { travaille: 'en_cours', attend: 'en_attente' }

function listeMissions(recherche) {
  const etats = pool ? pool.etats() : new Map()
  return Missions.lister(recherche).map((m) => {
    const vif = ETAT_VISIBLE[etats.get(m.id)]
    return vif ? { ...m, statut: vif } : m
  })
}

function majListe(resume) {
  if (!resume) return
  if (resume.id === courante?.id) courante = { ...courante, ...resume }
  diffuserListe()
}

function diffuserListe() {
  emit({ k: 'missions', liste: listeMissions(), courante: courante?.id || null })
}

function noterUtilisateur(missionId, texte, pieces) {
  viderTampon(missionId)
  majListe(Missions.ajouter(missionId, {
    k: 'user',
    texte,
    pieces: pieces?.length ? pieces.map((p) => ({ nom: p.nom, genre: p.genre, libelle: p.libelle, taille: p.taille, chemin: p.chemin })) : undefined,
  }))
}

/** Un argument d'outil lisible en une ligne, pour rejouer le fil plus tard. */
function argOutil(input) {
  if (!input || typeof input !== 'object') return ''
  for (const k of ['subagent_type', 'titre', 'nom', 'url', 'query', 'command', 'pattern', 'file_path']) {
    if (typeof input[k] === 'string' && input[k]) return input[k].slice(0, 200)
  }
  return ''
}

function noterEvenement(missionId, evt) {
  switch (evt.k) {
    case 'text-start':
      viderTampon(missionId)
      break
    case 'text-delta':
      tampons.set(missionId, (tampons.get(missionId) || '') + evt.text)
      break
    case 'tool-use':
      // Une convocation n'est pas un appel d'outil comme un autre : elle a sa propre
      // carte, écrite quand le membre rend son travail.
      if (evt.name === 'Agent') break
      viderTampon(missionId)
      majListe(Missions.ajouter(missionId, { k: 'outil', nom: evt.name, arg: argOutil(evt.input) }))
      break
    case 'contribution':
      viderTampon(missionId)
      majListe(Missions.ajouter(missionId, {
        k: 'contribution', id: evt.id, membre: evt.membre, etat: evt.etat,
        taille: evt.taille, apercu: evt.apercu,
      }))
      break
    case 'livrable':
      viderTampon(missionId)
      majListe(Missions.ajouter(missionId, {
        k: 'livrable',
        nom: evt.livrable.nom,
        titre: evt.livrable.titre,
        mots: evt.livrable.mots,
        equipe: evt.livrable.equipe,
        version: evt.livrable.version,
        remplace: evt.livrable.remplace,
      }))
      break
    case 'result':
      viderTampon(missionId)
      majListe(Missions.marquerStatut(missionId, evt.isError ? 'incomplet' : 'termine'))
      break
    case 'interrupted':
      viderTampon(missionId)
      majListe(Missions.marquerStatut(missionId, 'interrompu'))
      break
    case 'error':
      viderTampon(missionId)
      Missions.marquerStatut(missionId, 'incomplet')
      majListe(Missions.ajouter(missionId, { k: 'note', texte: evt.message, kind: 'err' }))
      break
  }
}

/**
 * Un événement arrive d'un fil — pas forcément celui qu'on regarde. Il est toujours
 * enregistré dans SON fil ; il n'est affiché que s'il vient du fil ouvert. C'est ce
 * qui permet à deux missions de tourner sans se mélanger.
 */
function routerEvenement(missionId, evt) {
  if (evt.k === 'ready' || evt.k === 'error') tracer('agent', missionId, evt.k, evt)

  if (evt.k === 'ready' && evt.sessionId) Missions.memoriserSession(missionId, evt.sessionId)
  // Le modèle a nommé la mission : on ne recouvre pas un titre posé à la main.
  if (evt.k === 'titre') majListe(Missions.renommer(missionId, evt.titre, { manuel: false }))
  noterEvenement(missionId, evt)

  // Le livrable est rattaché à sa mission : la colonne de droite ne bouge que si c'est
  // ce fil qu'on regarde — ou si on a demandé à voir tout le dossier.
  if (evt.k === 'livrable' && (missionId === courante?.id || config.porteeLivrables === 'tous')) {
    diffuserLivrables()
  }

  // Le tour est fini : la place se libère et la file avance.
  if (evt.k === 'result' || evt.k === 'interrupted') pool.finDeTour(missionId)

  if (missionId === courante?.id) emit(evt)
  else if (evt.k === 'livrable' || evt.k === 'result') diffuserListe()
}

// --------------------------------------------------------------- permission

function askPermission(req) {
  return new Promise((resolve) => {
    const id = `perm-${++seqPermission}`
    permissionsEnAttente.set(id, resolve)
    const onAbort = () => {
      if (permissionsEnAttente.delete(id)) resolve({ behavior: 'deny', message: 'Annulé.' })
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })

    emit({
      k: 'permission',
      id,
      origine: req.missionId && req.missionId !== courante?.id
        ? (Missions.fil(req.missionId)?.titre || 'une autre mission')
        : null,
      toolName: req.toolName,
      title: req.title,
      displayName: req.displayName,
      subtitle: req.subtitle,
      reason: req.reason,
      summary: req.summary,
      hint: req.hint,
      allowAlways: req.allowAlways !== false,
      input: req.input,
    })
    if (win && !win.isVisible()) win.show()
  })
}

function resolvePermission(id, reponse) {
  const resolve = permissionsEnAttente.get(id)
  if (!resolve) return
  permissionsEnAttente.delete(id)
  resolve(reponse)
}

function refuserToutes(message) {
  for (const [id, resolve] of permissionsEnAttente) {
    permissionsEnAttente.delete(id)
    resolve({ behavior: 'deny', message })
  }
}

// ---------------------------------------------------------------- missions

/**
 * Ouvre un fil : on change ce qu'on regarde, rien d'autre.
 *
 * Ce qui travaille dans les autres fils continue de travailler — c'est tout l'intérêt
 * d'avoir plusieurs sessions. Naviguer ne coûte rien et n'annule rien.
 */
function ouvrirMission(id, { neuve = false } = {}) {
  if (!neuve && id && id === courante?.id) {
    peindreMission()
    return courante
  }

  if (courante) viderTampon(courante.id)
  if (id) viderTampon(id)

  const m = (id && Missions.fil(id)) || null
  courante = m || Missions.creer()
  config.mission = courante.id
  saveConfig()

  pool.afficher(courante.id)
  peindreMission(m?.evenements || [])
  return courante
}

/** L'identifiant de session à reprendre pour ce fil, s'il en a un d'exploitable. */
function repriseDe(missionId) {
  if (resumeInterdit) return undefined
  return Missions.fil(missionId)?.sessionId || undefined
}

function peindreMission(evenements) {
  diffuserLivrables()
  emit({
    k: 'mission',
    id: courante.id,
    titre: courante.titre || null,
    statut: ETAT_VISIBLE[pool?.etat(courante.id)] || courante.statut || null,
    evenements: evenements || Missions.fil(courante.id)?.evenements || [],
  })
  diffuserListe()
}

/**
 * Reprend une mission laissée en plan : on rebranche la session sur son contexte et on
 * demande la suite. C'est la sortie de secours quand un tour s'arrête tout seul.
 */
function reprendreMission(id) {
  const cible = id || courante?.id
  if (!cible) return null
  const consigne = "Reprends exactement où tu t'étais arrêté, sans refaire ce qui est déjà fait. "
    + "Si des pôles ont déjà rendu, ne les reconvoque pas : convoque ceux qui manquent, puis publie. "
    + "Si tu as déjà de quoi écrire quelque chose d'utile, publie d'abord une version du livrable, "
    + 'puis continue à l\'enrichir.'
  return demander(cible, consigne)
}

/**
 * Achemine une demande vers son fil. Si deux missions travaillent déjà, elle attend
 * son tour — et on le dit, plutôt que de laisser croire qu'il ne se passe rien.
 */
function demander(missionId, texte, pieces = []) {
  noterUtilisateur(missionId, texte, pieces)
  // Ce que le modèle reçoit n'est pas tout à fait ce que l'utilisateur a tapé : les
  // pièces jointes deviennent des chemins à ouvrir, les adresses collées des
  // sources à lire. Le fil, lui, garde le message tel qu'il a été écrit.
  const message = `${texte}${Pieces.blocPieces(pieces)}${Pieces.blocLiens(Pieces.liensDuTexte(texte))}`
  const sort = pool.envoyer(missionId, message)
  if (sort === 'attente') {
    const note = `En attente : ${MAX_EN_PARALLELE} missions travaillent déjà. `
      + 'Celle-ci partira dès qu\'une place se libère — tu peux continuer à écrire en attendant.'
    majListe(Missions.ajouter(missionId, { k: 'note', texte: note }))
    if (missionId === courante?.id) emit({ k: 'note', text: note })
  }
  diffuserListe()
  return missionId
}

// ------------------------------------------------------------------ équipe

/**
 * L'organigramme définit les sous-agents d'une session : le modifier en cours de
 * route laisserait des sessions branchées sur une équipe qui n'existe plus. On les
 * arrête donc, et on le dit — le contexte de chaque mission, lui, est enregistré.
 */
function equipeModifiee(membres) {
  Equipe.enregistrerEquipe(membres)
  equipeChangee('Équipe modifiée : la suite repart sur un contexte neuf.')
  return Equipe.chargerEquipe()
}

/** L'organigramme en service n'est plus le même : on le diffuse et on repart à neuf. */
function equipeChangee(note) {
  diffuserEquipe()
  emit({ k: 'note', text: note })
  pool.toutArreter()
  diffuserListe()
  return etatEquipe()
}

// ---------------------------------------------------------------------- IPC

function ouvrirFichier(chemin) {
  if (chemin && fs.existsSync(chemin)) shell.openPath(chemin)
}

function wireIpc() {
  ipcMain.handle('app:init', () => {
    setImmediate(viderAttente)
    const membres = Equipe.chargerEquipe()
    return {
      config: {
        model: config.model,
        modeleEquipe: config.modeleEquipe || 'inherit',
        // L'effort n'est pas réglable : la fenêtre l'affiche, elle ne le choisit pas.
        effort: EFFORT,
        ampleur: config.ampleur,
        langue: config.langue,
        autonomie: config.autonomie || 'auto',
        barreVisible: config.barreVisible !== false,
        panneauVisible: config.panneauVisible !== false,
        largeurBarre: config.largeurBarre,
        largeurPanneau: config.largeurPanneau,
        onglet: config.onglet || 'equipe',
        porteeLivrables: config.porteeLivrables || 'mission',
      },
      dossier: P.livrables(),
      livrables: livrablesAffiches(),
      totalLivrables: listerLivrables().length,
      missions: listeMissions(),
      membres,
      ...etatEquipe(),
      version: app.getVersion(),
    }
  })

  ipcMain.on('chat:send', (_e, { texte, pieces } = {}) => {
    const propre = String(texte || '').trim()
    if (!courante) return
    // Une pièce jointe seule est une demande en soi : « regarde ça ».
    if (!propre && !pieces?.length) return
    demander(courante.id, propre || 'Analyse la ou les pièces jointes.', pieces || [])
  })
  ipcMain.on('chat:interrupt', () => { if (courante) pool.interrompre(courante.id) })
  ipcMain.on('chat:config', (_e, patch) => {
    Object.assign(config, patch)
    saveConfig()
    if (patch.model) pool.setModel(patch.model)
    // Ampleur, langue, autonomie et modèle d'équipe vivent dans les consignes : les
    // sessions repartent.
    if (patch.ampleur || patch.langue || patch.autonomie || patch.modeleEquipe) {
      emit({ k: 'note', text: 'Nouvelles règles de travail : la suite repart sur un contexte neuf.' })
      pool.toutArreter()
      diffuserListe()
    }
  })
  ipcMain.on('perm:reply', (_e, { id, answer }) => resolvePermission(id, answer))

  ipcMain.handle('mission:list', (_e, recherche) => listeMissions(recherche))
  ipcMain.handle('mission:new', () => ouvrirMission(null, { neuve: true }).id)
  ipcMain.handle('mission:open', (_e, id) => ouvrirMission(id).id)
  ipcMain.handle('mission:resume', (_e, id) => reprendreMission(id))
  ipcMain.handle('mission:rename', (_e, { id, titre }) => {
    const r = Missions.renommer(id, titre)
    if (r && courante?.id === id) courante = { ...courante, ...r }
    return listeMissions()
  })
  ipcMain.handle('mission:delete', (_e, id) => {
    pool.oublier(id)
    Missions.supprimer(id)
    if (courante?.id === id) {
      const suivante = Missions.lister()[0]
      ouvrirMission(suivante?.id || null, { neuve: !suivante })
    }
    return listeMissions()
  })

  // ---------------------------------------------------------------- équipe

  ipcMain.handle('equipe:get', () => etatEquipe())
  ipcMain.handle('equipe:ajouter', (_e, { parentId, label }) => {
    const membres = Equipe.ajouterMembre(Equipe.chargerEquipe(), parentId, label)
    return equipeModifiee(membres)
  })
  ipcMain.handle('equipe:renommer', (_e, { id, label }) => (
    equipeModifiee(Equipe.renommerMembre(Equipe.chargerEquipe(), id, label))
  ))
  ipcMain.handle('equipe:ame', (_e, { id, ame }) => (
    equipeModifiee(Equipe.definirAme(Equipe.chargerEquipe(), id, ame))
  ))
  ipcMain.handle('equipe:rattacher', (_e, { id, parentId }) => {
    const membres = Equipe.chargerEquipe()
    if (!Equipe.peutRattacher(id, parentId, membres)) {
      return { membres, refus: "Ce rattachement casserait l'organigramme : trois niveaux au maximum, et un pôle qui encadre reste un pôle." }
    }
    return equipeModifiee(Equipe.rattacher(membres, id, parentId))
  })
  ipcMain.handle('equipe:supprimer', async (_e, id) => {
    const membres = Equipe.chargerEquipe()
    const m = Equipe.membre(id, membres)
    if (!m || id === Equipe.ORCHESTRATEUR) return membres
    const emportes = Equipe.sousArbre(id, membres).size - 1
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Retirer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      message: `Retirer « ${m.label} » de l'équipe ?`,
      detail: emportes
        ? `${emportes} spécialiste(s) rattaché(s) partent avec lui. Son âme est perdue.`
        : 'Son âme est perdue. Les livrables déjà produits ne changent pas.',
    })
    if (response !== 0) return membres
    return equipeModifiee(Equipe.supprimerMembre(membres, id))
  })
  ipcMain.handle('equipe:defaut', () => equipeModifiee(Equipe.equipeParDefaut()))

  // --------------------------------------------- le gestionnaire d'équipes
  //
  // Changer d'équipe, c'est changer les sous-agents branchés sur la session : on
  // repart donc sur un contexte neuf, comme pour toute modification d'organigramme.

  ipcMain.handle('equipes:activer', (_e, id) => {
    Equipe.activerEquipe(id)
    return equipeChangee(`Équipe « ${Equipe.equipeActive().nom} » : la suite repart sur un contexte neuf.`)
  })
  ipcMain.handle('equipes:creer', (_e, { nom, depuis } = {}) => {
    Equipe.creerEquipe(nom, depuis === 'actuelle' ? Equipe.chargerEquipe() : undefined)
    return equipeChangee(`Nouvelle équipe « ${Equipe.equipeActive().nom} » : la suite repart sur un contexte neuf.`)
  })
  ipcMain.handle('equipes:dupliquer', (_e, id) => {
    Equipe.dupliquerEquipe(id)
    return equipeChangee(`Copie « ${Equipe.equipeActive().nom} » : la suite repart sur un contexte neuf.`)
  })
  ipcMain.handle('equipes:renommer', (_e, { id, nom }) => {
    Equipe.renommerEquipe(id, nom)
    diffuserEquipe()
    return etatEquipe()
  })
  ipcMain.handle('equipes:supprimer', async (_e, id) => {
    const cible = Equipe.equipes().find((x) => x.id === id)
    if (!cible) return etatEquipe()
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Supprimer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      message: `Supprimer l'équipe « ${cible.nom} » ?`,
      detail: `${cible.membres - 1} membre(s) et leurs âmes disparaissent. Les livrables déjà produits ne changent pas.`,
    })
    if (response !== 0) return etatEquipe()
    try {
      Equipe.supprimerEquipe(id)
    } catch (err) {
      return { ...etatEquipe(), refus: String(err?.message || err) }
    }
    // Supprimer celle qui travaillait bascule sur une autre : les sessions suivent.
    return cible.actif
      ? equipeChangee(`Équipe « ${Equipe.equipeActive().nom} » : la suite repart sur un contexte neuf.`)
      : etatEquipe()
  })
  ipcMain.handle('equipe:proposer-ame', async (_e, { id, label }) => {
    try {
      const ame = await proposerAme({
        id, label, membres: Equipe.chargerEquipe(), model: config.model,
      })
      return { ame }
    } catch (err) {
      return { erreur: String(err?.message || err) }
    }
  })
  ipcMain.on('equipe:ouvrir-fichier', () => ouvrirFichier(P.equipes()))

  // ---------------------------------------------------------- pièces jointes
  //
  // Tout ce que l'utilisateur dépose est copié dans les données de la mission : l'agent
  // travaille sur une copie stable, et le fil retrouve ses pièces des semaines plus
  // tard même si l'original a bougé.

  const joindreTout = (chemins) => {
    const pieces = []
    const refus = []
    for (const chemin of chemins || []) {
      try {
        pieces.push(Pieces.joindre(courante?.id, chemin))
      } catch (err) {
        refus.push(String(err?.message || err))
      }
    }
    return { pieces, refus }
  }

  ipcMain.handle('pieces:choisir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Joindre des fichiers à la mission',
      buttonLabel: 'Joindre',
      properties: ['openFile', 'multiSelections'],
    })
    if (canceled || !filePaths?.length) return { pieces: [], refus: [] }
    return joindreTout(filePaths)
  })
  ipcMain.handle('pieces:deposer', (_e, chemins) => joindreTout(chemins))
  ipcMain.handle('pieces:coller', (_e, { nom, base64 }) => {
    try {
      return { pieces: [Pieces.joindreDonnees(courante?.id, { nom, base64 })], refus: [] }
    } catch (err) {
      return { pieces: [], refus: [String(err?.message || err)] }
    }
  })
  ipcMain.on('pieces:oublier', (_e, chemin) => Pieces.oublier(chemin))
  ipcMain.on('pieces:ouvrir', (_e, chemin) => ouvrirFichier(chemin))

  // -------------------------------------------------------------- livrables

  ipcMain.handle('livrables:list', (_e, portee) => livrablesAffiches(portee))
  ipcMain.handle('livrables:versions', (_e, nom) => {
    try { return versionsLivrable(nom) } catch { return [] }
  })
  ipcMain.on('livrables:open-version', (_e, { nom, numero }) => {
    try { ouvrirFichier(lireVersion(nom, numero).chemin) } catch {}
  })

  // Exporter, c'est sortir une copie du dossier : l'original ne bouge pas.
  ipcMain.handle('livrables:export', async (_e, { nom, numero } = {}) => {
    try {
      const doc = lireLivrable(nom)
      const source = numero ? lireVersion(nom, numero).chemin : doc.chemin
      const base = doc.nom.replace(/\.md$/, '')
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Exporter le livrable',
        defaultPath: path.join(app.getPath('downloads'), numero ? `${base}-v${numero}.md` : `${base}.md`),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (canceled || !filePath) return { annule: true }
      fs.copyFileSync(source, filePath)
      shell.showItemInFolder(filePath)
      return { chemin: filePath }
    } catch (err) {
      return { erreur: String(err?.message || err) }
    }
  })
  ipcMain.on('livrables:open', (_e, nom) => {
    try { ouvrirFichier(lireLivrable(nom).chemin) } catch {}
  })
  ipcMain.on('livrables:reveal', (_e, nom) => {
    try { shell.showItemInFolder(lireLivrable(nom).chemin) } catch {}
  })
  ipcMain.handle('livrables:delete', async (_e, nom) => {
    try {
      const doc = lireLivrable(nom)
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Supprimer', 'Annuler'],
        defaultId: 1,
        cancelId: 1,
        message: `Supprimer « ${doc.titre} » ?`,
        detail: `${doc.nom} — ${doc.mots} mots. Le fichier part à la corbeille.`,
      })
      if (response !== 0) return livrablesAffiches()
      await shell.trashItem(doc.chemin).catch(() => supprimerLivrable(nom))
    } catch {}
    const liste = livrablesAffiches()
    diffuserLivrables()
    return liste
  })

  ipcMain.handle('app:choisir-dossier', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Où ranger les livrables ?',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: P.livrables(),
    })
    if (canceled || !filePaths?.[0]) return { dossier: P.livrables(), livrables: listerLivrables() }
    config.livrables = filePaths[0]
    saveConfig()
    setLivrables(filePaths[0])
    emit({ k: 'note', text: 'Dossier des livrables déplacé : la suite repart sur un contexte neuf.' })
    pool.toutArreter()
    diffuserListe()
    return { dossier: P.livrables(), livrables: listerLivrables() }
  })

  ipcMain.on('app:zoom', (_e, delta) => {
    if (delta === 0) appliquerZoom(0)
    else zoomer(delta > 0 ? +1 : -1)
  })

  ipcMain.on('app:open-dossier', () => shell.openPath(P.livrables()))
  ipcMain.on('app:open-external', (_e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Assistant OpenSpace',
      submenu: [
        { role: 'about', label: "À propos de l'Assistant OpenSpace" },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer' },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Mission',
      submenu: [
        {
          label: 'Nouvelle mission',
          accelerator: 'CmdOrCtrl+N',
          click: () => ouvrirMission(null, { neuve: true }),
        },
        {
          label: 'Afficher la liste des missions',
          accelerator: 'CmdOrCtrl+L',
          click: () => emit({ k: 'basculer-barre' }),
        },
        {
          label: "Afficher l'équipe et les livrables",
          accelerator: 'CmdOrCtrl+D',
          click: () => emit({ k: 'basculer-panneau' }),
        },
        {
          label: 'Gérer les équipes…',
          accelerator: 'CmdOrCtrl+E',
          click: () => emit({ k: 'ouvrir-equipes' }),
        },
        {
          label: 'Largeur optimale',
          accelerator: 'CmdOrCtrl+Alt+0',
          click: () => {
            if (!win || win.isDestroyed()) return
            const { width, height } = boundsParDefaut()
            win.setBounds({ ...win.getBounds(), width, height })
          },
        },
        // Pas d'accélérateur « Esc » : la touche est traitée dans l'interface, où elle
        // refuse d'abord une demande de validation en attente.
        { label: 'Interrompre', accelerator: 'CmdOrCtrl+.', click: () => { if (courante) pool.interrompre(courante.id) } },
        { type: 'separator' },
        { label: 'Ouvrir le dossier des livrables', accelerator: 'CmdOrCtrl+Shift+O', click: () => shell.openPath(P.livrables()) },
        { label: "Ouvrir le fichier des équipes", click: () => ouvrirFichier(P.equipes()) },
        { label: 'Ouvrir le journal de bord', click: () => shell.openPath(cheminJournal()) },
      ],
    },
    { role: 'editMenu', label: 'Édition' },
    {
      label: 'Affichage',
      submenu: [
        // ⌘= et le pavé numérique passent par l'interface (voir renderer/app.js) :
        // un menu ne porte qu'un raccourci, et « + » demande Maj sur un clavier français.
        { label: 'Agrandir', accelerator: 'CmdOrCtrl+Plus', click: () => zoomer(+1) },
        { label: 'Réduire', accelerator: 'CmdOrCtrl+-', click: () => zoomer(-1) },
        { label: 'Taille réelle', accelerator: 'CmdOrCtrl+0', click: () => appliquerZoom(0) },
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'close', label: 'Fermer' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
      ],
    },
  ]))
}

// -------------------------------------------------------------- cycle de vie

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus() } })

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'system'
    setDataRoot(app.getPath('userData'))
    loadConfig()
    tracer('--- démarrage', app.getVersion(), '| données', app.getPath('userData'))
    createWindow()
    buildMenu()
    wireIpc()

    pool = new Pool({
      creerSession: (missionId) => new AgentSession({
        emit: (evt) => routerEvenement(missionId, evt),
        askPermission: (req) => askPermission({ ...req, missionId }),
        getConfig: () => config,
        ouvrirFichier,
        envoyerCorbeille: async (chemin) => {
          try { await shell.trashItem(chemin); return true } catch { return false }
        },
      }),
      repriseDe,
      surEtat: () => diffuserListe(),
    })

    process.on('unhandledRejection', (err) => {
      tracer('promesse non rattrapée', String(err?.stack || err?.message || err).slice(0, 800))
      emit({ k: 'error', message: `Équipe indisponible : ${String(err?.message || err)}` })
      emit({ k: 'status', state: 'idle' })
    })

    // Un bogue dans l'application ne doit pas la laisser à moitié démarrée sans rien
    // dire : on l'écrit au journal et on l'affiche dans le fil.
    process.on('uncaughtException', (err) => {
      tracer('exception non rattrapée', String(err?.stack || err?.message || err).slice(0, 900))
      emit({ k: 'error', message: `Erreur interne : ${String(err?.message || err)}` })
      emit({ k: 'status', state: 'idle' })
    })

    // Le dossier des livrables et l'agent démarrent une fois la fenêtre à l'écran :
    // lire un dossier peut demander une autorisation à macOS, qui fige le processus le
    // temps de la réponse — sans fenêtre, l'app paraîtrait plantée.
    win.once('ready-to-show', () => {
      tracer('fenêtre affichée')
      try {
        ensureDossier()
        diffuserLivrables()
        diffuserEquipe()
      } catch {}

      resumeInterdit = config.promptVersion !== PROMPT_VERSION
      if (resumeInterdit) {
        config.promptVersion = PROMPT_VERSION
        saveConfig()
      }
      ouvrirMission(config.mission)
      tracer('mission ouverte', courante?.id, '| livrables', P.livrables())
    })

    app.on('activate', () => {
      if (win) { win.show(); win.focus() } else createWindow()
    })
  })

  app.on('before-quit', () => {
    quitting = true
    refuserToutes("Fermeture de l'application.")
    for (const id of [...tampons.keys()]) viderTampon(id)
    pool?.toutArreter()
  })

  app.on('window-all-closed', () => { /* l'app reste dans le Dock */ })
}
