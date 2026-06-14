# Atlas 3-Tier Cache Contract

**Status**: ✅ UNIFIED ENVELOPE + VERSIONING CONTRACT COMPLETE

Consolidates fragmented Redis/Bitfrost/Qdrant lanes into a single coherent hot-cache system with deterministic invalidation.

---

## Architecture

```
Query
  ↓
L1 Redis/Valkey LRU (exact 300s)
  ↓ miss
L2 Bitfrost semantic (configurable TTL, embedding_hash)
  ↓ miss
L3 Qdrant multi-vector (content + signature + latent_64)
  + Qdrant payload tags (feature_id, community_id, domain_class, som, kmeans)
  + Neo4j USED_CONCEPT expansion
  + XGBoost Stage 4 rerank
  ↓
Write L1 Redis LRU
Write ACE/KAG/DAG hit
```

---

## L1: Redis/Valkey LRU Cache

**Keys** (short TTL = 300s):
```
atlas:lru:query:{sha}        # exact query results
atlas:lru:packet:{packet_key} # packet-scoped cache
atlas:lru:tools:{sha}         # tool narrowing results
atlas:lru:kag:{sha}           # KAG context cache
```

**Envelope**:
```json
{
  "query": "string",
  "packet_keys": ["string"],
  "feature_ids": ["string"],
  "source_refs": ["string"],
  "qdrant_point_ids": [123],
  "redis_hit": false,
  "bitfrost_hit": false,
  "qdrant_hit": true,
  "graph_version": 42,
  "cache_epoch": 1,
  "ttl_seconds": 300,
  "latency_ms": 125
}
```

**Usage**:
```typescript
// Check L1
const hit = await checkRedisLRU(query);
if (hit) return hit.envelope;

// Write L1 after full cascade
await writeRedisLRU(query, envelope);
```

---

## L2: Bitfrost Semantic Cache

**Keys** (per embedding):
```
bifrost:sem:query:{embedding_hash}
bifrost:sem:packet:{packet_key}
bifrost:sem:feature:{feature_id}
bifrost:sem:intent:{intent_hash}
```

**Envelope**:
```json
{
  "embedding_model": "embeddinggemma",
  "embedding_dim": 768,
  "query_hash": "...",
  "semantic_neighbors": [0, 1, 2],
  "packet_keys": ["ace:packet:auth:001"],
  "feature_ids": ["auth.sessions"],
  "community_ids": ["community:auth"],
  "som_clusters": [42],
  "kmeans_clusters": [1],
  "ace_kag_dag_hit": { "stage": "A0", "latency_ms": 125 },
  "graph_version": 42,
  "cache_epoch": 1,
  "latency_ms": 2500
}
```

**Usage**:
```typescript
// Embed query
const embedding = await embedText(query);

// Check L2
const bifrostHit = await checkBitfrostSemantic(query, embedding);
if (bifrostHit) return bifrostHit.envelope;
```

---

## L3: Qdrant Multi-Vector + Payload Tags

**Vectors** (per point):
```json
{
  "content": [768],      // primary semantic search
  "signature": [768],    // (optional) function signature for code
  "latent_64": [64]      // (optional) autoencoder latent (currently absent)
}
```

**Payload Tags** (per point):
```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "domain_class": "auth_login_register",
  "community_id": "community:auth",
  "concept_ids": ["concept:sessions", "concept:validation"],
  "som_row": 5,
  "som_col": 10,
  "som_index": 42,
  "kmeans_cluster": 1,
  "surface": "code",
  "graph_version": 42,
  "cache_epoch": 1,
  "qdrant_tags": ["auth", "session", "lucia"]
}
```

**Search Contract**:
```typescript
// Multi-vector search (content is primary, signature is optional)
const results = await qdrant.client.search('codebase_chunks_768', {
  vector: {
    name: 'content',
    vector: queryEmbedding
  },
  limit: 20,
  score_threshold: 0.3,
  filter: { must: [
    { key: 'domain_class', match: { value: 'auth_login_register' } },
    { key: 'feature_id', match: { value: 'auth.sessions' } }
  ] },
  with_payload: true
});
```

---

## Versioning Contract

Single source of truth in Redis:

```
atlas:graph_version    → incremented on Neo4j mutation
atlas:qdrant_version   → incremented on Qdrant re-index
atlas:rpc_version      → incremented on gRPC registry update
atlas:som_version      → incremented on SOM topology rebuild
atlas:kmeans_version   → incremented on KMeans retrain
atlas:cache_epoch      → incremented on any L1 invalidation
```

**Payload check**: Every Qdrant point must have:
- `graph_version` = current `atlas:graph_version`
- `cache_epoch` = current `atlas:cache_epoch`

**Stale detection**: If payload versions don't match Redis, point is stale.

---

