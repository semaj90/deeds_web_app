# Service Dependency DAG — Canonical Execution Flow

**Date**: 2026-06-25  
**Generated from**: Live docker-compose.yml + running services + PostgreSQL introspection  
**Authority**: This DAG is derived from actual running behavior, NOT configuration inferred from compose files.

---

## I. Central Entity: `atlas_packet_registry`

### Schema (43 columns)
```sql
CREATE TABLE atlas_packet_registry (
  -- Identity Chain (immutable)
  packet_key TEXT PRIMARY KEY,
  trace_id TEXT,                    -- End-to-end audit chain
  source_ref TEXT NOT NULL,         -- src/lib/server/db/client.ts:42
  file_path TEXT NOT NULL,          -- Relative path in repo
  feature_id TEXT NOT NULL,         -- auth.sessions | db.schema | etc
  
  -- Content
  title TEXT,
  summary TEXT,
  
  -- Embeddings & Vectors (L1)
  embedding_status TEXT DEFAULT 'missing',  -- missing|pending|complete|failed
  embedding_dim INTEGER DEFAULT 768,
  embedding_768d VECTOR(768),       -- embeddinggemma:latest (Qdrant L3)
  latent_384d VECTOR(384),          -- AE intermediate (optional)
  latent_64 BYTEA,                  -- AE final (768→64, P6)
  
  -- Routing (L2)
  kmeans_cluster_id TEXT,
  som_x INTEGER,                    -- SOM grid X (0-19)
  som_y INTEGER,                    -- SOM grid Y (0-19)
  semantic_z REAL,                  -- Latent Z-score normalization
  activity_w REAL,                  -- Temporal decay weight
  manifold4 JSONB,                  -- 4D manifold coords {x,y,z,w}
  
  -- Cross-Store References (L3)
  qdrant_point_id BIGINT UNIQUE,    -- Qdrant codebase_chunks_768 collection
  turbovec_id TEXT UNIQUE,          -- TurboVec HNSW index (P2)
  neo4j_node_id TEXT UNIQUE,        -- Neo4j :Packet node
  valkey_cache_key TEXT UNIQUE,     -- Redis L1 exact-match key
  ace_cache_key TEXT UNIQUE,        -- Bifrost L2 semantic cache key
  seaweedfs_filer_path TEXT UNIQUE, -- Cold storage S3/SeaweedFS path
  
  -- Scoring (P4 computed, immutable per version)
  pagerank_score REAL,              -- SOM grid PageRank (0.0-1.0)
  authority_blend REAL,             -- 0.40·PR + 0.30·ATT + 0.20·FREQ + 0.10·PROV
  karpathy_score REAL,              -- Alias for authority_blend
  last_rerank_score REAL,           -- Most recent retrieval rerank
  
  -- Retrieval Metrics (cumulative, writable by ACE/KAG/DAG)
  retrieval_count INTEGER DEFAULT 0,      -- Total times retrieved
  cache_hits INTEGER DEFAULT 0,           -- L1/L2 cache hits
  cache_misses INTEGER DEFAULT 0,         -- Cache misses (disk fetch)
  last_retrieved TIMESTAMP,               -- Last ACE query hit
  cache_state TEXT DEFAULT 'cold',        -- L1:redis|L2:bifrost|L3:qdrant|L4:disk|cold
  
  -- Graph Edges (writable by graph services)
  activity JSONB,                   -- Activity log: {timestamp, operation, user_id, ...}
  kag_edges JSONB DEFAULT '{}',     -- KAG neighbor edges: {neighbor_packet_key: {relation, score}}
  dag_edges JSONB DEFAULT '{}',     -- DAG dependency edges: {upstream_packet_key: {type, order}}
  
  -- Metadata
  total_size_bytes BIGINT,
  status TEXT DEFAULT 'active',     -- active|archived|staged|error
  validation_status TEXT,           -- valid|needs_review|corrupted
  last_validated TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  CHECK (cache_state IN ('L1:redis', 'L2:bifrost', 'L3:qdrant', 'L4:disk', 'cold')),
  CHECK (embedding_status IN ('missing', 'pending', 'complete', 'failed')),
  CHECK (status IN ('active', 'archived', 'staged', 'error')),
  CHECK (validation_status IN ('valid', 'needs_review', 'corrupted')),
  
  -- Indexes
  HNSW (embedding_768d vector_cosine_ops),  -- Semantic search
  BTREE (authority_blend DESC NULLS LAST),  -- Ranking
  BTREE (last_retrieved DESC NULLS LAST),   -- Recency
  GIN (kag_edges),                          -- Neighbor lookup
  GIN (dag_edges),                          -- Dependency lookup
  GIN (activity)                            -- Audit trail search
);
```

