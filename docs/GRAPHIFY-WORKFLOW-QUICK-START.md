# Daily Graphify Mastra Workflow — Quick Start Guide

**Created**: July 19, 2026  
**Status**: Ready for testing

---

## npm Scripts Reference

All scripts are prefixed with `npm run` from the `sveltekit-frontend/` directory.

### Basic Execution

| Script | Purpose | Side Effects |
|--------|---------|--------------|
| `graphify:workflow:mastra:dry` | Dry-run preview (no DB writes, no commits) | Read-only |
| `graphify:workflow:mastra` | Full execution (commits to main, writes DB) | ✅ Writes database + git commits |
| `graphify:workflow:mastra:verbose` | Full execution with detailed phase traces | ✅ Writes database + git commits |

### Advanced Options

| Script | Purpose | Usage |
|--------|---------|-------|
| `graphify:workflow:mastra` `--resume=<runId>` | Resume a previous run | `--resume=graphify_mastra_1721401234567` |
| `graphify:workflow:mastra` `--start-phase=<A-G>` | Start from specific phase | `--start-phase=D` |
| `graphify:workflow:mastra` `--skip-gates` | Skip evaluation gates (proceed to promote) | Use with caution |

### Combined Usage Examples

```bash
# Dry-run preview
npm run graphify:workflow:mastra:dry

# Real execution with verbose output
npm run graphify:workflow:mastra:verbose

# Resume a previous run from where it left off
node ../scripts/atlas/daily-graphify-mastra-workflow.mjs --resume=graphify_mastra_1721401234567

# Start from Phase D (Execution) for a previous run
node ../scripts/atlas/daily-graphify-mastra-workflow.mjs --resume=graphify_mastra_1721401234567 --start-phase=D

# Skip gates and force promote (development only)
node ../scripts/atlas/daily-graphify-mastra-workflow.mjs --skip-gates
```

---

## Execution Flow

### Step 1: Preview with Dry-Run

```bash
cd sveltekit-frontend
npm run graphify:workflow:mastra:dry
```

**Expected Output**:
```
[HH:MM:SS] · Workflow Run ID: graphify_mastra_1721401234567
[HH:MM:SS] · Mode: DRY-RUN
[HH:MM:SS] → Phase A (Error Collection): RUNNING
[HH:MM:SS] ✓ Phase A (Error Collection): PASS (duration: 4.2s, inputCount: 0, outputCount: 24)
[HH:MM:SS] → Phase B (Agent Analysis): RUNNING
[HH:MM:SS] ✓ Phase B (Agent Analysis): PASS (duration: 7.8s, inputCount: 0, outputCount: 3)
...
[HH:MM:SS] ✓ Workflow complete
[HH:MM:SS] · Report: c:\Users\james\Videos\deeds-web-app\docs\reports\graphify-workflow\workflow-graphify_mastra_1721401234567.json
```

### Step 2: Examine Report

```bash
cat docs/reports/graphify-workflow/workflow-graphify_mastra_1721401234567.json
```

**Expected Fields**:
```json
{
  "runId": "graphify_mastra_1721401234567",
  "startedAt": "2026-07-19T15:23:45.123Z",
  "completedAt": "2026-07-19T15:24:42.456Z",
  "flags": {
    "DRY_RUN": true,
    "VERBOSE": false,
    "SKIP_GATES": false
  },
  "phases": {
    "A": { "status": "PASS", "timestamp": "...", "duration": "4.2s" },
    "B": { "status": "PASS", "timestamp": "...", "duration": "7.8s" },
    ...
  },
  "gates": {
    "gate_1": { "name": "Distribution", "passed": true, "actual": 0.35, "target": 0.4 },
    "gate_2": { "name": "Variance", "passed": true, "actual": 2.3, "target": 2.0 },
    ...
  },
  "summary": {
    "status": "COMPLETE",
    "gatesAllPassed": true
  }
}
```

### Step 3: Run Real Execution

Once happy with preview:

```bash
npm run graphify:workflow:mastra
```

**Expected Output**: Same as dry-run, but with actual DB writes and git commits.

---

## Workflow Phases Checklist

During execution, monitor these phases:

### Phase A: Error Collection ✓
- [ ] Database query succeeds
- [ ] Error count > 0
- [ ] Distribution metrics computed

### Phase B: Agent Analysis ✓
- [ ] Error clusters identified
- [ ] Root cause mapping complete
- [ ] Gate 2 variance ≥ 2.0

### Phase C: Agent Planning ✓
- [ ] Fix plans generated
- [ ] Atomic steps decomposed
- [ ] Gate 3 correlation ≥ 0.30

### Phase D: Agent Execution (Parallel) ✓
- [ ] CSS domain completes
- [ ] TypeScript domain completes
- [ ] Schema domain completes
- [ ] Route domain completes

