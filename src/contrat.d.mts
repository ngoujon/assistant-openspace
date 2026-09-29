// Le contrat entre le processus principal et la fenêtre : les formes de données qui
// traversent l'IPC, et l'API que le preload expose. Types seuls, rien à l'exécution —
// c'est ce qui permet aux deux côtés de le partager sans rien s'importer d'autre.

// ------------------------------------------------------------------ l'équipe

export interface Membre {
  id: string
  label: string
  parentId: string | null
  order: number
  ame: string
}

export type Rang = 'orchestrateur' | 'pole' | 'specialiste'

export interface NoeudArbre {
  id: string
  label: string
  parentId: string | null
  ame: string
  role: Rang
  enfants: NoeudArbre[]
}

/** Une équipe de la bibliothèque, telle que la liste l'affiche. */
export interface EquipeResume {
  id: string
  nom: string
  cree_le: string
  maj_le: string
  membres: number
  poles: number
  actif: boolean
}

export interface EtatEquipe {
  membres: Membre[]
  arbre: NoeudArbre | null
  equipes: EquipeResume[]
  equipeActive: { id: string, nom: string }
  refus?: string
}

// ------------------------------------------------------------ pièces jointes

export type GenrePiece =
  | 'image' | 'video' | 'audio' | 'document' | 'tableur' | 'texte' | 'code' | 'archive' | 'fichier'

export interface Piece {
  genre: GenrePiece
  libelle: string
  ext: string
  nom: string
  chemin: string
  octets: number
  taille: string
}

/** Ce qu'une pièce garde dans le fil enregistré. */
export type PieceMessage = Pick<Piece, 'nom' | 'genre' | 'libelle' | 'taille' | 'chemin'>

export interface ResultatPieces {
  pieces: Piece[]
  refus: string[]
}

// ----------------------------------------------------------------- livrables

export interface LivrableInfo {
  nom: string
  chemin: string
  titre: string
  mission: string | null
  equipe: string[]
  cree_le: string
  mis_a_jour_le: string
  version: number
  versions: number
  mots: number
  octets: number
  modifie_a: string
  remplace?: boolean
  restaure_depuis?: number
}

export interface VersionLivrable {
  numero: number
  courante: boolean
  chemin: string
  mots: number
  equipe: string[]
  date: string
  modifie_a: string
}

export type PorteeLivrables = 'mission' | 'tous'

// ------------------------------------------------------------------ missions

export type StatutMission = 'termine' | 'interrompu' | 'incomplet'
/** Le statut tel que la liste l'affiche : l'enregistré, ou l'état vivant du fil. */
export type StatutVisible = StatutMission | 'en_cours' | 'en_attente'

export interface MissionResume {
  id: string
  titre: string
  sansTitre: boolean
  cree_le: string
  maj_le: string
  livrables: number
  equipe: number
  messages: number
  statut: StatutVisible | null
  vide: boolean
}

export type EtatContribution = 'livre' | 'echec'

/** Ce qu'un fil garde de ce qui a défilé, pour être rejoué à l'écran. */
export type EvenementFil = { t?: string } & (
  | { k: 'user', texte: string, pieces?: PieceMessage[] }
  | { k: 'texte', texte: string }
  | { k: 'outil', nom: string, arg: string }
  | { k: 'contribution', id: string, membre: string, etat: EtatContribution, taille: number, apercu: string }
  | { k: 'livrable', nom: string, titre: string, mots: number, equipe?: string[], version: number, remplace?: boolean }
  | { k: 'note', texte: string, kind?: string }
)

// --------------------------------------------------------------- réglages

export type Ampleur = 'note' | 'document' | 'dossier'
export type Autonomie = 'auto' | 'prudent'
export type Onglet = 'equipe' | 'livrables'

/** Les réglages que la fenêtre lit et modifie. */
export interface ConfigFenetre {
  model: string
  modeleEquipe: string
  effort: string
  ampleur: Ampleur
  langue: string
  autonomie: Autonomie
  barreVisible: boolean
  panneauVisible: boolean
  largeurBarre: number | null
  largeurPanneau: number | null
  onglet: Onglet
  porteeLivrables: PorteeLivrables
}

export type PatchConfig = Partial<Omit<ConfigFenetre, 'effort'>>

export interface EtatInitial extends EtatEquipe {
  config: ConfigFenetre
  dossier: string
  livrables: LivrableInfo[]
  totalLivrables: number
  missions: MissionResume[]
  version: string
}

// ------------------------------------------------------------- permissions

export interface ResumePermission {
  title: string
  lines: string[]
  danger?: boolean
}

export interface ReponsePermission {
  behavior: 'allow' | 'deny'
  always?: boolean
  message?: string
}

// --------------------------------------------------------------- événements

