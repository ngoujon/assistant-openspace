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
}
