const BASE = "/api/ollama";

/** Heuristique rapide (évite un appel /api/show inutile pour nomic-embed-text, etc.). */
function isLikelyNonChatModelName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\bembed/i.test(lower)) return true;
  if (/\brerank/i.test(lower)) return true;
  if (/\btext-embedding\b/i.test(lower)) return true;
  return false;
}

/**
 * Ollama 0.3+ expose `capabilities` : les seuls `embedding` ne supportent pas /api/chat.
 */
async function modelSupportsChat(model: string): Promise<boolean> {
  if (isLikelyNonChatModelName(model)) return false;
  try {
    const res = await fetch(`${BASE}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { capabilities?: string[] };
    const caps = data.capabilities;
    if (!caps?.length) return true;
    if (caps.includes("embedding") && !caps.includes("completion")) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/** Modèles utilisables pour le chat (exclut embedding / rerank). */
export async function fetchOllamaModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama indisponible (${res.status}). Lance Ollama sur ce Mac.`);
  }
  const data = (await res.json()) as { models?: { name: string }[] };
  const names = data.models?.map((m) => m.name) ?? [];
  const flags = await Promise.all(names.map((n) => modelSupportsChat(n)));
  return names.filter((_, i) => flags[i]);
}

export interface OllamaChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Réponse complète (sans stream) — pour enchaînements orchestration. */
export async function completeOllamaChat(
  model: string,
  messages: OllamaChatMessage[],
  signal?: AbortSignal,
  options?: { temperature?: number },
): Promise<string> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: options?.temperature != null ? { temperature: options.temperature } : undefined,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Erreur HTTP ${res.status}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content?.trim() ?? "";
  if (!content) throw new Error("Réponse Ollama vide.");
  return content;
}

export async function streamOllamaChat(
  model: string,
  messages: OllamaChatMessage[],
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Erreur HTTP ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Réponse sans corps");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          message?: { content?: string };
        };
        const chunk = obj.message?.content;
        if (chunk) onToken(chunk);
      } catch {
        /* ligne JSON incomplète ignorée */
      }
    }
  }
  const rest = buffer.trim();
  if (rest) {
    try {
      const obj = JSON.parse(rest) as { message?: { content?: string } };
      const chunk = obj.message?.content;
      if (chunk) onToken(chunk);
    } catch {
      /* ignore */
    }
  }
}
