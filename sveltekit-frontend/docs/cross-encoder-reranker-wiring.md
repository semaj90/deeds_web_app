# Cross-Encoder Reranker — Path Wiring Guide

**Module**: `src/lib/server/retrieval/cross-encoder-reranker.ts`
**Model**: `gemma4-legal:latest` (pointwise scoring, `format: 'json'`)
**Cache**: L0 result-set list (Redis, 1h TTL) + L1 per-score pairs (Redis, 24h TTL)
**Fallback**: Web search when `maxScore < 0.45`, then re-ranks expanded set

---

## When to Wire

Wire the cross-encoder when a route:
- Returns a **ranked list of text chunks or documents** to the client or LLM
- Already has a retrieval step (Qdrant vector search, BM42, graph expansion)
- Has **2 or more candidates** — single-item lists gain nothing

Do **not** wire when:
- The candidate list is always ≤ 1 item
- The route is on a hot path where adding 1-10 sequential Gemma4 calls (even at 5ms cached) is unacceptable latency — use `noFallback: true` + `topN` cap instead of skipping entirely
- The query string is unavailable (embedding-only routes with no natural-language query)

---

## Canonical Pipeline Position

```
Qdrant vector search   →   BM42 / hybrid fusion
        ↓
  Graph expansion (Neo4j neighbors + authority scoring)
        ↓
  [INSERT RERANKER HERE]  ← cross-encoder precision pass
        ↓
  ACE context assembly   →   LLM generation
```

The reranker sits **after** all retrieval and graph scoring, **before** context is serialised into the LLM prompt or ACE object. This ordering means:

1. Graph authority scores (`applyGraphAuthorityScoring`) already shifted `similarity` values — the reranker re-orders the post-graph list, not the raw Qdrant list.
2. The reranked `.rerankScore` values replace `.similarity` in downstream code so ACE assembly and citation ordering both see the final precision-ranked scores.

---

## Import

```typescript
import {
  rerankWithGemma4,
  type RerankCandidate,
  RERANK_FALLBACK_THRESHOLD,
} from '$lib/server/retrieval/cross-encoder-reranker.js';
```

> Use the `.js` extension. The module is side-effect-free and has no module-level I/O — safe to static-import in any server route.
>
> `rag/search` uses a **dynamic import** (`await import(...)`) inside a `use_rerank` feature flag guard. This is also valid — choose whichever matches the route's existing import style.

---

## Type Reference

```typescript
/** Input — extend with your chunk's own fields via the index signature */
interface RerankCandidate {
  documentId:     string;   // stable chunk/doc ID for cache keying
  content:        string;   // text scored by Gemma4 (truncated to 512 chars internally)
  retrievalScore: number;   // original Qdrant / BM42 score — preserved in result
  [key: string]:  unknown;  // spread your original chunk here for passthrough
}

/** Output per item */
interface RerankResult<T extends RerankCandidate> {
  doc:          T;       // original chunk object passed in
  rerankScore:  number;  // Gemma4 score 0–1
  cached:       boolean; // true = served from L1 Redis score cache
  listCached?:  boolean; // true = entire list served from L0 result-set cache (0 Gemma4 calls)
  originalRank: number;  // position in the input candidates array
}

/** Stats returned alongside results — use for observability metadata */
interface RerankStats {
  l0Hit:       boolean; // full list came from L0 cache
  l1Hits:      number;  // individual pairs from L1 cache
  l1Misses:    number;  // pairs that required Gemma4 scoring
  freshScored: number;  // Gemma4 calls made this request
}

/** Options */
interface RerankOptions {
  topN?:        number;  // max candidates to score (default 40)
  returnTopK?:  number;  // return at most this many (default 8)
  noFallback?:  boolean; // disable web search fallback (default false)
  minScore?:    number;  // filter out results below this (default 0)
  userId?:      string;  // for Langfuse analytics
}
```

---

## Minimal Wiring Template

