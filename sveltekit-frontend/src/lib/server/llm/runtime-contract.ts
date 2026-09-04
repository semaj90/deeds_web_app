/**
 * Canonical LLM synthesis/embedding runtime contract.
 *
 * The launcher configuration is the preferred model identity, while the
 * running llama-server's GET /v1/models response is authoritative for each
 * inference request. This lets the app follow an operator-selected alias
 * without rebuilding or restarting the server.
 *
 * Precedence:
 *   ROTORQUANT_MODEL_PATH   canonical
 *   TURBO_MODEL_PATH        deprecated compatibility alias (kept until callers migrate)
 *
 * LLM_MODEL_ID is the configured preference/fallback. Callers that perform
 * inference use resolveLlamaInferenceTarget() and send the discovered ID.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';
import { resolveLoadedLlamaModel } from '$lib/server/ai/llama-server-model-resolver.js';

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

export type RuntimeModelSelectionMode = 'CONFIGURED_VERIFY' | 'LOADED_ACTIVE';

export interface RuntimeModelSelectionPolicyV1 {
	schema: 'atlas.runtime-model-selection-policy.v1';
	mode: RuntimeModelSelectionMode;
	endpoint: string;
	allowedModelFamilies: readonly string[];
}

/** Workstation follows the loaded model, but only within the Ornith 1.5 family. */
export const RUNTIME_MODEL_SELECTION_POLICY: RuntimeModelSelectionPolicyV1 = {
	schema: 'atlas.runtime-model-selection-policy.v1',
	mode: process.env.LLAMA_MODEL_SELECTION_MODE === 'CONFIGURED_VERIFY'
		? 'CONFIGURED_VERIFY'
		: 'LOADED_ACTIVE',
	endpoint: LLM_BASE_URL,
	allowedModelFamilies: ['ornith-1.5'],
};

/**
 * Resolve the model that the already-running llama-server has loaded.
 * The configured alias is only a preference; the server's /v1/models result
 * is authoritative for the request and is used verbatim.
 */
export async function resolveLlamaInferenceTarget(timeoutMs = 3_000): Promise<{
	baseUrl: string;
	model: string;
	configuredModel: string;
	modelSource: 'configured-match' | 'llama-server-loaded';
	selectionPolicy: RuntimeModelSelectionMode;
	selectionReceiptChecksum: string;
}> {
	const resolved = await resolveLoadedLlamaModel(LLM_BASE_URL, LLM_MODEL_ID, timeoutMs);
	const modelAllowed = RUNTIME_MODEL_SELECTION_POLICY.allowedModelFamilies.some((family) =>
		resolved.resolvedModel === family || resolved.resolvedModel.startsWith(`${family}-`)
	);
	if (!modelAllowed) {
		throw new Error(`[llm-runtime-contract] loaded model ${resolved.resolvedModel} is outside the allowed model family`);
	}
	if (RUNTIME_MODEL_SELECTION_POLICY.mode === 'CONFIGURED_VERIFY' && resolved.source !== 'configured-match') {
		throw new Error(`[llm-runtime-contract] configured model ${LLM_MODEL_ID} was not loaded; observed ${resolved.resolvedModel}`);
	}
	const selectionReceiptChecksum = crypto.createHash('sha256').update(JSON.stringify({
		policy: RUNTIME_MODEL_SELECTION_POLICY,
		configuredModel: LLM_MODEL_ID,
		selectedModel: resolved.resolvedModel,
		modelSource: resolved.source,
	})).digest('hex');
	return {
		baseUrl: LLM_BASE_URL,
		model: resolved.resolvedModel,
		configuredModel: LLM_MODEL_ID,
		modelSource: resolved.source,
		selectionPolicy: RUNTIME_MODEL_SELECTION_POLICY.mode,
		selectionReceiptChecksum,
	};
}

export const OLLAMA_EMBED_BASE_URL =
  ENV.OLLAMA_EMBED_BASE_URL ?? ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

export const OLLAMA_EMBED_MODEL = ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

export interface LlmModelMismatch {
  expected: string;
  actual: string;
}

/**
 * Compatibility verification for callers that need to report configured vs
 * loaded identity. Inference callers should use resolveLlamaInferenceTarget.
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
