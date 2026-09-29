// Emplacement des données de l'app. Les mêmes chemins qu'Electron
// (`app.getPath('userData')` pour un productName « Assistant OpenSpace »), afin que
// les scripts hors Electron (tests, selftest) lisent exactement la même chose.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Sans accent : c'est le dossier qu'Electron choisit lui-même à partir du
// productName ASCII du bundle.
const APP_DIR = 'Assistant OpenSpace'

function defaultRoot(): string {
  if (process.env.OPENSPACE_DATA_DIR) return path.resolve(process.env.OPENSPACE_DATA_DIR)
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR)
  }
  return path.join(os.homedir(), '.config', APP_DIR)
}

/**
 * Les livrables sont faits pour être ouverts à la main : ils vivent à la racine du
 * dossier personnel, pas dans les données de l'app.
 *
 * Pas dans ~/Documents, malgré l'évidence : macOS y protège l'accès et redemande
 * l'autorisation dès que la signature de l'app change — c'est-à-dire à chaque
 * reconstruction. La racine du dossier personnel n'est pas surveillée. L'utilisateur peut
 * toujours choisir ~/Documents dans les réglages et l'autoriser une fois.
 */
function defaultLivrables(): string {
  if (process.env.OPENSPACE_LIVRABLES) return path.resolve(process.env.OPENSPACE_LIVRABLES)
  return path.join(os.homedir(), 'OpenSpace')
}

/** Le sous-dossier où s'empilent les versions précédentes de chaque livrable. */
export const VERSIONS = 'Versions'

let root = defaultRoot()
let livrables = defaultLivrables()

/** Electron appelle ceci au démarrage avec son propre userData. */
export function setDataRoot(dir: string): void {
  root = dir
  ensureDirs()
}

/** L'utilisateur peut ranger ses livrables où il veut (réglages ⚙). */
export function setLivrables(dir: string | null | undefined): void {
  if (!dir) return
  livrables = path.resolve(dir)
  ensureDirs()
}

export function dataRoot(): string { return root }
export function livrablesParDefaut(): string { return defaultLivrables() }

export const P = {
  /** Un fichier par mission : métadonnées et fil rejouable. */
  missions: () => path.join(root, 'missions'),
  mission: (id: string) => path.join(root, 'missions', `${id}.json`),
  /** Les équipes nommées et celle qui est active : la vraie configuration de l'app. */
  equipes: () => path.join(root, 'equipes.json'),
  /** Ancien fichier « une seule équipe » : lu une fois, pour la reprise. */
  equipe: () => path.join(root, 'equipe.json'),
  /** Anciennes compositions mises de côté : lues une fois, pour la reprise. */
  archives: () => path.join(root, 'equipe-archives.json'),
  /** Les pièces jointes d'une mission, copiées à l'envoi pour rester lisibles. */
  pieces: (missionId: string | null | undefined) => path.join(root, 'pieces', String(missionId || 'sans-mission')),
  livrables: () => livrables,
  livrable: (nom: string) => path.join(livrables, nom),
  /** Les versions précédentes d'un livrable, rangées à côté de lui. */
  versions: (nom: string) => path.join(livrables, VERSIONS, String(nom).replace(/\.md$/, '')),
}

/** Le dossier de données : jamais protégé, on peut le créer n'importe quand. */
export function ensureDonnees(): void {
  for (const dir of [root, P.missions()]) {
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  }
}

export function ensureDirs(): void {
  ensureDonnees()
  try { fs.mkdirSync(livrables, { recursive: true }) } catch {}
}

// À l'import, on ne touche qu'au dossier de données : le dossier des livrables peut
// se trouver dans un emplacement protégé par macOS, où la première tentative d'accès
// déclenche une demande d'autorisation qu'une app doit poser fenêtre ouverte.
ensureDonnees()
