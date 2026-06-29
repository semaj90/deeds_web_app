# Session 96: Redis Packet Organization Strategy — BitFrost Upsert Optimizer

**Date**: June 29, 2026  
**Status**: 🟢 STRATEGY DOCUMENTED + SCRIPT IMPLEMENTED  
**Production Batch**: 57,976 packets → Gemma4 (running, ~32 hours)

---

## Executive Summary

The production batch (57,976 packets) is running. When complete, we need **strategic Redis organization** for efficient cache lookups and agentic tool integration. This document outlines:

1. **4-tier Redis key hierarchy** for semantic and structural discovery
2. **Batch upsert strategy** (pipelined inserts, 1,000 packets/batch)
3. **Incremental resume capability** (crash-safe, resume from last batch)
4. **ACE integration** (how this feeds the 6-layer retrieval chain)

---

## The Problem: "Organize the Packets Upsert Them Into Redis"

The naive approach reads all 57K packets from Postgres into memory, creates individual Redis keys sequentially. Issues:
- ❌ Memory spike (57K × 2KB per packet = 114MB+ in-memory payload)
- ❌ Sequential SET operations (57,976 SETEX calls, ~2 QPS = 8 hours just for Redis)
- ❌ No crash recovery (fail at 30K packets → start over)
- ❌ No indexing for agentic discovery (can't ask "what packets match feature X?")
- ❌ No ordering for reranking (cache hit doesn't preserve authority score)

---

## Solution: 4-Tier Hierarchical Organization

### Tier 1: Exact-Match Envelope (L1 Cache)
```
bifrost:packet:{packet_key} → JSON envelope
  - packet_key (identity, immutable)
  - feature_id (search key)
  - summary (cached output)
  - confidence (0.95 for real, 0.3 for seed)
  - provenance (model, temperature, timestamp)
  - TTL: 604800 seconds (7 days)
```

**Purpose**: Fast recall for exact packet IDs. Lookup time: 2-5ms.  
**Example**:
```
GET bifrost:packet:ace:auth:001
→ {
    "packet_key": "ace:auth:001",
    "feature_id": "auth.sessions",
    "summary": "Handles Lucia session validation.",
    "confidence": 0.95,
    "updated_at": "2026-06-29T21:50:00Z",
    "provenance": {"model": "gemma4", "temperature": 0.3, "max_tokens": 128}
  }
```

---

### Tier 2: Feature Index (L2 Discovery)
```
bifrost:feature:{feature_id} → set of packet_keys
  - SADD bifrost:feature:auth.sessions packet:001 packet:002 ...
  - SCARD bifrost:feature:auth.sessions → 42
  - TTL: 604800 seconds
```

**Purpose**: Answer "what packets are in feature X?" → enables ACE context lens selection.  
**Example**:
```
SMEMBERS bifrost:feature:auth.sessions
→ ["ace:auth:001", "ace:auth:002", "ace:auth:003", ...]

SCARD bifrost:feature:auth.sessions
→ 42
```

---

### Tier 3: Directory Index (L3 Spatial)
```
bifrost:dir:{dir_hash} → set of packet_keys
  - SADD bifrost:dir:src:lib:server packet:001 packet:002 ...
  - Hierarchical: bifrost:dir:src / bifrost:dir:src:lib / bifrost:dir:src:lib:server
  - TTL: 604800 seconds
```

**Purpose**: Find all packets in a directory subtree (for agentic directory-scoped context).  
**Example**:
```
SMEMBERS bifrost:dir:src:lib:server
→ ["ace:auth:001", "ace:db:002", "ace:cache:003", ...]

# Combined with SINTER for cross-feature in single directory
SINTER bifrost:feature:auth.sessions bifrost:dir:src:lib:server
→ ["ace:auth:001", "ace:auth:003"] (packets in auth.sessions AND src/lib/server)
```

---

### Tier 4: Global Sorted Index (L4 Authority)
```
bifrost:index:all → sorted set by updated_at (timestamp)
  - ZADD bifrost:index:all {score} {packet_key}
  - score = unix timestamp
  - ZREVRANGE bifrost:index:all 0 99 WITHSCORES → top-100 recent
  - TTL: 604800 seconds
```

**Purpose**: Reranking, freshness ordering, cache hit probability boosting.  
**Example**:
```
# Get top-100 most recently updated packets
ZREVRANGE bifrost:index:all 0 99 WITHSCORES
→ [
    "ace:auth:001", 1719696600000,
    "ace:db:002", 1719696585000,
    "ace:cache:003", 1719696570000,
    ...
  ]

# Find packets updated in last 24h
ZREVRANGEBYSCORE bifrost:index:all +inf {24h_ago_timestamp}
→ [first 100 packets updated in last 24h]
```

---

## Batch Upsert Strategy

### Overview
- **Input**: NDJSON file (`.tmp/gemma4-production-summaries.ndjson`)
- **Batch size**: 1,000 packets per batch
- **Pipelining**: 1 Redis pipeline per batch (1,000+ Redis commands, executed atomically)
- **Throughput**: ~1,000 packets = 4,000 Redis commands / batch ≈ 2-3 seconds/batch
- **Total time**: 57 batches × 3s = ~2.5 minutes for all packets
- **Resume**: Crash at batch 30 → restart at batch 31 (no duplication risk)

### Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Read NDJSON line-by-line                                 │
│    Accumulate 1,000 packets (or EOF)                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Organize by feature & directory                          │
│    featureGroups = {                                         │
│      "auth.sessions": ["packet:001", "packet:002", ...]     │
│      "db.queries": ["packet:042", "packet:043", ...]        │
│    }                                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Create Redis pipeline (1 per batch)                       │
│    pipeline.setex("bifrost:packet:...", TTL, envelope)      │
│    pipeline.sadd("bifrost:feature:...", packet_keys)        │
│    pipeline.sadd("bifrost:dir:...", packet_keys)            │
│    pipeline.zadd("bifrost:index:all", timestamp, packet)    │
│    pipeline.hset("bifrost:stats", ...)                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Execute pipeline atomically                               │
│    await pipeline.exec()                                     │
│    → All 1,000 packets + indexes in ~3 seconds              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Log progress & continue                                   │
│    [Batch 1] ✅ Upserted 1000 packets (4001 commands)       │
│    [Batch 2] ✅ Upserted 1000 packets (4001 commands)       │
│    ...                                                        │
│    [Batch 57] ✅ Upserted 976 packets (3905 commands)       │
└─────────────────────────────────────────────────────────────┘
```

### Commands Generated Per Batch

For a single batch with 1,000 packets in 150 features and 50 directories:

```
per-packet commands:
  1. SETEX bifrost:packet:{key} 604800 {envelope}  [1,000×]
  
feature index commands:
  2. SADD bifrost:feature:{feature_id} {packet_keys}  [150×]
  3. EXPIRE bifrost:feature:{feature_id} 604800      [150×]
  
directory index commands:
  4. SADD bifrost:dir:{dir_hash} {packet_keys}       [50×]
  5. EXPIRE bifrost:dir:{dir_hash} 604800            [50×]
  
sorted index commands:
  6. ZADD bifrost:index:all {score} {packet_key}     [1,000×]
  
stats commands:
  7. HSET bifrost:stats last_updated {timestamp}     [1×]
  8. HSET bifrost:stats packet_count {count}         [1×]
  9. EXPIRE bifrost:stats 604800                     [1×]

TOTAL: ~4,000 commands / batch → 1 pipeline.exec() call
```

---

## Dry-Run First (No Risk)

```bash
# Dry-run: preview what would be upserted (no Redis writes)
npm run bitfrost:packet:upsert:dry

# Expected output:
# [Batch 1] Dry-run: 4001 Redis commands (1000 packets, 0 skipped)
# [Batch 2] Dry-run: 4002 Redis commands (1000 packets, 0 skipped)
# ...
# [Summary]
#   Batches processed: 57
#   Packets upserted: 57976
#   Duration: 12.3s
```

---

## Production Execution

Once the Gemma4 batch completes (expected ~July 1, 06:00 UTC):

```bash
# Step 1: Verify batch output exists
ls -lh .tmp/gemma4-production-summaries.ndjson
# Should be 150MB+ with 57,976 lines

# Step 2: Dry-run the upsert (verify logic)
npm run bitfrost:packet:upsert:dry

# Step 3: Execute the upsert
npm run bitfrost:packet:upsert
# Watches: .tmp/batch.log for real-time progress
# Performs Redis health check before starting
# Auto-connects to Valkey (127.0.0.1:6379, password: redis)

# Step 4: Verify cache structure
npm run bitfrost:packet:upsert:verify
# Samples L1/L2/L3/L4 keys
# Reports: feature_indexes count, dir_indexes count, global_index cardinality
# Confirms: stats hash contains last_updated, packet_count
```

---

## ACE Integration (Why This Matters)

This 4-tier structure feeds into the 6-layer retrieval chain:

```
User Query
  ↓
Layer 1: BitFrost L1 Exact-Match       ← Tier 1: bifrost:packet:*
  (2-5ms lookup, no Qdrant needed)
  ↓ miss
Layer 2: Postgres Bitmap Index         ← Fallback to DB query
  ↓ weak match
Layer 3: Qdrant ANN (768d)             ← Semantic search
  ↓ candidates returned
Layer 4: ACE Context Pack              ← Build context from Tiers 2-4
  (Use Tier 2 feature_id → SMEMBERS → related packets)
  (Use Tier 3 dir_hash → SINTER across features)
  (Use Tier 4 sorted_set → rerank by freshness)
  ↓
Layer 5: Gemma4 Synthesis
  ↓
Layer 6: Final Output + Provenance
```

**Example ACE context assembly**:
```typescript
// Given a query matching feature_id: "auth.sessions"
const relatedPackets = await redis.smembers('bifrost:feature:auth.sessions');
// → ["ace:auth:001", "ace:auth:002", ...]

// Fetch all envelopes in parallel
const envelopes = await Promise.all(
  relatedPackets.map(k => redis.get(`bifrost:packet:${k}`))
);
// → [envelope1, envelope2, ...]

// Sort by freshness (rerank via Tier 4)
const freshPackets = await redis.zrevrange(
  'bifrost:index:all', 0, 99, 'WITHSCORES'
);
// → [recent packets first]

// Assemble ACE context with provenance
const aceContext = {
  packets: envelopes.slice(0, 10),  // Top 10
  feature_id: "auth.sessions",
  directory_context: "src/lib/server",
  freshness_score: calculateFreshness(freshPackets)
};

// Send to Gemma4 Layer 5
const synthesis = await gemma4(aceContext);
```

---

## Incremental Warm-Up (Recovery Safety)

If Redis crashes or network fails mid-upsert:

```bash
# Resume from last successful batch
npm run bitfrost:packet:upsert:resume=30
# Starts at batch 31 (skips 1-30)
# No duplication because SETEX/SADD/ZADD are idempotent

# Verify final count matches expected
HGET bifrost:stats packet_count
→ 57976  (if all batches completed successfully)
```

---

## Performance Expectations

| Metric | Value | Notes |
|--------|-------|-------|
| Throughput | 20,000 packets/min | 1,000 packets/batch ÷ 3s = 333 batches/min |
| Total time | ~2.5 minutes | 57,976 ÷ 20,000 = 2.9 min |
| Redis memory | ~150 MB | 57K packets × 2.5KB avg = 142.5 MB |
| L1 hit time | 2-5 ms | Network + Redis parse |
| Cache speedup | 6,500× | vs 25-35s Gemma4 inference |
| Batch pipeline size | ~4,000 commands | Pipelined atomically |
| Network cost | ~150 MB upload | Compressed JSON over TCP |

---

## Verification Post-Upsert

```bash
# Check Redis key counts
docker exec legal-ai-valkey redis-cli DBSIZE
# Expected: 150,000+ keys (57K packet keys + 2K index keys)

# Sample a L1 key
docker exec legal-ai-valkey redis-cli GET "bifrost:packet:ace:auth:001"
# Should return the envelope JSON

# Count L2 feature indexes
docker exec legal-ai-valkey redis-cli KEYS "bifrost:feature:*" | wc -l
# Expected: 1,000+ unique features

# Sample a sorted index
docker exec legal-ai-valkey redis-cli ZCARD "bifrost:index:all"
# Expected: 57,976

# Check stats
docker exec legal-ai-valkey redis-cli HGETALL bifrost:stats
# Expected: last_updated={timestamp}, packet_count=57976
```

---

## Troubleshooting

### Issue: "Redis connection refused"
```bash
# Check Valkey service
docker ps | grep valkey

# If down, start it
docker-compose up -d legal-ai-valkey

# Verify connection
docker exec legal-ai-valkey redis-cli ping
# Should return: PONG
```

### Issue: "Pipeline execution failed"
```bash
# Likely cause: individual SET failed (e.g., oversized payload)
# Solution: increase Redis maxmemory if needed
docker exec legal-ai-valkey redis-cli CONFIG SET maxmemory 512mb

# Re-run from last batch
npm run bitfrost:packet:upsert:resume={last_batch_number}
```

### Issue: "Packets count doesn't match"
```bash
# Verify input file has expected line count
wc -l .tmp/gemma4-production-summaries.ndjson
# Should be: 57976

# Check for parsing errors in log
tail -100 .tmp/batch.log | grep -i "error\|warn"
```

---

## Next Steps (Post-Batch)

Once the production batch completes:

1. **Upsert packets to Redis** (this script)
   ```bash
   npm run bitfrost:packet:upsert
   ```

2. **Verify cache structure**
   ```bash
   npm run bitfrost:packet:upsert:verify
   ```

3. **Test ACE Layer 4 retrieval** (optional)
   ```bash
   curl http://localhost:5173/api/retrieval/ace/test?feature=auth.sessions
   # Should return ace context with 10+ packets
   ```

4. **Monitor cache hit rate**
   ```bash
   docker exec legal-ai-valkey redis-cli INFO stats
   # Track: keyspace_hits, keyspace_misses
   # Target: 90%+ hit rate on subsequent queries
   ```

---

## Files Modified

- `scripts/atlas/bitfrost-packet-upsert-optimized.mjs` (NEW, 280 lines)
- `sveltekit-frontend/package.json` (added 3 npm scripts)

---

## Status

✅ **Strategy documented**  
✅ **Script implemented**  
✅ **Npm scripts wired**  
⏳ **Awaiting production batch completion** (~July 1, 2026)  
⏳ **Ready for execution** once batch finishes

---

**Batch Status**: 57,976 packets → Gemma4 (RUNNING)  
**Expected Completion**: July 1, 2026, ~06:00 UTC  
**Next Action**: Execute `npm run bitfrost:packet:upsert` once batch log shows `[Complete]`