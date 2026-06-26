/**
 * Semantic Index Loop Types
 *
 * Complete type definitions for the end-to-end retrieval → ACE → synthesis → cache → materializer pipeline.
 *
 * Checkpoint Flow:
 * 1. Query cache miss creates trace_id
 * 2. Go Retrieval returns candidates
 * 3. Candidates join to atlas_packets by packet_key/source_ref/feature_id
 * 4. ACE reader loads canonical packet
 * 5. ACE validator rejects prompt injection
 * 6. Context assembler builds bounded Gemma4 context
 * 7. Gemma4 returns packet_keys_used + feature_ids_used + uncertainty
 * 8. ACE writer stores llm_output / synthesis packet
 * 9. ACE cache writes Valkey hot key
 * 10. Second same query hits Valkey cache
 * 11. Materializer mirrors packet metadata to Qdrant/TurboVec
 * 12. NES Chrom97 tile/topology cache updates from packet_topology_projection
 * 13. Report writes .tmp/semantic-index-loop-smoke.json
 */

/** Unique trace identifier for a single query evaluation */
export type TraceId = string & { readonly __traceId: unique symbol };

/** Unique identifier for a candidate packet */
export type PacketKey = string & { readonly __packetKey: unique symbol };

/** Feature identifier for semantic grouping */
export type FeatureId = string & { readonly __featureId: unique symbol };

/** Source reference for canonical identity */
export type SourceRef = string & { readonly __sourceRef: unique symbol };

/** Qdrant vector point ID */
export type QdrantPointId = string & { readonly __qdrantPointId: unique symbol };

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 1: Query Cache Miss
 * Creates a unique trace for this query evaluation
 */
