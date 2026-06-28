/**
 * GPU Module Barrel Export
 *
 * Re-exports all GPU acceleration utilities for clean imports:
 *   import { globalGPUManager, embedAndCompare } from '$lib/gpu';
 */

// Core compute pipeline (actively used by /global-search, /api/gpu/compute)
export { DeedsGPUCompute, getGPUCompute, getCachedGPUCompute, type ComputeResult } from './gpu-compute-pipeline.js';
export { gpuRerank, type GPURankedItem, type GPURerankMetrics } from './gpu-search-reranker.js';
export { SHADER_REGISTRY, getShader, getShaderIds, type ShaderSpec } from './shader-registry.js';

// GPU management — singleton WebGPU/WebGL2/CPU fallback detector
export { globalGPUManager } from './global-gpu-manager.js';
export type { HybridGPUContext } from './hybrid-gpu-context.js';

// Server-side embedding bridge — gRPC → GPU similarity → QLoRA compression
export { embedAndCompare, type EmbeddingBatchResult } from './gpu-embedding-bridge.js';

// Runtime config constants
export {
	NODE_RUNTIME_CONFIG, GPU_MARKDOWN_ENV,
	GPUMarkdownPerformanceMonitor, GPUMemoryManager,
} from './runtime-optimizations.js';

// NES memory bridge (FlatBuffer serialization shim)
export { nesGPUBridge } from './nes-gpu-memory-bridge.js';

// GPU Acceleration Implementations (replaces script-only approach)
export {
	findBMUBatch,
	findBMU,
	getGridNeighbors,
	initializeCentroids,
	SOMConfig,
	type SOMClusterAssignment,
	type SOMGridState
} from './som-clustering.js';

export {
	encodeToLatent,
	decodeFromLatent,
	encodeBatch,
	measureReconstructionError,
	quantizeINT8,
	dequantizeINT8,
	AutoencoderDefaults,
	type AutoencoderConfig,
	type EncodedPacket
} from './autoencoder-compression.js';

export {
	computeAttentionScore,
	computeAttentionBatch,
	computeMultiHeadAttention,
	cosineSimilarity,
	sigmoid,
	softmax,
	AttentionDefaults,
	type AttentionScoreResult,
	type AttentionConfig
} from './attention-scoring.js';

// Wiring modules (ACE integration layer)
export {
	somTopologyPrefilter,
	type SOMPrefilterConfig,
	type SOMPrefilterResult,
	type SOMPrefilterStats
} from '../server/retrieval/som-topology-prefilter.js';

export {
	compressEmbeddingBatch,
	quantizeLatent,
	dequantizeLatent,
	type CompressionPipelineInput,
	type CompressionPipelineOutput,
	type CompressionPipelineOpts,
	type CompressionStats
} from '../server/retrieval/autoencoder-compression-pipeline.js';

export {
	rerankWithAttention,
	rerankWithKarpathyBlend,
	type RerankableDocWithAttention,
	type AttentionRerankResult,
	type AttentionRerankConfig
} from '../server/retrieval/attention-reranker.js';
