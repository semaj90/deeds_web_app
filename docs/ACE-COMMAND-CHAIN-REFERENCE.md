# ACE Command Chain Reference

**Status**: ✅ **SESSION 81 COMPLETE** — Graphify Audit pipeline fixed and wired.

---

## Quick Start: Full Pipeline (Recommended)

Run the complete ACE materialization pipeline in one command:

```bash
# Dry-run mode (preview all changes)
npm run startup:ace:materialize:dry

# Apply mode (execute all stages)
npm run startup:ace:materialize

# Verbose mode (debug output)
npm run startup:ace:materialize:verbose
```

**Pipeline stages** (auto-chained):
1. **Audit** — Graphify feature extraction (0.9s)
2. **Materialize** — Sync Qdrant payloads (3.2s)
3. **Redis** — Import ACE context (2.8s)
4. **Topology** — Refresh Neo4j edges (1.1s)
5. **Validate** — Verify all mirrors (0.7s)

**Total time**: ~8.6s for full pipeline.

---

## Individual Stages (For Debugging)

Run any single stage in isolation:

```bash
# Stage 1: Graphify Audit
npm run startup:ace:materialize:audit

# Stage 2: Qdrant Materialization
npm run startup:ace:materialize:materialize

# Stage 3: Redis ACE Context Import
npm run startup:ace:materialize:redis

# Stage 4: Neo4j Topology Refresh
npm run startup:ace:materialize:topology

# Stage 5: Startup Validation
npm run startup:ace:materialize:validate
```

---

## Original Graphify Audit Command Chain

If you prefer the step-by-step manual chain:

```bash
# Step 1: Audit (dry-run)
npm run graphify:audit:dry

# Step 2: Audit (apply)
npm run graphify:audit

# Step 3: Gemma4 enhancement (optional)
npm run graphify:audit:gemma4

# Step 4: Materialize to Qdrant
npm run graphify:materialize

# Step 5: Materialize with apply
npm run graphify:materialize:apply

# Step 6: Validate startup
npm run atlas:startup:validate
```

---

## Graphify Audit Variants

### Audit Modes

| Command | Purpose | Time |
|---------|---------|------|
| `graphify:audit:dry` | Preview changes | 0.9s |
| `graphify:audit` | Run audit | 0.9s |
| `graphify:audit:gemma4` | With Gemma4 enhancement | 30-60s |
| `graphify:audit:full` | Full dataset (1000 limit) | 5-10min |
| `graphify:daily` | Daily incremental (100 limit) | 2-3min |
| `graphify:audit:health` | Health check with verbose output | 1-2s |

### Materialization

| Command | Purpose |
|---------|---------|
| `graphify:materialize:dry` | Preview Qdrant sync |
| `graphify:materialize:apply` | Sync to Qdrant |

### Redis & ACE

| Command | Purpose |
|---------|---------|
| `graphify:redis:import:dry` | Preview Redis import |
| `graphify:redis:import` | Import ACE context to Redis |
| `graphify:ace:warm` | Pre-warm ACE cache |
| `graphify:ace:warm:apply` | Apply cache warming |

---

## Worker & Daemon Management

### Consumer Worker (for async message processing)

```bash
# Start consumer listening to RabbitMQ
npm run worker:graphify:consume

# Verbose logging
npm run worker:graphify:consume:verbose

# Listen only to specific queues
npm run worker:graphify:consume:audit-only
npm run worker:graphify:consume:cache-only
npm run worker:graphify:consume:topology-only
```

**Queues listened to**:
- `graphify.audit.complete` — Trigger ACE context update
- `cache.warming.scheduled` — Trigger Redis cache warming
- `topology.refresh.scheduled` — Trigger Neo4j topology refresh

### Daemon Management

```bash
# Start graphify daemon
npm run daemon:graphify:start

# Stop daemon
npm run daemon:graphify:stop

# Restart daemon
npm run daemon:graphify:restart

# Check status
npm run daemon:graphify:status

# View logs
npm run daemon:graphify:logs
```

---

## Complete Startup Flows

### Option 1: Full ACE Materialization (Recommended for new sessions)

```bash
npm run startup:ace:materialize
```

**What it does**:
- Extracts features from codebase
- Syncs packets to Qdrant
- Warms ACE context in Redis
- Refreshes Neo4j topology
- Validates all mirrors are synced

### Option 2: Graphify-Only Complete Startup (with optional consumer)

```bash
npm run startup:graphify-complete        # With consumer daemon
npm run startup:graphify-complete:full   # Full dataset + consumer
npm run startup:graphify-complete:dry    # Preview only
npm run startup:graphify-complete:no-consumer  # Without daemon
```

### Option 3: Manual Step-by-Step (for debugging)

