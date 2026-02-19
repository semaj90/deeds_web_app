import { getOllamaEmbeddingModel, getOllamaEndpoint } from "../ollama-endpoint.mjs";

export interface EmbedOptions {
  /**
   * Override the embedding model (defaults to `getOllamaEmbeddingModel()`).
   */
  model?: string;
  /**
   * Number of retry attempts after the initial call fails.
   */
  retries?: number;
  /**
   * Delay in milliseconds between retries.
   */
  retryDelayMs?: number;
  /**
   * Abort signal propagated to the underlying fetch call.
   */
  signal?: AbortSignal;
  /**
   * Timeout applied to each embedding request in milliseconds.
   */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<Omit<EmbedOptions, "model" | "signal">> = {
  retries: 2,
  retryDelayMs: 1_500,
  timeoutMs: 45_000,
};

const EMBEDDINGS_PATH = "/api/embeddings";

/**
 * Lightweight embedding client for local Ollama / TensorRT endpoints.
 * Falls back from the modern `input` payload to legacy `prompt` payloads and
 * normalises all returned vectors into simple number arrays.
 */
export async function embedText(
  text: string,
  modelOverride?: string,
  options: EmbedOptions = {},
): Promise<number[]> {
  if (!text?.trim()) {
    throw new Error("[embedding-client] Cannot embed empty text payload.");
  }

  const model = options.model ?? modelOverride ?? getOllamaEmbeddingModel();
  const endpoint = normaliseBaseUrl(getOllamaEndpoint());
  const url = `${endpoint}${EMBEDDINGS_PATH}`;

  const retries = options.retries ?? DEFAULT_OPTIONS.retries;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_OPTIONS.retryDelayMs;
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const vector =
        (await requestEmbedding(url, model, text, "input", timeoutMs, options.signal)) ??
        (await requestEmbedding(url, model, text, "prompt", timeoutMs, options.signal));

      if (!vector) {
        throw new Error("Embedding provider returned an empty payload.");
      }

      return vector;
    } catch (error) {
      lastError = error;

      if (attempt >= retries) {
        break;
      }

      await delay(retryDelayMs);
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : JSON.stringify(lastError, null, 2);
  throw new Error(`[embedding-client] Failed to embed text after ${retries + 1} attempts: ${message}`);
}

type PayloadMode = "input" | "prompt";

async function requestEmbedding(
  url: string,
  model: string,
  text: string,
  mode: PayloadMode,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<number[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = outerSignal
    ? anySignal([controller.signal, outerSignal])
    : controller.signal;

  try {
    const payload =
      mode === "input"
        ? { model, input: text }
        : { model, prompt: text };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(`HTTP ${response.status} ${response.statusText} (${mode}) ${body}`);
    }

    const json = await response.json();
    const vector = extractEmbedding(json);
    return vector;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`[embedding-client] Embedding request timed out after ${timeoutMs}ms (${mode}).`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractEmbedding(json: unknown): number[] | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  const candidateKeys = ["embedding", "vector", "data"];

  for (const key of candidateKeys) {
    if (!(key in json)) {
      continue;
    }

    const value = (json as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
        // Handle OpenAI-style { data: [{ embedding: [...] }] }
        for (const item of value) {
          if (item && typeof item === "object") {
            const nested = (item as Record<string, unknown>).embedding;
            const vector = coerceToNumberArray(nested);
            if (vector) {
              return vector;
            }
          }
        }
      } else {
        const vector = coerceToNumberArray(value);
        if (vector) {
          return vector;
        }
      }
    } else {
      const vector = coerceToNumberArray(value);
      if (vector) {
        return vector;
      }
    }
  }

  return null;
}

function coerceToNumberArray(value: unknown): number[] | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value as ArrayLike<number>).map((item) => Number(item));
  }

  return null;
}

function normaliseBaseUrl(url: string): string {
  if (!url) {
    throw new Error("[embedding-client] Missing Ollama/TensorRT endpoint.");
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unavailable>";
  }
}

/**
 * Compose multiple abort signals into a single signal.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) {
    return signals[0];
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  return controller.signal;
}
