# Durable Execution Integration Checklist

**Phase**: Implementation (Weeks 1–4)  
**Owner**: Engineering  
**Goal**: Enable crash-safe, idempotent agent workflows

---

## Week 1: Schema Deployment

- [ ] **Apply migration**
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
    sveltekit-frontend/drizzle/manual/0040_durable_execution_journal.sql
  ```
  
  Verify:
  ```sql
  -- 4 new tables
  \dt execution_*
  -- Expected: execution_runs, execution_journal_steps, execution_side_effects, execution_dependencies
  
  -- Temporal columns on agent_memory_registry
  \d agent_memory_registry
  -- Expected: valid_from, valid_to, confidence, source_event_id, supersedes_id, invalidated_at
  ```

- [ ] **Verify Drizzle types sync**
  ```bash
  cd sveltekit-frontend
  npm run db:generate  # if using Drizzle generation
  # OR manually import from src/lib/server/db/schema/durable-execution.ts
  ```

- [ ] **Update schema-postgres.ts**
  ```typescript
  // In src/lib/server/db/schema-postgres.ts, add:
  export * from './durable-execution';
  ```

- [ ] **Smoke test: Create execution_run**
  ```typescript
  // src/lib/server/db/__tests__/durable-execution.smoke.ts
  import { db } from '$lib/server/db/client';
  import { executionRuns } from '$lib/server/db/schema/durable-execution';
  
  export async function smokeTest() {
    const run = await db.insert(executionRuns).values({
      runId: 'test-smoke-1',
      taskId: 'task-1',
      agent: 'test',
      status: 'ACTIVE',
      input: { test: true },
    }).returning();
    
    console.log('✓ Created execution_run:', run[0].runId);
  }
  ```

---

## Week 2: Error-Agent Integration

- [ ] **Create workflow-loop-durable.ts**
  - Copy pattern from `docs/examples/DURABLE-WORKFLOW-EXAMPLE.md`
  - Integrate with existing `workflow-loop.ts`
  - Use `DurableExecutor` for all 5–7 steps

- [ ] **Test: Crash & Resume**
  ```typescript
  // tests/workflows/error-agent-durable.test.ts
  import { errorRepairWorkflowDurable } from '$lib/server/ai/error-agent/workflow-loop-durable';
  
  it('resumes after crash', async () => {
    const runId = 'test-crash-1';
    
    // Simulate failure after step 3
    // ... (implementation)
    
    // Resume
    const result = await errorRepairWorkflowDurable({ runId, /* ... */ });
    
    expect(result.ok).toBe(true);
    
    // Verify no duplicate DB writes
    const runs = await db.query.executionRuns.findMany({
      where: eq(executionRuns.runId, runId),
    });
    expect(runs).toHaveLength(1);  // Single run, not two
  });
  ```

- [ ] **Add API route: GET /api/ai/repair?runId=...**
  ```typescript
  // src/routes/api/ai/repair/+server.ts (GET handler)
  // Return workflow status: steps, checkpoint, errors, timeline
  ```

- [ ] **Verify backwards compatibility**
  - Old error-agent code still works (both patterns run in parallel)
  - No breaking changes to existing routes
  - Gradual migration (not all workflows switch at once)

---

## Week 3: Observability Dashboard

- [ ] **Create /api/workflows/[runId]/status endpoint**
  - Return step timeline
  - Include cache hits
  - List side effects
  - Show recovery count

- [ ] **Create /command-center/workflows page**
  - List recent workflows (status, progress)
  - Detail view (steps, durations, side effects)
  - Action buttons (resume, replay, inspect)

- [ ] **Add metrics**
  - Cache hit rate (queries Postgres)
  - Token savings (sum of tokens_used, estimate saved retries)
  - Wall-clock vs GPU time breakdown
  - Recovery frequency (by agent)

- [ ] **Optional: Prometheus metrics**
  ```typescript
  // Export to Prometheus:
  // - workflow_executions_total (by agent, status)
  // - workflow_steps_duration_seconds (histogram)
  // - workflow_cache_hits_total (by step_type)
  // - workflow_side_effects_total (by effect_type)
  ```

---

## Week 4: Testing & Hardening

- [ ] **Unit tests: DurableExecutor**
  ```bash
  npm run test tests/lib/server/workflows/durable-execution.test.ts
  ```
  - Step caching
  - Idempotency keys
  - Recovery map building
  - Write guards

- [ ] **Integration tests: Full workflow crash cycle**
  ```bash
  npm run test tests/workflows/crash-recovery.test.ts
  ```
  - Classify → Repair → Apply → Test → Log
  - Crash at each step
  - Verify zero duplicates

- [ ] **Load test: Multiple concurrent workflows**
  ```bash
  npm run test:load tests/workflows/concurrent-workflows.load.ts
  ```
  - 10 concurrent workflows
  - Random crashes at random steps
  - Verify final state is correct

- [ ] **Manual testing: End-to-end**
  - Start workflow via `/api/ai/repair?query=...`
  - Check execution_runs and execution_journal_steps
  - Kill the process mid-step
  - Restart and resume
  - Verify UI shows correct state

- [ ] **Performance baseline**
  - First run: measure total time
  - Resume run: measure time (should skip cached steps)
  - Compare token usage (should be lower on resume)

---

## Optional: Restate Integration (Week 5+)

- [ ] **Evaluate Restate**
  - Download Restate SDK
  - Build sample workflow with Restate
  - Compare vs custom journal on error rate, complexity, debuggability

- [ ] **Decision gate**
  - If custom journal proves stable → ship as-is
  - If custom journal needs stronger durability → migrate to Restate

- [ ] **If adding Restate**
  - Restate service at localhost:8080
  - Mastra workflow uses Restate for step recording
  - Postgres still owns canonical business state
  - Restate journals serve as proof of execution

---

## Rollback Plan

If issues discovered:

1. **Keep both code paths active**
   - Old workflow-loop.ts still deployed
   - New workflow-loop-durable.ts is opt-in via query param
   - No traffic switches at once

2. **Feature flag**
   ```typescript
   const useDurable = process.env.DURABLE_WORKFLOWS === 'true';
   
   export async function errorRepairWorkflow(input) {
     if (useDurable) {
       return errorRepairWorkflowDurable(input);
     }
     return errorRepairWorkflowOld(input);
   }
   ```

3. **Disable with env var**
   ```bash
   DURABLE_WORKFLOWS=false npm run dev
   ```

4. **Data is safe**
   - Execution journal tables are read-only from old code
   - Old code doesn't break if journal tables exist
   - Rollback requires 0 data cleanup

---

## Success Criteria

- [ ] **Idempotency proven**
  - Single workflow crashed 5+ times
  - Zero duplicate DB writes
  - Zero duplicate file writes
  - Final state identical to single-run baseline

- [ ] **Performance neutral**
  - First run time ≤ 5% slower (checkpoint write overhead)
  - Resume time ≤ 1% slower (recovery map load)

- [ ] **Observability complete**
  - All workflows visible in dashboard
  - Step timelines accurate
  - Cache hits correctly counted

- [ ] **Production ready**
  - All tests pass (unit, integration, load)
  - Manual testing complete
  - Rollback plan documented
  - Team trained on debugging via dashboard

---

## Debugging Guide

### Issue: Step shows EXECUTING but never completes

```sql
SELECT * FROM execution_journal_steps
WHERE status = 'EXECUTING'
ORDER BY executed_at DESC
LIMIT 5;

