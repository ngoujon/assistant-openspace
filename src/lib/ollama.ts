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
let ollamaModelsCache: { names: string[]; fetchedAt: number } | null = null;
const OLLAMA_MODELS_CACHE_MS = 5 * 60 * 1000;

export async function fetchOllamaModels(): Promise<string[]> {
  const now = Date.now();
  if (
    ollamaModelsCache &&
    now - ollamaModelsCache.fetchedAt < OLLAMA_MODELS_CACHE_MS
  ) {
    return ollamaModelsCache.names;
  }
  const res = await fetch(`${BASE}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama indisponible (${res.status}). Lance Ollama sur ce Mac.`);
  }
  const data = (await res.json()) as { models?: { name: string }[] };
  const names = data.models?.map((m) => m.name) ?? [];
  const flags = await Promise.all(names.map((n) => modelSupportsChat(n)));
  const filtered = names.filter((_, i) => flags[i]);
  ollamaModelsCache = { names: filtered, fetchedAt: now };
  return filtered;
}

export interface OllamaChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Combine un signal utilisateur et un délai max (évite un fetch infini si Ollama ne répond pas). */
function mergeAbortWithTimeout(
  user: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  if (!timeoutMs || timeoutMs <= 0) return user;
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => {
    ctrl.abort(
      new DOMException(
        "Ollama n’a pas renvoyé de réponse dans le délai imparti. Vérifie qu’Ollama tourne, teste `ollama run <modèle>` en terminal, ou choisis un modèle plus petit.",
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

/** Réponse complète (sans stream) — pour enchaînements orchestration. */
export async function completeOllamaChat(
  model: string,
  messages: OllamaChatMessage[],
  signal?: AbortSignal,
  options?: {
    temperature?: number;
    /** Garde le modèle chargé entre requêtes (missions enchaînées). Ex. "30m". */
    keepAlive?: string;
    /** Délai max côté navigateur (ms) ; au-delà, annulation avec TimeoutError. */
    timeoutMs?: number;
    /** Plafond tokens générés (`num_predict` côté Ollama). */
    maxTokens?: number;
  },
): Promise<string> {
  assertChatModel(model);
  const combined = mergeAbortWithTimeout(signal, options?.timeoutMs);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (options?.keepAlive != null && options.keepAlive !== "") {
    body.keep_alive = options.keepAlive;
  }
  const runOpts: Record<string, number> = {};
  if (options?.temperature != null) runOpts.temperature = options.temperature;
  if (options?.maxTokens != null && options.maxTokens > 0) {
    runOpts.num_predict = options.maxTokens;
  }
  if (Object.keys(runOpts).length > 0) {
    body.options = runOpts;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
        "Ollama n’a pas renvoyé de réponse dans le délai imparti. Vérifie qu’Ollama tourne, teste `ollama run <modèle>` en terminal, ou choisis un modèle plus petit.",
      );
    }
    throw e;
  }
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
  options?: { maxTokens?: number; temperature?: number },
): Promise<void> {
  assertChatModel(model);
  const body: Record<string, unknown> = { model, messages, stream: true };
  const runOpts: Record<string, number> = {};
  if (options?.temperature != null) runOpts.temperature = options.temperature;
  if (options?.maxTokens != null && options.maxTokens > 0) {
    runOpts.num_predict = options.maxTokens;
  }
  if (Object.keys(runOpts).length > 0) {
    body.options = runOpts;
  }
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
