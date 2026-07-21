# Durable Execution Example: Error Repair Workflow

This example shows how to integrate the durable execution layer into the existing error-agent workflow.

## Before (Current Pattern)

```typescript
// src/lib/server/ai/error-agent/workflow-loop.ts (current)

export async function errorRepairWorkflow(input: WorkflowLoopInput) {
  // Step 1: Classify error
  const classification = await classifyError(input);
  
  // Step 2: Repair
  const repair = await repairCode(input, classification);
  
  // Step 3: Smoke test
  const smoke = await runSmokeTest(input, classification, repair);
  
  // Step 4: Log result
  await logResult({
    runId: randomUUID(),
    query: input.query,
    stage: 'smoke',
    passed: smoke.passed,
    // ...
  });
  
  return { ok: smoke.passed, summary: smoke.outputSummary };
}
```

**Problem**: If the workflow crashes after step 2 (repair applied), restart will:
1. Re-classify the error (OK, idempotent)
2. **Re-apply the repair** (BAD — duplicate write)
3. Re-run smoke test (OK)
4. Log duplicate result (BAD — pollutes audit trail)

## After (Durable Pattern)

```typescript
// src/lib/server/ai/error-agent/workflow-loop-durable.ts (new)

import {
  startExecution,
  resumeExecution,
  generateIdempotencyKey,
  idempotentWrite,
  type DurableExecutor,
} from '$lib/server/workflows/durable-execution';
import { db } from '$lib/server/db/client';

export async function errorRepairWorkflowDurable(input: WorkflowLoopInput) {
  const runId = input.runId ?? `error-repair-${crypto.randomUUID()}`;
  
  try {
    // Create or resume execution
    let executor: DurableExecutor;
    let recoveryMap: Record<string, unknown>;
    
    if (input.runId) {
      // Resume from checkpoint
      const resume = await resumeExecution(input.runId, db);
      executor = resume.executor;
      recoveryMap = resume.recoveryMap;
      console.log(`Resumed execution ${runId} from checkpoint`);
    } else {
      // Start new execution
      executor = await startExecution(db, {
        runId,
        taskId: `task-${crypto.randomUUID()}`,
        agent: 'error-repair-agent',
        input,
      });
      recoveryMap = {};
    }
    
    // ========================================================================
    // Step 1: Classify error (idempotent read)
    // ========================================================================
    
    const classification = await executor.step(
      'classify-error',
      async () => {
        // This is a pure function — safe to re-run
        return await classifyErrorWithGemma4({
          query: input.query,
          errorClass: input.hmmErrorClass,
        });
      },
      'llm_completion'
    );
    
    // ========================================================================
    // Step 2: Repair code (MUTATION — must be idempotent)
    // ========================================================================
    
    const repair = await executor.step(
      'repair-code',
      async () => {
        return await repairCodeWithGemma4(input, classification as any);
      },
      'llm_completion'
    );
    
    // ========================================================================
    // Step 3: Apply repair (FILE WRITE — idempotent guard required)
    // ========================================================================
    
    const repairApplied = await executor.step(
      'apply-repair',
      async () => {
        // Write the patch to disk
        const { alreadyWritten, result } = await idempotentWrite(db, {
          runId,
          stepName: 'apply-repair',
          resourceId: input.targetPath || 'unknown',
          operation: 'WRITE',
          write: async () => {
            const filePath = input.targetPath;
            if (!filePath) throw new Error('No target path provided');
            
            // Pseudo-code: write the repair to the file
            const oldContent = readFileSync(filePath, 'utf-8');
            writeFileSync(filePath, (repair as any).patch);
            
            return { success: true, filePath, patchSize: (repair as any).patch.length };
          },
          newValue: { patch: (repair as any).patch },
        });
        
        if (alreadyWritten) {
          console.log(`Repair already applied to ${input.targetPath}`);
        }
        
        return result;
      },
      'db_mutation'
    );
    
    // ========================================================================
    // Step 4: Run smoke test (idempotent validation)
    // ========================================================================
    
    const smoke = await executor.step(
      'run-smoke-test',
      async () => {
        // Validation is stateless — safe to repeat
        return await runSmokeTest({
          command: 'npm run check',
          timeout: 30000,
        });
      },
      'validation'
    );
    
    // ========================================================================
    // Step 5: Log outcome (idempotent write)
    // ========================================================================
    
    const logged = await executor.step(
      'log-outcome',
      async () => {
        // Insert to agent_memory_registry with explicit idempotency
        return await idempotentWrite(db, {
          runId,
          stepName: 'log-outcome',
          resourceId: `agent_memory_registry:${input.hmmErrorClass}`,
          operation: 'INSERT',
          write: async () => {
            const [record] = await db
              .insert(agentMemoryRegistry)
              .values({
                taskId: runId,
                agent: 'error-repair-agent',
                status: (smoke as any).passed ? 'PASS' : 'NEEDS_REVIEW',
                metadata: {
                  errorClass: input.hmmErrorClass,
                  filePath: input.targetPath,
                  classificationScore: (classification as any).riskScore,
                  smokeTestPassed: (smoke as any).passed,
                  summary: (smoke as any).outputSummary,
                },
              })
              .returning();
            
            return record;
          },
          newValue: { recorded: true },
        });
        
        return logged;
      },
      'db_mutation'
    );
    
    // ========================================================================
    // All steps completed successfully
    // ========================================================================
    
    await executor.complete({
      success: (smoke as any).passed,
      summary: (smoke as any).outputSummary,
      repairApplied: (repairApplied as any).success,
    });
    
    return {
      ok: (smoke as any).passed,
      summary: (smoke as any).outputSummary,
      runId,
    };
    
  } catch (error) {
    // On error, mark the execution as failed and suspend for manual review
    const executor = new DurableExecutor(runId, db);
    
    await executor.fail(error as Error);
    await executor.suspend();
    
    console.error(`Workflow ${runId} failed:`, error);
    throw error;
  }
}
```

