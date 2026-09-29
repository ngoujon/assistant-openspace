// Un journal de bord, court et permanent.
//
// Lancée depuis le Dock, l'app n'a pas de terminal : sans trace écrite, un
// démarrage qui coince ne laisse rien à regarder. On garde donc les dernières
// lignes dans le dossier de données — jamais le contenu d'un livrable, seulement le
// déroulé technique.
import fs from 'node:fs'
import path from 'node:path'
import { dataRoot } from './paths.mjs'

const MAX_OCTETS = 120_000

let fichier: string | null = null
function chemin(): string {
  if (!fichier) fichier = path.join(dataRoot(), 'journal.log')
  return fichier
}

export function tracer(...morceaux: unknown[]): void {
  const ligne = `${new Date().toISOString()} ${morceaux
    .map((m) => (typeof m === 'string' ? m : safe(m)))
    .join(' ')}\n`
  try {
    const f = chemin()
    fs.mkdirSync(path.dirname(f), { recursive: true })
    // Rotation par troncature : on ne garde que la moitié récente.
    if ((fs.statSync(f).size || 0) > MAX_OCTETS) {
      const tout = fs.readFileSync(f, 'utf8')
      fs.writeFileSync(f, tout.slice(-MAX_OCTETS / 2))
    }
  } catch {}
  try { fs.appendFileSync(chemin(), ligne) } catch {}
}

export function cheminJournal(): string { return chemin() }

/** Le message lisible d'une erreur, quelle que soit sa forme. */
export function messageDe(err: unknown): string {
  return String((err as { message?: unknown } | null)?.message || err)
}

/** La pile d'une erreur quand elle en a une, pour le journal. */
export function pileDe(err: unknown): string {
  const e = err as { stack?: unknown, message?: unknown } | null
  return String(e?.stack || e?.message || err)
}

function safe(v: unknown): string {
  try { return JSON.stringify(v).slice(0, 600) } catch { return String(v) }
}