```typescript
// After graph scoring, before ACE assembly:
if (contextDocs.length > 1) {
  try {
    const rrStart = performance.now();
    const candidates: RerankCandidate[] = contextDocs.map((d, i) => ({
      documentId:     d.documentId ?? `ctx-${i}`,
      content:        d.content,
      retrievalScore: d.similarity,
      ...d,  // pass through all fields so the original shape is preserved
    }));

    const { results: reranked, stats: rerankStats } = await rerankWithGemma4(
      query,
      candidates,
      {
        topN:        40,
        returnTopK:  Math.min(MAX_CHUNKS, contextDocs.length),
        userId:      locals.user?.id,
        noFallback:  false,
      }
    );

    if (reranked.length > 0) {
      const docMap = new Map(contextDocs.map((d) => [d.documentId, d]));
      contextDocs = reranked.map((r) => ({
        ...(docMap.get(r.doc.documentId) ?? contextDocs[r.originalRank]),
        similarity: r.rerankScore,  // overwrite similarity with precision score
      }));
    }

    // Observability metadata — include in response or log
    const cacheHitCount  = reranked.filter((r) => r.cached).length;
    const webFallback    = reranked.some((r) => (r.doc as Record<string, unknown>)['_webResult'] === true);
    const rerankMs       = Math.round(performance.now() - rrStart);
    const rerankMeta = {
      source:          webFallback ? 'fallback' : cacheHitCount === reranked.length ? 'redis' : 'gemma4',
      candidateCount:  candidates.length,
      topK:            reranked.length,
      cacheHitCount,
      webFallbackUsed: webFallback,
      maxScore:        reranked[0]?.rerankScore ?? 0,
      minScore:        reranked[reranked.length - 1]?.rerankScore ?? 0,
      latencyMs:       rerankMs,
      ...rerankStats,  // l0Hit, l1Hits, l1Misses, freshScored
    };

    console.log(
      `[Rerank] ${candidates.length}→${reranked.length} ` +
      `src=${rerankMeta.source} top=${rerankMeta.maxScore.toFixed(3)} ` +
      `l0=${rerankStats.l0Hit} l1=${rerankStats.l1Hits}/${candidates.length} ` +
      `${rerankMs}ms`
    );

  } catch (err) {
    console.warn('[Rerank] skipped:', err);
    // Non-fatal — contextDocs unchanged, pipeline continues
  }
}
```

---

## Existing Wired Paths (Reference Implementations)

### 1. `src/routes/api/synthesis/generate/+server.ts` (static import)

```typescript
import { rerankWithGemma4, type RerankCandidate } from '$lib/server/retrieval/cross-encoder-reranker.js';

// Inside POST handler, after ragChunks assembly:
if (context.ragChunks.length > 1) {
  try {
    const rrStart = performance.now();
    const candidates: RerankCandidate[] = context.ragChunks.map((c, i) => ({
      documentId:     `rag-${i}`,
      content:        c.content,
      retrievalScore: c.score,
      source:         c.source,
    }));
    const { results: reranked } = await rerankWithGemma4(query, candidates, {
      topN:        40,
      returnTopK:  Math.min(8, context.ragChunks.length),
      userId,
    });
    rerankMs = Math.round(performance.now() - rrStart);
    const cacheHitCount  = reranked.filter(r => r.cached).length;
    const webFallback    = reranked.some(r => (r.doc as Record<string, unknown>)['_webResult'] === true);
    rerankMeta = {
      source:          webFallback ? 'fallback' : cacheHitCount === reranked.length ? 'redis' : 'gemma4',
      candidateCount:  candidates.length,
      topK:            reranked.length,
      cacheHitCount,
      webFallbackUsed: webFallback,
      maxScore:        reranked[0]?.rerankScore ?? 0,
      minScore:        reranked[reranked.length - 1]?.rerankScore ?? 0,
    };
  } catch (err) {
    console.warn('[synthesis/generate] rerank skipped:', err);
  }
}
```

**Response shape includes** `reranking: rerankMeta | null` at the top level.

---

### 2. `src/routes/api/sse/chat/+server.ts` (static import, post-graph)

