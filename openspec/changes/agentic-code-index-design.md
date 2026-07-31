# OpenSpec: Agentic Code Index Design Changes

## Status

**Phase**: 110 External Discovery & Acquisition

**Approval**: Pending

---

## Runtime and Interoperability Ownership

### Component Boundaries (Immutable)

```
SearXNG (discovery)
    ↓ [ephemeral URLs, NOT persisted]
Crawl4AI (acquisition)
    ↓ [browser-rendered pages]
Pydantic (validation)
    ↓ [CrawledDocument schema enforcement]
Postgres atlas_documents (canonical truth)
    ↓ [all identity, metadata, provenance stored here]
    ├─→ Qdrant codebase_chunks_768 (read-only mirror)
    ├─→ Neo4j topology (projection layer only)
    ├─→ Redis BitFrost (ephemeral cache)
    └─→ SeaweedFS S3 (object store for binary blobs)
```

**Hard Rule**: No component may write to downstream stores before Postgres succeeds. Postgres is the atomic checkpoint.

### Authority Chain (Ranking and Scoring)

**Phase 1: Query Embedding**
- Input: User question (text)
- Embedding: embeddinggemma:latest (768-dim)
- Output: Float32Array[768]

**Phase 2: Multi-Lane Parallel Retrieval**
- Lane 1: Qdrant dense vector search (Euclidean distance, top-20)
- Lane 2: Postgres BM25 trigram (TF-IDF normalized, top-20)
- Lane 3: Neo4j graph expansion (k-hop neighbors, depth≤2, max 30 entities)
- Lane 4: SOM topology neighbors (grid adjacency + cluster match, top-10)
- Lane 5: Domain classifier (semantic + lexical, confidence ≥0.7, top-5)
- Lane 6: Freshness scoring (7-day boost +0.05, >30-day penalty -0.02)

**Phase 3: RRF Fusion**
```
authority_score = weighted_rank_fusion([
  0.35 * qdrant_score,
  0.25 * bm25_score,
  0.15 * neo4j_score,
  0.10 * som_score,
  0.05 * domain_score,
  0.10 * freshness_boost
])
```

**Phase 4: ACL Filtering**
- Filter by `access_scope` (private/workspace/public)
- Filter by `user_id` (private) or `workspace_id` (workspace-scoped)
- Filter by `community_id` (optional domain-based grouping)

**Phase 5: Context Capping**
- Top-10 candidates (after dedup by packet_key)
- Each candidate ≤800 tokens
- Total envelope ≤4,800 tokens

**Phase 6: Synthesis**
- Input: ACE packet (candidates + metadata)
- Model: Gemma4 with source citations
- Output: Structured answer with {text, citations[]}

### Consistency Guarantees

**Postgres → Qdrant Parity**:
If a chunk exists in Qdrant with `packet_key X`, then Postgres MUST have a matching `atlas_chunks` row with:
- Same `packet_key`
- Same `source_ref`
- Same `content_hash`
- Same `document_id`

If parity fails → rebuild Qdrant from Postgres (idempotent upsert).

**Postgres → Neo4j Parity**:
If a fact exists in Neo4j with label `FACT`, then Postgres MUST have:
- `atlas_facts` row matching source
- All `atlas_fact_arguments` rows for edges

If parity fails → regenerate Neo4j from Postgres via hypergraph projection.

**Redis Cache Invalidation**:
After every Postgres WRITE (INSERT/UPDATE), invalidate Redis keys:
- `bitfrost:packet:{packet_key}`
- `bitfrost:trace:{packet_key}`
- `bitfrost:source:{source_ref}`
- `centroid:*` (all topologies)

Cache writes MUST NOT precede Postgres writes. If Postgres fails, cache stays stale (and is re-validated on next read).

### Message Formats

**Redis Values**: MessagePack binary encoding
- Compact: ~40% smaller than JSON
- Fast: No parse overhead on retrieval
- Type-safe: Zod deserialization on decode