-- If you see old rows: process crashed mid-step
-- Fix: Manually set to FAILED and resume
UPDATE execution_journal_steps
SET status = 'FAILED', error = 'Process crashed'
WHERE id = <step_id>;
```

### Issue: Resume skips too many steps

```sql
-- Check recovery map
SELECT step_name, status FROM execution_journal_steps
WHERE run_id = '<runId>'
ORDER BY step_index;

-- If status ≠ SUCCESS for a step, it should re-run
-- If you see SUCCESS for a step that shouldn't have run:
-- The idempotency key was not unique. Debug step_name + input_hash.
```

### Issue: Duplicate write still happens

```sql
-- Check side effects
SELECT * FROM execution_side_effects
WHERE run_id = '<runId>'
AND resource_id = '<resource>';

-- If status = VERIFIED, idempotentWrite should have skipped
-- If you see two rows: idempotentWrite didn't check correctly
-- Debug: Ensure same resource_id + operation on both calls
```

---

## Files to Review/Update

| File | Action |
|------|--------|
| `src/lib/server/db/schema/durable-execution.ts` | Review types |
| `src/lib/server/workflows/durable-execution.ts` | Review library |
| `src/lib/server/ai/error-agent/workflow-loop-durable.ts` | Create (based on example) |
| `src/routes/api/ai/repair/+server.ts` | Add GET handler |
| `src/routes/(app)/command-center/workflows/+page.svelte` | Create |
| `tests/workflows/durable-execution.test.ts` | Create |
| `.env` | Add `DURABLE_WORKFLOWS=true` |
| `docker-compose.yml` | No changes (Postgres already supports all features) |

---

## Communication Plan

- **Week 1**: Announce schema deployment, no behavior changes
- **Week 2**: Announce error-agent uses durable execution (gradual rollout)
- **Week 3**: Announce dashboard (now visible, optional for non-technical users)
- **Week 4**: Stable, document in runbook

---

## Reference Docs

- [DURABLE-EXECUTION-ARCHITECTURE.md](../architecture/DURABLE-EXECUTION-ARCHITECTURE.md) — Full design
- [DURABLE-WORKFLOW-EXAMPLE.md](../examples/DURABLE-WORKFLOW-EXAMPLE.md) — Worked example
- [durable-execution.ts](../../src/lib/server/workflows/durable-execution.ts) — Core library
