import {
  completeOllamaChat,
  streamOllamaChat,
  type OllamaChatMessage,
} from "@/lib/ollama";

export type CompleteLlmOptions = {
  temperature?: number;
  /** Ollama uniquement : garde le modèle chargé entre requêtes. */
  keepAlive?: string;
  timeoutMs?: number;
  /** Plafond tokens de sortie (`num_predict` côté Ollama). */
  maxTokens?: number;
  /** URL de l'API Ollama Cloud. */
  ollamaApiUrl?: string;
  /** Clé API Ollama Cloud. */
  ollamaApiKey?: string;
};

export async function completeLlmChat(
  model: string,
  messages: OllamaChatMessage[],
  signal?: AbortSignal,
  options?: CompleteLlmOptions,
): Promise<string> {
  return completeOllamaChat(model, messages, signal, {
    temperature: options?.temperature,
    keepAlive: options?.keepAlive,
    timeoutMs: options?.timeoutMs,
    maxTokens: options?.maxTokens,
    apiUrl: options?.ollamaApiUrl,
    apiKey: options?.ollamaApiKey,
  });
}

export type StreamLlmOptions = {
  maxTokens?: number;
  temperature?: number;
  /** URL de l'API Ollama Cloud. */
  ollamaApiUrl?: string;
  /** Clé API Ollama Cloud. */
  ollamaApiKey?: string;
};

export async function streamLlmChat(
  model: string,
  messages: OllamaChatMessage[],
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
  options?: StreamLlmOptions,
): Promise<void> {
  await streamOllamaChat(model, messages, onToken, signal, {
    maxTokens: options?.maxTokens,
    temperature: options?.temperature,
    apiUrl: options?.ollamaApiUrl,
    apiKey: options?.ollamaApiKey,
  });
}
