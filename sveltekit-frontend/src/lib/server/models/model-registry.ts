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
	| 'llama-server'
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
	ornith_legal_reasoning: {
		key: SERVER_CHAT_MODEL,
		role: 'reasoning',
		backend: 'llama-server',
		contextLength: 131072,
		enabled: true,
		notes: 'Primary Ornith 1.5 legal reasoning and synthesis lane via llama-server :8090.',
	},
	legacy_gemma4_dense_reasoning: {
		key: SERVER_GEMMA4_MODEL,
		role: 'reasoning',
		backend: 'ollama',
		contextLength: 131072,
		enabled: false,
		notes: 'Legacy compatibility entry; not an active chat owner.',
	},
	ornith_vision_projector: {
		key: SERVER_VLM_MODEL,
		role: 'vision',
		backend: 'llama-server',
		contextLength: 131072,
		enabled: false,
		notes: 'Ornith 1.5 vision via the mmproj projector on :8090. Disabled: :8090 reports vision=false; enable only after a GPU relaunch with the ornith-1.5-vlm profile and a runtime capability test.',
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
	if (kind === 'general') return SERVER_CHAT_MODEL;
	return SERVER_CHAT_MODEL;
}

export function getClientHelperModelId(): string {
	return CLIENT_LLM_MODEL;
}

/**
 * One binding per (role, served model). Every active inference route must resolve through this list.
 * Historical and experimental identities stay here with their real model ids and artifact hashes.
 * `artifactSha256: null` means not recorded yet; it is never filled from a guess.
 */
export type AtlasModelRole = 'chat' | 'vision' | 'embedding' | 'reranker' | 'training' | 'experimental' | 'client';

export type AtlasModelBinding = {
	role: AtlasModelRole;
	modelId: string;
	backend: 'llama-server' | 'ollama' | 'transformers' | 'onnx' | 'webgpu' | 'litert' | 'none';
	endpoint: string | null;
	artifactPath: string | null;
	artifactSha256: string | null;
	tokenizerRevision: string | null;
	adapterRevision: string | null;
	enabled: boolean;
	capabilities: { text: boolean; vision: boolean; toolCalling: boolean };
};

export const ATLAS_MODEL_BINDINGS: readonly AtlasModelBinding[] = [
	{
		role: 'chat',
		modelId: SERVER_CHAT_MODEL,
		backend: 'llama-server',
		endpoint: 'http://127.0.0.1:8090/v1',
		artifactPath: 'models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf',
		artifactSha256: 'a9a8d6d859b540502f57c53ef78a4a608df818061b180022a32b9af46698d5c6',
		tokenizerRevision: null,
		adapterRevision: null,
		enabled: true,
		capabilities: { text: true, vision: false, toolCalling: true },
	},
	{
		role: 'vision',
		modelId: SERVER_VLM_MODEL,
		backend: 'llama-server',
		endpoint: 'http://127.0.0.1:8090/v1',
		artifactPath: 'models/mmproj-Ornith-1.5-9B-BF16.gguf',
		artifactSha256: '626f9f90627402a6bf4a999111d0fbd69b5fcca7aa8ba089d69e5f10e8858e1d',
		tokenizerRevision: null,
		adapterRevision: null,
		enabled: false,
		capabilities: { text: false, vision: false, toolCalling: false },
	},
	{
		role: 'embedding',
		modelId: SERVER_EMBEDDING_MODEL,
		backend: 'ollama',
		endpoint: null,
		artifactPath: null,
		artifactSha256: null,
		tokenizerRevision: null,
		adapterRevision: null,
		enabled: true,
		capabilities: { text: true, vision: false, toolCalling: false },
	},
	{
		role: 'experimental',
		modelId: SERVER_GEMMA4_MODEL,
		backend: 'ollama',
		endpoint: null,
		artifactPath: null,
		artifactSha256: null,
		tokenizerRevision: null,
		adapterRevision: null,
		enabled: false,
		capabilities: { text: true, vision: false, toolCalling: false },
	},
	{
		role: 'client',
		modelId: CLIENT_E2B_MODEL_ID,
		backend: 'webgpu',
		endpoint: null,
		artifactPath: 'sveltekit-frontend/static/gemma4_e2b_onnx',
		artifactSha256: null,
		tokenizerRevision: null,
		adapterRevision: null,
		enabled: true,
		capabilities: { text: true, vision: false, toolCalling: false },
	},
];

/** The single active chat route. Throws if the chat binding is missing or not served by llama-server :8090. */
export function getActiveChatBinding(): AtlasModelBinding {
	const chats = ATLAS_MODEL_BINDINGS.filter((b) => b.role === 'chat' && b.enabled);
	if (chats.length !== 1) throw new Error(`MODEL_REGISTRY: expected exactly one enabled chat binding, found ${chats.length}`);
	const [chat] = chats;
	if (chat.backend !== 'llama-server' || chat.endpoint !== 'http://127.0.0.1:8090/v1') {
		throw new Error(`MODEL_REGISTRY: chat must be llama-server :8090, got ${chat.backend} ${chat.endpoint}`);
	}
	return chat;
}
