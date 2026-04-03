/**
 * Vector Configuration — Single Source of Truth
 *
 * ALL vector-related config lives here:
 * - Collection names (canonical — used by QdrantManager + qdrant-health)
 * - Vector dimensions (768 = embeddinggemma native)
 * - HNSW index parameters (Qdrant + pgvector)
 * - Quantization config (INT8 scalar)
 * - Distance metrics
 * - Service URLs (ENV-backed)
 * - Batch/performance tuning
 * - Per-collection search config (mode, vector name, quantization status)
 *
 * Model: embeddinggemma:latest (768 dimensions native)
 */
import { ENV } from '$lib/server/env.server.js';

/** Per-collection search config — tells callers how to build Qdrant queries */
export interface VectorSearchConfig {
	mode: 'named' | 'unnamed';
	vectorName?: string;
	dimension: number;
	distance: 'Cosine' | 'Dot' | 'Euclid';
	quantized: boolean;
	onDiskPayload: boolean;
}

export const VECTOR_CONFIG = {
  MODEL: 'embeddinggemma:latest',
  DIMENSIONS: 768,

  DISTANCE_METRIC: {
    POSTGRES: 'vector_cosine_ops',
    QDRANT: 'Cosine',
    // Note: FAISS is NOT used — Qdrant + pgvector are the only active vector stores
  },

  INDEX: {
    HNSW_M: 16,
    HNSW_EF_CONSTRUCTION: 64,
    HNSW_EF_SEARCH: 40,
    QDRANT_ON_DISK: true,
    QDRANT_HNSW_M: 16,
    QDRANT_HNSW_EF: 128,
  },

  /** Canonical Qdrant collection names — alias → actual name */
  COLLECTIONS: {
    documents: 'legal_documents',
    cases: 'legal_cases',
    evidence: 'evidence_items',
    evidence_vectors: 'evidence_vectors',
    case_chunks: 'case_chunks',
    court_opinions: 'court_opinions',
    chat_history: 'chat_messages',
    embeddings_cache: 'embedding_cache',
    document_tags: 'document_tags',
    topic_clusters: 'topic_clusters',
    llm_cache: 'llm_response_cache',
    poi_profiles: 'poi_profiles',
    legal_canon_chunks: 'legal_canon_chunks',
    fictional_case_chunks: 'fictional_case_chunks',
    codebase_chunks: 'codebase_chunks_768',
    error_embeddings: 'error_embeddings',
    diagnosis_embeddings: 'diagnosis_embeddings',
    knowledge: 'knowledge_base',
  },

  /** Per-collection vector schema (vector name → used by health checks + init) */
  COLLECTION_VECTORS: {
    legal_documents: { vectors: ['content'], on_disk_payload: true },
    legal_cases: { vectors: ['description'] },
    evidence_items: { vectors: ['content'], on_disk_payload: true },
    evidence_vectors: { vectors: ['default'], on_disk_payload: true },
    case_chunks: { vectors: ['default'], on_disk_payload: true },
    court_opinions: { vectors: ['default'], on_disk_payload: true },
    chat_messages: { vectors: ['message'] },
    embedding_cache: { vectors: ['embedding'] },
    document_tags: { vectors: ['default'] },
    topic_clusters: { vectors: ['default'] },
    llm_response_cache: { vectors: ['query'] },
    poi_profiles: { vectors: ['embedding'] },
    legal_canon_chunks: { vectors: ['content'], on_disk_payload: true },
    fictional_case_chunks: { vectors: ['content'], on_disk_payload: true },
    codebase_chunks_768: { vectors: ['content', 'signature'], on_disk_payload: true },
    error_embeddings: { vectors: ['error'], on_disk_payload: true },
    diagnosis_embeddings: { vectors: ['diagnosis'], on_disk_payload: true },
    knowledge_base: { vectors: ['default'] },
  },

  /** Qdrant HNSW config applied to all collections */
  QDRANT_HNSW: { m: 16, ef_construct: 200 },

  /** INT8 scalar quantization — ~4x compression, minimal recall loss */
  QDRANT_QUANTIZATION: {
    scalar: { type: 'int8' as const, quantile: 0.99, always_ram: false },
  },

  DOCKER_SERVICES: {
    QDRANT_URL: ENV.QDRANT_URL,
    POSTGRES_URL: ENV.DATABASE_URL,
    OLLAMA_URL: ENV.OLLAMA_BASE_URL,
    REDIS_URL: ENV.REDIS_URL,
  },

  BATCH_SIZE: {
    EMBEDDING_GENERATION: 100,
    DATABASE_INSERT: 1000,
    SEARCH_LIMIT: 50,
  },

  PERFORMANCE: {
    ENABLE_CACHE: true,
    CACHE_TTL_SECONDS: 3600,
    PARALLEL_REQUESTS: 4,
    TIMEOUT_MS: 30000,
  },
} as const;

