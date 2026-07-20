# Daily Graphify Mastra Workflow — Durable Orchestration with Evaluation Gates

**Date**: July 19, 2026  
**Status**: Implementation Complete — Ready for Testing  
**Architecture**: Mastra durable agents with PostgreSQL state persistence, evaluation gates, and temporal DAG phases

---

## Overview

The **Daily Graphify Mastra Workflow** is a durable orchestration layer for the corpus graphification pipeline. It wraps the existing `npm run graphify:daily` stages with:

- **Durable state persistence** (PostgreSQL workflow tables)
- **Resume capability** (`.resume()` continuity across sessions)
- **Parallel domain execution** (CSS || TypeScript || Schema || Route fixes)
- **NLP 7-pass ingestion** (identity → structural → lexical → semantic → relational → materialization → validation)
- **Layered domain classifier** (rules → embedding evidence → supervised model → LLM adjudication)
- **Evaluation gates** (distribution, variance, correlation, diversity — Gate 1-4)
- **Atlas packet identity audit trail** (error_id → packet_key → immutable log)
- **Non-blocking event emission** (RabbitMQ / Redis pubsub)
- **SvelteKit SSE live dashboard** (real-time phase tracking)

---

## Architecture: 7-Phase Temporal DAG

```
[Phase A: Collection]  (2-5 min)
        ↓
[Phase B: Analysis]    (3-8 min)
        ↓
[Phase C: Planning]    (2-5 min)
        ↓
[Phase D: Execution]   (5-15 min, parallel by domain: CSS || TS || Schema || Route)
        ↓
[Phase E: Test]        (3-10 min)
        ↓
[Phase F: Re-evaluate] (2-5 min, Gates 1-4 re-scored)
        ↓
[Phase G: Promote|Rollback] (1-2 min)
        → All gates PASS? Commit to main
        → ANY gate BLOCK? Rollback + replan (Phase C)
        → Max retries: 2 per error cluster, then manual review
```

**Total cycle**: 18-50 minutes (serial), 5-20 minutes (parallel by domain) = ~4× speedup

---

## Phase Details

### Phase A: Error Collection (2-5 min)

**Input**: Audit logs, test failures, linter output  
**Output**: Error catalog (error_id, category, severity, gate_signals)

**Gate**: Gate 1 Distribution Validation  
**Decision**: Proceed if error distribution is balanced (no single category >40%)

**Metrics**:
- Total errors collected
- Distribution by category (CSS, TypeScript, Schema, Route, etc.)
- Severity distribution (CRITICAL, HIGH, MEDIUM, LOW)
- Gate 1 score (target: balanced)

**Implementation**: Query `error_logs` table for 24-hour window, categorize, emit to Redis for Phase B.

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

**Metrics**:
- Cluster count (top 10 by frequency)
- Root cause coverage (% of errors explained)
- Gate 2 score (variance span, target ≥ 2.0)

### Phase C: Agent Planning (2-5 min)

**Input**: Error clusters + fix strategy templates  
**Output**: Atomic fix plan per cluster + affected packet_keys

**Gate**: Gate 3 Feature Correlation  
**Decision**: Proceed if correlation(original_error, fix_efficacy) ≥ 0.30

**Agent Tasks**:
1. Decompose fix into atomic steps (e.g., "fix import → add type → retest")
2. Identify affected source files + test files
3. Generate deterministic fix script (idempotent, testable)
4. Tag with packet_key for audit trail

**Metrics**:
- Plan success rate (% that are syntactically valid)
- Affected packet coverage (target ≥ 50%)
- Gate 3 score (feature correlation vs original error classifier)

### Phase D: Agent Execution (5-15 min per domain, **parallel**)

**Input**: Atomic fix plan  
**Output**: Patched source + patched tests + audit trail

**Gate**: None (execute unconditionally)  
**Parallelization**: By domain (CSS || TS || Schema || Route) — **4 domains in parallel** = ~4× speedup

**Agent Tasks** (per domain):
1. Patch source files (AST-aware for TS, regex for CSS/SQL)
2. Update/create unit tests
3. Log error_id → packet_key → fix_diff_hash for traceability
4. Write to temp branch (not main yet)

**Metrics**:
- Fix success rate per domain (% that compile/lint clean)
- Execution time per domain
- Code churn (lines added/removed)

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

**Metrics**:
- Build status (✅ pass, ❌ fail)
- Test coverage delta (% improved)
- E2E regression count (expected 0)
- Execution time (target <10 min)

