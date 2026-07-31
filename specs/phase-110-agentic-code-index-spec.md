# Phase 110: Agentic Code Index Specification

## Overview

Phase 110 builds a semantic code index with multi-lane retrieval, end-to-end proof validation, and agentic orchestration. This specification defines component ownership, contract boundaries, and the complete personal data pipeline from discovery through synthesis.

---

## External Discovery and Acquisition

### Discovery vs Acquisition Separation

Phase 110 enforces strict separation between discovery (observation only) and acquisition (durable evidence):

**Discovery Observations** must record:
- `query`: the search query
- `provider`: 'searxng' | 'opencode-web' | 'repository-search' | 'okf-search' | 'documentation-corpus'
- `provider_revision`: version or timestamp available
- `retrieval_timestamp`: ISO 8601 when the URL was discovered
- `url` or `source_reference`: the candidate location
- `rank`: position in discovery result set
- `title`: page title or snippet
- `snippet`: ≤500 character excerpt

**Discovery observations are ephemeral.** They must not enter canonical storage or Gemma4 context as verified evidence without acquisition and validation.

### Supported Discovery Lanes

- **SearXNG** — Broad self-hosted discovery (ephemeral, no persistence)
- **OpenCode web search** — Convenience discovery via integrated web interface
- **Repository local search** — Exact and semantic search within indexed codebase
- **OKF search** — Structured knowledge fragment retrieval
- **Documentation corpus search** — API and guide documentation discovery

### Component Ownership

The pipeline separates concerns strictly:

- **Discovery Providers** — SearXNG, OpenCode web search, repository search, OKF, documentation corpus. Output: ephemeral SearchObservationV1 (not persisted to Postgres canonical layer).
- **Crawl4AI** — Primary acquisition (browser-rendered JavaScript execution). Canonical web-fetch adapter.
- **Firecrawl** — Optional secondary (fallback if Crawl4AI unavailable). Same output contract as Crawl4AI.
- **Docling + OCR** — Document layout extraction and optical character recognition for PDFs and images.
- **Pydantic + Zod** — Validation boundary (CrawledDocument schema enforcement). Hard fail on invalid structure. Trusted ACL injection (workspace_id, user_id, access_scope) happens at the server boundary only.
- **Postgres `atlas_documents` + `atlas_chunks`** — Canonical persistence. Single source of truth for all acquired content.
- **Qdrant `codebase_chunks_768`** — Read-only vector index mirror. Rebuilt from Postgres if corrupted.
- **Neo4j topology** — Projection only. Enriches canonical with relationship edges (USED_BY, DEFINED_IN, IMPORTS).

### Clean Architecture Boundaries

Phase 110 uses the following immutable boundaries. **No downstream layer may promote itself into canonical authority without an explicit validated promotion path.**

```
DISCOVERY (ephemeral observations)
    ↓ [candidate URLs only]
ACQUISITION (browser render, fetch, normalization)
    ↓ [acquisition envelope]
VALIDATION (Pydantic/Zod schema enforcement, hard fail on invalid)
    ↓ [validated envelope]
CANONICAL (PostgreSQL 18, Drizzle ORM, atomic commit, immutable append-only)
    ├─→ MIRRORS (Qdrant dense/sparse, Neo4j topology, Valkey cache, SeaweedFS objects)
    ├─→ FUSION (weighted reciprocal rank fusion, optional learned reranking)
    ├─→ CONTEXT (revision-aware context cards, ACE packet assembly)
    └─→ SYNTHESIS (Gemma4 through llama-server only, never direct model calls from retrieval)
```

**Hard rule**: No downstream layer (Qdrant, Neo4j, Valkey, SeaweedFS) may write to canonical Postgres without atomic validation and proof of successful Postgres commit.

### Acquisition Pipeline (11 Steps)

