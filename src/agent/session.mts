import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  CanUseTool, EffortLevel, Options, PermissionResult, Query, SDKMessage, SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { buildSystemPrompt } from './prompt.mjs'
import { GardeEquipe } from './gardes.mjs'
import { resumerPermission } from './resume.mjs'
import { serveurOpenspace } from './outils.mjs'
import type { DemandeValidation } from './outils.mjs'
import { definitionsAgents } from './equipe.mjs'
import { chargerEquipe, membre, ORCHESTRATEUR } from '../espace/equipe.mjs'
import { listerLivrables } from '../espace/livrables.mjs'
import { P } from '../espace/paths.mjs'
import { tracer, messageDe, pileDe } from '../espace/journal.mjs'
import type { EvenementSession, Membre, ReponsePermission, ResumePermission } from '../contrat.mjs'

/** Les réglages qu'une session relit à chaque démarrage. */
export interface ConfigSession {
  model: string
  modeleEquipe?: string
  ampleur?: string
  langue?: string
  autonomie?: string
}

/** Une validation à faire trancher dans la fenêtre. */
export interface DemandePermissionSession {
  toolName: string
  input: Record<string, unknown>
  summary: ResumePermission | null
  title?: string
  hint?: string
  displayName?: string
  subtitle?: string
  reason?: string
  allowAlways: boolean
  signal?: AbortSignal
}

export interface DependancesSession {
  emit: (evt: EvenementSession) => void
  askPermission: (req: DemandePermissionSession) => Promise<ReponsePermission | null | undefined>
  getConfig: () => ConfigSession
  ouvrirFichier?: (chemin: string) => void
  envoyerCorbeille?: (chemin: string) => Promise<boolean>
}

type OptionsOutil = Parameters<CanUseTool>[2]

const HOME = os.homedir()
const require = createRequire(import.meta.url)

/** Une app lancée depuis le Dock n'hérite pas du PATH du shell. */
const PATH_SUP = [
  path.join(HOME, '.local/bin'), '/opt/homebrew/bin', '/opt/homebrew/sbin',
  '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
]

// Le SDK embarque son binaire Claude Code et le résout par chemin de module.
// Ce repli ne sert que si le paquet natif manque (installation partielle).
function claudeExecutable(): string | undefined {
  try {
    require.resolve('@anthropic-ai/claude-agent-sdk-darwin-arm64/package.json')
    return undefined
  } catch {}
  for (const c of [path.join(HOME, '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) {
    try { fs.accessSync(c, fs.constants.X_OK); return c } catch {}
  }
  return undefined
}

const PREFIXE = 'mcp__openspace__'

/**
 * L'effort de réflexion demandé à Claude. Une seule source pour toute l'app : c'est
 * cette valeur qui part au SDK, qui s'affiche sous le titre et qui se retrouve au
 * générique du livrable. Niveaux possibles : low, medium, high, xhigh, max.
 */
export const EFFORT: EffortLevel = 'high'

/**
 * Les outils OpenSpace portent eux-mêmes leur politique de validation (voir
 * outils.mts) : ils savent quel livrable est en jeu et n'interrompent l'utilisateur que
 * pour une suppression. On ne les double pas d'une confirmation générique —
 * publier un livrable, c'est exactement ce qu'on leur demande.
 */
const BUILTIN_SUR = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite',
  'ToolSearch', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool',
  'Skill', 'AskUserQuestion', 'TaskOutput',
])

interface FileEntree extends AsyncIterable<SDKUserMessage> {
  push(msg: SDKUserMessage): void
  close(): void
}

function fileEntree(): FileEntree {
  const attente: SDKUserMessage[] = []
  let dormeur: ((r: IteratorResult<SDKUserMessage, undefined>) => void) | null = null
  let ferme = false
  return {
    push(msg) {
      if (dormeur) { const d = dormeur; dormeur = null; d({ value: msg, done: false }) }
      else attente.push(msg)
    },
    close() {
      ferme = true
      if (dormeur) { const d = dormeur; dormeur = null; d({ done: true, value: undefined }) }
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (attente.length) { yield attente.shift()!; continue }
        if (ferme) return
        const r = await new Promise<IteratorResult<SDKUserMessage, undefined>>((res) => { dormeur = res })
        if (r.done) return
        yield r.value
      }
    },
  }
}