**Current state**: 0 rows (newly created table; backfill pending from atlas_packets)  
**Design**: Replace the scattered design (atlas_packets + atlas_higher_hop_index + ace_retrieval_runs + ...) with ONE canonical source.

---

## II. Service Dependency Graph

### Execution Flow (Canonical Real Order)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STARTUP SEQUENCE (Serial)                           │
└─────────────────────────────────────────────────────────────────────────────┘

1. POSTGRES INIT (5 min)
   └─ schema-postgres.ts (Drizzle migrations)
   └─ All 180+ tables created, indexes built
   └─ atlas_packets (18,046 rows)
   └─ atlas_packet_registry (0 rows → ready for backfill)

2. REDIS WARMUP (1 min)
   └─ ioredis client connects
   └─ Bifrost semantic cache probe (optional, non-blocking)
   └─ SOM cell Karpathy scores loaded into hashes (P4 computed)

3. QDRANT COLLECTION SETUP (2 min)
   └─ codebase_chunks_768 (52,637 points, multi-vector)
   └─ Payload schema reconciliation
   └─ HNSW indexes rebuilt

4. NEO4J GRAPH INIT (3 min)
   └─ SOMCell (400 nodes), Packet (8,804 nodes), Feature, Community
   └─ SIMILAR_TOPOLOGY edges (12,944, non-SOM)
   └─ GDS graph projection created (for PageRank precomputation)

5. OLLAMA & LLAMA-SERVER START (parallel, 2-5 min)
   └─ embeddinggemma:latest loads (768-dim)
   └─ gemma4-legal-iq4xs-direct.gguf loads (TurboQuant)
   └─ Health probes pass

6. ACE CONTEXT ASSEMBLER INIT (10 sec)
   └─ Loads Karpathy scores from Redis
   └─ Stage A0: SOM grid routing matrix ready
   └─ Stage A1: GPU reranker (LibTorch) available

┌─────────────────────────────────────────────────────────────────────────────┐
│                    QUERY/RETRIEVAL PIPELINE (Per Query)                    │
└─────────────────────────────────────────────────────────────────────────────┘

