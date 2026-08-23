// Parent Atlas Retrieval Package — GPU Acceleration Pipeline
// Exports: Bifrost semantic cache, TurboVec prefilter/reranking, GPU operations

// Bifrost tracing/provider surface. Cache ownership remains in SvelteKit.
export { bifrost } from './bifrost/bifrost-provider.js';
export { recordBifrostTrace } from './bifrost/bifrost-trace.js';
export type { BifrostTraceInput, BifrostTraceRecord } from './bifrost/bifrost-trace.js';

// TurboVec cluster-aware prefilter + 4-signal reranking
export { turbovecPrefilter } from './turbovec/turbovec-prefilter.js';
export { turbovecRerank } from './turbovec/turbovec-rerank.js';
export { turbovecSearch, turbovecHealth } from './turbovec/turbovec-prefilter.js';
export { searchCodebaseAnn, searchTurboVecCode, searchQdrantCode } from './turbovec/turbovec-search.js';
export { turbovecGrpcHealth, turbovecGrpcSearch, turbovecGrpcTransform, turbovecGrpcUpsert } from './turbovec/turbovec-cuda-client.js';
export type { TurboVecPrefilterResult, TurboVecSearchResult } from './turbovec/turbovec-prefilter.js';
export type { QdrantHit, GraphRAGHints, RerankOptions, RerankResult } from './turbovec/turbovec-rerank.js';

// CrossEncoder reranking (Phase C: post-XGBoost stage)
export { checkCrossEncoderHealth, rerankCandidates, applyReranking, blendCrossEncoderScore } from './crossencoder/crossencoder-client.js';
export type { CrossEncoderCandidate, CrossEncoderRankedResult, CrossEncoderRerankResponse, CrossEncoderHealthStatus } from './crossencoder/crossencoder-client.js';

// CrossEncoder orchestrator (5-signal blend with graceful fallback)
export { crossencoderRerankOrchestrate, turboVecRerankWithCEFallback } from './crossencoder/crossencoder-rerank-orchestrator.js';
export type { CrossEncoderRerankOptions, CrossEncoderRerankResult } from './crossencoder/crossencoder-rerank-orchestrator.js';

// GPU acceleration bridge (LibTorch N-API + Rust SIMD)
export { batchCosineSimilarity, clusterEmbeddings, attentionScoreChunks, getCudaMemoryInfo, isCudaAvailable } from './gpu/libtorch-bridge.js';
export { fastJsonParse, isSimdJsonAvailable, utf8ByteLength } from './gpu/simdjson-bridge.js';
export { submitCudaCompute, getCudaDeviceInfo } from './gpu/cuda-bridge.js';
export type { CudaComputeRequest, CudaComputeResult } from './gpu/cuda-bridge.js';

// Export native addon path for manual loading
export const NATIVE_ADDON_PATH = new URL('../native/tensorrt_bridge.node', import.meta.url).pathname;