export class AgentSession {
  emit: DependancesSession['emit']
  askPermission: DependancesSession['askPermission']
  getConfig: DependancesSession['getConfig']
  ouvrirFichier: (chemin: string) => void
  envoyerCorbeille: (chemin: string) => Promise<boolean>
  q: Query | null = null
  queue: FileEntree | null = null
  abort: AbortController | null = null
  sessionId: string | null = null
  resumeId: string | null = null
  busy = false
  streamed = new Set<string>()
  toolNames = new Map<string, string>()
  /** tool_use_id -> identifiant du membre convoqué : de quoi rendre son travail. */
  convocations = new Map<string, string>()
  membres: Membre[]
  garde: GardeEquipe
  minuteurConnexion: ReturnType<typeof setTimeout> | undefined = undefined
  /** Nombre de rebranchements automatiques déjà tentés. */
  repriseAuto = 0

  constructor({ emit, askPermission, getConfig, ouvrirFichier, envoyerCorbeille }: DependancesSession) {
    this.emit = emit
    this.askPermission = askPermission
    this.getConfig = getConfig
    this.ouvrirFichier = ouvrirFichier || (() => {})
    this.envoyerCorbeille = envoyerCorbeille || (async () => false)
    this.membres = chargerEquipe()
    this.garde = new GardeEquipe(this.membres)
  }

  get running(): boolean { return this.q !== null }

  buildOptions(resume?: string | null): Options {
    const cfg = this.getConfig()
    const bin = claudeExecutable()
    const orchestrateur = membre(ORCHESTRATEUR, this.membres)
    return {
      // Le dossier des livrables est le dossier courant : Read, Glob et Grep y
      // tombent naturellement sur les documents déjà écrits.
      cwd: P.livrables(),
      additionalDirectories: [HOME],
      model: cfg.model,
      effort: EFFORT,
      thinking: { type: 'adaptive', display: 'summarized' },
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: buildSystemPrompt({
          dossier: P.livrables(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ampleur: cfg.ampleur,
          langue: cfg.langue,
          membres: this.membres,
          livrables: listerLivrables(),
          ame: orchestrateur?.ame || '',
        }),
      },
      tools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Agent'],
      // L'organigramme devient l'équipe : un sous-agent par membre, son âme pour prompt.
      agents: definitionsAgents(this.membres, {
        ampleur: cfg.ampleur,
        langue: cfg.langue,
        modele: cfg.modeleEquipe,
      }),
      strictMcpConfig: true,
      mcpServers: {
        openspace: serveurOpenspace({
          confirmer: (d: DemandeValidation) => this.confirmerAction(d),
          signaler: (evt: EvenementSession) => {
            // La garde a besoin de savoir qu'un document est sorti : c'est ce qui
            // distingue une mission finie d'une mission abandonnée en route.
            if (evt.k === 'livrable') this.garde.noterLivrable()
            this.emit(evt)
          },
          ouvrir: (chemin: string) => this.ouvrirFichier(chemin),
          titrer: (titre: string) => this.emit({ k: 'titre', titre }),
          corbeille: (chemin: string) => this.envoyerCorbeille(chemin),
          modele: () => this.getConfig()?.model,
          effort: () => EFFORT,
          contributeurs: () => [...this.garde.contributions.values()].map((c) => c.label),
        }),
      },
      // Aucune source de réglages externe : les règles d'autorisation de cette app ne
      // doivent pas pouvoir être élargies par un settings.json global.
      settingSources: [],
      permissionMode: 'default',
      hooks: this.garde.hooks(),
      includePartialMessages: true,
      abortController: this.abort ?? undefined,
      resume: resume || undefined,
      title: 'Assistant OpenSpace',
      env: {
        ...process.env,
        PATH: [...new Set([...PATH_SUP, ...(process.env.PATH || '').split(':')])].filter(Boolean).join(':'),
        CLAUDE_AGENT_SDK_CLIENT_APP: 'assistant-openspace/2.0.0',
      },
      ...(bin ? { pathToClaudeCodeExecutable: bin } : {}),
      // La sortie d'erreur de Claude Code va au journal : c'est là qu'on lit pourquoi
      // une session ne démarre pas quand l'app est lancée depuis le Dock.
      stderr: (d: string) => {
        tracer('[claude]', String(d).trimEnd().slice(0, 500))
        if (process.env.OPENSPACE_DEBUG) process.stderr.write(`[claude] ${d}`)
      },
      canUseTool: (toolName, input, opts) => this.handlePermission(toolName, input, opts),
    }
  }

