# Session 95 Quickstart — Apply Schema + Test Orchestrators

**Estimated Time:** 2 hours  
**Objective:** Get event-sourcing foundation live and tested before LangGraph integration

---

## Pre-Flight (2 min)

```bash
# Verify all files exist
ls -la drizzle/0100_event_sourcing_packet_features.sql
ls -la scripts/agent/agent-scheduler-orchestrator.mjs
ls -la scripts/executive/executive-planner.mjs

# Expected: 3 files, no errors
```

---

## Step 1: Apply Schema (5 min)

```bash
# Check if Postgres is running
docker ps | grep legal-ai-postgres
# Expected: legal-ai-postgres:15.6 RUNNING

# Apply migration (idempotent, can run multiple times safely)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0100_event_sourcing_packet_features.sql

# Expected output: CREATE TABLE, CREATE INDEX (no errors)
```

**Verify:**
```bash
# Check 5 tables created
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name IN (
  'packet_features', 'gpu_compute_events', 'context_timeline_events',
  'agent_scheduler_jobs', 'startup_review_state'
)
ORDER BY table_name;"

# Expected:
#          table_name
# ─────────────────────────
#  agent_scheduler_jobs
#  context_timeline_events
#  gpu_compute_events
#  packet_features
#  startup_review_state
```

---

## Step 2: Install OpenSpec (5 min)

```bash
cd sveltekit-frontend

# Install CLI + SDK
npm install --save-dev @openspec/cli @openspec/sdk

# Initialize
npx openspec init

# Expected: Creates .openspec/ directory with config.yaml

# Verify installation
npx openspec --version
# Expected: Version 1.0.0+ (or whatever latest)
```

---

## Step 3: Test Agent Scheduler (5 min)

```bash
cd sveltekit-frontend

# Dry-run: see what jobs would be queued (no Postgres writes)
npm run agent:scheduler:dry

# Expected output:
# [AGENT SCHEDULER ORCHESTRATOR]
# [START] 2026-06-29T...
# [STEP 1] Evaluating jobs needed...
# [RESULT] N job types identified
# [STEP 2] Dispatching jobs...
# [RESULT] 0 jobs dispatched (dry-run mode)
# [STEP 3] Assigning jobs...
# [RESULT] 0 jobs assigned
```

**Troubleshoot:**
- If "Cannot find module 'postgres'": `npm install postgres`
- If Redis error: Redis might be down, that's OK (graceful fallback)
- If Postgres error: Check DATABASE_URL in .env or env vars

---

## Step 4: Test Executive Planner (10 min)

```bash
cd sveltekit-frontend

# Dry-run: collect signals, generate recommendations (no Postgres writes)
npm run plan:recommendations -- --dry-run --verbose

# Expected output:
# [EXECUTIVE PLANNER]
# [START] 2026-06-29T...
# [TRIGGER] manual
# [MODE] DRY-RUN (no Postgres writes)
# [STEP 1] Collecting signals...
# [RESULT] 7 signal types collected
# [STEP 2] Generating spec with OpenSpec...
# [RESULT] Generated spec: rec-XXXXX
# [STEP 3] Recommendations:
#   [1] GPU refresh stale packets (priority 0.90)
#   [2] Incremental indexing (priority 0.80)
#   etc.
# [COMPLETE] Xs
```

**Troubleshoot:**
- If OpenSpec error: Ensure `npx openspec init` completed
- If git error: Not a git repo or git commands not found
- If Python error (GPU check): That's OK, will report cuda_available: false

---

## Step 5: Wire Go Sidecar to Layer 1 Events (90 min)

**Current State:** Go sidecar handles NATS messages, sends mock responses

**Target State:** Go sidecar emits events to Layer 1 (agent_os_events table)

**File to Edit:** `cmd/agent-sidecar/main.go`

**Changes Needed (4 handlers):**

