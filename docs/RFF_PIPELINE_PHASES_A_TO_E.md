# RFF Indexing Pipeline: Phases A → E

**Goal**: Complete 5-lane Reciprocal Rank Fusion (RFF) search indexing
**Current Status**: Phase A in progress
**Last Updated**: 2026-06-29 01:20 UTC

---

## Architecture Overview

```
User Query
  ↓
Embed (384-dim embeddinggemma)
  ↓
┌─────────────────────────────────────────────────────────────────┐
│                    RFF Lane Fusion (5 lanes)                     │
├─────────────────────────────────────────────────────────────────┤
│ Lane 1: Content Semantic    (Qdrant content_embedding)          │ ✅ Ready
│ Lane 2: Error Patterns      (Qdrant error_embedding)            │ ✅ Ready (Phase 1)
│ Lane 3: Code Signatures     (Qdrant signature_embedding)        │ ✅ Ready (Phase 1)
│ Lane 4: BM25 Full-Text      (Go semantic search, summaries)     │ ⏳ Phase A+B+C
│ Lane 5: Neo4j Topology      (Graph SIMILAR_TOPOLOGY edges)      │ ✅ Ready
└─────────────────────────────────────────────────────────────────┘
  ↓
RRF Fusion: score = Σ(1 / (k + rank_i)) for each lane
  ↓
XGBoost Reranker (Phase 18)
  ↓
Top-20 Candidates + Reasoning
```

---

## Phase A: Gemma4 Batch Summaries ✅ IN PROGRESS

**Purpose**: Generate 1,000 summary texts for packets missing summaries
**Input**: `atlas_packets` (58,304 rows, ~1,000 NULL summaries)
**Output**: `atlas_packets.summary` populated
**Duration**: ~1-2 hours
**Status**: Batch 32/100 complete (320 summaries, 32% done)

### A1: Batch Processing
```
Query packets WHERE summary IS NULL
  ↓
Batch into 10-packet chunks (100 total)
  ↓
Call Gemma4 :8090 (TurboQuant) with source_ref + feature_id
  ↓
Parse response + strip reasoning blocks
  ↓
Write to atlas_packets.summary (upsert)
```

### A2: Telemetry
- Successes/failures
- Tokens used
- Latency per batch
- Summary length stats
- Report: `.tmp/gemma4-summary-report.json`

### Commands
```bash
npm run startup:phase-a:with-baseline              # Phase A + baseline test
npm run startup:phase-a:gemma4-only                # Phase A only
npm run atlas:summaries:gemma4:500:apply           # Manual apply
```

---

## Phase B: Summary Embedding Backfill ⏳ PENDING

**Purpose**: Generate 384-dim embeddings for summaries
**Input**: `atlas_packets.summary` (populated in Phase A)
**Output**: New column `atlas_packets.summary_embedding` (vector(384))
**Duration**: ~30 minutes
**Blocker**: Phase A completion

### B1: Embedding Generation
```
Read from atlas_packets.summary
  ↓
Embed via Ollama embeddinggemma:latest (384-dim)
  ↓
Cache results in Redis (L1 exact-match)
  ↓
Write to atlas_packets.summary_embedding (upsert)
```

### B2: Output
- 1,000+ summary embeddings at 384-dim
- Postgres column ready for Qdrant sync
- Fallback to CPU if GPU unavailable

### Commands (After Phase A)
```bash
npm run atlas:phase1:backfill:summary:dry          # Dry-run
npm run atlas:phase1:backfill:summary:apply        # Execute
```

---

## Phase C: Qdrant Payload Sync ⏳ PENDING

**Purpose**: Sync summary vectors + metadata to Qdrant `codebase_chunks_768`
**Input**: Postgres columns (summary, summary_embedding, etc.)
**Output**: Qdrant payloads with BM25 fields for Lane 4
**Duration**: ~15 minutes
**Blocker**: Phase B completion