INPUT: User query (natural language)
  │
  ├─→ [Query Router] Decides: local ONNX vs server inference
  │   └─ Local (simple queries) → client-side gemma270m (WebGPU/WASM)
  │   └─ Server (complex) → proceeds to Lane Selection
  │
  ├─→ [ACE Stage A0: Routing Matrix] — 4×6 decision grid
  │   ├─ Input: (domain, retrieval_type, confidence_gate, cache_lane)
  │   ├─ Hard rules: semantic → dense (Qdrant), ontology → sparse (Neo4j), etc.
  │   └─ Route to ONE of 6 lanes (below)
  │
  ├─→ LANE 1: L1 Redis Exact-Match (5ms)
  │   └─ Key: SHA-256(model + messages + temp + maxTokens)
  │   └─ Hit → return cached response immediately
  │   └─ Miss → proceed to Lane 2
  │
  ├─→ LANE 2: L2 Bifrost Semantic Cache (2-5s)
  │   └─ Query embed: embeddinggemma → 768-dim
  │   └─ Qdrant search (0.8 similarity threshold)
  │   └─ Hit → return cached response
  │   └─ Miss → proceed to Lane 3
  │
  ├─→ LANE 3: Qdrant Dense Retrieval (3-8s)
  │   ├─ Qdrant search: codebase_chunks_768 HNSW
  │   ├─ Stage A0.5: SOM prefilter (optional)
  │   │   └─ If som_x, som_y in query → filter by neighborhood
  │   ├─ Retrieve top-K (default 50)
  │   ├─ Stage A1: GPU reranker (LibTorch cosine similarity)
  │   │   └─ Query embed × chunk embeddings → cosine scores
  │   │   └─ Keep top-10 re-ranked
  │   └─ Result → atlas_packets join via qdrant_point_id
  │
  ├─→ LANE 4: Neo4j Graph Traversal (bounded k-hop, 2-10s)
  │   ├─ Start: Packet node matching query
  │   ├─ Traverse: USED_CONCEPT, SIMILAR_TOPOLOGY edges
  │   ├─ Bounded: max_depth=3, max_fans=20 (safety limit)
  │   ├─ Community filter (if kag_edges in query context)
  │   └─ Result → Neo4j node IDs → atlas_packet_registry.neo4j_node_id join
  │
  ├─→ LANE 5: Redis BitFrost Cache (1-2s)
  │   ├─ Key: atlas:packet:{packet_key}
  │   ├─ Hit → return memoized Karpathy score + metadata
  │   └─ Miss → compute on-the-fly
  │
  └─→ LANE 6: Fallback to Ollama Direct Inference (25-60s)
      ├─ No cache hit
      ├─ No retrieval result
      ├─ Run raw LLM on query only
      └─ Store result in L1 Redis for next identical query
  
  [ACE Stage A2: Fusion & Reranking]
  ├─ Combine results from all attempted lanes
  ├─ Consensus scoring (authority_blend, cache_state, retrieval_count)
  ├─ Remove duplicates (packet_key dedup)
  └─ Rank by Karpathy score (authority_blend)
  
  [ACE Stage A3: Context Assembly]
  ├─ Build prompt preamble: "{retrieval_context}\n\nQuery: {user_query}"
  ├─ Context includes: packet.summary, kag_edges, dag_edges as structured markdown
  └─ Inject top-5 Karpathy-ranked packets into system prompt
  
  [LLM Generation]
  ├─ Input: system prompt + assembled context + user query
  ├─ Model: gemma4-legal-iq4xs-direct.gguf (TurboQuant, 25s baseline)
  │   or llama-server TurboQuant (if cache_prompt hit)
  │   or Ollama fallback
  └─ Output: LLM response (legally-grounded answer)
  
  [Metrics Update] — Written back to atlas_packet_registry
  ├─ For each retrieved packet:
  │   ├─ retrieval_count += 1
  │   ├─ cache_hits += 1 (if cache state was L1/L2)
  │   ├─ cache_misses += 1 (if from L3/L4/disk)
  │   ├─ last_retrieved = now()
  │   └─ cache_state = 'L1:redis' (promote to L1 after retrieval)
  └─ Idempotency: use UPSERT (INSERT ... ON CONFLICT DO UPDATE)

OUTPUT: Response to user (via SSE streaming)

┌─────────────────────────────────────────────────────────────────────────────┐
│                  BACKGROUND PIPELINES (Daily/Continuous)                   │
└─────────────────────────────────────────────────────────────────────────────┘

LANE A: Identity Synchronization (Daily, 5 min)
  ├─ atlas_packets → atlas_packet_registry
  │  └─ Backfill: copy packet_key, source_ref, file_path, feature_id, summary
  │  └─ Idempotency: use packet_key as merge key
  ├─ Qdrant → atlas_packet_registry.qdrant_point_id
  │  └─ Join via packet_key payload
  ├─ Neo4j → atlas_packet_registry.neo4j_node_id
  │  └─ Join via source_ref matching
  └─ Redis → atlas_packet_registry.valkey_cache_key
     └─ Set to 'atlas:packet:{packet_key}'

