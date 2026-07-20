# Graphify Operator Quick Reference

**Last Updated**: July 19, 2026 | **Safety Level**: 🟢 Production-Ready (P1 Fixes)

---

## Quick Start

```bash
# Check services are up
npm run graphify:validate

# Test pipeline (dry-run, safe)
npm run graphify:downstream:chain

# Run production pipeline (wait for readiness, apply changes)
npm run graphify:downstream:chain:wait

# Test specific export type
npm run test:graphify:dry-run:full
```

---

## What's Running

| Component | Command | Duration | Risk |
|-----------|---------|----------|------|
| **Readiness Check** | Poll /api/graphify/status | ~2-10s | Low (advisory) |
| **PageRank** | npm run atlas:code-features:pagerank | ~30-60s | Low |
| **Kanban Emit** | LangGraph 7-stage pipeline | ~60-120s | Low |
| **TurboVec** | GPU tensor consolidation | ~60-180s | Low (VRAM fallback) |
| **DB Write** | Atomic transaction to kanban_tasks | ~10-30s | ✅ **SAFE** (atomic) |

**Total**: 5-15 minutes depending on dataset size

---

## Safety Guarantees (After Priority 1 Fixes)

✅ **Atomic Writes**: All kanban_tasks written atomically (all-or-nothing)  
✅ **No Concurrent Runs**: Lock file prevents simultaneous orchestrators  
✅ **Hard Timeout**: Process terminates if >20 minutes (never hangs)  
✅ **Readiness Required**: APPLY mode blocks if services unhealthy  
✅ **Auto Cleanup**: Stale locks auto-cleaned after 20 minutes  

---

## Running in Production

### Dry-Run (Safe, No DB Changes)
```bash
npm run graphify:downstream:chain
# Mode: DRY-RUN
# Writes: None
# Risk: Zero
# Use for: Testing, validation, previewing changes
```

### Apply (Full Execution with Readiness Check)
```bash
npm run graphify:downstream:chain:wait
# Mode: APPLY
# Writes: kanban_tasks table (atomic transaction)
# Risk: Low (readiness validated, transaction safe)
# Use for: Production daily runs, CI/CD pipelines
```

### Skip Stages (Advanced)
```bash
# Use previous PageRank scores
npm run graphify:downstream:chain:skip-pagerank

# Use existing kanban_tasks.jsonl file
npm run graphify:downstream:chain:skip-kanban

# Skip GPU tensor consolidation
npm run graphify:downstream:chain:skip-turbovec
```

---

## Monitoring

### Check if Running
```bash
# Lock file exists = running
ls -la .graphify-pipeline-lock

# Check age of lock
stat .graphify-pipeline-lock | grep Modify
# If >20 minutes old, auto-cleaned on next run
```

### View Progress
```bash
# Watch latest report in real-time
tail -f docs/reports/graphify-downstream-chain-*.json | jq '.'

# Check summary
tail -1 docs/reports/graphify-downstream-chain-*.json | jq '.summary'

# Check for errors
tail -1 docs/reports/graphify-downstream-chain-*.json | jq '.errors'

# Check stage times
tail -1 docs/reports/graphify-downstream-chain-*.json | jq '.stages | to_entries[] | {stage: .key, elapsed_ms: .value.elapsed_ms, status: .value.status}'
```

### After Completion
```bash
# Verify kanban_tasks written
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM kanban_tasks WHERE updated_at > NOW() - INTERVAL '1 hour'"

# View report summary
jq '{mode: .mode, success: .summary.success, message: .summary.message, elapsed_ms: .summary.elapsed_ms}' docs/reports/graphify-downstream-chain-*.json

# Check for partial failures
jq '.stages[] | select(.status != "pass")' docs/reports/graphify-downstream-chain-*.json
```

---

## Troubleshooting

### "Another orchestrator is running"
```bash
# Already running in background?
ls -la .graphify-pipeline-lock
ps aux | grep graphify

# Wait for completion (max 20 minutes)
# Or force cleanup if >20 minutes old:
rm -f .graphify-pipeline-lock
```

### "Readiness check failed"
```bash
# Services down?
npm run graphify:validate

# Retry with wait flag
npm run graphify:downstream:chain:wait
# Waits up to 120s for services to come online

# Or fix services manually then:
npm run graphify:downstream:chain:wait
```

### "Timeout after XX seconds"
```bash
# Stage taking too long
# Check what's happening: (Note: process already killed by hard timeout)

# If stage consistently times out, skip it:
npm run graphify:downstream:chain:skip-pagerank

# Or increase LOCK_TIMEOUT_MS in script (currently 20 min)
# Then test: npm run graphify:downstream:chain
```

