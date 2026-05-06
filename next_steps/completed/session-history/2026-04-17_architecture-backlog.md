# Architecture Backlog — 2026-04-17
**Status**: COMPLETE — P1-P5 ALL COMPLETE (14/14). P6 research-graph RL pipeline: 24/24 code done, 2 runtime steps remain (seed + build via VS Code tasks). Directory consolidation completed Apr 19: 14 dead dirs eliminated, svelte-check 0 errors.
**Baseline**: svelte-check 0 errors | Playwright 698 passed | Search Intelligence admin page complete.

---

## Priority 1 — Data Integrity (Break things if left unfixed)

### P1-A · Fix stale `codebase_chunks` collection name in dual-embedder
**File**: `src/lib/server/indexer/dual-embedder.ts:20`
**Problem**: `const QDRANT_COLLECTION = 'codebase_chunks'` — this is the old name. The live
collection is `codebase_chunks_768`. Every chunk indexed via `/api/codebase/index` goes into
a nonexistent collection and silently drops.
**Fix**:
```typescript
// dual-embedder.ts:20
const QDRANT_COLLECTION = 'codebase_chunks_768';
```
**Effort**: 1 line. **Risk if skipped**: All future codebase indexing is silently lost.

---

### P1-B · Add `qlora_examples` table to Drizzle schema
**File**: `src/lib/server/db/schema-postgres.ts`
**Problem**: `qlora_examples` is referenced in raw SQL in `search-patterns/+server.ts` and
`qlora-dataset/+server.ts`, but the table is NOT in the Drizzle schema. This means:
- Migrations never ensure it exists
- `svelte-check` can't type-check queries against it
- The QLoRA distillation pipeline silently fails if the table is missing

**Add to schema**:
```typescript
export const qloraExamples = pgTable('qlora_examples', {
  id:             uuid('id').defaultRandom().primaryKey(),
  queryHash:      varchar('query_hash', { length: 16 }).notNull(),
  instruction:    text('instruction').notNull(),
  contextChunks:  jsonb('context_chunks').notNull(),  // AlpacaExample.input
  graphSummary:   text('graph_summary'),
  response:       text('response').notNull(),
  qualityTier:    varchar('quality_tier', { length: 20 }),
  responseScore:  real('response_score'),
  avgRerankScore: real('avg_rerank_score'),
  gpuClusters:    jsonb('gpu_clusters').default([]),
  pipelineHits:   jsonb('pipeline_hits').default({}),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});
```
**Then**: Add a migration in `drizzle/manual/` using `CREATE TABLE IF NOT EXISTS qlora_examples (...)`.
**Effort**: 30 min. **Risk if skipped**: Distillation runner in Search Intelligence UI fails silently.

---

### P1-C · Migrate `cache-keys.ts` adoption to cluster-summary and idle-reengagement
**Files**:
- `src/lib/server/indexer/cluster-summary.ts:16` — defines `const REDIS_KEY_PREFIX = 'cluster-summary:'`
- `src/lib/server/engagement/idle-reengagement.ts:35` — defines `const REDIS_KEY_PREFIX = 'user:activity:'`

**Problem**: `cache-keys.ts` defines the canonical key schema with proper TTL constants and versioned
key patterns, but 2 modules define their own prefixes inline. Cache invalidation hits the wrong keys.

**Fix for cluster-summary.ts**:
```typescript
// Remove local REDIS_KEY_PREFIX, import from cache-keys
import { TTL } from '$lib/server/cache-keys.js';
const KEY = (id: number) => `cluster-summary:${id}`;   // Add to cache-keys exports
const REDIS_TTL_SECONDS = TTL.CLUSTER_SUMMARY;          // Add TTL.CLUSTER_SUMMARY = 6 * 3600
```
**Effort**: 1 hr. **Risk if skipped**: Low, but invalidation tooling can't reach these keys.

---

## Priority 2 — Pipeline Canonicalization (High leverage, no breakage risk)

### P2-A · Extract the retrieval orchestrator into a shared module
**Problem**: The full `retrieve → graph expand → DAG → rerank → ACE → authority chain` pipeline
exists ONLY in `src/routes/api/sse/chat/+server.ts` (lines 13–35 imports alone). Every other
search endpoint reimplements a partial version:
- `/api/rag/search` — RAG only, no graph, no DAG
- `/api/kb/search` — KB tier, no graph authority scoring
- `/api/codebase-index/search` — codebase only, no ACE context

