/** Contenu de la colonne droite (activité / échanges en cours). */
export type RightActivityState =
  | { kind: "idle" }
  | { kind: "team" }
  | {
      kind: "discussion";
      isRouting: boolean;
      streaming: boolean;
      panelError: string | null;
      streamingSpeaker: string | null;
    }
  | {
      kind: "mission";
      running: boolean;
      progress: string[];
      elapsedSec: number;
    };