### Phase F: Re-evaluation (2-5 min)

**Input**: New error distribution after fixes  
**Output**: Gate 1-4 re-scored

**Gate**: All 4 gates (DECISION POINT)

**Decision Logic**:
- **Gate 1 (Distribution)**: Pass if fix didn't bias toward one category (≤40% in any)
- **Gate 2 (Variance)**: Pass if query variance maintained or improved (span ≥ 2.0)
- **Gate 3 (Correlation)**: Pass if fixed errors ≠ causally related to new errors (r ≥ 0.30)
- **Gate 4 (Diversity)**: Pass if packet_key coverage ≥ 80%

**Decision**:
- **If ALL gates PASS** → Promote (Phase G)
- **If ANY gate BLOCKS** → Rollback + replan (back to Phase C with feedback)

**Metrics**:
- Gate pass/fail per gate
- Reason for any block (which gate, why)
- Re-plan triggering (if rollback)

### Phase G: Promote or Rollback (1-2 min)

**Input**: Gate 6 decision (pass/block)  
**Output**: Commit to main OR revert temp branch

**Promote path** (gates passed):
1. Commit patched code to main with message: `fix(error-fix-dag): <cluster_name> fixes (error_ids: ...)`
2. Log audit trail: `{error_ids, packet_keys, gate_scores_before, gate_scores_after, fix_hash}`
3. Proceed to next error batch (loop)

**Rollback path** (gates blocked):
1. Revert temp branch
2. Log reason + gate feedback
3. Back to Phase C with modified strategy
4. Max retries: 2 per error cluster (then manual review)

**Metrics**:
- Promoted vs rolled-back fixes
- Rollback reasons (gate 1/2/3/4)
- Manual review requests (rate)

---

## Evaluation Gates (Decision Points)

| Gate | Metric | Decision | Block Threshold | Pass Threshold |
|------|--------|----------|-----------------|-----------------|
| **Gate 1: Distribution** | Error category balance | Block if skewed | >40% in one category | ≤40% in all categories |
| **Gate 2: Variance** | Query/error grade span | Block if too narrow | span < 2.0 | span ≥ 2.0 |
| **Gate 3: Correlation** | Pearson r(original, fixed) | Block if uncorrelated | r < 0.30 | r ≥ 0.30 |
| **Gate 4: Diversity** | Packet coverage | Block if overfit | coverage < 80% | coverage ≥ 80% |

**Feedback mechanism**: Gate block reason → AgentPlan adjusts strategy (e.g., "include more TS errors to satisfy Gate 2")

---

## Parallelization Strategy

```
ErrorCollection
  ↓ [split by domain]
  ├─ CSS Fixes (5-15 min) ──────────┐
  ├─ TypeScript Fixes (5-15 min) ───┤
  ├─ Schema Fixes (5-15 min) ────────┤ → Merge at Phase E
  └─ Route Fixes (5-15 min) ────────┘

Total parallel: ~15 min vs serial: ~60 min (4× speedup)
```

**Dependencies**:
- Gate decision (Phase F) waits for all domains to complete Phase E
- No cross-domain code conflicts (assumed by design)

---

## Database Schema

Three tables persist workflow state:

### `graphify_workflow_runs`

