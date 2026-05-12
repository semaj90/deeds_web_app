# TODO — Codebase Enhancement Synthesis

> Generated: 2026-05-11T23:30:52Z from 18 directories, 0 hotspot files
> Source: Redis ACE hits (code:graph:node:* + code:graph:hotspot:*) + 55-gate audit system

> ⚠️ **Data stale** — Redis has only 38 node entries (expect ≥3000 after `graphify:full`). Sections 1 and 2 below may be sparse or empty.
> Run: `npm run graphify:full && npm run agents:enrich` to repopulate (5-10 min GPU).

- [ ] **data:refresh** `npm run graphify:full && npm run agents:enrich` — last enriched 2026-05-11T23:30:52Z with 38 nodes / 0 hotspots (full graph has ≥3000 files)

## 1. Critical Hotspots (High Fan-In → High Risk)

Files with the most dependents — changes here cascade widely. Each needs:
1. Paired test (G26), 2. Circuit-breaker / dependency inversion assessment

| File | Fan-In | Zone | Action |
|------|--------|------|--------|

## 2. Test Coverage Gaps (fanIn ≥ 15, no paired test)

> G26 compliance: every high-fanIn server file needs a test in `tests/routes/auto/`
> Pattern: `@vitest-environment node` + `vi.hoisted` + lazy `beforeEach` import + 401/400/200/degraded cases


## 3. Audit Gate Violations to Address

### G17 — Hardcoded localhost refs (must use ENV.* getters)
Run: `rg "localhost|127\.0\.0\.1" src/lib/server/ --type ts --glob "!env.server.ts"` — all hits are violations

### G8a — SvelteKit error() in service layer
Run: `rg "import .*error.*from .@sveltejs/kit." src/lib/server/ --type ts` — all hits are violations
Use `HttpServiceError` subclasses from `$lib/server/errors.ts` instead

### G8b — GPU/Analysis layer importing SvelteKit
Run: `rg "from .@sveltejs/kit.|from .\$app/" src/lib/server/gpu/ src/lib/server/analysis/ src/lib/server/vector/` — must be 0

### G11 — Wrong DB client import
Run: `rg "from.*db/index" src/ --type ts` — must be 0 (use `db/client` for node-postgres Pool)

### G21-G24 — Svelte 4 patterns in .svelte files
Run: `rg "export\s+let|^\s*\$:[^:]|\bon:[a-z]|createEventDispatcher" src/ --glob "*.svelte"` — must be 0

## 4. Context Enhancement Opportunities (ACE Pipeline)

### G50 — chunk hit logging coverage
`recordChunkHits()` must fire for EVERY retrieval pass: RAG (Qdrant), ACP cross-feed, KAG notes, SOM/hypergraph, PageRank. Currently fires on RAG pass; verify ACP + graph passes are also logged.

### G51 — P1-A prompt leaderboard feedback loop
`fetchTopQueryTags()` in context-assembler injects top prompts into `ACEContext.queryTags`. Verify the write path (prompt clicks → `typing:prompt:clicks` Redis sorted set) and read path (leaderboard API → ACE) are both live.

### G52 — P3-A cross-source reranking
`webSearchToUnified()` in context-assembler merges web search results into RAG chunks before reranking. Verify it handles empty web results gracefully (no crash when `BRAVE_API_KEY` absent).

### G53 — ACE_PIPELINE_VERSION
After any shape change to ACEContext or the retrieval trace, bump `ACE_PIPELINE_VERSION` constant so the ACE chunk cache (Redis `ace_chunks:*` keys) auto-invalidates rather than serving stale context.

### G54/G55 — Cache key consolidation (P2-A)
Single source of truth for LLM cache key generation: `cache-keys.ts`. Both `redis-exact-match.ts` and `llm-cache.ts` must import from there. Check for any remaining local `generateCacheKey` implementations.

## 5. GraphRAG / ACE Graph Enhancement

### G27-G35 — pytorch-graph N-API wiring
Verify all 5 GPU functions are exported from the addon:
```bash
node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); ['kmeansWithCentroids','trainSOM','pageRankGPU','attentionScoreGPU','rewardScoreGPU'].forEach(f=>console.log(f+':',typeof a[f]))"
```

### Topo-byte cache TTL tuning
`ace:topo:{topoClass}:{queryHash}` TTL is 300s. For frequently-queried topology classes, consider bumping to 600s to reduce ANN calls without staleness risk (topology graph changes at most once per `graphify:full` run).

### SOM + PageRank freshness
`codebase_chunks_768` Qdrant payload field `som_cluster` and Neo4j `SIMILAR_TOPOLOGY` edges are written by `run-hypergraph.ts`. If `graphify:full` has not run recently, these are stale — ACE topological boosting underperforms.
Run: `npm run graphify:full` to refresh (5-10 min GPU).

## 6. Structural Enhancement Backlog

### Dependency Inversion — db/client.ts (484 importers)
`src/lib/server/db/client.ts` is the #1 hotspot with 484 dependents. Consider:
- Wrapping behind a thin `getDb()` function (already partially done via `db` export)
- Creating domain-specific query modules to reduce direct cross-domain imports
- Tracking which query patterns are most common (analytics → targeted optimization)

### env.server.ts (336 importers)
Only `env.server.ts` should read `process.env.*` directly. The 336 importers are expected but confirm none bypass it with raw `process.env.*` access.
Run: `rg "process\.env\." src/ --type ts --glob "!env.server.ts"` — expect 0 outside of script files

### redis.ts (237 importers)
237 files import directly from `redis.ts`. The `getRedis()` pool pattern (18 migrated 2026-04-12) should cover all of them. Verify no file still uses `new Redis(...)` directly.
Run: `rg "new Redis(" src/lib/server/ --type ts --glob "!redis.ts"` — expect 0

### gRPC port collision — port 50055
Both `chr97-agent-client.ts` and `go-search-service` claim port 50055. One must move to 50058+ before enabling both services. See CLAUDE.md §"gRPC Service Port Map".

### Phase B LLM Summaries — still pending
`npm run graphify:summarize` (Phase B of the deep-import pipeline) was blocked by Ollama VRAM (gemma4-legal-vlm occupying all slots).
Run when VRAM is free: `npm run graphify:summarize:limit` (first 50 files with gemma3:270m)
This will populate `memory/graphify/deep/summaries/` and `memory/ingest/pending/graphify_summaries_*.jsonl`

## 7. Quick Wins (<30 min each)

- [ ] Run `npm run audit:test-stubs` to generate G26-pattern placeholder tests for all unmapped POST/PUT/PATCH/DELETE routes
- [ ] Run `rg "new Redis(" src/lib/server/ --type ts` — fix any remaining direct Redis construction outside `redis.ts`
- [ ] Run `rg "from.*db/index" src/ --type ts` — fix any remaining wrong DB client imports
- [ ] Run `npm run typecheck:native` (tsgo) — fast type audit that catches TS2345 mismatches missed by svelte-check
- [ ] Set `RETRIEVAL_HTTP_ENABLED=true` in `.env` and test Go retrieval HTTP path (port 8100) — middle tier between gRPC and inline fallback
- [ ] Verify `GRAPH_ML_GRPC_URL` is defined in `.env` (flagged as MISSING ENV in gRPC audit)
- [ ] Run `npm run graphify:full` to refresh SOM + PageRank + Neo4j topology edges (stale since last indexing run)