### C1: Payload Enrichment
```
Read from codebase_chunk_index (summary_embedding column)
  ↓
Add RFF-critical fields:
  - summary_embedding_id (reference)
  - summary_bm25_score (pre-computed or 0.5 default)
  - summary_confidence (0.85-0.95 based on embedding quality)
  - error_categories (parsed from tags)
  ↓
Batch upsert to Qdrant (500 points/batch)
  ↓
Verify payload integrity
```

### C2: Output
- 40,568 Qdrant points with summary vectors in payload
- Lane 4 (BM25) now has content for full-text indexing
- Payload structure compatible with RRF fusion

### Commands (After Phase B)
```bash
npm run atlas:phase2:sync:summaries:dry            # Dry-run
npm run atlas:phase2:sync:summaries:apply          # Execute
```

---

## Phase D: RFF Cache Warmup ⏳ PENDING

**Purpose**: Pre-compute RRF scores for hot queries
**Input**: Top 100 queries + 5-lane candidate sets
**Output**: Redis cache with pre-fused RRF scores
**Duration**: ~5 minutes
**Blocker**: Phase C completion

### D1: Cache Warming
```
Query hot queries (from analytics)
  ↓
Run each through all 5 lanes in parallel
  ↓
Fuse results via RRF formula
  ↓
Cache in Redis: rff:query:{hash} (TTL 24h)
  ↓
Verify cache hit rates
```

### D2: Output
- Top-100 query RRF scores cached
- 90%+ cache hit rate for common queries
- Instant response (<5ms) for warm queries

### Commands (After Phase C)
```bash
npm run atlas:phase4:rff:warm-cache:dry            # Dry-run
npm run atlas:phase4:rff:warm-cache:apply          # Execute
```

---

## Phase E: RFF End-to-End Verification ⏳ PENDING

**Purpose**: Validate all 5 lanes active + RRF fusion working
**Input**: Live search endpoint `/api/rag/search`
**Output**: JSON report with per-lane metrics
**Duration**: ~10 minutes
**Blocker**: Phase D completion

### E1: Verification Gates
```
1. Lane 1 (Content): Qdrant content_embedding returns Top-20
2. Lane 2 (Error):   Qdrant error_embedding returns candidates
3. Lane 3 (Sig):     Qdrant signature_embedding returns candidates
4. Lane 4 (BM25):    Go service /search returns full-text hits
5. Lane 5 (Topo):    Neo4j k-hop expansion returns neighbors

  ↓ (all gates pass)

RRF Fusion: Combine all 5 ranked lists
  ↓
XGBoost Reranker: Apply Phase 18 scoring
  ↓
Return Top-20 candidates + metadata
```

### E2: Output
- All 5 lanes reporting candidates
- RRF fusion working (combined scores visible)
- Per-lane latency + candidate counts logged
- Report: `.tmp/rff-verification-report.json`

### Commands (After Phase D)
```bash
npm run atlas:phase4:rff:verify:dry                # Dry-run
npm run atlas:phase4:rff:verify:apply              # Execute
npm run atlas:phase4:rff:verify:verbose            # Verbose output
```

---

## Timeline Estimate

| Phase | Task | Duration | Cumulative | Status |
|-------|------|----------|------------|--------|
| **A** | Gemma4 summaries | 60-90 min | 60-90 min | 🟢 IN PROGRESS |
| **B** | Summary embeddings | 30 min | 90-120 min | ⏳ Pending |
| **C** | Qdrant sync | 15 min | 105-135 min | ⏳ Pending |
| **D** | Cache warmup | 5 min | 110-140 min | ⏳ Pending |
| **E** | E2E verification | 10 min | 120-150 min | ⏳ Pending |

**Total Estimated Duration**: ~2-2.5 hours (all phases)
**Expected Completion**: ~03:20-03:50 UTC (starting now at 01:20)

---

## Infrastructure Requirements

| Component | Port | Status | Used By |
|-----------|------|--------|---------|
| Gemma4 TurboQuant | :8090 | ✅ Running | Phase A |
| PostgreSQL | :5434 | ✅ Ready | Phases A-E |
| Ollama | :11434 | ✅ Ready | Phase B (embeddings) |
| Qdrant | :6333 | ✅ Ready | Phases C, E |
| Redis/Valkey | :6379 | ✅ Ready | Phase D (cache) |
| Neo4j | :7687 | ✅ Ready | Phase E (Lane 5) |
| Go Service | :8096 | ✅ Ready | Phase E (Lane 4) |
| SvelteKit | :5173 | ✅ Ready | E2E tests |