  start({ resume }: { resume?: string | null } = {}): void {
    this.stop()
    this.abort = new AbortController()
    this.queue = fileEntree()
    this.sessionId = null
    this.resumeId = resume || null
    this.streamed = new Set()
    this.convocations = new Map()
    // L'organigramme est relu au démarrage de la session : c'est lui qui définit
    // les sous-agents, et il ne changera plus jusqu'au prochain redémarrage.
    this.membres = chargerEquipe()
    this.garde = new GardeEquipe(this.membres)
    const options = this.buildOptions(resume)
    tracer('session start | cwd', options.cwd, '| modèle', options.model, '| effort', options.effort,
      '| équipe', String(Object.keys(options.agents || {}).length), '| reprise', resume || 'non',
      '| binaire', options.pathToClaudeCodeExecutable || 'embarqué')
    this.q = query({ prompt: this.queue, options })
    // Pas de « connexion en cours » ici : en entrée continue, Claude Code ne dit rien
    // tant qu'il n'a pas reçu une première demande. Annoncer une connexion qui n'aura
    // lieu qu'au premier message laisserait un voyant d'attente allumé pour rien.
    this.emit({ k: 'status', state: 'idle' })
    this.pump()
  }

  async pump(): Promise<void> {
    const courant = this.q
    if (!courant) return
    try {
      for await (const msg of courant) {
        if (this.q !== courant) break
        this.route(msg)
      }
    } catch (err) {
      if (this.q !== courant) return
      if (this.abort?.signal.aborted) return
      this.busy = false
      tracer('session erreur', pileDe(err).slice(0, 700))

      if (this.resumeId) {
        this.resumeId = null
        this.emit({ k: 'note', text: 'Mission précédente introuvable, on repart à zéro.' })
        this.start({})
        return
      }

      // Claude Code s'est arrêté en cours de route. Son contexte, lui, est
      // enregistré : on rebranche dessus tout de suite, pour que le travail soit
      // reprenable au lieu d'être perdu. On ne le refait qu'un nombre limité de fois —
      // s'acharner sur une panne de fond ne ferait que boucler.
      const perdu = this.sessionId
      if (perdu && this.repriseAuto < 2) {
        this.repriseAuto += 1
        this.emit({ k: 'note', text: "L'orchestrateur s'est arrêté en cours de route. Je rebranche la mission." })
        this.start({ resume: perdu })
        this.emit({ k: 'reprise-possible' })
        return
      }

      this.emit({ k: 'error', message: messageDe(err) })
      this.emit({ k: 'status', state: 'idle' })
    }
  }

  /**
   * Claude Code lit ses identifiants dans le trousseau macOS. À la première ouverture
   * d'une nouvelle version signée, le système pose une question — et tant qu'on ne
   * répond pas, rien n'arrive. La boîte de dialogue passe souvent derrière la
   * fenêtre : mieux vaut le dire que laisser tourner « Connexion… ».
   */
  armerAttente(): void {
    if (this.sessionId) return
    clearTimeout(this.minuteurConnexion)
    this.minuteurConnexion = setTimeout(() => {
      if (this.sessionId) return
      tracer('connexion sans réponse après 30 s')
      this.emit({
        k: 'note',
        text: "Toujours en connexion… macOS demande peut-être l'autorisation d'accéder au trousseau "
          + '(identifiants Claude Code). Cherche la boîte de dialogue derrière la fenêtre et choisis '
          + '« Toujours autoriser ».',
      })
    }, 30000)
  }