export interface QueryCacheMissTrace {
	traceId: TraceId;
	timestamp: Date;
	userQuery: string;
	queryHash: string;
	cacheCheckMs: number;
	missed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 2: Go Retrieval Candidates
 * Results from gRPC retrieval service
 */
export interface RetrievalCandidate {
	sourceRef: SourceRef;
	similarity: number; // 0-1, cosine similarity
	retrievalSource: 'go-retrieval' | 'qdrant' | 'neo4j' | 'postgres';
	rank: number;
}

export interface GoRetrievalResponse {
	traceId: TraceId;
	query: string;
	candidates: RetrievalCandidate[];
	executionMs: number;
	hitCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 3: Candidates Join to Packets
 * Database join result
 */
export interface AtlasPacket {
	packetKey: PacketKey;
	sourceRef: SourceRef;
	filePath: string;
	featureId: FeatureId;
	featureLabel: string;
	communityId?: string;
	similarity: number;
	qdrantPointId?: QdrantPointId;
}

export interface CandidateJoinResult {
	traceId: TraceId;
	joinedPackets: AtlasPacket[];
	joinMs: number;
	packetsFound: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 4: ACE Reader Loads Packet
 * Canonical packet from Postgres
 */
export interface AcePacketContent {
	packetKey: PacketKey;
	sourceRef: SourceRef;
	content: string;
	embeddingDim: number;
	qdrantPointId?: QdrantPointId;
	summary: string;
	tokens: number;
	contentHash: string;
}

export interface AceReaderResult {
	traceId: TraceId;
	packets: AcePacketContent[];
	loadMs: number;
	redisHits: number;
	postgresHits: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 5: ACE Validator
 * Prompt injection detection
 */
export interface PromptInjectionCheck {
	packetKey: PacketKey;
	passed: boolean;
	injectionPatterns: string[];
	riskScore: number; // 0-1
}

export interface AceValidatorResult {
	traceId: TraceId;
	checks: PromptInjectionCheck[];
	validPackets: AcePacketContent[];
	rejectedPackets: AcePacketContent[];
	validationMs: number;
	passRate: number; // 0-1
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 6: Context Assembler
 * Bounded context for Gemma4
 */
export interface ContextBound {
	maxTokens: number;
	estimatedTokens: number;
	hasRoom: boolean;
	packetsIncluded: number;
	packetsExcluded: number;
}

export interface AssembledContext {
	traceId: TraceId;
	systemPrompt: string;
	packets: AcePacketContent[];
	bound: ContextBound;
	assemblyMs: number;
	formatted: string; // Final text to send to LLM
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 7: Gemma4 Synthesis
 * LLM response with usage tracking
 */
export interface Gemma4SynthesisContract {
	traceId: TraceId;
	response: string;
	packetKeysUsed: PacketKey[];
	featureIdsUsed: FeatureId[];
	uncertainty: number; // 0-1, model confidence
	tokensUsed: number;
	model: string;
	synthesisMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 8: ACE Writer
 * Persistence to Postgres
 */
export interface LlmOutputPacket {
	outputKey: string;
	traceId: TraceId;
	llmResponse: string;
	packetKeysUsed: PacketKey[];
	timestamp: Date;
	synthesisPacketId: string;
}

export interface AceWriterResult {
	traceId: TraceId;
	written: LlmOutputPacket;
	llmOutputKey: string;
	synthesisPacketCreated: boolean;
	writeMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 9: ACE Cache (Valkey)
 * Hot cache for repeated queries
 */
export interface AceHotCacheEntry {
	cacheKey: string;
	traceId: TraceId;
	response: string;
	ttlSeconds: number;
	wroteAt: Date;
}

export interface AceCacheWriteResult {
	traceId: TraceId;
	written: boolean;
	cacheKey: string;
	cacheMs: number;
	ttlSeconds: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 10: Cache Hit on Second Query
 * Verifies cache layer works
 */
export interface CacheHitResult {
	traceId: TraceId;
	hit: boolean;
	source: 'redis' | 'bifrost' | 'miss';
	cacheKey: string;
	response: string;
	hitMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 11: Materializer
 * Sync packet metadata to mirrors
 */
export interface MaterializerSyncResult {
	traceId: TraceId;
	qdrantPayloadUpdated: boolean;
	turbovecMetadataSynced: boolean;
	redisCentroidUpdated: boolean;
	syncMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 12: NES Chrom97 Topology
 * Tile/topology cache updates
 */
export interface NesTopologyUpdate {
	traceId: TraceId;
	packetTopologyProjection: string;
	cacheInvalidated: boolean;
	tilemapRefreshed: boolean;
	updateMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint 13: Report
 * Full audit trail
 */
export interface CheckpointStatus {
	passed: boolean;
	duration: number; // milliseconds
	error?: string;
}

export interface SemanticLoopCheckpoints {
	query_cache_miss_trace: CheckpointStatus;
	go_retrieval_candidates: CheckpointStatus;
	candidates_join_packets: CheckpointStatus;
	ace_reader_loads_packet: CheckpointStatus;
	ace_validator_rejects_injection: CheckpointStatus;
	context_assembler_builds: CheckpointStatus;
	gemma4_synthesis_contract: CheckpointStatus;
	ace_writer_persists: CheckpointStatus;
	ace_cache_valkey_hot: CheckpointStatus;
	cache_hit_second_query: CheckpointStatus;
	materializer_mirrors: CheckpointStatus;
	nes_chrom97_topology: CheckpointStatus;
	report_generated: CheckpointStatus;
}

export interface SemanticLoopReport {
	timestamp: Date;
	verbose: boolean;
	dryRun: boolean;
	checkpoints: SemanticLoopCheckpoints;
	errors: Array<{ checkpoint: string; error: string }>;
	summary: {
		passed: number;
		total: number;
		passRate: string; // "95.5%"
		totalDuration: number; // milliseconds
	};
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full semantic loop audit trail
 * Aggregates all checkpoints into one immutable record
 */
export interface SemanticLoopAuditTrail {
	traceId: TraceId;
	startedAt: Date;
	completedAt: Date;
	userQuery: string;
	cacheMiss: QueryCacheMissTrace;
	retrieval: GoRetrievalResponse;
	join: CandidateJoinResult;
	aceRead: AceReaderResult;
	aceValidate: AceValidatorResult;
	contextAssemble: AssembledContext;
	synthesis: Gemma4SynthesisContract;
	aceWrite: AceWriterResult;
	cacheWrite: AceCacheWriteResult;
	cacheHit: CacheHitResult;
	materialize: MaterializerSyncResult;
	topology: NesTopologyUpdate;
	report: SemanticLoopReport;

	/** Total end-to-end latency */
	totalMs: number;

	/** Pass/fail verdict */
	success: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for semantic loop execution
 */
export interface SemanticLoopConfig {
	traceId?: TraceId;
	dryRun: boolean;
	verbose: boolean;
	testQuery: string;
	maxContextTokens: number;
	cacheTtlSeconds: number;
	timeoutMs: number;
	redis: {
		host: string;
		port: number;
		password: string;
	};
	gemma4: {
		url: string;
		model: string;
		temperature: number;
		maxTokens: number;
	};
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to create branded types
 */
export const createTraceId = (id: string): TraceId => id as TraceId;
export const createPacketKey = (key: string): PacketKey => key as PacketKey;
export const createFeatureId = (id: string): FeatureId => id as FeatureId;
export const createSourceRef = (ref: string): SourceRef => ref as SourceRef;
export const createQdrantPointId = (id: string): QdrantPointId => id as QdrantPointId;