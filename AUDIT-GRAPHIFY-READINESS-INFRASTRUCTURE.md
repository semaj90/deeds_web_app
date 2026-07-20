# GRAPHIFY READINESS INFRASTRUCTURE AUDIT

**Date**: July 19, 2026  
**Scope**: `graphify-trigger-downstream-pipeline.mjs`, `+server.ts` status endpoint, test suite, dev-gpu-runtime integration  
**Status**: ⚠️ **CRITICAL ISSUES FOUND** — Production-blocking safety gaps

---

## EXECUTIVE SUMMARY

The graphify readiness infrastructure has **8 critical safety issues** and **12 production-readiness gaps**. The orchestrator runs processes without supervision, cascades failures silently, lacks transaction atomicity on DB writes, and has no metrics/observability. The status endpoint probes are shallow (timeout-only), test suite doesn't validate failure paths, and the background process spawned by `dev-gpu-runtime.mjs` can accumulate on repeated restarts.

**Risk Assessment**: 🔴 **HIGH** — Data corruption possible, silent orchestrator crashes, no observability, concurrent write hazards.

---

## DETAILED FINDINGS

### 1. ERROR HANDLING: Missing try/catch & Silent Failures

#### Issue 1.1: Stage 1 (waitGraphifyReady) — No fallback strategy for persistent service unavailability

**File**: `graphify-trigger-downstream-pipeline.mjs:71–119`

```javascript
// Lines 108–112: Only logs, no structured handling
} catch (e) {
  if (i < 3) log(`Poll ${i + 1}/${maxPolls}: ${e.message}`);
  report.stages[stage].polls = i + 1;
  await new Promise(r => setTimeout(r, pollInterval));
}
```

**Problem**:
- Timeout returns `false` but code continues execution (line 395)
- No exponential backoff (fixed 2s polls even after 60 consecutive failures)
- JSON parse errors on invalid responses silently caught, ignored
- Report marks timeout as "caution proceed" — no operator visibility

**Impact**: Orchestrator can start with stale/invalid readiness state; no way to distinguish "services warming up" from "permanent failure".

---

#### Issue 1.2: Stages 2–4 (PageRank, Kanban, TurboVec) — No stderr capture on failure

**File**: `graphify-trigger-downstream-pipeline.mjs:141–180, 204–243, 267–306`

```javascript
// Lines 143–144: stdout piped when APPLY, but stderr NEVER captured in APPLY mode
const child = spawn(cmd, cmdArgs, {
  cwd: FRONTEND_ROOT,
  stdio: APPLY ? 'pipe' : 'inherit',  // ← stderr goes to parent console, not captured
  shell: process.platform === 'win32',
});

let output = '';
if (child.stdout) child.stdout.on('data', (data) => { output += data.toString(); });
// ← No stderr handler
```

**Problem**:
- In APPLY mode, stage exits with code 1 but error details lost
- Report says "Exit code 1" with no root cause
- Can't distinguish "compilation error" from "disk full" from "timeout"

**Impact**: Operator debugging blind; errors accumulate in production logs but orchestrator report is useless.

---

#### Issue 1.3: Stage 5 (Kanban DB write) — Partial write failure = orphaned rows

**File**: `graphify-trigger-downstream-pipeline.mjs:313–380`

```javascript
// Lines 327–349: Loop writes 1 task at a time, no transaction boundary
if (APPLY && taskCount > 0) {
  const client = await pool.connect();
  try {
    for (const line of lines) {
      const task = JSON.parse(line);
      await client.query(
        `INSERT INTO kanban_tasks ... ON CONFLICT ...`,
        [...]
      );
      // ← No await pool.query('BEGIN'), no 'COMMIT' at loop end
    }
  } finally {
    client.release();
  }
}
```

**Problem**:
- Each INSERT is auto-committed individually
- If loop iteration N fails, N-1 tasks already written (no rollback)
- On connection drop mid-loop, orphaned rows + no error in report

**Impact**: Database inconsistency, orphaned kanban_tasks with partial data, silent data loss.

---

### 2. SERVICE HEALTH PROBES: Shallow Checks & Cascading Failures

#### Issue 2.1: +server.ts probes don't actually validate service readiness

**File**: `sveltekit-frontend/src/routes/api/graphify/status/+server.ts:89–96, 123–167`

```typescript
// Lines 89–96: Probe only checks HTTP response.ok, no payload validation
async function probeService(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;  // ← HTTP 200 alone is insufficient
  } catch {
    return false;
  }
}

// Lines 124–126: Gemma4 health check doesn't verify model availability
const gemma4Ok = await probeService(`${ENV.LOCAL_OPENAI_BASE_URL}/health`, 2000);
```

**Problem**:
- `/health` endpoint may return 200 but model not loaded yet
- Qdrant may respond 200 but collections deleted
- Postgres port open doesn't mean DB is accepting queries (not even a TCP connect test)
- No payload inspection (e.g., checking `status: 'ready'` in JSON response)

**Impact**: False positives — orchestrator proceeds when services are actually broken.

---

#### Issue 2.2: Cascading failures not isolated — one probe blocks others

