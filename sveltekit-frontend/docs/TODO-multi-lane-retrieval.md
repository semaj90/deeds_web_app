# TODO — Multi-Lane Retrieval Engine

> Generated: 2026-05-07  
> Source: `src/lib/server/ace/multi-lane-retrieval.ts` audit + context-assembler gap analysis

---

## Current Inventory (what already works)

| Module | Status | Notes |
|--------|--------|-------|
| `multi-lane-retrieval.ts` | ✅ Complete | 4 lanes, `Promise.allSettled`, synthesis block — **0 callers outside MCP** |
| `ngram-retrieval.ts` | ✅ Complete | `pg_trgm` + FTS on `document_chunks`, `error_fingerprints`, `research_summaries` |
| `error-fingerprint.ts` | ✅ Complete | `normalizeError`, `fingerprintError`, `storeErrorFingerprint`, `lookupErrorFingerprint` |
| `context-assembler.ts` | ✅ 17-lane `Promise.all` | Qdrant, KAG, RAG, community, ACP, graph-intel, directory KAG, web, wiki — none call multi-lane |
| Hash lane | ✅ Complete | Reads `ace:error:{hash}` + `error_fingerprints` Postgres table |
| N-gram lane | ✅ Complete | Reads `document_chunks` + `error_fingerprints` + `research_summaries` via `pg_trgm` |
| Graph lane | ✅ Complete | Reads `code:graph:node:{hash}` from Redis by file path |
| ACE cache lane | ⚠️ Read-only | Reads `ace:topk:{queryHash}:embeddinggemma:768` — **nobody writes this key** |
| Vector lane | ❌ Missing | `skipVectorLane` in interface, no implementation |
| `error_fingerprints` table | ❌ Missing from schema | Queried but not in `schema-postgres.ts` — will fail on fresh DB |
| Wiki note lane | ❌ Missing | `NgramHit.source: 'wiki_note'` declared but `ngramRecall` doesn't query `kag_notes` |
| Symbol lookup lane | ❌ Missing | No `code:graph:node:` lookup by symbol name (only by file path) |
| Context assembler integration | ❌ Not wired | `assembleACEContext` never calls `multiLaneSearch` |
| `ace:topk` write path | ❌ Missing | After Qdrant retrieval, top-K should be cached at `ace:topk:{hash}:embeddinggemma:768` |
| Score blending | ⚠️ Naive | `mergeAndRank` uses max-score dedup; doesn't blend with ACE spine weights |

---

## TODO List — Prioritized

### P0 — Unblock the lanes (schema + write-throughs)

- [x] **P0-A: Add `error_fingerprints` table to `schema-postgres.ts`**  
  `ngramRecall` and `lookupErrorFingerprint` both query this table. Without it every fresh DB deploy silently returns 0 results from the hash and n-gram error lanes.  
  ```typescript
  // schema-postgres.ts — add after context_timeline
  export const errorFingerprints = pgTable('error_fingerprints', {
    errorHash:      varchar('error_hash', { length: 32 }).primaryKey(),
    rawText:        text('raw_text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    topFiles:       jsonb('top_files').default([]),
    topSymbols:     jsonb('top_symbols').default([]),
    priorFix:       text('prior_fix'),
    confidence:     real('confidence').default(0),
    hitCount:       integer('hit_count').default(1),
    createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).defaultNow(),
  });
  // Migration: CREATE INDEX error_fingerprints_trgm_idx ON error_fingerprints USING GIN (normalized_text gin_trgm_ops);
  ```
  **Benefit**: Hash + n-gram lanes return real results instead of silent empty arrays.

- [x] **P0-B: Write `ace:topk:{queryHash}:embeddinggemma:768` after Qdrant retrieval**  
  In `fetchRAGChunks` (context-assembler.ts), after the Qdrant search returns, write the top-K chunk IDs + texts to Redis:
  ```typescript
  // After fetchRAGChunks resolves — fire-and-forget
  redis.setex(`ace:topk:${queryHash}:embeddinggemma:768`, 600,
    JSON.stringify(kbChunks.slice(0, 20).map(c => ({
      id: c.id, text: c.text.slice(0, 200), filePath: c.filePath,
      tags: c.tags, score: c.score
    })))
  ).catch(() => {});
  ```
  **Benefit**: The ACE cache lane in `multi-lane-retrieval.ts` gets warm on second query — turns cold Qdrant (~200ms) into Redis (~2ms) for repeated queries.

- [x] **P0-C: Add `storeErrorFingerprint` call in error ingestion path**  
  When `kag.ingest_memory_directory` processes a `type: 'error'` record, call `storeErrorFingerprint(redis, pool, record.raw ?? record.summary)` fire-and-forget.  
  **Benefit**: Every ingested error becomes searchable via both hash (exact) and n-gram (fuzzy) lanes.

---

### P1 — Wire multi-lane into context assembler

