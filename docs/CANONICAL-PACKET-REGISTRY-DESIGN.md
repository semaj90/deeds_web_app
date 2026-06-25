# Canonical Packet Registry Design

## Single Source of Truth: Postgres (Not Distributed)

**Principle**: Postgres holds the canonical truth for every packet. Everything else (Qdrant, Valkey, Neo4j, DuckDB, SeaweedFS) are **mirrors, caches, or specialized indexes**—never sources of truth.

```
Canonical Truth: Postgres atlas_packet_registry
         ↓
    ┌────┴────┬────────┬──────────┬─────────┐
    ↓         ↓        ↓          ↓         ↓
  Qdrant   Valkey    Neo4j    SeaweedFS  DuckDB
  (ANN)    (hot)    (graph)   (raw)     (analytics)
  mirror   cache    mirror    mirror     snapshot
```

---

## Datastore Roles (Explicit Boundaries)

### **Postgres 18 + pgvector** (CANONICAL TRUTH)
- **Packets**: packet_key, source_ref, file_path, feature_id, trace_id
- **Content**: title, summary, embedding_768d, latent_64 (bytea)
- **State**: embedding_status, cache_state, validation_status, retrieval_count
- **Clustering**: kmeans_cluster_id, som_x, som_y, semantic_z, activity_w, manifold4 (4D coordinates)
- **Authority**: pagerank_score, authority_blend, karpathy_score
- **Service References**: qdrant_point_id, neo4j_node_id, valkey_cache_key, turbovec_id
- **Relationships**: kag_edges (JSONB), dag_edges (JSONB)
- **Lifecycle**: activity (JSONB log), created_at, updated_at, status

**Never lose data from Postgres.** Everything else can be rebuilt.

### **Qdrant** (Vector ANN Mirror)
- Read-only consumer of embedding_768d from Postgres
- Stores: {point_id, vector, payload}
- Payload includes: packet_key, feature_id, cache_state, authority_blend (for filtering)
- **One-way sync**: Postgres → Qdrant (never reverse)
- **Use case**: Semantic similarity search (`search("authentication", topK=20)`)

### **Valkey (Redis-compatible)** (Hot Cache)
- L1 cache for frequently-accessed packets
- **Key shapes**:
  - `bifrost:packet:{packet_key}` → cached response (TTL 5min)
  - `cache:feature:{feature_id}` → packet list (TTL 1h)
  - `centroid:cluster:{cluster_id}` → SOM centroid (TTL 6h)
  - `search:query:{query_hash}` → search results (TTL 1h)
- **Never canonical**: Always readable from Postgres if evicted
- **Use case**: Instant cache hits, centroid lookups for SOM traversal

### **Neo4j** (Graph Mirror)
- Read-only consumer of dag_edges, kag_edges from Postgres
- Stores: graph relationships + topology queries
- **Relationship types**:
  - `PACKET → [USED_CONCEPT] → FEATURE` (KAG edges)
  - `PACKET → [DEPENDS_ON] → PACKET` (DAG edges)
  - `PACKET → [IN_CLUSTER] → CLUSTER`
  - `PACKET → [SIMILAR_TOPOLOGY] → PACKET` (SOM grid adjacency)
- **Never canonical**: Graph can be regenerated from Postgres edges
- **Use case**: K-hop neighbor expansion, dependency ordering

### **SeaweedFS** (Raw Document Mirror)
- Immutable storage of original files (PDFs, images, text)
- **Path**: `/feature_id/source_ref/document_hash.bin`
- **S3-compatible gateway** on port 8333
- **Never canonical**: Always restorable from Postgres packet_key linkage
- **Use case**: Archive storage, forensic document retrieval

### **DuckDB** (Offline Analytics & MapReduce)
- SQL-based analytics + aggregation queries
- **Snapshots** taken from Postgres hourly (not live replication)
- **Use cases**:
  - Offline packet quality audits
  - Clustering health reports
  - Authority score distributions
- **Never canonical**: Always refreshable from source tables

---

## Packet Registry Schema (Canonical Truth)