---

## Monitoring

### Real-Time Progress

```bash
# Phase A (Gemma4)
tail -f C:\Users\james\AppData\Local\Temp\claude\c--Users-james-Videos-deeds-web-app\b503a3f2-50b5-4621-afea-31d259dddb6a\tasks\ba17qvkie.output

# Phase B-E (TurboVec baseline)
tail -f logs/task-output/pipeline-test/eval-turbovec-baseline.out.log
```

### SQL Verification

```sql
-- Phase A: Check summaries written
SELECT count(*) as total, count(summary) as with_summary
FROM atlas_packets;

-- Phase B: Check summary embeddings
SELECT count(*) as total, count(summary_embedding) as with_embedding
FROM atlas_packets;

-- Phase C: Check Qdrant payload
curl "http://127.0.0.1:6333/collections/codebase_chunks_768/points?ids=1&with_payload=true" | jq '.result.points[0].payload | keys'
-- Look for: summary_embedding_id, summary_bm25_score, summary_confidence

-- Phase E: Check RRF cache
docker exec legal-ai-redis redis-cli KEYS "rff:query:*" | wc -l
-- Expect: 100+ keys if warmup successful
```

---

## Error Recovery

### If Phase A Fails

```bash
# Check Gemma4 health
curl http://127.0.0.1:8090/v1/models

# Restart Gemma4
npm run turbo:start

# Retry Phase A
npm run startup:phase-a:gemma4-only
```

### If Phase B Fails (Embeddings)

```bash
# Check Ollama health
curl http://127.0.0.1:11434/api/tags

# Verify summary column exists
psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='atlas_packets' AND column_name='summary'"

# Clear partial results and retry
# (Script handles idempotent upsert, safe to re-run)
npm run atlas:phase1:backfill:summary:apply
```

### If Phase C Fails (Qdrant Sync)

```bash
# Check Qdrant health
curl http://127.0.0.1:6333/collections/codebase_chunks_768

# Verify payload fields
curl "http://127.0.0.1:6333/collections/codebase_chunks_768/points?ids=1&with_payload=true" | jq '.'

# Retry sync (idempotent)
npm run atlas:phase2:sync:summaries:apply
```

---

## Success Criteria

✅ **Phase A Complete**: `atlas_packets.summary` has 1,000+ non-NULL values
✅ **Phase B Complete**: `atlas_packets.summary_embedding` has 384-dim vectors
✅ **Phase C Complete**: Qdrant payload includes `summary_embedding_id`
✅ **Phase D Complete**: Redis has 100+ `rff:query:*` keys
✅ **Phase E Complete**: All 5 lanes return candidates, RRF scores visible

---

## Lane 4 Details (BM25 Full-Text)

Currently **in Phase C** — awaiting summary vectors in Qdrant. Once sync completes:

1. Go semantic search service `:8096` will index summaries
2. BM25 full-text search becomes Lane 4
3. Queries like "error handling" will pull semantically-similar summaries
4. RRF fusion combines with content + error + signature + topology lanes

**BM25 Index**: Inverted index over summaries + source_ref + feature_id
**Query Example**: "TypeError handling in upload" → BM25 matches "TypeError fixes in upload handler"

---

## Next Actions

**Right now (Phase A running)**:
- Monitor Gemma4 progress
- Let baseline test run detached
- Check logs periodically

**When Phase A completes**:
1. Verify summaries in Postgres
2. Start Phase B: `npm run atlas:phase1:backfill:summary:apply`
3. Monitor embedding generation

**All phases sequential** — each depends on prior completion

---

**Current Status**: ✅ Phase A at 32% (Batch 32/100)
**Estimated Time to Phase E Complete**: ~2 hours from now
**Next Major Milestone**: Phase A completion (within ~90 minutes)
