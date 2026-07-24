# Parent Atlas Artifact Lifecycle & Governance (Complete Reference)

**Date**: July 24, 2026  
**Status**: Architecture specification (not yet implemented)  
**Scope**: Unifying all existing infrastructure (Postgres, Qdrant, Neo4j, Valkey, Go Retrieval, TurboVec) under one canonical identity and versioning model.

---

## Part 1: Current State vs. Missing Pieces

### ✅ Already Present (Proven or Operational)

| Component | Status | Location/Evidence |
|-----------|--------|-------------------|
| **PostgreSQL canonical packets** | ✅ Operational | `atlas_packets` table (61.7K rows) |
| **Summaries & layers** | ✅ Operational | `atlas_summary_layers`, `codebase_chunk_index` |
| **EmbeddingGemma 384-dim vectors** | ⏳ Partial | Retrieved from Ollama; not yet in canonical Postgres |
| **EmbeddingGemma 768-dim (legacy)** | ✅ Operational | `codebase_chunk_index.content_embedding` (40.5K rows in Qdrant) |
| **64-dim latent routing features** | ✅ Fixture | PCA baseline scaffolded; awaiting real autoencoder weights |
| **KMeans cluster assignments** | ✅ Operational | Gate 12 COMPLETE; materialized to Postgres |
| **SOM 20×20 assignments** | ✅ Operational | Gate 13 COMPLETE; 400 cells, all packets assigned |
| **Neo4j topology data** | ✅ Fixture | Structural edges (IMPORTS, CALLS, etc.) + SOM topology |
| **NetworkX/GDS PageRank parity** | ⏳ Awaiting | Stage 5b gate pending (Stage 1b regeneration) |
| **Qdrant dense search** | ✅ Operational | `codebase_chunks_768` collection (40.5K points, HNSW) |
| **BM42 sparse search** | ✅ Designed | Contract ready; implementation pending |
| **Valkey centroid cache** | ✅ Fixture | Experimental; no invalidation policy yet |
| **Go Retrieval service** | ✅ Operational | HTTP endpoints for unified search |
| **ACE packet concepts** | ✅ Designed | Contracts defined; full assembly pending |
| **TurboVec GPU prefilter** | ✅ Operational | 64-dim exact search, 4-bit quantized |
| **Miniforge environment** | ✅ Operational | PyTorch, RAPIDS, embedding analysis |

### ❌ Still Missing (Blocking Unified Operations)

| Component | Why It Matters | Impact If Missing |
|-----------|----------------|-------------------|
| **Summary versioning + content hash** | Stale summaries injected into ACE packets → wrong answers | Requires invalidation on source change |
| **Immutable corpus graph snapshot** | Can't audit what graph produced the PageRank scores | Blocks reproducibility |
| **Canonical graph node/edge export** | Qdrant/Neo4j must stay in sync with Postgres truth | Divergence undetected |
| **SOM coordinate provenance** | Don't know which embedding model/snapshot generated coordinates | Can't evaluate SOM quality |
| **KMeans/SOM/PageRank versioning** | Can't distinguish old vs. new cluster assignments | Multiple versions collide in schema |
| **Graph vector candidate fusion contract** | No agreed rules for combining dense+sparse+graph+KMeans signals | Ad-hoc blending produces irreproducible results |
| **Centroid cache invalidation rules** | Cache hits grow stale; causes retrieval drift | Queries drift from ground truth silently |
| **Full query retrieval ACE packet path** | Can't trace: user query → which lanes → which candidates → why that answer | Impossible to debug or audit |
| **Offline artifact manifests** | Don't know: which Parquet was used in this evaluation? | Can't reproduce evaluation results |
| **Memory-mapped packet format** | Packets > JSON size; can't serve 100K packets at <100ms latency | Retrieval remains too slow for production |
| **Online reranker promotion** | No path to graduate experimental reranker to production | Stuck with static ranking formula |

---

## Part 2: The Core Problem

### ❓ The Questions Blocking Unified Operations

1. **Which artifact is canonical?** (Postgres vs. Qdrant vs. Neo4j vs. Parquet vs. mmap)
2. **Which artifact is derived?** (cache, projection, mirror, feature engineered output)
3. **Which snapshot produced it?** (file inventory snapshot, embedding batch run, PageRank run)
4. **Which model version produced it?** (embedding model, reranker, KMeans, SOM, PageRank algorithm)
5. **Which online service may consume it?** (retrieval orchestrator, reranker, ACE planner, Go Retrieval)

### Current State: No Answers
- KMeans cluster assignments exist in Postgres but no `kmeans_model_version` field
- SOM coordinates in Postgres but no `som_model_version` or `snapshot_id`
- PageRank scores nowhere yet (Gate 5 pending)
- Summaries have no `content_hash` or `summary_version`
- Qdrant payloads diverged from Postgres (no canonical shape contract)

### Solution: Explicit Versioning + Lineage

