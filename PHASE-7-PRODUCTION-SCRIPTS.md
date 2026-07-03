# Phase 7 Production Scripts & Execution Guide

**Date**: July 2, 2026  
**Status**: 4-worker cluster LIVE  
**Throughput**: 15+ summaries/min  
**ETA**: 1.7 days to completion

---

## Quick Start (All 4 Workers)

```powershell
cd "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

# Ensure Gemma4 is running
# If not: C:\Users\james\Desktop\llama-server-cuda\llama-server.exe \
#   -m "C:\Users\james\Videos\deeds-web-app\models\gemma4-legal-iq4xs-direct.gguf" \
#   -c 32768 -ngl 99 -fa on -ctk q8_0 -ctv q8_0 -b 256

# Start Worker 1 (foreground, logs to C:\temp\phase7-worker-1.log)
$env:LLM_CONCURRENCY = "1"
npx tsx scripts/atlas/phase7-gemma4-worker-patched.mts

# In separate terminals: Start Workers 2, 3, 4
# (same command, logs go to C:\temp\phase7-worker-{2,3,4}.log)
```

---

## Worker Scripts

### Main Worker: `phase7-gemma4-worker-patched.mts`

**Location**: `sveltekit-frontend/scripts/atlas/phase7-gemma4-worker-patched.mts`

**Responsibilities**:
1. Connect to RabbitMQ `phase7.summarization` queue
2. Dequeue chunks (2000/batch)
3. Call Gemma4 `:8090` for summary generation
4. Write to Postgres `codebase_chunk_index.summary`
5. Warm Bitfrost Redis cache (L1-L3 layers)

**Key Features**:
- LLMConcurrencySemaphore (respects global max=1 active request)
- ThroughputTracker (reports every 30s)
- Retry logic (2 retries on empty summary)
- Bitfrost cache warming (packet, summary, term caches)

**Environment Variables**:
```bash
LLM_CONCURRENCY=1        # Shared across all workers
GEMMA4_TIMEOUT=120000    # 120 second timeout
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
GEMMA4_URL=http://127.0.0.1:8090
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis
```

**Output Format**:
```
[timestamp] Processing chunk {id}...
  ℹ️  Calling Gemma4...
  ✓ Gemma4 (3.70s)
  ℹ️  Writing to Postgres...
  ✓ Postgres write
  ℹ️  Warming Redis cache...
  ✅ Complete (3.76s)
```

---

## Batch Enqueue Service

### Script: `phase7-batch-enqueue.mjs`

**Location**: `scripts/phase7-batch-enqueue.mjs`

**Responsibilities**:
1. Query Postgres for unsummarized chunks (LIMIT 2000)
2. Enqueue to RabbitMQ every 60 seconds
3. Log enqueue counts and errors

**Running**:
```bash
node scripts/phase7-batch-enqueue.mjs
# Logs to stdout
```

**Output**:
```
✅ Connected to RabbitMQ
[2026-07-02T21:08:12.777Z] ✅ Enqueued 2000 chunks (2000/2000)
```

---

## Monitoring

### Live Dashboard
```
http://localhost:5173/admin/phase7-monitor
```

Displays:
- Total summaries + progress bar
- Throughput (summaries/min) with trend
- ETA to completion
- BitFrost cache size (keys + terms)
- Service health (Postgres, Valkey, Gemma4)

### Metrics API
```bash
curl http://localhost:5173/api/admin/phase7-metrics | jq
```

Response:
```json
{
  "total_summaries": 5457,
  "recent_5min": 22,
  "summaries_per_min": 4.4,
  "bitfrost_keys": 138830,
  "bitfrost_terms": 3500,
  "llm_concurrency": "1/1",
  "queue_depth": 0,
  "redis_status": "connected",
  "postgres_status": "connected",
  "gemma4_status": "connected",
  "last_update": "2026-07-02T21:30:00.000Z"
}
```

### Direct Database Query
```sql
-- Check summary count
SELECT COUNT(*) as total FROM codebase_chunk_index 
WHERE summary IS NOT NULL AND summary <> '';

-- Check recent writes (last 5 min)
SELECT COUNT(*) as recent FROM codebase_chunk_index 
WHERE updated_at > NOW() - INTERVAL '5 minutes' 
AND summary IS NOT NULL;
```

