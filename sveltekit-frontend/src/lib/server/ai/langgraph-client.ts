/**
 * Capabilities provided by the optional LangGraph orchestration service:
 *
 * - Resumable, bounded synthesis DAG with explicit retrieval, KAG,
 *   ontology, ACE, synthesis, and verification stages.
 * - Python-based NLP and model adapters that are not available in the
 *   in-process TypeScript path.
 * - Bounded KAG neighbor caching through the shared Parent Atlas Valkey
 *   cache contract.
 * - Optional PyTorch inference optimization for operations that are
 *   benchmarked and proven to benefit from torch.compile().
 *
 * Experimental and disabled by default:
 * - HMM Baum-Welch corpus adaptation. HMM outputs are derived observations,
 *   not canonical domain labels or retrieval evidence.
 *
 * PostgreSQL remains the canonical authority. The service falls back to the
 * in-process TypeScript pipeline when disabled, unready, or contract-invalid.
 */

import { ENV } from '$lib/server/env.server.js';

// ── Types: Identity & Canonical Facts ────────────────────────────────────────

export interface PacketIdentityV1 {
	packet_key: string; // sha256(source_ref + content_hash + workspace_revision)
	source_ref: string; // "src/lib/server/db/client.ts" or "task:123"
	feature_id?: string | null; // "db.connection_pool" — NOT canonical authority
	workspace_id: string; // "snapshot-phase12-2026-07-29" or "production"
	directory_path?: string; // "src/lib/server" for codebase packets
}

export interface OntologyObservationV1 {
	packet_key: string;
	lane: 'semantic' | 'lexical' | 'structural' | 'domain_membership' | 'identity_resolution';
	label: string; // "authentication" | "database" | "ui_component" etc.
	namespace?: string; // "capabilities" | "artifact_kind" | "technology"
	confidence: number; // [0, 1], built from evidence
	sourceKind: 'RULE' | 'STRUCTURAL' | 'LEXICAL' | 'MODEL'; // NOT generic "generated"
	sourceId?: string; // "ast:function_def" | "regex:import_stmt" | "model:llm_v3"
	evidenceRefs: string[]; // ["extract:ast:123", "rule:ontology:v1.2.3"]
	producerVersion: string; // "phase3-step12-v1.0.0"
	taxonomyVersion: string; // immutable at inference time
	corporusRevision?: string; // git SHA or snapshot ID
	graphRevision?: string; // Neo4j topology version
	created_at: string; // ISO 8601 timestamp
	supersession_state: 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
}

export interface TopologyProjectionV1 {
	packet_key: string;
	workspace_revision: string;
	graph_revision: string;
	// Canonical graph scalars (NOT vectors)
	pagerank_score: number;
	in_degree: number;
	out_degree: number;
	community_id: number;
	// Derived KMeans/SOM assignments (PROJECTION_ONLY)
	kmeans_cluster_id?: number;
	distance_to_centroid?: number;
	som_row?: number;
	som_column?: number;
	som_quantization_error?: number;
	// REFERENCE_ONLY: do NOT use for primary retrieval
	topology_128_dim?: number[]; // Learned structural projection (optional)
	latent_64_dim?: number[]; // Routing clustering projection (optional)
	projection_version: string;
	evidence_state: 'REFERENCE_ONLY' | 'SAMPLE_VERIFIED' | 'PRODUCTION_VERIFIED' | 'FAILED';
}

export interface BinaryVectorArtifactV1 {
	artifact_id: string;
	dtype: 'float32' | 'float16' | 'int8';
	dimensions: number;
	byte_order: 'little_endian' | 'big_endian';
	normalized: boolean;
	representation_id: string; // "semantic_768" | "semantic_512" | "topology_128" | "latent_64"
	content_hash: string; // SHA256 of raw binary
	codec_version: string; // e.g., "zstd:1.5.2"
	producer_version: string;
	created_at: string;
	supersession_state: 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
}

// ── Request: Hybrid Semantic Classification ──────────────────────────────────