### Core Spine (Immutable After Creation)
```sql
packet_key              TEXT PRIMARY KEY    -- "ace:packet:auth:001"
trace_id                TEXT                -- Linked to retrieval trace
source_ref              TEXT NOT NULL       -- "src/lib/server/auth.ts"
file_path               TEXT NOT NULL       -- Absolute path
feature_id              TEXT NOT NULL       -- "auth.sessions"
```

### Content & Embeddings
```sql
title                   TEXT                -- LLM-generated title
summary                 TEXT                -- LLM-generated summary
embedding_status        TEXT                -- 'missing' | 'pending' | 'complete' | 'failed'
embedding_768d          vector(768)         -- Raw 768-dim embedding
latent_384d             vector(384)         -- 768→384 projection (if available)
latent_64               bytea               -- Compressed 64-dim from autoencoder
```

### Clustering & Geometry
```sql
kmeans_cluster_id       TEXT                -- Cluster assignment from KMeans
som_x, som_y            INT                 -- SOM grid coordinates (20×20 default)
semantic_z              REAL                -- 3rd dimension (semantic strength)
activity_w              REAL                -- 4th dimension (retrieval activity)
manifold4               JSONB               -- {x, y, z, w, cluster_id, authority}
```

### Service References (Mirrors)
```sql
qdrant_point_id         BIGINT UNIQUE       -- Qdrant collection point
neo4j_node_id           TEXT UNIQUE         -- Neo4j Packet node ID
valkey_cache_key        TEXT UNIQUE         -- Redis key for L1 cache hit
turbovec_id             TEXT UNIQUE         -- TurboVec sparse index ID
ace_cache_key           TEXT UNIQUE         -- ACE context assembly cache key
seaweedfs_filer_path    TEXT UNIQUE         -- Raw document path
```

### Authority & Ranking
```sql
pagerank_score          REAL                -- Neo4j PageRank
authority_blend         REAL                -- 0.4·PR + 0.3·attn + 0.3·auth
karpathy_score          REAL                -- GPU attention-weighted score
last_rerank_score       REAL                -- Most recent reranker output
```

### Retrieval & Cache Metrics
```sql
retrieval_count         INT DEFAULT 0       -- Total times retrieved
cache_hits              INT DEFAULT 0       -- L1/L2 cache hits
cache_misses            INT DEFAULT 0       -- Cache misses (required DB/vector query)
last_retrieved          TIMESTAMP           -- Last access time
cache_state             TEXT                -- 'L1:redis' | 'L2:bifrost' | 'L3:qdrant' | 'L4:disk' | 'cold'
```

### Lifecycle
```sql
activity                JSONB               -- {indexed_at, embedded_at, cached_at, retrieved_at, reranked_at, etc}
status                  TEXT                -- 'active' | 'archived' | 'staged' | 'error'
validation_status       TEXT                -- 'valid' | 'needs_review' | 'corrupted'
created_at              TIMESTAMPTZ         -- Creation timestamp
updated_at              TIMESTAMPTZ         -- Last modification timestamp
```

### Relationships (Graph Edges)
```sql
kag_edges               JSONB               -- {feature_id → [feature_ids]} (Knowledge-Augmented Graph)
dag_edges               JSONB               -- {packet_key → [packet_keys]} (Dependency DAG)
```

---

## Transport Layer (gRPC & JSON-RPC)

**Transport is NOT storage.** Use the right protocol for the job:

### **gRPC** (High-Volume Internal RPC)
- **Go Retrieval Service**: query packets, return ranked results
- **Go Embedding Service**: embed text → send vector to Postgres
- **TurboVec Sidecar**: sparse reranking
- **Packet Materializer**: hydrate cached packets from Postgres

Example: Go Retrieval queries Postgres via gRPC
```protobuf
service AtlasRetrieval {
  rpc SearchHybrid(SearchRequest) returns (SearchResponse);
  rpc GetPacket(GetPacketRequest) returns (Packet);
}
```

### **JSON-RPC 2.0** (OpenCode/Gemma4 Tool Calling)
- **MCP Tools**:
  - `atlas.search_hybrid` → calls SearchHybrid, returns results
  - `atlas.packet_materialize` → loads full packet from Postgres
  - `atlas.cache_warm` → pre-load into Valkey
  - `atlas.validate_packet` → run integrity checks