- [x] **P1-A: Add `multiLaneSearch` as lane 18 in `assembleACEContext` `Promise.all`**  
  ```typescript
  // In context-assembler.ts, add to the Promise.all array:
  opts.enableCodebaseContext
    ? multiLaneSearch(redis, pool, {
        text: query,
        isError: /error|exception|failed|cannot|undefined/i.test(query),
        topK: 8,
        skipVectorLane: true,   // Qdrant already runs in fetchRAGChunks
      }).catch(() => null)
    : Promise.resolve(null),
  ```
  Then splice `multiLaneResult?.synthesisBlock` into the codebase context section of the assembled prompt.  
  **Benefit**: Hash exact-match + n-gram fuzzy recall + graph expansion all fire in parallel with the 17 existing lanes — zero added latency (already parallelized).

- [x] **P1-B: Surface `knownError` + `priorFix` in ACEContext**  
  Add to `ACEContext` type:
  ```typescript
  multiLane?: {
    knownError: boolean;
    priorFix?: string;
    topFiles: string[];
    topSymbols: string[];
    lanesHit: string[];
    durationMs: number;
  };
  ```
  Set from `multiLaneResult` in assembler.  
  **Benefit**: Gemma4 sees `knownError: true` + `priorFix` inline in the context block → stops re-deriving already-known solutions.

- [x] **P1-C: Write `ace:query:{queryHash}` result to Redis for LLM cache key**  
  `multiLaneSearch` already writes `ace:query:{queryHash}` (TTL 300s). Wire it into `buildACEPromptCached` as a fast pre-check:
  ```typescript
  // In buildACEPromptCached, before full assembly:
  const fastHit = await redis.get(`ace:query:${qHash(query)}`).catch(() => null);
  if (fastHit) {
    const { topFiles, knownError } = JSON.parse(fastHit);
    // Prepend to context + continue (don't short-circuit full assembly)
  }
  ```
  **Benefit**: Repeated queries with identical hash get pre-populated file/symbol hints before Qdrant even fires.

---

### P2 — Add missing lanes

- [ ] **P2-A: Implement vector lane in `multi-lane-retrieval.ts`**  
  Currently `skipVectorLane` is declared but the lane doesn't exist.
  ```typescript
  async function runVectorLane(query: MultiLaneQuery, topK: number): Promise<LaneResult> {
    if (query.skipVectorLane) return { lane: 'vector', hits: [], latencyMs: 0, cacheHit: false };
    const { hybridSearch } = await import('../vector/qdrant-manager.js');
    const chunks = await hybridSearch('codebase_chunks_768', query.text, topK).catch(() => []);
    // map to MultiLaneHit ...
  }
  ```
  Then add `runVectorLane` to the `Promise.allSettled` array in `multiLaneSearch`.  
  **Benefit**: Multi-lane search becomes a standalone retrieval engine usable from MCP tools, API routes, and the assembler without duplicating Qdrant calls.

- [x] **P2-B: Add wiki note lane to `ngram-retrieval.ts`**  
  `NgramHit.source` already declares `'wiki_note'` but `ngramRecall` never queries `kag_notes`.
  ```sql
  SELECT id::text, content AS text, file_path,
         similarity(content, $1) AS sim
  FROM kag_notes
  WHERE similarity(content, $1) > 0.20
  ORDER BY sim DESC LIMIT $2
  ```
  **Benefit**: Wiki notes (Karpathy-pattern summaries, audit findings, architecture decisions) become searchable via n-gram before the more expensive Qdrant vector search.

- [x] **P2-C: Add symbol lookup lane**  
  For queries containing TypeScript/function names, look up `code:graph:node:*` by symbol hash:
  ```typescript
  async function runSymbolLane(redis: Redis, query: MultiLaneQuery): Promise<LaneResult> {
    const symbols = extractSymbols(query.text);  // already in error-fingerprint.ts
    const hits = await Promise.all(symbols.slice(0, 5).map(async sym => {
      const h = sha1(sym).slice(0, 12);
      const raw = await redis.get(`code:graph:node:${h}`).catch(() => null);
      // ...
    }));
    // ...
  }
  ```
  **Benefit**: Queries like "parseLlamaToolCall fails" directly resolve to `src/lib/server/ai/gemma4-agent.ts` without needing vector similarity — instant (< 2ms Redis lookup).

---

### P3 — Score blending

- [x] **P3-A: Blend multi-lane scores with ACE spine weights**  
  Current `mergeAndRank` uses max-score dedup. Replace with weighted blend:
  ```typescript
  const LANE_WEIGHT: Record<string, number> = {
    hash:      1.00,  // exact fingerprint → highest trust
    ace_cache: 0.90,  // previously ranked top-K → high trust
    vector:    0.75,  // semantic similarity
    ngram:     0.60,  // lexical overlap
    graph:     0.55,  // structural proximity
    symbol:    0.80,  // exact symbol match
    wiki_note: 0.65,  // curated narrative
  };

  function blendScore(hit: MultiLaneHit): number {
    return hit.score * (LANE_WEIGHT[hit.lane] ?? 0.5);
  }
  ```
  Then aggregate: if a chunk appears in N lanes, sum its blended scores (Reciprocal Rank Fusion-style).  
  **Benefit**: A chunk appearing in hash + n-gram + graph lanes ranks much higher than a chunk only in one lane — multi-signal confirmation improves precision.