```
1. SearXNG discovery (ephemeral list)
2. Crawl4AI fetch (browser render + JS execution)
3. Pydantic validation (CrawledDocument schema)
4. Postgres insert atlas_documents (canonical row)
5. Chunking strategy (sliding_window or semantic)
6. Postgres insert atlas_chunks (lineage tracking)
7. Embedding job enqueue (RabbitMQ message)
8. Qdrant upsert (named vector + payload mirror)
9. Neo4j projection (topology edges from link extraction)
10. Domain classification (lexical + semantic + optional Gemma4)
11. Entity extraction + Wikidata resolution (Phase 8 LangExtract)
12. N-ary fact extraction (Gemma4 → atlas_facts + atlas_fact_arguments)
13. Hypergraph projection readback (Neo4j Fact nodes + HAS_ARGUMENT edges)
14. Bounded graph expansion (k-hop traversal, depth≤2, max 30 entities, max 75 facts)
15. RRF ranking (dense + entity + graph scores)
16. ACE packet assembly (≤4,800 tokens, structured evidence)
17. Answer generation (Gemma4 with source citations)
```

### Crawl4AI Adapter Contract

**Input**: URL (string)

**Output**: CrawledDocument

```typescript
export interface CrawledDocument {
  source_url: string;                    // Original URL requested
  canonical_url: string;                 // Resolved after redirects
  title: string;                         // From <title> or og:title
  text: string;                          // Markdown-extracted content
  language: string;                      // BCP 47 language code
  retrieved_at: string;                  // ISO 8601 timestamp
  content_hash: string;                  // SHA-256 of normalized text (deduplication key)
  links: Array<{ href: string; rel?: string; anchor?: string }>;
  metadata: {
    http_status: number;
    media_type: string;
    charset?: string;
    headers?: Record<string, string>;
  };
  domain_class: string[];                // Inferred domain labels (optional)
  access_scope: 'private' | 'workspace' | 'public';
}
```

**Validation**: Zod schema with strict enforcement. Missing any of `source_url`, `canonical_url`, `title`, `text`, `retrieved_at`, `content_hash` → hard fail with ZodError.

**Deduplication**: Exact content_hash lookup in `atlas_documents`. If found, return IngestionResult with `wasDuplicate: true` (no re-chunk).

### Postgres Canonical Schema

