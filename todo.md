# TODO — 2026-04-20
_Generated: 2026-04-20T (Session end — Phase 10 fixes + Stage 10 deep-research)_

---

## ✅ Completed This Session
- Phase 10: 14 TypeScript errors fixed across 11 files (tsc: 0 errors)
- Stage 10: Agentic deep-research web indexing pipeline wired into orchestrator
- New table: `web_search_index` (Drizzle schema + manual migration SQL with HNSW)
- New indexer: `web-search-indexer.ts` (cluster seeds → webSearch → fetch → embed → upsert)
- New API route: `POST /api/codebase-index/deep-research`
- Pre-existing fixes: `agentic-web-indexer.ts` fnv1a export + node-fetch timeout
- Git committed + pushed to origin main

---

## 🔥 HIGH PRIORITY — Next Session

### Deep Research: HTML Content Extraction (HIGH)
- [ ] Upgrade page fetcher: use `JSDOM` (already a dep) for proper DOM parsing instead of regex strip
- [ ] Extract only `<main>`, `<article>`, `<p>` text to avoid nav/sidebar noise
- [ ] Add robots.txt / meta[name=robots] compliance check before fetching
- [ ] Add rate-limiting: max 2 requests/sec per domain to avoid IP bans

### Deep Research: RAG Integration (HIGH)
- [ ] Wire `web_search_index` into `context-assembler.ts` as a secondary retrieval source
  - Add after codebase context assembly: `SELECT ... FROM web_search_index ORDER BY embedding <=> $queryVec LIMIT 5`
  - Tag results as `source: 'web_research'` in ACEContext
- [ ] Add `web_search_index` to the ACE context assembler `getAnalyticsContext()` fallback

### Deep Research: Quality Scoring (HIGH)
- [ ] Add cross-encoder rerank score vs cluster query (currently hardcoded 0.6)
  - Import `rerankChunks()` from `cross-encoder-reranker.ts`, apply to web results
- [ ] Add GRPO reward scoring for web results (grpo_w in manifold4 when hypergraph runs)
- [ ] Write `manifold4` coordinates for `web_search_index` rows after SOM rebuild

---

## 🟡 MEDIUM PRIORITY

### Orchestrator Improvements
- [ ] Add `deepResearch` flag to the orchestrator UI (Admin Dashboard → Codebase Intelligence panel)
- [ ] Add `web_search_index` stats to `/api/codebase-index/stats` endpoint
- [ ] Multi-query per cluster: generate 2 distinct angle queries (different keyword focus)
  - Query 1: `${purpose} TypeScript implementation`
  - Query 2: `${topPattern} best practices security`
- [ ] Add `deepResearch` to ALL_STAGES display array (currently only tracked in runtime completedStages)

### Infrastructure
- [ ] Run DB migration: `psql -U legal_admin -d legal_ai_db -f drizzle/manual/20260420_web_search_index.sql`
- [ ] Ensure `knowledge_base` Qdrant collection exists (create if missing before first deep-research run)
- [ ] Port 50055 collision: CHR97 agent vs go-search-service — reassign one to 50058
- [ ] `generation-client.ts` (port 50052): 0 consumers — wire to `/api/ai/generate` route or archive to deeds_labs
- [ ] `GRAPH_ML_GRPC_URL` missing from `env.server.ts` — add placeholder with fallback

### Code Quality
- [ ] Replace `(server as any).handleRequest()` in `mcp-internal.ts` / `api/mcp/+server.ts` with proper MCP SDK v2 API
- [ ] Replace `(rabbitmq as any).isReady()` in analytics health with typed method
- [ ] UnoCSS `presetUno()` → `preset-wind3` migration (non-urgent, but removes deprecation warning)

---

## 🟢 LOW PRIORITY / IDEAS

### Deep Research Enhancements
- [ ] Multi-hop research: follow top-1 referenced URL from each web result (depth=2)
- [ ] LLM query refinement: pass cluster purpose to Ollama → generate 3 semantically diverse queries
- [ ] Dedup across `research_summaries` table (not just within `web_search_index`)
- [ ] Periodic re-indexing: re-run deep-research for clusters that have changed significantly

### Evidence + Legal Pipeline
- [ ] Connect deep-research results to evidence similarity scores (cross-entity search)
- [ ] Add `web_search_index` to citation suggestion pipeline in `/api/citations`

### Frontend
- [ ] Deep Research progress panel: show Stage 10 progress in the Codebase Intelligence dashboard
- [ ] Search results viewer: browse `web_search_index` table in admin UI
- [ ] Add "Research Web" button to cluster summary cards

---

## 📋 Run After Next Session Starts

```bash
# 1. Apply DB migration
psql -U legal_admin -d legal_ai_db -h 127.0.0.1 -f drizzle/manual/20260420_web_search_index.sql

# 2. Test deep-research standalone endpoint
curl -X POST http://localhost:5173/api/codebase-index/deep-research \
  -H 'Content-Type: application/json' \
  -d '{"maxClusters": 3, "resultsPerQuery": 3}'

# 3. Test via orchestrator (Stage 10 flag)
curl -X POST http://localhost:5173/api/codebase-index/orchestrate \
  -H 'Content-Type: application/json' \
  -d '{"deepResearch": true, "runIndexing": false, "summarize": false}'

# 4. Verify rows in DB
psql -U legal_admin -d legal_ai_db -h 127.0.0.1 \
  -c "SELECT count(*), provider FROM web_search_index GROUP BY provider;"
```

---

## 🔧 Known Issues

| Issue | File | Severity |
|-------|------|----------|
| Port 50055 collision (CHR97 ↔ go-search) | grpc clients | Medium |
| `generation-client.ts` 0 consumers | grpc/generation-client.ts | Low |
| `GRAPH_ML_GRPC_URL` not in env.server.ts | grpc/graph-ml-client.ts | Low |
| MCP `handleRequest` cast to `any` | mcp-internal.ts | Low |
| `rabbitmq.isReady()` cast to `any` | analytics/health | Low |
| UnoCSS presetUno() deprecated | unocss.config.ts | Low |