export interface LangGraphDomainClassificationRequest {
	// Identity (CANONICAL)
	packet_identity: PacketIdentityV1;
	workspace_revision: string;

	// Input
	query?: string;
	case_id?: string | null;

	// Configuration
	temperature?: number;
	max_tokens?: number;
	skip_cache?: boolean;
	include_topology?: boolean; // Include topology projections in response
	observation_lanes?: ('semantic' | 'lexical' | 'structural' | 'domain_membership' | 'identity_resolution')[]; // Default: all 5

	// Lineage tracking
	extractor_version: string; // "phase8-step3-v1.0.0"
	taxonomy_version: string; // Immutable at inference time
	corpus_revision?: string; // Git SHA for reproducibility
	graph_revision?: string; // Neo4j topology version
}

export interface LangGraphSynthesizeRequest {
	query: string;
	case_id?: string | null;
	temperature?: number;
	max_tokens?: number;
	skip_cache?: boolean;
	// NEW: Identity & ontology support
	packet_identity?: PacketIdentityV1;
	workspace_revision?: string;
	include_observations?: boolean; // Return OntologyObservationV1[]
}

// ── Response: Hybrid Semantic Classification ─────────────────────────────────

export interface LangGraphDomainClassificationResponse {
	// Identity (CANONICAL)
	packet_key: string;
	workspace_id: string;

	// Classifications (DERIVED — NOT canonical authority)
	observations: OntologyObservationV1[];
	primary_label?: string; // Best estimate, NOT approved until reviewed
	secondary_labels?: string[];
	classification_confidence: number; // [0, 1], built from lane agreement

	// Topology (DERIVED — PROJECTION only, NOT for primary retrieval)
	topology?: TopologyProjectionV1;

	// Retrieval signals (for reranking, NOT as truth)
	semantic_similarity?: number; // 512-dim MRL candidate (reference only)
	lexical_score?: number; // BM25 or BM42
	structural_score?: number; // Fast-AST
	kag_neighbors?: number;
	rag_hits?: number;

	// Metadata (CANONICAL)
	lineage: {
		producer_version: string;
		taxonomy_version: string;
		corpus_revision?: string;
		graph_revision?: string;
		created_at: string;
		input_hash: string; // SHA256 of input
		result_hash: string; // SHA256 of classifications
	};

	// Provenance
	evidence_state: 'DETERMINISTIC' | 'MODEL_ENRICHED' | 'MODEL_FAILED_FALLBACK' | 'UNCLASSIFIED' | 'ONTOLOGY_GAP';
	retried: boolean;
	latency_ms: number;
	trace_id: string;
}

export interface LangGraphSynthesizeResponse {
	answer: string;
	confidence: number;
	grpo_reward_score: number | null;
	cache: 'L1-redis' | 'L2-bifrost' | 'L3-langgraph';
	rag_hits: number;
	kag_neighbors: number;
	kag_source: string;
	web_results: number;
	rg_results: number;
	retried: boolean;
	entities: Record<string, string[]>;
	citations: Array<{ index: number; title: string; score: number; text: string }>;
	// NEW: Ontology observations (optional, requires include_observations=true)
	observations?: OntologyObservationV1[];
	latency_ms: number;
	trace_id: string;
	gpu: boolean;
}

export interface LangGraphStreamEvent {
	stage: string;
	status?: string;
	token?: string;
	hits?: number;
	neighbors?: number;
	kag_source?: string;
	web?: number;
	rg?: number;
	confidence?: number;
	trace_id?: string;
	cache?: string;
	source?: string;
	citations?: Array<{ index: number; title: string; score: number; text: string }>;
	grpo_reward_score?: number | null;
	// NEW: Observation events during tagging phase
	observation?: OntologyObservationV1;
	observation_lane?: string;
}

