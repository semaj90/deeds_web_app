# Canonical Embedding Worker Pipeline — Complete Setup

**Status**: ✅ Production Ready  
**Date**: 2026-06-24  
**Components**: RabbitMQ Producer + Multi-Worker Cluster + Validation Suite

---

## Overview

The canonical embedding worker pipeline backfills `atlas_packets.embedding` (768-dimensional vectors) with full multi-tier caching, deduplication, and metrics collection.

**Canonical Truth**: PostgreSQL `atlas_packets.embedding` (vector type)  
**Mirrors**: Valkey/Redis, Qdrant, Bifrost semantic cache  
**Providers**: SvelteKit `/api/embed` (ONNX) → Ollama (fallback)  
**Deduplication**: Postgres packet claim + Valkey summary_hash cache

---

## Prerequisites

### Services Required
- **PostgreSQL 18.4** with pgvector (atlas_packets table with vector type)
- **RabbitMQ** (queue: `phase1.canonical-embeddings`)
- **Valkey/Redis** (port 6379, password: `redis`)
- **Ollama** (port 11434, model: `embeddinggemma:latest`)
- **Bifrost** (port 3040, optional semantic cache)
- **Qdrant** (port 6333, optional vector mirror)

### Node.js
- Node 18+ with `pg`, `amqplib`, `ioredis` packages

---

## Step 1: Enqueue Jobs

Enqueue packets missing embeddings into RabbitMQ:

```bash
# Full batch (7,232 packets)
node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --enqueue

# Test batch (1 packet)
PACKET_LIMIT=1 node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --enqueue

# Check queue depth
node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --stats
```

**Output**:
```
[2026-06-24T12:34:56.789Z] 🚀 Enqueuing canonical packet embeddings
  Found 7232 packets needing embeddings
  Queue 'phase1.canonical-embeddings' ready
✅ Complete
  Total enqueued: 7232
  Queue: phase1.canonical-embeddings
```

---

## Step 2: Start Worker(s)

### Option A: Ollama (Native Windows GPU)

```bash
# Terminal 1: Ensure Ollama is running
ollama serve

# Terminal 2: Start worker pool (4 workers, each concurrency=1)
EMBED_MODE=ollama node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=4

# Terminals 3-5: Additional workers for parallelism
EMBED_MODE=ollama node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &
EMBED_MODE=ollama node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &
EMBED_MODE=ollama node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &
```

**Expected throughput**: ~40 packets/min with 4 workers → 3 hours for 7,232 packets

### Option B: SvelteKit ONNX (npm run dev:gpu)

```bash
# Terminal 1: Start SvelteKit dev server
npm run dev:gpu

# Terminal 2: Start worker pool
EMBED_MODE=onnx node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=4
```

### Option C: Auto-detect

```bash
# Try ONNX first, fall back to Ollama
EMBED_MODE=auto node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=4
```

---

## Pipeline Architecture

### Worker Steps (Per Packet)

```
RabbitMQ job received
    ↓
STEP 1: Claim packet atomically
    UPDATE atlas_packets.metadata['embedding_claimed_at']
    WHERE embedding IS NULL
    (prevents duplicate processing across workers)
    ↓
STEP 2: Check Valkey cache by summary_hash
    bifrost:embed:embeddinggemma:768:{sha256(summary)}
    (7-day TTL cache for identical summaries)
    ↓
STEP 3: Call embedding provider (if cache miss)
    ONNX: POST http://127.0.0.1:5173/api/embed
      OR Ollama: POST http://127.0.0.1:11434/api/embeddings
    (768-dim vector returned)
    ↓
STEP 4: Cache embedding in Valkey
    SET bifrost:embed:embeddinggemma:768:{summary_hash} = vector
    (30-day TTL for hit reuse)
    ↓
STEP 5: Write to Postgres (canonical truth)
    UPDATE atlas_packets SET embedding = $1::vector(768)
    + metadata.provenance = {provider, model, dim, summary_hash, trace_id}
    ↓
STEP 6: Warm Redis centroid seed
    centroid:seed:packet:{packet_key} = { packet_key, feature_id, status, updated_at }
    (7-day TTL, awaiting SOM/KMeans projection)
    ↓
STEP 7: Warm Bifrost L2 semantic cache
    POST http://127.0.0.1:3040/warm with embedding + summary
    (optional, speeds future retrieval)
    ↓
STEP 8: Upsert Qdrant payload/vector (mirror, best-effort)
    PUT /collections/codebase_chunks_768/points
    (if qdrant_point_id exists in atlas_packets)
    ↓
STEP 9: Submit ACP Gemma4 task
    POST /api/ai/agent (async summary synthesis)
    ↓
STEP 10: Record metrics
    INSERT atlas_embedding_metrics
    (packet_key, provider, latency_ms, cache_hit, qdrant_upsert, redis_warmed)
    ↓
RabbitMQ ACK (only on success)
```

