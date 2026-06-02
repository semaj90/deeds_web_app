import { LLAMA_SERVER_BASE_URL, LLAMA_SERVER_HEALTH_URL } from './local-llama-provider.js';

export type VlmReadiness = Readonly<{
	serverUp: boolean;
	modelId?: string;
	multimodal: boolean;
	vlmReady: boolean;
	reason?: string;
}>;

let _cached: { ts: number; result: VlmReadiness } | null = null;
const CACHE_TTL_MS = 30_000;

export async function checkVlmReadiness(force = false): Promise<VlmReadiness> {
	if (!force && _cached && Date.now() - _cached.ts < CACHE_TTL_MS) {
		return _cached.result;
	}

	const result = await _probe();
	_cached = { ts: Date.now(), result };
	return result;
}

async function _probe(): Promise<VlmReadiness> {
	try {
		const health = await fetch(LLAMA_SERVER_HEALTH_URL, { signal: AbortSignal.timeout(3000) }).catch(
			() => null
		);
		if (!health?.ok) {
			return { serverUp: false, multimodal: false, vlmReady: false, reason: 'llama_server_health_failed' };
		}

		const modelsUrl = `${LLAMA_SERVER_BASE_URL.replace(/\/v1\/?$/, '')}/v1/models`;
		const modelsRes = await fetch(modelsUrl, { signal: AbortSignal.timeout(3000) });
		if (!modelsRes.ok) {
			return { serverUp: true, multimodal: false, vlmReady: false, reason: 'v1_models_failed' };
		}

		const models = await modelsRes.json() as Record<string, unknown>;

		// llama-server returns { data: [...] } (OAI shape) OR { models: [...] }
		const modelList = (models?.data as unknown[]) ?? (models?.models as unknown[]) ?? [];
		const model = (modelList[0] ?? {}) as Record<string, unknown>;

		const modelId =
			(model?.id as string | undefined) ??
			(model?.model as string | undefined) ??
			(model?.name as string | undefined);

		const capabilities: string[] =
			(model?.capabilities as string[] | undefined) ??
			[];

		const multimodal = capabilities.includes('multimodal');

		return {
			serverUp: true,
			modelId,
			multimodal,
			vlmReady: multimodal,
			reason: multimodal ? undefined : 'model_missing_multimodal_capability',
		};
	} catch (err) {
		return {
			serverUp: false,
			multimodal: false,
			vlmReady: false,
			reason: err instanceof Error ? err.message : 'vlm_readiness_error',
		};
	}
}