**gRPC Services**: Protobuf binary protocol
- Embedding service (768-dim request/response)
- Graph ML service (PageRank, SOM training)
- Reranking service (XGBoost inference)
- Fact extraction service (Gemma4 LLM calls)

**Qdrant Payloads**: JSON (required by Qdrant API)
- Indexed fields: workspace_id, access_scope, domain_class, community_id, som_cluster
- Non-indexed fields: source_ref, packet_key, feature_label, summary, language

**Postgres JSONB**: Native JSONB columns for semi-structured metadata
- `atlas_documents.metadata` (http_status, media_type, domain_class)
- `atlas_chunks.metadata` (language, acquisition_provider)
- `atlas_facts.metadata` (confidence, reasoning_trace)

### Service Registry

**Active Services** (required for Phase 110):

| Service | Port | Protocol | Purpose | Status |
|---------|------|----------|---------|--------|
| Postgres | 5432 | TCP | Canonical data store | REQUIRED |
| Qdrant | 6333 | gRPC/REST | Vector index | REQUIRED |
| Ollama | 11434 | REST | Embedding service | REQUIRED |
| Neo4j | 7687 | Bolt | Topology store | REQUIRED |
| Redis/Valkey | 6379 | Redis Protocol | Cache layer | OPTIONAL (graceful degrade without it) |

**Deferred Services** (Phase 110+):

| Service | Purpose | Milestone |
|---------|---------|-----------|
| TurboVec | 4-bit quantized prefilter | Phase 111 (optimization) |
| SOM Topology | Self-organizing map clustering | Phase 112 (routing) |
| K-means Clustering | Feature-space clustering | Phase 113 (authority) |
| BitFrost ReRank | GPU-accelerated reranking | Phase 114 (performance) |

### Ownership Rules

**Discovery** (SearXNG):
- Owned by: Search/Research team
- Output: Ephemeral URL list
- Persistence: NONE (not stored)
- Degradation: If SearXNG down, skip discovery (continue with manual URLs)

**Acquisition** (Crawl4AI):
- Owned by: Ingest team
- Output: CrawledDocument (validated)
- Persistence: Postgres atlas_documents
- Degradation: If Crawl4AI down, return error (no fallback to cached)

**Validation** (Pydantic):
- Owned by: Data Quality team
- Output: CrawledDocument + confidence
- Persistence: Validated documents only (degraded docs logged, not persisted)
- Degradation: If validation fails, document is REJECTED (no partial persistence)

**Canonical Storage** (Postgres):
- Owned by: Data Platform team
- Output: Authoritative identity, metadata, lineage
- Persistence: Immutable append-only (no deletes in canonical layer)
- Degradation: If Postgres down, all ingest stops (no fallback)

**Mirroring** (Qdrant, Neo4j, Redis):
- Owned by: Performance/Indexing team
- Output: Projections optimized for specific access patterns
- Persistence: Ephemeral (can be rebuilt from Postgres)
- Degradation: If mirror down, fall back to Postgres (slower, but correct)

---

## Schema Normalization

### Naming Conventions

**Identifiers**:
- `packet_key`: UUID or stable string (primary identity)
- `source_ref`: File path or URL (traceability)
- `document_id`: UUID (Postgres FK reference)
- `chunk_id`: UUID (Postgres FK reference)
- `feature_id`: Logical grouping key (e.g., "auth.sessions")
- `feature_label`: Human-readable name (e.g., "Authentication Sessions")

**Timestamps**:
- `created_at`: ISO 8601 (insertion time)
- `updated_at`: ISO 8601 (last modification)
- `retrieved_at`: ISO 8601 (acquisition timestamp for web documents)

**Hashes**:
- `content_hash`: Lowercase hexadecimal (SHA-256, 64 chars)
- Always lowercase, never uppercase

