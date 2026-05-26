# Search Intelligence — Feature Documentation

**Last updated:** 2026-04-17  
**Status:** Production-ready  
**Admin UI:** `/admin/search-intelligence`  
**API:** `GET /api/analytics/search-patterns`

---

## Overview

Search Intelligence is a live analytics and self-improvement layer that turns every retrieval event into a feedback signal. It has three interlocking parts:

1. **Analytics collection** — fire-and-forget writes on every search (`search-analytics.ts`)
2. **Search Patterns API** — aggregates and exposes the data to the admin UI
3. **Search Intelligence UI** — admin dashboard at `/admin/search-intelligence`

The collected signals feed back into ACE context assembly (prompt leaderboard → `queryTags`, cross-source reranking via P3-A) and QLoRA distillation (chunk quality → curriculum weighting).

---

## Data Stores

| Store | Key / Table | What |
|-------|-------------|------|
| Redis sorted set | `analytics:hot_queries` | query hash → frequency; 7-day rolling window |
| Redis hash | `analytics:query_vecs` | hash → `{query, sketch, pipeline, cacheHit, firstSeen}`; 7-day TTL |
| Redis hash | `analytics:variance_pairs` | pair key → hit count; fast in-process read for query expander |
| Postgres | `chunk_hit_log` | per-retrieval row: chunk_id, pipeline, query_hash, score, rerank_score |
| Postgres | `rag_query_log` | per-query row: full ACE metadata, timing, entity lists |
| Postgres | `query_variance_pairs` | durable Bifrost L2 match pairs; upserts on canonical pair key |

---

## Analytics Collection (`search-analytics.ts`)

All write functions are **fire-and-forget** (`Promise.catch(() => {})`) — they never block the retrieval path.

### `recordSearchQuery(opts)`
Increments the hot-query ring buffer in Redis and stores a 64-dim embedding sketch for offline variance computation.

```typescript
recordSearchQuery({
  query:    'What is hearsay evidence?',
  embedding: queryVector,   // optional 768-dim; first 64 stored as sketch
  pipeline: 'ace',
  cacheHit: false,
  userId:   userId,
});
```

### `recordChunkHits(hits, query, pipeline, opts)`
Bulk-inserts into `chunk_hit_log` for every chunk shown to the user. Used for chunk quality signals and pipeline memory analytics.

```typescript
recordChunkHits(
  kbChunks.map(c => ({ id: c.id, score: c.score, rerankScore: c.rerankScore })),
  query, 'ace', { userId, caseId }
);
```

### `recordQueryLog(entry)`
Persists a full `QueryLogEntry` to `rag_query_log` including timing, entity lists, DAG status, and top-chunk scores. Used for QLoRA distillation eligibility.

### `recordVariancePair(opts)`
Records a Bifrost L2 cache hit pair (incoming query A matched cached query B). Upserts in Postgres and increments the Redis pair counter. Feeds the "variance pairs" panel in the UI.

---

## Read-side API (`search-analytics.ts`)

| Export | What it returns |
|--------|----------------|
| `getHotQueries(topN)` | Top-N query texts with hit counts from Redis sorted set |
| `getClusterHeatMap(days)` | GPU cluster → total_hits, unique_queries, avg_rerank from `chunk_hit_log` |
| `getChunkQualitySignals(limit, days)` | Per-chunk quality score = hit_count × avg_rerank |
| `getVariancePairs(opts)` | Variance pairs filtered by temperature-derived similarity threshold |
| `getDidYouMeanSuggestions(query, temp, limit)` | Redis Jaccard + pg_trgm similarity matches |
| `getAllQuerySketches()` | All 64-dim embedding sketches (capped at 500) for offline variance compute |

---

## Search Patterns API

### `GET /api/analytics/search-patterns`

**Auth:** `locals.user` required (returns 401 otherwise)

**Query params:**

| Param | Default | Range | Effect |
|-------|---------|-------|--------|
| `days` | `7` | 1–30 | Rolling lookback window for all SQL queries |
| `temperature` | `0.5` | 0–1 | Maps to `minSimilarity = 1 - temp*0.5`; gates variance pair threshold |
| `q` | `''` | regex | Server-side regex filter applied to hot queries |
| `suggest` | `''` | string | Triggers "did you mean" search against hot-query ring |

**Response shape:**

