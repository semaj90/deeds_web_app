import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { basename } from 'node:path';
import { ENV } from '../env.server.js';
import { resolveLoadedLlamaModel, type ResolvedInferenceModel } from './llama-server-model-resolver.js';

function resolveLlamaServerBaseUrl(): string {
	const raw =
		ENV.TURBOQUANT_BASE_URL ??
		ENV.TRTLLM_URL ??
		ENV.TRITON_URL ??
		'http://127.0.0.1:8090';
	return String(raw).replace(/\/?$/, '');
}

/** Base URL for llama-server.exe OpenAI-compatible API (e.g. http://127.0.0.1:8090/v1) */
export const LLAMA_SERVER_BASE_URL: string =
	resolveLlamaServerBaseUrl() + '/v1';

/** Health-check URL — same host, /health path */
export const LLAMA_SERVER_HEALTH_URL: string =
	resolveLlamaServerBaseUrl() + '/health';

/** Model to use for VLM / text requests via llama-server */
export const LOCAL_VLM_MODEL: string = resolveLlamaServerModelId();

function resolveLlamaServerModelId(): string {
	const modelPath = String(
		ENV.ROTORQUANT_MODEL_PATH ??
		ENV.TURBO_MODEL_PATH ??
		ENV.TURBOQUANT_MODEL_PATH ??
		'',
	).trim();
	if (modelPath) {
		const base = basename(modelPath).trim();
		if (base) return base;
	}

	return 'gemma4-legal-iq4xs-direct.gguf';
}

/** Vercel AI SDK provider pointed at the local llama-server.exe synthesis lane */
export const llamaServer = createOpenAICompatible({
	name: 'llama-server',
	baseURL: LLAMA_SERVER_BASE_URL,
	// llama-server ignores the key; required field for the OpenAI-compat provider
	apiKey: process.env.LLAMA_SERVER_API_KEY ?? 'local-no-key',
	headers: { 'x-llama-source': 'deeds-vlm-lane' },
});

/**
 * Verify LOCAL_VLM_MODEL against what llama-server actually has loaded, via a
 * real GET /v1/models call. LOCAL_VLM_MODEL itself stays a static, env-derived
 * string computed once at module load (47+ call sites depend on it being a
 * plain string, not a promise) — this is an opt-in check for callers that
 * want to confirm live state, e.g. a startup health probe.
 */
export async function verifyLocalVlmModel(): Promise<ResolvedInferenceModel> {
	return resolveLoadedLlamaModel(resolveLlamaServerBaseUrl(), LOCAL_VLM_MODEL);
}

// Fire-and-forget drift check at module load: if someone restarts
// llama-server with a different GGUF without updating ROTORQUANT_MODEL_PATH/
// TURBO_MODEL_PATH/TURBOQUANT_MODEL_PATH, every request under LOCAL_VLM_MODEL
// would silently target the wrong model name. This doesn't block module load
// or change LOCAL_VLM_MODEL — it only surfaces the mismatch loudly.
verifyLocalVlmModel()
	.then((resolved) => {
		if (resolved.source === 'llama-server-loaded') {
			console.warn(
					`[local-llama-provider] LOCAL_VLM_MODEL="${LOCAL_VLM_MODEL}" does not match what ` +
					`llama-server has loaded ("${resolved.resolvedModel}") at ${resolveLlamaServerBaseUrl()}. ` +
					`Requests are still sent under LOCAL_VLM_MODEL — update ROTORQUANT_MODEL_PATH/` +
					`TURBO_MODEL_PATH/TURBOQUANT_MODEL_PATH, or restart the app, to match the loaded GGUF.`
			);
		}
	})
	.catch(() => {
		/* llama-server may not be up yet at module load — best-effort only, non-fatal */
	});
