# Complete Architecture Diagram (Session 94 Final)

**Date:** June 29, 2026  
**Version:** 4-Layer Event Sourcing + Agent Scheduler + OpenSpec Planning

---

## High-Level Flow

```
┌───────────────────────────────────────────────────────────────────┐
│ USER INPUT                                                        │
│ • OpenCode /command (parent-atlas-patch, etc.)                   │
│ • VS Code idle (30s trigger)                                     │
│ • Kanban card creation                                           │
│ • Manual: npm run plan:recommendations                           │
└─────────────────────────┬─────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │ SIGNAL COLLECTION LAYER             │
        │ (executive-planner.mjs)             │
        │ ├─ Git state                        │
        │ ├─ Redis signals (Karpathy, auth)   │
        │ ├─ Postgres outcomes                │
        │ ├─ GPU health                       │
        │ ├─ Build/test failures              │
        │ ├─ Task dependencies                │
        │ └─ Policy scores                    │
        └─────────────────┬───────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │ SPEC GENERATION LAYER               │
        │ (OpenSpec SDK)                      │
        │ ├─ Decompose intent                 │
        │ ├─ Acceptance criteria              │
        │ ├─ Dependencies                     │
        │ ├─ Verification gates               │
        │ └─ Rollback plans                   │
        └─────────────────┬───────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │ RECOMMENDATION RANKING              │
        │ ├─ Signal analysis                  │
        │ ├─ Priority computation             │
        │ ├─ Confidence scoring               │
        │ └─ Cost estimation                  │
        └─────────────────┬───────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │ AGENT SCHEDULER                     │
        │ (agent-scheduler-orchestrator.mjs)  │
        │ ├─ INSERT agent_scheduler_jobs      │
        │ ├─ Dependency resolution            │
        │ ├─ Worker assignment                │
        │ └─ Job tracking                     │
        └─────────────────┬───────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────────┐ ┌───────────┐ ┌────────────┐
    │  LangGraph  │ │ GPU       │ │ Indexer    │
    │  Worker     │ │ Worker    │ │ Worker     │
    └──────┬──────┘ └─────┬─────┘ └────┬───────┘
           │              │             │
           └──────────────┼─────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │ NATS EVENT BUS                      │
        │ ├─ spec.decomposed                  │
        │ ├─ task.started                     │
        │ ├─ task.completed                   │
        │ ├─ error.occurred                   │
        │ └─ recommendation.published         │
        └─────────────────┬───────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │ GO SIDECAR                          │
        │ (cmd/agent-sidecar/main.go)        │
        │ NATS Handler (5 subjects)           │
        │ ├─ agent.task.execute               │
        │ ├─ retrieval.turbovec.rerank        │
        │ ├─ gpu.cuvs.search                  │
        │ ├─ gpu.cuda.rank                    │
        │ └─ engram.feedback.async            │
        └─────────────────┬───────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
    LAYER 1                         NATS pub
    Immutable                       bifrost.invalidate
    Events                               │
                                         │
                                         ▼
                                    Valkey
                                    Cache
                                    Invalidation
```

---

## 4-Layer Architecture (Detailed)

