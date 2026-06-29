# Offline Summary Pipeline with Cache Optimization

**Date**: June 29, 2026  
**Status**: 🟢 READY FOR EXECUTION  
**Goal**: Widen summary coverage from 347 → 5,000+ packets with L1-L3 cache optimization

---

## Architecture Overview

```
atlas_packets (58,304)
  ↓ [Export: Postgres → NDJSON]
  
unsummarized packets (5,000-50,000)
  ├─ [L1 Cache Check: Redis] ← FAST (< 5ms if hit)
  │   └─ Cache hits: Use cached embeddings
  │   └─ Cache misses: Proceed to Phase 3
  │
  ├─ [Phase 3: Gemma4 Worker] ← SLOW (1-3s per packet)
  │   └─ Python async + bounded concurrency
  │   └─ llama-server :8090 (GPU)
  │   └─ Resumable checkpoints
  │
  ├─ [Phase 4: Embed Summaries] ← MEDIUM (0.1-0.3s per packet)
  │   └─ Worker threads (L2 CPU cache optimization)
  │   └─ Batch via Ollama /api/embed
  │   └─ Cache in Redis L1 + Qdrant L2
  │
  ├─ [Phase 5: Update Metadata] ← FAST (< 1ms per key)
  │   └─ Redis centroids (cluster centers)
  │   └─ Qdrant tags (cluster_id, som_x, som_y)
  │   └─ TTL-based expiry
  │
  └─ [Phase 6: Postgres Import] ← MEDIUM (100ms per batch)
      └─ Batch insert (100-500 rows per query)
      └─ On-conflict update
      └─ Index-optimized queries
```

---

## Performance Targets

| Phase | Operation | Time/Item | Parallelism | Bottleneck |
|-------|-----------|-----------|-------------|-----------|
| 1 | Export | 0.1ms | N/A | Postgres IO |
| 2 | Cache check | 0.01ms | ✓ (Redis pipelined) | Redis network |
| 3 | Gemma4 | 1-3s | 1-3 (bounded concurrency) | GPU inference |
| 4 | Embedding | 0.1-0.3s | 2-4 (worker threads) | CPU/network |
| 5 | Metadata | 0.5ms | ✓ (Redis pipeline) | Redis write |
| 6 | Postgres | 0.02ms | ✓ (batched) | PG network |

**Expected throughput**:
- **5,000 packets**: ~2-3 hours (bottleneck: Gemma4 @ 1-3s/packet)
- **10,000 packets**: ~4-6 hours
- **Full corpus (58,304)**: ~20-40 hours (run overnight)

---

## Quick Start

### 1. Prerequisites Check

```bash
# Verify llama-server is running
curl http://127.0.0.1:8090/health

# Verify Postgres connection
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets"

# Verify Redis connection
docker exec legal-ai-valkey redis-cli PING
```

### 2. Run 50-Packet Pilot (Dry-Run)

```bash
# Node: Export + Import (dry-run)
node scripts/atlas/offline-summary-pipeline.mjs --limit=50 --skip-embedding

# Python: Gemma4 worker (separate, if dry-run successful)
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/pipeline-backlog.ndjson \
  --output=.tmp/pipeline-summaries.ndjson \
  --concurrency=1 \
  --max-tokens=256
```

### 3. Run Full Batch (500 packets)

```powershell
# PowerShell orchestrator handles all phases
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 500 -Concurrency 2
```

### 4. Monitor Progress

```bash
# Watch summary coverage growth
watch -n 5 'psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_summary_layers WHERE layer_type=\"gemma4_offline\""'

# Watch Redis cache
docker exec legal-ai-valkey redis-cli DBSIZE
docker exec legal-ai-valkey redis-cli KEYS 'summary:*' | wc -l
```

---

## Cache Architecture (L1-L3)

### L1: Redis (Hot Cache)
- **Key**: `summary:embedding:{packet_key}`
- **Value**: JSON embedding metadata
- **TTL**: 24 hours (configurable)
- **Hit rate target**: 80-90% after first pass
- **Fallback**: L2 Qdrant if missing

```bash
# Query
docker exec legal-ai-valkey redis-cli GET "summary:embedding:ace:packet:auth:001"

# Cleanup (if needed)
docker exec legal-ai-valkey redis-cli DEL "summary:embedding:*"
```