## What Happens on Crash

### First Run (Success Path)

```
Time  Event                         State
────  ─────────────────────────────  ────────────────────────────
0ms   start execution               execution_runs: ACTIVE
      (runId = "...")
      
10ms  classifyError completes       execution_journal_steps:
      (cached in step table)        1. classify-error: SUCCESS ✓
      
20ms  repairCodeWithGemma4 runs     execution_journal_steps:
      (first LLM call)              2. repair-code: SUCCESS ✓
                                    (tokens_used: 340)
      
30ms  writePatchIdempotent runs     execution_side_effects:
      (patch written to disk)       3. apply-repair: SUCCESS ✓
      (recorded in side_effects)    (resourceId: src/foo.ts, VERIFIED)
      
**CRASH HERE** → Process dies
      
(On restart):
50ms  resumeExecution() called      execution_runs:
      Loads checkpoint              status: RESUMED
                                    recoveryCount: 1
      
51ms  classifyError step recalled   (skipped — already cached)
      No-op, returns cached result
      
52ms  repairCode step recalled      (skipped — already cached)
      Returns cached Gemma4 output
      
53ms  applyRepair step runs         idempotentWrite detects:
      But writeFileIdempotent sees  "already wrote this exact patch"
      the file already has the      Returns cached result
      patch applied → No-op
      
60ms  smokeTest runs                (continues from here)
      (NOT skipped — new step)
      
70ms  logOutcome runs               idempotentWrite checks:
      But sees agentMemoryRegistry  "already recorded this"
      row already exists            Returns cached result
      
80ms  executor.complete()           execution_runs:
      All steps done                status: COMPLETED
                                    completedAt: now()
```

### Recovery: Zero Duplicates

- `classifyError`: 1 call to Gemma4 (cached on resume)
- `repairCode`: 1 call to Gemma4 (cached on resume)
- `applyRepair`: 0 file writes (idempotentWrite detected existing)
- `smokeTest`: 1 run (no-op, validation is repeatable)
- `logOutcome`: 0 DB inserts (idempotentWrite detected existing row)
- **agent_memory_registry**: 1 row created (no duplicates)

---

## SvelteKit Route Integration