  stop(): void {
    clearTimeout(this.minuteurConnexion)
    try { this.queue?.close() } catch {}
    try { this.abort?.abort() } catch {}
    this.q = null
    this.queue = null
    this.busy = false
  }

  /**
   * Envoie un message. Si un tour est déjà en cours, le message rejoint la file
   * d'entrée : le SDK le remet au modèle à la prochaine respiration, qui refait son
   * plan avec. On ne bloque donc jamais la saisie.
   */
  send(text: string): void {
    this.repriseAuto = 0
    this.garde.nouveauTour()
    if (!this.q) this.start({})
    // C'est maintenant que la session s'ouvre vraiment, et donc maintenant que macOS
    // peut demander l'accès au trousseau : on surveille à partir d'ici.
    this.armerAttente()
    const enCours = this.busy
    this.busy = true
    this.emit({ k: enCours ? 'queued' : 'turn-start' })
    this.emit({ k: 'status', state: 'thinking' })
    this.pousser(text)
  }

  pousser(text: string): void {
    this.queue?.push({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
      parent_tool_use_id: null,
      session_id: this.sessionId || '',
    })
  }

  async interrupt(): Promise<void> {
    if (!this.q || !this.busy) return
    try { await this.q.interrupt() } catch {}
    this.busy = false
    this.emit({ k: 'interrupted' })
    this.emit({ k: 'status', state: 'idle' })
  }

  async setModel(model: string): Promise<void> {
    if (this.q) { try { await this.q.setModel(model) } catch {} }
  }

  // ---------------------------------------------------------------- routage

  route(msg: SDKMessage): void {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          clearTimeout(this.minuteurConnexion)
          this.sessionId = msg.session_id
          const srv = (msg.mcp_servers || []).find((s) => s.name === 'openspace')
          const cfg = this.getConfig()
          this.emit({
            k: 'ready',
            sessionId: msg.session_id,
            // Le modèle annoncé par le SDK, pas celui coché dans les réglages : tant
            // que la session n'a pas redémarré, les deux peuvent différer.
            model: msg.model || cfg?.model,
            effort: EFFORT,
            modeleEquipe: cfg?.modeleEquipe || 'inherit',
            outils: srv?.status || 'absent',
            equipe: this.membres.length - 1,
          })
          if (this.resumeId) this.emit({ k: 'resumed' })
          this.emit({ k: 'status', state: this.busy ? 'thinking' : 'idle' })
        } else if (msg.subtype === 'compact_boundary') {
          this.emit({ k: 'note', text: 'Mission résumée pour libérer de la mémoire.' })
        }
        break

      case 'stream_event': {
        const ev = msg.event
        // Un sous-agent a son propre flux : on ne le déverse pas dans le fil, la
        // colonne d'équipe dit déjà qui travaille.
        if (msg.parent_tool_use_id) break
        if (ev.type === 'message_start' && ev.message?.id) this.streamed.add(ev.message.id)
        if (ev.type === 'content_block_start') {
          if (ev.content_block?.type === 'text') this.emit({ k: 'text-start' })
          if (ev.content_block?.type === 'thinking') this.emit({ k: 'thinking-start' })
        }
        if (ev.type === 'content_block_delta') {
          const d = ev.delta
          if (d.type === 'text_delta' && d.text) this.emit({ k: 'text-delta', text: d.text })
          if (d.type === 'thinking_delta' && d.thinking) this.emit({ k: 'thinking-delta', text: d.thinking })
        }
        break
      }