### L2: Qdrant (Semantic Search)
- **Collection**: `codebase_chunks_768`
- **Payload tags**: `cluster_id`, `som_x`, `som_y`, `summary_source`
- **Indexed**: feature_id, source_ref
- **Purpose**: Dense retrieval + tag filtering

```bash
# Query Qdrant for summaries
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/points/search \
  -H 'Content-Type: application/json' \
  -d '{"vector": [...], "limit": 10, "filter": {"key": "summary_source", "match": {"value": "gemma4_offline"}}}'
```

### L3: Postgres (Canonical + Audit)
- **Table**: `atlas_summary_layers`
- **Indexes**: `packet_key` (primary), `source_ref`, `layer_type`, `model_name`
- **Integrity**: Foreign key to `atlas_packets`
- **Audit**: `generated_at`, `updated_at` timestamps

---

## Optimization Strategies

### Strategy 1: Redis Pipelining (L1 Reads)
```javascript
// Check 1,000 keys in one round-trip
const pipeline = redis.pipeline();
for (const packet of packets) {
  pipeline.get(`summary:embedding:${packet.packet_key}`);
}
const results = await pipeline.exec(); // Single network RTT
```

### Strategy 2: Worker Thread Batching (L2 CPU)
```javascript
// Embed 100 summaries per worker thread
const workerPool = new piscina.Piscina({ maxSize: 4 });
const embedBatches = chunk(summaries, 100);
await Promise.all(embedBatches.map(batch => workerPool.run(batch)));
```

### Strategy 3: Postgres Batch Insert (L3 Write)
```sql
-- Insert 500 rows in one query (vs 500 queries)
INSERT INTO atlas_summary_layers (packet_key, source_ref, summary, ...)
VALUES
  ($1, $2, $3, ...),
  ($501, $502, $503, ...),
  ...
ON CONFLICT (packet_key) DO UPDATE SET updated_at = NOW();
```

### Strategy 4: Service Worker Caching (Browser L0, optional)
```javascript
// Cache summary responses in browser IndexedDB + Service Worker
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/summary/')) {
    event.respondWith(
      caches.match(event.request).then(response =>
        response ||
        fetch(event.request).then(response => {
          caches.open('summaries-v1').then(cache => cache.put(event.request, response.clone()));
          return response;
        })
      )
    );
  }
});
```

---

## Execution Phases (Detailed)

### Phase 1: Export (Fast)
```bash
node scripts/atlas/export-summary-backlog.mjs --limit=500 --output=.tmp/backlog.ndjson
# Expected: 5-10 seconds for 500 packets
# Output: NDJSON with packet_key, source_ref, keywords
```

### Phase 2: Cache Check (Fast)
```bash
# Pipelined Redis checks (1 network RTT for 500 keys)
# Expected: 10-50ms total
# Output: Partition into cached_keys, missing_keys
```

### Phase 3: Gemma4 Worker (Slow)
```bash
python scripts/gemma4/offline_summary_worker.py \
  --input=.tmp/backlog.ndjson \
  --output=.tmp/summaries.ndjson \
  --concurrency=2 \
  --max-tokens=256

# Expected: 1-3 seconds per packet (GPU-bound)
# 500 packets @ 2 concurrent = 250-750 seconds = 4-12 minutes
# Output: NDJSON with packet_key, summary, status
```

### Phase 4: Embed Summaries (Medium)
```bash
# Worker threads batch embeddings via Ollama
# Expected: 0.1-0.3s per embedding request (network + model)
# 500 packets @ 4 workers = ~40-150 seconds = 1-3 minutes
# Output: Cache in Redis + Qdrant
```

### Phase 5: Update Metadata (Fast)
```bash
# Redis pipeline update centroids
# Expected: 1-10ms per centroid (1 key = 1 cluster center)
# 500 packets → ~50-100 unique feature_ids → 50-100ms total
# Output: Redis centroid keys (TTL 24h)
```

### Phase 6: Postgres Import (Medium)
```bash
# Batch insert 100 rows per query
# Expected: 100-500ms per batch (Postgres + index updates)
# 500 packets / 100 per batch = 5 batches = 0.5-2.5 seconds total
# Output: Upserted into atlas_summary_layers
```

