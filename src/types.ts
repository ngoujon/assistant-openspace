export type ChatRole = "user" | "assistant" | "system";

/** Dernière progression « Mission équipe » pour la colonne Activité (persistée par projet). */
export interface MissionActivitySnapshot {
  progress: string[];
  elapsedSec: number;
  running: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Mode Discussion : nom du membre qui parle (ex. CTO). */
  speakerLabel?: string;
  /** Note affichée (ex. choix de l’orchestrateur). */
  routingNote?: string;
  /** Réponse liée à une fusion discussion → livrable. */
  artifactPatchNote?: boolean;
  /** Fin de mission : invite au téléchargement du livrable. */
  missionDeliverableNote?: boolean;
}

/** Version archivée d’un livrable Markdown (fusion ou mission). */
export interface ArtifactVersion {
  id: string;
  markdown: string;
  createdAt: number;
  label?: string;
}

/** Travail intermédiaire d’un membre pendant une mission. */
export interface MissionAgentJournalEntry {
  memberLabel: string;
  stepLabel: string;
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  /**
   * Dernier livrable Markdown (ex. mission) — affiné via Discussion puis
   * « appliquer la mise à jour ».
   */
  artifactMarkdown?: string;
  /** Historique des versions du livrable (dernières entrées conservées). */
  artifactVersions?: ArtifactVersion[];
  /**
   * Texte saisi dans « Contexte » (mission équipe) au moment où le livrable
   * a été produit — repris en Discussion et lors des fusions document.
   */
  missionUserBrief?: string;
  /**
   * Id du dernier message après une fusion livrable : les prochaines fusions
   * n’incluent que les messages **après** celui-ci (limite le contexte).
   */
  artifactDiscussionCutoffAfterId?: string;
  /** Historique mission (étapes) — conservé au rafraîchissement et au changement de projet. */
  missionActivitySnapshot?: MissionActivitySnapshot;
  /** Journal des sorties intermédiaires par membre (mission). */
  missionAgentJournal?: MissionAgentJournalEntry[];
  /** Fusion livrable en attente après un message sans intention de retouche. */
  pendingArtifactMerge?: boolean;
}
