/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Plafond tokens sortie par étape « agent » (mission, stream discussion). Entier 128–4096. */
  readonly VITE_OPENSPACE_MAX_AGENT_TOKENS?: string;
  /** Plafond tokens pour rapport final mission et fusion .md. Entier 1024–32768. */
  readonly VITE_OPENSPACE_MAX_DOCUMENT_TOKENS?: string;
}
