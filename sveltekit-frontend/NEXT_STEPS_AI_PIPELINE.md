# AI Pipeline — Next Steps & Todo List

**Generated:** 2026-04-16  
**Scope:** Codebase indexing · ACE assembly · KV cache · Semantic search · Tool calling · Analytics adaptive loop · QLoRA self-improvement  
**Status baseline:** svelte-check 0 errors · vite build PASSES · `UnifiedRetrievalResult` type wired into ACE + codebase paths

---

## P0 — Complete `UnifiedRetrievalResult` Pipeline Adoption

The canonical type exists and is exported. Three retrieval subsystems still return legacy shapes. Wire the normalizers already written in `types/retrieval.ts`.

### P0-A `authority-chain.ts` — return `UnifiedRetrievalResult[]`
- **File:** `src/lib/server/retrieval/authority-chain.ts`
- **Current:** `authorityChainExpansion()` returns `{ docs: ContextDoc[]; expanded: number }`
- **Change:** Map `ContextDoc` items through `fromContextDoc()` before returning; update return type to `UnifiedRetrievalResult[]`
- **Impact:** `context-assembler.ts` already calls `fromContextDoc()` on the result — can simplify that conversion
- **Effort:** 30 min

### P0-B `graph-informed-retrieval.ts` — return `UnifiedRetrievalResult[]`
- **File:** `src/lib/server/retrieval/graph-informed-retrieval.ts`
- **Current:** `graphExpandRetrieval()` returns `ContextDoc[]`
- **Change:** Use `fromQdrantPoint()` inside `fetchNeighborChunks()` instead of inline object; return `UnifiedRetrievalResult[]`
- **Impact:** Preserves `graphDistance`, `authorityScore`, `somCluster` from Qdrant payloads enriched by `enrich-qdrant`
- **Effort:** 45 min

### P0-C `cross-encoder-reranker.ts` — call sites use `fromRerankResult()`
- **File:** `src/lib/server/retrieval/cross-encoder-reranker.ts`
- **Current:** `rerankDocuments()` returns `RerankResult<T>[]` — each has `.doc`, `.rerankScore`, `.originalRank`
- **Change:** Add an exported `rerankToUnified()` helper that maps `RerankResult<T>[]` → `UnifiedRetrievalResult[]` using `fromRerankResult()`; call it in `context-assembler.ts` after reranking
- **Effort:** 30 min

### P0-D Web search — call `fromWebResult()` at aggregation point
- **Files:** `src/lib/server/retrieval/web-search.ts`, `src/lib/server/retrieval/wikipedia-search.ts`
- **Current:** `webSearch()` returns `WebSearchResult[]`; formatted as a string by `formatWebResultsAsContext()`
- **Change:** Also export `webSearchToUnified()` — maps hits through `fromWebResult()` — so ACE assembler can include web results in the same unified result set alongside RAG chunks
- **Impact:** Enables cross-source reranking of web + RAG results by a single `sortByBestScore()` call
- **Effort:** 20 min

---

## P1 — Close the Adaptive Feedback Loop

The event logging and prompt-feedback infrastructure exists. The loop back into ACE is not yet closed.

### P1-A Prompt leaderboard → ACE prompt weighting
- **Problem:** `routes/api/synthesis/prompt-feedback/+server.ts` writes to a Redis `ZINCRBY` sorted set (30-day leaderboard). Nothing reads it.
- **Change:** In `ace/policy.ts` or `ace/context-assembler.ts`, read the top-scoring prompt pills for the user's current section via `ZRANGE promptSource:{section} 0 4 WITHSCORES` and inject as ranked `queryTags` hints into `ACEContext`
- **Files to change:** `src/lib/server/ace/user-analytics-context.ts` (add `getTopPrompts(userId, section)`), `src/lib/server/ace/context-assembler.ts` (consume in `queryTags`)
- **Effort:** 1 hr

