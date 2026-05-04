/**
 * Centralized Model IDs — Single source of truth for all inference paths.
 *
 * Client inference tiers (priority order):
 *   1. Gemma 4 E2B 2.3B (Q4F16, Transformers.js + WebGPU)        — GPU required
 *   2. LiteRT-LM Gemma 4 E2B (~1.5 GB, XNNPACK CPU + MTP heads)  — CPU/iGPU ok
 *   3. Gemma 3 270M ONNX (W8A16, onnxruntime-web fallback)        — any device
 *
 * Server inference tiers (priority order):
 *   1. TensorRT-LLM (INT4 AWQ, :8099)
 *   2. Triton (:8000)
 *   3. TurboQuant llama-server (turbo3 KV cache, :8090)
 *   4. Bifrost/LiteLLM (semantic cache)
 *   5. Ollama (gemma4-legal, Q4_K_M + Q8_0 KV)
 *
 * Server models (Ollama):
 *   - gemma4-legal:latest for LLM (CUDA RTX)
 *   - embeddinggemma:latest for embeddings (768-dim)
 */

// ── Client Tier 1: Gemma 4 E2B (Transformers.js + WebGPU, primary) ───────

/** Gemma 4 E2B 2.3B — Q4F16 via @huggingface/transformers v4 */
export const CLIENT_E2B_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
export const CLIENT_E2B_DTYPE = 'q4f16' as const;
export const CLIENT_E2B_DEVICE = 'webgpu' as const;
/** Minimum WebGPU adapter memory (bytes) to attempt E2B loading */
export const CLIENT_E2B_MIN_GPU_MB = 2048;

// ── Client Tier 2: LiteRT-LM (Google on-device, CPU/iGPU, MTP heads) ─────
//
// LiteRT-LM: Google's on-device LLM runtime (successor to TFLite).
// - XNNPACK backend: AVX2 (x86), NEON (ARM) — no AVX-512 required
// - GPU: OpenCL (Intel iGPU), Metal (Apple), WebGPU (experimental)
// - MTP (Multi-Token Prediction): 4 speculative heads, ~1.8x speedup
//   MTP heads are ONLY in .litertlm format (stripped from HuggingFace weights)
// - CPU perf: ~8-12 tok/s E2B on i5-10th (AVX2), ~16.8 tok/s on M4 Mac
// - Install: pip install litert-lm
// - CLI: litert-lm gemma-4-E2B-it --prompt "..."
// - HuggingFace: litert-community/gemma-4-E2B-it-litert-lm (~1.5 GB)
//                litert-community/gemma-4-E4B-it-litert-lm (~3.65 GB)

/** LiteRT-LM HuggingFace model IDs */
export const LITERT_E2B_MODEL_ID = 'litert-community/gemma-4-E2B-it-litert-lm';
export const LITERT_E4B_MODEL_ID = 'litert-community/gemma-4-E4B-it-litert-lm';

/** LiteRT-LM local server endpoint (runs as HTTP sidecar) */
export const LITERT_BASE_URL = 'http://127.0.0.1:8070';

/** LiteRT-LM model sizes (MB) */
export const LITERT_E2B_SIZE_MB = 1500;
export const LITERT_E4B_SIZE_MB = 3650;

/** LiteRT-LM MTP (Multi-Token Prediction) config */
export const LITERT_MTP_HEADS = 4;
export const LITERT_MTP_SPEEDUP = 1.8;

/** Minimum RAM (MB) to attempt LiteRT-LM loading */
export const LITERT_E2B_MIN_RAM_MB = 2048;
export const LITERT_E4B_MIN_RAM_MB = 5120;

// ── Client Tier 3: ONNX 270M (legacy Gemma 3 fallback) ───────────────────

/** 270M Gemma3 — W8A16 quantized ONNX for client chat/routing (legacy fallback) */
export const CLIENT_LLM_MODEL = 'gemma3-client-onnx';
export const CLIENT_LLM_ONNX_PATH = '/gemma3_270m_onnx/gemma3_270m_w8a16.onnx';
export const CLIENT_LLM_QUANTIZED_PATH = '/gemma3_270m_onnx/gemma3_client_quantized.onnx';