## Invalidation Flow

**Trigger**: Graph truth promotion (e.g., after writing USED_CONCEPT edges)

```bash
# 1. Increment versions
INCR atlas:graph_version
INCR atlas:cache_epoch

# 2. Delete L1 Redis LRU keys
DEL atlas:lru:query:*
DEL atlas:lru:packet:*
DEL atlas:lru:tools:*
DEL atlas:lru:kag:*

# 3. Delete L2 Bitfrost semantic keys
DEL bifrost:sem:query:*
DEL bifrost:sem:packet:*
DEL bifrost:sem:feature:*
DEL bifrost:sem:intent:*

# 4. Delete ACE packet cache
DEL ace:packet:*

# 5. Sync Qdrant payloads (separate script)
# Update all points: payload.graph_version → new atlas:graph_version
# Update all points: payload.cache_epoch → new atlas:cache_epoch
```

**Script**:
```bash
node scripts/atlas/invalidate-atlas-cache-epoch.mjs --apply
node scripts/atlas/sync-qdrant-payload-tags.mjs --apply
```

---

## Query Cascade Steps

1. **Check L1 Redis LRU** → hit returns `AtlasRedisEnvelope` (5ms)
2. **Check L2 Bitfrost semantic** → hit returns `AtlasBifrostEnvelope` (2-5s)
3. **Query L3 Qdrant** → multi-vector search + payload filters (500ms)
4. **Neo4j USED_CONCEPT expansion** → add related concepts (50ms)
5. **XGBoost Stage 4 rerank** → reorder results (50ms)
6. **Write L1 Redis LRU** → cache result for future queries (5ms)
7. **Return combined envelope** → includes all metadata for ACE/KAG/DAG

**Total latency**: 1-2s (cold), 5-100ms (warm)

---

## Smoke Test Contract

```bash
node scripts/atlas/query-atlas-cache-cascade.mjs --query "authentication session"

# Expected output:
# ✓ L1 Redis LRU: MISS
# ✓ L2 Bitfrost Semantic: MISS
# ✓ L3 Qdrant: 2 results
# ✓ Neo4j expansion: 5 concepts
# ✓ XGBoost rerank: 2 results
# ✓ Redis LRU write: success
#
# ═══ Smoke Contract ═══════════════════════════════════
# ✓ redis_checked: true
# ✓ bitfrost_checked: true
# ✓ qdrant_hits: 2 > 0
# ✓ xgboost_reranked: 2 results
# ✓ cache_write: true
```

---

## Files

**New**:
- `src/lib/server/cache/atlas-cache-envelope.ts` — Zod schemas + helpers
- `src/lib/server/cache/atlas-cache-cascade.ts` — Unified retrieval logic
- `scripts/atlas/query-atlas-cache-cascade.mjs` — Smoke test
- `scripts/atlas/sync-qdrant-payload-tags.mjs` — Payload sync contract
- `scripts/atlas/invalidate-atlas-cache-epoch.mjs` — Invalidation contract

**npm scripts** (to add):
```json
{
  "atlas:cache:cascade": "node scripts/atlas/query-atlas-cache-cascade.mjs --query 'authentication'",
  "atlas:cache:cascade:test": "node scripts/atlas/query-atlas-cache-cascade.mjs --query 'test query'",
  "atlas:cache:invalidate:dry": "node scripts/atlas/invalidate-atlas-cache-epoch.mjs --dry-run",
  "atlas:cache:invalidate": "node scripts/atlas/invalidate-atlas-cache-epoch.mjs --apply",
  "atlas:cache:sync:qdrant:dry": "node scripts/atlas/sync-qdrant-payload-tags.mjs --dry-run",
  "atlas:cache:sync:qdrant": "node scripts/atlas/sync-qdrant-payload-tags.mjs --apply"
}
```

---

## Next Steps

1. **Wire cache envelope into `/api/atlas/search`** → replace fragmented cache checks with unified cascade
2. **Add cache hit metrics** → track L1/L2/L3 hit rates in Langfuse
3. **Extend to tool narrowing** → use `atlas:lru:tools:{sha}` for Gemma4 tool lists
4. **Extend to KAG context** → store KAG notes in `atlas:lru:kag:{sha}`
5. **Monitor cache epoch** → alert if Qdrant payloads drift from Redis version
6. **Auto-sync on startup** → invalidate cache epoch on app restart to force fresh Qdrant payload check

---

## Design Principles

- **Single envelope**: All three tiers share the same top-level contract
- **Deterministic versioning**: Graph truth promotion ties to cache epoch
- **No false positives**: Payload version mismatch signals stale data
- **Graceful fallback**: Each tier can fail without cascading (network partition safe)
- **Observable**: Every cache hit/miss is logged for monitoring
- **Replayable**: Same query + epoch always produces same results
