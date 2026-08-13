/**
 * Node-compatible sibling of sveltekit-frontend/src/lib/server/llm/runtime-contract.ts.
 * Same resolution policy — for .mjs/.mts scripts that cannot import the $lib alias.
 * Keep both in sync; do not fork the precedence rules.
 */
import path from 'node:path';

export const LLM_BASE_URL =
  process.env.LLAMA_SERVER_URL ??
  process.env.TURBOQUANT_URL ??
  process.env.TURBOQUANT_BASE_URL ??
  'http://127.0.0.1:8090';

const resolvedModelPath = process.env.ROTORQUANT_MODEL_PATH ?? process.env.TURBO_MODEL_PATH ?? null;

if (!resolvedModelPath) {
  throw new Error(
    '[llm-runtime] ROTORQUANT_MODEL_PATH is required (deprecated alias: TURBO_MODEL_PATH). ' +
      'Set it to the absolute path of the GGUF llama-server.exe is launched with.'
  );
}

export const ROTORQUANT_MODEL_PATH = resolvedModelPath;
export const TURBO_MMPROJ_PATH = process.env.TURBO_MMPROJ_PATH ?? null;

/** Derived from ROTORQUANT_MODEL_PATH's filename — never set independently. */
export const LLM_MODEL_ID = path.basename(resolvedModelPath);

export const OLLAMA_EMBED_BASE_URL =
  process.env.OLLAMA_EMBED_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

/** Verification only — GET /v1/models proves what loaded, it never chooses the model. */
export async function verifyLoadedModel(timeoutMs = 3_000) {
  const url = `${LLM_BASE_URL.replace(/\/$/, '')}/v1/models`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`[llm-runtime] GET ${url} failed: HTTP ${res.status}`);
  const body = await res.json();
  const loaded = body?.data?.[0]?.id;
  if (!loaded) throw new Error(`[llm-runtime] GET ${url} returned no loaded model`);
  if (loaded === LLM_MODEL_ID) return null;
  return { expected: LLM_MODEL_ID, actual: loaded };
}