      case 'assistant': {
        if (msg.parent_tool_use_id) break
        const id = msg.message?.id
        const dejaVu = id && this.streamed.has(id)
        for (const bloc of msg.message?.content || []) {
          if (bloc.type === 'tool_use') {
            this.toolNames.set(bloc.id, bloc.name)
            if (bloc.name === 'Agent') this.noterConvocation(bloc)
            this.emit({ k: 'tool-use', id: bloc.id, name: bloc.name, input: bloc.input as Record<string, unknown> })
          } else if (bloc.type === 'text' && !dejaVu && bloc.text?.trim()) {
            this.emit({ k: 'text-start' })
            this.emit({ k: 'text-delta', text: bloc.text })
          }
        }
        break
      }

      case 'user': {
        if (msg.parent_tool_use_id) break
        const contenu = msg.message?.content
        if (!Array.isArray(contenu)) break
        for (const bloc of contenu) {
          if (bloc.type !== 'tool_result') continue
          const nom = this.toolNames.get(bloc.tool_use_id) || ''
          const brut = textOf(bloc.content)
          this.noterRetour(bloc.tool_use_id, brut, !bloc.is_error)
          this.emit({ k: 'tool-result', id: bloc.tool_use_id, name: nom, ok: !bloc.is_error, preview: tronquer(brut) })
        }
        break
      }

      case 'result':
        this.busy = false
        this.emit({
          k: 'result',
          isError: msg.subtype !== 'success',
          text: msg.subtype !== 'success' ? raisonArret(msg) : '',
          reprenable: msg.subtype !== 'success',
          costUsd: msg.total_cost_usd,
          durationMs: msg.duration_ms,
        })
        this.emit({ k: 'status', state: 'idle' })
        break
    }
  }

  // ------------------------------------------------------------- l'équipe

  /** Un membre part au travail : la colonne de droite l'allume tout de suite. */
  noterConvocation(bloc: { id: string, input: unknown }): void {
    const entree = (bloc.input || {}) as Record<string, unknown>
    const type = String(entree.subagent_type || '')
    const m = membre(type, this.membres)
    if (!m) return
    this.convocations.set(bloc.id, m.id)
    this.emit({
      k: 'membre',
      id: m.id,
      label: m.label,
      etat: 'travaille',
      brief: String(entree.description || entree.prompt || '').slice(0, 200),
    })
  }

  /**
   * Un membre vient de rendre. Son texte est enregistré tel quel : c'est la seule
   * trace de ce que chaque pôle a réellement produit, et c'est ce que la garde mesure
   * pour vérifier qu'un directeur reçoit bien le travail de ses spécialistes.
   */
  noterRetour(toolUseId: string, brut: string, ok: boolean): void {
    const id = this.convocations.get(toolUseId)
    if (!id) return
    this.convocations.delete(toolUseId)
    const entree = ok ? this.garde.noteContribution(id, brut) : null
    const m = membre(id, this.membres)
    this.emit({
      k: 'contribution',
      id,
      membre: m?.label || id,
      etat: ok ? 'livre' : 'echec',
      taille: entree?.taille || 0,
      apercu: entree?.apercu || '',
      texte: ok ? String(brut || '') : '',
    })
  }

  // ------------------------------------------------------------ permissions

  /**
   * Validation demandée par un outil OpenSpace, une fois qu'il sait exactement quel
   * livrable est en jeu.
   */
  async confirmerAction(demande: DemandeValidation): Promise<boolean> {
    if (this.autonome()) {
      tracer('autonomie — action menée sans demander :', demande.outil, demande.titre)
      return true
    }
    const reponse = await this.askPermission({
      toolName: demande.outil,
      input: demande.entree,
      summary: { title: demande.titre, lines: demande.lignes, danger: demande.danger },
      title: demande.titre,
      hint: demande.indice,
      allowAlways: false,
      signal: this.abort?.signal,
    })
    return reponse?.behavior === 'allow'
  }

  /**
   * L'équipe travaille-t-elle seule ? Réglable dans la fenêtre ; autonome par défaut,
   * parce qu'une mission qui s'arrête pour demander la permission de convoquer un
   * pôle ne sert à rien.
   *
   * Ce réglage ne touche qu'aux validations. Les règles d'organisation — un directeur
   * après ses spécialistes, pas de livrable sans l'équipe — sont des règles, pas des
   * permissions : elles s'appliquent dans les deux modes.
   */
  autonome(): boolean {
    return (this.getConfig()?.autonomie || 'auto') === 'auto'
  }

  async handlePermission(toolName: string, input: Record<string, unknown>, opts?: OptionsOutil): Promise<PermissionResult> {
    // Une convocation part en arrière-plan par défaut : le tour se terminerait avant
    // que le membre ait rendu, et l'orchestrateur enchaînerait sur un pôle qui n'a
    // rien reçu. Une mission se mène dans l'ordre — on ramène donc chaque convocation
    // au premier plan, sans en parler au modèle : plusieurs appels dans un même
    // message continuent de partir ensemble.
    if (toolName === 'Agent') {
      return { behavior: 'allow', updatedInput: { ...input, run_in_background: false } }
    }

    // Outils OpenSpace : la décision appartient à l'outil, qui la prend en
    // connaissance de cause. Redemander ici ferait valider deux fois la même action.
    if (toolName.startsWith(PREFIXE)) return { behavior: 'allow', updatedInput: input }
    if (BUILTIN_SUR.has(toolName)) return { behavior: 'allow', updatedInput: input }

    if (this.autonome()) {
      tracer('autonomie — outil autorisé sans demander :', toolName, argLisible(input))
      return { behavior: 'allow', updatedInput: input }
    }

    const summary = resumerPermission(toolName, input)
    const reponse = await this.askPermission({
      toolName,
      input,
      summary,
      title: summary?.title || opts?.title,
      displayName: opts?.displayName,
      subtitle: opts?.description,
      reason: opts?.decisionReason,
      allowAlways: true,
      signal: opts?.signal,
    })

    if (reponse?.behavior === 'allow') {
      const res: PermissionResult = { behavior: 'allow', updatedInput: input }
      if (reponse.always && opts?.suggestions?.length) res.updatedPermissions = opts.suggestions
      return res
    }
    return { behavior: 'deny', message: reponse?.message || "Refusé par l'utilisateur." }
  }
}

