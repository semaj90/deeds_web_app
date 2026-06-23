# P3g — Qdrant Embedding Backfill Roadmap

**Status:** ⏳ STAGED (P1–P3 structural work complete, ready for P3g pipeline)  
**Coverage Gap:** 15,507/17,995 packets (86.2%) need embeddings  
**Dependency:** None — can parallelize with P4–P5  
**Estimated Duration:** 2–4 hours (depending on parallelization)

---

## Current State (After P3 Join Repair)

```
atlas_packets (17,995 total):
  ├─ 2,488 with qdrant_point_id (13.8%) — from atlas_higher_hop_index join
  ├─ 15,507 with qdrant_point_id IS NULL (86.2%) — NEED EMBEDDINGS
  └─ All 17,995 have packet_key (identity anchor)

atlas_higher_hop_index (2,488 total):
  ├─ 2,488 with qdrant_point_id (100%) — already linked to atlas_packets
  └─ Used as the canonical ledger for P3 join repair

Qdrant codebase_chunks_768 collection:
  ├─ 2,488 points with packet_key match (linked via P3)
  └─ 15,507 points missing (need embedding pipeline)
```

---

## P3g Pipeline: Architecture

### Step 1: Identify Embeddings Needed

```sql
SELECT
  p.packet_id,
  p.packet_key,
  p.source_ref,
  p.file_path,
  p.feature_id,
  p.feature_label,
  COALESCE(p.qdrant_vector_dim, 768) as dim
FROM atlas_packets p
WHERE p.qdrant_point_id IS NULL
  AND p.packet_key IS NOT NULL
ORDER BY p.packet_id
LIMIT 15507
```

**Expected:** 15,507 rows

### Step 2: Batch Fetch Packet Content

For each packet:
1. Read from `atlas_packets` (identity)
2. Fetch source chunk from storage (SeaweedFS or PostgreSQL bytea field)
3. Extract text representation (or use cached summary)

**Optimization:** Parallelize in batches of 100–500 per embedding worker

### Step 3: Embed via Ollama

```bash
POST http://localhost:11434/api/embed
{
  "model": "embeddinggemma:latest",
  "input": "packet text here"
}
→ 768-dim float array
```

**Parallelization:** 4–8 concurrent requests (tune for GPU VRAM)

### Step 4: Upsert to Qdrant

```rust
qdrant_client.upsert_points(
  collection="codebase_chunks_768",
  points=[
    {
      id: <generated_id>,
      vector: [768 floats],
      payload: {
        packet_key: "...",
        source_ref: "...",
        file_path: "...",
        feature_id: "...",
        feature_label: "...",
        qdrant_payload_version: "phase-d-e-v1",
        canonical: true,
        backfilled_at: "2026-06-23T..."
      }
    },
    ...
  ]
)
```

**Concurrency:** 50–100 points per batch (tune for Qdrant network)

### Step 5: Update Postgres

```sql
UPDATE atlas_packets
SET
  qdrant_point_id = $1,
  qdrant_collection = 'codebase_chunks_768',
  qdrant_vector_dim = 768,
  identity_lane = 'qdrant_chunk',
  updated_at = now()
WHERE packet_key = $2
```

**Transactionality:** Batch upsert + Postgres update as single atomic operation per batch

### Step 6: Verify Coverage

```sql
SELECT
  COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) / COUNT(*), 1) as pct
FROM atlas_packets
WHERE packet_key IS NOT NULL
```

**Target:** 17,995/17,995 (100%)

---

## Implementation Options

### Option A: Sequential Script (Safest, ~4 hours)

```bash
node scripts/atlas/backfill-packets-embeddings-sequential.mjs --apply
```

**Pros:**
- Simplest implementation
- No race conditions
- Easy to resume/checkpoint

**Cons:**
- Slow (~4–5 hours for 15,507 packets at 4 packets/sec)

### Option B: Worker Pool (Balanced, ~1.5 hours)

```bash
node scripts/atlas/backfill-packets-embeddings-pool.mjs --workers=4 --batch-size=100 --apply
```

**Pros:**
- 4–8× faster than sequential
- Built-in checkpointing
- Manages concurrency limits

**Cons:**
- More complex error handling
- Needs worker process coordination

### Option C: MapReduce (Fastest, ~45 min)