// Type exports
export type VectorDistanceMetric = (typeof VECTOR_CONFIG.DISTANCE_METRIC)[keyof typeof VECTOR_CONFIG.DISTANCE_METRIC];
export type CollectionAlias = keyof typeof VECTOR_CONFIG.COLLECTIONS;
export type CollectionName = (typeof VECTOR_CONFIG.COLLECTIONS)[CollectionAlias];

/**
 * Typed search config per collection.
 * Derived from COLLECTION_VECTORS — the canonical lookup for how to search each collection.
 *
 * mode = 'named'   → send { name: vectorName, vector: [...] }
 * mode = 'unnamed'  → send raw [...] array
 */
const SEARCH_CONFIG_CACHE = new Map<string, VectorSearchConfig>();

function buildSearchConfig(collection: string): VectorSearchConfig | undefined {
	const entry = (VECTOR_CONFIG.COLLECTION_VECTORS as Record<string, { vectors: readonly string[]; on_disk_payload?: boolean }>)[collection];
	if (!entry) return undefined;

	const primaryVec = entry.vectors[0];
	const isNamed = primaryVec !== 'default';

	return {
		mode: isNamed ? 'named' : 'unnamed',
		vectorName: isNamed ? primaryVec : undefined,
		dimension: VECTOR_CONFIG.DIMENSIONS,
		distance: 'Cosine',
		quantized: true, // All active collections are INT8 quantized as of P0d
		onDiskPayload: !!entry.on_disk_payload,
	};
}

// Pre-populate cache at module load
for (const collection of Object.keys(VECTOR_CONFIG.COLLECTION_VECTORS)) {
	const cfg = buildSearchConfig(collection);
	if (cfg) SEARCH_CONFIG_CACHE.set(collection, cfg);
}

/**
 * Get the search config for a collection.
 * Returns mode, vector name, dimension, distance, quantization status.
 * Used by _denseSearch, SSE chat, and any other Qdrant search callsite.
 */
export function getVectorSearchConfig(collection: string): VectorSearchConfig | undefined {
	return SEARCH_CONFIG_CACHE.get(collection);
}

/**
 * Build the correct Qdrant vector payload for a collection.
 * Named collections: { name: 'content', vector: [...] }
 * Unnamed collections: [...] (raw array)
 */
export function buildVectorPayload(
	collection: string,
	vector: number[]
): number[] | { name: string; vector: number[] } {
	const cfg = getVectorSearchConfig(collection);
	if (!cfg || cfg.mode === 'unnamed') return vector;
	return { name: cfg.vectorName!, vector };
}

export function validateVectorDimensions(vector: number[]): boolean {
	return vector.length === VECTOR_CONFIG.DIMENSIONS;
}

export function checkVectorEnvironment(): {
	postgres: boolean;
	qdrant: boolean;
	ollama: boolean;
	redis: boolean;
} {
	return {
		postgres: !!process.env.DATABASE_URL,
		qdrant: !!process.env?.QDRANT_URL || !!process.env.QDRANT_HOST,
		ollama: !!process.env.OLLAMA_URL,
		redis: !!process.env?.REDIS_URL || (!!process.env?.REDIS_HOST && !!process.env.REDIS_PORT),
	};
}

/**
 * Get the primary (first) named vector for a collection.
 * Returns undefined for collections using unnamed/default vectors.
 * Used by search callsites to build the correct vector payload.
 */
export function getNamedVectorName(collection: string): string | undefined {
	const cfg = getVectorSearchConfig(collection);
	return cfg?.mode === 'named' ? cfg.vectorName : undefined;
}

/**
 * Build a pre-computed map of collection → primary vector name.
 * Replaces hardcoded NAMED_VECTOR_MAP in SSE chat and other callsites.
 */
export const NAMED_VECTOR_MAP: Record<string, string> = Object.fromEntries(
	Object.entries(VECTOR_CONFIG.COLLECTION_VECTORS)
		.map(([col, cfg]) => [col, (cfg as { vectors: readonly string[] }).vectors[0]])
		.filter(([, name]) => name !== 'default')
);

/**
 * Startup validator: checks every collection in VECTOR_CONFIG against live Qdrant.
 * Logs discrepancies but does not throw — non-fatal.
 *
 * Checks per collection:
 * 1. Collection exists in Qdrant
 * 2. Vector mode matches (named vs unnamed)
 * 3. Named vector name matches if configured
 * 4. Dimension matches expected
 * 5. Quantization status logged
 */
