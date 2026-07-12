# Phase 8.6 Critical Implementation Order — Vector Contracts & Identity Wiring

**Status**: ✅ **VECTOR CONTRACTS COMPLETE** | ⏳ **REMAINING 9 GATES**  
**Date**: July 11, 2026 (Session 137+ Continuation)  
**Priority**: BLOCKING — All subsequent retrieval work depends on these gates  

---

## Executive Summary

The core defect fixed: **`_denseSearch()` now requires explicit `vectorName` parameter with type enforcement and dimension validation BEFORE network calls.**

Remaining critical defects (in order of dependency):

1. ✅ Vector space naming contract (`vectorName` parameter)
2. ⏳ Autoencoder provenance & policy (don't overwrite original embeddings)
3. ⏳ Neo4j PageRank wiring (GDS graph projection + stream validation)
4. ⏳ K-means vs SOM distinction (20 clusters ≠ 20×20 grid)
5. ⏳ Outbox-driven fan-out (prevent Qdrant-ahead-of-Postgres divergence)
6. ⏳ Canonical PostgreSQL identity columns (packet_key, source_ref, feature_id)
7. ⏳ Projection version tracking (rebuild detection & replay)
8. ⏳ Smoke-test matrix (11 gate validation)

---

## 1. ✅ Vector Space Naming Contract (COMPLETE)

**What was fixed**: `_denseSearch()` signature + all 7 callers

**Files modified**:
- `src/lib/server/vector/vector-contracts.ts` (created, 262 lines)
- `src/lib/server/vector/qdrant-manager.ts` (refactored _denseSearch)
- 6 API routes and service files (updated parameters)

**Validation**:
- Type-level: `DenseSearchParams` interface enforces `vectorName: CodebaseVectorName`
- Runtime-level: `assertVectorDimension(vectorName, queryVector)` before Qdrant call
- Legacy support: 768-dim vectors warn in Phase 8.6, error in Phase 9+

**Status**: ✅ READY FOR SMOKE TEST

---

## 2. ⏳ Autoencoder Provenance & Storage Policy

**Current state**: Latent 64-dim vectors may exist but lack provenance tracking.

**Requirements**:
- 384-dim `semantic_embedding` is canonical (NEVER silently overwritten)
- Latent 64-dim computed from 384-dim must store encoder metadata
- Encoder metadata must include: model_id, input/output dims, checkpoint hash, training date, normalization, reconstruction MSE
- Bootstrap with deterministic fixed projection is acceptable BUT must not be labeled "trained"
- Storage must separate encoder config from latent vectors themselves

**Implementation steps**:

```sql
-- 1. Add encoder provenance table
CREATE TABLE encoder_provenance (
  id uuid PRIMARY KEY,
  encoder_id text NOT NULL UNIQUE,
  model_id text NOT NULL,
  input_dimension integer NOT NULL,
  output_dimension integer NOT NULL,
  checkpoint_hash text NOT NULL,
  trained_at timestamptz NOT NULL,
  normalization text NOT NULL,  -- 'l2', 'none', etc.
  reconstruction_mse double precision NOT NULL,
  validation_gates jsonb NOT NULL,  -- { input_dims_valid: bool, ... }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add latent_embedding column to canonical packet table
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS latent_embedding vector(64);
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS encoder_id text REFERENCES encoder_provenance(encoder_id);

-- 3. Index for provenance lookup
CREATE INDEX encoder_provenance_by_encoder_id 
  ON encoder_provenance(encoder_id);
```

**Validation gates** (in order):
1. Input dimension == 384
2. Output dimension == 64
3. All values finite (no NaN/Infinity)
4. Norm distribution check (L2 norm near 1.0)
5. Reconstruction error < 0.05
6. Nearest-neighbor preservation (top-5 neighbors preserved from semantic)
7. Cluster stability (K-means centroids shift < 2%)
8. Version/checkpoint identity (hash matches declared checkpoint)

**Validation query**:
```sql
SELECT 
  ep.encoder_id,
  ep.model_id,
  ep.reconstruction_mse,
  COUNT(*) as vectors_using_encoder,
  AVG(SQRT(POW(latent_embedding, 2))) as avg_l2_norm,
  MIN(SQRT(POW(latent_embedding, 2))) as min_l2_norm,
  MAX(SQRT(POW(latent_embedding, 2))) as max_l2_norm
FROM codebase_chunk_index
JOIN encoder_provenance ep ON codebase_chunk_index.encoder_id = ep.id
GROUP BY ep.encoder_id, ep.model_id, ep.reconstruction_mse;
```

**Do NOT**: Label as "trained autoencoder" unless encoder, decoder, learned weights, and measured reconstruction performance exist. Bootstrap deterministic projection is acceptable but must state this explicitly.

**Status**: ⏳ READY FOR IMPLEMENTATION

---

## 3. ⏳ Neo4j PageRank Wiring (GDS Stream-Validate-Write)

**Current state**: Unknown if PageRank running or results persisted correctly.

**Requirements**:
- Graph projection: CodeSymbol nodes + IMPORTS, CALLS, IMPLEMENTS, REFERENCES edges
- PageRank stream mode first (no side effects, pure validation)
- Validate finite nonnegative scores
- Write only after validation passes
- Mirror results to PostgreSQL by packet_key (never by integer node ID)

**Implementation steps**:

```cypher
-- 1. Project graph (named 'codeTopology')
CALL gds.graph.project(
  'codeTopology',
  'CodeSymbol',
  {
    IMPORTS: { orientation: 'NATURAL' },
    CALLS: { orientation: 'NATURAL' },
    IMPLEMENTS: { orientation: 'NATURAL' },
    REFERENCES: { orientation: 'NATURAL' }
  }
);

-- 2. Stream PageRank (validation only, no writes)
CALL gds.pageRank.stream(
  'codeTopology',
  {
    dampingFactor: 0.85,
    maxIterations: 20,
    tolerance: 0.0000001
  }
)
YIELD nodeId, score
WITH gds.util.asNode(nodeId) as node, score
RETURN
  node.packet_key AS packetKey,
  node.source_ref AS sourceRef,
  score,
  CASE WHEN score < 0 THEN 'ERROR: negative score'
       WHEN NOT (score > 0 AND score < 1000) THEN 'ERROR: out of range'
       ELSE 'OK' END AS validation_status
ORDER BY score DESC
LIMIT 50;

-- 3. Verify validation (should return zero ERROR rows)
-- If validation passes:

-- 4. Write to Neo4j
CALL gds.pageRank.write(
  'codeTopology',
  {
    writeProperty: 'pageRank',
    dampingFactor: 0.85,
    maxIterations: 20
  }
)
YIELD nodePropertiesWritten, ranIterations;

-- 5. Mirror to PostgreSQL (via outbox or direct insert)
MATCH (n:CodeSymbol) WHERE n.pageRank IS NOT NULL
WITH n.packet_key as packetKey, n.pageRank as score
UNWIND COLLECT({packetKey: packetKey, score: score}) AS results
-- Pass to TypeScript for PostgreSQL insert by packet_key
```

**PostgreSQL mirror**:
```sql
UPDATE codebase_chunk_index
SET pagerank_score = $1,
    pagerank_updated_at = now()
WHERE packet_key = $2;
```

**Validation gates**:
1. Graph projects successfully (node count within 10% of canonical)
2. PageRank stream produces scores
3. All scores are finite and >= 0
4. No NaN or Infinity values
5. Score range is reasonable (typically 0.15–5.0 for reciprocal-normalized)

**Status**: ⏳ READY FOR IMPLEMENTATION

---

## 4. ⏳ K-means vs SOM Distinction

**Current state**: May be conflating 20 K-means clusters with 20×20 SOM grid.

**Requirements**:
- K-means: 20 clusters based on topologyEmbedding (128-dim)
- SOM: 20×20 grid (400 addressable cells) with row/col coordinates
- Separate database columns: `kmeans_cluster`, `som_row`, `som_col`, `som_index`
- SOM index formula: `som_index = row * 20 + col` (deterministic)

**Schema**:
```sql
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS kmeans_cluster smallint,  -- 0–19
  ADD COLUMN IF NOT EXISTS som_row smallint,         -- 0–19
  ADD COLUMN IF NOT EXISTS som_col smallint,         -- 0–19
  ADD COLUMN IF NOT EXISTS som_index smallint;       -- 0–399

CREATE INDEX kmeans_cluster_idx ON codebase_chunk_index(kmeans_cluster);
CREATE INDEX som_index_idx ON codebase_chunk_index(som_index);
```

**K-means via Neo4j GDS**:
```cypher
CALL gds.graph.project(
  'codeFeatureGraph',
  {
    CodeSymbol: {
      properties: ['topologyEmbedding']
    }
  },
  '*'
);

CALL gds.kmeans.stream(
  'codeFeatureGraph',
  {
    nodeProperty: 'topologyEmbedding',
    k: 20,
    randomSeed: 42
  }
)
YIELD nodeId, communityId, distanceFromCentroid
RETURN
  gds.util.asNode(nodeId).packet_key AS packetKey,
  communityId AS kmeansCluster,
  distanceFromCentroid;
```

**SOM**: (separate implementation, distinct from K-means)

**Interpretation**:
- K-means: Coarse 20-cluster feature partition
- SOM: Fine-grained 400-cell topological map
- Leiden/Louvain: Graph-community structure
- PageRank: Node authority/importance
- HNSW/Qdrant: Nearest-neighbor retrieval

**Status**: ⏳ READY FOR IMPLEMENTATION

---

## 5. ⏳ Outbox-Driven Fan-Out (Prevent Divergence)

**Current state**: Unknown if fan-out is ordered correctly (Postgres ahead of Qdrant = divergence).

**Requirements**:
- Canonical AST facts → Postgres transaction (upsert + insert outbox event)
- Commit BEFORE any mirror writes
- Workers consume outbox events asynchronously
- Mirrors (Qdrant, Neo4j, Valkey) updated in parallel per event
- No mirror write succeeds without outbox event in Postgres

**Schema**:
```sql
CREATE TABLE projection_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,  -- 'codebase_chunk', 'atlas_packet', etc.
  aggregate_key text NOT NULL,   -- packet_key or source_ref
  event_type text NOT NULL,      -- 'created', 'updated', 'deleted'
  payload jsonb NOT NULL,        -- Full event data
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX projection_outbox_pending_idx
  ON projection_outbox(created_at)
  WHERE completed_at IS NULL;

CREATE INDEX projection_outbox_claimed_idx
  ON projection_outbox(claimed_at)
  WHERE claimed_at IS NOT NULL AND completed_at IS NULL;
```

**Transaction in TypeScript**:
```typescript
async function persistCanonicalAndEmitEvent(packet: CanonicalPacket) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Upsert canonical row
    await db.upsert(client, 'codebase_chunk_index', {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      content_embedding: packet.embedding,
      ...
    });

    // 2. Insert outbox event (same transaction)
    await db.insert(client, 'projection_outbox', {
      id: crypto.randomUUID(),
      aggregate_type: 'codebase_chunk',
      aggregate_key: packet.packet_key,
      event_type: 'updated',
      payload: packet,
      created_at: new Date()
    });

    // 3. Commit atomically
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
```

**Worker consumes outbox**:
```typescript
async function processOutboxEvent(event: ProjectionOutboxEvent) {
  const packet = event.payload;

  try {
    // All mirrors updated in parallel
    await Promise.all([
      qdrantManager.upsertPoint(packet),  // Qdrant semantic + topology + latent
      neo4jClient.upsertNode(packet),     // Neo4j CodeSymbol node
      valkey.setPacketCache(packet),      // Valkey BitFrost cache
    ]);

    // Mark complete AFTER all mirrors succeed
    await db.update('projection_outbox', event.id, {
      completed_at: new Date(),
      attempts: event.attempts + 1
    });
  } catch (err) {
    // Retry logic
    if (event.attempts < 3) {
      await db.update('projection_outbox', event.id, {
        claimed_at: null,  // Release for retry
        attempts: event.attempts + 1,
        last_error: err.message
      });
    } else {
      // Dead-letter (manual inspection needed)
      await db.update('projection_outbox', event.id, {
        completed_at: new Date(),
        last_error: `FAILED after ${event.attempts} attempts: ${err.message}`
      });
    }
  }
}
```

**Prevents**: Qdrant updated, Postgres failed, Neo4j partially updated, cache stale.

**Status**: ⏳ READY FOR IMPLEMENTATION

---

## 6. ⏳ Canonical PostgreSQL Identity Columns

**Current state**: Unknown if all identity columns present and consistently populated.

**Requirements**:
- `packet_key` — canonical unique identifier (immutable)
- `source_ref` — source file reference (directory_path + file_path)
- `feature_id` — semantic feature namespace (e.g., 'auth.sessions')
- `content_hash` — SHA-256 of content (detect duplicates/changes)
- All three required for any Qdrant/Neo4j mirror operation

**Schema additions**:
```sql
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS packet_key text NOT NULL UNIQUE,
  ADD COLUMN IF NOT EXISTS source_ref text NOT NULL,
  ADD COLUMN IF NOT EXISTS feature_id text,
  ADD COLUMN IF NOT EXISTS content_hash text NOT NULL,
  ADD COLUMN IF NOT EXISTS projection_version smallint NOT NULL DEFAULT 0;

CREATE INDEX packet_key_idx ON codebase_chunk_index(packet_key);
CREATE INDEX source_ref_idx ON codebase_chunk_index(source_ref);
CREATE INDEX feature_id_idx ON codebase_chunk_index(feature_id);
CREATE INDEX content_hash_idx ON codebase_chunk_index(content_hash);
```

**Validation query**:
```sql
SELECT 
  COUNT(*) as total_rows,
  COUNT(packet_key) as with_packet_key,
  COUNT(source_ref) as with_source_ref,
  COUNT(feature_id) as with_feature_id,
  COUNT(content_hash) as with_content_hash,
  COUNT(DISTINCT packet_key) as unique_packet_keys
FROM codebase_chunk_index;
-- Expected: all counts equal (100% coverage)
```

**Status**: ⏳ READY FOR SCHEMA MIGRATION

---

## 7. ⏳ Projection Version Tracking & Rebuild Detection

**Current state**: No version tracking for rebuilds or replay detection.

**Requirements**:
- `projection_version` column on all canonical rows
- Increment on each successful projection (PageRank, K-means, SOM, etc.)
- Enables rebuild detection and replay
- Supports A/B testing of different projection strategies

**Schema**:
```sql
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS projection_version smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS projection_updated_at timestamptz;

-- Increment on projection update
CREATE OR REPLACE FUNCTION increment_projection_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.projection_version := NEW.projection_version + 1;
  NEW.projection_updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projection_version_trigger
BEFORE UPDATE ON codebase_chunk_index
  FOR EACH ROW
  WHEN (OLD.pagerank_score IS DISTINCT FROM NEW.pagerank_score
     OR OLD.kmeans_cluster IS DISTINCT FROM NEW.kmeans_cluster
     OR OLD.som_index IS DISTINCT FROM NEW.som_index)
  EXECUTE FUNCTION increment_projection_version();
```

**Rebuild detection**:
```sql
SELECT 
  COUNT(*) as total_chunks,
  MAX(projection_version) as latest_version,
  COUNT(CASE WHEN projection_version < 3 THEN 1 END) as stale_chunks
FROM codebase_chunk_index;
```

**Replay (delete one mirror, reproject)**:
```sql
-- 1. Delete from Neo4j
MATCH (n:CodeSymbol {packet_key: $1}) DETACH DELETE n;

-- 2. Delete outbox events for this packet
DELETE FROM projection_outbox WHERE aggregate_key = $1;

-- 3. Decrement projection_version and re-emit outbox event
UPDATE codebase_chunk_index
SET projection_version = projection_version - 1
WHERE packet_key = $1;

INSERT INTO projection_outbox (...)
SELECT ... FROM codebase_chunk_index WHERE packet_key = $1;
```

**Status**: ⏳ READY FOR IMPLEMENTATION

---

## 8. ⏳ Minimum Smoke-Test Matrix (11 Gates)

**Purpose**: Validate all core contracts before reranker optimization.

### QDRANT-01: Explicit vector name + correct dimension
```bash
curl -X POST http://localhost:5173/api/retrieval/test-vector \
  -H "Content-Type: application/json" \
  -d '{
    "vectorName": "semantic_embedding",
    "vector": [0.1, 0.2, ...],  // 384 values
    "collection": "codebase_chunks_768"
  }'
# Expected: HTTP 200, at least one hit
```

### QDRANT-02: Wrong dimension rejection
```bash
# 384-dim vector for topology_embedding (expects 128)
curl -X POST http://localhost:5173/api/retrieval/test-vector \
  -H "Content-Type: application/json" \
  -d '{
    "vectorName": "topology_embedding",
    "vector": [0.1, 0.2, ...],  // 384 values (WRONG)
    "collection": "codebase_chunks_768"
  }'
# Expected: HTTP 400, "Vector dimension mismatch before network call"
```

### QDRANT-03: Baseline search (no filter, no threshold)
```bash
curl -X POST http://localhost:5173/api/retrieval/test-vector \
  -H "Content-Type: application/json" \
  -d '{
    "vectorName": "semantic_embedding",
    "vector": [...],  // 384 values
    "collection": "codebase_chunks_768"
  }'
# Expected: HTTP 200, >=10 results with default threshold
```

### QDRANT-04: Payload filter narrows results
```bash
# Same query, add filter
curl -X POST http://localhost:5173/api/retrieval/test-vector \
  -d '{...,"filter":{"kind":"function"}}'
# Expected: HTTP 200, fewer results than baseline
```

### POSTGRES-01: AST JSONB GIN query
```sql
SELECT COUNT(*) FROM codebase_chunk_index
WHERE tree_node_ids @> '{"kind":"function"}';
-- Expected: Query plan shows GIN index, <100ms on 40K rows
EXPLAIN ANALYZE ...;
```

### PGVECTOR-01: 384-dim cosine query
```sql
SELECT packet_key, content_embedding <=> $1::vector(384) as distance
FROM codebase_chunk_index
WHERE content_embedding IS NOT NULL
ORDER BY distance
LIMIT 10;
-- Expected: Returns top-10 by packet_key, <50ms
```

### IDENTITY-01: Same packet_key across stores
```
Postgres: SELECT packet_key FROM codebase_chunk_index LIMIT 1;
Qdrant:   GET /collections/codebase_chunks_768/points/{id}
Neo4j:    MATCH (n:CodeSymbol) RETURN n.packet_key LIMIT 1;
Valkey:   GET bitfrost:packet:{packet_key}
# Expected: All four return identical packet_key
```

### NEO4J-01: Graph projection node count
```cypher
CALL gds.graph.stats('codeTopology') YIELD nodeCount, relationshipCount;
# Expected: nodeCount within 10% of canonical row count (40K±5K)
```

### PAGERANK-01: Stream before write
```cypher
CALL gds.pageRank.stream('codeTopology', {...})
YIELD nodeId, score
RETURN COUNT(*) as scoreCount, MIN(score) as minScore, MAX(score) as maxScore;
# Expected: All scores finite and >=0, no NaN/Infinity
```

### KMEANS-01: topologyEmbedding coverage
```sql
SELECT 
  COUNT(*) as total,
  COUNT(kmeans_cluster) as with_cluster,
  100.0 * COUNT(kmeans_cluster) / COUNT(*) as coverage_pct
FROM codebase_chunk_index;
# Expected: coverage_pct >= 95%
```

### SOM-01: Grid coordinates valid
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN som_row BETWEEN 0 AND 19 THEN 1 END) as valid_rows,
  COUNT(CASE WHEN som_col BETWEEN 0 AND 19 THEN 1 END) as valid_cols,
  COUNT(CASE WHEN som_index = som_row * 20 + som_col THEN 1 END) as valid_index
