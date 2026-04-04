/**
 * Centralized Model IDs — Single source of truth for all inference paths.
 *
 * Client models (ONNX, browser-side):
 *   - Served from /static/ via SvelteKit
 *   - Loaded by onnxruntime-web with WebGPU EP (Dawn)
 *
 * Server models (Ollama):
 *   - gemma3-legal:latest for LLM (CUDA RTX)
 *   - embeddinggemma:latest for embeddings (768-dim)
 */

// ── Client-side Gemma 4 E2B (Transformers.js + WebGPU, primary) ──────────

/** Gemma 4 E2B 2.3B — Q4F16 via @huggingface/transformers v4 */
export const CLIENT_E2B_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
export const CLIENT_E2B_DTYPE = 'q4f16' as const;
export const CLIENT_E2B_DEVICE = 'webgpu' as const;
/** Minimum WebGPU adapter memory (bytes) to attempt E2B loading */
export const CLIENT_E2B_MIN_GPU_MB = 2048;

// ── Client-side ONNX models (browser inference via Dawn/WebGPU, fallback) ─

/** 270M Gemma3 — W8A16 quantized ONNX for client chat/routing (fallback) */
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

/** gemma3-legal:latest — 12B fine-tuned legal LLM via Ollama */
export const SERVER_CHAT_MODEL = 'gemma3-legal:latest';

/** gemma4:e4b Q4_K_M — 8B params, 131K context, native tool calling + thinking via Ollama */
export const SERVER_GEMMA4_MODEL = 'gemma4:e4b-it-q4_K_M';

/** embeddinggemma:latest — 768-dim server embeddings via Ollama */
export const SERVER_EMBEDDING_MODEL = 'embeddinggemma:latest';
export const SERVER_EMBEDDING_DIMS = 768;

/** Fallback embedding model (if embeddinggemma unavailable) */
export const SERVER_EMBEDDING_FALLBACK = 'nomic-embed-text';

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

export type InferenceSource = 'local-e2b' | 'local-onnx' | 'local-wasm' | 'server-ollama' | 'server-gemini' | 'retrieval-hybrid';

// WASM llama.cpp worker ARCHIVED → deeds_labs/wasm-archive/ (ONNX Runtime WebGPU is superior path)