```sql
-- atlas_documents: Document-level metadata
CREATE TABLE atlas_documents (
  id UUID PRIMARY KEY,
  workspace_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  source_url TEXT NOT NULL,                -- original requested URL
  canonical_url TEXT NOT NULL,             -- resolved URL
  title VARCHAR(512),
  text TEXT,                               -- full extracted content
  content_hash CHAR(64) NOT NULL UNIQUE,   -- SHA-256 for deduplication
  language VARCHAR(5) DEFAULT 'en',
  access_scope VARCHAR(20) DEFAULT 'private',
  acquisition_provider VARCHAR(50),        -- 'crawl4ai', 'firecrawl', etc.
  retrieved_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'VERIFIED',   -- VERIFIED, DEGRADED, FAILED
  metadata JSONB,                          -- http_status, media_type, domain_class
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- atlas_chunks: Fine-grained document sections with embedding vectors
CREATE TABLE atlas_chunks (
  id UUID PRIMARY KEY,
  workspace_id VARCHAR(255) NOT NULL,
  document_id UUID REFERENCES atlas_documents(id),
  user_id INTEGER NOT NULL,
  position INTEGER,                        -- chunk index (0-based)
  text TEXT NOT NULL,                      -- chunk content
  content_hash CHAR(64) NOT NULL,          -- SHA-256 of chunk text
  source_revision VARCHAR(100),            -- web acquisition timestamp
  embedding_model VARCHAR(50),             -- 'embeddinggemma'
  embedding_dimension INTEGER,             -- 768
  chunk_type VARCHAR(50),                  -- 'WEB_DOCUMENT_CHUNK', etc.
  source_ref TEXT,                         -- canonical_url for traceability
  status VARCHAR(20) DEFAULT 'READY_FOR_EMBEDDING',
  metadata JSONB,                          -- language, domain_class, acquisition_provider
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Hard Rules

✅ **Postgres is truth**. All canonical identity, metadata, and provenance stored here.

✅ **Qdrant is a mirror**. Write to Postgres FIRST. Qdrant is rebuilt if corrupted (idempotent upsert with `content_hash` as dedup key).

✅ **Deduplication by content_hash**. Two URLs serving identical text (same SHA-256) → INSERT nothing, return existing document_id.

✅ **Access scope enforcement**. `access_scope ∈ {private, workspace, public}` gates all downstream retrieval (ACL isolation).

✅ **Never join on feature_id alone**. Always verify `source_ref` + `content_hash` match before accepting Qdrant/Neo4j results.

❌ **Never make Qdrant the source of truth**. No writes to Qdrant before Postgres succeeds.

❌ **Never skip validation**. All documents must pass Pydantic schema before Postgres INSERT.

❌ **Never bypass SearXNG→Crawl4AI→Pydantic→Postgres flow**. This is the ONLY path to canonical persistence.

---

## Authority Chain

**PostgreSQL 18 is the single source of truth for Phase 110.**

### Postgres Owns (Canonical Authority)

- Workspace identity and lifecycle
- User identity and ACL state
- Source identity (file paths, URLs, references)
- Source revisions (git commit SHAs, web fetch timestamps)
- Content hashes (SHA-256 for deduplication and verification)
- Parser lineage (which parser produced which normalized text)
- Document identity (atlas_documents rows)
- File identity (granular source location)
- Chunk identity (atlas_chunks rows)
- Symbol identity (function names, class definitions, etc.)
- Fact identity (N-ary facts with arguments)
- Representation identity (embedding model, dimension, generation date)
- Embedding lineage (which model, which version, when generated)
- Lifecycle state (VERIFIED, DEGRADED, FAILED, superseded, archived)
- Proof state (which gates have passed, which are blocked)
- Projection outbox (work queue for downstream mirrors)
- Benchmark run records (cuVS trials, Qdrant comparisons, etc.)

### Derived Stores Own (No Canonical Authority)

- **Qdrant**: Dense and sparse vector retrieval projection only. No identity ownership. Read-only mirror.
- **Neo4j**: Topology and bounded graph expansion only. No fact or entity identity. Projection layer only.
- **Valkey**: Ephemeral cache, hot context, active ACE packets. No durable evidence state.
- **SeaweedFS**: Object bytes only (raw HTML, normalized Markdown, OCR artifacts, Arrow snapshots, Parquet exports). No metadata or authority ownership.
- **Arrow/Parquet snapshots**: Offline analytics and GPU benchmark inputs only.
- **cuVS indexes**: Benchmark and analytics lane only. Not production retrieval authority.
- **TurboVec indexes**: CPU-friendly prefilter only. Not primary retrieval authority.

**Hard rule**: If a value exists in Qdrant, Neo4j, or Valkey, always read the authoritative version from Postgres before making decisions.

---

## Storage Layering

### PostgreSQL 18 (Canonical Truth Layer)

Stores canonical records, revisions, ACLs, normalized metadata, and lineage.

- `atlas_documents`: Document-level metadata, access scope, acquisition provider, status
- `atlas_chunks`: Fine-grained content sections, lineage, embedding model/dimension
- `atlas_facts`: N-ary facts with confidence and source reference
- `atlas_fact_arguments`: Fact arguments and entity resolution
- `projection_outbox`: Append-only work queue for mirror consistency
- Workspace, user, and ACL identity tables

### SeaweedFS (Raw and Large Object Layer)

Replaces MinIO as the S3-compatible object storage gateway.

**Canonical S3 gateway port**: 8333

**Objects stored**:
- Raw HTML fetched by Crawl4AI
- Fetched JSON responses
- PDF files and images
- OCR artifacts and page segments
- Normalized Markdown conversions
- Arrow IPC snapshots (for offline analytics)
- Parquet snapshots (for benchmarking)
- cuVS manifests and serialized indexes
- Proof artifacts and benchmark reports

**Postgres responsibility**: Must store the object URI, content hash, object revision, and authority linkage. SeaweedFS stores bytes only.

### Qdrant (Dense and Sparse Retrieval Projection)

Online retrieval projection supporting:
- Payload filtering by workspace_id, access_scope, domain_class
- Named vectors (semantic_768, bm42_sparse, topology_128, latent_64)
- Sparse retrieval (keyword matching)
- Multistage retrieval (dense → sparse → reranking)
- Hybrid retrieval (combining dense and sparse scores)
- Optional GPU-assisted HNSW index construction via Vulkan (experimental, not mandatory)

**GPU indexing note**: Qdrant GPU indexing via Vulkan is optional and experimental. This is NOT the same as cuVS search acceleration.

### Neo4j (Interactive Topology and Bounded Expansion Projection)

Topology and bounded graph traversal projection only.

- Fact relationships: `Fact --[HAS_ARGUMENT]--> Entity`
- Code relationships: `File --[IMPORTS]--> File`, `Symbol --[DEFINED_IN]--> File`
- Topology relationships: `Symbol --[SIMILAR_TOPOLOGY]--> Symbol` (from SOM grid adjacency)
- All Neo4j nodes are projections from Postgres truth. Node IDs are ephemeral.

### Valkey (Ephemeral Cache and Cursor Layer)

Ephemeral cache for:
- Hot packets (ACE active context)
- Centroid cache (SOM grid and K-means clusters, refreshed daily)
- Active session cursors
- Cache invalidation tracking

**Cache TTL**: 24 hours for centroids, shorter for active context.

**Fallback behavior**: If Valkey is unavailable, fall back to computing centroids from Postgres (slow but correct).

### Arrow IPC (Canonical Array Interchange Format)

**Purpose**: Offline analytics and GPU benchmarking.

**Usage**:
- Export canonical data from Postgres for offline analysis
- Benchmark input for cuVS and TurboVec evaluations
- Zero-copy tensor exchange between TypeScript and Python/GPU services

---

## Canonical Representation Contract

**The canonical Phase 110 dense representation is:**

```
representation_id:     semantic_768
embedding_family:      embeddinggemma
embedding_dimension:   768
normalization:         L2 (Euclidean distance)
```

**This contract becomes active only after the configured embedding endpoint proves:**
1. It returns exactly 768 finite values per vector
2. The immutable model artifact (with SHA-256 digest) is identified
3. Normalization behavior is documented and tested

**Hard rules**:
- ❌ **Never persist "latest" or "current" as model identity.** Always resolve to an immutable model artifact ID and content digest before persistence.
- ❌ **Never truncate a 768-dim vector to 384-dim** unless a separately versioned compatibility contract explicitly permits it and retrieval quality is independently verified. Truncation is NOT a learned projection.
- ✅ **Every representation record must include**: representation_id, representation_revision, embedding_family, concrete_model_artifact_id, model_artifact_hash, embedding_dimension, normalization_revision, generated_at, workspace_revision

**Representation states**:
- `ACTIVE`: Currently used for new embeddings
- `COMPATIBILITY`: Supported for retrieval but not new generation
- `REFERENCE_ONLY`: Archived, used only for historical analysis
- `SUPERSEDED`: Replaced by newer version, rejected from new queries
- `FAILED`: Corrupted or validation failed, marked for removal

---

## Named Vectors (Qdrant Collection Schema)

### `codebase_chunks_768` Collection

**Purpose**: Fast multi-lane retrieval with named vector fallbacks.

**Vectors** (logical lanes):

| Name | Dim | Model | Purpose | Status |
|------|-----|-------|---------|--------|
| `semantic_768` | 768 | embeddinggemma:latest | **Canonical dense semantic retrieval** | **ACTIVE** |
| `bm42_sparse` | variable | BM42 tokenizer | Sparse lexical/keyword fallback | Optional |
| `topology_128` | 128 | trained projection | SOM/topology-aware routing | Deferred |
| `latent_64` | 64 | autoencoder | Routing or clustering hint (NOT search) | Optional |

**Payload Fields** (indexed, sourced from Postgres authority):

```json
{
  "authority_id": "postgres_atlas_chunks_789",
  "authority_revision": "2026-07-30T12:34:56Z",
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "file_path": "src/lib/server/auth.ts",
  "directory_path": "src/lib/server",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "workspace_id": "workspace-123",
  "document_id": "doc-456",
  "chunk_id": "chunk-789",
  "position": 0,
  "content_hash": "abc123def456...",
  "representation_id": "semantic_768",
  "representation_revision": "embeddinggemma:2026-07-30.1",
  "domain_class": ["auth", "security"],
  "access_scope": "private",
  "summary": "Handles Lucia session validation.",
  "som_cluster": 42,
  "som_x": 3,
  "som_y": 7,
  "kmeans_cluster_id": 15,
  "community_id": "c_auth_001",
  "freshness_score": 0.95,
  "retrieval_rank": 1,
  "projection_timestamp": "2026-07-30T13:00:00Z",
  "language": "en"
}
```

**Required for all Qdrant points**:
- `authority_id`: Source of truth Postgres row identifier
- `authority_revision`: When the Postgres row was last confirmed authoritative
- `workspace_id`: For isolation
- `content_hash`: For verification against Postgres
- `representation_id`: Which embedding lane produced this vector
- `representation_revision`: Immutable model artifact identifier
- `access_scope`: For ACL filtering
- `projection_timestamp`: When this point was last synced from Postgres

**GIN Indexes** (automatic from payload insertion):

- `payload."domain_class"` (array contains)
- `payload."access_scope"` (exact match)
- `payload."workspace_id"` (exact match)
- `payload."community_id"` (exact match)
- `payload."som_cluster"` (range queries)

---

## Retrieval Lane Order and Weighted Reciprocal Rank Fusion

### Canonical Retrieval Sequence

```
1. Exact Postgres authority lookup (by source_ref or packet_key)
   ↓
