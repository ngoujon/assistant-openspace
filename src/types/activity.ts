/** Livrable Markdown lié à la conversation (mission terminée ou fusion discussion). */
export interface ActivityLinkedArtifact {
  markdown: string;
  filename: string;
}

/** Contenu de la colonne Activité (mission, discussion). */
export type RightActivityState =
  | { kind: "idle" }
  | { kind: "team" }
  | {
      kind: "discussion";
      isRouting: boolean;
      streaming: boolean;
      panelError: string | null;
      streamingSpeaker: string | null;
      /** Étapes cumulées (routage, réponse, fusion livrable) — défilent comme la mission. */
      discussionProgress: string[];
    }
  | {
      kind: "mission";
      running: boolean;
      progress: string[];
      elapsedSec: number;
    };
