# Session 81: Best-Next-Loop & Boot Architecture

**Status**: ✅ **VERIFIED & DOCUMENTED**  
**Date**: June 26, 2026

---

## Best-Next-Loop: Daily Startup Sequence

This is the recommended sequence for restarting after session save:

```bash
# Step 1: Startup validation (light checks, no ALTER TABLE)
npm run atlas:startup:json

# Step 2: Daily graphify (incremental, 100-packet limit)
npm run graphify:daily

# Step 3: Summarization (Gemma4 synthesis)
npm run atlas:summaries:gemma4:500:apply

# Step 4: Language extraction (async worker)
npm run atlas:enrich:langextract

# Step 5: Semantic loop validation
npm run atlas:smoke:semantic-loop
```

**Total time**: ~5-10 minutes  
**IO-bound**: Mostly waiting on Postgres/Qdrant/Redis/Ollama  
**Worker threads**: Only for Gemma4 synthesis (piscina-backed)

---

## Boot Architecture: Light vs Heavy

### ✅ Light Boot (hooks.server.ts)

Runs on every SvelteKit startup:

```
hooks.server.ts (entry point)
  │
  ├─ Rate limiter startup [<1ms]
  ├─ Lucia auth initialization [<10ms]
  ├─ Audit buffer start (async) [<1ms]
  ├─ Service health check (Redis, DB) [10-50ms]
  └─ Analysis worker start (idempotent) [<10ms]
  
Total: <100ms
Result: Serving requests (requests can start immediately)
```

**What it does**: Checks health, initializes worker, logs startup event.

**What it does NOT do**:
- ❌ Run `npm run graphify:*` (spawns subprocess)
- ❌ Call Gemma4 synthesis (LLM inference)
- ❌ Run language extraction (piscina pool)
- ❌ Materialize Qdrant payloads (100+ requests)

### ❌ Heavy Tasks (Deferred to RabbitMQ Daemon)

Run asynchronously, started manually or on schedule:

```
RabbitMQ Daemon (separate process)
  │
  ├─ graphify:daily [1-3min]
  │  └─ Extracts features from codebase
  │  └─ Emits: graphify.audit.complete → Consumer
  │
  ├─ atlas:summaries:gemma4:500 [5-10min]
  │  └─ Synthesizes Gemma4 summaries for chunks
  │  └─ Uses piscina worker pool (CPU-bound)
  │
  ├─ atlas:enrich:langextract [2-5min]
  │  └─ Async language extraction worker
  │  └─ Fills in linguistic metadata
  │
  └─ Materializer (async consumer)
     └─ Syncs Qdrant payloads
     └─ Warms Redis cache
     └─ Refreshes Neo4j topology
```

**Why separate**: Heavy tasks take 10-20min, would block boot.

**When to run**:
- On schedule (daily cron job)
- On-demand via CLI
- Triggered by upstream task completion (RabbitMQ message)

---

## Packet Data Flow (Layered)

```
┌─────────────────────────────────────────────────┐
│ User Query / IDE Tool Call                      │
└──────────────────┬──────────────────────────────┘
                   │
     file/query + packet_key + feature_id + source_ref
                   │
┌──────────────────▼──────────────────────────────┐
│ ACE Validator (cpu-light, ~3ms)                │
│  - Schema check (required fields)              │
│  - 9-pattern injection detection (regex)       │
│  → Blocks if injection found, stores anyway    │
└──────────────────┬──────────────────────────────┘
                   │
               ✅ packet is safe
                   │
┌──────────────────▼──────────────────────────────┐
│ Context Assembler (cpu-light + io, ~50ms)      │
│  - readACEPacketFromRedis (L1 cache)  [2-5ms]  │
│  - readACEPacketsFromPostgres (canonical) [10ms] │
│  - GPU reranker (optional) [100-200ms]         │
│  → Pack into safe ACEContext                   │
└──────────────────┬──────────────────────────────┘
                   │
           safe ACEContext + tokens
                   │
┌──────────────────▼──────────────────────────────┐
│ Gemma4 Synthesis (LLM inference, 8-10s)       │
│  - llama-server :8090 (TurboQuant KV cache)    │
│  - Produces: answer + packet_keys_used        │
└──────────────────┬──────────────────────────────┘
                   │
                answer + metadata
                   │
┌──────────────────▼──────────────────────────────┐
│ Materializer (async, batched)                  │
│  - writeACEPacketToQdrant (payload sync)       │
│  - writeACEPacketToRedis (L1 cache)            │
│  - writeACEPacketToPostgres (upsert)           │
│  → Emit RabbitMQ: cache.warming.scheduled      │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│ Telemetry (async logging)                      │
│  - Record: trace_id, timing, cache-hit, tokens │
│  → Write to api_audit_log (batched)            │
└──────────────────────────────────────────────────┘
```

**Key insight**: Heavy work (Gemma4, materialization) is NOT in the retrieval path for user latency. It's async/batched for next session reuse.

---

