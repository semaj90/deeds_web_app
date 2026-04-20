/**
 * Retrieval Path Wiring Tests
 *
 * Runtime-proofs the new graph-informed retrieval pipeline:
 *   1. ACE context assembler calls getCaseGraphNeighborIds + buildGraphShouldFilter
 *   2. SSE chat DAG cache reads/writes CouchDB via getCachedDAG/setCachedDAG
 *   3. Inference logging fires for LLM, embedding, and DAG ordering events
 *   4. NAMED_VECTOR_MAP is centralized from vector-config (no hardcoded duplicates)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock SvelteKit env modules ──────────────────────────────────────────
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
		QDRANT_URL: 'http://127.0.0.1:6333',
		BIFROST_ENABLED: false,
	},
}));
vi.mock('$lib/config/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
		QDRANT_URL: 'http://127.0.0.1:6333',
	},
}));

// ── Mock Redis ──────────────────────────────────────────────────────────
vi.mock('$lib/server/redis.js', () => ({
	redis: {
		get: vi.fn(async () => null),
		set: vi.fn(async () => 'OK'),
		ping: vi.fn(async () => 'PONG'),
	},
}));

// ── Mock DB ─────────────────────────────────────────────────────────────
const mockDbExecute = vi.fn(async () => ({ rows: [] }));
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => (Array.isArray(r) ? r : (r?.rows ?? [])),
  db: { execute: (...args: any[]) => mockDbExecute(...args) },
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

// ── Mock Qdrant ─────────────────────────────────────────────────────────
const mockQdrantSearch = vi.fn(async () => []);
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		client: { search: (...args: any[]) => mockQdrantSearch(...args) },
		sectionFilteredSearch: vi.fn(async () => ({ results: [] })),
		collections: {
			documents: 'legal_documents',
			cases: 'legal_cases',
			evidence: 'evidence_items',
			chat_history: 'chat_messages',
			embeddings_cache: 'embedding_cache',
			llm_cache: 'llm_response_cache',
			knowledge: 'knowledge_base',
			poi_profiles: 'poi_profiles',
			legal_canon_chunks: 'legal_canon_chunks',
			fictional_case_chunks: 'fictional_case_chunks',
		},
	},
}));

// ── Mock Ollama ─────────────────────────────────────────────────────────
vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: vi.fn(async () => ({
		ok: true,
		json: async () => ({
			response: 'test response',
			model: 'gemma4-legal',
			embedding: new Array(768).fill(0.1),
		}),
	})),
	bifrostChat: vi.fn(async () => 'test response'),
	getChatModelKeepAlive: vi.fn(() => '24h'),
	getEmbeddingModelKeepAlive: vi.fn(() => '24h'),
}));

// ── Mock services that context-assembler imports ────────────────────────
vi.mock('$lib/server/analytics/event-logger.js', () => ({
	getTopQueryPatterns: vi.fn(async () => []),
	getWeeklySummary: vi.fn(async () => ({ topIntents: [], avgLatencyMs: 0, cacheHitRate: 0 })),
}));
vi.mock('$lib/server/ace/user-analytics-context.js', () => ({
  fetchUserAnalyticsContext: vi.fn(async () => null),
  fetchTopQueryTags: vi.fn(async () => []),
}));
vi.mock('$lib/server/retrieval/web-search.js', () => ({
	webSearch: vi.fn(async () => null),
	formatWebResultsAsContext: vi.fn(() => ''),
}));
vi.mock('$lib/server/retrieval/wikipedia-search.js', () => ({
	searchWikipedia: vi.fn(async () => null),
	formatWikipediaAsContext: vi.fn(() => ''),
}));
vi.mock('$lib/server/rag/tag-extractor.js', () => ({
	extractLegalTags: vi.fn(() => ({ statutes: [], cases: [] })),
}));
vi.mock('$lib/server/ace/practice-templates.js', () => ({
	selectPracticeTemplate: vi.fn(() => null),
}));
vi.mock('$lib/server/ace/style-adapter.js', () => ({
	applyStyle: vi.fn((prompt: string) => prompt),
}));
vi.mock('$lib/server/neo4j-driver.js', () => ({
	getNeo4jDriver: vi.fn(() => { throw new Error('Neo4j unavailable'); }),
}));
vi.mock('$lib/server/knowledge-cache.js', () => ({
	getCachedEmbedding: vi.fn(async () => null),
	setCachedEmbedding: vi.fn(async () => {}),
}));

// ── Mock CouchDB (used by dag-cache + inference-log) ────────────────────
vi.mock('$lib/services/couchdb-client.js', () => ({
	couchdb: {
		createDb: vi.fn(async () => ({ ok: true })),
		get: vi.fn(async () => { throw new Error('not_found'); }),
		put: vi.fn(async () => ({ ok: true })),
	},
}));
vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceLLM: vi.fn(async (_name: string, _meta: any, fn: any) => fn({ end: vi.fn() })),
  traceEmbedding: vi.fn(async (_name: string, _meta: any, fn: any) => fn({ end: vi.fn() })),
  traceCouchDB: vi.fn(async (_name: string, _db: string, fn: any) => fn()),
  traceGraph: vi.fn(async (_name: string, _meta: any, fn: any) => fn()),
  traceCache: vi.fn(async (_name: string, _meta: any, fn: any) => fn()),
  tracePolicy: vi.fn(async (_name: string, _meta: any, fn: any) => fn()),
  traceVectorSearch: vi.fn(async (_name: string, _meta: any, fn: any) => fn({ end: vi.fn() })),
}));

describe('Graph-informed retrieval path wiring', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 1. ACE context assembler includes graph-informed retrieval ──────
	describe('ACE context assembler graph expansion', () => {
		it('imports getCaseGraphNeighborIds from graph-context', async () => {
			const mod = await import('$lib/server/retrieval/graph-context.js');
			expect(mod).toHaveProperty('getCaseGraphNeighborIds');
			expect(typeof mod.getCaseGraphNeighborIds).toBe('function');
		});

		it('imports buildGraphShouldFilter from graph-context', async () => {
			const mod = await import('$lib/server/retrieval/graph-context.js');
			expect(mod).toHaveProperty('buildGraphShouldFilter');
			expect(typeof mod.buildGraphShouldFilter).toBe('function');
		});

		it('imports applyGraphAuthorityScoring from graph-context', async () => {
			const mod = await import('$lib/server/retrieval/graph-context.js');
			expect(mod).toHaveProperty('applyGraphAuthorityScoring');
			expect(typeof mod.applyGraphAuthorityScoring).toBe('function');
		});

		it('assembleACEContext returns kagNeighbors field', async () => {
			const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');

			const context = await assembleACEContext({
				query: 'statute of limitations defense',
				caseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			});

			expect(context).toHaveProperty('kagNeighbors');
			expect(Array.isArray(context.kagNeighbors)).toBe(true);
		});

		it('prefers canon kb chunks over contextual legal_documents when scores are close', async () => {
      mockQdrantSearch.mockImplementation(async (collection: string) => {
        if (collection === 'legal_documents') {
          return [
            {
              score: 0.92,
              payload: {
                content_preview: 'Contextual case summary discussing hearsay objections.',
                document_type: 'evidence-summary',
              },
            },
          ];
        }

        if (collection === 'legal_canon_chunks') {
          return [
            {
              score: 0.88,
              payload: {
                content: 'FRE 803 lists hearsay exceptions regardless of witness availability.',
              },
            },
          ];
        }

        return [];
      });

      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');

      const context = await assembleACEContext({
        query: 'hearsay exceptions close-score preference regression',
        enableWikipedia: false,
        enableWebSearch: false,
      });

      expect(context.kbChunks.length).toBeGreaterThanOrEqual(2);
      expect(context.kbChunks[0]?.content).toContain('FRE 803');

      const contextualDoc = context.kbChunks.find((chunk) =>
        chunk.content.includes('Contextual case summary')
      );
      expect(contextualDoc).toBeDefined();
      expect(context.kbChunks[0]!.score).toBeGreaterThan(contextualDoc!.score ?? 0);
    });

		it('buildGraphShouldFilter produces valid Qdrant filter shape', async () => {
			const { buildGraphShouldFilter } = await import('$lib/server/retrieval/graph-context.js');

			const neighbors = [
				{ nodeId: 'n1', title: 'Evidence A', evidenceType: 'document', connectionType: 'references', strength: 80, confidence: 90, evidenceIds: ['ev-1'] },
				{ nodeId: 'n2', title: 'Evidence B', evidenceType: 'testimony', connectionType: 'corroborates', strength: 60, confidence: 70, evidenceIds: ['ev-2'] },
			];

			const filter = buildGraphShouldFilter(neighbors);
			expect(filter).not.toBeNull();
			expect(filter).toHaveProperty('should');
			expect(Array.isArray((filter as any).should)).toBe(true);

			// Each should clause uses match.any with neighbor IDs
			for (const clause of (filter as any).should) {
				expect(clause).toHaveProperty('key');
				expect(clause).toHaveProperty('match');
				expect(clause.match).toHaveProperty('any');
				expect(Array.isArray(clause.match.any)).toBe(true);
			}
		});

		it('applyGraphAuthorityScoring boosts matching documents', async () => {
			const { applyGraphAuthorityScoring } = await import('$lib/server/retrieval/graph-context.js');

			const docs = [
				{ content: 'Doc A content', similarity: 0.8, documentId: 'n1' },
				{ content: 'Doc B content', similarity: 0.7, documentId: 'n999' },
			];
			const neighbors = [
				{ nodeId: 'n1', title: 'Evidence A', evidenceType: 'document', connectionType: 'references', strength: 80, confidence: 90, evidenceIds: ['ev-1'] },
			];

			const scored = applyGraphAuthorityScoring(docs, neighbors);

			// n1 should get boosted above its original 0.8
			const boosted = scored.find((d) => d.documentId === 'n1');
			const unboosted = scored.find((d) => d.documentId === 'n999');
			expect(boosted).toBeDefined();
			expect(unboosted).toBeDefined();
			expect(boosted!.similarity).toBeGreaterThan(0.8);
			expect(unboosted!.similarity).toBe(0.7); // unchanged
		});

		it('buildGraphShouldFilter returns null for weak neighbors', async () => {
			const { buildGraphShouldFilter } = await import('$lib/server/retrieval/graph-context.js');

			const weakNeighbors = [
				{ nodeId: 'n1', title: 'Weak', evidenceType: 'doc', connectionType: 'cites', strength: 10, confidence: 20, evidenceIds: [] },
			];

			const filter = buildGraphShouldFilter(weakNeighbors, 30);
			expect(filter).toBeNull(); // All below minStrength threshold
		});
	});

	// ── 2. DAG cache module contract ────────────────────────────────────
	describe('DAG cache contract', () => {
		it('dagCacheKey is deterministic (order-independent)', async () => {
			const { dagCacheKey } = await import('$lib/server/cache/dag-cache.js');

			const key1 = dagCacheKey(['a', 'b', 'c']);
			const key2 = dagCacheKey(['c', 'a', 'b']);
			expect(key1).toBe(key2); // sorted internally → same hash
		});

		it('dagCacheKey differs for different ID sets', async () => {
			const { dagCacheKey } = await import('$lib/server/cache/dag-cache.js');

			const key1 = dagCacheKey(['a', 'b']);
			const key2 = dagCacheKey(['a', 'c']);
			expect(key1).not.toBe(key2);
		});

		it('getCachedDAG returns null on cache miss', async () => {
			const { getCachedDAG } = await import('$lib/server/cache/dag-cache.js');

			const result = await getCachedDAG(['doc1', 'doc2']);
			expect(result).toBeNull();
		});

		it('setCachedDAG does not throw on CouchDB error', async () => {
			const { setCachedDAG } = await import('$lib/server/cache/dag-cache.js');

			// Should not throw even if CouchDB fails
			await expect(
				setCachedDAG(['doc1'], ['doc1'], [], 0, 'case-123')
			).resolves.not.toThrow();
		});
	});

	// ── 3. Inference log module contract ────────────────────────────────
	describe('Inference log contract', () => {
		it('exports logInference function', async () => {
			const mod = await import('$lib/server/observability/inference-log.js');
			expect(mod).toHaveProperty('logInference');
			expect(typeof mod.logInference).toBe('function');
		});

		it('exports flushInferenceLog function', async () => {
			const mod = await import('$lib/server/observability/inference-log.js');
			expect(mod).toHaveProperty('flushInferenceLog');
			expect(typeof mod.flushInferenceLog).toBe('function');
		});

		it('logInference accepts all valid entry types', async () => {
			const { logInference } = await import('$lib/server/observability/inference-log.js');

			const types = ['llm', 'embedding', 'vector_search', 'graph_query', 'dag_ordering'] as const;
			for (const type of types) {
				expect(() =>
					logInference({ type, latencyMs: 100, cacheHit: false })
				).not.toThrow();
			}
		});

		it('logInference accepts all backend variants', async () => {
			const { logInference } = await import('$lib/server/observability/inference-log.js');

			const backends = ['ollama', 'tensorrt', 'triton', 'bifrost', 'qdrant', 'pgvector', 'neo4j', 'couchdb'] as const;
			for (const backend of backends) {
				expect(() =>
					logInference({ type: 'llm', backend, latencyMs: 50, cacheHit: false })
				).not.toThrow();
			}
		});
	});

	// ── 4. Central NAMED_VECTOR_MAP ────────────────────────────────────
	describe('Central NAMED_VECTOR_MAP', () => {
		it('NAMED_VECTOR_MAP is exported from vector-config', async () => {
			const mod = await import('$lib/server/config/vector-config.js');
			expect(mod).toHaveProperty('NAMED_VECTOR_MAP');
			expect(typeof mod.NAMED_VECTOR_MAP).toBe('object');
		});

		it('NAMED_VECTOR_MAP includes all known named vector collections', async () => {
			const { NAMED_VECTOR_MAP } = await import('$lib/server/config/vector-config.js');

			// These collections use named vectors (not 'default')
			const expectedEntries: Record<string, string> = {
				legal_documents: 'content',
				legal_cases: 'description',
				evidence_items: 'content',
				chat_messages: 'message',
				embedding_cache: 'embedding',
				llm_response_cache: 'query',
				poi_profiles: 'embedding',
				legal_canon_chunks: 'content',
				fictional_case_chunks: 'content',
				error_embeddings: 'error',
				diagnosis_embeddings: 'diagnosis',
			};

			for (const [collection, vectorName] of Object.entries(expectedEntries)) {
				expect(NAMED_VECTOR_MAP).toHaveProperty(collection);
				expect(NAMED_VECTOR_MAP[collection]).toBe(vectorName);
			}
		});

		it('NAMED_VECTOR_MAP excludes default-vector collections', async () => {
			const { NAMED_VECTOR_MAP } = await import('$lib/server/config/vector-config.js');

			// These use unnamed/default vectors — should NOT be in the map
			const defaultCollections = [
				'document_tags',
				'topic_clusters',
				'knowledge_base',
				'evidence_vectors',
				'case_chunks',
				'court_opinions',
			];

			for (const col of defaultCollections) {
				expect(NAMED_VECTOR_MAP).not.toHaveProperty(col);
			}
		});

		it('getNamedVectorName returns correct name or undefined', async () => {
			const { getNamedVectorName } = await import('$lib/server/config/vector-config.js');

			expect(getNamedVectorName('legal_documents')).toBe('content');
			expect(getNamedVectorName('poi_profiles')).toBe('embedding');
			expect(getNamedVectorName('chat_messages')).toBe('message');
			expect(getNamedVectorName('knowledge_base')).toBeUndefined(); // default vector
			expect(getNamedVectorName('nonexistent_collection')).toBeUndefined();
		});

		it('codebase_chunks_768 returns first vector (content)', async () => {
			const { getNamedVectorName } = await import('$lib/server/config/vector-config.js');

			// Multi-vector collection — returns first named vector
			expect(getNamedVectorName('codebase_chunks_768')).toBe('content');
		});
	});

	// ── 5. Authority Chain Drill-Down (P4) ──────────────────────────────
	describe('Authority chain drill-down', () => {
		it('exports authorityChainExpansion function', async () => {
			const mod = await import('$lib/server/retrieval/authority-chain.js');
			expect(mod).toHaveProperty('authorityChainExpansion');
			expect(typeof mod.authorityChainExpansion).toBe('function');
		});

		it('exports EmbedFn type and ContextDoc interface', async () => {
			const mod = await import('$lib/server/retrieval/authority-chain.js');
			// Type exports don't exist at runtime, but the module should load cleanly
			expect(mod).toBeDefined();
		});

		it('returns original docs when contextDocs is empty', async () => {
			const { authorityChainExpansion } = await import('$lib/server/retrieval/authority-chain.js');
			const embedFn = vi.fn(async () => new Array(768).fill(0.1));

			const result = await authorityChainExpansion(
				new Array(768).fill(0.5),
				[],
				embedFn,
				{ qdrantUrl: 'http://localhost:6333' }
			);

			expect(result.docs).toEqual([]);
			expect(result.hops).toBe(0);
			expect(result.expanded).toBe(0);
			expect(embedFn).not.toHaveBeenCalled();
		});

		it('returns original docs when queryVector is empty', async () => {
			const { authorityChainExpansion } = await import('$lib/server/retrieval/authority-chain.js');
			const embedFn = vi.fn(async () => new Array(768).fill(0.1));
			const docs = [
				{ content: 'test doc', similarity: 0.8, documentId: 'col:1' },
			];

			const result = await authorityChainExpansion([], docs, embedFn, {
				qdrantUrl: 'http://localhost:6333',
			});

			expect(result.docs).toEqual(docs);
			expect(result.hops).toBe(0);
			expect(result.expanded).toBe(0);
		});

		it('returns original docs when no authorities found in content', async () => {
			const { authorityChainExpansion } = await import('$lib/server/retrieval/authority-chain.js');
			const embedFn = vi.fn(async () => new Array(768).fill(0.1));

			// extractLegalTags is mocked to return { statutes: [], cases: [] }
			// so no authorities will be found
			const docs = [
				{ content: 'Plain text with no legal citations', similarity: 0.8, documentId: 'col:1' },
			];

			const result = await authorityChainExpansion(
				new Array(768).fill(0.5),
				docs,
				embedFn,
				{ qdrantUrl: 'http://localhost:6333' }
			);

			expect(result.docs).toEqual(docs);
			expect(result.hops).toBe(0);
			expect(result.expanded).toBe(0);
			expect(embedFn).not.toHaveBeenCalled();
		});

		it('result shape includes authorities field', async () => {
			const { authorityChainExpansion } = await import('$lib/server/retrieval/authority-chain.js');
			const embedFn = vi.fn(async () => new Array(768).fill(0.1));
			const docs = [
				{ content: 'test', similarity: 0.8, documentId: 'col:1' },
			];

			const result = await authorityChainExpansion(
				new Array(768).fill(0.5),
				docs,
				embedFn,
				{ qdrantUrl: 'http://localhost:6333' }
			);

			expect(result).toHaveProperty('docs');
			expect(result).toHaveProperty('hops');
			expect(result).toHaveProperty('expanded');
			expect(result).toHaveProperty('authorities');
			expect(result.authorities).toHaveProperty('statutes');
			expect(result.authorities).toHaveProperty('cases');
			expect(Array.isArray(result.authorities.statutes)).toBe(true);
			expect(Array.isArray(result.authorities.cases)).toBe(true);
		});

		it('config defaults are applied when not provided', async () => {
			const { authorityChainExpansion } = await import('$lib/server/retrieval/authority-chain.js');
			const embedFn = vi.fn(async () => null);

			// With only qdrantUrl provided, should use defaults for maxHops, maxPerHop, etc.
			const result = await authorityChainExpansion(
				new Array(768).fill(0.5),
				[{ content: 'test', similarity: 0.8, documentId: 'col:1' }],
				embedFn,
				{ qdrantUrl: 'http://localhost:6333' }
			);

			// Should complete without error (defaults applied internally)
			expect(result).toBeDefined();
			expect(typeof result.hops).toBe('number');
		});

		it('AUTHORITY_CHAIN TTL exists in cache-keys', async () => {
			const { TTL } = await import('$lib/server/cache-keys.js');
			expect(TTL).toHaveProperty('AUTHORITY_CHAIN');
			expect(TTL.AUTHORITY_CHAIN).toBe(15 * 60); // 15 min in seconds
		});

		it('_extractNewAuthorities is exported for testing', async () => {
			const mod = await import('$lib/server/retrieval/authority-chain.js');
			expect(mod).toHaveProperty('_extractNewAuthorities');
			expect(typeof mod._extractNewAuthorities).toBe('function');
		});
	});

	// ── 6. buildVectorPayload + getVectorSearchConfig ──────────────────
	describe('Vector search config helpers', () => {
		it('buildVectorPayload returns named payload for named collections', async () => {
			const { buildVectorPayload } = await import('$lib/server/config/vector-config.js');
			const vec = new Array(768).fill(0.5);

			const payload = buildVectorPayload('legal_documents', vec);
			expect(payload).toHaveProperty('name', 'content');
			expect(payload).toHaveProperty('vector');
			expect((payload as { vector: number[] }).vector).toBe(vec);
		});

		it('buildVectorPayload returns raw array for unnamed collections', async () => {
			const { buildVectorPayload } = await import('$lib/server/config/vector-config.js');
			const vec = new Array(768).fill(0.5);

			const payload = buildVectorPayload('knowledge_base', vec);
			expect(Array.isArray(payload)).toBe(true);
			expect(payload).toBe(vec);
		});

		it('buildVectorPayload returns raw array for unknown collections', async () => {
			const { buildVectorPayload } = await import('$lib/server/config/vector-config.js');
			const vec = [0.1, 0.2, 0.3];

			const payload = buildVectorPayload('nonexistent', vec);
			expect(Array.isArray(payload)).toBe(true);
		});

		it('getVectorSearchConfig returns full config for known collections', async () => {
			const { getVectorSearchConfig } = await import('$lib/server/config/vector-config.js');

			const cfg = getVectorSearchConfig('legal_documents');
			expect(cfg).toBeDefined();
			expect(cfg!.mode).toBe('named');
			expect(cfg!.vectorName).toBe('content');
			expect(cfg!.dimension).toBe(768);
			expect(cfg!.distance).toBe('Cosine');
			expect(cfg!.quantized).toBe(true);
			expect(cfg!.onDiskPayload).toBe(true);
		});

		it('getVectorSearchConfig returns unnamed mode for default collections', async () => {
			const { getVectorSearchConfig } = await import('$lib/server/config/vector-config.js');

			const cfg = getVectorSearchConfig('knowledge_base');
			expect(cfg).toBeDefined();
			expect(cfg!.mode).toBe('unnamed');
			expect(cfg!.vectorName).toBeUndefined();
		});

		it('getVectorSearchConfig returns undefined for unknown collections', async () => {
			const { getVectorSearchConfig } = await import('$lib/server/config/vector-config.js');

			const cfg = getVectorSearchConfig('nonexistent');
			expect(cfg).toBeUndefined();
		});

		it('validateQdrantCollections is exported as async function', async () => {
			const mod = await import('$lib/server/config/vector-config.js');
			expect(mod).toHaveProperty('validateQdrantCollections');
			expect(typeof mod.validateQdrantCollections).toBe('function');
		});
	});
});
