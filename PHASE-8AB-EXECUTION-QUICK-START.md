# Phase 8A + 8B Parallel Execution — Quick Start

**Status**: Phase 7 RabbitMQ workers running continuously | Phase 8A/8B ready to launch in parallel

**Goal**: 
- Phase 8A: Pre-fill llama-server KV cache with legal preambles → 2-3× throughput speedup
- Phase 8B: Warm Redis L1 packet envelopes from already-summarized chunks → instant L1 cache hits

**Timeline**: ~45 minutes total (15 min setup + 20 min Phase 8A + 10 min Phase 8B)

---

## Step 1: Verify llama-server Configuration (5 min)

**Current llama-server must have**:
- `-np 2` (2 parallel inference slots)
- `--cache-prompt` (enable KV cache prefilling)
- `--cache-reuse 256` (cache reuse window)

**Check if running**:
```bash
curl http://127.0.0.1:8090/health
# Expected: HTTP 200
```

**Launch if not running**:
```powershell
# Use launch script with correct flags
.\scripts\launch-turboquant.ps1

# OR manually:
.\llama-server.exe `
  -m "models\gemma4-legal-iq4xs-direct.gguf" `
  --host 127.0.0.1 --port 8090 `
  -c 16384 -ngl 99 -fa `
  -np 2 `
  --cache-prompt --cache-reuse 256 `
  -b 1024 -ub 256
```

**Verify KV cache is enabled**:
```bash
curl http://127.0.0.1:8090/v1/models | jq '.data[0] | {id, context_length}'
# Expected: id = "gemma4-legal-iq4xs-direct.gguf"
```

---

## Step 2: Run Phase 8A — KV Cache Warming (15 min)

**Dry-run first** (no side effects):
```bash
npm run phase8a:kv-cache:warm

# Output should show:
#   Mode: DRY_RUN | Preambles: 10 | URL: http://127.0.0.1:8090
#   ✅ llama-server is healthy
#   🔥 Warming 10 preambles...
#   [DRY_RUN] Would warm cache: legal_summary
#   [DRY_RUN] Would warm cache: legal_entity_extraction
#   ... (8 more)
```

**Apply** (actually warm the cache):
```bash
npm run phase8a:kv-cache:warm:apply

# This will take ~20 seconds (2s per preamble × 10)
# Output should show:
#   Mode: APPLY | Preambles: 10
#   ✅ llama-server is healthy
#   🔥 Warming 10 preambles...
#   ✓ Warmed: legal_summary
#   ✓ Warmed: legal_entity_extraction
#   ... (8 more)
#   ✅ Cache warming complete
#   Warmed: 10/10
```

**Expected effect**: Next Gemma4 call should start with cached KV context, skip prefill latency.

---

## Step 3: Verify Phase 7 Throughput Improvement (ongoing)

**Monitor RabbitMQ queue depth**:
```bash
# Check how many summaries are pending
docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers
# Expected: 'summarization_queue' should have steady, decreasing count

# Or from SvelteKit health endpoint:
curl http://127.0.0.1:5173/api/health | jq '.rabbitMQ'
```

**Monitor summary generation rate**:
```bash
# Watch the Postgres summary count increase
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL AND summary != '' ORDER BY updated_at DESC LIMIT 5"

# Run this every 2-3 minutes:
# Expected: count increases by ~10-15 per minute (with cache warm)
# Without cache: ~1-2 per minute
# With cache: ~5-7 per minute
```

**Speedup verification**:
```bash
# Before: 1.3 summaries/min × 40,754 chunks = ~520 hours
# After:  5-7 summaries/min × 40,754 chunks = ~100-140 hours
# Savings: 380-420 hours (16-17 days saved!)
```

---

## Step 4: Run Phase 8B — Redis L1 Packet Envelope Warming (10 min)

**Prerequisite**: At least 1,000 chunks must have summaries for Phase 8B to have data to cache.

**Check status**:
```bash
# Count summarized packets available
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL AND summary != '' AND summary !~ '^\s*$'"
# Expected: Should be > 2,000 by now
```

**Dry-run Phase 8B**:
```bash
npm run atlas:phase102:step8:bitfrost:warm:dry

# Output should show:
#   DRY_RUN mode
#   Warming 2,000+ packet envelopes from L1
#   [DRY_RUN] Would cache bitfrost:packet:{key} → {envelope}
#   [DRY_RUN] Would cache bitfrost:feature:{id}:packets → [ids]
#   [DRY_RUN] Would cache bitfrost:som:{cluster}:packets → [ids]
```