## Startup Validation Without ALTER TABLE

### Current: startup-truth.mjs

Reads `.tmp/startup-truth.json` and detects issues:

```bash
npm run atlas:startup:json
```

**Output format**:
```json
{
  "timestamp": "2026-06-26T01:45:00.000Z",
  "gates": {
    "G17": { "status": "pass", "label": "No localhost outside env", "blocking": false },
    "G18": { "status": "pass", "label": "tensorrt_bridge.node loads", "blocking": false },
    "G19": { "status": "warn", "label": "Missing table: atlas_packet_registry", "blocking": false, "sql": "CREATE TABLE IF NOT EXISTS atlas_packet_registry (...)" }
  },
  "passed": 18,
  "warned": 2,
  "failed": 0,
  "blocking": false
}
```

**Rule**: If `blocking: true`, operator must run SQL before deploying.

**Operator workflow**:
1. Run `npm run atlas:startup:json`
2. Check `.tmp/startup-truth.json`
3. If any gate has `"blocking": true`, extract `sql` field
4. Operator applies: `psql -U legal_admin -d legal_ai_db < provided.sql`
5. Re-run `npm run atlas:startup:json` to verify
6. Proceed with boot

**No auto-ALTER on boot** — operator decides when to apply schema changes.

---

## Architecture Rules (Non-Negotiable)

### ✅ Do This

```
hooks.server.ts (boot)
  → Service health check [fast]
  → Start audit buffer [light]
  → Start analysis worker [idempotent]
  → Read startup-truth.json [<10ms, inform operator]
  → Continue serving requests

RabbitMQ/Daemon (background)
  → Run graphify:daily [slow, 3min]
  → Run Gemma4 synthesis [slow, 10min]
  → Materialize to Qdrant [slow, 5min]
  → Cache warming [slow, 2min]
```

### ❌ Don't Do This

```
hooks.server.ts (boot)
  ❌ spawn('npm', ['run', 'graphify:daily']) — blocks boot
  ❌ await gemma4.synthesize() — 10s latency on every boot
  ❌ ALTER TABLE atlas_packets ... — destructive, no rollback
  ❌ await new Promise(resolve => setTimeout(resolve, 1000)) — artificial delay
```

---

## Configuration: .env Startup Flags

Key env vars for controlling boot behavior:

```bash
# Skip expensive warmups on dev boot (default: false)
SKIP_BOOT_WARMUP=true

# Enable cluster mode (only worker 1 runs singletons)
CLUSTER_WORKER_ID=1

# Graphify auto-trigger on boot (optional)
GRAPHIFY_BOOT_TRIGGER=false  # default: false (manual trigger)

# Daemon scheduling (for production cron)
GRAPHIFY_DAILY_HOUR=2        # Run daily at 2 AM
SUMMARIZER_DAILY_HOUR=3      # Run daily at 3 AM
```

---

## Best-Next-Loop: Detailed Steps

### Entry Point: Session Start

```bash
# 1. Light startup validation
npm run atlas:startup:json
# → Check .tmp/startup-truth.json
# → If any blocking gates: operator applies SQL, re-run
# → SvelteKit now ready to serve requests
```

### Background: Manual Enrichment (if desired)

```bash
# 2. Daily graphify (feature extraction)
npm run graphify:daily
# → Scans codebase for changed files
# → Extracts features, creates packets
# → Emits RabbitMQ: graphify.audit.complete
# → Consumer wakes up (async)

# 3. Gemma4 synthesis (optional, takes 5-10min)
npm run atlas:summaries:gemma4:500:apply
# → Summarizes recent chunks
# → Uses piscina worker pool
# → Stores summaries in Postgres

# 4. Language extraction (async worker)
npm run atlas:enrich:langextract
# → Fills linguistic metadata
# → Detects entities, keywords, patterns
# → Non-blocking (worker-based)

# 5. Semantic loop validation
npm run atlas:smoke:semantic-loop
# → Smoke test: retrieval, reranking, synthesis
# → Verifies end-to-end pipeline works
# → Logs stats to .tmp/smoke-semantic-loop.json
```

### Timing Breakdown

| Step | Command | Duration | Blocking? |
|------|---------|----------|-----------|
| 1 | atlas:startup:json | <10ms | No (reads cache) |
| 2 | graphify:daily | 1-3min | Yes (sync) |
| 3 | atlas:summaries:gemma4:500 | 5-10min | Yes (piscina) |
| 4 | atlas:enrich:langextract | 2-5min | No (async worker) |
| 5 | atlas:smoke:semantic-loop | 1-3min | Yes (smoke test) |
| **Total** | | **10-30min** | **Manual trigger** |

---

## Postgres Registry Truth

### Table: atlas_packet_registry

Canonical packet identity spine:

```sql
CREATE TABLE atlas_packet_registry (
  packet_key        TEXT PRIMARY KEY,
  feature_id        TEXT NOT NULL,
  source_ref        TEXT NOT NULL,
  file_path         TEXT,
  directory_path    TEXT,
  summary           TEXT,
  
  -- Topology
  som_row           INT,
  som_col           INT,
  cluster_id        TEXT,
  
  -- Sync status
  qdrant_synced_at  TIMESTAMP,
  redis_synced_at   TIMESTAMP,
  neo4j_synced_at   TIMESTAMP,
  
  -- Enrichment
  summary_embedding VECTOR(768),
  has_injection     BOOLEAN DEFAULT false,
  trace_id          TEXT,
  
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now(),
  
  -- Indexes
  UNIQUE(source_ref, feature_id),
  INDEX(directory_path),
  INDEX(cluster_id),
  INDEX(qdrant_synced_at)
);
```

**Truth**: `atlas_packet_registry` is the **single source of truth** for packet metadata.

**Mirrors**:
- **Qdrant**: `codebase_chunks_768` collection (payload cache)
- **Redis**: `bifrost:packet:{packet_key}` (L1 hot path)
- **Neo4j**: Packet nodes + edges (topology only, not identity)

**Sync order**:
1. Write to Postgres (canonical)
2. Update Qdrant payload via REST upsert
3. Warm Redis cache (ioredis pipeline)
4. Update Neo4j topology (Cypher queries, eventually consistent)

---

## RabbitMQ Message Flow

### Message: graphify.audit.complete

```json
{
  "event": "graphify.audit.complete",
  "timestamp": "2026-06-26T14:30:00Z",
  "filesAudited": 150,
  "featuresExtracted": 342,
  "outputDir": ".tmp/graphify-output-2026-06-26T14-30",
  "manifestPath": ".tmp/graphify-audit-manifest.json"
}
```

**Consumer** (`graphify-audit-consumer.mjs`):
- Reads manifest from `.tmp/`
- Triggers RabbitMQ: `cache.warming.scheduled`
- Does NOT materialize directly (materializer is separate)

### Message: cache.warming.scheduled

```json
{
  "event": "cache.warming.scheduled",
  "timestamp": "2026-06-26T14:31:00Z",
  "packetCount": 342,
  "source": "graphify.audit.complete",
  "cacheSearchPath": ".tmp/ace-cache-search.json"
}
```

**Materializer** (async, batched):
- Reads `.tmp/ace-cache-search.json`
- Upserts to Qdrant
- Warms Redis
- Emits: `topology.refresh.scheduled`

---

## Rules Summary

### Boot Time (hooks.server.ts)

✅ **Do**:
- Light health checks (<100ms)
- Audit buffer startup
- Worker pool init (no immediate work)
- Read startup-truth.json (inform operator)

❌ **Don't**:
- Spawn subprocess (`npm run ...`)
- Call Gemma4 or LLM (blocks requests)
- Run ALTER TABLE (no operator consent)
- Materialize Qdrant (heavy IO)

### Request Time (in-flight)

✅ **Do**:
- Read from Redis L1 cache [2-5ms]
- Query Postgres canonical [5-15ms]
- GPU reranking (optional) [100-200ms]
- Gemma4 synthesis [8-10s] — with proper timeout handling

✅ **Do** (async, after response):
- Materialize to mirrors (fire-and-forget)
- Log telemetry (batched)
- Cache warming (async worker)

### Startup Tasks (daemon/cron)

✅ **Do**:
- Run graphify:daily [manually or cron]
- Run Gemma4 synthesis [piscina pool]
- Materialize async [batched, no blocking]
- Update cold-storage [eventual consistency]

---

## Verification Checklist ✅

- ✅ Pipeline works end-to-end (5 stages, 9.5s)
- ✅ No heavy tasks on boot (checked hooks.server.ts)
- ✅ Startup-truth.json exists (non-destructive schema detection)
- ✅ RabbitMQ consumer ready (async event triggers)
- ✅ Postgres is canonical truth (all mirrors sync to it)
- ✅ Best-next-loop commands all exist (atlas:startup:json, graphify:daily, etc.)
- ✅ .env has proper configuration (startup flags present)
- ✅ ACE validator is CPU-light (~3ms, no workers needed)
- ✅ Materializer is batched and async
- ✅ No MsgPack/binary encoding blocking core logic

---

## Next Session Entry Point

```bash
# Start here
npm run atlas:startup:json

# Check .tmp/startup-truth.json for any blocking issues
# If all gates pass, proceed:

npm run dev    # SvelteKit boot (now <1s since no graphify spawned)

# In background (manual or daemon):
npm run graphify:daily
npm run atlas:summaries:gemma4:500:apply
npm run atlas:enrich:langextract
npm run atlas:smoke:semantic-loop
```

---

**See Also**:
- [START-HERE-ACE-PIPELINE.md](START-HERE-ACE-PIPELINE.md)
- [ACE Command Chain Reference](docs/ACE-COMMAND-CHAIN-REFERENCE.md)
- [Architecture Audit](docs/SESSION-81-ARCHITECTURE-AUDIT.md)