LANE B: Embedding Pipeline (Per new packet)
  ├─ Trigger: INSERT into atlas_packets
  ├─ Kafka topic: document.embed
  │  └─ gRPC → Ollama /api/embeddings → embeddinggemma (768-dim)
  ├─ Store:
  │  └─ Postgres: atlas_packet_registry.embedding_768d
  │  └─ Qdrant: insert into codebase_chunks_768 collection
  │  └─ Redis: cache at 'embed:cache:{b64(text)}'
  └─ Status: embedding_status = 'complete' | 'failed'

LANE C: Karpathy Authority Scoring (Daily, 20 min)
  ├─ Phase 1: Neo4j PageRank on SOM grid
  │  └─ compute-p4-pagerank.mjs (40 sec) → atlas_som_cell_scores
  ├─ Phase 2: GPU Attention (query-specific, 10 sec)
  │  └─ compute-p4-attention-scores.mjs → atlas_som_cell_attention_scores
  ├─ Phase 3: Blend Karpathy (0.4·PR + 0.3·ATT + 0.2·FREQ + 0.1·PROV)
  │  └─ compute-p4-karpathy-blend.mjs → atlas_som_cell_karpathy_scores
  ├─ Store:
  │  └─ Postgres: atlas_packet_registry.karpathy_score
  │  └─ Redis: hset('atlas:karpathy:som:scores', cluster_id, score)
  └─ Cache TTL: 24 hours

LANE D: Cache Warmup (Hourly, 2 min)
  ├─ Redis hit rate < 50%?
  │  └─ Load top-100 Karpathy packets into L1 Redis
  │  └─ Key: atlas:packet:{packet_key}
  │  └─ Value: {packet_key, summary, authority_blend, cache_state}
  │  └─ TTL: 1 hour
  └─ Bifrost probe: Qdrant search latency > 5s?
     └─ Pre-warm semantic cache with common queries

LANE E: Cold Storage Archival (Weekly, 10 min)
  ├─ packets.retrieval_count < 1 in last 30 days?
  │  └─ Mark: status = 'archived'
  │  └─ Copy to SeaweedFS: seaweedfs_filer_path = '/archive/{date}/{packet_key}'
  │  └─ Cache state: 'L4:disk'
  ├─ Restore on demand:
  │  └─ If cache_state = 'L4:disk' AND queried
  │  └─ Restore to Redis L1 + Qdrant L3
  │  └─ Set cache_state = 'L1:redis'
  └─ Idempotency: use seaweedfs_filer_path as restore key

LANE F: ACE Context Cache Invalidation (Per config change, on-demand)
  ├─ Trigger: config.ace_pipeline_version incremented
  ├─ Action: DELETE FROM ace_context_cache
  │  └─ All cached contexts stale until rebuilt
  ├─ Rebuild: Next query rebuilds via Stage A3
  └─ Example: ontology_label backfill → increment version → invalidate

LANE G: Audit Trail & Tracing (Continuous, non-blocking)
  ├─ RabbitMQ topic: analytics.track
  ├─ Per-packet event:
  │  ├─ packet_key, trace_id, operation (retrieve|cache_hit|rerank)
  │  ├─ timestamp, user_id, query_hash
  │  └─ duration_ms, cache_state_before, cache_state_after
  ├─ Store:
  │  └─ DuckDB: analytics.db (offline, read-only)
  │  └─ Postgres: atlas_packet_registry.activity (JSONB append)
  └─ Retention: 90 days

┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONCURRENCY & RACES                              │
└─────────────────────────────────────────────────────────────────────────────┘

### Race 1: Simultaneous Embeddings
**Scenario**: Two queries both need embedding for same document.