```
┌────────────────────────────────────────────────────────────────────┐
│ LAYER 1: IMMUTABLE EVENT LOG (PostgreSQL Truth)                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  agent_os_events (table)                                          │
│  ├─ id (BIGSERIAL PK)                                             │
│  ├─ correlation_id (uuid) ← trace ID (end-to-end)                │
│  ├─ event_type (task.start | task.end | gpu.* | error)           │
│  ├─ source (NATS subject)                                         │
│  ├─ title, body (human-readable)                                  │
│  ├─ severity (info | warn | error)                                │
│  ├─ metadata (JSONB)                                              │
│  ├─ created_at (TIMESTAMPTZ DESC index)                           │
│  └─ resolved_at (completion tracking)                            │
│                                                                    │
│  gpu_compute_events (table)                                       │
│  ├─ id (BIGSERIAL PK)                                             │
│  ├─ correlation_id (uuid) ← links to agent_os_events             │
│  ├─ compute_type (autoencoder_encode | som_train | ...)          │
│  ├─ packet_id (TEXT)                                              │
│  ├─ compute_input (JSONB) ← what was computed                    │
│  ├─ compute_output (JSONB) ← results                             │
│  ├─ gpu_latency_ms (REAL)                                         │
│  └─ created_at (TIMESTAMPTZ DESC index)                           │
│                                                                    │
│  context_timeline_events (table)                                  │
│  ├─ id (BIGSERIAL PK)                                             │
│  ├─ correlation_id (uuid) ← links to user session                 │
│  ├─ signal (thumbs_up | thumbs_down | dwell | correction)         │
│  ├─ grpo_reward (REAL) ← for RL training                          │
│  └─ created_at (TIMESTAMPTZ DESC index)                           │
│                                                                    │
│  PROPERTIES:                                                       │
│  • Append-only (NEVER UPDATE/DELETE existing rows)                │
│  • Correlated by correlation_id (end-to-end tracing)              │
│  • Ordered by created_at (time-ordered access)                    │
│  • Resolved tracking (completion state)                           │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Event Replay                 │  │ Data Flow Logs               │
│ (for training)               │  │ (for audit)                  │
└──────────────────────────────┘  └──────────────────────────────┘


┌────────────────────────────────────────────────────────────────────┐
│ LAYER 2: PROJECTIONS (Rebuilt from Layer 1 on Demand)             │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  packet_features (table) *** CRITICAL ***                         │
│  ├─ packet_id (TEXT PK)                                           │
│  │                                                                 │
│  │ IMMUTABLE (set once):                                           │
│  │ ├─ summary_embedding (vector(768))                             │
│  │ ├─ content_embedding (vector(768))                             │
│  │ └─ signature_embedding (vector(768))                           │
│  │                                                                 │
│  │ MUTABLE (refreshable):                                          │
│  │ ├─ latent64, latent128 (from autoencoder)                      │
│  │ ├─ som_cell_x, som_cell_y, som_distance, cluster_id (from SOM) │
│  │ ├─ authority_score (from pagerank)                             │
│  │ ├─ pagerank_score                                              │
│  │ ├─ attention_score (from attention gate)                       │
│  │ └─ policy_score (from RL policy)                               │
│  │                                                                 │
│  │ TRACKING:                                                       │
│  │ ├─ last_gpu_refresh (TIMESTAMPTZ)                              │
│  │ └─ status (valid | stale | error | computing)                  │
│  │                                                                 │
│  │ INDEXES: som_cell, cluster_id, authority_score,                │
│  │          policy_score, status, last_gpu_refresh                │
│  │                                                                 │
│  │ REBUILD FROM: gpu_compute_events (deterministic SQL)            │
│  │ REBUILD TRIGGER: status check or on-demand                      │
│  │ CONSISTENCY CHECK: Layer 1 ≠ Layer 2 detection                  │
│  │                                                                 │
│  ├─ task_state_projection (table)                                 │
│  │ ├─ task_id (UUID PK)                                           │
│  │ ├─ status (executing | completed | failed | pending)           │
│  │ ├─ outcome, priority, metrics (JSONB)                          │
│  │ └─ REBUILD FROM: agent_os_events                               │
│  │                                                                 │
│  └─ engram_recall_projection (table)                              │
│    ├─ memory_id (UUID PK)                                         │
│    ├─ user_intent                                                 │
│    ├─ hotness (REAL, computed)                                    │
│    ├─ grpo_reward_total                                           │
│    └─ REBUILD FROM: context_timeline_events                       │
│                                                                    │
│  PROPERTIES:                                                       │
│  • Deterministic (same Layer 1 events → same projection)           │
│  • Idempotent (rebuild twice → identical results)                  │
│  • Corruption-recoverable (delete → rebuild from Layer 1)          │
│  • Consistency-checkable (Layer 1 ≠ Layer 2 detection)             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
         ACE Retrieval                  Policy Learning
         (Stage A lookup)                (training data)


┌────────────────────────────────────────────────────────────────────┐
│ LAYER 3: GPU FEATURE CACHE (Pre-computed Results)                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  gpu_feature_cache (table)                                        │
│  ├─ cache_key (TEXT PK) ← sha256(compute_type + input_hash)      │
│  ├─ compute_type (autoencoder_encode | som_train | ...)          │
│  ├─ input_hash (TEXT)                                             │
│  ├─ result (JSONB) ← computed output                             │
│  ├─ result_vector (vector(768)) ← if applicable                   │
│  ├─ latency_ms (REAL)                                             │
│  ├─ hit_count (INT) ← for analytics                               │
│  ├─ expires_at (TIMESTAMPTZ) ← TTL 7-14 days                      │
│  └─ created_at (TIMESTAMPTZ DESC index)                           │
│                                                                    │
│  PROPERTIES:                                                       │
│  • Keyed by input hash (deterministic)                             │
│  • TTL-based expiration (7-14 days)                                │
│  • Hit tracking (for analytics)                                    │
│  • Source model version tagged (reproducibility)                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
         GPU Rerank                      Latency Metrics
         (avoids recomputation)          (performance tracking)


┌────────────────────────────────────────────────────────────────────┐
│ LAYER 4: RUNTIME CACHE (Valkey/Redis, Ephemeral)                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  bifrost:packet:{packet_id}                                       │
│  ├─ Content: packet_features JSON                                 │
│  ├─ TTL: 7 days                                                   │
│  └─ Invalidated via NATS pub on Layer 1 write                     │
│                                                                    │
│  centroid:feature:{feature_id}                                    │
│  ├─ Content: 768-dim centroid vector                              │
│  ├─ TTL: 14 days                                                  │
│  └─ Used for ACE prefiltering                                     │
│                                                                    │
│  centroid:som:{som_cell}                                          │
│  ├─ Content: SOM cell centroid                                    │
│  ├─ TTL: 14 days                                                  │
│  └─ Used for topology-based prefilter                             │
│                                                                    │
│  ace:authority:top                                                │
│  ├─ Content: hash {file → authority_score}                        │
│  ├─ TTL: 24 hours                                                 │
│  └─ Used for Authority sorting                                    │
│                                                                    │
│  gpu:karpathy:scores                                              │
│  ├─ Content: hash {file → {pr, attn, authority, blend}}          │
│  ├─ TTL: 24 hours                                                 │
│  └─ Used for recommendation ranking                               │
│                                                                    │
│  PROPERTIES:                                                       │
│  • Ephemeral (automatic TTL expiration)                            │
│  • Invalidated on Layer 1 writes (NATS pub)                        │
│  • L4 miss → read L2 projection (fallback)                         │
│  • No manual invalidation needed                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
         ACE Fast Path                  Cache Hit Metrics
         (5ms responses)                 (performance analytics)
```

