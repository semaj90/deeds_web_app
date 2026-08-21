export * from './core/evidence-entity-repository.js';
export * from './core/evidence-entity-backfill.js';
export * from './core/evidence-entity-extractors.js';
export * from './core/gis-canonicalization.js';
export * from './core/structural-production-receipt.js';
export * from './core/hypergraph-retrieval.js';
export * from './core/hypergraph-query-policy.js';
export * from './core/hypergraph-ppr.js';
export * from './core/dynamic-hyperedge-sql.js';
export * from './core/relationship-query-repository.js';
export * from './core/feature-matrix.js';
export * from './core/feature-matrix-materializer.js';
export * from './core/feature-signal-alignment.js';
export * from './core/aligned-snapshot-experiment.js';
export * from './core/model-signal-receipt.js';
export * from './core/adaptive-hypergraph-chain.js';
export * from './core/retrieval-action-receipt.js';
export * from './core/relationship-vector-projection.js';
export * from './core/graph-projection-parity.js';
export * from './core/semantic-executor-manifest.js';
export * from './core/algorithm-execution-manifest.js';
export * from './core/compute-comparison.js';
export * from './core/compute-dag-policy.js';
export * from './core/tensor-snapshot.js';
export * from './core/artifact-transport.js';
export * from './core/ace-synthesis-graph.js';
export * from './core/agentic-file-mutation.js';
export * from './core/agentic-workflow-control-plane.js';
export * from './core/a2a-wire-v1.js';
export * from './core/atlas-kernel-session.js';
export * from './core/claim-verification.js';
export * from './core/remote-adapter-lifecycle.js';
export * from './core/adaptive-memory-runtime.js';
export * from './core/adaptive-semantic-memory.js';
export * from './core/external-doc-knowledge-fabric.js';
export * from './core/external-doc-cold-fabric.js';
export * from './core/external-doc-cold-runtime.js';
export * from './core/external-doc-capture-runtime.js';
export * from './core/external-doc-qdrant-hybrid.js';
export * from './core/external-doc-runtime-capabilities.js';
export * from './core/external-doc-retrieval-proof.js';
export * from './core/external-doc-retrieval-runtime.js';
export * from './core/ast-grep-observation-adapter.js';
export * from './core/langextract-grounding-adapter.js';
export * from './core/langextract-sidecar-metadata-adapter.js';
export * from './core/structural-extraction-fabric.js';
export * from './core/treesitter-chunker-evidence-adapter.js';
export * from './core/symbol-registry-repository.js';
export * from './core/evidence-ledger-repository.js';
export * from './core/contextual-prefill-fabric.js';
export * from './core/prefill-cache-runtime.js';
export * from './core/inference-prefill-runtime.js';
export * from './core/inference-runtime-selection.js';
export * from './core/structured-value-ast.js';
export * from './core/structured-value-arrow.js';
export * from './core/structured-value-parity.js';
export * from './core/temporal-indexing-fabric.js';
export * from './core/temporal-action-ledger.js';
export * from './core/temporal-action-ledger-runtime.js';
export * from './core/temporal-action-workflow-adapter.js';
export * from './core/temporal-action-postgres-repository.js';
export * from './core/observation-feature-compiler.js';
export * from './core/observation-feature-repository.js';
export * from './core/retrieval-executor-policy.js';
export * from './core/spectral-graph-clustering.js';
export * from './core/gpu-trace-evidence.js';
export * from './core/okf-mcp-surface.js';
export * from './core/hnsw-evaluation.js';
export * from './core/gpu-resource-envelope.js';
export * from './core/executor-plans.js';
export * from './core/multiview-rerank.js';
export * from './core/qlora-dataset-export.js';
export * from './core/ace-hypergraph-payload.js';
export * from './core/ace-packet-v2.js';
export * from './core/ace-runtime-adapter.js';
export * from './core/hyperrag-live-integration.js';
export * from './core/proof-gates.js';
export * from './core/hypergraph-fusion-facade.js';
export { createFeatureIntelligenceRepository } from './core/feature-intelligence-repository.js';
export type { FeatureIntelligenceRepository } from './core/feature-intelligence-repository.js';

// Pipelines
export { runIngest } from './pipelines/ingest.js';
export { runKarpathyEnrich } from './pipelines/enrich-karpathy.js';
export { runHydrateCache } from './pipelines/hydrate-cache.js';
export { runMapReduce } from './pipelines/mapreduce.js';

// Env / config
export {
  REPO_ROOT,
  PACKAGE_ROOT,
  SCRIPTS_ATLAS,
  EXPORTS_DIR,
  loadRepoEnv,
  resolveRedisConfig,
  resolveDatabaseUrl,
} from './env.js';

// Types
export type { GateReport, GateCheck, GateStatus, RunOptions } from './gates/types.js';
export type { PostgresAdapter } from './adapters/postgres.js';
export type { QdrantAdapter, QdrantPoint, QdrantSearchResult } from './adapters/qdrant.js';
export type { ValkeyAdapter } from './adapters/valkey.js';
export type { Neo4jAdapter, Neo4jQueryResult } from './adapters/neo4j.js';
export type { DuckDbAdapter, DuckDbRow } from './adapters/duckdb.js';
export type { PacketIdentity } from './core/canonical-packet-bridge.js';
export type { AtlasMemoryEnvelope, GlyphRecord } from './core/canonical-packet-bridge.js';
export type { ValidationResult, ValidationViolation, TelemetryRecord, BreadthMetrics, ProvenanceLink, RetrievalMetrics, MaterializationReport } from './core/packet-validator-materializer.js';
export type { CanonicalServiceName, ServiceProbe, ServiceProbeStatus, ServiceProbeTransport } from './core/service-contract.js';
export type { IngestOptions, IngestResult } from './pipelines/ingest.js';
export type { KarpathyEnrichOptions, KarpathyEnrichResult } from './pipelines/enrich-karpathy.js';
export type { HydrateCacheOptions, HydrateCacheResult } from './pipelines/hydrate-cache.js';
export type { MapReduceOptions, MapReduceResult } from './pipelines/mapreduce.js';
export type { ReplayRunOptions } from './gates/replay.js';
export type { FinalGateResult } from './gates/final.js';