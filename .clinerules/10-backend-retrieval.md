---
paths:
  - "sveltekit-frontend/src/lib/server/retrieval/**"
  - "sveltekit-frontend/src/lib/server/hyperrag/**"
  - "sveltekit-frontend/src/lib/server/acp/**"
  - "sveltekit-frontend/src/lib/server/cache/**"
  - "sveltekit-frontend/scripts/atlas/**"
  - "sveltekit-frontend/tests/**/*retrieval*"
  - "sveltekit-frontend/tests/hyperrag/**"
---

# Retrieval and cache contract

## Services
| Service | Port | Role |
|---------|------|------|
| llama-server (Gemma4) | :8090 | Generation only — `stream: true` in request body |
| Ollama (embeddinggemma) | :11434 | Embeddings only — 384-dim output |
| Qdrant | :6333 | ANN mirror — `codebase_chunks_384_hybrid` |
| TurboVec | :8791 | CUDA prefilter (64-dim routing, not ANN search) |
| Postgres | :5432 Docker / :5434 host | Canonical truth |
| Valkey/Redis | :6379 | Cache — password from `REDIS_PASSWORD` env var |
| Neo4j | :7687 | Topology mirror |
| TRACE MCP | :8788 | Atlas/KAG retrieval tools |

## Retrieval order (ACE pipeline)
```
bifrost:* Redis exact (L1, <5ms)
→ Postgres packet_key/source_ref (canonical)
→ Qdrant ANN 384-dim (mirror)
→ Neo4j k-hop bounded (topology only)
→ Gemma4 synthesis (last)
```

## Dimension policy
- Canonical embeddings: **384-dim** (`embeddinggemma:latest` via Ollama)
- AE latent: 64-dim — routing cache only, never for ANN search
- Never mix dimensions in the same Qdrant collection

## Verified Redis key namespaces (from source)
Two distinct prefixes exist — do not confuse them:

`bifrost:*` — semantic/LLM cache (src/lib/server/acp/, src/lib/server/cache/)
  bifrost:packet:{packet_key}       primary packet cache
  bifrost:feature:{feature_id}:*    feature-level cache
  bifrost:source:{source_ref}       source-ref cache
  bifrost:sem:packet:{key}          semantic result cache (1h TTL)
  bifrost:sem:feature:{id}          feature result cache (4h TTL)
  bifrost:sem:intent:{hash}         intent cache
  bifrost:trace:{key}               trace cache
  bifrost:kag:{hash}                KAG result cache
  bifrost:query:{hash}              query result cache
  bifrost:workflow:{id}             workflow cache

`bitfrost:*` — temporal/retrieval/repair cache (src/routes/api/*)
  bitfrost:summary:{packet_key}     summary cache
  bitfrost:temporal:file:{sha256}   temporal file cache
  bitfrost:term:*                   BM25 ngram cache
  bitfrost:retrieval:*              retrieval result cache
  bitfrost:repair:*                 repair state cache
  bitfrost:multihop:*               multi-hop traversal cache
  bitfrost:effectiveness:stats      cache effectiveness stats
  bitfrost:trace:{key}              trace cache (duplicate prefix)

`centroid:*` — cluster routing (src/lib/server/cache/tensor-similarity-cache.ts)
  centroid:v1:{clusterId}           cluster member list (30min TTL)
  centroid:feature:{feature_id}     feature centroid key
  centroid:som:{row}:{col}          SOM cell cache
  centroid:cluster:{id}             cluster centroid

## Centroid / routing distinction
Centroids **narrow the search space** (route to likely semantic partitions).
They do NOT replace 384-dim Qdrant candidate scoring.
Pipeline: centroid routing → Qdrant ANN within partition → fusion → Postgres join

## TypeScript SearchRuntime owns fusion
- `src/lib/server/retrieval/search-runtime.ts` — do not bypass
- Dense/sparse/exact/AST lanes feed into RRF inside SearchRuntime
- No lane should write fused results directly to cache before going through SearchRuntime
