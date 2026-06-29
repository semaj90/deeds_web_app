# Phase 5 Extended: Event Sourcing + Agent Scheduler Architecture

**Date:** June 29, 2026  
**Status:** ✅ SCHEMA COMPLETE | ⏳ IMPLEMENTATION IN PROGRESS  
**Scope:** 4-layer immutable event log + unified task orchestration

---

## Executive Summary

The original Engram + TODO Aggregator approach was **memory-registry thinking**. This document supersedes it with **event sourcing**:

```
BEFORE (Memory Registry — scattered state):
  task_registry (task state)
  + gpu_candidate_eval (ranking results)
  + engram_cards (recall state)
  ↓ (inconsistent, corruption-prone)
  Multiple projections compete for truth

AFTER (Event Sourcing — immutable truth + projections):
  agent_os_events (immutable log) ← task.start | task.end | gpu.rerank | error
    ↓
  Projections (rebuilt on demand):
    task_state_projection ← rebuilt from agent_os_events
    packet_features ← rebuilt from gpu_compute_events
    engram_recall_projection ← rebuilt from context_timeline_events
    ↓
  Valkey Cache (L4, 7-14 day TTL)
```

**Key Wins:**
- ✅ Single source of truth (immutable event log)
- ✅ Corrupt projections → rebuild from events (deterministic recovery)
- ✅ Full audit trail (every action logged)
- ✅ Replay & learning (replay events for off-policy training)
- ✅ No data races (events append-only, projections idempotent)

---

## 4-Layer Architecture (Canonical)

### Layer 1: Immutable Event Log (TRUTH)

**Tables:**
- `agent_os_events` — ALL system events (task state changes, GPU work, errors)
- `context_timeline_events` — User signals (thumbs_up, dwell, corrections)
- `gpu_compute_events` — GPU results (AE, SOM, Attention, PageRank, Policy)

**Key Properties:**
- Append-only (never UPDATE/DELETE existing rows)
- Correlated by `correlation_id` (traces end-to-end work)
- Parent-child relationship via `parent_event_id` (dependency chain)
- Resolved state tracked: `resolved_at`, `resolution_metadata`

**Examples:**

```sql
-- Task starts
INSERT INTO agent_os_events (correlation_id, event_type, source, title, body, severity)
VALUES ('trace-001', 'task.start', 'nats:agent.task.execute', 'Task XYZ started', 
        '{"task_id":"t-1", "task_type":"index_codebase"}', 'info');

-- GPU work completes
INSERT INTO gpu_compute_events (correlation_id, compute_type, packet_id, compute_output, gpu_latency_ms)
VALUES ('trace-001', 'autoencoder_encode', 'ace:packet:001', '{"latent64":[...]}', 125.3);

-- Task ends with result
INSERT INTO agent_os_events (correlation_id, parent_event_id, event_type, source, title, resolved_at)
VALUES ('trace-001', <event_id_from_start>, 'task.end', 'nats:agent.task.execute', 
        'Task XYZ completed', NOW());
```

**Indexing Strategy:**
- `correlation_id` — trace end-to-end work
- `event_type` — filter by category
- `created_at DESC` — time-ordered access
- `resolved_at` — query completion state

---

### Layer 2: Projections (REBUILT ON DEMAND)

**Tables:**
- `task_state_projection` — Current task state (rebuilt from `task_registry` + `agent_os_events`)
- `packet_features` — GPU-computed features (rebuilt from `gpu_compute_events`)
- `engram_recall_projection` — User preferences (rebuilt from `context_timeline_events`)

**Recovery Pattern:**

