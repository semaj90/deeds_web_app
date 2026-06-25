# Packet-Centric Architecture Design

## The Shift: From Service-Centric to Packet-Centric

**Current state**: Each service operates independently. When a packet moves through the pipeline, its metadata is scattered across Qdrant (vector ID), Neo4j (node ID), Valkey (cache key), Postgres (row ID), and Bifrost (semantic cache key).

**Proposed state**: The **packet** becomes the central entity. Every service updates a canonical `atlas_packet_registry` table as it processes the packet. This becomes the single source of truth for packet lifecycle.

---

## Canonical Packet Registry

```sql
CREATE TABLE atlas_packet_registry (
  -- Identity (immutable spine)
  packet_key          TEXT PRIMARY KEY,
  trace_id            UUID,
  file_path           TEXT NOT NULL,
  source_ref          TEXT NOT NULL,
  feature_id          TEXT NOT NULL,
  
  -- Content
  summary             TEXT,
  title               TEXT,
  
  -- Embedding Layer
  embedding_768d      vector(768),
  embedding_model     TEXT DEFAULT 'embeddinggemma',
  embedding_status    TEXT,
  embedding_updated   TIMESTAMP,
  
  -- Latent Vectors
  latent_384d         vector(384),
  latent_64d          vector(64),
  autoencoder_model   TEXT,
  latent_status       TEXT,
  
  -- Clustering
  kmeans_cluster_id   INT,
  som_cell_row        INT,
  som_cell_col        INT,
  clustering_status   TEXT,
  
  -- Service References
  qdrant_point_id     BIGINT UNIQUE,
  neo4j_node_id       TEXT UNIQUE,
  valkey_cache_key    TEXT UNIQUE,
  postgres_chunk_id   UUID UNIQUE,
  
  -- Authority & Ranking
  pagerank_score      REAL,
  authority_blend     REAL,
  karpathy_score      REAL,
  
  -- Retrieval Metrics
  retrieval_count     INT DEFAULT 0,
  cache_hits          INT DEFAULT 0,
  last_retrieved      TIMESTAMP,
  last_rerank_score   REAL,
  
  -- Operational State
  activity            JSONB,  -- {indexed_at, embedded_at, cached_at, etc}
  cache_state         TEXT,  -- 'L1:redis' | 'L2:bifrost' | 'L3:qdrant' | 'L4:disk' | 'uncached'
  status              TEXT DEFAULT 'active',
  
  -- Timestamps
  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now(),
  
  -- Relationships
  kag_edges           JSONB,
  dag_edges           JSONB
);
```

---

## Service Update Pattern

Every service updates the registry as it progresses:

### Embedding Service
```typescript
await db.update(atlas_packet_registry)
  .set({
    embedding_768d: embedding_vector,
    embedding_status: 'complete',
    embedding_updated: new Date(),
    activity: { ...packet.activity, embedded_at: now() },
    updated_at: new Date(),
  })
  .where(eq(atlas_packet_registry.packet_key, packetKey));
```

### Qdrant Indexing
```typescript
await db.update(atlas_packet_registry)
  .set({
    qdrant_point_id: pointId,
    cache_state: 'L3:qdrant',
    activity: { ...packet.activity, indexed_at: now() },
    updated_at: new Date(),
  })
  .where(eq(atlas_packet_registry.packet_key, packetKey));
```

### Retrieval (Cache Hit)
```typescript
await db.update(atlas_packet_registry)
  .set({
    cache_hits: sql`cache_hits + 1`,
    last_retrieved: new Date(),
    cache_state: 'L1:redis',
    activity: { ...packet.activity, retrieved_at: now() },
    updated_at: new Date(),
  })
  .where(eq(atlas_packet_registry.packet_key, packetKey));
```

---

## Audit Pattern (Simplified)

**Before** (check 14 services):
```bash
curl http://127.0.0.1:6333/...
curl http://127.0.0.1:7474/...
docker exec legal-ai-valkey redis-cli keys "bifrost:*"
```

**After** (single query):
```sql
SELECT 
  packet_key,
  embedding_status,
  cache_state,
  activity ->> 'indexed_at',
  retrieval_count,
  pagerank_score
FROM atlas_packet_registry
WHERE packet_key = 'ace:packet:auth:001';
```

---

## Service Dependency DAG

Auto-generated from registry activity:

```
Graphify → Chunker → Summarizer → EmbeddingGemma → Autoencoder → KMeans → SOM
                                                                             ↓
                                                                          Neo4j
                                                                             ↓
Bifrost/Valkey ← Qdrant ← (all services update registry)
                    ↓
             ACE Context
                    ↓
                 Gemma4
```

Each node updates `atlas_packet_registry` atomically.

---

## Retrieval Test (Functional)

Test the full pipeline instead of checking ports:

```typescript
// Stage 1: Packet retrieval
const packet = await db.query.atlas_packet_registry.findFirst({
  where: eq(atlas_packet_registry.feature_id, 'auth.sessions'),
});

// Stage 2: Vector search
const qdrantHit = await qdrant.search('codebase_chunks_768', {
  vector: packet.embedding_768d,
  limit: 5,
});

// Stage 3: Neo4j neighbors
const neo4jNeighbors = await neo4j.run(
  'MATCH (p:Packet {qdrant_id: $id})-[:USED_CONCEPT]->(n) RETURN n',
  { id: packet.qdrant_point_id }
);

// Stage 4: Cache state
const cacheHit = await valkey.get(packet.valkey_cache_key);

// Stage 5: GPU reranking
const reranked = await gpuReranker(packet.embedding_768d, [qdrantHit]);

// Stage 6: Synthesis
const summary = await gemma4.generate({
  context: packet.summary,
  prompt: 'Summarize in one sentence',
});

// All stages must pass
return {
  stages: [
    { stage: 'packet_retrieval', ✅ },
    { stage: 'qdrant_search', hits: 5, ✅ },
    { stage: 'neo4j_topology', neighbors: 12, ✅ },
    { stage: 'cache_hit', ✅ },
    { stage: 'gpu_rerank', ✅ },
    { stage: 'gemma4_synthesis', ✅ },
  ],
  errors: []
};
```

---

## Next Steps

1. Create `atlas_packet_registry` table (Drizzle schema + migration)
2. Backfill with existing packet data
3. Wire each service to update registry
4. Audit packets (100% coverage check)
5. Retire manual port health checks
