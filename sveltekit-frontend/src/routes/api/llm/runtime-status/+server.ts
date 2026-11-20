import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveLoadedLlamaModel } from '$lib/server/ai/llama-server-model-resolver.js';
import { LLM_BASE_URL, LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

function responseShape(input: {
	ok: boolean;
	model: string | null;
	modelSource: 'configured-match' | 'llama-server-loaded' | null;
	error: string | null;
}) {
	return {
		...input,
		provider: 'llama-server' as const,
		configuredModel: LLM_MODEL_ID
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return json(responseShape({
			ok: false,
			model: null,
			modelSource: null,
			error: 'Unauthorized'
		}), { status: 401 });
	}

	try {
		const resolved = await resolveLoadedLlamaModel(LLM_BASE_URL, LLM_MODEL_ID, 3_000);
		return json(responseShape({
			ok: true,
			model: resolved.resolvedModel,
			modelSource: resolved.source,
			error: null
		}), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json(responseShape({
			ok: false,
			model: null,
			modelSource: null,
			error: 'Local inference runtime unavailable'
		}), { status: 503, headers: { 'Cache-Control': 'no-store' } });
	}
};