### "Kanban DB write failed"
```bash
# Check error in report
jq '.stages.kanban_db_write.error' docs/reports/graphify-downstream-chain-*.json

# Common issues:
# - Connection pool exhausted (check if other processes holding connections)
# - Table locked (check for long-running queries)
# - Malformed JSON in .tmp/kanban_tasks.jsonl (validate with jq)

# Retry (transaction auto-rollbacks failed writes):
npm run graphify:downstream:chain:wait
```

---

## Admin UI

### Check Readiness Status
```
http://localhost:5173/admin/graphify-readiness
```

Features:
- Real-time status grid (core, optional, gated)
- Pipeline stages checklist (6 stages)
- Blocking/non-blocking lanes
- Manual refresh button
- Color-coded status (green/yellow/red/blue/orange)

---

## Alerts to Configure

### Critical (Page On-Call)
```
- Pipeline execution exceeds 20 minutes (hard timeout killed process)
- Database write to kanban_tasks fails (transactional rollback occurred)
- Readiness check reports blocking lane = FAIL
```

### Warning (Notify Team)
```
- Pipeline execution exceeds 15 minutes (approaching hard timeout)
- Two or more sequential failures
- Readiness degraded (optional lanes = WARN)
```

### Info (Log Only)
```
- Pipeline completed successfully
- Pipeline skipped stages (dry-run mode)
- All kanban tasks written (N tasks)
```

---

## Key Files

| File | Purpose | Read When |
|------|---------|-----------|
| `scripts/atlas/graphify-trigger-downstream-pipeline.mjs` | Master orchestrator | Debugging failures |
| `docs/reports/graphify-downstream-chain-*.json` | Execution report | After each run |
| `.graphify-pipeline-lock` | Concurrency lock | Checking if running |
| `docs/GRAPHIFY-SAFETY-ENHANCEMENTS.md` | Enhancement guide | Understanding fixes |
| `AUDIT-GRAPHIFY-READINESS-INFRASTRUCTURE.md` | Full technical audit | Deep dive on issues |

---

## Common Patterns

### Daily Cron Job
```bash
# Add to crontab
0 2 * * * cd /path/to/deeds-web-app && npm run graphify:downstream:chain:wait >> /var/log/graphify.log 2>&1

# Check logs
tail -f /var/log/graphify.log
```

### CI/CD Pipeline
```bash
# In GitHub Actions / GitLab CI
- name: Run Graphify Pipeline
  run: npm run graphify:downstream:chain:wait
  timeout-minutes: 25  # Slightly longer than orchestrator's 20min hard timeout

- name: Verify Output
  run: jq '.summary.success' docs/reports/graphify-downstream-chain-*.json | grep -q true
```

### Manual Debugging
```bash
# Start with dry-run
npm run graphify:downstream:chain

# If dry-run succeeds, try full run
npm run graphify:downstream:chain:apply

# Check report
tail -1 docs/reports/graphify-downstream-chain-*.json | jq '.stages'

# If kanban stage fails, skip it and check upstream
npm run graphify:downstream:chain:skip-kanban

# If turbovec fails, skip it (not critical)
npm run graphify:downstream:chain:skip-turbovec
```

---

## Performance Notes

- **Dry-run**: 5-10 min (no DB writes)
- **Full run**: 5-15 min (includes atomic DB transaction)
- **Readiness wait**: 2-10s (advisory) to 120s (required in APPLY mode)
- **PageRank**: 30-60s (CPU power-iteration)
- **Kanban LangGraph**: 60-120s (7 stages)
- **TurboVec**: 60-180s (GPU acceleration, may fallback to CPU)
- **Hard timeout**: 20 minutes (process terminates if exceeded)

---

## Success Indicators

After running `npm run graphify:downstream:chain:wait`, you should see:

✅ Lock acquired + released  
✅ All 5 stages executed (pass/skip/warn, but not error)  
✅ Report written to `docs/reports/`  
✅ Exit code 0 (success) or 1 (failure)  
✅ Kanban tasks row count increased in database  

```bash
# Verify success
tail -1 docs/reports/graphify-downstream-chain-*.json | jq '.summary.success'
# Returns: true (or false on error)
```

---

**Safety Level**: 🟢 Production-Ready (Priority 1 Fixes Applied)  
**Last Verified**: July 19, 2026 | **By**: Deep Audit Agent