- [ ] **P3-B: Feed multi-lane `topFiles` into ACE fast-AST boost**  
  `getGraphIntelContext` already applies a `FAST_AST_SCORE_CAP = 0.07` boost for hot files. If `multiLaneResult.topFiles` includes a file, boost its chunks an additional `+0.05` in the ACE reranker.  
  **Benefit**: Files identified by 3+ lanes (hash + graph + n-gram) get compounding signal boost without changing the vector search itself.

---

### P4 — Observability + feedback loop

- [ ] **P4-A: Record multi-lane hit distribution in `context_timeline`**  
  After assembly, fire-and-forget:
  ```typescript
  pool.query(`INSERT INTO context_timeline (event_type, pipeline, session_id, payload)
    VALUES ('multi_lane_retrieval', 'ace', $1, $2::jsonb)`,
    [userId ?? '', JSON.stringify({
      queryHash, knownError, lanesHit: lanes.filter(l => l.hits.length > 0).map(l => l.lane),
      durationMs, topFiles
    })]
  ).catch(() => {});
  ```
  **Benefit**: Search Intelligence dashboard (G48-G55) can show lane-level hit rates — identifies which lanes add signal vs noise for different query types.

- [x] **P4-B: Learn `priorFix` from thumbs-up feedback**  
  When a user gives thumbs-up on a response that resolved a known error, write the response text back to `error_fingerprints.prior_fix` for that hash.  
  In `feedback/+server.ts`, after thumbs-up:
  ```typescript
  if (payload.errorHash) {
    await pool.query(
      `UPDATE error_fingerprints SET prior_fix = $1, hit_count = hit_count + 1,
       updated_at = now() WHERE error_hash = $2`,
      [payload.responseText.slice(0, 2000), payload.errorHash]
    );
  }
  ```
  **Benefit**: Closes the RL loop — every resolved error improves the hash lane's `priorFix` for future identical errors.

---

## Benefits Summary

| Lane / Feature | Cold query latency | Warm query latency | Precision gain | Notes |
|----------------|--------------------|--------------------|----------------|-------|
| Hash exact match | **< 5ms** | < 5ms | +40% for known errors | Skips all other lanes when hash hits |
| N-gram recall | ~20ms | ~20ms | +15% recall on messy text | Catches typos, partial stack traces |
| Graph node lookup | **< 5ms** | < 5ms | +20% for code queries | Direct file→context resolution |
| ACE cache lane | ~2ms hit / 0ms miss | **< 2ms** | 90% for repeated queries | Warm after first Qdrant call (P0-B) |
| Vector lane (P2-A) | ~200ms | ~200ms | Baseline | Existing Qdrant, unified API |
| Wiki note lane (P2-B) | ~20ms | ~20ms | +10% for architecture queries | Karpathy wiki notes in recall |
| Symbol lane (P2-C) | **< 2ms** | < 2ms | +25% for function-name queries | Redis hash lookup, instant |
| Score blending (P3) | 0ms overhead | 0ms overhead | +10-20% combined precision | Multi-signal confirmation |

**Combined effect (all lanes wired)**:
- Error queries with known fingerprint: **< 10ms** total (hash + graph + ACE cache only)
- Code queries with function names: **< 15ms** (symbol + graph + ACE cache)
- General legal queries (cold): same as today (~200ms Qdrant) but with **+35% recall** from n-gram + wiki + graph running in parallel
- Repeated queries (warm): **< 5ms** (ACE cache lane short-circuits Qdrant)

**RL feedback**: `priorFix` persists across sessions — each resolved error permanently improves hash lane quality for identical future errors.

---

## Implementation Order

```
P0-A → P0-B → P0-C   (unblock schema + write paths, 1-2 hrs)
  ↓
P1-A → P1-B           (wire into context assembler, 1 hr)
  ↓
P2-B → P2-C           (add wiki + symbol lanes, 1 hr)
  ↓
P3-A → P3-B           (score blending, 30 min)
  ↓
P4-A → P4-B           (observability + RL feedback, 1 hr)
```

**Total: ~6 hours to full multi-index memory engine**

---

## What NOT to do

- Do NOT add a 6th DB query in the hot path — all new lanes must use Redis or existing pool queries with GIN indexes (no sequential scans)
- Do NOT skip `Promise.allSettled` — every lane must be fault-tolerant; one DB timeout cannot block the assembler
- Do NOT duplicate the Qdrant call — use `skipVectorLane: true` when calling from `context-assembler` (Qdrant already runs in `fetchRAGChunks`)
- Do NOT store raw stack traces in `error_fingerprints.raw_text` > 4KB — truncate to 2KB to keep the trigram index fast
