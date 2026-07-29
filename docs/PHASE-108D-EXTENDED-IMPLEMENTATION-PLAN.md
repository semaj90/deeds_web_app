# Phase 108D Extended Implementation Plan
## Qdrant Embeddings Backfill → ACE Packet Retrieval → Synthesis Pipeline

**Status**: 10-row proof PASSED ✅ | Ready for 1000-row idempotency proof

**Date**: 2026-07-29 | Session: Continuation (150+)

---

## Executive Summary

Phase 108D is **3 sub-phases**:
1. **108D-1**: 10-row proof ✅ COMPLETE (STATICALLY_PROVEN)
2. **108D-2**: 1000-row idempotency proof (READY TO EXECUTE)
3. **108D-3**: Full 52,380-row backfill (DEFERRED until Phase 2 passes)

After Phase 108D-3, the pipeline unblocks:
- ACE packet retrieval (Qdrant → Postgres → Redis msgpack → LLM context)
- Dual-lane semantic/lexical search (768d + trigram + FTS indexes)
- Synthesis with clustering (K-means, SOM, GPU rerank via RTX 3060 Ti + LibTorch N-API)

---

## Phase 108D-2: 1000-Row Idempotency Proof

### Goal
Prove that re-running the same 1000-row backfill twice produces **identical Qdrant state** (same point IDs, same payloads, same vector dimension).

### Implementation

**File**: `scripts/atlas/phase108d-embeddings-backfill-1000-idempotency.mts`

```typescript
// 1. Fetch 1000 rows from Postgres (same query as 10-row, LIMIT 1000)
// 2. Validate all 1000 rows against VectorBackfillRowV1 contract
// 3. First upsert run: POST 1000 points to Qdrant
// 4. Record first-run state: point IDs, payloads, vector hashes
// 5. Second upsert run: POST same 1000 points again (idempotency test)
// 6. Retrieve all 1000 points from Qdrant
// 7. Compare: ID, payload fields, vector dimensions
// 8. Report: fixture_complete (true if 0 mismatches), idempotent (true if 2nd run matches 1st)
// 9. Status: IDEMPOTENCY_PROVEN or FIXTURE_INCOMPLETE or FAILED
```

### Validation Gates (5 required)

| Gate | Check | Pass Condition |
|------|-------|---|
| **G1: Load & Fetch** | 1000 rows loaded from Postgres | rows.length === 1000 |
| **G2: Contract Validation** | All 1000 rows pass Zod schema | validRows.length === 1000 |
| **G3: First Upsert** | Points inserted successfully | operation_status === 'ok' |
| **G4: Idempotency** | Re-upsert produces same state | mismatches.length === 0 after round-trip |
| **G5: Fixture Complete** | All 1000 points retrievable | retrieved.length === 1000 |

### Deliverables

- `scripts/atlas/phase108d-embeddings-backfill-1000-idempotency.mts` — implementation
- `log/artifacts/semantic-contract/phase108d-1000-idempotency-proof-{runId}.json` — result
  - `status`: IDEMPOTENCY_PROVEN | FIXTURE_INCOMPLETE | FAILED
  - `fixture_complete`: boolean
  - `idempotent`: boolean
  - `rows_attempted`, `rows_upserted`, `rows_verified`
  - `expected_point_ids_count`, `actual_point_ids_count`
  - `missing_point_ids[]`, `unexpected_point_ids[]`
  - `idempotency_points_rewritten`, `idempotency_vector_diffs[]`

### Execution Command

```bash
npx tsx scripts/atlas/phase108d-embeddings-backfill-1000-idempotency.mts --limit 1000
```

**Est. Time**: 30-45 seconds (1000-row fetch + 2 upserts + round-trip × 1000)

---

## Phase 108D-3: Full 52,380-Row Backfill

### Goal
Upsert all 52,380 embeddings from `codebase_chunk_index` to Qdrant `codebase_chunks_768`.

### Implementation