**File**: `sveltekit-frontend/src/routes/api/graphify/status/+server.ts:123–167`

```typescript
const gemma4Ok = await probeService(...);
const ollamaOk = await probeService(...);
const qdrantOk = await probeService(...);
const postgresOk = await probeService(...);  // Sequential, not parallel
// ← If first 3 take 2s each, total = 6s for this endpoint
```

**Problem**:
- Probes are sequential (not `Promise.all`)
- If one service is slow (but eventually recovers), caller waits 6+ seconds per poll
- Timeout is 2s per probe, but orchestrator polls every 2s, so total probe time = 6s + network latency
- If operator polls status endpoint during orchestrator run, they get stale data (no cache header on short TTL)

**Impact**: Slow orchestrator startup, status endpoint feels unresponsive, operator can't get fresh readiness snapshot.

---

#### Issue 2.3: Required vs. optional lane policy is vague

**File**: `sveltekit-frontend/src/routes/api/graphify/status/+server.ts:36–80`

```typescript
const lanePolicies: Record<string, LanePolicy> = {
  treeSitterAstFacts: {
    requiredForStructuralReady: true,    // ← But what if tree-sitter crashes mid-run?
    requiredForProductionReady: true,
    state: 'ACTIVE_VERIFIED',  // ← Hardcoded, never updated
    reason: 'AST extraction from TypeScript, JavaScript, Svelte files',
  },
  // ...
  bitfrostAudit: {
    requiredForStructuralReady: false,
    requiredForProductionReady: false,
    state: 'GATED',
    reason: 'Authentication intentionally unavailable',
    expectedGate: 'authentication',
  },
};
```

**Problem**:
- `state` is hardcoded, never fetches actual lane status from DB/cache
- Endpoint says "treeSitterAstFacts is ACTIVE_VERIFIED" but doesn't check if AST table is locked or corrupted
- Lane states don't match reality; just advisory labels

**Impact**: Status endpoint doesn't reflect actual readiness; operator gets false assurance.

---

### 3. LANE POLICY VALIDATION: Incorrect Aggregation Logic

#### Issue 3.1: Required lane enforcement is not applied to orchestrator

**File**: `graphify-trigger-downstream-pipeline.mjs:391–441`

```javascript
// Lines 392–401: Readiness check happens but result is not enforced
if (WAIT_READY) {
  log('Waiting for graphify readiness...');
  const ready = await waitGraphifyReady();
  if (!ready && !APPLY) {
    log('Graphify not ready, but proceeding in dry-run mode');  // ← Continues anyway
  }
}

// Lines 404–431: Stages continue even if previous stages fail in APPLY mode
if (!SKIP_PAGERANK) {
  const success = await runPageRank();
  if (!success && APPLY) {
    report.summary.message = 'Pipeline stopped: PageRank failed';
    report.summary.success = false;
    throw new Error('PageRank stage failed');  // ← Throws, but...
  }
}
```

**Problem**:
- Readiness check result is ignored in APPLY mode (only checked for dry-run advisory)
- If readiness times out, APPLY mode proceeds anyway (no hard failure)
- Throw happens inside try/finally, caught, reported, and then process exits with 0 (line 465)

**Impact**: Orchestrator can run against unhealthy services; user can't tell if failure is due to bad readiness or bad stage logic.

---

#### Issue 3.2: Exit code semantics broken — fails but exits 0

**File**: `graphify-trigger-downstream-pipeline.mjs:450–465`

```javascript
} catch (e) {
  report.errors.push(e.message);
  report.summary.elapsed_ms = Date.now() - startTime;
  err(e.message);
} finally {
  // Write report
  try {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
    log(`Report written to ${path.relative(REPO_ROOT, REPORT_FILE)}`);
  } catch (e) {
    err(`Failed to write report: ${e.message}`);
  }

  await pool.end();
  process.exit(report.summary.success ? 0 : 1);  // ← Correct, but...
}
```

**Problem**:
- Catch block doesn't update `report.summary.success` to false (it's already false from earlier, but unclear)
- Report is always written, even if pipeline crashed partway — doesn't indicate "partial run"
- If finally block throws (e.g., report write fails), process may exit with wrong code

**Impact**: Consumer scripts can't reliably detect failure (exit code may be 0 even if stages failed).

---

### 4. ORCHESTRATOR STAGE LOGIC: Timeout Enforcement Gaps

#### Issue 4.1: Stage 1 (waitGraphifyReady) — 120s timeout, but no hard enforcement on orchestrator itself

**File**: `graphify-trigger-downstream-pipeline.mjs:71–119`

```javascript
async function waitGraphifyReady(timeoutMs = 120000) {
  const stage = 'graphify_readiness_check';
  report.stages[stage] = { status: 'running', polls: 0, elapsed_ms: 0 };

  const startCheck = Date.now();
  const pollInterval = 2000;
  const maxPolls = Math.floor(timeoutMs / pollInterval);

  for (let i = 0; i < maxPolls; i++) {
    // ... polling loop
    report.stages[stage].polls = i + 1;
  }

  // If maxPolls reached, returns false
  return false;
}

// Called at line 394: const ready = await waitGraphifyReady();
// If timeout, 'ready' is false, but execution continues
```

