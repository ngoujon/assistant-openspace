import electron = require('electron')
import type { IpcRendererEvent } from 'electron'
import type { EvenementFenetre, OpenspaceApi } from './contrat.mjs' with { 'resolution-mode': 'import' }

const { contextBridge, ipcRenderer, webUtils } = electron

/**
 * Le chemin d'un fichier glissé dans la fenêtre. Depuis Electron 32, `File.path`
 * n'existe plus : c'est le seul moyen de retrouver l'original sur le disque, et
 * donc de le joindre sans en recharger les octets dans la page.
 */
function cheminDeFichier(file: File): string {
  try {
    return webUtils?.getPathForFile ? webUtils.getPathForFile(file) : ''
  } catch {
    return ''
  }
}

const api: OpenspaceApi = {
  init: () => ipcRenderer.invoke('app:init'),
  send: (texte, pieces) => ipcRenderer.send('chat:send', { texte, pieces }),
  interrupt: () => ipcRenderer.send('chat:interrupt'),
  setConfig: (patch) => ipcRenderer.send('chat:config', patch),
  replyPermission: (id, answer) => ipcRenderer.send('perm:reply', { id, answer }),

  mission: {
    list: (recherche) => ipcRenderer.invoke('mission:list', recherche),
    create: () => ipcRenderer.invoke('mission:new'),
    open: (id) => ipcRenderer.invoke('mission:open', id),
    resume: (id) => ipcRenderer.invoke('mission:resume', id),
    rename: (id, titre) => ipcRenderer.invoke('mission:rename', { id, titre }),
    remove: (id) => ipcRenderer.invoke('mission:delete', id),
  },

  pieces: {
    cheminDe: cheminDeFichier,
    choisir: () => ipcRenderer.invoke('pieces:choisir'),
    deposer: (chemins) => ipcRenderer.invoke('pieces:deposer', chemins),
    coller: (nom, base64) => ipcRenderer.invoke('pieces:coller', { nom, base64 }),
    oublier: (chemin) => ipcRenderer.send('pieces:oublier', chemin),
    ouvrir: (chemin) => ipcRenderer.send('pieces:ouvrir', chemin),
  },

  equipe: {
    get: () => ipcRenderer.invoke('equipe:get'),
    add: (parentId, label) => ipcRenderer.invoke('equipe:ajouter', { parentId, label }),
    rename: (id, label) => ipcRenderer.invoke('equipe:renommer', { id, label }),
    setAme: (id, ame) => ipcRenderer.invoke('equipe:ame', { id, ame }),
    reparent: (id, parentId) => ipcRenderer.invoke('equipe:rattacher', { id, parentId }),
    remove: (id) => ipcRenderer.invoke('equipe:supprimer', id),
    reset: () => ipcRenderer.invoke('equipe:defaut'),
    // Le gestionnaire : plusieurs équipes nommées, une seule active.
    activer: (id) => ipcRenderer.invoke('equipes:activer', id),
    creer: (nom, depuis) => ipcRenderer.invoke('equipes:creer', { nom, depuis }),
    dupliquer: (id) => ipcRenderer.invoke('equipes:dupliquer', id),
    renommer: (id, nom) => ipcRenderer.invoke('equipes:renommer', { id, nom }),
    supprimer: (id) => ipcRenderer.invoke('equipes:supprimer', id),
    proposerAme: (id, label) => ipcRenderer.invoke('equipe:proposer-ame', { id, label }),
    openFile: () => ipcRenderer.send('equipe:ouvrir-fichier'),
  },

  livrables: {
    list: (portee) => ipcRenderer.invoke('livrables:list', portee),
    open: (nom) => ipcRenderer.send('livrables:open', nom),
    reveal: (nom) => ipcRenderer.send('livrables:reveal', nom),
    remove: (nom) => ipcRenderer.invoke('livrables:delete', nom),
    versions: (nom) => ipcRenderer.invoke('livrables:versions', nom),
    openVersion: (nom, numero) => ipcRenderer.send('livrables:open-version', { nom, numero }),
    export: (nom, numero) => ipcRenderer.invoke('livrables:export', { nom, numero }),
  },

  // Les variantes de ⌘+ / ⌘− que le menu ne peut pas porter (⌘=, pavé numérique).
  zoom: (delta) => ipcRenderer.send('app:zoom', delta),

  choisirDossier: () => ipcRenderer.invoke('app:choisir-dossier'),
  openDossier: () => ipcRenderer.send('app:open-dossier'),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),

  onEvent: (cb) => {
    const handler = (_e: IpcRendererEvent, evt: EvenementFenetre) => cb(evt)
    ipcRenderer.on('agent', handler)
    return () => ipcRenderer.removeListener('agent', handler)
  },
}

contextBridge.exposeInMainWorld('openspace', api)