2. Postgres lexical and identifier retrieval (BM25 trigram, FTS)
   ↓
3. Qdrant dense semantic retrieval (semantic_768 vector search, top-20)
   ↓
4. Qdrant sparse retrieval (bm42_sparse keyword matching, if available)
   ↓
5. Entity and fact retrieval (atlas_facts with source_ref matching)
   ↓
6. Bounded Neo4j graph expansion (k-hop neighbors, depth≤2, max 30 entities)
   ↓
7. Topology and routing features (SOM coordinates, K-means cluster proximity)
   ↓
8. Freshness and authority scoring (time-based boost/decay)
   ↓
9. Weighted reciprocal rank fusion (combine lane scores)
   ↓
10. Optional learned reranking (XGBoost, if available)
   ↓
11. Canonical source hydration (join back to Postgres for full metadata)
   ↓
12. Context compression (revision-aware cards)
   ↓
13. ACE assembly (bounded to 4,800 tokens)
```

### Weighted Reciprocal Rank Fusion (RRF)

**Default lane weights (Phase 110)**:

| Lane | Weight | Purpose |
|------|--------|---------|
| Qdrant dense semantic | 0.35 | Primary semantic similarity |
| Postgres lexical | 0.25 | Exact matches, keywords, identifiers |
| Entity and fact retrieval | 0.15 | Structured facts and relationships |
| Bounded Neo4j graph | 0.10 | Topology-aware expansion |
| Topology and routing | 0.05 | SOM/K-means clustering hints |
| Freshness and authority | 0.10 | Time-based boost, authority signals |
| **Total** | **1.00** | Normalized |

**RRF formula** (per candidate across all lanes):

```
authority_score = Σ(lane_weight × (1 / (k + rank)))