---

## Agent Scheduler Job Queue

```
┌────────────────────────────────────────────────────────────┐
│ agent_scheduler_jobs (Unified Task Queue)                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ job_id (UUID PK)                                           │
│ ├─ job_type (index_codebase | gpu_refresh | rl_rerank ...)│
│ ├─ status (pending → queued → executing → completed)      │
│ ├─ priority (0-100)                                        │
│ ├─ depends_on (uuid[] of blocking jobs)                    │
│ ├─ assigned_worker (langraph | gpu-worker | indexer)      │
│ ├─ attempts, max_attempts                                  │
│ ├─ payload (JSONB, task config)                           │
│ ├─ result (JSONB, output)                                 │
│ ├─ created_at, started_at, completed_at                   │
│ └─ updated_at                                              │
│                                                            │
│ INDEXES: status, priority, created_at, assigned_worker     │
│                                                            │
│ WORKFLOW:                                                  │
│ 1. Executive Planner INSERTs pending jobs                 │
│ 2. Agent Scheduler queries: WHERE status='pending'        │
│ 3. Resolve dependencies, UPDATE status='queued'           │
│ 4. Worker reads: WHERE status='queued' AND assigned_worker │
│ 5. Worker executes, UPDATEs status='executing'            │
│ 6. Worker completes, UPDATEs status='completed', result   │
│                                                            │
│ DEPENDENCY RESOLUTION:                                     │
│ SELECT status FROM agent_scheduler_jobs                   │
│ WHERE job_id = ANY(depends_on);                           │
│ Only assign if ALL dependencies are 'completed'           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Signal Flow (From User to Layer 1)

```
User Input
    │
    ├─→ Executive Planner (signals collected)
    │   ├─ git state (branch, commits, dirty)
    │   ├─ redis signals (karpathy, authority)
    │   ├─ postgres outcomes (completed tasks)
    │   ├─ gpu health (cuda available?)
    │   ├─ policy scores
    │   └─ task dependencies
    │
    ├─→ OpenSpec (intent decomposed)
    │   ├─ Spec ID
    │   ├─ Task list (task-1, task-2, ...)
    │   ├─ Acceptance criteria
    │   ├─ Verification gates
    │   └─ Rollback plans
    │
    ├─→ Recommendation Generation
    │   ├─ Priority ranking (0-1.0)
    │   ├─ Confidence scoring
    │   ├─ Cost estimation
    │   └─ Risk assessment
    │
    ├─→ Agent Scheduler Emission
    │   └─ INSERT agent_scheduler_jobs (status=pending)
    │
    ├─→ Orchestrator (every 60s)
    │   └─ evaluateJobsNeeded() → dispatchJobs() → assignJobs()
    │       └─ UPDATE status to 'queued', assign_worker
    │
    ├─→ Worker (LangGraph | GPU | Indexer)
    │   └─ READ agent_scheduler_jobs (status=queued)
    │       └─ Execute tasks from spec
    │           └─ EMIT NATS events
    │
    ├─→ NATS Event Bus
    │   ├─ spec.decomposed
    │   ├─ task.started
    │   ├─ task.completed
    │   ├─ gpu.computed
    │   └─ recommendation.published
    │
    ├─→ Go Sidecar
    │   └─ NATS message handler
    │       └─ INSERT agent_os_events (Layer 1 truth)
    │           └─ PUBLISH NATS bifrost.invalidate
    │
    └─→ Valkey Cache Invalidation
        └─ DEL bifrost:packet:*
            └─ Next read: L4 miss → L2 read → L4 write
