const BASE = "/api/ollama";

/**
 * Heuristique rapide : modèles embedding / rerank (souvent exclus si /api/show
 * ne renvoie pas de capabilities ; on évite `\bembed` seul, fragile selon le nom).
 */
function isLikelyNonChatModelName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("embed")) return true;
  if (lower.includes("rerank")) return true;
  if (lower.includes("text-embedding")) return true;
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
    if (!res.ok) return !isLikelyNonChatModelName(model);
    const data = (await res.json()) as { capabilities?: string[] };
    const caps = data.capabilities;
    if (!caps?.length) return !isLikelyNonChatModelName(model);
    if (caps.includes("embedding") && !caps.includes("completion")) {
      return false;
    }
    return true;
  } catch {
    return !isLikelyNonChatModelName(model);
  }
}

/** Garde synchrone avant /api/chat (évite une erreur JSON peu claire côté Ollama). */
export function assertChatModel(model: string): void {
  if (!model.trim()) {
    throw new Error("Aucun modèle sélectionné.");
  }
  if (isLikelyNonChatModelName(model)) {
    throw new Error(
      `Le modèle « ${model} » ne prend pas en charge le chat (embedding / rerank). Choisis un modèle de conversation dans la liste déroulante.`,
    );
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
  assertChatModel(model);
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
  assertChatModel(model);
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