**File**: `scripts/atlas/phase108d-embeddings-backfill-full.mts`

- Reuse 1000-row proof upsert logic
- Batch in chunks of 1000 (53 batches total)
- Add resumable checkpoint: `phase108d-backfill-checkpoint.json` (last_processed_chunk_id, attempted_count, succeeded_count)
- Add progress reporting: every 5,000 rows log progress
- Add final verification: compare Qdrant point count (should be 52,380) vs Postgres rows

### Deliverables

- `scripts/atlas/phase108d-embeddings-backfill-full.mts`
- `log/artifacts/semantic-contract/phase108d-full-backfill-{runId}.json`
  - `status`: FULL_BACKFILL_PROVEN | PARTIAL_BACKFILL | FAILED
  - `rows_attempted`: 52380
  - `rows_upserted`: (actual count)
  - `rows_verified`: (via Qdrant point count)
  - `duration_ms`: total execution time
  - `batches`: { total: 53, succeeded: N, failed: N }

### Execution Command

```bash
npx tsx scripts/atlas/phase108d-embeddings-backfill-full.mts --limit 52380
```

**Est. Time**: 60-90 seconds (52 × 1.5s/batch)

---

## Post-Backfill: ACE Packet Retrieval Pipeline

Once Phase 108D-3 completes, wire the **ACE context assembler** to load packets into LLM context with 4-token limit awareness.

### Step 1: Qdrant → Postgres Join (Phase 109A)

```typescript
// File: src/lib/server/ace/packet-retrieval.ts

async function retrievePacketsByQdrant(query: string, topK: number = 10): Promise<ACEPacket[]> {
  // 1. Embed query with embeddinggemma:latest (768-dim)
  const queryVec = await embeddings.embed(query);
  
  // 2. Search Qdrant codebase_chunks_768 for top-20 by cosine
  const qdrantResults = await qdrant.search('codebase_chunks_768', {
    vector: { name: 'content', data: queryVec },
    limit: 20,
    with_payload: true
  });
  
  // 3. Join back to Postgres by source_ref
  const sourceRefs = qdrantResults.map(r => r.payload.source_ref);
  const pgRows = await db.select()
    .from(codebaseChunkIndex)
    .where(inArray(codebaseChunkIndex.source_ref, sourceRefs));
  
  // 4. Rerank with GPU cosine similarity (if VRAM available)
  const reranked = await gpuRerank(queryVec, pgRows, topK);
  
  // 5. Convert to ACEPacket (4-token envelope)
  return reranked.map(row => ({
    source_ref: row.source_ref,
    chunk_id: row.chunk_id,
    summary: row.summary,  // Already computed in Phase 7
    embedding_model: 'embeddinggemma:latest',
    embedding_dim: 768,
    confidence: row.relevance_score
  }));
}
```

### Step 2: Dual-Lane Retrieval (Phase 109B)

**Lexical Lane** (PostgreSQL 18 AIO with trigram indexes):
```typescript
async function searchLexical(query: string, topK: number = 10): Promise<ACEPacket[]> {
  // Exact symbol match: WHERE chunk_id = 'auth.validateSession'
  const exact = await db.query(sql`
    SELECT * FROM codebase_chunk_index
    WHERE chunk_id = ${query}
    LIMIT 1
  `);
  
  // Fuzzy token match: WHERE summary % query (trigram similarity)
  const fuzzy = await db.query(sql`
    SELECT *, similarity(summary, ${query}) as sim
    FROM codebase_chunk_index
    WHERE summary % ${query}
    ORDER BY sim DESC
    LIMIT ${topK - exact.length}
  `);
  
  return [...exact, ...fuzzy];
}
```

**Semantic Lane** (Qdrant 768d + GPU rerank):
```typescript
async function searchSemantic(query: string, topK: number = 10): Promise<ACEPacket[]> {
  // Already implemented above
}
```

