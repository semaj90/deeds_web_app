/**
 * Canonical LLM synthesis/embedding runtime contract.
 *
 * Model selection source of truth is the ENV launcher variables, NOT
 * GET /v1/models. `/v1/models` is a verification endpoint only — it proves
 * llama-server.exe actually loaded the model requested by env, it never
 * *chooses* the model.
 *
 * Precedence:
 *   ROTORQUANT_MODEL_PATH   canonical
 *   TURBO_MODEL_PATH        deprecated compatibility alias (kept until callers migrate)
 *
 * LLM_MODEL_ID uses the explicit llama-server alias when configured, then
 * falls back to the resolved model filename for older launchers. The alias
 * is still verified against GET /v1/models at runtime.
 */
import path from 'node:path';
import { ENV } from '$lib/server/env.server.js';

export const LLM_BASE_URL =
  ENV.LLAMA_SERVER_URL ??
  ENV.TURBOQUANT_URL ??
  ENV.TURBOQUANT_BASE_URL ??
  'http://127.0.0.1:8090';

const resolvedModelPath = ENV.ROTORQUANT_MODEL_PATH ?? ENV.TURBO_MODEL_PATH ?? null;

if (!resolvedModelPath) {
  throw new Error(
    '[llm-runtime-contract] ROTORQUANT_MODEL_PATH is required (deprecated alias: TURBO_MODEL_PATH). ' +
      'Set it to the absolute path of the GGUF llama-server.exe is launched with; ' +
      'the chat alias may be supplied separately by LLAMA_SERVER_MODEL and is verified against GET /v1/models.'
  );
}

/** Absolute GGUF path actually resolved (ROTORQUANT_MODEL_PATH, else legacy TURBO_MODEL_PATH). */
export const ROTORQUANT_MODEL_PATH = resolvedModelPath;

/** Optional multimodal projection file belonging to the selected model. */
export const TURBO_MMPROJ_PATH = ENV.TURBO_MMPROJ_PATH ?? null;

/**
 * The only chat model identifier the app should send in `{ model: ... }`.
 * Prefer the launcher/API alias so requests address the loaded model rather
 * than an internal GGUF filename.
 */
export const LLM_MODEL_ID = ENV.LLAMA_SERVER_MODEL ?? path.basename(resolvedModelPath);

export const OLLAMA_EMBED_BASE_URL =
  ENV.OLLAMA_EMBED_BASE_URL ?? ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

export const OLLAMA_EMBED_MODEL = ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

export interface LlmModelMismatch {
  expected: string;
  actual: string;
}

/**
 * Startup invariant check — queries llama-server's GET /v1/models and
 * compares against LLM_MODEL_ID. This is the ONLY legitimate use of
 * /v1/models in this codebase: verification, never discovery.
 */
export async function verifyLoadedModel(timeoutMs = 3_000): Promise<LlmModelMismatch | null> {
  const url = `${LLM_BASE_URL.replace(/\/$/, '')}/v1/models`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`[llm-runtime-contract] GET ${url} failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const loaded = body.data?.[0]?.id;
  if (!loaded) {
    throw new Error(`[llm-runtime-contract] GET ${url} returned no loaded model`);
  }
  if (loaded === LLM_MODEL_ID) return null;
  return { expected: LLM_MODEL_ID, actual: loaded };
}
