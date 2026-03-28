const BASE = "/api/ollama";

export async function fetchOllamaModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama indisponible (${res.status}). Lance Ollama sur ce Mac.`);
  }
  const data = (await res.json()) as { models?: { name: string }[] };
  return data.models?.map((m) => m.name) ?? [];
}

export interface OllamaChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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