Use existing `mapreduce-cuda-analyzer.mjs` pattern:
- Coordinator: distribute 15,507 packets to N workers
- Workers: embed + upsert to Qdrant in parallel
- Aggregator: report coverage

**Pros:**
- Embarrassingly parallelizable
- Full GPU utilization

**Cons:**
- Most complex
- Needs coordinated fault recovery

---

## Recommended Path (Option B)

**Rationale:** Balances speed, simplicity, and reliability for a single-session task.

```bash
# Dry run (validate before large operation)
node scripts/atlas/backfill-packets-embeddings-pool.mjs --dry-run --sample=100

# Full backfill (4 workers, 100 packets/batch, checkpoint every 500)
node scripts/atlas/backfill-packets-embeddings-pool.mjs \
  --workers=4 \
  --batch-size=100 \
  --checkpoint-interval=500 \
  --apply

# Verify
npm run atlas:validate:qdrant-join-gan -- --story-id=ATLAS-P3G-COMPLETE --apply
```

**Expected Duration:** 60–90 minutes

---

## Script Template: `backfill-packets-embeddings-pool.mjs`

```javascript
#!/usr/bin/env node
/**
 * P3g: Backfill Qdrant embeddings for 15,507 packets without qdrant_point_id
 *
 * Workers:
 * - Fetch packet metadata from Postgres
 * - Embed via Ollama embeddinggemma:latest
 * - Upsert to Qdrant codebase_chunks_768
 * - Update atlas_packets.qdrant_point_id
 *
 * Usage:
 *   node scripts/atlas/backfill-packets-embeddings-pool.mjs --dry-run --sample=100
 *   node scripts/atlas/backfill-packets-embeddings-pool.mjs --apply --workers=4 --batch-size=100
 */

// Implementation skeleton — see P3g-embeddings-pool.mjs for full code
```

---

## Dependencies & Configuration

### Services Required
- **Ollama** (embeddinggemma:latest running on :11434)
- **Qdrant** (accepting upserts on :6333)
- **PostgreSQL** (read atlas_packets, write updates)

### Environment Variables
```bash
DATABASE_URL=postgresql://...
OLLAMA_URL=http://127.0.0.1:11434
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=codebase_chunks_768
```

### Resource Estimates
- **CPU:** 1 core (I/O bound)
- **GPU:** 2–4 GB VRAM (batches of 8–16 embeddings)
- **Network:** 10 Mbps (typical for embeddings + upserts)
- **Time:** 60–90 min (Option B, 4 workers)

---

## Success Criteria

After P3g completion:

```
✅ atlas_packets: 17,995/17,995 with qdrant_point_id (100%)
✅ Qdrant: 17,995 points in codebase_chunks_768
✅ Payloads: All canonical (not legacy_qdrant_only)
✅ Indexes: Maintained (HNSW for vector search)
✅ Authority chain: Postgres → Qdrant fully synchronized
```

---

## Parallel Work (Can Start Now)

While P3g runs, these don't depend on Qdrant completion:

- **P4:** Higher-hop enrichment (verify 98.2% coverage)
- **P5:** GPU acceleration health audit
- **Neo4j:** USED_CONCEPT + SIMILAR_TOPOLOGY edges (already done)

---

## Deferred to P4+

- **P4:** Enrichment validation (depends on P3g for full codebase coverage)
- **P5:** GPU PageRank (depends on P3g for search infrastructure)
- **P6:** AE/SOM optimization (depends on P5)
- **P7:** QLoRA/PPO export (depends on P6)

---

## Status Tracking

| Milestone | Status | ETA | Blocker |
|-----------|--------|-----|---------|
| P1h Schema Fix | ✅ DONE | — | — |
| P2 Provenance | ✅ DONE | — | — |
| P3 Join Repair | ✅ DONE | — | — |
| P3g Embedding Backfill | ⏳ QUEUED | 60–90 min | None |
| P3 Validation | ⏳ AFTER P3g | ~10 min | P3g |
| P4 Enrichment | ⏳ AFTER P3 | ~20 min | P3g |
| P5+ Parallel | ⏳ AFTER P3 | Independent | None |

---

**Next Action:** Implement `backfill-packets-embeddings-pool.mjs` (Option B). Estimated Session 71 start time: 90 minutes.