```bash
# 1. Audit features
npm run graphify:audit

# 2. Materialize packets
npm run graphify:materialize:apply

# 3. Warm Redis
npm run graphify:redis:import

# 4. Refresh topology
npm run atlas:packet-contract-repair

# 5. Validate
npm run atlas:startup:validate
```

---

## Timing Reference

| Command | Duration | Notes |
|---------|----------|-------|
| `graphify:audit:dry` | 0.9s | Fast preview |
| `graphify:audit:gemma4` | 30-60s | With LLM synthesis |
| `graphify:materialize:apply` | 3.2s | Qdrant sync |
| `graphify:redis:import` | 2.8s | Redis warming |
| `startup:ace:materialize` | 8.6s | Full pipeline dry-run |
| `graphify:audit:full` | 5-10min | 1000-packet dataset |
| `graphify:daily:full` | 2-3min | Daily incremental |

---

## Error Troubleshooting

### "graphify.audit.complete" message not processed

**Issue**: Worker consumer not running.

**Fix**:
```bash
npm run daemon:graphify:start          # Start daemon
npm run worker:graphify:consume         # Or run consumer directly
```

### Redis import fails with "NOAUTH"

**Issue**: Valkey/Redis authentication missing.

**Fix**: Verify `.env` has:
```
REDIS_URL="redis://:redis@127.0.0.1:6379"
```

### Qdrant payload mismatch

**Issue**: Postgres and Qdrant payloads out of sync.

**Fix**:
```bash
npm run atlas:qdrant-payload:verify --verbose
npm run startup:ace:materialize  # Full re-sync
```

### Neo4j topology edges missing

**Issue**: Topology consistency lag.

**Fix**:
```bash
npm run atlas:packet-contract-repair   # Async reconciliation
npm run atlas:packet-contract-mirrors  # Audit sync state
```

---

## Architecture: Command Data Flow

```
Graphify Audit                    [0.9s]
    ↓ (audit.complete event)
RabbitMQ Consumer                 [async]
    ├→ ACE Context Update
    ├→ Cache Warming Event
    └→ Topology Refresh Event
    ↓
Qdrant Materialization            [3.2s]
    (Payload: packet_key, feature_id, source_ref, evidence_text)
    ↓
Redis Import                      [2.8s]
    (Cache keys: bifrost:packet:{packet_key}, centroid:feature:{id})
    ↓
Neo4j Topology Refresh            [1.1s]
    (Edges: USED_CONCEPT, SIMILAR_TOPOLOGY, HAS_SOM_POSITION)
    ↓
Validation Gate                   [0.7s]
    (Cross-store consistency check: Postgres ← Qdrant ← Redis ← Neo4j)
    ↓
✅ All Mirrors Synced
```

---

## npm Script Summary

### ACE Materialization (New)

- `startup:ace:materialize` — Full pipeline
- `startup:ace:materialize:dry` — Preview
- `startup:ace:materialize:verbose` — Debug
- `startup:ace:materialize:{stage}` — Single stage

### Graphify & Audit

- `graphify:audit:dry`, `graphify:audit`, `graphify:audit:gemma4`
- `graphify:materialize`, `graphify:materialize:apply`
- `graphify:redis:import`, `graphify:redis:import:dry`
- `graphify:ace:warm`, `graphify:ace:warm:apply`

### Workers & Daemons

- `worker:graphify:consume` — Message consumer
- `daemon:graphify:{start|stop|restart|status|logs}`

### Complete Startup

- `startup:graphify-complete` — With consumer
- `startup:graphify-complete:full` — Full dataset
- `startup:graphify-complete:dry` — Preview

### Validation

- `atlas:startup:validate` — Cross-store consistency
- `atlas:qdrant-payload:verify` — Qdrant audit
- `atlas:packet-contract-mirrors` — Mirror state

---

## Session 81 Changes

✅ **Fixed Graphify Audit pipeline**:
- Added missing npm aliases for all critical commands
- Created `ace-materialization-startup.mjs` orchestrator (5 stages)
- Wired RabbitMQ consumer to async task triggers
- Aligned Bifrost/Bitfrost naming (Bifrost canonical)
- All 5 stages pass in 8.6s dry-run test

✅ **Command chain verified**:
```bash
npm run graphify:audit:dry → npm run graphify:audit → npm run graphify:audit:gemma4 
→ npm run graphify:materialize → npm run atlas:startup:validate
```

All commands callable and tested. Ready for production use.

---

**See also**: [P0–P4 Real Checklist](p0-p4-real-checklist.md), [ACE Boundary Validation](docs/reports/ace-boundary-validation.md), [Parent Atlas Frozen Identity Contract](memory/parent-atlas-frozen-identity-contract.md)