```sql
-- If packet_features corruption suspected:
-- 1. TRUNCATE packet_features (not DELETE, for speed)
-- 2. Rebuild from gpu_compute_events:
INSERT INTO packet_features (packet_id, latent64, som_cell_x, som_cell_y, ...)
SELECT DISTINCT ON (packet_id)
  compute_input->>'packet_id' as packet_id,
  compute_output->>'latent64' as latent64,
  compute_output->>'som_cell_x' as som_cell_x,
  ...
FROM gpu_compute_events
WHERE compute_type = 'autoencoder_encode'
ORDER BY packet_id, created_at DESC;
-- 3. Invalidate Valkey cache: bifrost:packet:* (TTL expires automatically)
```

**Idempotent Upsert (no race conditions):**

```sql
-- Safe to run multiple times, in parallel
INSERT INTO packet_features (packet_id, latent64, status)
VALUES (...)
ON CONFLICT (packet_id) DO UPDATE SET
  latent64 = EXCLUDED.latent64,
  status = EXCLUDED.status,
  updated_at = NOW();
```

---

### Layer 3: GPU Features (COMPUTED OUTPUT)

**Table: `gpu_feature_cache`**

Pre-computed results keyed by `sha256(compute_type + input_hash)`:

```sql
-- After autoencoder run on batch:
INSERT INTO gpu_feature_cache (cache_key, compute_type, input_hash, result, latency_ms, expires_at)
VALUES (
  'ae_8e2c3f...', -- sha256 of input
  'autoencoder_encode',
  '8e2c3f...',
  '{"latent64": [...], "reconstruction_error": 0.042}',
  128.5,
  NOW() + INTERVAL '7 days'
);

-- Later, query avoids recomputation:
SELECT result FROM gpu_feature_cache
WHERE compute_type = 'autoencoder_encode' AND input_hash = '8e2c3f...'
  AND expires_at > NOW();
-- If FOUND: cache hit (reuse result)
-- If NOT FOUND: compute & insert into gpu_compute_events → gpu_feature_cache
```

**Key Properties:**
- TTL-based expiration (7-14 days, tunable per compute type)
- Hit counter for analytics
- Latency tracked for optimization

---

### Layer 4: Runtime Cache (VALKEY/REDIS)

**Key Patterns** (not in Postgres, managed via NATS invalidation):

```
bifrost:packet:{packet_id}          → packet_features JSON (7d TTL)
bifrost:task:{task_id}              → task_state_projection JSON (7d TTL)
bifrost:engram:{memory_id}          → engram_recall_projection JSON (7d TTL)

centroid:feature:{feature_id}       → 768-dim centroid vector
centroid:som:{som_cell}             → SOM cell centroid (for prefilter)

ace:topo:{class}:{hash}             → topology prefilter candidates (5min TTL)
ace:authority:top                   → hash {file → authority_score}
gpu:karpathy:scores                 → hash {file → {pr, attn, authority, blend}}
```

**Invalidation Rule** (hard rule):

```
Layer 1 Insert (agent_os_events)
  ↓
NATS publish (bifrost.packet.invalidate)
  ↓
Valkey client DEL bifrost:packet:{packet_id}
              DEL centroid:*{packet_id}*
  ↓
Cache miss on next read → read from Layer 2 projection → write back to Layer 4 cache
```

**Never**:
- Write Layer 4 before Layer 1 completes ✗
- Update Layer 2 before Layer 1 publishes ✗
- Trust Layer 4 without Layer 2 as fallback ✗

---

## Critical Table: `packet_features` (Consolidation)

**Why This Matters:**

Previously, GPU-computed features were scattered:
- `latent_64` in `atlas_packets`
- `som_cluster` in `atlas_packets`
- `authority_score` in `atlas_packets`
- `rerank_score` in `gpu_candidate_eval`
- `policy_hint` in `atlas_packets` or separate table
- **→ NO SINGLE SOURCE OF TRUTH**

Now, **ONE TABLE** for all packet-level GPU features:

```sql
CREATE TABLE packet_features (
  packet_id text PRIMARY KEY,
  -- Immutable embeddings
  summary_embedding vector(768),
  content_embedding vector(768),
  signature_embedding vector(768),
  -- Mutable GPU outputs (refreshable)
  latent64 vector(64),
  latent128 vector(128),
  som_cell_x int, som_cell_y int, som_distance real,
  cluster_id int,
  -- Scores (refreshable)
  authority_score real, pagerank_score real, attention_score real, policy_score real,
  -- Tracking
  last_gpu_refresh timestamptz,
  status text -- valid | stale | error | computing
);
```

**Usage Pattern:**

```typescript
// In GPU worker or LangGraph node:
await db.insert(packet_features).values({
  packet_id: 'ace:packet:001',
  latent64: new Float32Array([...]), // from autoencoder
  som_cell_x: 5, som_cell_y: 12,     // from SOM
  cluster_id: 42,                    // from k-means
  authority_score: 0.87,             // from pagerank
  attention_score: 0.94,             // from attention gate
  policy_score: 0.75,                // from RL policy
  last_gpu_refresh: new Date(),
  status: 'valid'
}).onConflict('packet_id').doUpdate(set => set);

// In ACE retrieval:
const features = await db.select().from(packet_features)
  .where(eq(packet_features.packet_id, 'ace:packet:001'));

// Sort by composite score: 0.4·authority + 0.3·attention + 0.3·policy
const sortScore = 0.4 * features.authority_score 
                + 0.3 * features.attention_score
                + 0.3 * features.policy_score;
```

---

## Agent Scheduler (Unified Orchestrator)

**Replaces:**
- ~~TODO Aggregator~~ (limited to task prioritization)
- ~~Idle-review~~ (ad-hoc vs. systematic)
- ~~Various separate job schedulers~~

**Unifies:**
- Task prioritization (similar to TODO Aggregator, but event-driven)
- GPU refresh coordination (no GPU underutilization)
- RL policy updates (systematic feedback loop)
- Health audits (regular system checks)
- Incremental indexing (background work)

**Job Types:**

| Job Type | Priority | Worker | Purpose |
|----------|----------|--------|---------|
| `index_codebase` | 60 | langraph | Incremental repo scan + packet generation |
| `gpu_refresh` | 50 | gpu-worker | Refresh packet_features (AE, SOM, Attention) |
| `rl_rerank` | 40 | gpu-worker | Policy model eval on task outcomes |
| `summary_generation` | 45 | langraph | Missing summaries (Gemma4) |
| `graph_refresh` | 35 | indexer | Neo4j topology sync |
| `health_audit` | 20 | indexer | Postgres, Redis, GPU, Qdrant health |

**Workflow:**

```
Orchestrator Loop (every 60s via npm run agent:scheduler:evaluate):
  1. evaluateJobsNeeded() ← query Postgres for stale data
  2. dispatchJobs() → INSERT into agent_scheduler_jobs (status='pending')
  3. assignJobs() → UPDATE status to 'queued', assign_worker
  4. Workers poll 'queued' jobs from Postgres
  5. Worker executes, updates status='executing'
  6. On completion: status='completed', result stored
  7. Next cycle rebuilds projections from events
```

**Dependency Handling:**

```sql
-- Job A depends on Job B:
INSERT INTO agent_scheduler_jobs (job_id, job_type, depends_on, status)
VALUES ('job-a-uuid', 'summary_generation', ARRAY['job-b-uuid'], 'pending');

-- assignJobs() checks:
SELECT status FROM agent_scheduler_jobs WHERE job_id = ANY(depends_on);
-- Only assigns if all dependencies are 'completed'
```

---

## Integration Points

### 1. NATS Feedback Loop

```
Agent Task Completes
  ↓
engram.feedback.async (NATS message)
  ↓
handleEngramFeedback() in Go Sidecar
  ↓
INSERT agent_os_events (event_type='task.end', result=JSON)
  ↓
NATS publish bifrost.packet.invalidate
  ↓
Valkey DEL bifrost:packet:{packet_id}
  ↓
Next query reads from packet_features projection → builds cache
```