```go
// Before (current):
func handleTaskExecute(m *nats.Msg) {
  var req TaskRequest
  json.Unmarshal(m.Data, &req)
  resp := TaskResponse{ TaskID: req.TaskID, Status: "executed", ... }
  m.Respond(json.Marshal(resp))
}

// After (add Layer 1 event emission):
func handleTaskExecute(m *nats.Msg) {
  var req TaskRequest
  json.Unmarshal(m.Data, &req)
  
  // Correlation ID (trace end-to-end)
  correlationID := uuid.New().String()
  
  // EMIT: task.start event to Layer 1
  emitAgentOSEvent(db, correlationID, "task.start", "nats:agent.task.execute", 
    req.TaskID, req.Payload, "info")
  
  // Do work...
  resp := TaskResponse{ TaskID: req.TaskID, Status: "executed", ... }
  
  // EMIT: task.end event to Layer 1
  emitAgentOSEvent(db, correlationID, "task.end", "nats:agent.task.execute",
    req.TaskID, resp.Result, "info")
  
  m.Respond(json.Marshal(resp))
}

// NEW: Helper to emit events
func emitAgentOSEvent(db *sql.DB, correlationID, eventType, source, taskID string, payload interface{}, severity string) error {
  query := `
    INSERT INTO agent_os_events (correlation_id, event_type, source, title, body, severity, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `
  payloadJSON, _ := json.Marshal(payload)
  _, err := db.Exec(query, correlationID, eventType, source, eventType, taskID, severity, payloadJSON)
  return err
}
```

**Also Add:**
1. Postgres connection pooling at startup
2. NATS publish on layer 1 write (bifrost.invalidate subject)
3. Error handling (log if Postgres INSERT fails)

**Testing:**
```bash
# In terminal 1: start Go sidecar
cd cmd/agent-sidecar
go run main.go

# In terminal 2: send test NATS message
npm run nats:proof-of-life:all

# In terminal 3: check Layer 1 events
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT correlation_id, event_type, created_at FROM agent_os_events 
ORDER BY created_at DESC LIMIT 10;"

# Expected: 10 rows, event_type = task.start, task.end, etc.
```

---

## Step 6: Test End-to-End (20 min)

```bash
# Terminal 1: Start Go sidecar (listening on NATS)
cd sveltekit-frontend && npm run go:sidecar:run

# Terminal 2: Trigger recommendation generation (live, not dry-run)
cd sveltekit-frontend && npm run plan:recommendations

# Terminal 3: Watch Layer 1 events populate
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT event_type, COUNT(*) as count FROM agent_os_events 
WHERE created_at > NOW() - INTERVAL '1 minute'
GROUP BY event_type
ORDER BY count DESC;"

# Expected:
#      event_type       | count
# ──────────────────────┼───────
#  task.end             |    12
#  task.start           |    12
#  recommendation.pub   |     3
```

**Check Agent Scheduler queue:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT job_type, status, COUNT(*) as count FROM agent_scheduler_jobs 
WHERE created_at > NOW() - INTERVAL '1 minute'
GROUP BY job_type, status
ORDER BY created_at DESC;"

# Expected:
#      job_type     | status  | count
# ──────────────────┼─────────┼───────
#  gpu_refresh      | pending |     1
#  index_codebase   | pending |     1
#  health_audit     | pending |     1
```

---

## Validation Gates (All Must Pass)

| Gate | Command | Expected |
|------|---------|----------|
| **Schema** | `SELECT COUNT(*) FROM packet_features` | > 0 (row count OK, likely 0 initially) |
| **Schema** | `SELECT COUNT(*) FROM agent_scheduler_jobs` | >= 1 (jobs queued) |
| **Layer 1** | `SELECT COUNT(*) FROM agent_os_events` | >= 1 (events emitted) |
| **Orchestrator** | `npm run agent:scheduler:dry` | Exit code 0, no errors |
| **Planner** | `npm run plan:recommendations -- --dry-run` | Exit code 0, ≥3 recommendations |
| **Go Sidecar** | `npm run go:sidecar:run` | Listens on NATS, no crashes |
| **NATS** | `npm run nats:proof-of-life:all` | 5/5 subjects PASS |

---

## If Stuck

### Postgres connection errors
```bash
# Test Postgres directly
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;"
# Expected: 1 (connection OK)
```

### Redis connection errors (OK to ignore)
```bash
# Redis might be down, Executive Planner will degrade gracefully
# Check if needed:
docker exec legal-ai-redis redis-cli PING
# Expected: PONG (if running)
# Not PONG: Redis is down, that's OK for now
```

### OpenSpec not found
```bash
# Reinstall
cd sveltekit-frontend
npm install --save-dev @openspec/cli @openspec/sdk
```

### Go sidecar won't compile
```bash
cd cmd/agent-sidecar
go mod download  # Download deps
go run main.go   # Try again
```

---

## Cleanup (Before Finishing)

```bash
# Stop Go sidecar (Ctrl+C in terminal)
# Stop npm watch processes

# Commit work
git status
git add .
git commit -m "Session 95: Event sourcing schema + orchestrators wired"

# Verify schema is in git
git show HEAD:drizzle/0100_*.sql | head -10
```

---

## Success Criteria

✅ Schema applied (5 tables in Postgres)  
✅ Orchestrators tested (dry-run modes successful)  
✅ Go sidecar emits Layer 1 events  
✅ End-to-end flow works (spec → scheduler → NATS → events → Postgres)  
✅ No Postgres errors, no data corruption  
✅ All gates pass  

**If all green:** Ready for Session 96 (LangGraph integration)

---

## Key Files for Reference

- `drizzle/0100_event_sourcing_packet_features.sql` — Schema
- `scripts/agent/agent-scheduler-orchestrator.mjs` — Job scheduler
- `scripts/executive/executive-planner.mjs` — Recommendation engine
- `cmd/agent-sidecar/main.go` — NATS handler (needs wiring)
- `docs/PHASE-5-EXTENDED-EVENT-SOURCING-ARCHITECTURE.md` — Full reference
- `docs/OPENSPEC-INTEGRATION-PLAN.md` — OpenSpec setup guide

---

**Estimated Total Time:** 2 hours  
**Critical Path:** Schema (5m) → Orchestrators (20m) → Go Sidecar (90m) → End-to-End (20m)  
**Owner:** Session 95  
**Next:** Session 96 LangGraph Worker Integration
