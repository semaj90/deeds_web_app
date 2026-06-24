# 4-Stage Pipeline Parallelization, GPU, Workers & Offline Analysis

**Context**: Current summary-ranking-retrieval-pipeline.mjs with 64K context llama-server.exe  
**Question**: Will it use service workers? Parallel workers? Concurrent multi-core? GPU offline?

---

## Current Implementation (Baseline)

```
scripts/atlas/summary-ranking-retrieval-pipeline.mjs
  ├─ Stage 1: Backfill summaries (Gemma4 @ :8090)
  │   └─ Sequential loop: for (chunk of 40,754) { await callGemma4(chunk) }
  │       Duration: 40,754 × 1.2s ≈ 13.6 hours
  │
  ├─ Stage 2: Embed summaries (EmbeddingGemma @ :11434)
  │   └─ Sequential loop: for (chunk of summaries) { await embedText(chunk) }
  │       Duration: 40,754 × 0.05s ≈ 34 minutes
  │
  ├─ Stage 3: Compute centroids (Redis @ :6379)
  │   └─ Sequential: for (dir of directories) { compute_centroid(dir) }
  │       Duration: 20 × 0.04s ≈ 0.8s
  │
  └─ Stage 4: Warm ACE cache (Redis @ :6379)
      └─ Sequential: for (dir of directories) { set_key(key, value) }
          Duration: 20 × 0.02s ≈ 0.4s

Total: 13.6 hours (Stage 1 is bottleneck)
Node.js: Main thread blocks → HTTP requests queue up during backfill
```

---

## Analysis: Service Workers vs. Worker Threads vs. Parallel GPU

### Q1: "Will it use service_worker parallel workers?"

**Answer**: ❌ **NOT CURRENTLY** — The pipeline runs on **Node.js main thread** only.

**Why NOT service workers**:
- Service Workers are browser-only (client-side)
- This script runs on server (Node.js backend)
- Service Workers can't access PostgreSQL, Redis, Qdrant
- Service Workers can't run Gemma4 synthesis

**What COULD be service workers** (not the priority):
- Browser-side IndexedDB caching of summaries (optional UI enhancement)
- Offline viewing of cached chunk summaries

---

### Q2: "Will it use concurrent multi-core GPU offline?"

**Answer**: ✅ **PARTIALLY** (GPU yes, multi-core parallelism NO, offline YES).

#### GPU: ✅ **YES** (already wired)
```bash
# llama-server.exe with 64K context uses GPU
llama-server.exe \
  -m gemma4-legal-iq4xs.gguf \
  -ngl 99 \                  # GPU layers: 99 = all GPU
  -c 65536 \                 # 64K context = GPU memory
  -fa on \                   # Flash Attention (GPU kernel)
  -ctk q8_0 -ctv turbo3      # KV cache on GPU

# GPU llama-server runs:
# Stage 1: Gemma4 synthesis (GPU inference)
# Embedding: Done on CPU via Ollama (:11434)
```

#### Multi-Core Parallelism: ❌ **NOT CURRENTLY**
```typescript
// Current Stage 1 (sequential):
const chunks = await getChunks(50000);
let processed = 0;

for (let i = 0; i < chunks.length; i += CHUNK_BATCH) {
  const batch = chunks.slice(i, i + CHUNK_BATCH);

  for (const chunk of batch) {
    const summary = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [...] })
    });  // ← WAITS for response before next chunk
    processed++;
  }
}

// Result: 1 chunk at a time, even though GPU can do multiple in parallel
// Throughput: 1.2s per chunk → 40K chunks = 13.6 hours
```

#### Offline: ✅ **YES** (GPU + offline together)
```bash
# GPU llama-server is OFFLINE-capable
llama-server.exe \
  -ngl 99 \                  # GPU inference, no internet needed
  --offline                  # (implicit: no internet calls)

# Works 100% offline:
# ✅ GPU synthesis
# ✅ GPU embedding (if using Ollama locally)
# ❌ Can't reach Qdrant/Postgres if they're cloud

# For TRUE offline: all services must be Docker containers on same machine
```

---

