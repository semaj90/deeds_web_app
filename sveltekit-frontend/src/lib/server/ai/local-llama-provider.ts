import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { basename } from 'node:path';
import { ENV } from '../env.server.js';
import { resolveLoadedLlamaModel, type ResolvedInferenceModel } from './llama-server-model-resolver.js';
import { LLM_MODEL_ID } from '../llm/runtime-contract.js';

function resolveLlamaServerBaseUrl(): string {
	const raw =
		ENV.TURBOQUANT_BASE_URL ??
		ENV.TENSORRT_URL ??
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

export interface LlamaSessionDescriptor {
	baseUrl: string;
	modelId: string;
	healthy: boolean;
	discoveredAt: string;
	source: ResolvedInferenceModel['source'] | 'fallback';
}

let cachedSessionDescriptor: LlamaSessionDescriptor | null = null;

function resolveLlamaServerModelId(): string {
	const configuredModel = String(
		LLM_MODEL_ID
	).trim();
	if (configuredModel) return configuredModel;

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

	return LLM_MODEL_ID;
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
 * real GET /v1/models call. The live session model is the authority for a
 * given 8090 runtime; LOCAL_VLM_MODEL remains the configured fallback alias
 * so legacy sync call sites can still compile.
 */
export async function verifyLocalVlmModel(): Promise<ResolvedInferenceModel> {
	return resolveLoadedLlamaModel(resolveLlamaServerBaseUrl(), LOCAL_VLM_MODEL);
}

/**
 * Resolve and cache the live llama-server session descriptor.
 *
 * The loaded model reported by GET /v1/models is the session authority; the
 * env-derived model name remains a fallback expectation only.
 */
export async function getLlamaSessionDescriptor(
	refresh = false,
	timeoutMs = 3_000
): Promise<LlamaSessionDescriptor> {
	if (cachedSessionDescriptor && !refresh) return cachedSessionDescriptor;

	try {
		const resolved = await resolveLoadedLlamaModel(resolveLlamaServerBaseUrl(), LOCAL_VLM_MODEL, timeoutMs);
		cachedSessionDescriptor = {
			baseUrl: resolveLlamaServerBaseUrl(),
			modelId: resolved.resolvedModel,
			healthy: true,
			discoveredAt: new Date().toISOString(),
			source: resolved.source,
		};
		return cachedSessionDescriptor;
	} catch {
		cachedSessionDescriptor = {
			baseUrl: resolveLlamaServerBaseUrl(),
			modelId: LOCAL_VLM_MODEL,
			healthy: false,
			discoveredAt: new Date().toISOString(),
			source: 'fallback',
		};
		return cachedSessionDescriptor;
	}
}

export async function getLlamaSessionModel(refresh = false, timeoutMs = 3_000): Promise<string> {
	return (await getLlamaSessionDescriptor(refresh, timeoutMs)).modelId;
}

export async function assertExpectedLlamaModel(
	expected = LOCAL_VLM_MODEL,
	timeoutMs = 3_000
): Promise<string> {
	const actual = await getLlamaSessionModel(true, timeoutMs);
	if (actual !== expected) {
		throw new Error(`llama-server model drift: expected ${expected}, loaded ${actual}`);
	}
	return actual;
}

/**
 * Resolve the best model identifier for live inference.
 *
 * Preference order:
 * 1) the actually loaded llama-server model when discovery succeeds
 * 2) the configured model identifier when discovery fails or the server is unavailable
 *
 * This keeps callers on the loaded model identity without forcing a startup warning.
 */
export async function getActiveLocalVlmModel(refresh = true): Promise<string> {
	return getLlamaSessionModel(refresh);
}