Every artifact must carry:
- **Identity**: What is this? (`packet_key`, `snapshot_id`, `model_version`)
- **Provenance**: What produced it? (`source_ref`, `embedding_model`, `kmeans_model_version`)
- **Validity**: When is it stale? (`source_content_hash`, `snapshot_created_at`, `cache_expires_at`)
- **Consumer**: Who uses it? (Go Retrieval, reranker, ACE assembler, offline analytics)

---

## Part 3: Unified Artifact Storage Architecture

### Layer 1: PostgreSQL (Canonical Truth)

**Purpose**: Single source of truth for all packet identity, versioning, and metadata.

**Core tables**:

```sql
-- Identity & structural data (immutable after creation)
atlas_packets (
  packet_key TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL,        -- file path or feature reference
  tree_node_id UUID,               -- canonical graph identity
  feature_id TEXT,                 -- feature classification
  domain_class TEXT,               -- semantic category
  symbol_name TEXT,                -- code symbol
  language TEXT,
  extraction_version TEXT,
  created_at TIMESTAMP
);

-- Versioned derived features (immutable per model run)
atlas_packet_derived_features (
  packet_key TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,       -- which graph snapshot?
  
  -- Embedding provenance
  embedding_model TEXT,            -- embeddinggemma, model version
  embedding_dimension INT,         -- 384, 768, 64, etc.
  embedding_hash TEXT,             -- SHA-256 of vector bytes
  
  -- KMeans routing
  kmeans_model_version TEXT,       -- which KMeans was trained?
  kmeans_cluster_id INT,           -- cluster assignment
  kmeans_distance REAL,            -- distance to centroid
  kmeans_snapshot_id TEXT,         -- when was this cluster created?
  
  -- SOM routing
  som_model_version TEXT,          -- which SOM codebook?
  som_x INT,                       -- grid position (0-19)
  som_y INT,                       -- grid position (0-19)
  som_cell_id INT,                 -- precomputed cell index (x*20+y)
  som_quantization_error REAL,     -- reconstruction loss
  som_snapshot_id TEXT,            -- when was this SOM trained?
  
  -- Authority ranking
  community_id TEXT,               -- graph community
  pagerank_run_id TEXT,            -- which PageRank execution?
  pagerank_raw REAL,               -- raw PageRank score
  pagerank_l1 REAL,                -- L1-normalized (sum=1)
  
  -- Feature labels
  feature_labels TEXT[],           -- RRF, PageRank, MCP, etc.
  
  -- Metadata
  updated_at TIMESTAMP NOT NULL,
  UNIQUE(packet_key, snapshot_id)
);

-- Versioned summaries (immutable per content hash)
atlas_packet_summaries (
  summary_id UUID PRIMARY KEY,
  packet_key TEXT NOT NULL,
  summary_version TEXT,            -- v1, v2, etc.
  source_content_hash TEXT,        -- SHA-256 of source file/chunk
  model_or_extractor TEXT,         -- gemma4, langextract, etc.
  summary_text TEXT,
  token_count INT,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,            -- None if evergreen; set if time-bound
  UNIQUE(packet_key, source_content_hash, summary_version)
);

-- Graph snapshots (immutable manifest)
atlas_graph_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL,
  stage_1_inventory_hash TEXT,     -- file list SHA-256
  stage_2_extraction_hash TEXT,    -- structural facts SHA-256
  stage_4_topology_hash TEXT,      -- edges SHA-256
  total_nodes INT,
  total_edges INT,
  node_edge_export_path TEXT,      -- where are nodes/edges stored?
  notes TEXT
);

-- Artifact manifests (track all outputs for reproducibility)
atlas_artifact_manifests (
  manifest_id TEXT PRIMARY KEY,
  artifact_type TEXT,              -- snapshot, clustering, som, pagerank, evaluation
  snapshot_id TEXT REFERENCES atlas_graph_snapshots(snapshot_id),
  model_version TEXT,
  output_path TEXT,                -- docs/artifacts/.../
  file_sha256 TEXT,
  file_size_bytes INT,
  record_count INT,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(artifact_type, snapshot_id, model_version)
);
```

### Layer 2: Qdrant (Fast ANN Mirror)

**Purpose**: Dense vector search with identity + routing metadata. Canonical retrieval index.

**Collection schema** (`codebase_chunks_384`):

```json
{
  "point_id": "uuid",
  "vector": [384 float32],    // canonical 384-dim native embedding
  "payload": {
    // Identity (required, indexed)
    "packet_key": "string",
    "source_ref": "string",
    "tree_node_id": "uuid",
    
    // Routing (indexed for filtering)
    "domain_class": "string",
    "feature_labels": ["string"],
    "kmeans_cluster_id": 17,
    "som_x": 6,
    "som_y": 12,
    "som_cell_id": 132,
    "community_id": "string",
    
    // Versioning (indexed for staleness check)
    "graph_snapshot_id": "string",
    "embedding_model": "embeddinggemma:384",
    "embedding_revision": 1,
    "summary_version": "v2",
    "summary_hash": "string",
    
    // Metadata (not indexed)
    "pagerank_l1": 0.00015,
    "language": "typescript",
    "extraction_version": "1.0"
  }
}
```