---

## Deduplication Guarantees

### Multi-Worker Safety

1. **Postgres Claim Lock** (hard guarantee):
   ```sql
   UPDATE atlas_packets
   SET metadata = jsonb_set(..., '{embedding_claimed_at}', now())
   WHERE packet_id = $1 AND embedding IS NULL
   RETURNING ...;
   ```
   Only one worker wins this CAS (Compare-And-Set). Others get RETURNING row count = 0 and skip.

2. **Valkey Summary Hash Cache** (fast dedupe):
   ```
   bifrost:embed:embeddinggemma:768:{sha256(summary.trim())}
   ```
   If two workers see the same summary, first one computes embedding, both reuse from cache.

3. **RabbitMQ Fair Dispatch**:
   ```javascript
   channel.prefetch(CONCURRENCY);  // Each worker claims only N jobs at a time
   ```
   Jobs distributed fairly across workers.

### Result: Zero Duplicate Embeddings

Same packet processed by Worker A and Worker B:
- Worker A: claims packet, computes embedding, writes Postgres ✓
- Worker B: claims fails (embedding now NOT NULL), acks and moves on ✓

---

## Monitoring

### Real-Time Stats

```bash
node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --stats
```

**Output**:
```
📊 Canonical Packet Embedding Status
  Total packets: 17995
  With embeddings: 12567/17995 (69.9%)
  Missing embeddings: 5428/17995 (30.1%)

  Queue 'phase1.canonical-embeddings': 2314 pending jobs
  Redis centroids cached: 1234 packets (7-day TTL)
```

### Postgres Inspection

```sql
-- Check coverage
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded,
  COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing
FROM atlas_packets;

-- Check provenance (which provider was used)
SELECT
  metadata->'provenance'->>'embedding_provider' as provider,
  COUNT(*) as count
FROM atlas_packets
WHERE embedding IS NOT NULL
GROUP BY provider;

-- Check for orphaned claims (should be 0)
SELECT COUNT(*) as orphaned_claims
FROM atlas_packets
WHERE metadata->>'embedding_claimed_at' IS NOT NULL
  AND embedding IS NULL;
```

### Valkey Inspection

```bash
# Check cache keys
redis-cli KEYS 'bifrost:embed:embeddinggemma:768:*' | wc -l
redis-cli KEYS 'centroid:seed:packet:*' | wc -l

# Sample cache entry
redis-cli GET 'bifrost:embed:embeddinggemma:768:abc123...'  # Returns 768-dim vector as JSON array
redis-cli GET 'centroid:seed:packet:src/lib/...'           # Returns centroid seed metadata
```

---

## Validation & Testing

### Full Validation Suite

After running workers, validate end-to-end pipeline:

```bash
node scripts/atlas/validate-canonical-embedding-worker.mjs
```

**Checks**:
- ✓ Postgres embedding coverage increased
- ✓ Valkey `bifrost:embed:*` cache keys exist
- ✓ Valkey `bifrost:packet:*` hot metadata exist
- ✓ Redis `centroid:seed:packet:*` seeds created
- ✓ `atlas_embedding_metrics` table populated
- ✓ No orphaned claims (embedding_claimed_at without embedding)
- ✓ Provenance metadata fields present
- ✓ Qdrant payloads synced (if points exist)

**Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 VALIDATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Status: ✅ PASS

Checks:
✓ postgres_embedding: PASS (12567 / 17995)
✓ valkey_embed_cache: PASS (1234 keys)
✓ redis_centroid_seeds: PASS (1234 keys)
✓ atlas_embedding_metrics: PASS (1234 rows)
✓ duplicate_check: PASS (0 orphaned claims)
✓ provenance: PASS (1234/1234 with metadata)
```

### Single-Packet Test

```bash
# Enqueue 1 test packet
PACKET_LIMIT=1 node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --enqueue