FROM codebase_chunk_index;
# Expected: All counts equal (100% valid)
```

### REBUILD-01: Delete + replay
```
1. DELETE FROM neo4j WHERE packet_key='test-packet'
2. DELETE FROM projection_outbox WHERE aggregate_key='test-packet'
3. UPDATE codebase_chunk_index SET projection_version = projection_version - 1 WHERE packet_key='test-packet'
4. Re-emit outbox event
5. Worker processes event
6. Verify Neo4j node recreated with identical data
# Expected: Packet_key+projection_version consistency verified
```

**Status**: ⏳ READY FOR EXECUTION

---

## Immediate Implementation Priority

**1. (Done)** ✅ Vector space naming + _denseSearch refactor
**2. (Next)** ⏳ Add PostgreSQL identity columns (packet_key, source_ref, feature_id, content_hash)
**3. (Next)** ⏳ Add projection_version tracking
**4. (Next)** ⏳ Create projection_outbox table + fan-out logic
**5. (Next)** ⏳ Wire Neo4j PageRank (stream → validate → write)
**6. (Next)** ⏳ Separate K-means cluster / SOM grid columns
**7. (Next)** ⏳ Add encoder provenance table + latent storage policy
**8. (Next)** ⏳ Run smoke-test matrix (11 gates)
**9. (Next)** ⏳ Fix any gaps, then optimize reranker

---

## Commands to Run in VS Code (Windows Terminal)

**From**: `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`

```powershell
# Find vector contracts usage
rg -n "buildVectorPayload|vectorName|semantic_embedding|topology_embedding|latent_embedding" src scripts tests