```
Thread A: SELECT * FROM atlas_packets WHERE id = 123
          embedding_status = 'missing' → emit Kafka event
          
Thread B: (meanwhile) SELECT * FROM atlas_packets WHERE id = 123
          embedding_status = 'missing' → emit Kafka event

Result: Two Ollama API calls in parallel
```

**Prevention**: 
```sql
UPDATE atlas_packet_registry 
SET embedding_status = 'pending'
WHERE packet_key = 'auth:001' 
  AND embedding_status = 'missing'
RETURNING packet_key;
-- CAS pattern: only one thread succeeds
```

### Race 2: Cache State Promotion
**Scenario**: Packet at L4:disk retrieved twice simultaneously.

```
Query A: cache_state = 'L4:disk' → fetch from SeaweedFS → set L1:redis
Query B: (meanwhile) cache_state = 'L4:disk' → fetch from SeaweedFS → set L1:redis
```

**Prevention**:
```sql
UPDATE atlas_packet_registry
SET cache_state = 'L1:redis', last_retrieved = now()
WHERE packet_key = 'auth:001' 
  AND cache_state = 'L4:disk'
RETURNING cache_state;
-- Only one wins the race; other sees L1:redis on retry
```

### Race 3: Karpathy Score Computation
**Scenario**: Daily pipeline computes scores while ACE uses them.

```
compute-p4-karpathy-blend.mjs: 
  TRUNCATE atlas_som_cell_karpathy_scores
  INSERT INTO ... (400 new rows)
  
Meanwhile:
  ACE Stage A2: SELECT * FROM atlas_som_cell_karpathy_scores
  → Gets partial results or stale data
```

**Prevention**:
```sql
-- Atomic swap with version
BEGIN;
CREATE TEMP TABLE new_scores AS (/* compute phase 1-3 */);
DELETE FROM atlas_som_cell_karpathy_scores;
INSERT INTO atlas_som_cell_karpathy_scores SELECT * FROM new_scores;
UPDATE config SET karpathy_version = karpathy_version + 1;
COMMIT;

-- ACE checks version before use
SELECT karpathy_version INTO v1 FROM config;
SELECT * FROM atlas_som_cell_karpathy_scores; -- Use immutable snapshot
SELECT karpathy_version INTO v2 FROM config;
IF v1 != v2 THEN RETRY; END IF;
```

### Race 4: Neo4j Edge Creation during Graph Traversal
**Scenario**: KAG creates edges while DAG reads them.

```
KAG Lane 4: MATCH (a)-[USED_CONCEPT]->(b) RETURN ... 
Neo4j mutation: CREATE (c)-[USED_CONCEPT]->(d)
```

**Prevention**:
```
Neo4j: Use explicit versioning
  MATCH (n:Packet) SET n.kag_version = transaction.id()
  Only traverse packets where kag_version <= known_safe_version
  
or: Accept eventual consistency
  Query sees either old or new edges, but atomically
  (Neo4j's ACID guarantees this)
```

### Race 5: Bifrost Cache Coherency
**Scenario**: L2 semantic cache stale while L3 Qdrant updated.

```
Bifrost L2 cache entry: {query: "legal risk", result: [top-5 old]}
Qdrant L3 update: New high-authority packet inserted into codebase_chunks_768

Query: Should see new packet, but Bifrost hits cached old result
```

**Prevention**:
```
Set L2 cache TTL < Qdrant update frequency
  Bifrost TTL: 5 minutes
  Qdrant bulk updates: Daily
  → Cache valid within 5min of daily update
  
or: Explicit invalidation
  On Qdrant point insert/update:
    PUBLISH bifrost:invalidate {query_hash: ...}
  Bifrost subscribers evict matching cache entries
```

---

## III. Idempotency Matrix

