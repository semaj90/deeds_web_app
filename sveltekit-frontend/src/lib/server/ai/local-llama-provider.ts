import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ENV } from '../env.server.js';

/** Base URL for llama-server OpenAI-compatible API (e.g. http://127.0.0.1:8090/v1) */
export const LLAMA_SERVER_BASE_URL: string =
	(ENV.TURBOQUANT_BASE_URL as string).replace(/\/?$/, '') + '/v1';

/** Health-check URL — same host, /health path */
export const LLAMA_SERVER_HEALTH_URL: string =
	(ENV.TURBOQUANT_BASE_URL as string).replace(/\/?$/, '') + '/health';

/** Model to use for VLM / text requests via llama-server */
export const LOCAL_VLM_MODEL: string =
	process.env.VLM_MODEL ??
	process.env.TURBO_MODEL ??
	'gemma4-legal-iq4xs-direct.gguf';

/** Vercel AI SDK provider pointed at the local llama-server instance */
export const llamaServer = createOpenAICompatible({
	name: 'llama-server',
	baseURL: LLAMA_SERVER_BASE_URL,
	// llama-server ignores the key; required field for the OpenAI-compat provider
	apiKey: process.env.LLAMA_SERVER_API_KEY ?? 'local-no-key',
	headers: { 'x-llama-source': 'deeds-vlm-lane' },
});
