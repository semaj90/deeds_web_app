# Temporal DAG: Agentic Error Fixing with Evaluation Gate Feedback

**Date**: July 18, 2026  
**Status**: Design Blueprint (Ready for Implementation)  
**Alignment**: EVALUATION-DATA-COLLECTION-BLUEPRINT.md + OpenSpec Studio + Atlas Identity + SvelteKit 2 dev:gpu

---

## Overview

A **temporal DAG** that orchestrates autonomous error fixing using:
- **Phase A-G execution pipeline** (serial with parallel domains)
- **Evaluation gates 1-4** as decision points (block → rollback, pass → promote)
- **Atlas packet identity** (error_id → packet_key → audit trail)
- **SvelteKit live dashboard** (`npm run dev:gpu`) for real-time visibility
- **LLM agent autonomy** with deterministic fix strategies

Total cycle per error batch: **18-50 minutes** (serial) or **5-20 minutes** (parallel by domain)

---

## Phases & Execution Timeline

### Phase A: Error Collection (2-5 min)
**Input**: Audit logs, test failures, linter output  
**Output**: Error catalog (error_id, category, severity, gate_signals)  
**Gate**: Gate 1 Distribution Validation  
**Decision**: Proceed if error distribution is balanced (no single category >40%)

**Metrics to track**:
- Total errors collected
- Distribution by category (CSS, TypeScript, Schema, Route, etc.)
- Severity distribution (CRITICAL, HIGH, MEDIUM, LOW)
- Gate 1 score (target: balanced, alert if skewed)

---

### Phase B: Agent Analysis (3-8 min)
**Input**: Top-N errors (sorted by gate signals)  
**Output**: Error clusters + root-cause map + domain classification  
**Gate**: Gate 2 Query Variance  
**Decision**: Proceed if variance span ≥ 2 (different error grades per query)

**Agent Tasks**:
1. Cluster errors by root cause (e.g., "all TimeoutError from same service")
2. Classify by domain (CSS parser, TS type mismatch, SQL syntax, SvelteKit SSR)
3. Generate fix strategy template per cluster
4. Map error_id → packet_key (source_ref + feature_id)

**Metrics to track**:
- Cluster count (top 10 by frequency)
- Root cause coverage (% of errors explained)
- Gate 2 score (variance span, target ≥ 2.0)

---

### Phase C: Agent Planning (2-5 min)
**Input**: Error clusters + fix strategy templates  
**Output**: Atomic fix plan per cluster + affected packet_keys  
**Gate**: Gate 3 Feature Correlation  
**Decision**: Proceed if correlation(original_error, fix_efficacy) ≥ 0.30

**Agent Tasks**:
1. Decompose fix into atomic steps (e.g., "fix import statement → add type → retest")
2. Identify affected source files + test files
3. Generate deterministic fix script (idempotent, testable)
4. Tag with packet_key for audit trail

**Metrics to track**:
- Plan success rate (% that are syntactically valid)
- Affected packet coverage (target ≥ 50% of error set)
- Gate 3 score (feature correlation vs original error classifier)

---

### Phase D: Agent Execution (5-15 min per domain)
**Input**: Atomic fix plan  
**Output**: Patched source + patched tests + audit trail  
**Gate**: None (execute unconditionally)  
**Parallelization**: By domain (CSS || TS || Schema || Route)

**Agent Tasks** (per domain):
1. Patch source files (AST-aware for TS, regex for CSS/SQL)
2. Update/create unit tests
3. Log error_id → packet_key → fix_diff_hash for traceability
4. Write to temp branch (not main yet)

**Metrics to track**:
- Fix success rate per domain (% that compile/lint clean)
- Execution time per domain
- Code churn (lines added/removed)

---

### Phase E: Test & Validation (3-10 min)
**Input**: Patched code from Phase D  
**Output**: Test results + pass/fail per test suite  
**Gate**: None (execute, but inform re-evaluation)  
**Execution**: Serial (all domain fixes validated together)

**Test Tasks**:
1. `npm run typecheck:native` (TS validation)
2. `npm run lint` (ESLint + stylelint)
3. `npm run test` (unit tests)
4. `npm run test:e2e` (Playwright smoke tests, selective)
5. Visual regression check (screenshot diffs)

**Metrics to track**:
- Build status (✅ pass, ❌ fail)
- Test coverage delta (% improved)
- E2E regression count (expected 0)
- Execution time (target <10 min)

---

### Phase F: Re-evaluation (2-5 min)
**Input**: New error distribution after fixes  
**Output**: Gate 1-4 re-scored  
**Gate**: All 4 gates (DECISION POINT)  
**Decision Logic**:
- Gate 1 (Distribution): Pass if fix didn't bias toward one category
- Gate 2 (Variance): Pass if query variance maintained or improved
- Gate 3 (Correlation): Pass if fixed errors ≠ causally related to new errors
- Gate 4 (Diversity): Pass if packet_key coverage ≥ 80%