| Operation | Key | Idempotency | Retry Behavior | Example |
|-----------|-----|------------|-----------------|---------|
| **Embedding** | packet_key | ✅ CAS: embedding_status='missing'→'pending' | Retry if status='pending' after 30s | `atlas_packets.embedding_768d` |
| **Backfill** | packet_key | ✅ INSERT...ON CONFLICT DO UPDATE | Repeat same INSERT, zero dupes | `atlas_packet_registry ← atlas_packets` |
| **Karpathy** | som_cluster | ✅ Truncate + insert in transaction | Entire operation atomic or zero | `atlas_som_cell_karpathy_scores` |
| **Cache promote** | packet_key | ✅ CAS: cache_state (old)→(new) | Retry if CAS fails | `cache_state='L4:disk'→'L1:redis'` |
| **Metrics += 1** | packet_key | ⚠️ UPDATE retrieval_count += 1 | Non-idempotent; guard with trace_id | `retrieval_count`, `cache_hits` |
| **Archive** | packet_key | ✅ Mark status='archived' + S3 path | Idempotent if S3 key = packet_key | `seaweedfs_filer_path`, `status` |
| **Neo4j edge** | source, target | ✅ MERGE (not CREATE) | Repeat MERGE, zero duplicate edges | `(Packet)-[USED_CONCEPT]->(Feature)` |
| **Redis hset** | key, field | ✅ Overwrite OK | Repeat hset, idempotent | `atlas:karpathy:som:scores` |

---

## IV. Orphaned / Invalid Operations

### Orphan 1: qdrant_point_id Absent
**Condition**: `atlas_packet_registry.qdrant_point_id IS NULL`

**Root Cause**: Packet created in Postgres but embedding pipeline failed or was skipped.

**Detection**:
```sql
SELECT packet_key, source_ref FROM atlas_packet_registry
WHERE qdrant_point_id IS NULL AND embedding_status = 'complete';
-- Should be empty; if not → orphan
```

**Recovery**:
```
1. Re-run embedding pipeline for packet_key
   → Ollama embed → Qdrant insert → update qdrant_point_id
2. Verify: MATCH qdrant_point_id → atlas_packet_registry.qdrant_point_id
3. Idempotency: Use packet_key in Qdrant payload, ON CONFLICT DO UPDATE
```

### Orphan 2: Neo4j node without Postgres row
**Condition**: `(:Packet {source_ref: 'X'})` exists in Neo4j but no `atlas_packet_registry.source_ref='X'`

**Root Cause**: Neo4j import from legacy system; Postgres not synced.

**Detection**:
```cypher
MATCH (p:Packet) 
WHERE NOT EXISTS (
  SELECT 1 FROM postgres_foreign_data_wrapper.atlas_packet_registry r 
  WHERE r.source_ref = p.source_ref
)
RETURN COUNT(p) AS orphaned_neo4j_nodes;
```

**Recovery**:
```
1. MATCH (p:Packet) WHERE orphaned
2. Extract p.source_ref, p.file_path, etc.
3. INSERT INTO atlas_packet_registry (source_ref, file_path, ...)
4. MATCH (p:Packet) SET p.neo4j_node_id = <id from registry>
5. Verify: All Packet nodes now linked
```

### Orphan 3: Qdrant point without atlas_packets row
**Condition**: Point 123456 in codebase_chunks_768, payload.packet_key='auth:001', but no atlas_packets row with that key.

**Root Cause**: Packet deleted from Postgres; Qdrant not updated.

**Detection**:
```python
# Qdrant scroll → check Postgres
cursor = qdrant_client.scroll(
  collection_name="codebase_chunks_768",
  limit=100
)
for point in cursor:
  packet_key = point.payload.get('packet_key')
  exists = postgres.query(
    "SELECT 1 FROM atlas_packet_registry WHERE packet_key = %s",
    (packet_key,)
  )
  if not exists:
    print(f"Orphan: Qdrant {point.id} → packet_key={packet_key} missing from Postgres")
```

**Recovery**:
```
1. If packet was intentionally deleted:
   DELETE FROM codebase_chunks_768 WHERE id = <qdrant_point_id>
2. If packet should exist:
   Restore from cold storage (SeaweedFS)
   → INSERT into atlas_packet_registry
   → RE-EMBED if needed
   → Re-insert Qdrant point
3. Idempotency: Qdrant DELETE is idempotent (no-op if already gone)
```