### P1-B `rag_query_log` → QLoRA distillation pipeline closure
- **Problem:** `POST /api/analytics/qlora-dataset` distills high-quality interactions (rerank ≥ 0.80, self-eval ≥ 0.80) into `qlora_examples` with Alpaca format export. No scheduled trigger runs it.
- **Change:** Add a RabbitMQ consumer on a new `qlora.distill` queue (or a cron-style idle task) that calls the distillation endpoint nightly when `rag_query_log` has ≥ 50 new qualifying rows
- **Downstream:** `GET /api/analytics/qlora-dataset?export=jsonl` → feed to Colab QLoRA training notebook → updated `gemma4-rotorquant:latest` checkpoint
- **Effort:** 2 hrs

### P1-C `chunk_hit_log` → retrieval quality signal
- **Problem:** `chunk_hit_log` table records which chunks were actually shown to users (scroll depth, dwell time). This signal is never fed back into reranking weights.
- **Change:** Aggregate `chunk_hit_log` (chunk_id → click rate) into a `chunkPopularity` field in Qdrant payload via a background enrichment job (similar to `enrich-qdrant`). Cross-encoder reranker can use this as a tie-breaker.
- **Effort:** 3 hrs

---

## P2 — Eliminate DRY Violations

### P2-A Cache key consolidation
- **Problem:** Cache key generation exists in three places:
  - `src/lib/server/cache/redis-exact-match.ts` — SHA-256 of `model+messages+temp+maxTokens`
  - `src/lib/server/ai/llm-cache.ts` — separate hashing strategy
  - `src/lib/server/cache-keys.ts` — prefix constants only, no hash logic
- **Change:** Move all hash logic into `cache-keys.ts`. Export `generateCacheKey(opts)` as the single implementation. Both `redis-exact-match.ts` and `llm-cache.ts` import it.
- **Risk:** Low — purely internal refactor, no API shape change
- **Effort:** 45 min

### P2-B Scorer `interface` for retrieval ranking
- **Problem:** Three independent scorer implementations with no shared contract:
  - `retrieval/legal-pagerank.ts` — `rankByPageRank(docs, query)` → `RankedItem[]`
  - `retrieval/tfidf-scorer.ts` — `computeTFIDF(docs, query)` → `ScoredDocument[]`
  - `retrieval/gpu-reranker.ts` — `gpuRerank(queryVec, docs)` → `{ docs, source, rerankMs }`
- **Change:** Add to `src/lib/server/types/retrieval.ts`:
  ```typescript
  export interface ScorerResult { id: string; score: number; explain?: RankExplain; }
  export interface Scorer { score(docs: UnifiedRetrievalResult[], query: string): Promise<ScorerResult[]>; }
  ```
  Adapt all three to return `ScorerResult[]`. `sortByBestScore()` already handles the merge.
- **Effort:** 2 hrs

### P2-C Tool registry unification
- **Problem:** Tool definitions split between:
  - `src/lib/server/ai/contextual-tools.ts` — `CONTEXTUAL_TOOLS` (5 tools, Ollama function-calling format)
  - `src/mcp/index.ts` — MCP tool definitions (overlapping tools in MCP format)
- **Change:** Create `src/lib/server/ai/tool-registry.ts` as single source of truth. Both `contextual-tools.ts` and `mcp/index.ts` import from it and adapt to their format.
- **Effort:** 1.5 hrs

### P2-D Analytics event schema — export from types
- **Problem:** `AnalyticsEventType` enum and event shape defined in `event-logger.ts` but re-inlined in route handlers
- **Change:** Move `AnalyticsEventType`, `AnalyticsEvent`, `InferenceLogEntry` to `src/lib/server/types/index.ts` barrel. Remove duplicates from route files.
- **Effort:** 30 min

---

## P3 — Semantic Search Quality Improvements

### P3-A Cross-source reranking (RAG + Web + Codebase in one pass)
- **Prerequisite:** P0-D (web results as `UnifiedRetrievalResult`)
- **Change:** After ACE assembles context, run a single `sortByBestScore()` across `[...kbChunks, ...caseChunks, ...webResults, ...codebaseChunks]` before the reranker. Today, web results bypass the reranker entirely.
- **Files:** `src/lib/server/ace/context-assembler.ts`
- **Effort:** 1 hr