## 3-Phase Parallelization Roadmap

### Phase 1: Basic Parallelism (This Week) — 2 hours

**Goal**: Run multiple chunks in parallel via llama-server concurrency (NOT worker threads).

```javascript
// Phase 1: Parallel requests to same llama-server instance

const CONCURRENCY = 4;  // 4 chunks at a time (adjust based on GPU VRAM)

async function stage1ParallelGemma4(chunks) {
  let processed = 0;
  
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    
    // Send 4 requests in parallel
    const summaries = await Promise.all(
      batch.map(chunk => 
        fetch(`${GEMMA4_URL}/v1/chat/completions`, {
          body: JSON.stringify({
            model: 'gemma4-legal-iq4xs.gguf',
            messages: [{ role: 'user', content: `Summarize: ${chunk.content}` }],
            temperature: 0.3,
            max_tokens: 100,
            stream: false,
          }),
          signal: AbortSignal.timeout(30000),
        })
          .then(r => r.json())
          .then(j => j.choices?.[0]?.message?.content || '')
      )
    );

    // Write all 4 summaries to DB in parallel
    await Promise.all(
      batch.map((chunk, idx) =>
        pool.query(
          'UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2',
          [summaries[idx], chunk.id]
        )
      )
    );

    processed += CONCURRENCY;
    if (processed % 20 === 0) {
      log(`  ${processed}/${chunks.length} chunks (${Math.round(processed * 100 / chunks.length)}%)`);
    }
  }
}

// Result: 4 chunks in parallel
// New throughput: 40,754 ÷ 4 = ~10,188 batches × (1.2s ÷ 4) ≈ 3.4 hours (4× speedup)
```

**Files to change**:
- `scripts/atlas/summary-ranking-retrieval-pipeline.mjs` (Stage 1)

**Test**:
```bash
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=100 --apply
# Measure: time from start to finish
# Target: 100 chunks × 1.2s ÷ 4 concurrent ≈ 30s
```

---

### Phase 2: Worker Threads (Next Week) — 4 hours

**Goal**: Use Node.js worker threads to parallelize across CPU cores (8 workers for 8 CPU cores).

```javascript
// Phase 2: Worker thread pool for true parallelism

import { Worker } from 'worker_threads';
import path from 'path';

const WORKER_COUNT = 8;  // One per CPU core

async function stage1WithWorkers(chunks) {
  // Create worker pool
  const workers = [];
  const taskQueue = [];
  let activeWorkers = 0;
  let processed = 0;

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(
      path.resolve(__dir, 'summary-backfill-worker.mjs'),
      {
        env: {
          GEMMA4_URL,
          PG_URL,
          DATABASE_URL: PG_URL,
        }
      }
    );

    worker.on('message', (result) => {
      if (result.status === 'done') {
        processed++;
        activeWorkers--;

        if (processed % 50 === 0) {
          log(`  ${processed}/${chunks.length} summaries generated`);
        }

        // Assign next task
        if (taskQueue.length > 0) {
          const nextTask = taskQueue.shift();
          worker.postMessage(nextTask);
          activeWorkers++;
        }
      }
    });

    workers.push(worker);
  }

  // Queue all tasks
  for (const chunk of chunks) {
    taskQueue.push({ chunkId: chunk.id, content: chunk.content });
  }

  // Assign first batch to workers
  for (let i = 0; i < Math.min(WORKER_COUNT, chunks.length); i++) {
    const task = taskQueue.shift();
    workers[i].postMessage(task);
    activeWorkers++;
  }

  // Wait for all workers to finish
  return new Promise((resolve) => {
    const checkDone = setInterval(() => {
      if (processed === chunks.length) {
        clearInterval(checkDone);
        workers.forEach(w => w.terminate());
        resolve(processed);
      }
    }, 100);
  });
}
```