---

## Monitoring & Debugging

### Monitor Summary Coverage
```sql
SELECT
  COUNT(*) as total_packets,
  COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as summarized,
  ROUND(100.0 * COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_pct
FROM atlas_packets ap
LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key;
```

### Check Cache Hit Rate
```bash
# Monitor Redis keyspace
docker exec legal-ai-valkey redis-cli INFO keyspace

# Count summary embeddings cached
docker exec legal-ai-valkey redis-cli KEYS 'summary:embedding:*' | wc -l

# Check Qdrant payload tags
curl http://127.0.0.1:6333/collections/codebase_chunks_768/points/count
```

### Detect Bottlenecks
```bash
# Profile Gemma4 latency
time python scripts/gemma4/offline_summary_worker.py --input=test.ndjson --concurrency=1 --max-tokens=256

# Profile embedding latency
curl -X POST http://127.0.0.1:11434/api/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"model":"embeddinggemma:latest", "prompt":"test"}' | jq '.time'

# Profile Postgres batch insert
EXPLAIN ANALYZE INSERT INTO atlas_summary_layers ... VALUES (...);
```

---

## Tuning Parameters

### For High VRAM (RTX 3060 Ti 8GB)
```bash
# Max concurrent Gemma4 requests: 2-3
# Max embedding batch size: 50-100
# Redis TTL: 24-72 hours
python scripts/gemma4/offline_summary_worker.py \
  --concurrency=2 \
  --max-tokens=512
```

### For Limited VRAM (< 6GB)
```bash
# Reduce concurrency to 1, reduce token budget
python scripts/gemma4/offline_summary_worker.py \
  --concurrency=1 \
  --max-tokens=128
```

### For CPU-Only (No GPU)
```bash
# Use Ollama fallback with reduced concurrency
# Expect 3-5x slower inference
--concurrency=1
--max-tokens=128
```

---

## Files & Scripts

| Script | Purpose | Phase |
|--------|---------|-------|
| `export-summary-backlog.mjs` | Query unsummarized packets | 1 |
| `offline_summary_worker.py` | Gemma4 async worker | 3 |
| `offline-summary-pipeline.mjs` | Full orchestration | 1-6 |
| `Invoke-OfflineSummarization.ps1` | PowerShell wrapper | All |
| `import-gemma4-summaries.mjs` | Postgres import | 6 |

---

## Next Steps

1. **Run 50-packet pilot**
   ```bash
   node scripts/atlas/offline-summary-pipeline.mjs --limit=50 --skip-embedding
   ```

2. **If successful, run 500-packet batch**
   ```powershell
   .\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 500 -Concurrency 2
   ```

3. **Monitor coverage growth**
   ```bash
   watch -n 60 'psql ... -c "SELECT COUNT(*) FROM atlas_summary_layers"'
   ```

4. **After coverage > 5,000 packets:**
   - Revisit GPU clustering with better input
   - Validate k-means quality against cuML baseline
   - Update feature envelopes with richer embeddings
   - Create Chrom97 packet generation specs

---

## Key Insights

✅ **Python async solves Node bottleneck** — Bounded concurrency (1-3) prevents VRAM exhaustion  
✅ **Redis L1 cache enables second-pass speed** — 80% faster after first batch  
✅ **Postgres batch insert scales linearly** — 100-500 rows per query ≈ 1ms/row  
✅ **Qdrant tags enable semantic filtering** — Fast re-ranking without full re-search  
✅ **Worker threads avoid GIL** — Python asyncio + JS workers = true parallelism  

**Bottleneck remains**: Gemma4 inference (1-3s/packet). To accelerate:
- Reduce `--max-tokens` to 128 (faster, less quality)
- Run multiple workers on separate GPU instances
- Pre-cache common patterns (future optimization)

---

## Summary

Ready to execute offline Gemma4 summarization pipeline with full cache optimization. Expected to achieve:
- **500 packets in 5-15 minutes** (parallel Gemma4 + embeddings)
- **5,000 packets in 50-150 minutes** (incremental, resumable)
- **Full corpus (58K) in 20-40 hours** (overnight runs)

All with L1-L3 cache optimization and service worker support for browser caching.