/** 300M embeddinggemma — QInt8 ONNX for client-side embeddings */
export const CLIENT_EMBEDDING_MODEL = 'embeddinggemma-onnx';
export const CLIENT_EMBEDDING_ONNX_PATH = '/embeddinggemma_300m_onnx/model.onnx';
export const CLIENT_EMBEDDING_DIMS = 768;

/** Tokenizer paths (shared between LLM and embedding models) */
export const CLIENT_LLM_TOKENIZER_PATH = '/gemma3_270m_onnx/tokenizer.json';
export const CLIENT_EMBEDDING_TOKENIZER_PATH = '/embeddinggemma_300m_onnx/tokenizer.json';

// ── Server-side models (Ollama + CUDA RTX) ───────────────────────────────

/** gemma4-legal:latest — Gemma 4 E4B fine-tuned legal LLM via Ollama (GRPO-trained) */
export const SERVER_CHAT_MODEL = 'gemma4-legal:latest';

/** gemma4:e4b Q4_K_M — 8B params, 131K context, native tool calling + thinking via Ollama */
export const SERVER_GEMMA4_MODEL = 'gemma4:e4b-it-q4_K_M';

/** embeddinggemma:latest — 768-dim server embeddings via Ollama */
export const SERVER_EMBEDDING_MODEL = 'embeddinggemma:latest';
export const SERVER_EMBEDDING_DIMS = 768;

/** Fallback embedding model (if embeddinggemma unavailable) */
export const SERVER_EMBEDDING_FALLBACK = 'nomic-embed-text';

/** IBM Granite-Docling-258M — document understanding VLM via Ollama (522 MB) */
export const SERVER_GRANITE_DOCLING_MODEL = 'ibm/granite-docling:258m';

/** gemma4-legal-vlm:latest — merged Gemma 4 legal VLM exposed through the VLM server */
export const SERVER_VLM_MODEL = 'gemma4-legal-vlm:latest';

export type ModelRole =
	| 'planner'
	| 'synthesizer'
	| 'tool_router'
	| 'embedding'
	| 'vlm'
	| 'reward_scorer';

export type ModelRuntime =
	| 'llama-server'
	| 'ollama'
	| 'transformers'
	| 'tensorrt'
	| 'litert'
	| 'onnx';

export type ModelCapabilities = {
	id: string;
	roles: ModelRole[];
	supportsFunctionCalling: boolean;
	/**
	 * PLE is an internal inference/runtime feature, not a retrieval-vector feature.
	 * Keep this false unless the exact runtime/model format has been verified.
	 */
	supportsPLE: boolean;
	supportsVision: boolean;
	supportsAudio: boolean;
	contextWindow?: number;
	embeddingDimensions?: number;
	recommendedRuntime: ModelRuntime;
	notes?: string;
};