```

---

## Recovery Scenarios

```
SCENARIO 1: Corrupt Projection (packet_features)
──────────────────────────────────────────────
Status: User reports wrong SOM cluster on packet X
        Packet features are stale/incorrect

Recovery:
1. TRUNCATE packet_features          (5s)
2. SELECT * FROM gpu_compute_events  (5s)
3. INSERT packet_features            (10s, rebuild)
4. Consistency check                  (2s)
Total: 22s, no data loss, fully auditable


SCENARIO 2: Corrupt Task State (task_state_projection)
────────────────────────────────────────────────────
Status: User sees wrong task status

Recovery:
1. TRUNCATE task_state_projection    (1s)
2. SELECT * FROM agent_os_events     (1s)
3. INSERT task_state_projection      (5s, rebuild)
Total: 7s, no data loss


SCENARIO 3: Cache Corruption (Valkey)
──────────────────────────────────────
Status: Old cached data returns

Recovery:
1. Redis FLUSHDB                     (auto-TTL expires)
2. OR manual FLUSHALL               (worst-case)
3. L4 miss → L2 read → rebuild cache (automatic)
Total: automatic, worst-case manual flush + rebuild (30s)


SCENARIO 4: Double-write (NATS message duplicated)
──────────────────────────────────────────────────
Status: Same event inserted twice to agent_os_events

Recovery:
Postgres ensures idempotency (PK on correlation_id + event_type)
INSERT ... ON CONFLICT ... DO NOTHING
OR dedup on application layer (check duplicate within same sec)
```

---

## Performance Targets (Session 95+)

| Operation | Target | Actual (TBD) |
|-----------|--------|------|
| Schema apply | < 5s | TBD |
| Orchestrator cycle | < 10s | TBD |
| Recommendation generation | < 30s | TBD |
| Signal collection | < 10s | TBD |
| Event replay (1000 rows) | < 5s | TBD |
| L4 cache hit | < 5ms | TBD |
| L2 fallback | < 100ms | TBD |
| NATS message latency | < 50ms | TBD |

---

**Status:** ✅ Architecture Complete  
**Implementation:** ⏳ Session 95 (schema + testing)  
**Owner:** Workstation Agent OS  
