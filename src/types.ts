export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Mode Discussion : nom du membre qui parle (ex. CTO). */
  speakerLabel?: string;
  /** Note affichée (ex. choix de l’orchestrateur). */
  routingNote?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export type MainTab = "chat" | "team";