**Fusion** (RRF + Karpathy authority scoring):
```typescript
async function searchFused(query: string, topK: number = 10): Promise<ACEPacket[]> {
  const [lexical, semantic] = await Promise.all([
    searchLexical(query, 20),
    searchSemantic(query, 20)
  ]);
  
  // RRF: reciprocal rank fusion of both lanes
  const fused = rrf([...lexical, ...semantic], topK);
  
  // Apply Karpathy authority boost (from Phase 112D redis:gpu:karpathy:scores)
  return fused.map(p => ({
    ...p,
    authority_score: await redis.hget('gpu:karpathy:scores', p.source_ref)
  })).sort((a, b) => b.authority_score - a.authority_score).slice(0, topK);
}
```

### Step 3: ACE Packet Assembly (Phase 109C)

```typescript
// File: src/lib/server/ace/packet-assembler.ts

interface ACEEnvelope {
  packets: ACEPacket[];
  tokens_used: number;
  tokens_available: number;
  truncation_applied: boolean;
}

async function assembleACEEnvelope(packets: ACEPacket[]): Promise<ACEEnvelope> {
  // Tokenize each packet
  let totalTokens = 0;
  const envelope = [];
  
  for (const packet of packets) {
    const packetTokens = countTokens(packet.summary);
    
    // Hard stop at 4-token budget
    if (totalTokens + packetTokens > 4) {
      return {
        packets: envelope,
        tokens_used: totalTokens,
        tokens_available: 4,
        truncation_applied: true
      };
    }
    
    envelope.push(packet);
    totalTokens += packetTokens;
  }
  
  return {
    packets: envelope,
    tokens_used: totalTokens,
    tokens_available: 4,
    truncation_applied: false
  };
}
```

---

## Synthesis Pipeline Integration

### Architecture: PostgreSQL 18 AIO + GPU Clustering

```
Qdrant Retrieval (Phase 109)
  ↓
Postgres Join (codebase_chunk_index + atlas_packets)
  ↓
Postgres 18 AIO Statistics (materialized stats table)
  ↓
GPU K-means (Phase 112, 5 clusters per query)
  ↓
GPU Cosine Rerank (Phase 112, top-3 per cluster)
  ↓
ACE Envelope Assembly (4-token budget)
  ↓
Gemma4 Synthesis (llama-server :8090)
  ↓
Response with metadata
```

### PostgreSQL 18 AIO Configuration

**File**: `scripts/atlas/pg18-aio-stats-warmup.mts`

- Enable `pg_stat_statements` for query telemetry
- Create materialized views:
  - `codebase_chunk_quality_stats` (word_count, embedding_confidence, summary_length distributions)
  - `codebase_lexical_stats` (function_name, type_name, import_name frequency)
  - `codebase_ast_stats` (node_kind, depth, complexity distributions)
- Refresh stats on interval (every 1 hour or on-demand)

### GPU Clustering via PyTorch + LibTorch N-API

**File**: `simd-bridge/cpp/pytorch-kmeans.cc`

```cpp
// Exported as addon.kmeansWithCentroids(vectors, k, centroids_out)
// - Input: Float32Array (vectors) + int k
// - Output: Float32Array (cluster assignments), Float32Array (centroids)
// - Time: ~100ms for 10K 768-dim vectors on RTX 3060 Ti

napi_value KmeansWithCentroids(napi_env env, napi_callback_info info) {
  // Implementation: CUDA kernels for batched matrix ops
  // - Initialize centroids (k-means++)
  // - Assign points to nearest centroid
  // - Update centroids
  // - Repeat until convergence
  // - Return cluster assignments + centroids
}
```

---

## Embedding Lineage & Canonical Storage

### EmbeddingLineage Schema

**File**: `src/lib/server/db/schema-postgres.ts`