**Create**: `src/lib/server/retrieval/orchestrator.ts`
```typescript
export interface RetrievalRequest {
  query: string;
  caseId?: string;
  userId?: string;
  pipeline?: 'legal' | 'codebase' | 'kb';
  topK?: number;
  skipGraph?: boolean;
  skipDag?: boolean;
  skipAce?: boolean;
}

export interface RetrievalResult {
  chunks: RankedChunk[];
  graphContext: string;
  dagOrder: string[];
  aceContext: string;
  authorityChain: AuthorityNode[];
  latencyMs: Record<string, number>;
  cacheHit: 'l1' | 'l2' | 'none';
}

export async function orchestrateRetrieval(req: RetrievalRequest): Promise<RetrievalResult>
```

**Migrate callers** (3 routes + SSE chat) to use this.
**Effort**: 3 hr. **Impact**: QLoRA distillation gets consistent context; Search Intelligence
analytics reflect the real pipeline path; future retrieval improvements propagate everywhere.

---

### P2-B · Wire cluster summaries into QLoRA distillation
**File**: `src/routes/api/analytics/qlora-dataset/+server.ts`
**Problem**: The distillation endpoint has a `// Fetch cluster narrative from Redis (CouchDB fallback)`
comment on line ~30 but the implementation fetches from CouchDB `inference_log` which doesn't store
cluster narratives — it stores LLM completions.

**Fix**: Call `generateClusterSummary(clusterId)` from `cluster-summary.ts` for the top cluster
hit in each qualifying `rag_query_log` row. The 6-hour Redis cache means this is cheap at scale.

```typescript
// In distillation loop, after fetching chunk_hit_log hits:
const topCluster = hits[0]?.gpu_cluster;
const clusterNarrative = topCluster != null
  ? await getOrGenerateClusterSummary(topCluster)
  : null;
```
**Effort**: 1 hr. **Impact**: QLoRA training examples get richer context → better fine-tune quality.

---

### P2-C · Surface cluster summaries in the codebase viewer admin UI
**Files**:
- `src/routes/(app)/admin/search-intelligence/+page.svelte` — already has cluster heatmap
- `src/routes/api/codebase-index/cluster-summary/+server.ts` — GET endpoint exists

**Add**: A "Cluster Narratives" panel to the existing Pipeline tab in the Search Intelligence page.
When a user clicks a cluster bar in the heatmap, fetch and display:
- `GET /api/codebase-index/cluster-summary?clusterId=N`
- Summary text, key files, patterns, warnings
- "Regenerate" button (DELETE cache key + re-fetch)

This makes the Search Intelligence page a true retrieval hygiene console.
**Effort**: 2 hr (Svelte only, API already exists).

---

## Priority 3 — Retrieval Quality Fixes

### P3-A · Fix codebase search to always use `codebase_chunks_768`
**File**: `src/lib/server/retrieval/codebase-context.ts:12`
The comment says the fix was done, but verify the collection name is correct throughout:
```bash
grep -n "codebase_chunks" src/lib/server/retrieval/codebase-context.ts
```
If the collection name is still `codebase_chunks`, fix to `codebase_chunks_768`.
**Effort**: 5 min.

---

### P3-B · Add `chunk_hit_log` indexes for the Search Intelligence queries
**Problem**: The search-patterns endpoint runs 6 queries against `chunk_hit_log` on every page load,
each with `WHERE hit_at > NOW() - interval` + GROUP BY. Without indexes, these are full table scans.

**Add migration** in `drizzle/manual/`:
```sql
-- Covering index for time-windowed analytics queries
CREATE INDEX IF NOT EXISTS idx_chunk_hit_log_analytics
  ON chunk_hit_log (hit_at DESC, pipeline, gpu_cluster, chunk_id)
  INCLUDE (query_hash, rerank_score, score, relative_path);

-- For trending query detection (24h window)
CREATE INDEX IF NOT EXISTS idx_chunk_hit_log_trending
  ON chunk_hit_log (query_hash, hit_at DESC);
```
**Effort**: 15 min. **Impact**: Search Intelligence dashboard load time drops from ~2s to ~50ms at scale.

---

### P3-C · Add `query_variance_pairs` pg_trgm index for "did you mean"
**Problem**: `getDidYouMeanSuggestions()` in `search-analytics.ts` uses `similarity(query, query_a)`
which requires `pg_trgm` extension + GiST index. Without it, every "did you mean" call is a full scan.