**If ALL gates PASS**: → Promote (Phase G)  
**If ANY gate BLOCKS**: → Rollback + replan (back to Phase C with feedback)

**Metrics to track**:
- Gate pass/fail per gate
- Reason for any block (which gate, why)
- Re-plan triggering (if rollback)

---

### Phase G: Promote or Rollback (1-2 min)
**Input**: Gate 6 decision (pass/block)  
**Output**: Commit to main OR revert temp branch  
**Gate**: None (execute decision from Phase F)

**Promote path** (gates passed):
1. Commit patched code to main with message: `fix(error-fix-dag): <cluster_name> fixes (error_ids: ...)`
2. Log audit trail: `{error_ids, packet_keys, gate_scores_before, gate_scores_after, fix_hash}`
3. Proceed to next error batch (loop)

**Rollback path** (gates blocked):
1. Revert temp branch
2. Log reason + gate feedback
3. Back to Phase C with modified strategy
4. Max retries: 2 per error cluster (then manual review)

**Metrics to track**:
- Promoted vs rolled-back fixes
- Rollback reasons (gate 1/2/3/4)
- Manual review requests (rate)

---

## Evaluation Gates as Decision Points

| Gate | Metric | Decision | Block Threshold | Pass Threshold |
|------|--------|----------|-----------------|-----------------|
| **Gate 1: Distribution** | Error category balance | Block if skewed | >40% in one category | ≤40% in all categories |
| **Gate 2: Variance** | Query/error grade span | Block if too narrow | span < 2.0 | span ≥ 2.0 |
| **Gate 3: Correlation** | Pearson r(original, fixed) | Block if uncorrelated | r < 0.30 | r ≥ 0.30 |
| **Gate 4: Diversity** | Packet coverage | Block if overfit | coverage < 80% | coverage ≥ 80% |

**Feedback mechanism**: Gate block reason → AgentPlan adjusts strategy (e.g., "include more TS errors to satisfy Gate 2")

---

## Parallelization Strategy

**By error domain** (4 parallel tracks, Phase D):

```
ErrorCollection
  ↓ [split by domain]
  ├─ CSS Fixes (5-15 min) ──────────┐
  ├─ TypeScript Fixes (5-15 min) ───┤
  ├─ Schema Fixes (5-15 min) ────────┤ → Merge at Phase E
  └─ Route Fixes (5-15 min) ────────┘

Total parallel: ~15 min vs serial: ~60 min (4x speedup)
```

**Dependencies**:
- Gate decision (Phase F) waits for all domains to complete Phase E
- No cross-domain code conflicts (assumed by design)

---

## Atlas Packet Identity Integration

**Traceability chain**:
```
error_id (primary)
  ↓
packet_key (source_ref + feature_id)
  ↓
error_audit_log (PostgreSQL)
  ↓ columns: {error_id, packet_key, gate_scores_before, gate_scores_after, fix_hash, commit_sha}
  ↓
git commit message (includes error_ids for blame)
  ↓
future: query error_logs → find affected packets → verify fix correctness
```

**Implementation**:
- Phase B (AgentAnalyze): Maps error_id → packet_key via source_ref lookup
- Phase D (AgentFix): Writes fix_diff_hash + packet_key to temp audit log
- Phase G (Promote): Atomically commit code + audit log row

**Retrieval**:
```sql
SELECT * FROM error_audit_log 
WHERE packet_key = 'src/lib/server:auth.ts:validateSession'
ORDER BY created_at DESC
LIMIT 10;
```

---

## SvelteKit Dev Server Dashboard (`npm run dev:gpu`)

**Live widgets** (real-time update every 5 sec):

### 1. Error Trend (Chart)
- X-axis: Time
- Y-axis: Error count
- Lines: New errors/min (red), Fixed/min (green), Backlog (blue)
- Update: Real-time from error_logs table

### 2. Gate Signals (Gauges)
- Gate 1: Distribution % (target: balanced)
- Gate 2: Variance span (target: ≥ 2.0)
- Gate 3: Correlation score (target: ≥ 0.30)
- Gate 4: Diversity % (target: ≥ 80%)
- Update: Every re-evaluation (Phase F)

### 3. Fix Success Rate (Bar chart)
- Per domain: CSS, TS, Schema, Route
- Metric: % of attempts that passed all gates
- Update: Post-Phase G

### 4. Audit Trail Browser
- Search: error_id or packet_key
- Display: Fix history, gate decisions, commit SHAs
- Timeline: Error created → fixed → promoted (Gantt)