### P3-B `searchCodebasePgVector()` → use `fromRankedChunk()`
- **File:** `src/lib/server/retrieval/codebase-context.ts` (pgvector fallback path, added by linter)
- **Current:** `searchCodebasePgVector()` returns `RankedChunk[]` with extra `gpuCluster` / `pageRankScore` fields as a type cast
- **Change:** Map through `fromRankedChunk()` like the Qdrant path does; put `gpuCluster` and `pageRankScore` in `metadata`
- **Effort:** 20 min

### P3-C `codebase_chunks` vs `codebase_chunks_768` — collection name drift
- **Problem:** `refreshMetadataCache()` now correctly uses `codebase_chunks_768` (linter fixed this). But `searchQdrant()` also now targets `codebase_chunks_768`. Verify all index paths are consistent; old collection `codebase_chunks` may still be referenced in some routes.
- **Audit command:** `grep -rn "codebase_chunks[^_]" src/` — should return 0 hits
- **Effort:** 15 min

---

## P4 — QLoRA Self-Improvement Automation

The full self-improvement loop: inference → log → distill → train → deploy.

### P4-A Distillation trigger (idle task or queue consumer)
- See P1-B above.

### P4-B Training quality gate before checkpoint swap
- **Problem:** When a new QLoRA checkpoint is produced, there's no automated quality gate before it replaces `gemma4-rotorquant:latest` in Ollama.
- **Change:** Add a `POST /api/admin/model/validate-checkpoint` endpoint that:
  1. Loads the new checkpoint into a temporary Ollama tag
  2. Runs 10 golden test prompts from `qlora_examples` (the highest-scoring ones)
  3. Scores responses via the cross-encoder reranker
  4. Returns pass/fail with per-prompt scores
  5. Only triggers `ollama cp` on pass (avg score ≥ 0.75)
- **Effort:** 3 hrs

### P4-C Dataset split management
- **Problem:** `qlora_examples` has `dataset_split` column (`train`/`eval`/`test`) but it's always NULL — no split assignment logic exists.
- **Change:** In `POST /api/analytics/qlora-dataset`, assign splits: 80% train, 10% eval, 10% test (stratified by `quality_tier`). Eval/test sets should be frozen after first assignment.
- **Files:** `src/routes/api/analytics/qlora-dataset/+server.ts`
- **Effort:** 45 min

---

## P6 — Feature Mapping Atlas & Semantic Codebase Continuity

Transform the codebase from a set of files into a time-aware, topologically-ordered knowledge atlas.

### P6-A `record-feature-implementation.ts` — automated annotation
- **Goal:** Every major build task writes a durable record (`feature:ID`) containing intent, diff, dependencies, and coordinates.
- **Tasks:**
  - Create `scripts/features/record-feature-implementation.ts`.
  - Use `rg` and AST scanning (via `ts-morph` or `clang`) to extract static vs. dynamic imports.
  - Snapshot `package.json` versions and implementation prompt hashes.
- **Effort:** 3 hrs

### P6-B `context.prefetch_feature_context` — recommendation engine
- **Goal:** Prefetch related context (files, prior errors, topology neighbors) *before* the LLM starts editing.
- **Tasks:**
  - Implement MCP tool `context.prefetch_feature_context`.
  - Use GPU SOM/manifold4 coordinates for neighborhood lookup in Qdrant.
  - Incorporate "Knowledge Delta" (Gemma4 belief vs. actual AST truth).
- **Effort:** 4 hrs

### P6-C Activity-Aware Prefetch (VS Code + rg)
- **Goal:** Log developer activity (files opened, symbols selected) to steer prefetch relevance.
- **Tasks:**
  - Implement `scripts/activity/log-developer-activity.mjs` using `rg` to scan for recently modified symbols/files.
  - Process logs using **GNU Awk** for high-performance extraction of "hot" areas.