export interface LangGraphHealthResponse {
	service: string;
	version: string;
	gpu: boolean;
	gpu_name: string | null;
	vram_free_mb: number | null;
	ollama: string;
	qdrant: string;
	redis: string;
	neo4j?: string;
	bifrost: string;
	rg_available?: boolean;
	ollama_models?: string[];
	hmm_adapted?: boolean;
	graph_compiled?: boolean;
	// NEW: Schema & lineage health
	taxonomy_version?: string;
	corpus_revision?: string;
	graph_revision?: string;
	observation_lanes_operational?: ('semantic' | 'lexical' | 'structural' | 'domain_membership' | 'identity_resolution')[];
	status: 'ok' | 'healthy' | 'degraded' | 'unhealthy';
}

export interface LangGraphHMMStats {
	states: string[];
	top_emission_words: Record<string, string[]>;
	redis_persisted: boolean;
	redis_key: string;
	// NEW: Ontology alignment
	taxonomy_coverage: Record<string, number>; // domain → emission word count
	adaptation_corpus_size: number;
	last_adapted_at: string;
}

// ── Health & Availability ────────────────────────────────────────────────────

let _cachedHealthy: boolean | null = null;
let _healthCacheTs = 0;
const HEALTH_CACHE_TTL = 30_000; // 30s

/**
 * Check if the LangGraph service is enabled AND reachable.
 * Caches result for 30s to avoid hammering the health endpoint.
 */
export async function isLangGraphAvailable(): Promise<boolean> {
	if (!ENV.LANGGRAPH_ENABLED) return false;

	const now = Date.now();
	if (_cachedHealthy !== null && now - _healthCacheTs < HEALTH_CACHE_TTL) {
		return _cachedHealthy;
	}

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/health`, {
			signal: AbortSignal.timeout(3000),
		});
		if (!res.ok) {
			_cachedHealthy = false;
			_healthCacheTs = now;
			return false;
		}
		const data = (await res.json()) as LangGraphHealthResponse;
		_cachedHealthy = data.status === 'ok' || data.status === 'healthy' || data.status === 'degraded';
		_healthCacheTs = now;
		return _cachedHealthy;
	} catch {
		_cachedHealthy = false;
		_healthCacheTs = now;
		return false;
	}
}

/** Force-clear the health cache (e.g., after docker compose up). */
export function resetHealthCache(): void {
	_cachedHealthy = null;
	_healthCacheTs = 0;
}

// ── Hybrid Semantic Classification ───────────────────────────────────────────

/**
 * Call the LangGraph service for full hybrid semantic classification.
 * Returns ontology observations across 5 lanes + topology projections + lineage.
 * Returns null if service disabled or unreachable — caller skips classification.
 */
export async function langGraphDomainClassify(
	req: LangGraphDomainClassificationRequest,
	timeoutMs = 120_000
): Promise<LangGraphDomainClassificationResponse | null> {
	if (!(await isLangGraphAvailable())) return null;

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/classify`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!res.ok) {
			console.warn(`[langgraph-client] classify failed: ${res.status} ${res.statusText}`);
			return null;
		}

		return (await res.json()) as LangGraphDomainClassificationResponse;
	} catch (err) {
		console.warn(`[langgraph-client] classify error:`, err instanceof Error ? err.message : err);
		_cachedHealthy = false;
		_healthCacheTs = Date.now();
		return null;
	}
}

// ── Synthesize (JSON) ────────────────────────────────────────────────────────

/**
 * Call the LangGraph synthesis service (JSON mode).
 * Now supports identity awareness and optional ontology observations.
 * Returns null if the service is disabled or unreachable — caller falls back to in-process.
 */
export async function langGraphSynthesize(
	req: LangGraphSynthesizeRequest,
	timeoutMs = 120_000
): Promise<LangGraphSynthesizeResponse | null> {
	if (!(await isLangGraphAvailable())) return null;

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/synthesize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!res.ok) {
			console.warn(`[langgraph-client] synthesize failed: ${res.status} ${res.statusText}`);
			return null;
		}

		return (await res.json()) as LangGraphSynthesizeResponse;
	} catch (err) {
		console.warn(`[langgraph-client] synthesize error:`, err instanceof Error ? err.message : err);
		_cachedHealthy = false;
		_healthCacheTs = Date.now();
		return null;
	}
}

// ── Synthesize (SSE Stream) ──────────────────────────────────────────────────