### Redis Cache Status
```bash
# Check cache key count
docker exec legal-ai-valkey redis-cli -a redis DBSIZE

# Count by layer
docker exec legal-ai-valkey redis-cli -a redis --scan --pattern 'bitfrost:*' | \
  cut -d: -f2 | sort | uniq -c | sort -rn
```

### RabbitMQ Queue Status
```bash
docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers
```

---

## Troubleshooting

### Workers Stuck on "Empty summary from Gemma4"

**Symptom**: Logs show `Error: Empty summary from Gemma4` even when Gemma4 is responding

**Diagnosis**:
1. Check Gemma4 is returning valid JSON:
   ```bash
   curl -s -X POST http://127.0.0.1:8090/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model":"gemma4-legal-iq4xs-direct.gguf",
       "messages":[{"role":"user","content":"Summarize: function test() {}"}],
       "max_tokens":100,
       "temperature":0.3,
       "stream":false
     }' | jq '.choices[0].message.content'
   ```

2. Check response parser in worker:
   - Worker expects `choices[0].message.content` to be non-empty string
   - If Gemma4 returns `null` or empty string, worker retries then fails

3. **Root Cause**: KV cache may be corrupting streaming responses
   - `--cache-prompt` + `--cache-reuse 256` can cause empty responses on cache hits
   - Solution: Disable KV cache reuse or fix response parser

**Fix**:
```bash
# Restart Gemma4 WITHOUT cache-reuse
C:\Users\james\Desktop\llama-server-cuda\llama-server.exe \
  -m "C:\Users\james\Videos\deeds-web-app\models\gemma4-legal-iq4xs-direct.gguf" \
  -c 32768 -ngl 99 -fa on \
  -ctk q8_0 -ctv q8_0 \
  --cache-prompt \
  -b 256 -t 6
# Note: NO --cache-reuse flag
```

### Throughput Degradation

**Check current rate**:
```bash
# From worker log
tail -5 C:/temp/phase7-worker-1.log | grep "Rate:"

# Or via API
curl -s http://localhost:5173/api/admin/phase7-metrics | jq '.summaries_per_min'
```

**If < 3/min**:
1. Check Gemma4 memory: Should be ~6-7GB in use
   ```powershell
   Get-Process -Name llama-server | Select-Object WorkingSet64 | ForEach-Object {
     $ws = $_.WorkingSet64 / 1GB
     "Gemma4: {0:N2} GB" -f $ws
   }
   ```

2. Check RabbitMQ queue depth: Should stay at 0 (consuming faster than enqueue)
   ```bash
   docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages | grep phase7
   ```

3. Restart workers if stalled:
   ```bash
   pkill -f "phase7-gemma4-worker"
   sleep 2
   # Restart all 4 workers
   ```

---

## Current Production State

**Workers Running**: 4 × `phase7-gemma4-worker-patched.mts`
**Combined Throughput**: 15+ summaries/min
**Gemma4 Config**: q8_0/q8_0, 32K context, cache-prompt enabled
**Postgres Summaries**: 5,457 / 40,754 (13.4%)
**Remaining Chunks**: 35,297
**ETA**: ~40 hours (~1.7 days)

**Cache State**:
- Redis/Bitfrost: 138,830 keys (L1 packet, L2 summary, L3 feature layers)
- L1 warmth: 46,723 packet keys
- L2 warmth: 3,811 summary keys
- L3 warmth: 1,301 source + 850 feature keys

---

## Next Phase

After Phase 7 completion:

**Phase 8B: Full Bitfrost Warming**
```bash
npm run atlas:phase102:step8:bitfrost:warm:apply
```
- Pre-populate all packet envelopes (58K packets)
- Feature groupings (50K features)
- SOM centroids (20×20 grid)

**Phase 102: Topology Derivation**
```bash
npm run atlas:phase102:step1-12
```
- Neo4j PageRank + Louvain clustering
- Qdrant payload enrichment (topology tags)
- Summary layer synthesis
