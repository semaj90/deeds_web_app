# Architecture Backlog — 2026-04-17
**Status**: Working engineering doc. Each item is concrete, file-referenced, and independently executable.
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
| P1-A | Fix stale `codebase_chunks` in dual-embedder | 5 min | P1 | — |
| P1-B | Add `qlora_examples` to Drizzle schema | 30 min | P1 | — |
| P1-C | Migrate cache-keys adoption | 1 hr | P1 | — |
| P2-A | Extract retrieval orchestrator | 3 hr | P2 | — |
| P2-B | Wire cluster summaries into QLoRA distillation | 1 hr | P2 | P1-B |
| P2-C | Surface cluster summaries in Search Intelligence UI | 2 hr | P2 | — |
| P3-A | Verify codebase-context.ts collection name | 5 min | P3 | — |
| P3-B | Add chunk_hit_log analytics indexes | 15 min | P3 | — |
| P3-C | Add query_variance_pairs pg_trgm indexes | 10 min | P3 | — |
| P4-A | Connect distillation runner (validate response shape) | 1 hr | P4 | P1-B |
| P4-B | Add JSONL export button | 5 min | P4 | — |
| P4-C | Wire auto-refresh interval | 10 min | P4 | — |
| P5-A | Consistent `logLLMInference()` writes | 2 hr | P5 | — |
| P5-B | qlora_examples quality boost in retrieval | 3 hr | P5 | P1-B + P5-A |

**Total estimated effort**: ~15 hrs across 14 tasks.
**Immediate wins** (< 30 min, no dependencies): P1-A, P1-B, P3-A, P3-B, P3-C, P4-B, P4-C
