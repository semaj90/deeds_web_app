/**
 * GPU Module Barrel Export
 *
 * Re-exports all GPU acceleration utilities for clean imports:
 *   import { globalGPUManager, embedAndCompare, createGPUSOM } from '$lib/gpu';
 */

// Core compute pipeline (actively used by /global-search, /api/gpu/compute)
export { DeedsGPUCompute, getGPUCompute, getCachedGPUCompute, type ComputeResult } from './gpu-compute-pipeline.js';
export { gpuRerank, type GPURankedItem, type GPURerankMetrics } from './gpu-search-reranker.js';
export { SHADER_REGISTRY, getShader, getShaderIds, type ShaderSpec } from './shader-registry.js';

// GPU management — singleton WebGPU/WebGL2/CPU fallback detector
export { globalGPUManager } from './global-gpu-manager.js';
export type { HybridGPUContext } from './hybrid-gpu-context.js';

// SOM clustering — GPU-accelerated Self-Organizing Map
export { GPUSOMEmbeddings, createGPUSOM, type GPUSOMConfig, type GPUSOMResult } from './gpu-som-embeddings.js';

// Server-side embedding bridge — gRPC → GPU similarity → QLoRA compression
export { embedAndCompare, type EmbeddingBatchResult } from './gpu-embedding-bridge.js';

// Runtime config constants
export {
	NODE_RUNTIME_CONFIG, GPU_MARKDOWN_ENV,
	GPUMarkdownPerformanceMonitor, GPUMemoryManager,
} from './runtime-optimizations.js';

// NES memory bridge (FlatBuffer serialization shim)
export { nesGPUBridge } from './nes-gpu-memory-bridge.js';