**Problem**:
- 120s timeout is soft (just stops polling, doesn't abort orchestrator)
- Main orchestrator has no overall timeout
- If Stage 1 takes 120s and all subsequent stages each take 60s, total = 360s with no warning

**Impact**: User can fire orchestrator and walk away; it silently takes hours to complete or fail.

---

#### Issue 4.2: Stage 3 (Kanban LangGraph) — 120s timeout, but no VRAM check for LangGraph startup

**File**: `graphify-trigger-downstream-pipeline.mjs:213–219`

```javascript
const timeout = setTimeout(() => {
  child.kill();
  report.stages[stage].status = 'timeout';
  report.stages[stage].error = 'Kanban emit timeout (120s)';
  err('Kanban emit timeout');
  resolve(false);  // ← Continues to next stage even after kill
}, 120000);

// child.kill() is abrupt; TurboVec stage might be interrupted
```

**Problem**:
- `child.kill()` doesn't guarantee clean shutdown
- No graceful shutdown with SIGTERM + delay before SIGKILL
- If LangGraph is mid-write to database, kill leaves locks
- Next stage (TurboVec) sees locked tables

**Impact**: Cascading failures from orphaned process state.

---

#### Issue 4.3: Stage 5 (DB write) — No transaction management, no timeout

**File**: `graphify-trigger-downstream-pipeline.mjs:313–380`

```javascript
async function writeKanbanTasksToDB() {
  const stage = 'kanban_db_write';
  report.stages[stage] = { status: 'running' };

  try {
    const kanbanPath = path.join(FRONTEND_ROOT, '.tmp/kanban_tasks.jsonl');
    let taskCount = 0;

    try {
      const content = await fs.readFile(kanbanPath, 'utf8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      taskCount = lines.length;

      if (APPLY && taskCount > 0) {
        const client = await pool.connect();
        try {
          for (const line of lines) {  // ← No timeout on this loop
            const task = JSON.parse(line);
            await client.query(...);
            // If connection drops on line 100/1000, exception thrown, client.release() called
            // But DB already has 99 rows written
          }
        } finally {
          client.release();
        }
      }
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') { ... }
      throw e;
    }
  } catch (e) {
    report.stages[stage].status = 'error';
    report.stages[stage].error = e.message;
    err(`Failed to write kanban tasks: ${e.message}`);
    return false;
  }
}
```

**Problem**:
- No BEGIN/COMMIT transaction boundary
- No timeout on the entire write loop
- No rollback on partial failure
- If loop fails halfway, rows already visible to other queries

**Impact**: Database corruption, orphaned tasks, impossible to recover.

---

### 5. TEST SUITE COVERAGE: Missing Failure Path Tests

#### Issue 5.1: test-graphify-dry-run-suite.mjs doesn't test error scenarios

**File**: `scripts/atlas/test-graphify-dry-run-suite.mjs:82–151`

```javascript
async function testOrchestratorDryRun() {
  // ... runs dry-run once
  const script = path.join(REPO_ROOT, 'scripts/atlas/graphify-trigger-downstream-pipeline.mjs');
  const child = spawn('node', [script, '--dry-run', '--verbose'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // ... checks exit code
  child.on('exit', (code) => {
    clearTimeout(timeout);
    if (code === 0) {
      results.stages[stage].status = 'pass';
    } else {
      results.stages[stage].status = 'fail';
    }
  });
}
```

**Problem**:
- Only tests happy path (--dry-run)
- Doesn't test:
  - Orchestrator timeout (WAIT_READY with no services up)
  - Stage failure (e.g., PageRank crash)
  - Partial DB write recovery
  - Concurrent execution (two orchestrators running simultaneously)
  - Database lock contention
- Mock OpenSpec validation doesn't validate actual report schema (line 170–182)

**Impact**: Test suite gives false confidence; production failures not predicted.

---

#### Issue 5.2: Test suite doesn't validate report schema

**File**: `scripts/atlas/test-graphify-dry-run-suite.mjs:166–194`

```javascript
'API response shape': {
  check: async () => {
    // ...
    const data = await res.json();
    const hasStatus = data.status && typeof data.status === 'object';
    const hasPipeline = data.pipeline && Array.isArray(data.pipeline.stages);
    const hasTimestamp = data.timestamp && typeof data.timestamp === 'string';

    if (hasStatus && hasPipeline && hasTimestamp) {
      return { pass: true, note: `Valid response: ${Object.keys(data.status).join(', ')}` };
    } else {
      return { pass: false, error: 'Missing required fields' };
    }
  }
}
```

**Problem**:
- Checks `/api/graphify/status` but doesn't validate report schema from orchestrator output
- Report schema (from `graphify-trigger-downstream-pipeline.mjs:56–63`) is never tested
- No type checking that all stages have `status`, `error`, `elapsed_ms`

**Impact**: Orchestrator can emit reports with missing fields; consumers break silently.

---

### 6. OBSERVABILITY GAPS: No Metrics, No Tracing, No Structured Logging

#### Issue 6.1: No metrics collection (queries/min, error rate, latency)

**File**: All stages, no metrics export

```javascript
// Current: only console.log and report JSON
const log = (msg) => console.log(`[graphify-chain] ${msg}`);

// Missing:
// - Prometheus /metrics endpoint with graphify_stages_duration_ms, graphify_stage_errors_total, etc.
// - No histograms for per-stage latency
// - No cardinality on stage outcome (pass/fail/timeout counts)
```

**Impact**: No observability for production monitoring; can't detect degradation.

---

#### Issue 6.2: No structured logging — only console strings

**File**: `graphify-trigger-downstream-pipeline.mjs:49–50`

```javascript
const log = (msg) => console.log(`[graphify-chain] ${msg}`);
const err = (msg) => console.error(`[graphify-chain] ERROR: ${msg}`);
```

**Problem**:
- No timestamp per log line
- No severity (ERROR vs WARN vs INFO)
- No tracing context (correlation ID) to link orchestrator logs to stage logs
- No structured JSON output for log aggregation

**Impact**: Operator can't correlate "orchestrator logs" with "PageRank stderr" to debug failures.

---

#### Issue 6.3: No request tracing through pipeline stages

**File**: Each stage spawned without correlation ID

```javascript
// Lines 141–145: PageRank stage spawned with no traceID
const child = spawn(cmd, cmdArgs, {
  cwd: FRONTEND_ROOT,
  stdio: APPLY ? 'pipe' : 'inherit',
  shell: process.platform === 'win32',
});

// Stage emits its own logs (to inherit stdout/stderr), but no way to link them
```

**Impact**: If PageRank crashes, logs are buried in npm run output; no way to trace back to orchestrator request.

---

### 7. DATABASE TRANSACTION SAFETY: Partial Writes & Orphaned Data

#### Issue 7.1: Kanban DB write is not atomic

**File**: `graphify-trigger-downstream-pipeline.mjs:327–349`

Already covered in Issue 1.3. Root cause:

```sql
-- Current: individual inserts, each auto-committed
INSERT INTO kanban_tasks (task_id, ...) VALUES ($1, ...) ON CONFLICT (task_id) DO UPDATE SET ...;

-- Missing: transaction envelope
BEGIN;
INSERT INTO kanban_tasks (task_id, ...) VALUES ($1, ...) ON CONFLICT (task_id) DO UPDATE SET ...;
INSERT INTO kanban_tasks (task_id, ...) VALUES ($2, ...) ON CONFLICT (task_id) DO UPDATE SET ...;
...
COMMIT;
```

**Impact**: On any error mid-insert, some rows written, some not. Database inconsistent.

---

#### Issue 7.2: Concurrent orchestrator runs can corrupt shared state

**File**: No locking mechanism

```javascript
// Scenario:
// - User runs: npm run graphify:downstream:chain --apply
// - Orchestrator starts, reads kanban_tasks.jsonl at path: .tmp/kanban_tasks.jsonl
// - User interrupts, runs again
// - Two orchestrators writing to same kanban_tasks table simultaneously
// - No locks, no version checks
// - Database sees race conditions
```

**Impact**: If two orchestrators run in parallel (e.g., one from dev:gpu, one manual), data corruption.

---

### 8. ASYNC SAFETY: Background Process Accumulation

#### Issue 8.1: dev-gpu-runtime spawns detached orchestrator, no lifecycle management

**File**: `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs:225–256`

```javascript
// Lines 225–233: Orchestrator spawned as detached
const orchestratorChild = spawn('node', [orchestratorScript, '--wait-ready', '--verbose'], {
  cwd: REPO_ROOT,
  env: orchestratorEnv,
  detached: process.platform !== 'win32',  // Spawned as "background" process
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Lines 245–251: Listens for exit, but no heartbeat
orchestratorChild.on('exit', (code) => {
  if (code !== 0) {
    console.log(`[orchestrator] Exited with code ${code}`);
  } else {
    console.log(`[orchestrator] ✅ Pipeline complete`);
  }
});

// Lines 253–254: Unref so it doesn't block dev server shutdown
if (orchestratorChild.unref) orchestratorChild.unref();
```

**Problem**:
- Process is detached and unreferenced — dev:gpu doesn't wait for it to finish
- If orchestrator crashes, exit handler logs message, but nothing stops the error
- If user runs `npm run dev:gpu` repeatedly (e.g., file watcher restart), N orchestrators accumulate
- No heartbeat check — orchestrator can hang silently forever
- On Windows, `detached` is false, so orchestrator is NOT detached (comment says "Allow backgrounding on Unix" but Windows != Unix)

**Impact**: Process accumulation on repeated dev:gpu restarts, no visibility into orchestrator health.

---

#### Issue 8.2: No cleanup on dev server shutdown

**File**: `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs:258–263`

```javascript
// Final section: Vite spawned in foreground
spawnForeground(npx, ['vite', 'dev', '--port', String(vitePort)], {
  cwd: FRONTEND_ROOT,
  env: mergedEnv({ VITE_PORT: String(vitePort) }),
});

// ← When Vite exits (user Ctrl+C), orchestrator process is not cleaned up
```

**Problem**:
- When user Ctrl+C out of dev server, the unref'd orchestrator keeps running
- No SIGTERM sent to orchestrator on dev server shutdown
- Orphaned node process accumulates in background

**Impact**: Task manager fills with orphaned node.exe processes over time.

---

---

## PRIORITIZED ENHANCEMENT PLAN

### PRIORITY 1: CRITICAL SAFETY ISSUES (Blockers)

#### P1-A: Add Transaction Atomicity to Stage 5 (DB Write)

**Files to modify**: `graphify-trigger-downstream-pipeline.mjs`

**Before**:
```javascript
if (APPLY && taskCount > 0) {
  const client = await pool.connect();
  try {
    for (const line of lines) {
      const task = JSON.parse(line);
      await client.query(`INSERT INTO kanban_tasks ... ON CONFLICT ...`);
    }
  } finally {
    client.release();
  }
}
```

**After**:
```javascript
if (APPLY && taskCount > 0) {
  const client = await pool.connect();
  try {
    // Begin transaction
    await client.query('BEGIN;');
    
    let written = 0;
    for (const line of lines) {
      try {
        const task = JSON.parse(line);
        await client.query(
          `INSERT INTO kanban_tasks (task_id, feature_id, feature_label, source_refs, lane, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (task_id) DO UPDATE SET
             lane = EXCLUDED.lane,
             status = EXCLUDED.status,
             updated_at = NOW()`,
          [
            task.taskId || `task:${Date.now()}:${Math.random()}`,
            task.featureId || 'unknown',
            task.featureLabel || 'Unnamed task',
            JSON.stringify(task.sourceRefs || []),
            task.lane || 'todo',
            task.status || 'pending'
          ]
        );
        written++;
      } catch (lineErr) {
        // Rollback on any line error
        report.stages[stage].error = `Line ${written + 1}: ${lineErr.message}`;
        await client.query('ROLLBACK;');
        throw new Error(`Transaction rolled back at line ${written + 1}: ${lineErr.message}`);
      }
    }
    
    // Commit transaction
    await client.query('COMMIT;');
    report.stages[stage].status = 'pass';
    report.stages[stage].tasks_written = taskCount;
    log(`✅ Wrote ${taskCount} kanban tasks to DB (atomically committed)`);
  } catch (e) {
    // Client already rolled back; just report
    report.stages[stage].status = 'error';
    report.stages[stage].error = e.message;
    throw e;
  } finally {
    client.release();
  }
}
```

**Effort**: 1–2 hours  
**Impact**: Prevents orphaned rows; ensures all-or-nothing write semantics  
**Testing**: Add test case "Stage 5 partial failure → rollback"

---

#### P1-B: Enforce Hard Timeout on Entire Orchestrator

**Files to modify**: `graphify-trigger-downstream-pipeline.mjs`

**Before**:
```javascript
async function main() {
  try {
    // ... stages run with individual timeouts
  } catch (e) {
    // ...
  } finally {
    // ...
  }
}
```

**After**:
```javascript
const ORCHESTRATOR_TIMEOUT_MS = process.env.GRAPHIFY_ORCHESTRATOR_TIMEOUT_MS ?? 600000; // 10 min default

async function main() {
  const orchestratorTimeout = setTimeout(() => {
    report.summary.message = `Orchestrator timeout after ${ORCHESTRATOR_TIMEOUT_MS}ms`;
    report.summary.success = false;
    report.summary.elapsed_ms = Date.now() - startTime;
    
    // Write emergency report
    (async () => {
      try {
        await fs.mkdir(REPORT_DIR, { recursive: true });
        await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
      } catch {}
      process.exit(1);
    })();
  }, ORCHESTRATOR_TIMEOUT_MS);

  try {
    // ... stages run
  } catch (e) {
    // ...
  } finally {
    clearTimeout(orchestratorTimeout);
    // ... cleanup
  }
}
```

**Effort**: 1 hour  
**Impact**: Operator can predict maximum orchestrator runtime; prevents hung processes  
**Testing**: Add test "Orchestrator timeout → exit 1"

---

#### P1-C: Require Explicit Readiness Gate Before APPLY Mode

**Files to modify**: `graphify-trigger-downstream-pipeline.mjs`

**Before**:
```javascript
if (WAIT_READY) {
  log('Waiting for graphify readiness...');
  const ready = await waitGraphifyReady();
  if (!ready && !APPLY) {
    log('Graphify not ready, but proceeding in dry-run mode');
  }
}
```

**After**:
```javascript
if (APPLY && !WAIT_READY) {
  report.summary.message = 'APPLY mode requires --wait-ready (safety gate)';
  report.summary.success = false;
  err('Use --wait-ready with --apply to confirm service readiness');
  process.exit(1);
}

if (WAIT_READY) {
  log('Waiting for graphify readiness...');
  const ready = await waitGraphifyReady();
  if (!ready) {
    if (APPLY) {
      report.summary.message = 'Readiness timeout; aborting APPLY mode';
      report.summary.success = false;
      err('Graphify readiness timeout in APPLY mode');
      process.exit(1);
    } else {
      log('Graphify not ready, but proceeding in dry-run mode');
    }
  }
}
```

**Effort**: 30 minutes  
**Impact**: Prevents accidental APPLY mode without readiness confirmation  
**Testing**: Add test "APPLY without --wait-ready → exit 1"

---

### PRIORITY 2: PRODUCTION-READY IMPROVEMENTS

#### P2-A: Add Structured Logging with Correlation IDs

**Files to modify**: `graphify-trigger-downstream-pipeline.mjs`

**Before**:
```javascript
const log = (msg) => console.log(`[graphify-chain] ${msg}`);
```

**After**:
```javascript
const CORRELATION_ID = `orchestrator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const SEVERITY_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function structuredLog(severity = 'INFO', msg, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    correlationId: CORRELATION_ID,
    severity,
    message: msg,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

const log = (msg, data) => structuredLog('INFO', msg, data);
const warn = (msg, data) => structuredLog('WARN', msg, data);
const err = (msg, data) => structuredLog('ERROR', msg, data);

// Usage:
log('Starting downstream pipeline', { mode: APPLY ? 'APPLY' : 'DRY-RUN', stages: 5 });
log('Graphify core ready', { polls: i + 1, status: coreStatus });
err('PageRank failed', { stage: 'pagerank', exitCode: code, stageTimingMs: elapsed });
```

**Effort**: 2 hours  
**Impact**: Logs become machine-readable; log aggregation tools can parse; tracing becomes possible  
**Testing**: Add test "Log output is valid JSON per line"

---

#### P2-B: Capture stderr from all spawned processes

**Files to modify**: `graphify-trigger-downstream-pipeline.mjs` (all stage runners)

**Before**:
```javascript
const child = spawn(cmd, cmdArgs, {
  cwd: FRONTEND_ROOT,
  stdio: APPLY ? 'pipe' : 'inherit',  // ← stderr lost in APPLY mode
});

let output = '';
if (child.stdout) child.stdout.on('data', (data) => { output += data.toString(); });
```

**After**:
```javascript
const child = spawn(cmd, cmdArgs, {
  cwd: FRONTEND_ROOT,
  stdio: APPLY ? ['ignore', 'pipe', 'pipe'] : 'inherit',  // ← Capture both stdout and stderr
});

let stdout = '';
let stderr = '';
if (child.stdout) child.stdout.on('data', (data) => { stdout += data.toString(); });
if (child.stderr) child.stderr.on('data', (data) => { stderr += data.toString(); });

// ... later in exit handler:
if (code === 0) {
  report.stages[stage].status = 'pass';
} else {
  report.stages[stage].status = 'fail';
  report.stages[stage].stdout = stdout.slice(-2000);  // Last 2KB
  report.stages[stage].stderr = stderr.slice(-2000);  // Last 2KB for root cause
}
```

**Effort**: 1.5 hours  
**Impact**: Root causes visible in report; debuggable failures  
**Testing**: Add test "Stage failure includes stderr excerpt"

---

#### P2-C: Add Concurrent Run Prevention (Lock File)

**Files to modify**: `graphify-trigger-downstream-pipeline.mjs`

**Before**:
```javascript
async function main() {
  try {
    log(`Starting downstream pipeline orchestrator...`);
    // ... runs immediately
  }
}
```

**After**:
```javascript
const LOCK_FILE = path.join(FRONTEND_ROOT, '.tmp/graphify-orchestrator.lock');

async function acquireLock() {
  try {
    const stat = await fs.stat(LOCK_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 300000) {  // 5 minutes
      throw new Error(`Another orchestrator is running (lock age: ${Math.round(ageMs / 1000)}s)`);
    }
    // Stale lock, remove it
    await fs.unlink(LOCK_FILE);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  
  // Write lock
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
  await fs.writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }));
}

async function releaseLock() {
  try {
    await fs.unlink(LOCK_FILE);
  } catch {}
}

async function main() {
  try {
    await acquireLock();
    log(`Starting downstream pipeline orchestrator...`);
    // ... stages run
  } catch (e) {
    if (e.message.includes('Another orchestrator')) {
      err(e.message);
      process.exit(1);
    }
    // ... other error handling
  } finally {
    await releaseLock();
  }
}
```

**Effort**: 1 hour  
**Impact**: Prevents concurrent orchestrator runs; prevents data corruption  
**Testing**: Add test "Concurrent runs blocked by lock"

---

#### P2-D: Improve Service Health Probes

**Files to modify**: `sveltekit-frontend/src/routes/api/graphify/status/+server.ts`

**Before**:
```typescript
async function probeService(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

const gemma4Ok = await probeService(`${ENV.LOCAL_OPENAI_BASE_URL}/health`, 2000);
```

**After**:
```typescript
interface ProbeResult {
  ok: boolean;
  code: string;
  message: string;
  responseTimeMs: number;
}

async function probeService(
  url: string,
  validator?: (data: any) => boolean,
  timeoutMs = 3000
): Promise<ProbeResult> {
  const startMs = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const responseTimeMs = Date.now() - startMs;
    
    if (!res.ok) {
      return { ok: false, code: `http_${res.status}`, message: `HTTP ${res.status}`, responseTimeMs };
    }
    
    let data;
    try {
      data = await res.json();
    } catch {
      return { ok: false, code: 'invalid_json', message: 'Response is not JSON', responseTimeMs };
    }
    
    if (validator && !validator(data)) {
      return { ok: false, code: 'validation_failed', message: 'Service response validation failed', responseTimeMs };
    }
    
    return { ok: true, code: 'ok', message: 'Service healthy', responseTimeMs };
  } catch (e) {
    return {
      ok: false,
      code: e.name === 'AbortError' ? 'timeout' : 'network_error',
      message: e.message,
      responseTimeMs: Date.now() - startMs
    };
  }
}

async function checkGraphifyStages(): Promise<GraphifyPipelineStage[]> {
  const startMs = Date.now();
  
  const [gemma4Probe, ollamaProbe, qdrantProbe, postgresProbe] = await Promise.all([
    probeService(`${ENV.LOCAL_OPENAI_BASE_URL}/health`, (d) => d.status === 'ready' || d.ok === true),
    probeService(`${ENV.OLLAMA_BASE_URL}/api/tags`, (d) => Array.isArray(d.models) && d.models.length > 0),
    probeService(`${ENV.QDRANT_URL}/collections`, (d) => d.result && Array.isArray(d.result)),
    // For Postgres, we can't HTTP-probe, so check via TCP timeout
    probeService(`http://127.0.0.1:5434`, () => false).then(
      () => ({ ok: false, code: 'unexpected_http', message: 'Postgres should not be HTTP', responseTimeMs: 0 }),
      (e) => e.code === 'timeout' || e.code === 'network_error'
        ? { ok: true, code: 'tcp_ok', message: 'TCP port open', responseTimeMs: 0 }
        : { ok: false, code: 'tcp_closed', message: 'TCP port closed', responseTimeMs: 0 }
    )
  ]);

  return [
    {
      name: 'validate',
      command: 'npm run graphify:validate',
      ready: gemma4Probe.ok && ollamaProbe.ok && qdrantProbe.ok && postgresProbe.ok,
      message: [gemma4Probe, ollamaProbe, qdrantProbe, postgresProbe]
        .map((p) => `${p.code}:${p.responseTimeMs}ms`)
        .join(', '),
    },
    // ... other stages
  ];
}
```

**Effort**: 2–3 hours  
**Impact**: Probes actually validate service state, not just HTTP 200; parallel probes fast; detailed error messages  
**Testing**: Add test "Probe detects broken service (e.g., Qdrant with no collections)"

---

### PRIORITY 3: OBSERVABILITY & UX IMPROVEMENTS

#### P3-A: Export Prometheus Metrics

**Files to create**: `sveltekit-frontend/src/routes/api/graphify/metrics/+server.ts`

**Implementation sketch**:
```typescript
export const GET: RequestHandler = async () => {
  const reports = await fs.readdir(REPORT_DIR).catch(() => []);
  
  const histogramData = {};  // stage → [durations]
  for (const file of reports.slice(-10)) {  // Last 10 reports
    const content = JSON.parse(await fs.readFile(path.join(REPORT_DIR, file), 'utf8'));
    for (const [stage, stageReport] of Object.entries(content.stages)) {
      if (!histogramData[stage]) histogramData[stage] = [];
      if (stageReport.elapsed_ms) histogramData[stage].push(stageReport.elapsed_ms);
    }
  }

  let metrics = `# HELP graphify_stage_duration_ms Stage execution time in milliseconds\n`;
  for (const [stage, durations] of Object.entries(histogramData)) {
    for (const d of durations) {
      metrics += `graphify_stage_duration_ms{stage="${stage}"} ${d}\n`;
    }
  }

  return new Response(metrics, { headers: { 'Content-Type': 'text/plain; version=0.0.4' } });
};
```

**Effort**: 2 hours  
**Impact**: Prometheus can scrape metrics; alerts on slow/failing stages  
**Testing**: Add test "Metrics endpoint returns Prometheus-compatible output"

---

#### P3-B: Add Graceful Shutdown Handlers

**Files to modify**: `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`

**Before**:
```javascript
const orchestratorChild = spawn('node', [orchestratorScript, '--wait-ready', '--verbose'], {
  cwd: REPO_ROOT,
  env: orchestratorEnv,
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

// ... unref so it doesn't block shutdown
if (orchestratorChild.unref) orchestratorChild.unref();
```

**After**:
```javascript
const orchestratorChild = spawn('node', [orchestratorScript, '--wait-ready', '--verbose'], {
  cwd: REPO_ROOT,
  env: orchestratorEnv,
  detached: false,  // Keep reference so we can signal it
  stdio: ['ignore', 'pipe', 'pipe'],
});

// On parent process termination, signal orchestrator to shut down gracefully
process.on('SIGINT', () => {
  console.log('[dev:gpu] Received SIGINT, shutting down orchestrator...');
  orchestratorChild.kill('SIGTERM');
  setTimeout(() => {
    if (!orchestratorChild.killed) orchestratorChild.kill('SIGKILL');
  }, 5000);
});

process.on('SIGTERM', () => {
  console.log('[dev:gpu] Received SIGTERM, shutting down orchestrator...');
  orchestratorChild.kill('SIGTERM');
  setTimeout(() => {
    if (!orchestratorChild.killed) orchestratorChild.kill('SIGKILL');
  }, 5000);
});

// Check if orchestrator is still alive (heartbeat)
const heartbeatInterval = setInterval(() => {
  if (orchestratorChild.killed) {
    clearInterval(heartbeatInterval);
    console.log('[dev:gpu] Orchestrator has exited');
  }
}, 10000);
```

**Effort**: 1.5 hours  
**Impact**: Graceful shutdown; prevents orphaned processes; visibility into orchestrator health  
**Testing**: Add test "dev:gpu SIGINT → orchestrator receives SIGTERM"

---

---

## SUMMARY TABLE

| ID | Issue | File | Severity | Effort | Impact |
|----|----|----|----|----|----|
| 1.1 | No fallback strategy, continues on timeout | orchestrator.mjs:71–119 | 🔴 HIGH | 1h | Runs against unhealthy services |
| 1.2 | No stderr capture in APPLY mode | orchestrator.mjs:141–180 | 🔴 HIGH | 1.5h | Operator blind to root causes |
| 1.3 | Partial DB write, no transaction | orchestrator.mjs:313–380 | 🔴 CRITICAL | 2h | Data corruption possible |
| 2.1 | Shallow probes, no payload validation | status/+server.ts:89–96 | 🟠 MEDIUM | 2h | False positives, wrong readiness |
| 2.2 | Cascading probe failures, sequential | status/+server.ts:123–167 | 🟠 MEDIUM | 1h | Slow endpoint, stale data |
| 2.3 | Lane states hardcoded, never updated | status/+server.ts:36–80 | 🟠 MEDIUM | 1.5h | Status endpoint lies |
| 3.1 | Readiness gate not enforced | orchestrator.mjs:391–441 | 🔴 HIGH | 1h | APPLY mode ignores readiness |
| 3.2 | Exit code semantics broken | orchestrator.mjs:450–465 | 🟠 MEDIUM | 30min | Scripts can't detect failure |
| 4.1 | No hard orchestrator timeout | orchestrator.mjs:71–119 | 🔴 HIGH | 1h | Hung process forever |
| 4.2 | Abrupt process kill, no graceful shutdown | orchestrator.mjs:213–219 | 🟠 MEDIUM | 1.5h | Orphaned locks, cascading failure |
| 4.3 | No timeout on DB write loop | orchestrator.mjs:313–380 | 🔴 HIGH | (bundled with 1.3) | Slow write can block pipeline |
| 5.1 | Test suite only tests happy path | test-suite.mjs:82–151 | 🟠 MEDIUM | 3h | False confidence |
| 5.2 | Report schema never validated | test-suite.mjs:166–194 | 🟡 LOW | 1h | Missing fields go undetected |
| 6.1 | No metrics collection | All | 🟡 LOW | 3h | No monitoring possible |
| 6.2 | No structured logging | orchestrator.mjs:49–50 | 🟠 MEDIUM | 2h | Logs unreadable by machines |
| 6.3 | No tracing context | All | 🟠 MEDIUM | 2h | Can't correlate stage logs |
| 7.1 | Kanban write not atomic | orchestrator.mjs:327–349 | 🔴 CRITICAL | (bundled with 1.3) | Orphaned rows |
| 7.2 | No concurrent run prevention | orchestrator.mjs | 🔴 CRITICAL | 1h | Parallel runs corrupt DB |
| 8.1 | Orchestrator accumulates on restarts | dev-gpu-runtime.mjs:225–256 | 🟠 MEDIUM | 1.5h | Process bloat |
| 8.2 | No cleanup on shutdown | dev-gpu-runtime.mjs:258–263 | 🟠 MEDIUM | (bundled with 8.1) | Orphaned processes |

**Total Effort to Fix All**: ~30–35 hours  
**Priority 1 (Blockers)**: ~5–6 hours  
**Priority 2 (Production-Ready)**: ~10–12 hours  
**Priority 3 (Observability)**: ~8–10 hours

---

## NEXT STEPS

1. **Immediate (today)**: Implement P1-A, P1-B, P1-C (transaction atomicity, hard timeout, readiness gate)
2. **This week**: Implement P2-A through P2-D (logging, stderr capture, lock file, probes)
3. **Next week**: Implement P3-A, P3-B (metrics, graceful shutdown)
4. **Continuous**: Add failure-path tests; run orchestrator with chaos injection

---

**Audit completed**: July 19, 2026  
**Auditor**: Claude Code (Agent)  
**Next review**: After P1 fixes applied