**Enums**:
- `access_scope`: 'private' | 'workspace' | 'public'
- `status`: 'VERIFIED' | 'DEGRADED' | 'FAILED'
- `acquisition_provider`: 'crawl4ai' | 'firecrawl' | 'manual' | 'git'

### Dimension Consistency

**Embedding Dimensions**:
- Primary: 768-dim (embeddinggemma:latest, canonical)
- Secondary: 64-dim (autoencoder, routing hint only)
- Forbidden: 384-dim (deprecated), any other dimension

**All vectors in Qdrant MUST be 768-dim.**

No mixing of dimensions in the same collection. If recomputing embeddings, DELETE old points before upserting new ones.

---

## Acquisition Envelope Contract

```typescript
export interface AcquisitionEnvelope {
  // Acquisition metadata
  sourceUrl: string;              // Original URL or file path
  canonicalUrl: string;           // Resolved URL after redirects
  acquisitionProvider: 'crawl4ai' | 'firecrawl' | 'git' | 'manual';
  retrievedAt: string;            // ISO 8601 timestamp
  
  // Content
  title: string;
  text: string;                   // Normalized text (Markdown preferred)
  language: string;               // BCP 47 code (e.g., 'en', 'es')
  
  // Quality signals
  contentHash: string;            // SHA-256 (deduplication key)
  confidence: number;             // 0.0-1.0 (validation confidence)
  
  // Lineage
  sourceRevision: string;         // git commit SHA or web fetch timestamp
  metadata: {
    httpStatus?: number;
    mediaType?: string;
    domain_class?: string[];
  };
  
  // Access control
  accessScope: 'private' | 'workspace' | 'public';
  userId: number;
  workspaceId: string;
}
```

**Validation Rules**:
- `sourceUrl` and `canonicalUrl` MUST be valid URLs (regex: `/^https?:\/\//`)
- `contentHash` MUST be 64-char hexadecimal (SHA-256)
- `title` + `text` MUST be non-empty
- `acquisitionProvider` MUST be one of the enumerated values
- `accessScope` MUST be one of {private, workspace, public}

**Deduplication**: Two acquisitions with identical `contentHash` are treated as duplicates. The first wins (via unique constraint on Postgres).

---

## Crawl4AI Adapter Specification

### Request Contract

```json
{
  "urls": ["https://example.com/page"],
  "include_raw_html": false,
  "use_cache": false,
  "cache_mode": "bypass",
  "screenshot": false,
  "magic": true,
  "wait_until": "networkidle"
}
```

### Response Contract

```json
{
  "url": "https://example.com/page",
  "status_code": 200,
  "status_message": "OK",
  "content_type": "text/html",
  "markdown": "# Page Title\n\nContent here...",
  "cleaned_html": "<html>...</html>",
  "metadata": {
    "title": "Page Title",
    "description": "Page description",
    "language": "en",
    "canonical": "https://example.com/canonical"
  },
  "media": {
    "links": [
      { "url": "https://example.com/other", "text": "Link text" }
    ]
  }
}
```

### Transformation to CrawledDocument

```
Crawl4AI response → Transform:
  .url → source_url
  .metadata.canonical OR .url → canonical_url
  .metadata.title → title
  .markdown OR .cleaned_html → text
  .metadata.language → language
  SHA-256(text) → content_hash
  NOW() → retrieved_at
  .media.links[] → links[]
  {http_status, media_type, charset} → metadata
  "private" → access_scope
→ CrawledDocument
```

### Error Handling

- HTTP 4xx: Log as DEGRADED, no retry
- HTTP 5xx: Retry with exponential backoff (1s, 2s, 4s)
- Network timeout: Retry up to 2 times
- Validation failure: Log as FAILED, skip document (hard fail)

---

## SearXNG Adapter Specification

### Request Contract

```json
{
  "q": "search query",
  "format": "json",
  "pageno": 1,
  "category": "general"
}
```

