Redis L1 Cache Notes

- Standard Redis URL: redis://localhost:4005 (override via REDIS_URL)
- Helper: src/lib/server/cache/redis-cache.ts
  - getJSON/setJSON: JSON helpers
  - withCache(key, ttl, compute): coalesces concurrent misses in-process

Current integration
- Endpoint: /api/v1/rag (POST)
  - Computes SHA-256 key from query + user/session + params
  - TTL default 20s (override RAG_L1_TTL)
  - Preserves existing dimensional cache behavior; L1 wraps it
  - Surfaced metadata.cached when cache hit (L1 or remote)

Next opportunities
- Apply withCache to: /api/v1/ingest (dedupe), /api/v1/orchestrator (hot ops), chat history pulls (short TTL)
- Add cache stampede backoff for compute errors
- Optional cache namespaces per env (CACHE_NS)