// Capability registry for routing and validation. Retrieval embeddings stay on
// EmbeddingGemma/nomic-style embedding models; planner/synthesis models are not
// valid substitutes for Qdrant or semantic-cache vectors.
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
	[SERVER_EMBEDDING_MODEL]: {
		id: SERVER_EMBEDDING_MODEL,
		roles: ['embedding'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		contextWindow: 2048,
		embeddingDimensions: SERVER_EMBEDDING_DIMS,
		recommendedRuntime: 'ollama',
		notes: 'Authoritative retrieval/vector model for Qdrant, semantic cache, clustering, and RAG recall.',
	},
	[SERVER_EMBEDDING_FALLBACK]: {
		id: SERVER_EMBEDDING_FALLBACK,
		roles: ['embedding'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'ollama',
		notes: 'Fallback retrieval embedding model when EmbeddingGemma is unavailable.',
	},
	[`${SERVER_EMBEDDING_FALLBACK}:latest`]: {
		id: `${SERVER_EMBEDDING_FALLBACK}:latest`,
		roles: ['embedding'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'ollama',
		notes: 'Latest-tag fallback retrieval embedding model.',
	},
	[SERVER_CHAT_MODEL]: {
		id: SERVER_CHAT_MODEL,
		roles: ['planner', 'synthesizer', 'reward_scorer'],
		supportsFunctionCalling: true,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'ollama',
		notes: 'Primary server reasoning/synthesis model. Do not use for retrieval vectors.',
	},
	[SERVER_GEMMA4_MODEL]: {
		id: SERVER_GEMMA4_MODEL,
		roles: ['planner', 'synthesizer'],
		supportsFunctionCalling: true,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		contextWindow: 131072,
		recommendedRuntime: 'ollama',
		notes: 'General Gemma 4 reasoning model. Treat as planning/synthesis only.',
	},
	[SERVER_VLM_MODEL]: {
		id: SERVER_VLM_MODEL,
		roles: ['planner', 'synthesizer', 'vlm', 'reward_scorer'],
		supportsFunctionCalling: true,
		supportsPLE: false,
		supportsVision: true,
		supportsAudio: false,
		recommendedRuntime: 'transformers',
		notes: 'Merged legal VLM served by the FastAPI VLM server.',
	},
	[CLIENT_E2B_MODEL_ID]: {
		id: CLIENT_E2B_MODEL_ID,
		roles: ['planner', 'synthesizer'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'transformers',
		notes: 'Primary client-side Gemma 4 E2B model. No retrieval-vector role.',
	},
	[LITERT_E2B_MODEL_ID]: {
		id: LITERT_E2B_MODEL_ID,
		roles: ['planner', 'synthesizer'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'litert',
		notes: 'On-device LiteRT Gemma lane for smaller local inference.',
	},
	[LITERT_E4B_MODEL_ID]: {
		id: LITERT_E4B_MODEL_ID,
		roles: ['planner', 'synthesizer'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'litert',
		notes: 'Larger LiteRT local reasoning lane.',
	},
	[CLIENT_LLM_MODEL]: {
		id: CLIENT_LLM_MODEL,
		roles: ['planner'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		recommendedRuntime: 'onnx',
		notes: 'Legacy Gemma 3 270M ONNX fallback for simple local generation/routing.',
	},
	[CLIENT_EMBEDDING_MODEL]: {
		id: CLIENT_EMBEDDING_MODEL,
		roles: ['embedding'],
		supportsFunctionCalling: false,
		supportsPLE: false,
		supportsVision: false,
		supportsAudio: false,
		embeddingDimensions: CLIENT_EMBEDDING_DIMS,
		recommendedRuntime: 'onnx',
		notes: 'Client-side EmbeddingGemma ONNX for local semantic embedding.',
	},
};

export function getModelCapabilities(modelId: string): ModelCapabilities | null {
	return MODEL_CAPABILITIES[modelId] ?? null;
}

export function pickModelForRole(role: ModelRole): ModelCapabilities | undefined {
	return Object.values(MODEL_CAPABILITIES).find((model) => model.roles.includes(role));
}

export function isEmbeddingModel(modelId: string): boolean {
	return MODEL_CAPABILITIES[modelId]?.roles.includes('embedding') ?? false;
}

export function assertEmbeddingModel(modelId: string): string {
	const capabilities = getModelCapabilities(modelId);
	if (!capabilities) return modelId;

	if (!capabilities.roles.includes('embedding')) {
		throw new Error(
			`Model ${modelId} is registered for ${capabilities.roles.join(', ')} and cannot be used as a retrieval embedding model.`
		);
	}

	return modelId;
}

// ── Server-side VLM Server (HF Transformers + NF4, vision + text + audio) ──
//
// FastAPI server wrapping the merged Gemma 4 E4B legal VLM checkpoint.
// Uses bitsandbytes NF4 quantization (~4 GB VRAM on RTX 3060 Ti).
// This is the ONLY backend that supports vision (image analysis).
// Text + GGUF runners (TurboQuant, Ollama) are text-only.
// Run: python scripts/vlm-server/app.py --model gemma4-legal-vlm-merged --port 8085

/** VLM server endpoint (FastAPI + HF Transformers + NF4) */
export const VLM_BASE_URL = 'http://127.0.0.1:8085';

// ── Server-side TurboQuant (KV cache compression, llama.cpp fork) ─────────
//
// TurboQuant (ICLR 2026): Training-free KV cache quantization.
// - Compresses KV cache to 3 bits/value (turbo3) via random rotation + codebook
// - 5x cache compression, 99.5% attention fidelity, 8x GPU attention speedup
// - turboquant_plus: llama.cpp fork with turbo2/3/4 CUDA+Metal kernels
// - Usage: llama-server -m model.gguf -ctk turbo3 -ctv turbo3 --port 8090
// - Build: cmake -B build -DGGML_CUDA=ON && cmake --build build
// - CPU benefit: KV fits in L3 cache (12MB i5-10th → 256 tokens at turbo3)
// - GPU benefit: 8x attention speedup, 5x VRAM savings on KV cache
// - GitHub: TheTom/turboquant_plus (production-ready llama.cpp fork)

/** TurboQuant llama-server endpoint (OpenAI-compatible, runs alongside Ollama) */
export const TURBOQUANT_BASE_URL = 'http://127.0.0.1:8090';
export const TURBOQUANT_MODEL = 'gemma4-legal';

/** TurboQuant KV cache quantization levels */
export type TurboQuantLevel = 'turbo2' | 'turbo3' | 'turbo4';
export const TURBOQUANT_DEFAULT_LEVEL: TurboQuantLevel = 'turbo3';

/** Context limits per turbo level + VRAM tier */
export const TURBOQUANT_CONTEXT_LIMITS = {
	turbo2: { vram4gb: 8192, vram8gb: 16384, cpu_l3_12mb: 128 },
	turbo3: { vram4gb: 12288, vram8gb: 24576, cpu_l3_12mb: 256 },
	turbo4: { vram4gb: 16384, vram8gb: 32768, cpu_l3_12mb: 384 },
} as const;

// ── Client-Side Service URLs (for browser fetch calls) ──────────────────

/** Bifrost semantic cache — client-side endpoint (routes through SvelteKit API) */
export const BIFROST_BASE_URL_CLIENT = '/api/cache/bifrost';

/** TurboQuant — client-side endpoint (for future direct browser calls if needed) */
export const TURBOQUANT_BASE_URL_CLIENT = 'http://127.0.0.1:8090';

// ── Qdrant collection names ──────────────────────────────────────────────
// These MUST match VECTOR_CONFIG.COLLECTIONS in src/lib/server/config/vector-config.ts
// (server-only file cannot be imported here — keep in sync manually)
export const QDRANT_COLLECTIONS = {
	documents: 'legal_documents',
	cases: 'legal_cases',
	evidence: 'evidence_items',
	chat_history: 'chat_messages',
	embeddings_cache: 'embedding_cache',
	document_tags: 'document_tags',
	topic_clusters: 'topic_clusters',
	llm_cache: 'llm_response_cache',
	poi_profiles: 'poi_profiles',
} as const;

// ── ONNX Runtime execution providers (priority order) ────────────────────

export const ONNX_EXECUTION_PROVIDERS = ['webgpu', 'wasm', 'cpu'] as const;

// ── Inference source tags (for SSE chunk attribution) ────────────────────

export type InferenceSource =
	| 'local-e2b'        // Gemma 4 E2B 2.3B via Transformers.js + WebGPU
	| 'local-litert'     // Gemma 4 E2B/E4B via LiteRT-LM (CPU XNNPACK + MTP heads)
	| 'local-onnx'       // Gemma 3 270M via ONNX Runtime (legacy fallback)
	| 'local-wasm'       // Archived — was llama.cpp WASM
	| 'server-vlm'       // VLM server (HF Transformers + NF4, vision + text, :8085)
	| 'server-turboquant' // TurboQuant llama-server (turbo3 KV cache, :8090)
	| 'server-ollama'    // Ollama gemma4-legal (default server)
	| 'server-agentic'   // Gemma4 multi-round tool-calling agent (/api/ai/agent)
	| 'server-gemini'    // Gemini API (external)
	| 'retrieval-hybrid'; // Client embed + server RAG search

// WASM llama.cpp worker ARCHIVED → deeds_labs/wasm-archive/ (ONNX Runtime WebGPU is superior path)