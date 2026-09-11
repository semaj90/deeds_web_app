// Parent Atlas Retrieval Package — standalone retrieval support surfaces.
//
// Ownership boundary:
// - this package owns Bifrost support contracts, CrossEncoder client/contracts,
//   and GPU/SIMD bridges;
// - live TurboVec/Qdrant/SearchRuntime execution remains application-owned in
//   SvelteKit and is injected at integration boundaries rather than duplicated.

// Bifrost tracing/provider surface. Cache ownership remains non-canonical.
export { bifrost } from './bifrost/bifrost-provider.js';
export { recordBifrostTrace } from './bifrost/bifrost-trace.js';
export type { BifrostTraceInput, BifrostTraceRecord } from './bifrost/bifrost-trace.js';
export {
  ExecutionHeadroomV1Schema,
  ResidencyHintV1Schema,
  ResidencySchedulerPlanV1Schema,
  SemanticRepresentationV1Schema,
  chooseResidencyTierV1,
  planResidencySchedulerV1,
} from './bifrost/residency-scheduler.js';
export type {
  ExecutionHeadroomV1,
  ResidencyHintV1,
  ResidencySchedulerPlanV1,
  SemanticRepresentationV1,
  ResidencyTierV1,
  RetrievalBranchV1,
} from './bifrost/residency-scheduler.js';

// CrossEncoder reranking adapter. Base retrieval/reranking is injected by the
// application and does not become a second owner in this package.
export { checkCrossEncoderHealth, rerankCandidates, applyReranking, blendCrossEncoderScore } from './crossencoder/crossencoder-client.js';
export type {
  CrossEncoderCandidate,
  CrossEncoderRankedResult,
  CrossEncoderRerankResponse,
  CrossEncoderHealthStatus,
  QdrantHit,
} from './crossencoder/crossencoder-client.js';
export { crossencoderRerankOrchestrate, turboVecRerankWithCEFallback } from './crossencoder/crossencoder-rerank-orchestrator.js';
export type { CrossEncoderRerankOptions, CrossEncoderRerankResult } from './crossencoder/crossencoder-rerank-orchestrator.js';
export type {
  RetrievalHit,
  RetrievalHitPayload,
  RerankOptions,
  RerankResult,
  RerankTrace,
  BaseReranker,
} from './crossencoder/retrieval-contract.js';
export {
  AtlasRerankerFeatureRowV1Schema,
  AtlasOntologyTupleV1Schema,
  AtlasPairJudgmentV1Schema,
  ATLAS_RERANKER_FEATURE_NAMES,
  toAtlasRerankerFeatureVector,
  onlineFeatureRowFromJudgment,
  hasPromotableEvidence,
} from './crossencoder/atlas-reranker-contract.js';
export type {
  AtlasRerankerFeatureRowV1,
  AtlasOntologyTupleV1,
  AtlasPairJudgmentV1,
  AtlasRerankerFeatureName,
} from './crossencoder/atlas-reranker-contract.js';

// GPU acceleration bridge (LibTorch N-API + Rust SIMD).
export { batchCosineSimilarity, clusterEmbeddings, attentionScoreChunks, getCudaMemoryInfo, isCudaAvailable } from './gpu/libtorch-bridge.js';
export { fastJsonParse, isSimdJsonAvailable, utf8ByteLength } from './gpu/simdjson-bridge.js';
export { submitCudaCompute, getCudaDeviceInfo } from './gpu/cuda-bridge.js';
export type { CudaComputeRequest, CudaComputeResult } from './gpu/cuda-bridge.js';

// Export native addon path for manual loading.
export const NATIVE_ADDON_PATH = new URL('../native/tensorrt_bridge.node', import.meta.url).pathname;