where:
  k = 60 (constant for all lanes)
  rank = position in lane results (1-indexed)
  lane_weight = normalized contribution weight
```

**Hard rules**:
- ✅ Use reciprocal rank **per lane** (convert raw relevance scores to ranked positions first)
- ❌ **Never mix raw lane relevance scores with reciprocal ranks** without calibration
- ❌ **Never assign zero weight silently** to unknown lanes; unknown lane names must fail validation
- ✅ **Validate that configured weights sum to 1.0** within tolerance (±0.001)
- ✅ **Emit a per-candidate trace** showing packet_key, source_ref, lane ranks, lane contributions, final RRF score, authority state, representation revision, and any exclusions

**Output**: Top-10 candidates (deduplicated by packet_key, sorted by authority_score descending)

---

## Authority Chain

**Query → ACE Context Assembly → Gemma4 Synthesis**

1. **Authority Score Blend** (per candidate):
   - `0.40 * qdrant_dense_score + 0.20 * postgres_bm25_score + 0.15 * neo4j_graph_score + 0.15 * som_topology_score + 0.10 * domain_classifier_confidence`

2. **Freshness Boost**:
   - Documents retrieved within last 7 days → +0.05
   - Older documents → -0.02 (decay)

3. **ACL Filtering** (hard requirement):
   - `access_scope = 'private'` AND `user_id = locals.user.id` → visible
   - `access_scope = 'workspace'` AND `workspace_id = locals.user.workspace_id` → visible
   - `access_scope = 'public'` → visible
   - Otherwise → HIDDEN (removed from results)

4. **Result Capping**:
   - Top-10 candidates maximum (after fusion + filtering)
   - Each candidate ≤800 tokens (bounded context)
   - Total envelope ≤4,800 tokens (ACE packet size limit)

---

## Storage Decision Tree

| Question | Answer | Storage |
|----------|--------|---------|
| Is it canonical packet identity? | Yes | Postgres `atlas_documents` + `atlas_chunks` |
| Do you need vector search? | Yes | Qdrant `codebase_chunks_768` (mirror) |
| Do you access 1000× per second? | Yes | Redis BitFrost (cache, ephemeral) |
| Do you traverse relationships? | Yes | Neo4j topology (projection) |
| Is it raw document/binary? | Yes | SeaweedFS S3 gateway (object store) |
| Is it loose JSON? | Yes | CouchDB (optional, not primary) |

---

## Context Compression and ACE

### Context Compression Positioning

Context compression occurs **after retrieval and canonical hydration**:

```
Retrieval candidates (top-10 from RRF)
  ↓
