const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('openspace', {
  init: () => ipcRenderer.invoke('app:init'),
  send: (text) => ipcRenderer.send('chat:send', text),
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

  equipe: {
    get: () => ipcRenderer.invoke('equipe:get'),
    add: (parentId, label) => ipcRenderer.invoke('equipe:ajouter', { parentId, label }),
    rename: (id, label) => ipcRenderer.invoke('equipe:renommer', { id, label }),
    setAme: (id, ame) => ipcRenderer.invoke('equipe:ame', { id, ame }),
    reparent: (id, parentId) => ipcRenderer.invoke('equipe:rattacher', { id, parentId }),
    remove: (id) => ipcRenderer.invoke('equipe:supprimer', id),
    reset: () => ipcRenderer.invoke('equipe:defaut'),
    archive: (nom) => ipcRenderer.invoke('equipe:archiver', nom),
    restore: (id) => ipcRenderer.invoke('equipe:restaurer', id),
    forget: (id) => ipcRenderer.invoke('equipe:oublier-archive', id),
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

  choisirDossier: () => ipcRenderer.invoke('app:choisir-dossier'),
  openDossier: () => ipcRenderer.send('app:open-dossier'),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),

  onEvent: (cb) => {
    const handler = (_e, evt) => cb(evt)
    ipcRenderer.on('agent', handler)
    return () => ipcRenderer.removeListener('agent', handler)
  },
})
