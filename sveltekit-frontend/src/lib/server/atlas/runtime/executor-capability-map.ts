export type AtlasExecutorId =
  | 'typescript'
  | 'node_napi'
  | 'go_grpc'
  | 'go_quic'
  | 'rust_native'
  | 'python_pytorch_cpu'
  | 'python_pytorch_cuda'
  | 'cuvs_exact'
  | 'cagra'
  | 'cugraph'
  | 'cutile'
  | 'libtorch_cuda'
  | 'cublaslt'
  | 'duckdb'
  | 'simdjson'
  | 'redis_valkey'
  | 'postgres'
  | 'qdrant'
  | 'neo4j';

export interface ExecutorCapability {
  executor: AtlasExecutorId;
  runtime: 'windows-native' | 'wsl2' | 'portable';
  capabilities: string[];
  state: 'CANONICAL_OWNER' | 'PROVEN_EXECUTOR' | 'BLOCKED' | 'CHALLENGER' | 'CACHE_ONLY' | 'ANALYTICS_ONLY' | 'TRANSPORT_ONLY';
  notes: string[];
}

/**
 * Declarative ownership/capability map. It is intentionally conservative:
 * listing an executor here does not prove a package is installed at runtime.
 * Runtime availability still comes from environment/capability receipts.
 */
export const ATLAS_EXECUTOR_CAPABILITIES: readonly ExecutorCapability[] = [
  {
    executor: 'postgres', runtime: 'portable', state: 'CANONICAL_OWNER',
    capabilities: ['identity', 'workflow', 'provenance', 'receipts', 'fts_ts_rank'],
    notes: ['Postgres FTS ts_rank is not BM25.'],
  },
  {
    executor: 'qdrant', runtime: 'portable', state: 'PROVEN_EXECUTOR',
    capabilities: ['semantic_768_persistent_projection', 'sparse_projection'],
    notes: ['Qdrant is retrieval projection, not canonical identity.'],
  },
  {
    executor: 'cuvs_exact', runtime: 'wsl2', state: 'BLOCKED',
    capabilities: ['semantic_768_exact_knn'],
    notes: [
      'Package/endpoint smoke proof exists, but the live sidecar currently relies on cuVS sqeuclidean/default geometry.',
      'Promote only after audit-rapids-semantic-metric.mjs proves explicit cosine for canonical semantic_768.',
    ],
  },
  {
    executor: 'cagra', runtime: 'wsl2', state: 'BLOCKED',
    capabilities: ['semantic_768_ann'],
    notes: [
      'The live sidecar currently configures sqeuclidean, so recall comparison to canonical cosine is not meaningful yet.',
      'After cosine correction, keep one semantic vote and validate Recall@K against cuVS exact on the same snapshot.',
    ],
  },
  {
    executor: 'cugraph', runtime: 'wsl2', state: 'PROVEN_EXECUTOR',
    capabilities: ['pagerank', 'ppr', 'bfs', 'sssp', 'leiden', 'graph_projection'],
    notes: ['Consumes revision-bounded graph projections; n-ary truth stays outside cuGraph.'],
  },
  {
    executor: 'cublaslt', runtime: 'windows-native', state: 'PROVEN_EXECUTOR',
    capabilities: ['gemm', 'gemv', 'cosine_batch', 'feature_rerank'],
    notes: ['Primary Tensor Core path before bespoke kernels.'],
  },
  {
    executor: 'libtorch_cuda', runtime: 'windows-native', state: 'CHALLENGER',
    capabilities: ['tensor_reference', 'svd', 'pca', 'rerank'],
    notes: ['Readable C++/CUDA reference before lower-level specialization.'],
  },
  {
    executor: 'cutile', runtime: 'windows-native', state: 'CHALLENGER',
    capabilities: ['specialized_tile_kernel'],
    notes: ['SM8x capable; requires environment and shape-specific parity/performance receipts.'],
  },
  {
    executor: 'python_pytorch_cuda', runtime: 'wsl2', state: 'CHALLENGER',
    capabilities: ['tensor_reference', 'training', 'moe_shadow', 'rerank'],
    notes: ['Never becomes retrieval identity owner.'],
  },
  {
    executor: 'duckdb', runtime: 'portable', state: 'ANALYTICS_ONLY',
    capabilities: ['arrow_query', 'out_of_core_aggregation', 'parquet_analysis'],
    notes: ['May spill to NVMe; not canonical identity or workflow truth.'],
  },
  {
    executor: 'simdjson', runtime: 'windows-native', state: 'ANALYTICS_ONLY',
    capabilities: ['json_jsonl_parse'],
    notes: ['Parsing accelerator only; Zod/Pydantic retain semantic validation.'],
  },
  {
    executor: 'redis_valkey', runtime: 'portable', state: 'CACHE_ONLY',
    capabilities: ['bitfrost_hot_cache', 'leases', 'routing_cache'],
    notes: ['Cache hit/miss never changes relevance.'],
  },
  {
    executor: 'go_grpc', runtime: 'portable', state: 'TRANSPORT_ONLY',
    capabilities: ['typed_worker_rpc', 'streaming_rpc'],
    notes: ['Default reliable cross-language worker boundary; reuse channels/stubs for hot paths.'],
  },
  {
    executor: 'go_quic', runtime: 'portable', state: 'TRANSPORT_ONLY',
    capabilities: ['multiplexed_stream_transport'],
    notes: ['Optional; do not use unreliable datagrams for canonical receipts/state.'],
  },
  {
    executor: 'rust_native', runtime: 'portable', state: 'CHALLENGER',
    capabilities: ['native_parse', 'napi', 'cuvs_rust'],
    notes: ['Use only behind existing contracts; no duplicate retrieval owner.'],
  },
] as const;

export function capabilitiesFor(executor: AtlasExecutorId): ExecutorCapability | undefined {
  return ATLAS_EXECUTOR_CAPABILITIES.find((row) => row.executor === executor);
}