### 2. ACE Retrieval (Layer 4 → Layer 2 → Layer 1 cascade)

```typescript
// ACE Stage A: Retrieval decision
async function aceStageA(query) {
  // Try Layer 4 (Valkey cache)
  let context = await redis.get(`bifrost:packet:${packet_id}`);
  if (context) return JSON.parse(context); // 5ms hit

  // Miss → Layer 2 (packet_features projection)
  context = await db.select().from(packet_features)
    .where(eq(packet_features.packet_id, packet_id));

  // Write back to Layer 4
  await redis.setex(`bifrost:packet:${packet_id}`, 604800, JSON.stringify(context)); // 7d TTL

  return context;
}
```

### 3. Startup Review (feeds Agent Scheduler)

```
Boot
  ↓
startup_review_state table:
  - git state (branch, commits, dirty files)
  - agent_os_events summary (task outcomes from last session)
  - signal_metrics (Engram hotness, ACE success rate)
  - blockers (tasks that failed 3+ times)
  ↓
Recommendations ranked:
  - Fix blockers (priority 70)
  - GPU refresh stale packets (priority 60)
  - Index new files (priority 50)
  - RL rerank hot tasks (priority 40)
  ↓
Agent Scheduler enqueues jobs
  ↓
Workers pick up queued jobs
```

---

## Implementation Checklist (Phase 5 → Phase 6)

### Phase 5 (COMPLETE ✅)
- ✅ Schema created (drizzle/0099 + 0100)
- ✅ Go sidecar wired (cmd/agent-sidecar/main.go)
- ✅ NATS proof-of-life (5/5 subjects)
- ✅ Postgres registry tables live (verified)

### Phase 6 (IMPLEMENTATION IN PROGRESS ⏳)
- ⏳ **Step 1**: Wire real task logic to NATS handlers
  - Task executor → INSERT task_registry, agent_os_events
  - GPU work → INSERT gpu_compute_events, update packet_features
  - Feedback → INSERT context_timeline_events, rebuild engram_recall_projection

- ⏳ **Step 2**: Implement event-sourced projections
  - Write event replay logic (rebuild from Layer 1 events)
  - Implement idempotent projection updates
  - Add consistency checks (Layer 1 ≠ Layer 2 detection)

- ⏳ **Step 3**: Wire Agent Scheduler
  - Deploy orchestrator loop (evaluateJobsNeeded → dispatchJobs → assignJobs)
  - Connect workers (LangGraph, GPU, Indexer) to read queued jobs
  - Implement NATS invalidation for Valkey cache

- ⏳ **Step 4**: Startup Review integration
  - Analyze agent_os_events from last session
  - Generate recommendations based on signal_metrics
  - Enqueue highest-priority jobs

- ⏳ **Step 5**: RL Feedback Collection
  - Implement RLM (Reinforcement Learning from Mistakes)
  - Policy model eval on task outcomes
  - Store policy_score in packet_features + gpu_feature_cache

---

## Validation Gates

**Gate 1: Immutable Log Integrity**
```bash
# All events have correlation_id + created_at (no missing rows)
SELECT COUNT(*) FROM agent_os_events WHERE correlation_id IS NULL;
# Must be 0

# No UPDATEs to resolved events (append-only property)
SELECT COUNT(*) FROM agent_os_events WHERE updated_at > created_at + INTERVAL '1 second';
# Must be 0 (or very rare, only resolution_metadata)
```

**Gate 2: Projection Consistency**
```bash
# Rebuild packet_features from gpu_compute_events, compare row counts
# If diverged > 5%, corruption detected

# Test idempotent rebuild (run twice, row counts identical)
# If not idempotent, projection logic has bugs
```

**Gate 3: Cache Invalidation**
```bash
# Check NATS message counts (should match Layer 1 write volume)
# Verify Valkey TTLs expire (sample keys, confirm expiration)
# Ensure cache miss → Layer 2 fallback works
```