```sql
CREATE TABLE graphify_workflow_runs (
  run_id TEXT PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  current_phase VARCHAR(1),
  status VARCHAR(20),
  dry_run BOOLEAN DEFAULT FALSE,
  error_count INTEGER DEFAULT 0,
  gate_scores JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:
- `run_id` — Unique workflow ID (resumable across sessions)
- `current_phase` — A-G (persists progress)
- `status` — RUNNING, COMPLETE, FAILED
- `dry_run` — If true, no side effects
- `gate_scores` — {gate_1: 0.35, gate_2: 2.3, ...}
- `metadata` — Custom phase-specific data

### `graphify_phase_executions`

```sql
CREATE TABLE graphify_phase_executions (
  id SERIAL PRIMARY KEY,
  run_id TEXT REFERENCES graphify_workflow_runs(run_id),
  phase VARCHAR(1),
  status VARCHAR(20),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  input_count INTEGER,
  output_count INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:
- `run_id` — Links to parent run
- `phase` — A-G
- `status` — PASS, FAIL, RUNNING
- `duration_ms` — Execution time
- `input_count`, `output_count` — Throughput metrics
- `error_message` — If FAIL, root cause
- `metadata` — Phase-specific results

### `graphify_evaluation_gates`

```sql
CREATE TABLE graphify_evaluation_gates (
  id SERIAL PRIMARY KEY,
  run_id TEXT REFERENCES graphify_workflow_runs(run_id),
  gate_number INTEGER,
  gate_name VARCHAR(50),
  metric_value FLOAT,
  threshold FLOAT,
  passed BOOLEAN,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:
- `run_id` — Links to parent run
- `gate_number` — 1-4
- `gate_name` — Distribution, Variance, Correlation, Diversity
- `metric_value` — Observed value
- `threshold` — Pass threshold
- `passed` — Boolean decision
- `reason` — Explanation for pass/fail

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

## Usage

### Run a new workflow

```bash
# Dry-run (preview without side effects)
npm run graphify:workflow:mastra:dry

# Apply (real execution)
npm run graphify:workflow:mastra

# Verbose mode (detailed phase traces)
npm run graphify:workflow:mastra:verbose
```

### Resume a workflow

```bash
# Find previous run ID from docs/reports/graphify-workflow/
# E.g., graphify_mastra_1721401234567

# Resume from where it left off
npm run graphify:workflow:mastra --resume=graphify_mastra_1721401234567

# Start from specific phase
npm run graphify:workflow:mastra --start-phase=D --resume=graphify_mastra_1721401234567
```

### Skip evaluation gates (proceed to promote regardless)

```bash
npm run graphify:workflow:mastra --skip-gates
```

---

## Execution Example: Happy Path

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

---

## Execution Example: Rollback

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

## Integration with Existing Graphify Pipeline

The Mastra workflow **wraps and enhances** the existing `npm run graphify:daily` stages:

```
npm run graphify:workflow:mastra
  ├─ Phase A: Error Collection
  │   ├─ Query error_logs
  │   └─ Emit to Redis
  │
  ├─ Phase B: Analysis
  │   ├─ Fetch error_catalog from Redis
  │   ├─ Cluster by root cause
  │   └─ Generate strategies
  │
  ├─ Phase C: Planning
  │   ├─ Fetch error clusters from Redis
  │   ├─ Decompose into atomic steps
  │   └─ Emit fix plans to Redis
  │
  ├─ Phase D: Execution (PARALLEL)
  │   ├─ CSS domain: patch CSS files, update tests
  │   ├─ TS domain: patch TS files, update tests
  │   ├─ Schema domain: patch migrations, update tests
  │   └─ Route domain: patch routes, update tests
  │
  ├─ Phase E: Test & Validation
  │   ├─ npm run typecheck:native
  │   ├─ npm run lint
  │   ├─ npm run test
  │   ├─ npm run test:e2e
  │   └─ Visual regression check
  │
  ├─ Phase F: Re-evaluation
  │   ├─ Gate 1: Distribution (≤40% bias)
  │   ├─ Gate 2: Variance (span ≥ 2.0)
  │   ├─ Gate 3: Correlation (r ≥ 0.30)
  │   └─ Gate 4: Diversity (coverage ≥ 80%)
  │
  └─ Phase G: Promote or Rollback
      ├─ IF all gates PASS → git commit to main
      ├─ IF any gate BLOCK → revert + Phase C (max 2 retries)
      └─ THEN next batch or manual review
```

The Mastra workflow **persists state in PostgreSQL**, allowing:
- **Resume across sessions** (`.resume()` continuity)
- **Audit trail** (every decision logged with timestamps)
- **Gate visibility** (real-time dashboard via SvelteKit)
- **Temporal reasoning** (when was fix N attempted, which gates blocked, what feedback was given)

---

## Next Steps

1. **Test on known error set** (50-100 errors) with `--dry-run`
2. **Validate gate scoring** (confirm thresholds are realistic)
3. **Wire SvelteKit dashboard** (real-time phase tracking, gate signals)
4. **Integrate with error-fix-dag** (Temporal orchestration layer)
5. **Deploy to prod** (monitor success rate, iterate on thresholds)

---

## References

- [TEMPORAL-DAG-AGENTIC-ERROR-FIXING.md](./TEMPORAL-DAG-AGENTIC-ERROR-FIXING.md) — Design blueprint for temporal DAG
- [EVALUATION-DATA-COLLECTION-BLUEPRINT.md](./EVALUATION-DATA-COLLECTION-BLUEPRINT.md) — Gate validation methodology
- `npm run graphify:daily` — Existing stages (Collection, Analyze, Planning, Execution, Test, Re-eval, Promote)
- `docs/reports/graphify-workflow/` — Workflow execution reports (JSON)