Canonical source hydration (join to Postgres full records)
  ↓
Revision-aware context cards (FileCard, TraceCard, ResearchCard)
  ↓
ACE packet assembly (bounded envelope)
  ↓
Gemma4 synthesis
```

### Context Card Requirements

Context cards must be **revision-aware** and **workspace-scoped**:

```typescript
interface ContextCard {
  stableKey: string;                    // Deterministic identity
  workspace_id: string;                 // Scope isolation
  workspace_revision: string;           // Invalidation marker
  source_ref: string;                   // Traceability
  source_revision: string;              // Source update tracking
  source_content_hash: string;          // Verification
  compression_contract_revision: string;// Card schema version
  card_type: 'FileCard' | 'TraceCard' | 'ResearchCard';
  // ... type-specific fields
  generatedAt: string;                  // ISO timestamp
  ttl_seconds?: number;                 // Optional cleanup TTL
}
```

**Hard rule**: A card generated from an older source_revision must not be reused after a file or document changes. TTL is secondary; **invalidation is primary** based on source_revision change.

### ACE Packet Requirements

ACE packets must preserve full traceability and sourcing:

```typescript
interface ACEPacket {
  schema_version: string;
  workspace_id: string;
  workspace_revision: string;
  query_id: string;
  query_intent: string;
  evidence: { text, source_ref, source_revision, content_hash }[];
  facts: { id, predicate, confidence, source_revision }[];
  exclusions: string[];                 // Filtered or rejected candidates
  retrieval_trace: { lane, rank, score }[];
  ranking_trace: { candidate, rrf_score, authority_state }[];
  token_budget: number;                 // ≤4,800 tokens
  representation_revision: string;      // Embedding lineage
  source_refs: string[];                // All citations
  source_revisions: string[];           // All source timestamps
  content_hashes: string[];             // Verification data
}
```

### No Hidden Model Calls

Context compression must not perform hidden model calls (e.g., Gemma4 summarization, entity extraction) unless **explicitly declared in its contract and proof state**. Use:
- Redis cached wiki notes for summaries (pre-computed)
- Heuristic extraction (filename, path analysis)
- Cached features from Postgres (prior enrichment)

---

## GPU Integration

### Three GPU Paths in Phase 110

#### 1. Qdrant Vulkan (Optional Experimental)

**Role**: Accelerate HNSW index construction during Qdrant upsert.

**Status**: Optional and experimental. **Not a mandatory runtime dependency.**

**When to use**: Large-scale index rebuilds (50K+ vectors) where index build latency matters.

**Qdrant GPU requirements**: Verified GPU driver, Vulkan support, separate GPU volume/port, confirmed GPU index usage in startup logs.

#### 2. cuVS CUDA (Isolated Benchmark Only)

**Role**: Exact ground truth and GPU ANN benchmarking. **Never online production retrieval.**

**Approved initial uses**:
- Exact brute-force cosine similarity ground truth (Phase 0)
- CAGRA benchmarking (Phase 3)
- IVF Flat benchmarking (Phase 2)
- IVF PQ benchmarking (Phase 3+)
- Large-batch offline query evaluation
- Clustering on full corpus

**Disposition**:
- `QDRANT_ONLINE_PRODUCTION`: RETAIN (no changes)
- `QDRANT_GPU_INDEX_BUILD_EXPERIMENT`: APPROVED ISOLATED
- `CUVS_BRUTE_FORCE_GROUND_TRUTH`: IMPLEMENT FIRST (Phase 0)
- `CUVS_CAGRA_BENCHMARK`: IMPLEMENT AFTER SNAPSHOT PROOF (Phase 3)
- `CUVS_ONLINE_MANDATORY_DEPENDENCY`: REJECT FOR PHASE 110
- `IVF_FLAT_GPU`: BENCHMARK LATER
- `IVF_PQ_GPU`: BENCHMARK AFTER CAGRA
- `IVF_RABITQ_GPU`: EXPERIMENTAL (hold)
- `IVF_TQ_OR_IVQT`: DO NOT NAME until implementation proven
- `TURBOVEC`: SEPARATE CPU EXPERIMENT
- `NEO4J_GPU_ACCELERATION`: NOT APPLICABLE

#### 3. Windows Native (DirectX or DirectML)

**Role**: Separate Windows native inference or rendering services only.

**Status**: Not substitutes for Qdrant Vulkan or cuVS CUDA.

### At Current Corpus Scale

At approximately 52,000–60,000 vectors, **GPU ANN is not presumed superior to CPU Qdrant HNSW.**

**All promotion decisions require measured end-to-end evidence.**

---

## Arrow Snapshot Contract (GPU Benchmark Input)

### Required Fields

The canonical Arrow IPC snapshot exported from Postgres authority must include:

```
row_offset:              uint32      // Position in snapshot
feature_id:              uint64      // Logical feature identifier
packet_key:              utf8        // Stable unique identity
source_ref:              utf8        // Source location (file path, URL)
content_hash:            fixed[32]   // SHA-256 for verification
representation_id:       dictionary  // e.g., "semantic_768"
representation_revision: utf8        // Immutable model artifact ID
embedding:               fixed_list[768 × float32]  // 768-dim vector
```

### Manifest Requirements

Every cuVS or TurboVec index must be rejected if its manifest does not match:

```json
{
  "dataset_content_hash": "sha256:...",        // Hash of all vectors
  "feature_id_order_hash": "sha256:...",       // Hash of sorted feature IDs
  "representation_id": "semantic_768",
  "representation_revision": "embeddinggemma:2026-07-30.1",
  "workspace_revision": "2026-07-30T13:00:00Z",
  "point_count": 52380,
  "dimension": 768,
  "snapshot_id": "snapshot-phase110-2026-07-30",
  "created_at": "2026-07-30T14:30:00Z"
}
```

### Deterministic Row Ordering

**Required**: Rows must be ordered deterministically (by feature_id or packet_key) so that `feature_id_order_hash` is reproducible across rebuilds.

**Snapshot rejection criteria**:
- ❌ Point count differs from manifest
- ❌ Dimension differs from 768
- ❌ Embeddings contain NaN or infinity
- ❌ Row ordering is nondeterministic
- ❌ Feature ID order hash differs from manifest
- ❌ Representation revision is unresolved

---

## Sixteen Gate Proof System

Phase 110 uses **explicit proof states** (not Boolean):

```typescript
type ProofState = 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED' | 'GATED' | 'SKIPPED';