**Gate 4: Job Dispatch**
```bash
# All pending jobs eventually transition to 'queued' (within 60s)
# No jobs stuck in 'executing' > 2 hours (detect hangs)
# Success rate > 95% (failure rate < 5%)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User / OpenCode / Agent OS                                  │
└───────────────────┬─────────────────────────────────────────┘
                    ↓
         Agent Scheduler Orchestrator
         (evaluateJobsNeeded)
                    ↓
         ┌──────────────────────────┐
         │ Postgres agent_scheduler_│  (pending → queued → executing → completed)
         │ jobs (task queue)        │
         └──────────────┬───────────┘
                        ↓
        ┌───────────────┴────────────────┐
        ↓                                ↓
    LangGraph Worker            GPU Worker
    (index, summarize)          (AE, SOM, Attn, Policy)
        ↓                                ↓
   ┌────────────────────────────────────┐
   │ NATS Event Bus (task.start, etc.)  │
   └──────────────┬─────────────────────┘
                  ↓
        Go Sidecar (agent-sidecar)
        (NATS handlers)
                  ↓
   ┌──────────────────────────────────────────┐
   │ Layer 1: Immutable Event Log (TRUTH)     │
   │  • agent_os_events                       │
   │  • context_timeline_events               │
   │  • gpu_compute_events                    │
   └─────────────┬──────────────────────────┬─┘
                 │                          │
                 ↓ (rebuild)                │
   ┌──────────────────────────────────┐     │
   │ Layer 2: Projections (on-demand)  │     │
   │  • task_state_projection          │     │
   │  • packet_features (CRITICAL)     │     │
   │  • engram_recall_projection       │     │
   └──────────────┬───────────────────┘     │
                  │                         │
                  └──────────┬───────────────┘
                             ↓
   ┌──────────────────────────────────┐
   │ Layer 3: GPU Feature Cache       │
   │  • gpu_feature_cache (TTL 7-14d) │
   └─────────────┬────────────────────┘
                 │
                 ↓ (write back)
   ┌──────────────────────────────────┐
   │ Layer 4: Valkey Runtime Cache    │
   │  • bifrost:packet:{id} (7d)      │
   │  • centroid:* (14d)              │
   │  • ace:authority:top (24h)       │
   └──────────────────────────────────┘
                 ↓
        ACE Retrieval (Stage A)
        Returns top-K ranked packets
                 ↓
        Gemma4 Synthesis
        (LLM answer generation)
```

---

## Next Steps

1. **Immediate (Session 95+):**
   - [ ] Apply drizzle/0100 migration to Postgres
   - [ ] Verify packet_features table created
   - [ ] Test idempotent projection rebuilds

2. **Phase 6a (Week 1):**
   - [ ] Wire LangGraph worker to read from agent_scheduler_jobs
   - [ ] Implement real task logic (summary generation, indexing)
   - [ ] Add NATS event publishing on task completion

3. **Phase 6b (Week 2):**
   - [ ] Wire GPU worker (AE, SOM, Attention)
   - [ ] Implement event replay for packet_features
   - [ ] Add consistency checks between Layers 1 & 2

4. **Phase 6c (Week 3):**
   - [ ] Startup Review analysis + recommendation ranking
   - [ ] Agent Scheduler enqueue based on recommendations
   - [ ] RL policy model eval integration

---

## Key Principle

**"Postgres is truth. Everything else is a cache."**

This architecture enforces it:
- Layer 1 (agent_os_events) is immutable Postgres
- Layer 2 (projections) is deterministic rebuild from Layer 1
- Layer 3 (GPU cache) is tagged with source model version
- Layer 4 (Valkey) is ephemeral, auto-expired

Corruption is recoverable: `TRUNCATE Layer 2 → rebuild from Layer 1`. No backups needed for corrupted projections (just recompute).

---

**Status:** Schema ✅ | Implementation ⏳  
**Owner:** Agent OS  
**Next:** Phase 6a worker integration