**Collection schema** (`codebase_chunks_768_legacy`):

```json
{
  "point_id": "uuid",
  "vector": [768 float32],    // legacy native (optional for detail search)
  "payload": {
    // Same as 384-dim, plus:
    "embedding_model": "embeddinggemma:768",
    "note": "Legacy; use 384-dim canonical for primary search"
  }
}
```

### Layer 3: Neo4j (Topology Projection)

**Purpose**: Graph traversal, community detection, relationship queries. Read-only mirror of Postgres edges.

**Node identity**:
- `node_key` as unique identifier (NOT Neo4j internal ID)
- Properties: `packet_key`, `source_ref`, `tree_node_id`, `domain_class`

**Edge layers** (not merged):

| Layer | Edges | Use Case |
|-------|-------|----------|
| Structural | IMPORTS, CALLS, REFERENCES, CONTAINS, TESTS, IMPLEMENTS, EXTENDS | PageRank (via NetworkX/GDS) |
| Semantic | SEMANTIC_SIMILAR (cosine > 0.85), SAME_DOMAIN | Multi-hop expansion |
| Cluster | MEMBER_OF_KMEANS, MEMBER_OF_SOM_CELL | Bounded neighborhood search |
| Feature | IMPLEMENTS_FEATURE, USES_CONCEPT | Feature-scoped queries |
| Runtime | FAILED_IN_RUN, FIXED_BY_PATCH, VALIDATED_BY_TEST | Evidence tracking |
| Evidence | DERIVED_FROM, SUMMARIZED_BY | Lineage audit |

### Layer 4: Valkey/Redis (Ephemeral Cache)

**Purpose**: Hot cache for query results, centroids, graph traversals. Never canonical storage.

**Cache key schema** (with invalidation rules):

```
// Query embedding cache (L1 exact match)
embedding:cache:{query_hash} → [384 float32]
Invalidates when: embedding model changed

// Centroid routing cache (L1 nearest clusters)
centroid:route:{model_version}:{query_hash} → [{cluster_id, distance}]
Invalidates when: model_version changed OR snapshot_id changed OR embedding dimension changed

// Retrieval result cache (L2 bounded set)
retrieval:cache:{query_hash}:{snapshot_id}:{sparse_model_version} → [candidate IDs]
Invalidates when: snapshot changed OR sparse model changed OR filter changed

// ACE packet cache (L2 assembled context)
ace:packet:cache:{run_id}:{query_hash} → {packet JSON}
Invalidates when: any source changed (summary, embedding, feature, authority)

// SOM cell cache (L1 hot members)
som:cell:{model_version}:{cell_id} → [packet_key list]
Invalidates when: som_model_version changed OR snapshot changed

// Centroid vectors (read-only, loaded at startup)
centroid:vectors:{model_version} → binary f32 array
Invalidates when: kmeans_model_version changed
```