# Find _denseSearch callers
rg -n "_denseSearch\(|hybridSearch\(|sectionFilteredSearch\(" src tests

# Find Qdrant collection declarations
rg -n "createCollection|vectors:|summary_embeddinggemma|content_embedding" src scripts

# Find PostgreSQL vector definitions
rg -n "vector\(|jsonb|codebase_chunk_index|atlas_packets" src drizzle migrations scripts

# Find Neo4j/SOM code
rg -n "pageRank|pagerank|gds\.|kmeans|KMeans|som_row|som_col|som_index|20.*20" src scripts tests

# Check identity columns
rg -n "packet_key|source_ref|feature_id|content_hash" src scripts

# Check projection version
rg -n "projection_version" src scripts

# Check outbox logic
rg -n "projection_outbox" src scripts
```

---

## Status Summary

| Gate | Status | Impact |
|------|--------|--------|
| 1. Vector contracts | ✅ COMPLETE | Type-safe vector space declaration |
| 2. Autoencoder provenance | ⏳ BLOCKED | Prevents latent vector validation |
| 3. Neo4j PageRank | ⏳ BLOCKED | Graph authority unavailable |
| 4. K-means vs SOM | ⏳ BLOCKED | Cluster/topology confusion |
| 5. Outbox fan-out | ⏳ BLOCKED | Mirror divergence risk |
| 6. Identity columns | ⏳ BLOCKED | Packet_key consistency |
| 7. Projection version | ⏳ BLOCKED | Rebuild detection |
| 8. Smoke-test matrix | ⏳ BLOCKED | Validation framework |

**Current blocker**: All 7 remaining gates must be implemented sequentially. Gates 2–7 are interdependent (identity → version → outbox → provenance).

**Recommended next session**: Implement gates 2–7 in order (1–2 hours per gate, ~8 hours total). Then run smoke-test matrix to validate entire stack before reranker optimization.

---

**Generated**: July 11, 2026 (Session 137+ Continuation)  
**Authority**: User's architectural guidance (points 2–10)  
**Next Review**: After smoke-test matrix passes (expected Session 138+)