/**
 * Un tour qui s'arrête avant la fin doit le dire en français, et dire quoi faire.
 * Les libellés bruts du SDK sont anglais et techniques : ils n'ont rien à faire dans
 * la fenêtre.
 */
const ARRETS: Record<string, string> = {
  error_max_turns: "J'ai atteint la limite d'étapes pour ce message — la mission n'est pas terminée.",
  error_max_tokens: 'La réponse est devenue trop longue pour tenir en une fois.',
  error_during_execution: "Le tour s'est interrompu avant la fin.",
}

function raisonArret(msg: { subtype: string, result?: string }): string {
  const connu = ARRETS[msg.subtype]
  if (connu) return `${connu} Clique « Reprendre » ou écris « continue » : je reprends où j'en étais.`
  const brut = String(msg.result || msg.subtype || '').trim()
  return brut
    ? `Le tour s'est arrêté avant la fin : ${brut}`
    : "Le tour s'est arrêté avant la fin, sans raison précisée."
}

/** Un aperçu d'entrée d'outil pour le journal : une ligne, pas un déversement. */
function argLisible(input: Record<string, unknown> | null | undefined): string {
  if (!input || typeof input !== 'object') return ''
  for (const cle of ['command', 'file_path', 'nom', 'url', 'titre', 'subagent_type']) {
    const v = input[cle]
    if (typeof v === 'string' && v) return v.slice(0, 160)
  }
  return ''
}

function textOf(contenu: unknown): string {
  if (typeof contenu === 'string') return contenu
  if (Array.isArray(contenu)) return contenu.filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
  return ''
}

function tronquer(s: string, n = 700): string {
  if (!s) return ''
  const t = String(s).trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}