/** Ce qu'une session d'agent annonce, au fil de son travail. */
export type EvenementSession =
  | { k: 'status', state: 'idle' | 'thinking' }
  | { k: 'ready', sessionId: string, model: string, effort: string, modeleEquipe: string, outils: string, equipe: number }
  | { k: 'resumed' }
  | { k: 'reprise-possible' }
  | { k: 'note', text: string }
  | { k: 'error', message: string }
  | { k: 'turn-start' }
  | { k: 'queued' }
  | { k: 'interrupted' }
  | { k: 'text-start' }
  | { k: 'text-delta', text: string }
  | { k: 'thinking-start' }
  | { k: 'thinking-delta', text: string }
  | { k: 'tool-use', id: string, name: string, input: Record<string, unknown> }
  | { k: 'tool-result', id: string, name: string, ok: boolean, preview: string }
  | { k: 'membre', id: string, label: string, etat: 'travaille', brief: string }
  | { k: 'contribution', id: string, membre: string, etat: EtatContribution, taille: number, apercu: string, texte: string }
  | { k: 'livrable', livrable: LivrableInfo }
  | { k: 'titre', titre: string }
  | { k: 'result', isError: boolean, text: string, reprenable: boolean, costUsd?: number, durationMs?: number }

/** Une demande de validation, telle que la fenêtre l'affiche. */
export interface DemandePermission {
  k: 'permission'
  id: string
  origine: string | null
  toolName: string
  title?: string
  displayName?: string
  subtitle?: string
  reason?: string
  summary?: ResumePermission | null
  hint?: string
  allowAlways: boolean
  input: Record<string, unknown>
}

/** Tout ce que le processus principal envoie à la fenêtre. */
export type EvenementFenetre =
  | EvenementSession
  | DemandePermission
  | ({ k: 'equipe' } & EtatEquipe)
  | { k: 'livrables', livrables: LivrableInfo[], portee: PorteeLivrables, total: number }
  | { k: 'missions', liste: MissionResume[], courante: string | null }
  | { k: 'mission', id: string, titre: string | null, statut: StatutVisible | null, evenements: EvenementFil[] }
  | { k: 'basculer-barre' }
  | { k: 'basculer-panneau' }
  | { k: 'ouvrir-equipes' }

// ------------------------------------------------------------------ l'API

/** Ce que le preload expose à la fenêtre, sous `window.openspace`. */
export interface OpenspaceApi {
  init(): Promise<EtatInitial>
  send(texte: string, pieces: Piece[]): void
  interrupt(): void
  setConfig(patch: PatchConfig): void
  replyPermission(id: string, answer: ReponsePermission): void

  mission: {
    list(recherche?: string): Promise<MissionResume[]>
    create(): Promise<string>
    open(id: string): Promise<string>
    resume(id: string | null): Promise<string | null>
    rename(id: string, titre: string): Promise<MissionResume[]>
    remove(id: string): Promise<MissionResume[]>
  }

  pieces: {
    cheminDe(file: File): string
    choisir(): Promise<ResultatPieces>
    deposer(chemins: string[]): Promise<ResultatPieces>
    coller(nom: string, base64: string): Promise<ResultatPieces>
    oublier(chemin: string): void
    ouvrir(chemin: string): void
  }

  equipe: {
    get(): Promise<EtatEquipe>
    add(parentId: string, label: string): Promise<Membre[]>
    rename(id: string, label: string): Promise<Membre[]>
    setAme(id: string, ame: string): Promise<Membre[]>
    reparent(id: string, parentId: string): Promise<Membre[] | { membres: Membre[], refus: string }>
    remove(id: string): Promise<Membre[]>
    reset(): Promise<Membre[]>
    activer(id: string): Promise<EtatEquipe>
    creer(nom: string, depuis: 'defaut' | 'actuelle'): Promise<EtatEquipe>
    dupliquer(id: string): Promise<EtatEquipe>
    renommer(id: string, nom: string): Promise<EtatEquipe>
    supprimer(id: string): Promise<EtatEquipe>
    proposerAme(id: string, label: string): Promise<{ ame?: string, erreur?: string }>
    openFile(): void
  }

  livrables: {
    list(portee: PorteeLivrables): Promise<LivrableInfo[]>
    open(nom: string): void
    reveal(nom: string): void
    remove(nom: string): Promise<LivrableInfo[]>
    versions(nom: string): Promise<VersionLivrable[]>
    openVersion(nom: string, numero: number): void
    export(nom: string, numero?: number): Promise<{ chemin?: string, annule?: boolean, erreur?: string }>
  }

  zoom(delta: number): void
  choisirDossier(): Promise<{ dossier: string, livrables: LivrableInfo[] }>
  openDossier(): void
  openExternal(url: string): void
  onEvent(cb: (evt: EvenementFenetre) => void): () => void
}