/**
 * Call the LangGraph synthesis service in streaming mode.
 * Returns a ReadableStream of SSE events including observation stages.
 * Returns null if service is unavailable.
 */
export async function langGraphSynthesizeStream(
	req: LangGraphSynthesizeRequest,
	timeoutMs = 180_000
): Promise<ReadableStream<Uint8Array> | null> {
	if (!(await isLangGraphAvailable())) return null;

	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/synthesize/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(req),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!res.ok || !res.body) {
			console.warn(`[langgraph-client] stream failed: ${res.status}`);
			return null;
		}

		return res.body;
	} catch (err) {
		console.warn(`[langgraph-client] stream error:`, err instanceof Error ? err.message : err);
		_cachedHealthy = false;
		_healthCacheTs = Date.now();
		return null;
	}
}

/**
 * Parse a LangGraph SSE data line into a typed event object.
 * Lines come as "data: {...json...}\n\n" — strip the prefix and parse.
 */
export function parseLangGraphSSE(line: string): LangGraphStreamEvent | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('data: ')) return null;
	try {
		return JSON.parse(trimmed.slice(6)) as LangGraphStreamEvent;
	} catch {
		return null;
	}
}

// ── Health & HMM Stats ───────────────────────────────────────────────────────

/** Fetch full health status from the LangGraph service. */
export async function langGraphHealth(): Promise<LangGraphHealthResponse | null> {
	if (!ENV.LANGGRAPH_ENABLED) return null;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/health`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return (await res.json()) as LangGraphHealthResponse;
	} catch {
		return null;
	}
}

/** Fetch HMM tagger statistics with taxonomy alignment. */
export async function langGraphHMMStats(): Promise<LangGraphHMMStats | null> {
	if (!ENV.LANGGRAPH_ENABLED) return null;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/hmm/stats`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return (await res.json()) as LangGraphHMMStats;
	} catch {
		return null;
	}
}

/** Experimental HMM re-adaptation hook; disabled unless the service exposes it. */
export async function langGraphHMMAdapt(): Promise<boolean> {
	if (!ENV.LANGGRAPH_ENABLED) return false;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/hmm/adapt`, {
			method: 'POST',
			signal: AbortSignal.timeout(5000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Fetch L1 cache statistics from the LangGraph service. */
export async function langGraphCacheStats(): Promise<Record<string, unknown> | null> {
	if (!ENV.LANGGRAPH_ENABLED) return null;
	try {
		const res = await fetch(`${ENV.LANGGRAPH_URL}/cache/stats`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

// ── Observation Collection (Helper) ──────────────────────────────────────────

/**
 * Build a 5-lane observation from classification evidence.
 * CRITICAL: Never promote derived labels into canonical authority.
 * Confidence must come from evidence agreement, NOT character count.
 */
export function buildOntologyObservation(
	packetKey: string,
	lane: 'semantic' | 'lexical' | 'structural' | 'domain_membership' | 'identity_resolution',
	label: string,
	sourceKind: 'RULE' | 'STRUCTURAL' | 'LEXICAL' | 'MODEL',
	evidenceRefs: string[],
	confidence: number,
	producerVersion: string,
	taxonomyVersion: string
): OntologyObservationV1 {
	// sourceKind is constrained by type union to RULE|STRUCTURAL|LEXICAL|MODEL
	// Type system enforces no generic labels at compile time

	// HARD RULE: confidence must be [0, 1], built from evidence
	if (confidence < 0 || confidence > 1) {
		throw new Error(`[langgraph-client] Invalid confidence: ${confidence} — must be in [0, 1]`);
	}

	if (evidenceRefs.length === 0 && confidence > 0.5) {
		console.warn(
			`[langgraph-client] Observation with high confidence (${confidence}) but no evidence refs: ${label}`
		);
	}

	return {
		packet_key: packetKey,
		lane,
		label,
		confidence,
		sourceKind,
		evidenceRefs,
		producerVersion,
		taxonomyVersion,
		created_at: new Date().toISOString(),
		supersession_state: 'ACTIVE',
	};
}