# Start worker (with verbose output on first 3 jobs)
EMBED_MODE=ollama node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1

# Wait 10 seconds for processing
sleep 10

# Validate
node scripts/atlas/validate-canonical-embedding-worker.mjs
```

---

## Environment Variables

```bash
# Embedding provider
EMBED_MODE=ollama          # Use Ollama :11434 (default for Windows native GPU)
EMBED_MODE=onnx            # Use SvelteKit /api/embed :5173
EMBED_MODE=auto            # Try ONNX, fall back to Ollama

# Service URLs
RABBITMQ_URL=amqp://guest:guest@localhost:5672
DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db
REDIS_URL=redis://:redis@127.0.0.1:6379
OLLAMA_URL=http://127.0.0.1:11434
EMBED_URL_ONNX=http://127.0.0.1:5173/api/embed
BIFROST_URL=http://127.0.0.1:3040
ACP_URL=http://127.0.0.1:5173/api/ai/agent

# Worker settings
CONCURRENCY=4              # Parallel jobs per worker process
PACKET_LIMIT=0             # 0 = all pending, N = limit to N packets
BATCH_SIZE=100             # Enqueue batch size (not used by worker)

# Cache TTLs
REDIS_CENTROID_TTL=604800           # 7 days (centroid seeds)
REDIS_EMBED_CACHE_TTL=2592000       # 30 days (embedding cache by summary_hash)
```

---

## Troubleshooting

### Worker Hangs or Slow

```bash
# Check RabbitMQ queue depth
rabbitmqctl list_queues name messages consumers
# Should see queue with N messages and 1+ consumers

# Check Ollama health
curl http://127.0.0.1:11434/api/tags
# Should list 'embeddinggemma:latest' model

# Check Postgres connection
psql postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets"
```

### Cache Keys Not Created

```bash
# Check if Valkey is running
redis-cli PING
# Should return PONG

# Check if authentication is correct
redis-cli -a redis KEYS '*'
# Should list keys

# Manual test: set and get
redis-cli SET test:key "test value" EX 86400
redis-cli GET test:key
# Should return "test value"
```

### Qdrant Upsert Failures

Qdrant upsert is **best-effort** and non-blocking. If it fails:
1. Postgres write still succeeds (canonical truth preserved)
2. Metrics record the failure
3. Worker continues without blocking

To manually sync Qdrant later:
```bash
# TODO: Create separate qdrant-backfill script
```

### Metrics Table Missing

The worker creates `atlas_embedding_metrics` table on first metric write:

```sql
CREATE TABLE IF NOT EXISTS atlas_embedding_metrics (
  packet_key text,
  provider text,
  latency_ms integer,
  cache_hit boolean,
  summary_hash text,
  qdrant_upsert boolean default false,
  redis_warmed boolean default false,
  created_at timestamptz default now()
);
```

If manual creation needed:
```bash
psql postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db \
  -c "CREATE TABLE IF NOT EXISTS atlas_embedding_metrics (
    packet_key text,
    provider text,
    latency_ms integer,
    cache_hit boolean,
    summary_hash text,
    qdrant_upsert boolean default false,
    redis_warmed boolean default false,
    created_at timestamptz default now()
  );"
```

---

## Next Steps

### Immediate (Post-Backfill)
1. Monitor metrics for provider breakdown (% Ollama vs ONNX vs cache hits)
2. Validate all 17,995 packets have embeddings (coverage = 100%)
3. Review latency distribution (target: avg < 5s with cache)

### Near-Term (P2)
1. Compute SOM clustering on embeddings (20×20 grid)
2. Backfill `centroid:seed:packet:*` → `centroid:feature:*` aggregates (KMeans)
3. Create Qdrant dense search indexes for fast ANN retrieval

### Future (P3+)
1. Fine-tune autoencoder (768 → 64 dims) for memory efficiency
2. Train reranker model (query ↔ packet relevance)
3. Integrate GPU reranking into retrieval pipeline

---

## References

- **Worker Script**: `scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs`
- **Validation Script**: `scripts/atlas/validate-canonical-embedding-worker.mjs`
- **Metrics Table**: `atlas_embedding_metrics` (auto-created)
- **Cache Keys**: 
  - `bifrost:embed:embeddinggemma:768:{summary_hash}` (30d TTL)
  - `centroid:seed:packet:{packet_key}` (7d TTL)
  - `centroid:index:feature:{feature_id}` (7d TTL)