```typescript
import { rerankWithGemma4, type RerankCandidate } from '$lib/server/retrieval/cross-encoder-reranker.js';

// After applyGraphAuthorityScoring(contextDocs, allGraphNeighbors):
if (contextDocs.length > 1) {
  try {
    const rrCandidates: RerankCandidate[] = contextDocs.map((d, i) => ({
      documentId:     d.documentId ?? `ctx-${i}`,
      content:        d.content,
      retrievalScore: d.similarity,
    }));
    const { results: reranked } = await rerankWithGemma4(message, rrCandidates, {
      topN:        40,
      returnTopK:  Math.min(RAG_MAX_CHUNKS, contextDocs.length),
      userId:      locals.user?.id,
      noFallback:  false,
    });
    if (reranked.length > 0) {
      const docMap = new Map(contextDocs.map((d) => [d.documentId, d]));
      contextDocs = reranked.map((r) => ({
        ...(docMap.get(r.doc.documentId) ?? contextDocs[r.originalRank]),
        similarity: r.rerankScore,
      }));
    }
    console.log(
      `[Rerank] cross-encoder: ${rrCandidates.length}→${reranked.length} ` +
      `src=${reranked.filter(x => x.cached).length === reranked.length ? 'redis' : 'gemma4'} ` +
      `top=${reranked[0]?.rerankScore.toFixed(3)}`
    );
  } catch (err) {
    console.warn('[sse/chat] rerank skipped:', err);
  }
}
```

**No rerankMeta on the SSE response** — the reorder is transparent; the client receives the already-reranked `contextDocs` embedded in SSE `context` events.

---

### 3. `src/routes/api/rag/search/+server.ts` (dynamic import, feature-flag guarded)

```typescript
// Only loaded when use_rerank === true in request body
if (use_rerank && allChunks.length > 1) {
  try {
    const t0 = performance.now();
    const { rerankWithGemma4 } = await import(
      '$lib/server/retrieval/cross-encoder-reranker.js'
    );
    const candidates = allChunks.slice(0, Math.min(allChunks.length, 40)).map((c) => ({
      documentId:     c.chunk_id,
      content:        c.text,
      retrievalScore: c.score,
      ...c,  // spread preserves chunk_id, collection, metadata for downstream
    }));
    const { results: reranked, stats: rerankStats } = await rerankWithGemma4(
      query,
      candidates,
      { returnTopK: top_k, userId: userId ?? undefined }
    );
    rerankCacheInfo = rerankStats;
    if (reranked.length > 0) {
      const scoreMap = new Map(reranked.map((r) => [r.doc.documentId, r.rerankScore]));
      for (const chunk of allChunks) {
        const s = scoreMap.get(chunk.chunk_id);
        if (s != null) chunk.rerank_score = s;
      }
      allChunks.sort((a, b) => (b.rerank_score ?? b.score) - (a.rerank_score ?? a.score));
    }
    rerankTimeMs = Math.round(performance.now() - t0);
  } catch (err) {
    console.warn('[rag/search] rerank skipped:', err);
  }
}
```

**Response shape includes** `rerank_cache_info: rerankCacheInfo` and `rerank_time_ms: rerankTimeMs`.
Chunk objects gain `rerank_score` — downstream code sorts on `rerank_score ?? score`.

---

## Observability Metadata Reference

Include these fields in API responses or structured logs. Field names are conventions — adapt to your route's existing response shape.