```typescript
{
  hotQueries:          { query: string; hits: number; hash: string }[];
  clusterHeat:         { gpu_cluster: number; total_hits: number; unique_queries: number; avg_rerank: number | null }[];
  variancePairs:       { query_a: string; query_b: string; similarity: number; hit_count: number }[];
  chunkQuality:        { chunk_id: string; relative_path: string | null; hit_count: number; avg_rerank: number | null; unique_queries: number; pipelines: string[]; quality_score: number }[];
  pipelineMemory:      { pipeline: string; total_hits: number; unique_chunks: number; unique_queries: number; avg_rerank: number | null; top_chunk_path: string | null }[];
  crossPipelineChamps: { chunk_id: string; relative_path: string | null; pipeline_count: number; pipelines: string; total_hits: number; avg_rerank: number | null; quality_score: number }[];
  trending:            { query_hash: string; query: string | null; recent_hits: number; prior_hits: number; growth_rate: number }[];
  didYouMean:          { suggestion: string; similarity: number; hitCount: number; source: 'redis' | 'pg' }[];
  qloraStats:          { quality_tier: string; cnt: number; avg_score: number }[];
  meta:                { windowDays: number; temperature: number; minSimilarity: number; qFilter: string | null; suggestFor: string | null };
}
```

**Degraded contract:** All arrays default to `[]` on error; `meta` always present. No `500` responses — errors are swallowed per project convention.

---

## Admin UI (`/admin/search-intelligence`)

Four tabs, all driven by a single `fetch('/api/analytics/search-patterns?...')` call:

### Queries tab
- **Hot Queries** — bar chart of top 20 queries by frequency; regex-filterable
- **Trending** — queries with highest 24h growth rate (recent_hits / prior_hits per day)
- **Variance Pairs** — semantically similar query pairs; temperature slider controls threshold
- **Did You Mean** — semantic suggestion box for any typed query

### Pipeline tab
- **Pipeline Memory** — per-pipeline hit/quality breakdown (ACE, KAG, DAG, RAG, reranker, codebase)
- **Cross-Pipeline Champions** — chunks consistently retrieved by ≥2 pipelines (universal relevance signal)
- **GPU Cluster Heatmap** — which k-means clusters are hottest in the window

### Chunks tab
- **Chunk Quality Signals** — top 20 chunks by quality score (hit_count × avg_rerank); table with pipeline tags

### Training tab
- **QLoRA Stats** — quality tier breakdown (gold/silver/bronze) with stacked bar
- **Distillation Runner** — trigger `POST /api/analytics/qlora-dataset` with dry-run option

---

## ACE Integration

### P1-A — Prompt leaderboard → `queryTags`
`context-assembler.ts` calls `fetchTopQueryTags(5)` which reads the Redis `typing:prompt:clicks` sorted set and injects the top-scoring prompts for the current practice area into `ACEContext.queryTags`.

### P3-A — Cross-source reranking
After the parallel fetch resolves, `assembleACEContext` calls `webSearchToUnified(webResults)` and merges web hits into the `ragChunks` pool:
```typescript
const webUnified = webResults ? webSearchToUnified(webResults) : [];
if (webUnified.length) {
  baseContext.ragChunks = assignRanks(sortByBestScore([
    ...baseContext.kbChunks,
    ...baseContext.caseChunks,
    ...webUnified,
  ]));
}
```
Web results that score higher than existing KB/case chunks bubble up into the unified context slot. `ACE_PIPELINE_VERSION` was bumped to `'2.0.0'` to invalidate stale `ace_chunks` cache rows.

---

## QLoRA Feedback Loop

```
chunk_hit_log (every retrieval)
  ↓
getChunkQualitySignals() → quality_score = hit_count × avg_rerank
  ↓
POST /api/analytics/qlora-dataset (distillation trigger)
  → scans rag_query_log WHERE rerank_score ≥ 0.80 AND self_eval_score ≥ 0.80
  → inserts into qlora_examples with Alpaca format
  ↓
GET /api/analytics/qlora-dataset?export=jsonl
  → feed to Colab QLoRA training notebook
  → updated gemma4-rotorquant:latest checkpoint
```

P1-B (scheduled distillation trigger) will automate the nightly step.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/server/analytics/search-analytics.ts` | All write + read functions; Redis + Postgres |
| `src/routes/api/analytics/search-patterns/+server.ts` | Aggregates into single response for admin UI |
| `src/routes/(app)/admin/search-intelligence/+page.svelte` | 4-tab admin dashboard (Svelte 5 runes) |
| `src/lib/server/ace/context-assembler.ts` | P1-A (query tags) + P3-A (cross-source reranking) |
| `src/lib/server/retrieval/web-search.ts` | `webSearchToUnified()` — web hits → UnifiedRetrievalResult |