```typescript
export const embeddingLineage = pgTable('embedding_lineage', {
  id: uuid().primaryKey().defaultRandom(),
  representation_id: uuid().notNull(),  // UUID of code chunk or document
  model_id: varchar(256).notNull(),     // 'embeddinggemma:latest'
  model_version: varchar(64).notNull(),  // Version hash
  dimensions: integer().notNull(),       // 768
  content_hash: varchar(64).notNull(),   // SHA-256 of content
  generated_at: timestamp().defaultNow(),
  stored_in: text().notNull(),           // 'qdrant:codebase_chunks_768'
  
  // Denormalized for fast lookup
  source_ref: varchar(512),
  feature_id: varchar(256),
  packet_key: varchar(256),
  
  // Indexing
  indexes: [
    index('embedding_lineage_model_version').on(embeddingLineage.model_version),
    index('embedding_lineage_content_hash').on(embeddingLineage.content_hash),
    index('embedding_lineage_source_ref').on(embeddingLineage.source_ref)
  ]
});
```

### Dual Representation Strategy

**Store separately**:
- `symbol_name_vector` (768-dim) — function/class name only
- `signature_vector` (768-dim) — parameters + return type
- `documentation_vector` (768-dim) — docstring + comments
- `implementation_summary_vector` (768-dim) — Phase 7 LLM summary

**Query-time fusion**:
```typescript
const symbolEmbed = await embed(chunk.function_name);
const docEmbed = await embed(chunk.documentation);

// Fuse for final retrieval
const fused = [
  0.3 * symbolEmbed + 0.7 * docEmbed,  // Semantic weighted
  0.5 * docEmbed + 0.5 * summaryEmbed  // Doc + summary fusion
];
```

---

## To-Do List (Executable Order)

### ✅ COMPLETE
- [x] Phase 108D-1: 10-row proof (STATICALLY_PROVEN)
- [x] Fix Qdrant named vectors structure (vectors.content)
- [x] Fix qdrant_point_id regex (allow slashes, dots)
- [x] Update CLAUDE.md with Qdrant API strategy

### ⏳ READY NOW
- [ ] **Phase 108D-2: 1000-row idempotency proof**
  - [ ] Create `phase108d-embeddings-backfill-1000-idempotency.mts`
  - [ ] Implement 5 validation gates (G1–G5)
  - [ ] Execute: `npx tsx scripts/atlas/phase108d-embeddings-backfill-1000-idempotency.mts --limit 1000`
  - [ ] Verify: IDEMPOTENCY_PROVEN status
  - [ ] Est. Time: 30-45 seconds

### ⏳ AFTER 108D-2 PASSES
- [ ] **Phase 108D-3: Full 52,380-row backfill**
  - [ ] Create `phase108d-embeddings-backfill-full.mts` (with checkpointing)
  - [ ] Execute: `npx tsx scripts/atlas/phase108d-embeddings-backfill-full.mts --limit 52380`
  - [ ] Verify: FULL_BACKFILL_PROVEN status
  - [ ] Est. Time: 60-90 seconds

### ⏳ AFTER 108D-3 COMPLETES
- [ ] **Phase 109A: Qdrant → Postgres Join**
  - [ ] Create `src/lib/server/ace/packet-retrieval.ts`
  - [ ] Implement `retrievePacketsByQdrant()` with GPU rerank
  - [ ] Wire `/api/retrieval/packets?q=...` endpoint
  - [ ] Test: `curl localhost:5173/api/retrieval/packets?q=auth`

- [ ] **Phase 109B: Dual-Lane Retrieval**
  - [ ] Add PostgreSQL 18 AIO trigram indexes
    ```sql
    CREATE INDEX idx_chunk_summary_trigram ON codebase_chunk_index USING GIN (summary gin_trgm_ops);
    ```
  - [ ] Implement `searchLexical()` with fuzzy token matching
  - [ ] Implement `searchSemantic()` reusing Phase 109A
  - [ ] Implement `searchFused()` with RRF
  - [ ] Wire `/api/retrieval/fused?q=...` endpoint