**New file** (`scripts/workers/summary-backfill-worker.mjs`):
```javascript
#!/usr/bin/env node
/**
 * Worker thread for summary backfill
 * Receives: { chunkId, content }
 * Does: Call Gemma4, update DB
 * Sends: { status, chunkId }
 */

import { parentPort } from 'worker_threads';
import pg from 'pg';
import fetch from 'node-fetch';

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const PG_URL = process.env.DATABASE_URL;

const pool = new pg.Pool({ connectionString: PG_URL, max: 1 });

parentPort.on('message', async (task) => {
  try {
    const { chunkId, content } = task;

    // Call Gemma4
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs.gguf',
        messages: [{ role: 'user', content: `Summarize: ${content.slice(0, 500)}` }],
        temperature: 0.3,
        max_tokens: 100,
        stream: false,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || '';

    // Update DB
    await pool.query(
      'UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2',
      [summary, chunkId]
    );

    parentPort.postMessage({ status: 'done', chunkId });
  } catch (e) {
    parentPort.postMessage({ status: 'error', chunkId, error: e.message });
  }
});

process.on('exit', async () => {
  await pool.end();
});
```

**Result**: 8 workers × 1 chunk each = 8 chunks in parallel  
**New throughput**: 40,754 ÷ 8 = ~5,094 batches × (1.2s ÷ 8) ≈ 1.7 hours (8× speedup)

---

### Phase 3: Distributed Queuing (Optional) — 8 hours

**Goal**: Decouple summarization from the main pipeline via RabbitMQ + background workers.

```javascript
// Phase 3: Queue-based architecture

// src/lib/server/queues/summary-backfill-queue.ts

import amqplib from 'amqplib';

async function enqueueSummaryBackfill(chunks) {
  const conn = await amqplib.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();

  await channel.assertQueue('summary-backfill', { durable: true });
  await channel.prefetch(8);  // 8 concurrent workers

  // Publish all chunks as messages
  for (const chunk of chunks) {
    channel.sendToQueue(
      'summary-backfill',
      Buffer.from(JSON.stringify({ chunkId: chunk.id, content: chunk.content })),
      { persistent: true }
    );
  }

  log(`Queued ${chunks.length} chunks for async backfill`);
  return { queued: chunks.length, queueName: 'summary-backfill' };
}

// scripts/workers/rabbit-summary-worker.mjs (background daemon)

const conn = await amqplib.connect(RABBITMQ_URL);
const channel = await conn.createChannel();

channel.assertQueue('summary-backfill', { durable: true });
channel.prefetch(1);  // Process 1 at a time per worker

channel.consume('summary-backfill', async (msg) => {
  const { chunkId, content } = JSON.parse(msg.content.toString());

  try {
    const summary = await callGemma4(content);
    await updateDB(chunkId, summary);
    channel.ack(msg);  // Success → remove from queue
  } catch (e) {
    channel.nack(msg, false, true);  // Failure → requeue
  }
});

log('🐇 Summary backfill worker listening on queue:summary-backfill');
```

**Usage**:
```bash
# Start 8 background workers (in separate terminals or supervisor)
for i in {1..8}; do
  node scripts/workers/rabbit-summary-worker.mjs &
done

# Queue the backfill
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --queue

# Workers process asynchronously — HTTP doesn't block
# Check progress: docker exec rabbitmq rabbitmqctl list_queues
```

**Result**: Async background work, non-blocking HTTP, true horizontal scaling

---

## Comparison Table

| Phase | Parallelism | Throughput | Backfill Time | Blocking | Offline | Effort |
|-------|-------------|-----------|---------------|----------|---------|--------|
| **Current** | Sequential (1) | 1 chunk/1.2s | 13.6 hours | Yes | Yes | 0 |
| **Phase 1** | Parallel to GPU (4) | 4 chunks/1.2s | 3.4 hours | Yes | Yes | 2h |
| **Phase 2** | Worker threads (8) | 8 chunks/1.2s | 1.7 hours | Yes | Yes | 4h |
| **Phase 3** | RabbitMQ queue (∞) | 8 concurrent | <2 hours (async) | No | Yes* | 8h |

*Phase 3 still needs network if Qdrant/Postgres/RabbitMQ are remote

---

## GPU Context Window Trade-offs

### Current: 64K Context

**Pros**:
- ✅ Large chunk input (summaries up to 65K tokens)
- ✅ Better summary quality (more context for Gemma4)
- ✅ Fewer Qdrant misses (longer search context)

