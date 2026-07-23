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
export {
  LOD_LEVEL_VALUES,
  PACKET_KIND_VALUES,
  describeTemporalPacketContract,
  lodLevelSchema,
  normalizeTemporalPacket,
  packetKindSchema,
  temporalPacketSchema,
} from './core/temporal-packet.js';
export {
  PROCESSING_PASS_STATUS_VALUES,
  describeProcessingPassContract,
  normalizeProcessingPass,
  processingPassSchema,
  processingPassStatusSchema,
} from './core/processing-pass.js';
export {
  buildFeatureEnvelopeObject,
  buildSemanticPayloadEnvelope,
  describeQdrantSemanticPayloadContract,
  qdrantPayloadContractVersion,
  semanticPayloadEnvelopeSchema,
} from './core/qdrant-semantic-payload-envelope.js';
export {
  buildGraphSnapshotManifest,
  describeGraphSnapshotContract,
  graphSnapshotEdgeSchema,
  graphSnapshotManifestSchema,
  graphSnapshotStatusSchema,
} from './core/graph-snapshot-manifest.js';
export {
  compileContextualTreeSnapshot,
  contextualTreeEdgeSchema,
  contextualTreeNodeSchema,
  contextualTreePacketSchema,
  ContextualTreeSnapshotError,
} from './core/contextual-tree-snapshot.js';
export {
  GraphAuthorityRunV2Schema,
  GraphResolutionIssueStatusSchema,
  GraphResolutionIssueV2Schema,
  GraphSnapshotV2Schema,
  assertAuthorityRunCanPersist,
  createGraphSnapshotV2Repository,
  withGraphSnapshotV2Transaction,
} from './core/graph-snapshot-v2.js';
export {
  ATLAS_EVENT_KIND_VALUES,
  ATLAS_EVENT_SOURCE_VALUES,
  ATLAS_EVENT_STATE_VALUES,
  atlasEventFlowSchema,
  atlasEventKindSchema,
  atlasEventSchema,
  atlasEventSourceSchema,
  atlasEventStateSchema,
  buildAtlasEventFlow,
  hashAtlasEventFlow,
  normalizeAtlasEvent,
  summarizeAtlasEventFlow,
} from './core/atlas-event-flow.js';
export {
  buildMultiHopRetrievalConfig,
  buildMultiHopRetrievalQuery,
  buildMultiHopRetrievalResult,
  buildTemporalRetrievalPolicy,
  multiHopRetrievalConfigSchema,
  multiHopRetrievalQuerySchema,
  multiHopRetrievalResultSchema,
  retrievalLaneSchema,
  temporalRetrievalModeSchema,
  temporalRetrievalPolicySchema,
} from './core/multi-hop-retrieval.js';
export {
  QDRANT_COLLECTION_REGISTRY,
  QDRANT_SPARSE_VECTOR_NAME,
  QDRANT_VECTOR_NAMES,
  resolveAtlasQdrantDefaultCollection,
  resolveAtlasQdrantDenseVectorName,
  resolveAtlasQdrantLatentRouteVectorName,
  resolveAtlasQdrantLegacySourceCollection,
  resolveAtlasQdrantSparseVectorName,
  resolveAtlasQdrantSummaryRouteVectorName,
} from './core/qdrant-collection-registry.js';

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