- [ ] **Phase 109C: ACE Packet Assembly**
  - [ ] Create `src/lib/server/ace/packet-assembler.ts`
  - [ ] Implement 4-token envelope budget
  - [ ] Wire `/api/ace/envelope?q=...` endpoint
  - [ ] Test: verify truncation_applied flag when >4 tokens

### ⏳ SYNTHESIS PIPELINE
- [ ] **Phase 110A: PostgreSQL 18 AIO Stats**
  - [ ] Create `scripts/atlas/pg18-aio-stats-warmup.mts`
  - [ ] Create materialized views for chunk quality + lexical stats
  - [ ] Execute: `npm run atlas:pg18:warmup`

- [ ] **Phase 110B: GPU K-means Clustering**
  - [ ] Verify LibTorch N-API addon exports `kmeansWithCentroids()`
  - [ ] Create `src/lib/server/gpu/kmeans-wrapper.ts`
  - [ ] Implement clustering with k=5
  - [ ] Wire `/api/gpu/cluster?vectors=...&k=5` endpoint

- [ ] **Phase 110C: GPU Cosine Rerank**
  - [ ] Use existing `computeGpuSimilarity()` from `libtorch-bridge.ts`
  - [ ] Create `src/lib/server/gpu/rerank-wrapper.ts`
  - [ ] Wire `/api/gpu/rerank?query=...&candidates=...` endpoint

- [ ] **Phase 111: End-to-End Synthesis Flow**
  - [ ] Integration test: `curl localhost:5173/api/synthesis?q=...`
  - [ ] Trace: Qdrant search → Postgres join → GPU cluster → Gemma4 output
  - [ ] Benchmark: latency breakdown (ANN / rerank / synthesis time)

### ⏳ EMBEDDING LINEAGE & STORAGE
- [ ] **Create embedding_lineage table** (Drizzle migration)
- [ ] **Populate on backfill**: every Qdrant upsert also writes to embedding_lineage
- [ ] **Implement dual representations** (symbol_vector, doc_vector, etc.)
- [ ] **Update CLAUDE.md** with embedding lineage rules

---

## Success Criteria

| Phase | Criterion | Status |
|-------|-----------|--------|
| **108D** | 52,380 vectors in Qdrant codebase_chunks_768 | ⏳ Pending |
| **109A** | Qdrant ANN → Postgres join retrieval working | ⏳ Pending |
| **109B** | Dual-lane (lexical + semantic) fusion working | ⏳ Pending |
| **109C** | 4-token ACE envelope assembly proven | ⏳ Pending |
| **110A** | Postgres 18 AIO materialized stats updated | ⏳ Pending |
| **110B** | GPU K-means clustering produces 5 clusters | ⏳ Pending |
| **110C** | GPU rerank orders candidates by similarity | ⏳ Pending |
| **111** | End-to-end synthesis query < 5 seconds | ⏳ Pending |

---

## Blockers & Dependencies

| Blocker | Status | Mitigation |
|---------|--------|-----------|
| Phase 108D-2 failing | ⏳ READY TO TEST | Execute now, report results |
| Postgres trigram indexes missing | ⏳ READY TO CREATE | Add via migration SQL |
| GPU K-means not exported | ⏳ CHECK | Verify `kmeansWithCentroids()` in tensorrt_bridge.node |
| Gemma4 :8090 not responding | ⏳ CHECK | Verify `npm run turbo:start:detached` |

---

## Notes

- **Phase 108D times**: 10-row (< 5s), 1000-row (30-45s), 52K-row (60-90s)
- **Qdrant endpoint**: PUT to `/collections/{name}/points` (not `/upsert`)
- **Named vectors**: response field is `vector.content` not `vectors.content`
- **RTX 3060 Ti VRAM**: 8GB total, embeddinggemma (5.3GB) + inference (2.7GB max)
- **Bitfrost warming**: `npm run bitfrost:warmup` before synthesis queries

---

**Last Updated**: 2026-07-29 01:55 UTC | **Ready to Execute Phase 108D-2**
