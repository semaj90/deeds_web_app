// Gates
export { runIdentityGate } from './gates/identity.js';
export { runReplayGate } from './gates/replay.js';
export { runLineageGate, runChr97Gate } from './gates/lineage.js';
export { runFinalGate, runProductionReadinessGate } from './gates/final.js';

// Core canonical packet bridge / validator
export {
  extractPacketIdentityFromRow,
  validatePacketIdentityFromRow,
  verifyPacketIdentityConsistency,
  createEnvelopeFromRow,
  PacketIdentitySchema,
  verifyPacketTriple,
  bitfrostKey,
  createMemoryEnvelope,
  AtlasMemoryEnvelopeSchema,
  GlyphRecordSchema,
} from './core/canonical-packet-bridge.js';

export {
  buildSummaryContext,
  classifyDomain,
  classifyOntology,
  classifyTopology,
  formatSummaryContext,
} from './core/summary-context.js';

export {
  makeGemma4SummaryPacket,
  makeChrom97Packet,
  toNdjsonLine,
} from './pipelines/summary-packets.js';

export { PacketValidator } from './core/packet-validator-materializer.js';
export {
  canonicalServiceNames,
  canonicalServiceProbeDefaults,
  serviceProbeStatuses,
  serviceProbeTransports,
} from './core/service-contract.js';

// Adapters
export { createPostgresAdapter, withPostgres } from './adapters/postgres.js';
export { createQdrantAdapter } from './adapters/qdrant.js';
export { createValkeyAdapter, withValkey } from './adapters/valkey.js';
export { createNeo4jAdapter } from './adapters/neo4j.js';
export { createDuckDbAdapter, isDuckDbAvailable } from './adapters/duckdb.js';

// Mirrored Atlas contracts
export * from './core/temporal-packet.js';
export * from './core/processing-pass.js';
export * from './core/qdrant-semantic-payload-envelope.js';
export * from './core/graph-snapshot-manifest.js';
export * from './core/contextual-tree-snapshot.js';
export * from './core/graph-snapshot-v2.js';
export * from './core/atlas-event-flow.js';
export * from './core/multi-hop-retrieval.js';
export * from './core/qdrant-collection-registry.js';
export * from './core/feature-intelligence.js';

// Feature intelligence / HyperGraphRAG surfaces
export * from './core/structural-symbol.js';
export * from './core/structural-extraction-fabric.js';
export * from './core/treesitter-chunker-evidence-adapter.js';
export * from './core/ast-grep-observation-adapter.js';
export * from './core/langextract-grounding-adapter.js';
export * from './core/langextract-sidecar-metadata-adapter.js';
export * from './core/symbol-registry-repository.js';
export * from './core/schema-object-registry.js';
export * from './core/postgres-schema-introspector.js';
export * from './core/test-case-registry.js';
export * from './core/vitest-test-evidence-compiler.js';
export * from './core/openspec-evidence-compiler.js';
export * from './core/openspec-repository-ingestion.js';
export * from './core/workflow-action-event.js';
export * from './core/workflow-action-adapters.js';
export * from './core/structural-reference-resolver.js';
export * from './core/evidence-ledger-repository.js';
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
export * from './core/atlas-kernel-session.js';
export * from './core/claim-verification.js';
export * from './core/remote-adapter-lifecycle.js';
export * from './core/adaptive-memory-runtime.js';
export * from './core/external-doc-knowledge-fabric.js';
export * from './core/contextual-prefill-fabric.js';
export * from './core/prefill-cache-runtime.js';
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