**Apply Phase 8B**:
```bash
npm run atlas:phase102:step8:bitfrost:warm:apply

# This will take ~5-10 minutes depending on packet count
# Output should show:
#   Warming 2,000+ packet envelopes from L1
#   ✓ Cached 2,000+ L1 packet envelopes
#   ✓ Cached 500+ L2 feature sets
#   ✓ Cached 100+ L3 SOM centroids
#   ✅ Phase 8B complete
```

---

## Step 5: Parallel Execution — GPU Acceleration (Optional, 10 min)

**While Phase 8B runs**, optionally encode latent vectors for Phase 8B2:

**Dry-run GPU autoencoder**:
```bash
npm run phase7:cuda:encode-latent

# Output:
#   Mode: DRY_RUN | Batch: 500
#   📥 Loaded 2,000+ chunks needing latent encoding
#   [DRY_RUN] Would encode N chunks to latent_64 via autoencoder
```

**Apply GPU encoding** (runs in background, doesn't block Phase 7):
```bash
npm run phase7:cuda:encode-latent:apply

# This takes ~30 seconds for 2,000 chunks
# Output:
#   Mode: APPLY | Batch: 500
#   📥 Loaded 2,000+ chunks needing latent encoding
#   🔧 Encoding 2,000 vectors through autoencoder...
#   ✓ Encoded 2,000 vectors to 64-dim
#   💾 Writing latent_64 to Postgres...
#   ✅ Encoded 2,000 chunks to latent_64
```

---

## Execution Timeline

```
T+0:00    Verify llama-server running with cache flags
T+0:05    Phase 8A KV cache warming (dry-run + apply) = 15 min
T+0:20    Phase 7 throughput improves 2-3× 
T+0:25    Phase 8B Redis warming starts (15 min) + GPU encoding (5 min parallel)
T+0:40    Phase 8A/8B complete
T+0:45    System ready: Phase 7 at 5-7 summaries/min, Phase 8B L1 cache active
```

---

## Success Criteria

✅ **Phase 8A success**:
- llama-server health: HTTP 200
- Cache warm completed: 10/10 preambles warmed
- llama-server logs show `cache_prompt_tokens` (KV cache reuse)

✅ **Phase 7 throughput improvement**:
- Before cache: 1.3 summaries/min
- After cache: 5-7 summaries/min
- Postgres `updated_at DESC LIMIT 5` should show recent timestamps

✅ **Phase 8B success**:
- Redis keys present: `bitfrost:packet:*` (2,000+ keys)
- Redis keys present: `bitfrost:feature:*` (500+ keys)
- Redis keys present: `bitfrost:som:*` (100+ keys)
- Verify with: `docker exec legal-ai-redis redis-cli KEYS 'bitfrost:*' | wc -l`

---

## Monitoring

**Phase 7 workers** (should be continuously running):
```bash
# Check RabbitMQ queue stats
docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers

# Check Postgres write rate
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE updated_at > NOW() - INTERVAL '5 minutes'"
```

**Phase 8A/8B status**:
```bash
# Check Redis cache size
docker exec legal-ai-redis redis-cli INFO memory | grep used_memory_human

# Check BitFrost cache contents
docker exec legal-ai-redis redis-cli HLEN gpu:karpathy:scores
```

---

## Troubleshooting

**Issue**: llama-server not responding
```
Solution:
  1. Check if running: curl http://127.0.0.1:8090/health
  2. Restart with correct flags: .\scripts\launch-turboquant.ps1
  3. Verify ports: netstat -an | findstr :8090
```

**Issue**: Cache warming fails (timeouts)
```
Solution:
  1. Check llama-server logs for errors
  2. Verify -np 2 setting (may be bottleneck)
  3. Increase timeout in phase8a-kv-cache-warming.mjs (default: 30s)
  4. Try one preamble at a time manually to diagnose
```

**Issue**: Phase 7 throughput doesn't improve
```
Solution:
  1. Verify cache_prompt flag is set in phase7-cuda-accelerator-correct.mjs (line 76)
  2. Check if new calls are hitting cache: grep "cache_prompt_tokens" in llama-server logs
  3. Verify workers are using updated gemma4-summary-wrapper.ts (cache_prompt: true)
  4. May need to restart RabbitMQ workers to pick up the cached prefill
```

---

## Next Steps (Phase 102)

Once Phase 8A/8B are stable:

```bash
# Step 3: Sync Qdrant payloads with Neo4j GDS results
npm run atlas:phase102:step3:qdrant-sync:dry

# Step 4: Validate RRF ranking
npm run atlas:phase102:step4:rrf-validation:dry

# Full Phase 102 execution
npm run atlas:phase102:full:dry && npm run atlas:phase102:full:apply
```

---

**Created**: Phase 8A/8B Execution Guide  
**Status**: Ready to execute  
**Prerequisites**: Phase 7 workers running, llama-server with cache flags
