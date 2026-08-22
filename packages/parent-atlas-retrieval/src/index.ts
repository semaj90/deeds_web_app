// Parent Atlas Retrieval Package — GPU Acceleration Pipeline
// Exports: Bifrost semantic cache, TurboVec prefilter/reranking, GPU operations

// Bifrost L1/L2 semantic cache layer
export { bifrostChat, bifrostCacheManager } from './bifrost/bifrost-provider.js';
export { BifrostCacheManager } from './bifrost/bifrost-cache-manager.js';
export { bifrostTrace } from './bifrost/bifrost-trace.js';
export type { BifrostTraceRecord, BifrostMetrics } from './bifrost/bifrost-trace.js';

// TurboVec cluster-aware prefilter + 4-signal reranking
export { turbovecPrefilter } from './turbovec/turbovec-prefilter.js';
export { turbovecRerank } from './turbovec/turbovec-rerank.js';
export { turbovecSearch } from './turbovec/turbovec-search.js';
export { TurboVecCudaClient } from './turbovec/turbovec-cuda-client.js';
export type { TurboVecPrefilterRequest, TurboVecPrefilterResponse } from './turbovec/turbovec-prefilter.js';
export type { TurboVecRerankerRequest, TurboVecRerankerResponse } from './turbovec/turbovec-rerank.js';

// CrossEncoder reranking (Phase C: post-XGBoost stage)
export { checkCrossEncoderHealth, rerankCandidates, applyReranking, blendCrossEncoderScore } from './crossencoder/crossencoder-client.js';
export type { CrossEncoderCandidate, CrossEncoderRankedResult, CrossEncoderRerankResponse, CrossEncoderHealthStatus } from './crossencoder/crossencoder-client.js';

// CrossEncoder orchestrator (5-signal blend with graceful fallback)
export { crossencoderRerankOrchestrate, turboVecRerankWithCEFallback } from './crossencoder/crossencoder-rerank-orchestrator.js';
export type { CrossEncoderRerankOptions, CrossEncoderRerankResult } from './crossencoder/crossencoder-rerank-orchestrator.js';

// GPU acceleration bridge (LibTorch N-API + Rust SIMD)
export { batchCosineSimilarity, clusterEmbeddings, attentionScoreGPU, getCudaMemoryInfo, isCudaAvailable } from './gpu/libtorch-bridge.js';
export { fastJsonParse, isSimdJsonAvailable } from './gpu/simdjson-bridge.js';
export { gpuPipeline } from './gpu/gpu-pipeline.js';
export type { GPUMemoryInfo, CudaAllocator } from './gpu/cuda-bridge.js';

// Full retrieval orchestration
export { retrievePacketsGPU } from './gpu/gpu-pipeline.js';
export type { RetrievalPipelineOptions, RetrievalResult } from './gpu/gpu-pipeline.js';

// Export native addon path for manual loading
export const NATIVE_ADDON_PATH = new URL('../native/tensorrt_bridge.node', import.meta.url).pathname;