### Orphan 4: Cache key mismatch
**Condition**: `atlas_packet_registry.valkey_cache_key` = 'atlas:packet:auth:001', but Redis key 'atlas:packet:auth:002' contains that packet's data.

**Root Cause**: Manual Redis manipulation or cache key generation bug.

**Detection**:
```python
for packet_key, cache_key in postgres.query("SELECT packet_key, valkey_cache_key FROM atlas_packet_registry"):
  data = redis.get(cache_key)
  if not data:
    print(f"Cache miss: {packet_key} → {cache_key} not in Redis")
  else:
    stored_key = json.loads(data).get('packet_key')
    if stored_key != packet_key:
      print(f"Mismatch: {cache_key} contains {stored_key}, not {packet_key}")
```

**Recovery**:
```
1. DELETE Redis key: DEL cache_key
2. Re-warm: Trigger embedding pipeline → populate Redis
3. Update registry: UPDATE atlas_packet_registry SET valkey_cache_key = <correct> WHERE packet_key = <X>
```

### Orphan 5: Invalid cache_state
**Condition**: `cache_state = 'L1:redis'` but Redis GET(valkey_cache_key) returns null.

**Root Cause**: Redis evicted entry due to LRU; Postgres state not updated.

**Detection**:
```sql
SELECT packet_key, cache_state FROM atlas_packet_registry
WHERE cache_state = 'L1:redis'
  AND valkey_cache_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM redis_check WHERE key = valkey_cache_key
  );
-- Report: count of stale L1 entries
```

**Recovery**:
```sql
UPDATE atlas_packet_registry
SET cache_state = 'L3:qdrant'  -- Downgrade to Qdrant (known source)
WHERE cache_state = 'L1:redis'
  AND valkey_cache_key NOT IN (SELECT keys FROM redis);
-- On next query, ACE will see L3 and fetch from Qdrant
```

### Orphan 6: Retrieval metrics inconsistency
**Condition**: `retrieval_count = 10`, `cache_hits = 8`, `cache_misses = 1` (9 < 10).

**Root Cause**: Parallel increments lost due to non-atomic UPDATE.

**Detection**:
```sql
SELECT packet_key, retrieval_count, cache_hits + cache_misses AS accounted
FROM atlas_packet_registry
WHERE (cache_hits + cache_misses) != retrieval_count
  AND (cache_hits + cache_misses) > 0;
```

**Recovery**:
```
Option A: Ignore and reconstruct from audit trail
  SELECT COUNT(*) FROM activity_log WHERE packet_key = X AND operation = 'retrieve'
  → Use this as ground truth, update retrieval_count

Option B: Accept partial loss (most recent 90 days accurate)
  UPDATE atlas_packet_registry
  SET cache_hits = 0, cache_misses = retrieval_count  -- Assume all misses
  WHERE (cache_hits + cache_misses) < retrieval_count;

Option C: Add distributed lock for future updates
  ADVISORY LOCK on packet_key before UPDATE ... +=
```

---

## V. Boundary Values & Limits

| Field | Min | Max | Logic |
|-------|-----|-----|-------|
| `embedding_dim` | 64 | 4096 | embeddinggemma=768, latent_384, latent_64 |
| `latent_64` | 0 bytes | 65 bytes | 64 dims × float32 = 256 bytes (but bytea encoded) |
| `som_x`, `som_y` | 0 | 19 | 20×20 grid (400 cells) |
| `retrieval_count` | 0 | ∞ | Cumulative, never decreases |
| `cache_hits` | 0 | retrieval_count | Must be ≤ retrieval_count |
| `karpathy_score` | 0.0 | ~0.3 | Highest observed ≈ 0.09; capped at 1.0 for safety |
| `pagerank_score` | 0.0 | ~0.3 | Sum over 400 SOM cells ≈ 1.0 (normalized) |
| `total_size_bytes` | 0 | ∞ | Cold storage object size |

