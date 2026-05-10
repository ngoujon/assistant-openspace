import { assertChatModel, type OllamaChatMessage } from "@/lib/ollama";

const BASE = "/api/mistral";

function authHeaders(apiKey: string): HeadersInit {
  const t = apiKey.trim();
  if (!t) {
    throw new Error(
      "Clé API Mistral absente. Ouvre Paramètres (sidebar) et colle ta clé (compte Mistral AI).",
    );
  }
  return {
    Authorization: `Bearer ${t}`,
    "Content-Type": "application/json",
  };
}

function mergeAbortWithTimeout(
  user: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  if (!timeoutMs || timeoutMs <= 0) return user;
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => {
    ctrl.abort(
      new DOMException(
        "Mistral AI n’a pas renvoyé de réponse dans le délai imparti. Réessaie ou choisis un modèle plus léger.",
        "TimeoutError",
      ),
    );
  }, timeoutMs);
  const clear = () => window.clearTimeout(tid);
  if (user) {
    if (user.aborted) {
      clear();
      ctrl.abort(user.reason);
    } else {
      user.addEventListener(
        "abort",
        () => {
          clear();
          ctrl.abort(user.reason);
        },
        { once: true },
      );
    }
  }
  return ctrl.signal;
}

function isLikelyEmbeddingModelId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.includes("embed") ||
    lower.includes("mistral-embed") ||
    lower.includes("codestral-embed")
  );
}

/** Identifiants de modèles exposés par l’API Mistral (chat / completion). */
export async function fetchMistralModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1/models`, { headers: authHeaders(apiKey) });
  if (res.status === 401) {
    throw new Error(
      "Mistral AI : clé API refusée (401). Vérifie la clé dans Paramètres ou sur console.mistral.ai.",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Mistral AI indisponible (${res.status}).`);
  }
  const data = (await res.json()) as { data?: { id?: string }[] };
  const ids =
    data.data?.map((m) => m.id).filter((id): id is string => typeof id === "string") ??
    [];
  const chatIds = ids.filter((id) => !isLikelyEmbeddingModelId(id));
  chatIds.sort((a, b) => {
    const pref = (x: string) =>
      x.includes("mistral-small") ? 0 : x.includes("mistral-large") ? 1 : 2;
    return pref(a) - pref(b) || a.localeCompare(b);
  });
  return chatIds;
}

function mistralErrorMessage(status: number, body: string): string {
  if (status === 401) {
    return "Mistral AI : clé API refusée. Vérifie la clé dans Paramètres.";
  }
  try {
    const o = JSON.parse(body) as { message?: string; detail?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  } catch {
    /* ignore */
  }
  return body || `Erreur HTTP ${status}`;
}

export async function completeMistralChat(
  apiKey: string,
  model: string,
  messages: OllamaChatMessage[],
  signal?: AbortSignal,
  options?: {
    temperature?: number;
    timeoutMs?: number;
  },
): Promise<string> {
  assertChatModel(model);
  const combined = mergeAbortWithTimeout(signal, options?.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
      }),
      signal: combined,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    const de = e as DOMException;
    if (de?.name === "TimeoutError") {
      throw new Error(de.message);
    }
    if (options?.timeoutMs && (e as Error).name === "AbortError") {
      throw new Error(
        "Mistral AI n’a pas renvoyé de réponse dans le délai imparti. Réessaie ou réduis la taille du contexte.",
      );
    }
    throw e;
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(mistralErrorMessage(res.status, text));
  }
  const data = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Réponse Mistral vide.");
  return content;
}

export async function streamMistralChat(
  apiKey: string,
  model: string,
  messages: OllamaChatMessage[],
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  assertChatModel(model);
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(mistralErrorMessage(res.status, errText));
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Réponse sans corps");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const chunk = obj.choices?.[0]?.delta?.content;
          if (chunk) onToken(chunk);
        } catch {
          /* chunk SSE incomplet */
        }
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    for (const line of tail.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const chunk = obj.choices?.[0]?.delta?.content;
        if (chunk) onToken(chunk);
      } catch {
        /* ignore */
      }
    }
  }
}