### Response Contract (Ephemeral)

```json
{
  "results": [
    {
      "url": "https://example.com/page",
      "title": "Page Title",
      "content": "First 500 chars of content..."
    }
  ]
}
```

**Critical**: SearXNG results are NOT persisted to Postgres. They are used ONLY to generate a list of URLs for Crawl4AI.

### Fallback Chain

1. Try SearXNG API
2. If SearXNG fails → skip search (do NOT fall back to cached results)
3. User may provide manual URLs as fallback

---

## Canonical Ingestion Bridge

### Atomicity Guarantee

```
BEGIN TRANSACTION
  1. Check deduplication (SELECT content_hash FROM atlas_documents)
     If exists → ROLLBACK + return existing document_id
  2. INSERT atlas_documents
  3. Chunk text content
  4. INSERT atlas_chunks (loop over chunks)
  5. EMIT ingestion event (async, non-blocking)
COMMIT TRANSACTION
```

**All-or-nothing**: Either the entire document + all chunks are written, or nothing is written. Partial document states are not allowed.

### Chunking Configuration

```typescript
interface ChunkConfig {
  strategy: 'sliding_window' | 'semantic';
  chunkSize: number;      // characters (default 2000)
  overlapSize: number;    // characters (default 200)
}
```

**Sliding Window** (default, implemented):
- Split text into overlapping windows
- No semantic awareness (simple but robust)

**Semantic** (deferred):
- Uses TreeSitter AST for code
- Sentence-aware for prose
- Requires Phase 112+ infrastructure

---

## Runtime Proof Gates (16-Gate System)

### Gate Groups

**Acquisition Gates (1-5)**:
1. CRAWLED_WITH_PROVENANCE: Crawl4AI fetches URL with timestamp + metadata
2. PYDANTIC_VALIDATED: Schema passes validation
3. POSTGRES_AUTHORITY_PERSISTED: Document inserted into atlas_documents
4. CHUNK_LINEAGE_PERSISTED: Chunks inserted into atlas_chunks with lineage
5. EMBEDDING_MODEL_RECORDED: Metadata logged (embeddinggemma 768d)

**Indexing Gates (6-9)**:
6. QDRANT_UPSERT_READBACK: Vector + payload written and retrieved from Qdrant
7. TOPK_QUERY_RETRIEVAL: ANN search returns document chunks
8. DOMAIN_CLASSIFICATION: Lexical + semantic + optional Gemma4 classification
9. ENTITY_RESOLUTION: LangExtract + Wikidata resolution

**Fact Extraction Gates (10-16)**:
10. NARY_FACT_EXTRACTION: Gemma4 extracts facts → atlas_facts + atlas_fact_arguments
11. HYPERGRAPH_PROJECTION_READBACK: Neo4j Fact nodes + HAS_ARGUMENT edges exist
12. BOUNDED_GRAPH_EXPANSION: k-hop traversal completes (depth≤2, max 30 entities)
13. RRF_RANKING_TRACE: Reciprocal rank fusion produces consistent scores
14. ACE_PACKET_ASSEMBLED: Bounded context envelope ≤4,800 tokens
15. ACL_ISOLATION_TEST: Verify user_id filtering works (private/workspace/public)
16. ANSWER_WITH_SOURCE_REFS: Gemma4 synthesizes answer + source citations

### Expected Outcomes

**Phase 110 Milestone**: 5/16 PROVEN (gates 1-5), 11/16 DEFERRED (gates 6-16 require Qdrant/Neo4j/Gemma4)

**Phase 111 Milestone**: 9/16 PROVEN (gates 1-9), 7/16 DEFERRED (gates 10-16 require Gemma4)

**Phase 112 Milestone**: 12/16 PROVEN (gates 1-12), 4/16 DEFERRED (gates 13-16 require full ACE)

**Phase 113 Milestone**: 16/16 PROVEN (all gates complete end-to-end)