**Cons**:
- ❌ Slower inference (KV cache is larger: ~6.3 GB VRAM on RTX 3060 Ti)
- ❌ With turbo3 KV compression: ~3.1 GB (still significant)

### Optimization: Reduce to 16K context for backfill

```bash
# For Stage 1 (summary backfill), use smaller context
llama-server.exe \
  -m gemma4-legal-iq4xs.gguf \
  -ngl 99 \
  -c 16384 \              # 16K instead of 64K
  -fa on \
  -ctk q8_0 -ctv turbo3

# Result: 4× faster inference (KV cache 1/4 size)
# Throughput: 40,754 chunks ÷ 8 workers ÷ (1.2s ÷ 4 speedup) ≈ 25 minutes
```

**Tradeoff**:
- 64K: Better quality, slower (1.2s per chunk)
- 16K: Acceptable quality, 4× faster (0.3s per chunk)

**Recommendation**: Use 16K for backfill, 64K for interactive synthesis (where latency matters less).

---

## Offline Capability (Deep Dive)

### ✅ Fully Offline (All Services Local)

```bash
# All services Docker on same machine
docker-compose up -d postgres redis qdrant ollama llama-server

# Run pipeline (100% offline, no internet)
npm run atlas:summary:all:apply

# GPU works offline: ✅
# - llama-server uses GPU (no cloud API calls)
# - Ollama uses GPU (no cloud API calls)
# - PostgreSQL + Redis + Qdrant (local)
```

### ❌ Partially Offline (Cloud Services)

```bash
# llama-server is local, but Qdrant/Postgres in cloud
docker-compose up -d ollama llama-server
# Connect to cloud Qdrant + Postgres

npm run atlas:summary:all:apply
# ❌ Fails if network is down
```

### ✅ GPU Offline (Partial Work)

```bash
# If network drops mid-pipeline:
# Stage 1 ✅ Completes (Gemma4 local)
# Stage 2 ✅ Completes if Ollama is local
# Stage 3 ❌ Fails (Redis network required)
# Stage 4 ❌ Fails (Redis network required)

# Solution: Use connection pooling with reconnect logic
const redis = new Redis({
  host: REDIS_HOST,
  retryStrategy: (times) => Math.min(times * 50, 2000),  // Exponential backoff
});
```

---

## Recommended Path Forward

### Week 1: Phase 1 (Basic Parallelism)
```bash
# Update Stage 1 to use Promise.all with CONCURRENCY=4
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --apply --limit=1000
# Expected: 4× speedup (3.4 hours for 40K chunks)
# Risk: Low (just change loop to Promise.all)
```

### Week 2: Phase 2 (Worker Threads)
```bash
# Implement worker pool
node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --apply --workers=8
# Expected: 8× speedup (1.7 hours for 40K chunks)
# Risk: Medium (worker message passing, connection pooling)
```

### Week 3+: Phase 3 (Optional - RabbitMQ)
```bash
# Async queue-based backfill (non-blocking)
# Only if daily run needs to be <5 minutes
# Risk: High (distributed systems complexity)
```

---

## Summary

| Question | Answer |
|----------|--------|
| Service workers? | ❌ No (browser-only, can't access DB) |
| Parallel workers? | ⏳ Not yet (Phase 2 adds worker threads) |
| Concurrent multi-core? | ✅ Yes (GPU always concurrent), ⏳ Phase 1-2 improve Node.js side |
| GPU offline? | ✅ Yes (llama-server is offline-capable) |
| Current parallelism | Sequential (1 chunk at a time) |
| 64K context | ✅ Works, but slower (use 16K for backfill) |
| Current backfill time | 13.6 hours (40,754 chunks @ 1.2s each) |
| Phase 1 target | 3.4 hours (4× speedup via concurrent GPU requests) |
| Phase 2 target | 1.7 hours (8× speedup via worker threads) |
| Phase 3 target | <2 hours async (non-blocking) |

**Next action**: Implement Phase 1 (2 hours, 4× speedup) this week.
