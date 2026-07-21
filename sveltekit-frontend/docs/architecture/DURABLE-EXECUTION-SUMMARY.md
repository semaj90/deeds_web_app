# Durable Execution Architecture — Quick Summary

**Status**: Design Complete | **Phase**: Implementation Ready (Week 1)  
**For**: Atlas agentic workflows (error-repair, feature-synthesis, retrieval-ranking)  
**Problem Solved**: Crash recovery without duplicate LLM calls or DB mutations

---

## The Problem

When an agent workflow crashes mid-execution:

```
Step 1: Classify error (Gemma4)        ✓ Done
Step 2: Repair code (Gemma4)           ✓ Done
Step 3: Apply patch to disk            ✓ Done
Step 4: Run smoke test                 ← CRASH HERE
Step 5: Log outcome
```

**On restart, without durable execution:**
- Gemma4 is called again (duplicate)
- Patch is re-written to disk (duplicate)
- Smoke test runs again (OK, it's idempotent)
- Outcome logged twice (corrupt audit trail)

**Cost**: Wasted tokens, corrupted files, duplicate records, lost trust in agent logging.

---

## The Solution: Three Layers

### Layer 1: Canonical Memory (Already Exists)
- `agent_memory_registry` — what the agent learned
- `mcp_trace_ownership` — which tools were called
- `memory_registry` — feature-level summaries

### Layer 2: Durable Execution Journal (NEW)
- `execution_runs` — one per workflow invocation
- `execution_journal_steps` — each atomic operation (step 1, 2, 3, ...)
- `execution_side_effects` — immutable log of mutations (file writes, DB inserts)
- `execution_dependencies` — step ordering and data flow

### Layer 3: Idempotency Guards (NEW)
- Idempotency key formula: `runId:stepName:inputHash`
- Write guards: check if mutation already applied before executing
- Recovery map: `step_name → output` for all completed steps

---

## How It Works

### First Run (Happy Path)
```
Step 1 (classify): Execute Gemma4
  → Record result in execution_journal_steps
  → status = SUCCESS, output = {...}

Step 2 (repair): Execute Gemma4
  → Record result in execution_journal_steps
  → status = SUCCESS, output = {...}
  
Step 3 (apply): Write patch to disk
  → Record in execution_side_effects
  → status = VERIFIED
  → Update checkpoint in execution_runs

CRASH ← All steps persisted to Postgres
```

### Resume (After Crash)
```
1. Load execution_run from Postgres
2. Check checkpoint (step 3)
3. Load all completed steps into recovery_map
4. Skip steps 1–3 (already cached)
5. Continue from step 4 (smoke test)
6. Complete workflow
```

**Key**: Steps 1–3 are **skipped** on resume. Their results come from the database, not re-execution.

---

## Code Pattern

### Start a workflow:
```typescript
const executor = await startExecution(db, {
  runId: 'unique-id',
  taskId: 'task-123',
  agent: 'error-repair-agent',
  input: { query: '...' },
});
```

### Execute a step with idempotency:
```typescript
const result = await executor.step(
  'classify-error',  // step name
  async () => {
    return await gemma4Classify(input);
  },
  'llm_completion'   // step type
);
```

### Write with idempotency guard:
```typescript
const { alreadyWritten, result } = await idempotentWrite(db, {
  runId,
  stepName: 'apply-repair',
  resourceId: 'src/foo.ts',
  operation: 'WRITE',
  write: async () => writeFile(path, patch),
  newValue: { patch },
});

// On crash & resume:
// - First call: alreadyWritten = false, actually writes
// - Resume call: alreadyWritten = true, skips write
```

### Resume from checkpoint:
```typescript
const { executor, recoveryMap } = await resumeExecution(runId, db);

// recoveryMap = { 'classify-error': {...}, 'repair': {...}, ... }
// executor skips all keys in recoveryMap automatically
```

---

## Tables Deployed This Week

### execution_runs
- `run_id` — unique per workflow
- `task_id`, `agent` — ownership
- `status` — ACTIVE | COMPLETED | FAILED | SUSPENDED | RESUMED
- `checkpoint_step_id` — last successfully recorded step
- `recovery_count` — how many times resumed

### execution_journal_steps
- `run_id`, `step_index` — ownership
- `step_name`, `step_type` — identify the step
- `idempotency_key` — UNIQUE, enables deduplication
- `status` — PENDING | EXECUTING | SUCCESS | FAILED
- `input`, `output` — full request/response
- `execution_duration_ms`, `tokens_used` — observability

### execution_side_effects
- `run_id`, `step_id` — ownership
- `effect_type` — db_write | file_write | api_call | cache_invalidate
- `resource_id` — table name, file path, or API endpoint
- `operation` — INSERT | UPDATE | DELETE | WRITE
- `old_value`, `new_value` — before/after state
- `status` — RECORDED | VERIFIED | REVERSED

### execution_dependencies
- `from_step_id`, `to_step_id` — step ordering
- `dependency_type` — data_dependency | control_flow | temporal

---

## Deployment Plan

| Week | Task | Files | Status |
|------|------|-------|--------|
| 1 | Deploy schema | drizzle/manual/0040_*.sql | ✅ Ready |
| 1 | Add Drizzle types | src/lib/server/db/schema/durable-execution.ts | ✅ Ready |
| 1 | Add executor library | src/lib/server/workflows/durable-execution.ts | ✅ Ready |
| 2 | Wire into error-agent | workflow-loop-durable.ts | Design + example ✅ |
| 2 | Add API routes | /api/workflows/[runId]/status | Example ✅ |
| 3 | Build dashboard | /command-center/workflows | Design ready |
| 3 | Add test suite | tests/workflows/durable-execution.test.ts | Example ✅ |
| 4 | (Optional) Restate | Evaluate for high-value workflows | Research only |

---

## Key Design Decisions

### ✅ Custom Journal, Not Restate (for now)
- **Reason**: Light, self-contained, leverages existing Postgres
- **When to add Restate**: If crashes become frequent or high-value workflows need strict ordering

### ✅ Write Guards in Application Code
- **Reason**: No special database transaction types needed
- **Pattern**: Check `execution_side_effects` before writing; record after success

### ✅ Temporal Validity for agent_memory_registry
- **Reason**: Enables "what did we know as of date X?" queries
- **Columns**: `valid_from`, `valid_to`, `confidence`, `source_event_id`, `supersedes_id`

### ✅ Recovery is Automatic
- **How**: `resumeExecution()` loads recovery map; executor skips cached steps
- **No manual replay logic**: Same code path handles both startup and resume

---

## Safety Guarantees

### ✅ No Duplicate LLM Calls
- Idempotency key on every step
- Resume skips steps with `status = SUCCESS`

### ✅ No Duplicate DB Mutations
- `idempotentWrite()` checks if mutation already applied
- `execution_side_effects` prevents double-inserts

### ✅ No Duplicate File Writes
- File writes recorded in `execution_side_effects`
- Resume path detects existing writes and skips them

### ✅ Correct Step Ordering
- `execution_dependencies` table enables topological ordering
- Executor enforces ordering on resume

### ✅ Audit Trail
- Every step, every side effect, every retry is recorded
- Temporal metadata (timestamps, durations) captured
- Recovery count tracked for monitoring

---

## Observable: Query Examples

### Recent workflow status
```sql
SELECT run_id, status, recovery_count, completed_at
FROM execution_runs
WHERE agent = 'error-repair-agent'
ORDER BY created_at DESC
LIMIT 10;
```

### Workflow step timeline
```sql
SELECT step_index, step_name, status, execution_duration_ms, tokens_used
FROM execution_journal_steps
WHERE run_id = 'run-abc-123'
ORDER BY step_index;
```

### Mutations applied by a workflow
```sql
SELECT effect_type, resource_id, operation, status
FROM execution_side_effects
WHERE run_id = 'run-abc-123'
ORDER BY id;
```

### Which workflows used cache hits?
```sql
SELECT run_id, COUNT(*) as cached_steps
FROM execution_journal_steps
WHERE cache_hit = true
GROUP BY run_id
ORDER BY cached_steps DESC;
```

---

## Observability Dashboard (Next Phase)

Build `/command-center/workflows`:

- **List**: Recent runs (status, progress, recovery count)
- **Detail**: Step timeline, durations, side effects
- **Actions**: Resume, inspect, replay
- **Metrics**: Cache hit rate, token savings, wall-clock vs GPU time

---

## Documentation Artifacts

| File | Purpose |
|------|---------|
| `DURABLE-EXECUTION-ARCHITECTURE.md` | Full design (5-layer model, Mastra integration, Restate optional) |
| `DURABLE-WORKFLOW-EXAMPLE.md` | Complete worked example (before/after, crash scenario, tests) |
| `DURABLE-EXECUTION.ts` | Core library (DurableExecutor class, startExecution, resumeExecution, idempotentWrite) |
| `durable-execution.ts` (schema) | Drizzle ORM types for all 4 tables |
| `0040_durable_execution_journal.sql` | Migration (4 tables, 7 indexes) |

---

## Why This Matters for Atlas

**Error-Repair Agent**: If repair crashes, don't re-write the file. Just resume the test.

**Feature-Synthesis Agent**: If synthesis crashes, don't re-index. Just resume the Gemma4 summary.

**Retrieval-Ranking Agent**: If ranking crashes, don't re-fetch packets. Just resume the gradient update.

**Cost Savings**: 10–100× reduction in token waste on recovery, zero corruption risk.

---

## Next Step

**This week**: Deploy schema + types + library. Run zero-change dry-run to verify.  
**Next week**: Wire into error-agent. Test with controlled crashes.  
**Week 3**: Dashboard. Ship to production.