### Phase E: Test & Validation ✓
- [ ] typecheck:native passes
- [ ] lint passes
- [ ] test suite passes
- [ ] e2e smoke tests pass

### Phase F: Re-evaluation (Gates 1-4) ✓
- [ ] Gate 1 (Distribution): PASS or BLOCK?
- [ ] Gate 2 (Variance): PASS or BLOCK?
- [ ] Gate 3 (Correlation): PASS or BLOCK?
- [ ] Gate 4 (Diversity): PASS or BLOCK?

### Phase G: Promote or Rollback ✓
- [ ] If all gates PASS → Commit to main
- [ ] If any gate BLOCK → Rollback + Phase C retry

---

## Troubleshooting

### Error: "DATABASE_URL not set"

```bash
# Ensure .env is loaded
cat .env | grep DATABASE_URL

# Or set explicitly
export DATABASE_URL="postgresql://..."
npm run graphify:workflow:mastra
```

### Error: "Cannot find module 'pg'"

```bash
# Install PostgreSQL client
npm install pg
```

### Error: "Phase X failed"

Check the JSON report:

```bash
cat docs/reports/graphify-workflow/workflow-graphify_mastra_*.json | jq '.phases.X'
```

Look for `error_message` field — it contains root cause.

### Workflow Hangs

Press `Ctrl+C` to interrupt. The workflow state is persisted in Postgres — resume later:

```bash
# Find last run ID
ls -lt docs/reports/graphify-workflow/ | head -3

# Resume from last phase
npm run graphify:workflow:mastra --resume=graphify_mastra_1721401234567
```

---

## Performance Expectations

| Phase | Duration (serial) | Duration (parallel) |
|-------|-------------------|---------------------|
| A: Collection | 2-5 min | 2-5 min |
| B: Analysis | 3-8 min | 3-8 min |
| C: Planning | 2-5 min | 2-5 min |
| D: Execution | 5-15 min (per domain) | ~15 min (4 domains parallel) |
| E: Test | 3-10 min | 3-10 min |
| F: Re-eval | 2-5 min | 2-5 min |
| G: Promote | 1-2 min | 1-2 min |
| **Total** | **18-50 min** | **~25-45 min (4× speedup for Phase D)** |

---

## Integration with SvelteKit Dashboard (Future)

Once wired, the dashboard will show:

### Real-Time Phase Status
- Current phase (A-G)
- Progress bar (% complete)
- Estimated time remaining

### Gate Signals (Live Updates)
- Gate 1: Distribution % (target: ≤40% bias)
- Gate 2: Variance span (target: ≥2.0)
- Gate 3: Correlation score (target: ≥0.30)
- Gate 4: Diversity % (target: ≥80%)

### Fix Success Rate (Per Domain)
- CSS: X% pass rate
- TypeScript: X% pass rate
- Schema: X% pass rate
- Route: X% pass rate

### Audit Trail Browser
- Search by error_id or packet_key
- View fix history
- See gate decisions
- Link to commit SHAs

### Phase Timeline (Gantt Chart)
- Rows: [A, B, C, D-CSS, D-TS, D-Schema, D-Route, E, F, G]
- Colors: Running (yellow), Passed (green), Blocked (red)
- Real-time updates

---

## Key Metrics to Track

After each run, review:

1. **Fix Rate**: (fixed / total) — target: >75%
2. **Gate Pass Rate**: (promote_count / total_batches) — target: ≥80% first-pass
3. **Time per Cycle**: Gate 1 → Promote — target: <50 min
4. **Audit Trail Completeness**: (with_packet_key / total_fixes) — target: 100%
5. **Regression Rate**: (new_errors_post_fix / cycle_count) — target: 0%
6. **Dashboard Latency**: (dashboard_update / workflow_event) — target: <5 sec

---

## Next Steps

1. **Test dry-run** on development machine
2. **Review generated report** (`docs/reports/graphify-workflow/*.json`)
3. **Validate gate thresholds** (are 0.4, 2.0, 0.30, 0.80 realistic for your error set?)
4. **Run real execution** on a staging branch
5. **Monitor for regressions** (new errors, broken tests)
6. **Iterate on thresholds** (lower threshold = more fixes, higher = fewer false positives)
7. **Deploy to production** (continuous graphify runs nightly)

---

## References

- [DAILY-GRAPHIFY-MASTRA-WORKFLOW.md](./DAILY-GRAPHIFY-MASTRA-WORKFLOW.md) — Full architecture documentation
- [TEMPORAL-DAG-AGENTIC-ERROR-FIXING.md](./TEMPORAL-DAG-AGENTIC-ERROR-FIXING.md) — Design blueprint
- `scripts/atlas/daily-graphify-mastra-workflow.mjs` — Source code
- `docs/reports/graphify-workflow/` — Execution reports (JSON)

