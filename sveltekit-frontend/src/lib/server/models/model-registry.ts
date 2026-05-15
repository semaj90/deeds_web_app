import {
	CLIENT_EMBEDDING_MODEL,
	CLIENT_E2B_MODEL_ID,
	CLIENT_LLM_MODEL,
	LITERT_E4B_MODEL_ID,
	LITERT_E2B_MODEL_ID,
	SERVER_CHAT_MODEL,
	SERVER_EMBEDDING_MODEL,
	SERVER_GEMMA4_MODEL,
	SERVER_VLM_MODEL,
} from '$lib/ai/model-ids.js';

export type ModelRole = 'embedding' | 'rerank' | 'reasoning' | 'vision' | 'audio' | 'client-helper';

export type ModelBackend =
	| 'grpc'
	| 'turboquant'
	| 'ollama'
	| 'onnx'
	| 'webgpu'
	| 'litert'
	| 'native'
	| 'python'
	| 'transformers';

export type ModelRegistryEntry = {
	key: string;
	role: ModelRole;
	backend: ModelBackend;
	endpoint?: string;
	dimensions?: number;
	contextLength?: number;
	enabled: boolean;
	notes: string;
};

export const MODEL_REGISTRY = {
	embeddinggemma_server: {
		key: SERVER_EMBEDDING_MODEL,
		role: 'embedding',
		backend: 'ollama',
		dimensions: 768,
		enabled: true,
		notes: 'Canonical retrieval-vector lane for Qdrant, TurboVec, clustering, and ACE recall.',
	},
	gemma4_legal_reasoning: {
		key: SERVER_CHAT_MODEL,
		role: 'reasoning',
		backend: 'ollama',
		contextLength: 131072,
		enabled: true,
		notes: 'Primary legal reasoning and synthesis lane for server-side workflows.',
	},
	gemma4_dense_reasoning: {
		key: SERVER_GEMMA4_MODEL,
		role: 'reasoning',
		backend: 'ollama',
		contextLength: 131072,
		enabled: true,
		notes: 'General Gemma4 dense reasoning lane for drafting, analysis, and tool use.',
	},
	gemma4_vlm_reasoning: {
		key: SERVER_VLM_MODEL,
		role: 'vision',
		backend: 'transformers',
		contextLength: 131072,
		enabled: true,
		notes: 'Vision + text reasoning lane for multimodal interpretation.',
	},
	client_embeddinggemma: {
		key: CLIENT_EMBEDDING_MODEL,
		role: 'embedding',
		backend: 'onnx',
		dimensions: 768,
		enabled: true,
		notes: 'Optional local embedding helper for browser-side semantic features.',
	},
	client_gemma4_webgpu: {
		key: CLIENT_E2B_MODEL_ID,
		role: 'client-helper',
		backend: 'webgpu',
		enabled: true,
		notes: 'Opt-in browser helper only; not the default legal reasoning lane.',
	},
	client_gemma4_litert_e2b: {
		key: LITERT_E2B_MODEL_ID,
		role: 'client-helper',
		backend: 'litert',
		enabled: true,
		notes: 'Opt-in local helper for small client-side tasks.',
	},
	client_gemma4_litert_e4b: {
		key: LITERT_E4B_MODEL_ID,
		role: 'client-helper',
		backend: 'litert',
		enabled: true,
		notes: 'Larger opt-in client helper; still not the default reasoning lane.',
	},
	client_gemma3_helper: {
		key: CLIENT_LLM_MODEL,
		role: 'client-helper',
		backend: 'onnx',
		enabled: true,
		notes: 'Legacy ONNX helper fallback for simple browser/local UI tasks.',
	},
} satisfies Record<string, ModelRegistryEntry>;

export function getModelRegistryEntry(key: string): ModelRegistryEntry | null {
	for (const entry of Object.values(MODEL_REGISTRY)) {
		if (entry.key === key) return entry;
	}
	return null;
}

export function getModelsByRole(role: ModelRole): ModelRegistryEntry[] {
	return Object.values(MODEL_REGISTRY).filter((entry) => entry.role === role && entry.enabled);
}

export function getEmbeddingModelId(): string {
	return getModelsByRole('embedding')[0]?.key ?? SERVER_EMBEDDING_MODEL;
}

export function getReasoningModelId(kind: 'legal' | 'general' = 'legal'): string {
	if (kind === 'general') return SERVER_GEMMA4_MODEL;
	return SERVER_CHAT_MODEL;
}

export function getClientHelperModelId(): string {
	return CLIENT_LLM_MODEL;
}