### Validation Rules

```sql
-- On INSERT/UPDATE atlas_packet_registry, enforce:

CHECK (cache_hits <= retrieval_count);
CHECK (cache_misses <= retrieval_count);
CHECK (cache_hits + cache_misses <= retrieval_count);
CHECK (karpathy_score BETWEEN 0.0 AND 1.0);
CHECK (pagerank_score BETWEEN 0.0 AND 1.0);
CHECK (som_x BETWEEN 0 AND 19);
CHECK (som_y BETWEEN 0 AND 19);
CHECK (embedding_dim IN (64, 128, 256, 384, 768));
```

---

## VI. Service Health Dashboard

**To monitor the DAG**, query these views:

```sql
-- Embedding coverage
SELECT 
  embedding_status,
  COUNT(*) AS count,
  100.0 * COUNT(*) / (SELECT COUNT(*) FROM atlas_packet_registry) AS pct
FROM atlas_packet_registry
GROUP BY embedding_status;

-- Cache state distribution
SELECT 
  cache_state,
  COUNT(*) AS packets,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM atlas_packet_registry), 2) AS pct,
  ROUND(AVG(karpathy_score), 4) AS avg_authority
FROM atlas_packet_registry
GROUP BY cache_state
ORDER BY COUNT(*) DESC;

-- Orphaned packets
SELECT 
  'missing_qdrant' AS issue,
  COUNT(*) AS count
FROM atlas_packet_registry
WHERE qdrant_point_id IS NULL AND embedding_status = 'complete'
UNION ALL
SELECT 
  'invalid_cache_state',
  COUNT(*)
FROM atlas_packet_registry
WHERE cache_state NOT IN ('L1:redis', 'L2:bifrost', 'L3:qdrant', 'L4:disk', 'cold');

-- Retrieval metrics
SELECT 
  'avg_retrievals' AS metric,
  ROUND(AVG(retrieval_count), 2) AS value
FROM atlas_packet_registry
WHERE retrieval_count > 0
UNION ALL
SELECT 'total_retrievals', SUM(retrieval_count)
FROM atlas_packet_registry
UNION ALL
SELECT 'avg_cache_hit_rate', 
  ROUND(100.0 * SUM(cache_hits) / NULLIF(SUM(retrieval_count), 0), 2)
FROM atlas_packet_registry;
```

---

## VII. Deployment Checklist

- [ ] **Backfill atlas_packet_registry** from atlas_packets (18,046 rows)
  - Idempotency: packet_key primary key
  - Duration: ~1 min
  
- [ ] **Verify foreign key consistency**
  - qdrant_point_id → Qdrant codebase_chunks_768
  - neo4j_node_id → Neo4j :Packet nodes
  - valkey_cache_key → Redis keys
  - seaweedfs_filer_path → SeaweedFS objects
  
- [ ] **Set up periodic integrity checks** (daily, 2am UTC)
  - Run orphan detection queries
  - Alert if orphan count > 0
  
- [ ] **Update all services to write atlas_packet_registry**
  - ACE Stage A2: Write retrieval_count, cache_hits, last_retrieved
  - Bifrost: Write cache_state transitions
  - Karpathy pipeline: Write karpathy_score, authority_blend
  
- [ ] **Enable cache state monitoring**
  - Dashboard: cache_state distribution
  - Alert: if 'cold' packets > 30% (cache churn)
  
- [ ] **Test failure scenarios**
  - Postgres down: ACE degrades gracefully
  - Qdrant down: Routes to Neo4j (Lane 4)
  - Ollama down: Uses TurboQuant/fallback
  - Redis down: Downgrade to L3:qdrant

---

**Version**: 1.0 (Session 80, June 25, 2026)  
**Authority**: Generated from live database state + service introspection  
**Next Review**: Post-backfill (atlas_packet_registry row count > 0)