Example: Gemma4 calls MCP tool
```json
{
  "tool": "atlas.search_hybrid",
  "arguments": {
    "query": "authentication",
    "lanes": ["bm25", "ann", "graph", "cache", "gpu"],
    "topK": 20
  }
}
```

### **HTTP REST** (Edge/Browser)
- SvelteKit `/api/packets/{key}` → returns JSON from Postgres
- `/api/search?q=authentication` → parallel lane execution
- Caddy reverse proxy (port 5178) for HTTP/3 (QUIC)

---

## Service Update Pattern (Atomic Writes to Postgres)

Every service that touches a packet **must** update the registry atomically:

### Embedding Service (After EmbeddingGemma)
```typescript
await db.update(atlas_packet_registry)
  .set({
    embedding_768d: embedding_vector,
    embedding_status: 'complete',
    activity: sql`jsonb_set(activity, '{embedded_at}', '"${now()}"'::jsonb)`,
    updated_at: new Date(),
  })
  .where(eq(atlas_packet_registry.packet_key, packetKey));
```

### Qdrant Indexing (After Vector Upsert)
```typescript
await db.update(atlas_packet_registry)
  .set({
    qdrant_point_id: pointId,
    cache_state: 'L3:qdrant',
    activity: sql`jsonb_set(activity, '{indexed_at}', '"${now()}"'::jsonb)`,
    updated_at: new Date(),
  })
  .where(eq(atlas_packet_registry.packet_key, packetKey));
```

### Retrieval Service (After Cache Hit)
```typescript
await db.update(atlas_packet_registry)
  .set({
    cache_hits: sql`cache_hits + 1`,
    last_retrieved: new Date(),
    cache_state: cacheSource,  // 'L1:redis' or 'L2:bifrost'
    activity: sql`jsonb_set(activity, '{retrieved_at}', '"${now()}"'::jsonb)`,
    updated_at: new Date(),
  })
  .where(eq(atlas_packet_registry.packet_key, packetKey));
```

---

## Audit Pattern (Simplified)

**Before** (distributed, fragmented):
```bash
# Check Qdrant
curl http://127.0.0.1:6333/collections/codebase_chunks_768/points/...

# Check Neo4j
curl http://127.0.0.1:7474/db/neo4j/exec -X POST "MATCH (p:Packet {id: ...}) RETURN p"

# Check Valkey
docker exec legal-ai-valkey redis-cli GET "bifrost:packet:auth:001"

# Check Postgres
curl http://localhost:5173/api/packets/auth:001
```

**After** (single query, canonical source):
```sql
SELECT
  packet_key,
  feature_id,
  embedding_status,
  cache_state,
  activity ->> 'embedded_at' AS embedded_at,
  activity ->> 'indexed_at' AS indexed_at,
  activity ->> 'retrieved_at' AS retrieved_at,
  retrieval_count,
  cache_hits,
  pagerank_score,
  COALESCE(qdrant_point_id::text, 'missing') AS qdrant_linked,
  COALESCE(neo4j_node_id, 'missing') AS neo4j_linked,
  COALESCE(valkey_cache_key, 'not_cached') AS cache_status
FROM atlas_packet_registry
WHERE packet_key = 'ace:packet:auth:001';
```

---

## Schema Deployment

1. Create migration: `drizzle/manual/atlas_packet_registry.sql`
2. Apply: `npm run drizzle:migrate`
3. Backfill from existing packets in `nes_chrom_packets` / `atlas_packets`
4. Create materialized views for cache + health audits
5. Wire services to update registry on write

---

## Why This Design

| Problem | Solution |
|---------|----------|
| Fragmented packet state | Single registry in Postgres |
| Unclear cache status | `cache_state` column updated atomically |
| Hard to debug retrieval | `activity` JSONB log of all operations |
| Slow authority ranking | Pre-computed `authority_blend` for fast sorting |
| Port/service audits | Obsolete—packet registry health is source of truth |
| Distributed updates | Postgres ACID guarantees + activity log |

