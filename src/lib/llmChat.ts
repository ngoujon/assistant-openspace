import type { LlmProvider } from "@/lib/llmProvider";
import {
  completeMistralChat,
  streamMistralChat,
} from "@/lib/mistral";
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
};

export async function completeLlmChat(
  provider: LlmProvider,
  mistralApiKey: string | undefined,
  model: string,
  messages: OllamaChatMessage[],
  signal?: AbortSignal,
  options?: CompleteLlmOptions,
): Promise<string> {
  if (provider === "mistral") {
    return completeMistralChat(mistralApiKey ?? "", model, messages, signal, {
      temperature: options?.temperature,
      timeoutMs: options?.timeoutMs,
    });
  }
  return completeOllamaChat(model, messages, signal, {
    temperature: options?.temperature,
    keepAlive: options?.keepAlive,
    timeoutMs: options?.timeoutMs,
  });
}

export async function streamLlmChat(
  provider: LlmProvider,
  mistralApiKey: string | undefined,
  model: string,
  messages: OllamaChatMessage[],
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (provider === "mistral") {
    await streamMistralChat(mistralApiKey ?? "", model, messages, onToken, signal);
    return;
  }
  await streamOllamaChat(model, messages, onToken, signal);
}