**Cache invalidation contract**:
- Never use Redis as truth for cluster assignments, coordinates, PageRank, or graph snapshots
- Invalidate on model version change, snapshot change, dimension change, content hash change
- Async invalidation (don't block on cache delete)

### Layer 5: DuckDB (Offline Analytics)

**Purpose**: Bulk analysis, evaluation, artifact generation. Not online.

**Typical workflow**:

```sql
-- 1. Export from Postgres
SELECT packet_key, snapshot_id, kmeans_cluster_id, som_x, som_y, pagerank_l1
FROM atlas_packet_derived_features
WHERE snapshot_id = 'v1-2026-07-24'
ORDER BY packet_key;
-- Output: derived_features.parquet

-- 2. Join with embeddings (from Qdrant export)
SELECT df.packet_key, df.kmeans_cluster_id, emb.vector
FROM read_parquet('derived_features.parquet') df
JOIN read_parquet('embeddings_384.parquet') emb
  ON df.packet_key = emb.packet_key;
-- Output: joined_features.parquet

-- 3. Aggregate for evaluation
SELECT 
  kmeans_cluster_id,
  COUNT(*) as cluster_size,
  AVG(pagerank_l1) as avg_authority,
  STDDEV(pagerank_l1) as authority_variance
FROM read_parquet('derived_features.parquet')
GROUP BY kmeans_cluster_id
ORDER BY avg_authority DESC;
-- Output: cluster_summary.json

-- 4. Cross-model comparison
SELECT 
  'pagerank' as model,
  CORR(score_v1, score_v2) as parity_correlation
FROM read_parquet('pagerank_comparison.parquet');
-- Output: parity_report.json
```

### Layer 6: SeaweedFS (Immutable Artifacts)

**Purpose**: Durable storage for large outputs (NDJSON, Parquet, Arrow, binary mmap).

**Artifact organization**:

```
/legal-evidence/
  artifacts/
    parent-atlas/
      snapshots-v1/
        manifest.json          # snapshot identity, file listing, hashes
        nodes.ndjson           # canonical node set
        edges.ndjson           # canonical edge set
        relations.ndjson       # edge layer classification
        exclusions.ndjson      # nodes/edges intentionally excluded
        derived_features.parquet
        topology_hash.txt      # SHA-256 of edges (for reproducibility)
      clustering/
        manifest.json
        centroids.f32          # binary KMeans centroid vectors
        centroid_metadata.json # cluster sizes, labels, statistics
        assignments.parquet    # packet_key → cluster_id
        cluster_summaries.json # per-cluster authority stats
      som/
        manifest.json
        codebook_vectors.f32   # 400 * 384-dim (binary)
        assignments.parquet    # packet_key → som_x, som_y
        cell_summaries.json    # per-cell occupancy, domain distribution
        neighborhood_graph.ndjson # SOM adjacency edges
      authority/
        manifest.json
        networkx_run.json      # algorithm configuration
        gds_run.json           # Neo4j GDS configuration (if applicable)
        networkx_scores.parquet
        gds_scores.parquet
        parity_report.json     # comparison vs. reference
      evaluation/
        manifest.json
        queries.ndjson         # evaluation set (user queries)
        candidates.parquet     # retrieved candidates per query
        rankings.parquet       # reranker scores per candidate
        metrics.json           # NDCG, MRR, recall @K
        latency.json           # p50, p95, p99 by stage
```

---

## Part 4: Summary Versioning & Lifecycle

### Why Summaries Need Versioning

**Problem**: A summary generated from `src/lib/server/retrieval/orchestrator.ts` at commit `abc123` is outdated after a rewrite at commit `def456`. If we cache the old summary and inject it into an ACE packet, the LLM gets stale context.

**Solution**: Immutable summaries with content hashes and versions.

### Three-Level Summary Architecture

```sql
-- L0: Identity (packet_key alone is not enough)
atlas_packet_summaries.packet_key     -- WHAT packet?
atlas_packet_summaries.source_content_hash  -- FROM which source version?
atlas_packet_summaries.summary_version      -- WHICH summary variant? (v1, v2, etc.)

-- L1: Retrieval (responsibility boundary)
-- Input: query, retrieval_policy, snapshot_id
-- Output: ranked candidate_list
-- Dependencies: Qdrant, Valkey, BM42, Neo4j (bounded neighborhood)
-- Invariants:
--   - Disabled lanes must not execute
--   - Candidates must have canonical identity (packet_key + tree_node_id)
--   - No legacy authority fields in payload

-- L2: Patch-oriented (for error fixing)
-- Input: error_stack, related_files, retrieval_policy
-- Output: edit_patch_proposal
-- Dependencies: retrieval orchestrator (same as L1)
-- Invariants:
--   - Do NOT bypass SearchBackend
--   - Do NOT use legacy authority fields
--   - Risk boundaries must be enforced
--   - Related tests must pass before promotion
```

### Summary Invalidation Rules

```typescript
// A summary is stale if:
const isStale = (summary: AtlasPacketSummary) => {
  // 1. Source file changed
  const sourceHash = computeContentHash(readFile(summary.source_ref));
  if (sourceHash !== summary.source_content_hash) return true;
  
  // 2. Extraction model changed
  if (summary.model_or_extractor !== CURRENT_SUMMARY_MODEL) return true;
  
  // 3. Time-bound expiration
  if (summary.expires_at && Date.now() > summary.expires_at) return true;
  
  // 4. Graph snapshot changed (invalidates ranking context)
  if (summary.graph_snapshot_id !== CURRENT_SNAPSHOT_ID) return true;
  
  return false;
};

// Never inject stale summary into ACE packet
const assembleAcePacket = async (query: string, candidates: Candidate[]) => {
  for (const cand of candidates) {
    const summary = await findLatestSummary(cand.packet_key);
    if (isStale(summary)) {
      // Regenerate or skip
      summary = await regenerateSummary(cand.packet_key);
    }
    // Safe to inject
    packet.context += summary.summary_text;
  }
};
```

---

## Part 5: Recommended Output Artifacts (Per Pipeline Run)

### Each run creates an immutable directory:

```
docs/artifacts/parent-atlas/snapshots-v1/
  ✓ manifest.json         (5 KB)  - snapshot identity, file hashes, record counts
  ✓ nodes.ndjson          (8 MB)  - 65K nodes (canonical)
  ✓ edges.ndjson          (25 MB) - 150K edges (canonical)
  ✓ relations.ndjson      (2 MB)  - edge layer tags (IMPORTS, CALLS, etc.)
  ✓ topology_hash.txt     (1 KB)  - SHA-256(edges) for reproducibility
  ✓ derived_features.parquet (50 MB) - all feature vectors, assignments, scores

docs/artifacts/parent-atlas/clustering/
  ✓ manifest.json         (3 KB)
  ✓ centroids.f32         (520 KB)      - 20 clusters × 384-dim × 4 bytes
  ✓ centroid_metadata.json (10 KB)      - cluster sizes, labels
  ✓ assignments.parquet   (15 MB)       - packet_key → cluster_id
  ✓ cluster_summaries.json (50 KB)      - per-cluster statistics

docs/artifacts/parent-atlas/som/
  ✓ manifest.json         (3 KB)
  ✓ codebook_vectors.f32  (6.1 MB)     - 400 cells × 384-dim × 4 bytes
  ✓ assignments.parquet   (15 MB)       - packet_key → som_x, som_y
  ✓ cell_summaries.json   (80 KB)       - per-cell occupancy, purity
  ✓ neighborhood_graph.ndjson (100 KB) - SOM grid adjacency

docs/artifacts/parent-atlas/authority/
  ✓ manifest.json         (3 KB)
  ✓ networkx_scores.parquet (10 MB)    - packet_key → pagerank_raw, pagerank_l1
  ✓ gds_scores.parquet    (10 MB)      - if Neo4j GDS run; else omitted
  ✓ parity_report.json    (5 KB)       - correlation(networkx, gds); r>0.99 for PASS

docs/artifacts/parent-atlas/evaluation/
  ✓ manifest.json         (3 KB)
  ✓ queries.ndjson        (2 MB)       - 500+ evaluation queries
  ✓ candidates.parquet    (100 MB)     - all retrieved candidates
  ✓ rankings.parquet      (80 MB)      - reranker scores
  ✓ metrics.json          (10 KB)      - NDCG@20, MRR, Recall@100
  ✓ latency.json          (5 KB)       - p50, p95, p99 per stage
```

**Total per run**: ~350 MB (immutable, versioned, reproducible)

---

## Part 6: SOM 20×20 Interpretation

### What SOM Coordinates Mean

- **SOM cell ID** (0–399): 20×20 grid flattened
- **som_x** (0–19), **som_y** (0–19): grid position
- **som_quantization_error**: vector distance to nearest codebook prototype (lower = better)
- **som_model_version**: which SOM training run produced these coordinates?

### Coordinates are NOT semantic truth

- SOM is a **routing & visualization feature**, not an authority ranking
- Coordinates improve only if you:
  1. Retrain SOM on a **controlled vector population**
  2. Evaluate: **quantization error**, **topographic error**, **cell occupancy**, **domain purity**, **neighbor continuity**
  3. Measure retrieval recall by cell distance (nearby cells should have high recall)

### Where SOM assignments live

| Layer | Format | Truth? | Validity |
|-------|--------|--------|----------|
| Canonical | Postgres `atlas_packet_derived_features` + SeaweedFS Parquet | ✅ YES | Immutable per snapshot_id |
| Mirror | Qdrant payload `som_x`, `som_y`, `som_cell_id` | ❌ NO | Filtered for ANN search only |
| Cache | Valkey `som:cell:{model_version}:{cell_id}` | ❌ NO | Expires when model changes |

**Cache invalidation**: Delete all `som:cell:*` when `som_model_version` changes OR `snapshot_id` changes OR `embedding_model_version` changes.

---

## Part 7: KMeans & Centroid Routing

### KMeans Role: Reduce ANN Work

Instead of: Query → 384-dim embedding → full Qdrant HNSW (expensive)

Do this: Query → 384-dim embedding → find nearest 2–4 centroids → ANN within selected partitions → merge + rerank

### Storage Schema

```sql
-- Canonical (Postgres)
kmeans_model_version TEXT,      -- 'kmeans-384-k20-v1'
kmeans_cluster_id INT,          -- 0–19
kmeans_distance REAL,           -- distance to centroid
kmeans_snapshot_id TEXT,        -- which snapshot was used?

-- Centroids (binary, immutable)
File: docs/artifacts/parent-atlas/clustering/centroids.f32
Format: k * dim * sizeof(float32) = 20 * 384 * 4 = 30,720 bytes

-- Metadata (JSON)
{
  "kmeans_model_version": "kmeans-384-k20-v1",
  "num_clusters": 20,
  "embedding_dimension": 384,
  "centroid_hashes": ["sha256_c0", "sha256_c1", ...],
  "cluster_sizes": [3251, 2918, 3105, ...],
  "cluster_labels": ["startup", "retrieval", ...],
  "training_snapshot_id": "v1-2026-07-24",
  "created_at": "2026-07-24T00:00:00Z"
}

-- Cache (Valkey)
Key: centroid:route:{model_version}:{query_hash}
Value: [{cluster_id: 0, distance: 0.12}, {cluster_id: 5, distance: 0.18}]
TTL: Invalidate when model_version changed OR snapshot_id changed OR embedding dimension changed
```

### Cache Invalidation Contract

```typescript
const isCentroidCacheValid = (cacheKey: string, currentState: State) => {
  const [modelVersion, queryHash] = cacheKey.split(':').slice(1);
  
  // Invalidate if model changed
  if (modelVersion !== currentState.kmeans_model_version) return false;
  
  // Invalidate if snapshot changed
  if (!cacheKey.includes(currentState.snapshot_id)) return false;
  
  // Invalidate if embedding dimension changed
  if (!cacheKey.includes(currentState.embedding_dimension)) return false;
  
  // Invalidate if centroid hash changed
  if (cacheKey.centroid_hash !== currentState.centroid_metadata_hash) return false;
  
  return true;
};
```

---

## Part 8: Domain Classes, Feature Labels, and Communities (Keep Separate)

### Do NOT Collapse These Into One "Cluster" Field

Each answers a different question:

```typescript
interface PacketIdentity {
  // Structural source code identity (immutable)
  tree_node_id: UUID,              // Unique node in code graph
  
  // Canonical ground truth (one per packet)
  packet_key: string,              // Unique packet identifier
  
  // Semantic category (what is it about?)
  domain_class: 'retrieval' | 'graph' | 'startup' | 'database',
  
  // Feature implementation (which features does it touch?)
  feature_labels: ['RRF', 'PageRank', 'MCP'],
  
  // Vector space partitions (for ANN routing)
  kmeans_cluster_id: 17,           // 0–19
  kmeans_distance: 0.15,
  
  // Topology-preserving map (for visualization)
  som_x: 6,                        // 0–19
  som_y: 12,                       // 0–19
  som_cell_id: 132,                // som_x * 20 + som_y
  
  // Graph community (from structural clustering)
  community_id: 'community-4',
}

// Example: One packet with multiple identities
{
  tree_node_id: '550e8400-e29b-41d4-a716-446655440000',
  packet_key: 'ace:packet:retrieval:001',
  domain_class: 'retrieval',       // It's about retrieval
  feature_labels: ['RRF', 'PageRank', 'MCP', 'graph_fusion'],  // Touches 4 features
  kmeans_cluster_id: 17,           // Partitioned to cluster 17
  som_x: 6,
  som_y: 12,
  som_cell_id: 132,               // In SOM grid cell 132
  community_id: 'community-4'     // Part of structural community 4
}
// Each field is orthogonal. All can be true simultaneously.
```

---

## Part 9: Multi-Layer Graph (Do NOT Merge)

### Graph layers (separate edge types, ONE canonical node identity):

| Layer | Edge Type | When Used | Truth Authority |
|-------|-----------|-----------|-----------------|
| **Structural** | IMPORTS, CALLS, REFERENCES, DEPENDS_ON, CONTAINS, TESTS, IMPLEMENTS, EXTENDS | PageRank authority | Neo4j (mirrored from Postgres) |
| **Semantic** | SEMANTIC_SIMILAR (cosine > 0.85), SAME_DOMAIN | Multi-hop expansion for related features | Qdrant payload-based (not canonical) |
| **Cluster** | MEMBER_OF_KMEANS, MEMBER_OF_SOM_CELL | Bounded neighborhood search | Postgres `atlas_packet_derived_features` |
| **Feature** | IMPLEMENTS_FEATURE, USES_CONCEPT | Feature-scoped queries | Postgres `atlas_packets.feature_labels` |
| **Runtime** | FAILED_IN_RUN, FIXED_BY_PATCH, VALIDATED_BY_TEST | Evidence tracking | Postgres (operational) |
| **Evidence** | DERIVED_FROM, SUMMARIZED_BY | Lineage audit | Postgres (operational) |

### Graph traversal policy (explicit bounds):

```typescript
interface TraversalPolicy {
  name: 'dense_retrieval' | 'sparse_retrieval' | 'graph_authority' | 'agentic_expansion',
  
  // Example: agentic expansion
  allow_layers: {
    structural: ['CALLS', 'IMPLEMENTS'],  // Code relationships only
    semantic: ['SAME_DOMAIN'],            // Feature similarity
    cluster: ['MEMBER_OF_SOM_CELL'],      // Bounded neighborhood
  },
  maximum_hops: 2,
  maximum_fanout: 10,          // Don't expand beyond 10 neighbors per hop
  semantic_edge_budget: 3,     // Max 3 semantic edges per hop
  
  // Forbidden
  forbidden: [
    'Feature layer with > 2 hops',  // Prevent runaway feature expansion
    'Mix structural + semantic at hop 1',  // First hop is structural only
  ],
}
```

---

## Part 10: Offline DuckDB Pipeline (Not MapReduce)

### Pattern: NDJSON/Postgres → DuckDB → SQL → Parquet → PostgreSQL manifest

**Stage: MAP** (extract per artifact)

```sql
-- Export Postgres canonical data
SELECT packet_key, source_ref, tree_node_id, domain_class
FROM atlas_packets
ORDER BY packet_key;
-- Output: packets.parquet

-- Export derived features
SELECT packet_key, snapshot_id, kmeans_cluster_id, som_x, som_y, pagerank_l1
FROM atlas_packet_derived_features
WHERE snapshot_id = $1
ORDER BY packet_key;
-- Output: derived_features.parquet
```

**Stage: SHUFFLE** (partition by key)

```sql
-- Join packets with features
SELECT 
  p.packet_key,
  p.source_ref,
  df.kmeans_cluster_id,
  df.som_x,
  df.som_y,
  df.pagerank_l1,
  df.community_id
FROM read_parquet('packets.parquet') p
JOIN read_parquet('derived_features.parquet') df
  ON p.packet_key = df.packet_key
WHERE df.snapshot_id = $1
ORDER BY df.kmeans_cluster_id, p.packet_key;
-- Output: joined_features.parquet
```

**Stage: REDUCE** (aggregate summaries)

```sql
-- Per-cluster statistics
SELECT 
  kmeans_cluster_id,
  COUNT(*) as cluster_size,
  COUNT(DISTINCT community_id) as num_communities,
  AVG(pagerank_l1) as avg_authority,
  STDDEV(pagerank_l1) as authority_variance,
  MIN(pagerank_l1) as min_authority,
  MAX(pagerank_l1) as max_authority,
  APPROX_QUANTILES(pagerank_l1, 100)[OFFSET(50)] as median_authority
FROM read_parquet('joined_features.parquet')
GROUP BY kmeans_cluster_id
ORDER BY cluster_size DESC;
-- Output: cluster_summary.json
```

**Use DuckDB for**: Offline batch analytics, evaluation, artifact generation  
**Use Postgres for**: Canonical online metadata, transactional updates

---

## Part 11: Reranker Improvements

### Input Features (Explicit)

| Feature | Score Range | When Used | Weight |
|---------|-------------|-----------|--------|
| Dense similarity (384-dim cosine) | 0–1 | Always | 0.30 |
| Sparse (BM42/BM25) rank | 0–1 | Full text | 0.20 |
| Exact lexical match | 0–1 | Keyword overlap | 0.10 |
| AST relationship (e.g., CALLS) | 0–1 | Code graph | 0.10 |
| Graph hop distance | 0–1 | Structural proximity | 0.10 |
| Domain match | 0–1 | Same `domain_class` | 0.05 |
| Feature label match | 0–1 | Shared `feature_labels` | 0.05 |
| KMeans distance | 0–1 | Cluster routing | 0.05 |
| SOM cell distance | 0–1 | Grid proximity | 0.03 |
| PageRank prior | 0–1 | Authority (5–10% max) | 0.07 |
| Related tests | 0–1 | Test coverage | 0.05 |
| Prior fix similarity | 0–1 | Similar errors | 0.05 |

**Total**: 1.15 (normalize to 1.0 in final combination)

### Candidate Pipeline

```
User query
  ↓
1. Initial retrieval: 100–300 candidates
   ├─ Dense (Qdrant HNSW on 384-dim)
   ├─ Sparse (BM42 exact)
   ├─ Lexical (rg anchors)
   └─ Graph (Neo4j bounded k-hop)
  ↓
2. Post-dedup: 50–100 candidates
   ├─ Remove duplicates by packet_key
   ├─ Remove exact matches
   └─ Merge lane results via RRF
  ↓
3. Cross-encoder reranker: top 20–50
   ├─ Score all input features
   ├─ Weighted combination
   └─ Sort by final score
  ↓
4. ACE exact excerpts: top 6–12
   ├─ Fetch summaries
   ├─ Check staleness
   └─ Inject into packet
```

**Rules**:
- PageRank contributes **5–10% max** (never more)
- KMeans/SOM mostly for **routing, not relevance** (<5% weight in final score)
- Dense + sparse fusion is the core (50%+)

---

## Part 12: Vector Index Strategy (Scale ~55K–70K vectors)

### Recommended Setup

| Index | Status | Why |
|-------|--------|-----|
| **Qdrant HNSW (384-dim)** | ✅ Canonical | CPU HNSW sufficient at this scale; no GPU ANN overhead |
| **TurboVec (64-dim)** | ✅ Experimental | GPU-accelerated 4-bit exact rescoring; optional optimization |
| **cuVS / CAGRA** | ⏳ Benchmark only | Use ONLY if benchmark proves: lower p95 latency + equal/better recall + acceptable build time + stable on Windows WSL |
| **IVF** | ⏳ Offline only | Useful for controlled GPU experiments; not for production ANN |

### DO NOT reindex into every ANN family simultaneously

- **Sync nightmare**: 3+ indexes = 3× write latency, divergence risk
- **Transport overhead**: Moving vectors to GPU may exceed compute savings at this scale
- **First benchmark**: Qdrant HNSW on CPU is baseline; measure p95 latency and VRAM. If problem, then profile GPU options.

### RAPIDS / cuGraph

- **Useful offline**: Large PageRank experiments, community detection, connected components
- **Do NOT use online**: Replace validated NetworkX/GDS path only with new parity gate
- **Scope**: Offline batch processing of Postgres/Parquet exports

---

## Part 13: Miniforge & PyTorch Lane

### Purpose: Offline feature engineering, model training, evaluation

**What Miniforge owns**:
- PyTorch embedding analysis
- KMeans training & centroid computation
- SOM codebook training & coordinate generation
- RAPIDS cuGraph experiments (offline PageRank comparison)
- Reranker model training & evaluation
- Parquet/Arrow generation

**What Miniforge does NOT own**:
- ❌ Canonical packet identity (Postgres owns it)
- ❌ Direct Qdrant upserts
- ❌ Direct Neo4j writes
- ❌ Direct Postgres writes (only via manifest import)

**Artifact workflow**:

```
SvelteKit (TypeScript)
  ↓
Miniforge (Python)
  ├─ Read: Postgres dump (packet_key, source_ref, ...)
  ├─ Read: Embeddings from Qdrant export
  ├─ Compute: KMeans centroids + assignments
  ├─ Output: Parquet + manifest JSON
  └─ Output: centroids.f32 (binary)
  ↓
Postgres (via manifest import)
  ├─ Validate manifest
  ├─ Insert atlas_packet_derived_features
  ├─ Insert atlas_artifact_manifests
  └─ Update atlas_graph_snapshots
  ↓
Post-import sync
  ├─ Invalidate Redis caches
  ├─ Upsert Qdrant payloads (async)
  └─ Update Neo4j projections (async)
```

---

## Part 14: Sparse Search (BM25 / BM42) Caching

### Cache Schema

```
Key format: atlas:sparse:{collection_alias}:{collection_revision}:{sparse_model_version}:{filter_hash}:{query_hash}:{top_k}
Example: atlas:sparse:codebase:v1:bm42-384:filter-domain-retrieval:q-abc123:20

Value: {
  candidate_ids: [packet_key_0, packet_key_1, ...],
  ranks: [1, 2, 3, ...],
  scores: [0.95, 0.87, 0.72, ...],
  identity_fields: {packet_key_0: {tree_node_id, domain_class, ...}, ...},
  expiration: 2026-07-24T12:00:00Z
}

TTL: 1 hour (default) or until invalidation event
```

### Cache Invalidation

Invalidate all keys matching pattern when:

```
event: collection revision changed
  → DELETE atlas:sparse:codebase:v1:*
  
event: sparse model changed (bm42_v1 → bm42_v2)
  → DELETE atlas:sparse:*:bm42-v1:*
  
event: filter changed (payload_filter updated)
  → DELETE atlas:sparse:*:*:filter-{old-hash}:*
  
event: snapshot changed (entities added/removed)
  → DELETE atlas:sparse:*:*:*:*  (full flush)
```

---

## Part 15: Recommended Implementation Order

### Phase 1: Foundational (Unblock Versions)

1. ✅ **Canonical artifact manifest schema** — Define every output with snapshot_id, model_version, hash
2. ✅ **Versioned summaries** — Add `source_content_hash` + `summary_version` to Postgres
3. ✅ **Derived feature table** — Create `atlas_packet_derived_features` in Postgres
4. ⏳ **KMeans assignments versioning** — Add `kmeans_model_version`, `kmeans_snapshot_id`
5. ⏳ **SOM assignments versioning** — Add `som_model_version`, `som_snapshot_id`

### Phase 2: Mirror Synchronization

6. ⏳ **Qdrant payload enrichment** — Include `kmeans_cluster_id`, `som_x`, `som_y`, `community_id`, version fields
7. ⏳ **Centroid cache** — Implement Valkey `centroid:route:*` with model-aware invalidation
8. ⏳ **Bounded Neo4j neighborhood API** — GET `/graph/neighbors/{node_key}?max_hops=2&max_fanout=10`

### Phase 3: Advanced Contracts

9. ⏳ **Go Retrieval inverse lookup** — POST `/v1/resolve/{packet_key}` returns all known representations
10. ⏳ **Hybrid reranker feature contract** — Explicit input vector + scoring formula (not ad-hoc)
11. ⏳ **ACE packet builder** — Assemble from retrieval results + summaries + evidence

### Phase 4: Offline Analytics

12. ⏳ **mmap packet snapshot builder** — Convert 65K packets to single memory-mapped binary file
13. ⏳ **DuckDB evaluation pipeline** — Offline metrics: NDCG@20, MRR, Recall@100, latency
14. ⏳ **Benchmark ANN strategies** — Compare Qdrant HNSW vs. TurboVec vs. cuVS (if applicable)

### Acceptance Gates (Immediate)

```
SUMMARY_HASH_VALIDATION_PROVEN        ← Phase 1
DERIVED_FEATURE_MANIFEST_PROVEN       ← Phase 1
KMEANS_ASSIGNMENTS_VERSIONED          ← Phase 2
SOM_ASSIGNMENTS_VERSIONED             ← Phase 2
CENTROID_CACHE_INVALIDATION_PROVEN    ← Phase 2
QDRANT_PAYLOAD_IDENTITY_PROVEN        ← Phase 2
GRAPH_NEIGHBORHOOD_BOUNDED            ← Phase 3
INVERSE_IDENTITY_LOOKUP_PROVEN        ← Phase 3
ACE_PACKET_PROVEN                     ← Phase 3
MMAP_REPLAY_PROVEN                    ← Phase 4
```

---

## Conclusion: The Core Insight

**The problem is NOT which algorithm to add next.**

**The problem IS: Which artifact is canonical? Which is derived? Which snapshot produced it? Which model version produced it? Which online service may consume it?**

Answer these 5 questions for **every** artifact, and the system becomes:
- **Auditable**: trace any answer back to its sources
- **Reproducible**: replay the same computation on the same inputs
- **Safe**: detect stale data before injection
- **Upgradeable**: deploy a new model without corrupting old results

This document specifies the complete architecture. Implementation in Phase order.