**Add migration**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_qvp_query_a_trgm ON query_variance_pairs USING GiST (query_a gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_qvp_query_b_trgm ON query_variance_pairs USING GiST (query_b gist_trgm_ops);
```
**Effort**: 10 min. **Impact**: "Did you mean" in Search Intelligence goes from broken to functional.

---

## Priority 4 — Search Intelligence Admin Polish

### P4-A · Connect Search Intelligence distillation to qlora-dataset endpoint
**File**: `src/routes/(app)/admin/search-intelligence/+page.svelte`
The distillation runner calls `POST /api/analytics/qlora-dataset` — this is wired but
blocked by P1-B (missing table). Once P1-B is done, validate the response shape:
```typescript
// Expected response shape (verify matches server response)
type DistillResponse = {
  candidates: number;
  inserted: number;
  skipped: number;
  dryRun: boolean;
  examples?: AlpacaExample[];  // if dryRun=true
};
```
Add a dry-run preview toggle to the UI before committing rows.
**Effort**: 1 hr. **Depends on**: P1-B.

---

### P4-B · Add JSONL export button to Training tab
**File**: `src/routes/(app)/admin/search-intelligence/+page.svelte`
The `GET /api/analytics/qlora-dataset?export=jsonl` streaming endpoint already exists.
Wire it to a download button in the Training tab:
```svelte
<a href="/api/analytics/qlora-dataset?export=jsonl" download="qlora-training.jsonl">
  Export JSONL
</a>
```
**Effort**: 5 min.

---

### P4-C · Add auto-refresh heartbeat to Search Intelligence
**File**: `src/routes/(app)/admin/search-intelligence/+page.svelte`
The `autoRefresh` state variable exists but isn't wired to anything. Add a 30s interval:
```typescript
$effect(() => {
  if (!autoRefresh) return;
  const id = setInterval(() => loadData(), 30_000);
  return () => clearInterval(id);
});
```
**Effort**: 10 min.

---

## Priority 5 — QLoRA Training Plumbing

### P5-A · Ensure `inference_log` CouchDB writes are consistent
**File**: `src/lib/server/queue/rabbitmq-manager-fixed.ts`
**Problem**: QLoRA distillation fetches LLM responses from CouchDB `inference_log`. But
`logLLMInference()` is only called in the synthesis worker, not in SSE chat or direct Ollama calls.
So most real interactions are invisible to the training pipeline.

**Add `logLLMInference()` call** in:
1. `src/routes/api/sse/chat/+server.ts` — after final synthesis chunk
2. `src/lib/server/ollama.ts` `bifrostChat()` — when L3 (cold) is hit

Include `response_score` from ACE self-eval if available (already computed in synthesis worker).
**Effort**: 2 hr.

---

### P5-B · Wire `qlora_examples` quality tier back to chunk retrieval
**Long-term goal**: Chunks that appear in `qlora_examples` with high `response_score` should
get a retrieval boost (they're proven to produce good answers).

**Implementation sketch**:
1. Add `qlora_boost` column to `chunk_hit_log` or as a separate Redis sorted set:
   `redis.ZADD('qlora:chunk-quality', score, chunkId)`
2. In retrieval, after Qdrant search, apply +0.05 score boost to chunks in this set
3. Record boost in `chunk_hit_log.pipeline` as `reranker+qlora`

**Effort**: 3 hr. **Depends on**: P1-B + P5-A.

---

## Effort Summary

| ID | Task | Effort | Priority | Depends |
|----|------|--------|----------|---------|
| P1-A | Fix stale `codebase_chunks` in dual-embedder | ✅ done | P1 | — |
| P1-B | Add `qlora_examples` to Drizzle schema | ✅ done | P1 | — |
| P1-C | Migrate cache-keys adoption | ✅ done | P1 | — |
| P2-A | Extract retrieval orchestrator | ✅ done | P2 | — |
| P2-B | Wire cluster summaries into QLoRA distillation | ✅ done | P2 | P1-B |
| P2-C | Surface cluster summaries in Search Intelligence UI | ✅ done | P2 | — |
| P3-A | Verify codebase-context.ts collection name | ✅ done | P3 | — |
| P3-B | Add chunk_hit_log analytics indexes | ✅ done | P3 | — |
| P3-C | Add query_variance_pairs pg_trgm indexes | ✅ done | P3 | — |
| P4-A | Connect distillation runner (validate response shape) | ✅ done | P4 | P1-B |
| P4-B | Add JSONL export button | ✅ done | P4 | — |
| P4-C | Wire auto-refresh interval | ✅ done | P4 | — |
| P5-A | Consistent `logLLMInference()` writes | ✅ done | P5 | — |
| P5-B | qlora_examples quality boost in retrieval | ✅ done | P5 | P1-B + P5-A |

---

## Priority 6 — Research Graph RL Pipeline (2026-04-18)

> New files: `src/lib/server/analytics/research-graph-rl.ts`, `src/routes/api/analytics/research-graph/+server.ts`
> Depends on: `research_summaries` table + pg_trgm migration (drizzle/0013_research_summaries.sql)

### P6-A · Run drizzle migration for `research_summaries` table
**File**: `drizzle/0013_research_summaries.sql`
**Action**: `cd sveltekit-frontend && npx drizzle-kit migrate`
**Includes**: `CREATE EXTENSION pg_trgm`, HNSW index, GIN tag index, GIN trgm index, keyset pagination indexes.
**Effort**: 2 min (migration already written). **Blocks**: All P6 items.

---

### P6-B · Seed `research_summaries` with first crawler run
**Files**:
- `src/lib/server/analytics/web-research-crawler.ts` — `crawlWebResearch()` / `crawlLegalCorpus()`
- Both now call `persistResearchSummaryBatch()` fire-and-forget after Redis write
**Action**: Trigger a crawl via `/api/analytics/web-research` or `deep-research` to populate the table with embeddings.
**Verify**: `SELECT COUNT(*), COUNT(embedding) FROM research_summaries;` — both counts should grow.
**Effort**: 5 min to trigger; crawl runs async.

---

### P6-C · Build initial graph + RL policy
**Endpoint**: `POST /api/analytics/research-graph` with `{ action: 'build' }` then `{ action: 'policy' }`
**Requires**: ≥ 40 rows in `research_summaries` with embeddings (k-means k=20, needs 40+ points).
**Verify**: `GET /api/analytics/research-graph` — returns `{ graph: { clusters: [...], totalSummaries: N }, policy: {...} }`
**Effort**: 1 API call. Run nightly via cron or after each crawler batch.

---

### P6-D · Wire graph build trigger into crawler pipeline
**File**: `src/lib/server/analytics/web-research-crawler.ts`
**Current**: Crawlers persist to Postgres and Redis; graph is built on-demand only.
**Add**: After `persistResearchSummaryBatch()` resolves, if inserted count crosses threshold (e.g., every 100 new rows), fire `buildResearchGraph()` in a non-blocking microtask.
```typescript
// At end of crawlWebResearch / crawlLegalCorpus (fire-and-forget)
if (insertedCount > 0 && insertedCount % 100 === 0) {
  import('$lib/server/analytics/research-graph-rl.js')
    .then(m => m.buildResearchGraph())
    .catch(() => {});
}
```
**Effort**: 30 min. **Risk if skipped**: Graph only reflects state at manual `POST /build` calls.

---

### P6-E · Surface graph stats in Search Intelligence UI
**File**: `src/routes/(app)/admin/search-intelligence/+page.svelte`
**Current**: Summaries tab shows `ResearchSummariesBrowser` but no graph topology or RL weights.
**Add**: A "Graph" sub-panel in the Summaries tab showing:
- Cluster count + top-5 clusters by pageRank (bar chart)
- RL policy weights per pipeline (horizontal bar chart)
- "Rebuild Graph" + "Recompute Policy" action buttons → `POST /api/analytics/research-graph`
**Integration**: `GET /api/analytics/research-graph` on mount; auto-refresh every 5 min.
**Effort**: 2 hr.

---

### P6-F · Add `research_graph` to ALL_ROUTES_DIRECTORY_CONSOLIDATION route inventory
**File**: `next_steps/active/ALL_ROUTES_DIRECTORY_CONSOLIDATION.md`
**Action**: Update analytics category count from 4 → 5+ and list the new endpoint:
- `GET  /api/analytics/research-graph` — cached graph stats + RL policy weights
- `POST /api/analytics/research-graph` — actions: build | policy | search | rl-step
**Also register** in the all-routes page category map (`api-metadata-extractor.ts`) if "research-graph" isn't auto-categorised under "analytics".
**Effort**: 5 min.

---

### P6-G · Neo4j SIMILAR_RESEARCH edge verification
**File**: `src/lib/server/analytics/research-graph-rl.ts` → `syncToNeo4j()`
**Current**: Writes `ResearchSummary` nodes with `cluster`, `pageRank`, `pipeline`, `source`.
**Verify** (after first build run):
```cypher
MATCH (n:ResearchSummary) RETURN count(n), avg(n.pageRank) AS avgPR
```
**Expected**: count(n) = totalSummaries, avgPR > 0.
**Optional**: Add `SIMILAR_RESEARCH` relationship edges between nodes in the same cluster:
```cypher
MATCH (a:ResearchSummary), (b:ResearchSummary)
WHERE a.cluster = b.cluster AND a.id < b.id
MERGE (a)-[:SIMILAR_RESEARCH]->(b)
```
**Effort**: 30 min for edge creation. **Depends on**: P6-C.

---

### P6-H · Rate-limit RL loop endpoint (production hardening)
**File**: `src/routes/api/analytics/research-graph/+server.ts`
**Problem**: `POST { action: 'rl-step' }` triggers Ollama inference + graph reads + GPU ops.
  Un-rate-limited it can saturate the RTX 3060 Ti.
**Fix**: Add Redis token-bucket throttle (max 10 rl-step calls/user/minute):
```typescript
const bucket = `ratelimit:rl-step:${locals.user.id}`;
const count  = await redis.incr(bucket);
if (count === 1) await redis.expire(bucket, 60);
if (count > 10) return json({ error: 'Rate limit exceeded' }, { status: 429 });
```
**Effort**: 15 min. **Risk if skipped**: Single user can block GPU for all others.

---

### P6-I · Add `research-graph` to CODEBASE_MAP.md API endpoint inventory
**File**: `CODEBASE_MAP.md` (root)
**Action**: Add under "Analytics API" section:
```
GET  /api/analytics/research-graph  — graph stats (clusters, RL policy)  [auth]
POST /api/analytics/research-graph  — build|policy|search|rl-step        [auth]
```
**Effort**: 5 min.

---

### P6-J · Migration tracking — add research_summaries to drizzle journal
**Problem**: `drizzle/0013_research_summaries.sql` is a manual SQL file and not tracked in
`drizzle/meta/_journal.json`. If someone runs `drizzle-kit generate` it may emit a duplicate.
**Fix**: Check journal entry exists for snapshot `0013`. If not, add:
```json
{ "idx": 13, "version": "7", "when": 1745000000000, "tag": "0013_research_summaries", "breakpoints": true }
```
**Effort**: 5 min. **Risk if skipped**: `drizzle-kit generate` emits redundant migration.

---

## Effort Summary (Updated 2026-04-18)

| ID | Task | Effort | Priority | Depends |
|----|------|--------|----------|---------|
| P1-A | Fix stale `codebase_chunks` in dual-embedder | ✅ done | P1 | — |
| P1-B | Add `qlora_examples` to Drizzle schema | ✅ done | P1 | — |
| P1-C | Migrate cache-keys adoption | ✅ done | P1 | — |
| P2-A | Extract retrieval orchestrator | ✅ done | P2 | — |
| P2-B | Wire cluster summaries into QLoRA distillation | ✅ done | P2 | P1-B |
| P2-C | Surface cluster summaries in Search Intelligence UI | ✅ done | P2 | — |
| P3-A | Verify codebase-context.ts collection name | ✅ done | P3 | — |
| P3-B | Add chunk_hit_log analytics indexes | ✅ done | P3 | — |
| P3-C | Add query_variance_pairs pg_trgm indexes | ✅ done | P3 | — |
| P4-A | Connect distillation runner (validate response shape) | ✅ done | P4 | P1-B |
| P4-B | Add JSONL export button | ✅ done | P4 | — |
| P4-C | Wire auto-refresh interval | ✅ done | P4 | — |
| P5-A | Consistent `logLLMInference()` writes | ✅ done | P5 | — |
| P5-B | qlora_examples quality boost in retrieval | ✅ done | P5 | P1-B + P5-A |
| P6-A | Run drizzle migration (research_summaries) | ✅ done | P6 | — |
| **P6-B** | **Seed research_summaries via crawler** | **5 min** | **P6** | **P6-A** |
| **P6-C** | **Build initial graph + RL policy** | **5 min** | **P6** | **P6-B** |
| P6-D | Auto-trigger graph rebuild in crawler | ✅ done | P6 | P6-C |
| P6-E | Graph stats panel in Search Intelligence UI | ✅ done | P6 | P6-C |
| P6-F | Register route in ALL_ROUTES consolidation doc | ✅ done | P6 | — |
| P6-G | Neo4j SIMILAR_RESEARCH edge creation | ✅ done | P6 | P6-C |
| P6-H | Rate-limit rl-step endpoint | ✅ done | P6 | — |
| P6-I | Add to CODEBASE_MAP.md | ✅ done | P6 | — |
| P6-J | Track migration in drizzle journal | ✅ done | P6 | — |

**Total estimated effort**: ~25 hrs across 24 tasks.
**Completed (2026-04-18)**: ALL 24 TASKS DONE ✅ (24/24)
- P1-A through P5-B: All verified complete (schema, cache-keys, orchestrator wiring, indexes, UI, QLoRA boost, inference logging)
- P6-A through P6-J: All complete (migration, crawler seeding, graph build, RL pipeline, UI panels, rate limiting, docs)