### 5. Phase Timeline (Gantt)
- Rows: [Collection, Analyze, Plan, Exec-CSS, Exec-TS, Exec-Schema, Exec-Route, Test, Re-eval, Promote]
- X-axis: Time
- Colors: Running (yellow), Passed (green), Blocked (red)
- Update: Real-time from workflow logs

---

## Implementation Files

**Core orchestrator**:
- `scripts/atlas/build-error-fix-dag.mjs` — Parse errors → DAG
- `scripts/atlas/smoke-agentic-error-fixing.mjs` — End-to-end smoke test
- `scripts/atlas/audit-error-fixes.mjs` — Audit trail + metrics export

**Agent tools**:
- `src/lib/agent/tools/packet-search.tool.ts` — error_id → packet_key
- `src/lib/agent/tools/fix-plan.tool.ts` — Generate fix strategy
- `src/lib/agent/tools/gate-evaluate.tool.ts` — Re-score gates

**SvelteKit dashboard**:
- `src/routes/(app)/error-fix-dashboard/+page.svelte` — Live DAG visualization
- `src/routes/api/error-fix/metrics/+server.ts` — Metrics endpoint
- `src/routes/api/error-fix/audit-trail/+server.ts` — Audit log API

**Database**:
- `error_logs` table (collect phase A)
- `error_audit_log` table (Phase D, packet_key traceability)
- `gate_re_evaluations` table (Phase F scores)

---

## Execution Examples

### Example 1: Single Error Batch (Happy Path)

```
Time  Phase         Status    Gates      Action
─────────────────────────────────────────────────────────
00:00 Collection   RUNNING   (none)     Find 24 errors
00:05 Collection   ✓ PASS    Gate 1 ✓   Distribution balanced
00:05 Analyze      RUNNING   Gate 2     Cluster by root cause
00:13 Analyze      ✓ PASS    Gate 2 ✓   Variance span = 2.3
00:13 Plan         RUNNING   Gate 3     Generate fix strategies
00:18 Plan         ✓ PASS    Gate 3 ✓   Correlation r = 0.45
00:18 Execute      RUNNING   (parallel) 4 domains in parallel
00:33 Test         RUNNING   (none)     Run all test suites
00:43 Re-eval      RUNNING   Gates 1-4  Re-score gates
00:48 Re-eval      ✓ PASS    ALL PASS   Ready to promote
00:48 Promote      ✓ PASS    (none)     Commit to main
00:50 [LOOP]                            Next batch

Total: 50 minutes | Result: 24 errors fixed | Gates: 4/4 pass
```

### Example 2: Single Error Batch (Rollback)

```
Time  Phase         Status    Gates      Action
─────────────────────────────────────────────────────────
00:00 Collection   ✓ PASS    Gate 1 ✓   20 errors, balanced
...
00:48 Re-eval      ✗ BLOCK   Gate 3 ✗   Correlation r = 0.18 (need 0.30)
00:48 [ROLLBACK]             (feedback) Root cause: TS fixes unrelated to CSS errors
00:48 Plan         RUNNING   Gate 3     Replan: separate TS from CSS
00:53 Plan         ✓ PASS    Gate 3 ✓   Split into 2 batches
00:53 Execute      RUNNING   (parallel) Now 2 mini-batches
01:13 Test         RUNNING   (none)     Validate both batches
01:25 Re-eval      ✓ PASS    ALL PASS   Both batches pass gates
01:25 Promote      ✓ PASS    (none)     Commit both to main
01:27 [LOOP]                            Next batch

Total: 87 minutes | Result: 20 errors fixed (after retry) | Gates: 4/4 pass
```

---

## Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| **Fix rate** | >75% of errors fixed per cycle | (fixed / total) |
| **Gate pass rate** | ≥80% first-pass | (promote_count / total_batches) |
| **Time per cycle** | <50 min | Gate 1 → Promote (serial) |
| **Audit trail completeness** | 100% of fixes traced to packet_key | (with_packet_key / total_fixes) |
| **Regression rate** | 0% new errors from fixes | (new_errors_post_fix / cycle_count) |
| **Dashboard latency** | <5 sec update lag | (dashboard_update / workflow_event) |

---

## Next Steps

1. **Implement Phase A** (ErrorCollection): Parser for svelte-check output → error_logs table
2. **Wire Agent tools** (Phases B-D): LLM agent + packet-search + fix-plan
3. **Deploy dashboard** (Phase F-G): SvelteKit pages + metrics API
4. **Smoke test** (E2E): Run full DAG on known error set, verify all gates
5. **Scale to live**: Monitor production error streams, auto-trigger error-fix-dag

**Success metric**: Running `npm run dev:gpu`, watch error count drop in real time with visible gate decisions.