| Field | Type | Source | Meaning |
|-------|------|--------|---------|
| `source` | `'redis' \| 'gemma4' \| 'fallback'` | computed | `redis` if all results were cached, `fallback` if web search was used, `gemma4` otherwise |
| `candidateCount` | `number` | `candidates.length` | how many chunks were passed to the reranker |
| `topK` | `number` | `reranked.length` | how many results were returned after `returnTopK` cap |
| `cacheHitCount` | `number` | `reranked.filter(r=>r.cached).length` | how many results came from L1 Redis per-score cache |
| `webFallbackUsed` | `boolean` | check `r.doc._webResult` | true if web search was triggered (top score < 0.45) |
| `maxScore` | `number` | `reranked[0]?.rerankScore ?? 0` | highest Gemma4 score in returned set |
| `minScore` | `number` | `reranked[last]?.rerankScore ?? 0` | lowest Gemma4 score in returned set |
| `latencyMs` | `number` | `performance.now()` diff | wall-clock ms including all Redis + Gemma4 calls |
| `l0Hit` | `boolean` | `stats.l0Hit` | entire ranked list served from L0 result-set cache |
| `l1Hits` | `number` | `stats.l1Hits` | individual (query,doc) pairs from L1 cache |
| `l1Misses` | `number` | `stats.l1Misses` | pairs that required a fresh Gemma4 call |
| `freshScored` | `number` | `stats.freshScored` | actual Gemma4 calls made this request |

---

## Fallback Behaviour

When `maxScore < RERANK_FALLBACK_THRESHOLD` (0.45):

1. `_webSearchFallback(query, 5)` is called — fetches results from `$lib/server/retrieval/web-search.js`
2. Web results become synthetic `RerankCandidate` objects with `retrievalScore: 0.3` and `_webResult: true`
3. These are scored through Gemma4 (L1 cache checked first) and merged with existing results
4. The merged list is re-sorted — web results can outrank local chunks if they score higher

**Web results are NOT automatically persisted to Qdrant.** If you want durable ingestion, publish to `document.embed` RabbitMQ queue from the caller:

```typescript
if (rerankMeta.webFallbackUsed) {
  const webDocs = reranked
    .filter((r) => (r.doc as Record<string, unknown>)['_webResult'])
    .map((r) => r.doc);
  await dispatchOrExecuteInline('document.embed', { docs: webDocs }, rabbitmq);
}
```

To **disable** web fallback for a specific call:

```typescript
const { results } = await rerankWithGemma4(query, candidates, { noFallback: true });
```

---

## Redis Cache Key Schema

For ops debugging and manual invalidation:

| Cache tier | Key pattern | TTL | Content |
|-----------|-------------|-----|---------|
| L0 result-set | `rr:list:g4l:{qHash}:{setHash}:{topK}` | 1h | `[{documentId, rerankScore, originalRank}]` |
| L1 per-score | `rr:{qHash}:{dHash}` | 24h | float string (e.g. `"0.823400"`) |

- `qHash` = first 16 hex chars of SHA-256 of the query string
- `setHash` = first 16 hex chars of SHA-256 of sorted `{documentId}:{docHash}` pairs
- `dHash` = first 16 hex chars of SHA-256 of the first 512 chars of `content`
- `topK` = the `returnTopK` value passed in options

**Flush all reranker cache** (Redis CLI):
```
SCAN 0 MATCH rr:* COUNT 100
DEL rr:list:g4l:... rr:...
```

---

## Common Mistakes

**Mapping `documentId` to an unstable key** (e.g. array index like `rag-0`) — the L1 per-score cache keys on content hash, not `documentId`, so index-based IDs are fine for caching but you lose the ability to look up the original object by ID. Use stable chunk IDs (`c.chunk_id`, `d.documentId`) where they exist.

**Not guarding with `contextDocs.length > 1`** — `rerankWithGemma4` returns immediately with `{ results: [], stats: ... }` for empty arrays, but skipping the call avoids unnecessary overhead and Redis round-trips.

**Forgetting `...d` spread in candidates** — if you don't spread the original object into the candidate, `r.doc` inside `RerankResult` will only have `{ documentId, content, retrievalScore }` and you'll lose chunk metadata (collection, file path, etc.) needed by downstream ACE assembly.

**Using the result without checking `reranked.length > 0`** — when Redis is down and Gemma4 scoring fails, `rerankWithGemma4` returns passthrough `0.5` scores. These are filtered if `minScore > 0.5` or if all scores are identical. Always check `reranked.length > 0` before replacing `contextDocs`.
