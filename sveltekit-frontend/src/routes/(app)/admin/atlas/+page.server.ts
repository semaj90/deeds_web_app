import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/atlas');

	const healthPromise = fetch('/api/admin/atlas/health')
		.then(async (r) => (r.ok ? await r.json() : null))
		.catch(() => null);

	const runtimeRegistryPromise = fetch('/api/admin/atlas/runtime-registry')
		.then(async (r) => (r.ok ? await r.json() : null))
		.catch(() => null);

	const documentGovernancePromise = fetch('/api/admin/atlas/document-governance')
		.then(async (r) => (r.ok ? await r.json() : null))
		.catch(() => null);

	const cacheStatsPromise = locals.user.role === 'admin'
		? fetch('/api/admin/cache-stats')
			.then(async (r) => (r.ok ? await r.json() : null))
			.catch(() => null)
		: Promise.resolve(null);

	const [health, runtimeRegistry, documentGovernance, cacheStats] = await Promise.all([
		healthPromise,
		runtimeRegistryPromise,
		documentGovernancePromise,
		cacheStatsPromise
	]);

	const workflowTaskId = url.searchParams.get('taskId');
	const workflowQueueId = url.searchParams.get('queueId');
	const workflowLane = url.searchParams.get('lane');

	const workflowQuery = new URLSearchParams();
	if (workflowTaskId) workflowQuery.set('taskId', workflowTaskId);
	if (workflowQueueId) workflowQuery.set('queueId', workflowQueueId);
	if (workflowLane) workflowQuery.set('lane', workflowLane);

	const workflowStatusPromise = workflowQuery.toString()
		? fetch(`/api/tasks/packets/workflow?${workflowQuery.toString()}`)
				.then(async (r) => (r.ok ? await r.json() : null))
				.catch(() => null)
		: Promise.resolve(null);

	const workflowStatus = await workflowStatusPromise;

	return {
		health,
		runtimeRegistry,
		documentGovernance,
		cacheStats,
		workflowStatus: workflowStatus?.status ?? null,
		rotorquantModelPath: ENV.ROTORQUANT_MODEL_PATH ?? ENV.TURBO_MODEL_PATH ?? ENV.HFORF_MODEL_PATH ?? 'models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf',
		hforfModelPath: ENV.ROTORQUANT_MODEL_PATH ?? ENV.TURBO_MODEL_PATH ?? ENV.HFORF_MODEL_PATH ?? 'models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf',
		llmModelId: LLM_MODEL_ID,
		embeddingOnnxPath: 'models/embeddinggemma_300m_onnx/model.onnx',
		packetJepaPath: 'models/packet-jepa/packet-jepa.pt',
		embedModel: ENV.OLLAMA_EMBED_MODEL,
		graniteDoclingModel: ENV.GRANITE_DOCLING_MODEL,
		kvProfile: process.env.TURBO_PROFILE ?? 'stock'
	};
};