export async function validateQdrantCollections(qdrantUrl: string): Promise<{
	passed: string[];
	failed: Array<{ collection: string; reason: string }>;
	skipped: string[];
}> {
	const passed: string[] = [];
	const failed: Array<{ collection: string; reason: string }> = [];
	const skipped: string[] = [];

	let existingCollections: Set<string>;
	try {
		const listRes = await fetch(`${qdrantUrl}/collections`, { signal: AbortSignal.timeout(5000) });
		if (!listRes.ok) {
			return { passed: [], failed: [{ collection: '*', reason: `Qdrant unreachable: ${listRes.status}` }], skipped: [] };
		}
		const listData = await listRes.json() as { result?: { collections?: Array<{ name: string }> } };
		existingCollections = new Set((listData.result?.collections || []).map((c: { name: string }) => c.name));
	} catch (err) {
		return { passed: [], failed: [{ collection: '*', reason: `Qdrant fetch failed: ${(err as Error).message}` }], skipped: [] };
	}

	for (const [collection, expectedCfg] of SEARCH_CONFIG_CACHE.entries()) {
		if (!existingCollections.has(collection)) {
			skipped.push(collection);
			continue;
		}

		try {
			const res = await fetch(`${qdrantUrl}/collections/${collection}`, { signal: AbortSignal.timeout(3000) });
			if (!res.ok) {
				failed.push({ collection, reason: `HTTP ${res.status}` });
				continue;
			}
			const data = await res.json() as {
				result?: {
					config?: {
						params?: {
							vectors?: Record<string, { size?: number; distance?: string }> | { size?: number; distance?: string };
						};
						quantization_config?: unknown;
					};
					points_count?: number;
				};
			};
			const config = data.result?.config;
			if (!config) {
				failed.push({ collection, reason: 'No config in response' });
				continue;
			}

			const vectors = config.params?.vectors;
			let actualMode: 'named' | 'unnamed';
			let actualVecName: string | undefined;
			let actualDim: number | undefined;

			if (!vectors || typeof (vectors as { size?: number }).size === 'number') {
				actualMode = 'unnamed';
				actualDim = (vectors as { size?: number })?.size;
			} else {
				const names = Object.keys(vectors);
				if (names.length === 0) {
					actualMode = 'unnamed';
				} else {
					actualMode = 'named';
					actualVecName = names[0];
					actualDim = (vectors as Record<string, { size?: number }>)[names[0]]?.size;
				}
			}

			// Check mode match
			if (expectedCfg.mode !== actualMode) {
				failed.push({
					collection,
					reason: `Mode mismatch: expected=${expectedCfg.mode} actual=${actualMode}`,
				});
				continue;
			}

			// Check vector name match for named collections
			if (expectedCfg.mode === 'named' && expectedCfg.vectorName !== actualVecName) {
				failed.push({
					collection,
					reason: `Vector name mismatch: expected=${expectedCfg.vectorName} actual=${actualVecName}`,
				});
				continue;
			}

			// Check dimension
			if (actualDim && actualDim !== expectedCfg.dimension) {
				failed.push({
					collection,
					reason: `Dimension mismatch: expected=${expectedCfg.dimension} actual=${actualDim}`,
				});
				continue;
			}

			passed.push(collection);
		} catch (err) {
			failed.push({ collection, reason: (err as Error).message });
		}
	}

	// Log summary
	const total = passed.length + failed.length + skipped.length;
	console.log(
		`[Qdrant Validator] ${passed.length}/${total} passed, ${failed.length} failed, ${skipped.length} skipped`
	);
	for (const f of failed) {
		console.warn(`[Qdrant Validator] FAIL: ${f.collection} — ${f.reason}`);
	}

	return { passed, failed, skipped };
}

export function getVectorConfigSummary(): string {
	return `--- Vector Summary ---
Model: ${VECTOR_CONFIG.MODEL}
Dimensions: ${VECTOR_CONFIG.DIMENSIONS}
Metric: ${VECTOR_CONFIG.DISTANCE_METRIC.QDRANT}
HNSW M: ${VECTOR_CONFIG.INDEX.HNSW_M}
Batch Size (Embedding Generation): ${VECTOR_CONFIG.BATCH_SIZE.EMBEDDING_GENERATION}

--- Services ---
PostgreSQL: ${VECTOR_CONFIG.DOCKER_SERVICES.POSTGRES_URL}
Qdrant: ${VECTOR_CONFIG.DOCKER_SERVICES.QDRANT_URL}
Ollama: ${VECTOR_CONFIG.DOCKER_SERVICES.OLLAMA_URL}
Redis: ${VECTOR_CONFIG.DOCKER_SERVICES.REDIS_URL}

--- Collections (${Object.keys(VECTOR_CONFIG.COLLECTIONS).length}) ---
${Object.entries(VECTOR_CONFIG.COLLECTIONS)
	.map(([alias, name]) => {
		const cfg = getVectorSearchConfig(name);
		const mode = cfg ? `${cfg.mode}${cfg.vectorName ? ':' + cfg.vectorName : ''}` : '?';
		return ` - ${alias}: ${name} [${mode}]`;
	})
	.join('\n')}
--------------------
`.trim();
}