```typescript
// src/routes/api/ai/repair/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { errorRepairWorkflowDurable } from '$lib/server/ai/error-agent/workflow-loop-durable';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }
  
  const input = await request.json();
  
  try {
    const result = await errorRepairWorkflowDurable(input);
    
    return json({
      success: result.ok,
      runId: result.runId,
      summary: result.summary,
    });
  } catch (err) {
    return error(500, 'Workflow failed: ' + (err as Error).message);
  }
};

// GET handler: Check workflow status
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }
  
  const runId = url.searchParams.get('runId');
  if (!runId) {
    return error(400, 'Missing runId');
  }
  
  try {
    const run = await db.query.executionRuns.findFirst({
      where: eq(executionRuns.runId, runId),
      with: {
        checkpointStepId: true,
      },
    });
    
    const steps = await db.query.executionJournalSteps.findMany({
      where: eq(executionJournalSteps.runId, runId),
      orderBy: (s) => [s.stepIndex],
    });
    
    return json({
      runId,
      status: run?.status,
      progress: {
        completed: steps.filter(s => s.status === 'SUCCESS').length,
        total: steps.length,
      },
      checkpoint: run?.checkpointStepId,
      timeline: steps.map(s => ({
        name: s.stepName,
        status: s.status,
        duration: s.executionDurationMs,
        error: s.error,
      })),
    });
  } catch (err) {
    return error(500, 'Failed to fetch workflow status');
  }
};
```

---

## Testing: Crash & Resume

```typescript
// tests/workflows/durable-execution.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  startExecution,
  resumeExecution,
  idempotentWrite,
} from '$lib/server/workflows/durable-execution';
import { db } from '$lib/server/db/client';

describe('Durable Execution', () => {
  let runId: string;
  
  beforeEach(() => {
    runId = `test-run-${Date.now()}`;
  });
  
  it('resumes from checkpoint after crash', async () => {
    // Step 1: Start execution and run first two steps
    let executor = await startExecution(db, {
      runId,
      taskId: 'test-task',
      agent: 'test-agent',
      input: { test: true },
    });
    
    await executor.step('step-1', async () => ({ result: 'step1' }));
    await executor.step('step-2', async () => ({ result: 'step2' }));
    
    // Simulate crash (step 2 checkpoint was recorded)
    
    // Step 2: Resume from checkpoint
    const { executor: resumedExecutor } = await resumeExecution(runId, db);
    
    // Step 3: Continue from step 3
    const step3Result = await resumedExecutor.step('step-3', async () => ({
      result: 'step3',
    }));
    
    expect(step3Result).toEqual({ result: 'step3' });
    
    // Verify: step 1 and 2 not re-executed
    const steps = await db.query.executionJournalSteps.findMany({
      where: eq(executionJournalSteps.runId, runId),
    });
    
    expect(steps).toHaveLength(3);
    expect(steps[0].stepName).toBe('step-1');
    expect(steps[0].executionAttempt).toBe(1);  // NOT incremented
  });
  
  it('detects duplicate writes and skips them', async () => {
    const executor = await startExecution(db, {
      runId,
      taskId: 'test-task',
      agent: 'test-agent',
      input: {},
    });
    
    await executor.step('prepare', async () => ({}));
    
    let writeCount = 0;
    
    // First call: actually writes
    const result1 = await idempotentWrite(db, {
      runId,
      stepName: 'prepare',
      resourceId: 'test-resource',
      operation: 'INSERT',
      write: async () => {
        writeCount++;
        return { written: true };
      },
      newValue: { data: 'test' },
    });
    
    expect(result1.alreadyWritten).toBe(false);
    expect(writeCount).toBe(1);
    
    // Second call: skips write (already done)
    const result2 = await idempotentWrite(db, {
      runId,
      stepName: 'prepare',
      resourceId: 'test-resource',
      operation: 'INSERT',
      write: async () => {
        writeCount++;
        return { written: true };
      },
      newValue: { data: 'test' },
    });
    
    expect(result2.alreadyWritten).toBe(true);
    expect(writeCount).toBe(1);  // Still 1, not incremented
  });
});
```

---

## Key Points

1. **Idempotency Keys**: Automatically generated from `runId + stepName + inputHash`
2. **Crash Safety**: All steps record BEFORE execution, so restart can skip them
3. **Write Guards**: `idempotentWrite()` checks if the mutation was already applied
4. **No LLM Re-execution**: Gemma4 calls are cached; resume skips them
5. **Audit Trail**: Every step, every side effect, every retry is recorded

---

## Next: Observability Dashboard

Build `/api/workflows/[runId]/status` to show:
- Step timeline
- Cache hits
- Side effects (file writes, DB inserts)
- Recovery checkpoints
- Error details

Then build a UI at `/command-center/workflows` to:
- View running/completed workflows
- Resume suspended workflows
- Inspect step details
- Replay workflows