interface GateResult {
  state: ProofState;
  message: string;
  proof_references: string[];       // URLs, file paths, trace IDs
  trace_id?: string;
  authority_revision?: string;
  started_at: string;               // ISO timestamp
  completed_at: string;
  error_details?: string;
}
```

**Hard rule**: A Boolean-only gate representation is prohibited. Every gate must have a state, message, and proof evidence.

### Milestone Structure

**Milestone 1 (Acquisition)** — Gates 1-5 MUST PASS before proceeding:
1. **G1**: Acquisition provider readback (Crawl4AI or equivalent)
2. **G2**: Acquisition contract validation (Pydantic/Zod schema)
3. **G3**: Postgres document commit and readback
4. **G4**: Postgres chunk commit and readback
5. **G5**: Embedding generation and lineage readback (real 768-dim, immutable model digest)

**Milestone 2 (Retrieval)** — Depends on Milestone 1 PASS:
6. **G6**: Qdrant upsert and readback (payload parity)
7. **G7**: ACL-filtered top-k retrieval
8. **G8**: Domain classification
9. **G9**: Entity resolution

**Milestone 3 (Facts and Graph)** — Depends on Milestone 2 PASS:
10. **G10**: N-ary fact persistence
11. **G11**: Neo4j projection and readback
12. **G12**: Bounded graph expansion

**Milestone 4 (Ranking and Synthesis)** — Depends on Milestone 3 PASS:
13. **G13**: Weighted RRF trace (deterministic, verifiable)
14. **G14**: ACE packet assembly (≤4,800 tokens, sourced)
15. **G15**: ACL isolation test
16. **G16**: Sourced Gemma4 synthesis (with citations)

**Current Phase 110 state**:
- `MILESTONE_1`: PARTIAL (gates 1-5 scaffolded, not independently proven for live data)
- `MILESTONE_2`: NOT_RUN
- `MILESTONE_3`: NOT_RUN
- `MILESTONE_4`: NOT_RUN
- `PHASE_110`: NOT_PROVEN

**Key constraints**:
- Gate 4 remains NOT_PROVEN until chunk readback is independently implemented
- Gate 5 remains NOT_PROVEN until a real 768-dimensional embedding is generated, persisted, and read back with immutable model lineage
- Passing 5 unrelated gates does NOT automatically produce PARTIAL_PROVEN. Milestone gates are sequential dependencies.

---

## cuVS Benchmark Gates (Promotion Criteria)

cuVS remains **offline** unless all required gates pass:

| Gate | Requirement | Target |
|------|-------------|--------|
| CUVS_RUNTIME_AVAILABLE | PASS | Can allocate GPU for cuVS |
| EXACT_GROUND_TRUTH_REPRODUCIBLE | PASS | cuVS brute-force runs deterministically twice |
| CAGRA_COLD_RELOAD_PARITY | PASS | Serialized index reloads with identical neighbors |
| FEATURE_ID_MAP_PARITY | 100% | Feature ID mapping is exact and reversible |
| STALE_REVISION_REJECTION | PASS | Old snapshots are rejected before indexing |
| RECALL_AT_10 | ≥0.95 | 95% of Qdrant top-10 found in cuVS |
| RECALL_AT_50 | ≥0.97 | 97% of Qdrant top-50 found in cuVS |
| FILTERED_RESULT_CORRECTNESS | 100% | Filter criteria produce identical result sets |
| END_TO_END_NDCG_REGRESSION | ≤0.01 | NDCG score degradation < 1% |
| END_TO_END_LATENCY_IMPROVEMENT | Materially significant | Measurable speedup vs Qdrant baseline |
| GPU_MEMORY_CONTENTION | Acceptable | No OOM under active runtime mode |

**Resource modes** (three must pass):
- `GPU_EXCLUSIVE_CUVS`: cuVS sole GPU consumer
- `GPU_SHARED_WITH_EMBEDDING`: cuVS shares GPU with embedding service
- `GPU_SHARED_WITH_GEMMA4`: cuVS shares GPU with Gemma4 (most constrained)

**Failure behavior**: A failure under the shared Gemma4 mode is a **measured result**, not an automatic infrastructure defect.

---

## Phase 110 Success Metrics

Phase 110 is complete only when:

- ✅ Postgres remains the verified authority for all identity and lineage
- ✅ Every representation has immutable lineage (model artifact hash, generation timestamp, embedding dimension)
- ✅ Source revisions and workspace revisions are enforced throughout
- ✅ Qdrant payload parity is proven (spot checks on 10+ points)
- ✅ Neo4j projection parity is proven (facts, edges, entities match Postgres)
- ✅ ACL isolation is proven (private docs hidden from other users)
- ✅ Weighted RRF emits a deterministic trace (reproducible across runs)
- ✅ ACE preserves source references and revisions (no lossy compression)
- ✅ Gemma4 returns sourced structured output (citations included, no hallucinations)
- ✅ Stale cards and projections are rejected (revision mismatch detected)
- ✅ All required gates are PASS (1-16, no NOT_RUN, BLOCKED, or GATED)
- ✅ No production claim depends on a mock, fixture, static import, or configured port alone

---

## Next Steps

1. **Seed canonical data**: Run Phase 108D embeddings backfill to populate `atlas_documents` + `atlas_chunks` from existing codebase snapshots.
2. **Build Qdrant mirror**: Upsert 52,380 vectors with full payload schema.
3. **Implement retrieval lanes**: Wire all 6 parallel lanes into unified orchestrator.
4. **Integrate ACE assembly**: Connect bounded context envelope builder.
5. **Validate end-to-end**: Run 16-gate proof suite to ensure all stages complete correctly.