- **Effort:** 2 hrs

---

## P7 — Production Hardening (SvelteKit 2 + Drizzle-ORM)

Finalize the transition to a byte-stable, high-concurrency production stack.

### P7-A Drizzle-ORM Migration & PGVector Stabilization
- **Goal:** Zero-downtime migrations for `feature_implementations` and `error_fingerprints` tables.
- **Tasks:**
  - Audit `drizzle/` migrations against production `legal_ai_db`.
  - Verify HNSW index performance for 768d pgvector embeddings.
- **Effort:** 2 hrs

### P7-B Native Bridge (Clang) & Multi-Stream Concurrency
- **Goal:** Harden the LibTorch bridge for production loads using Clang/LLVM.
- **Tasks:**
  - Validate native N-API bridge compilation via Clang.
  - Implement Bounded CUDA stream concurrency (8GB VRAM limit).
- **Effort:** 3 hrs

---

## Quick-Wins (< 30 min each)

| # | Task | File | What |
|---|------|------|------|
| QW-1 | `codebase_chunks` collection drift audit | `grep -rn "codebase_chunks[^_]" src/` | Should be 0 hits |
| QW-2 | `searchCodebasePgVector()` → `fromRankedChunk()` | `retrieval/codebase-context.ts:403` | 10-line change |
| QW-3 | Export `AnalyticsEventType` from types barrel | `server/types/index.ts` | Add re-export |
| QW-4 | `ACE_PIPELINE_VERSION` bump after `UnifiedRetrievalResult` wire | `ace/context-assembler.ts:204` | `'1.0.0'` → `'2.0.0'` (invalidates stale ace_chunks cache) |
| QW-5 | Add `tags: string[]` to `ACEContext.codebaseContext` type | `ace/types.ts:142` | Pass through from `UnifiedRetrievalResult.tags` |
| QW-6 | Wire `sortByBestScore` + `assignRanks` after `dedup` in `fetchRAGChunks` | `ace/context-assembler.ts:1212` | Replace manual `.sort().slice()` with pipeline helpers |

---

## Priority Order

```
P0 (unify retrieval) → P1-A (prompt leaderboard → ACE) → QW-4 (version bump)
                     → P2-A (cache keys) → P3-A (cross-source rerank)
                     → P6-A (feature recording) → P6-C (activity logging)
                     → P1-B (QLoRA distillation trigger) → P4-A/C
                     → P2-B (scorer interface) → P6-B (prefetch tool)
                     → P7-A/B (prod hardening) → P4-B (quality gate) → P5-A/B
```

**ROI ranking:** P0 (architectural completeness) > P1-A (closes feedback loop) > P2-A (code hygiene) > P3-A (search quality) > P4 (self-improvement) > P5 (observability)

---

## Files Modified This Session (for reference)

| File | Change |
|------|--------|
| `src/lib/server/types/retrieval.ts` | NEW — canonical `UnifiedRetrievalResult` + 6 normalizers + 4 pipeline helpers |
| `src/lib/server/types/index.ts` | Added retrieval type + normalizer exports |
| `src/lib/server/ace/context-assembler.ts` | `RAGChunk = UnifiedRetrievalResult`; KB/case/cached chunks use `fromQdrantPoint()`/`fromContextDoc()` |
| `src/lib/server/retrieval/codebase-context.ts` | `loadCodebaseContext()` → `chunks: UnifiedRetrievalResult[]` via `fromRankedChunk()` |
| `src/routes/api/sse/chat/+server.ts` | 3 `codebaseResult.chunks` accessors updated for new type |
| `src/routes/api/codebase-index/tags/+server.ts` | Added `DELETE` handler |
| `src/lib/components/codebase/TagDeleteDialog.svelte` | NEW — red-toned delete confirmation dialog |
| `src/routes/(app)/admin/codebase-viewer/+page.svelte` | Tag Browser tab + rename + delete wired |
| `tests/routes/codebase-index-tags-delete.test.ts` | NEW — 8 test cases (G26 pattern) |
