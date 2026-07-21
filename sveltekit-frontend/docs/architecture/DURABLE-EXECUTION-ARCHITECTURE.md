# Durable Execution Architecture: PostgreSQL + Mastra + Restate

**Status**: Design Phase | **Date**: July 20, 2026 | **Author**: Claude  
**Goal**: Enable Atlas agentic workflows to crash, restart, and continue without duplicating LLM calls, tool invocations, or database mutations.

---

## Executive Summary

The current setup has three independent memory layers that don't coordinate:

- **Postgres** (agent_memory_registry, mcp_trace_ownership) — what happened
- **LangGraph checkpoints** — internal state snapshots
- **Redis Engram** — query bigrams and spatial locality

**Problem**: On crash, LangGraph replays from checkpoint (repeating LLM calls), and DB mutations re-execute (duplicates, lost idempotency).

**Solution**: Add a durable execution journal that records each consequential step BEFORE and AFTER it executes, so recovery replays stored results instead of re-running them.

**Three-layer model**:

```
┌─────────────────────────────────────────────────────┐
│ Application Layer (SvelteKit routes, Mastra agents) │
└─────────────────────────────┬───────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────┐
│ Durable Execution Layer (Mastra + Restate journal) │
│  ├─ Step recording (idempotency keys)              │
│  ├─ Tool call deduplication                        │
│  ├─ DB mutation ordering                           │
│  └─ Crash recovery                                 │
└─────────────────────────────┬───────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────┐
│ Persistence Layer (Postgres + Redis + Neo4j)        │
│  ├─ Canonical facts (agent_memory_registry)        │
│  ├─ Tool results (execution_journal_steps)         │
│  ├─ Active run state (execution_runs)              │
│  └─ Temporal validity (valid_from, valid_to)       │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: Canonical Memory (Already Exists)

### Postgres Tables

**agent_memory_registry** — What the agent learned and claimed
- `taskId`, `storyId`, `agent` — ownership and scope
- `packetKey`, `sourceRef`, `featureId` — Atlas identity
- `status` — CLAIMED | VERIFYING | PASS | SUPERSEDED | FAILED | MANUAL_REVIEW
- `metadata` — JSONB for extensibility
- `createdAt`, `updatedAt` — audit trail

**mcp_trace_ownership** — Which MCP tools were called in this trace
- `traceId` — unique per workflow run
- `taskId`, `agent` — ownership
- `toolCalls[]`, `packetKeys[]` — what was touched
- `promptHash`, `proofHash`, `releaseHash` — evidence chain
- `status` — OPEN | CLOSED | FAILED

**memory_registry** — Feature-level aggregation
- Summarizes multiple agent runs at the feature level
- Enables "is this feature already understood?" checks

---

## Layer 2: Durable Execution Journal (NEW)

Add four new tables to track every step of a workflow execution:

### execution_runs

Represents one workflow invocation (may span multiple agent steps and tool calls).

```sql
CREATE TABLE execution_runs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Unique identification
  run_id TEXT UNIQUE NOT NULL,           -- UUID, also the Mastra runId
  task_id TEXT NOT NULL,                  -- which task initiated this
  agent TEXT NOT NULL,                    -- which agent is executing
  
  -- Execution state
  status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | COMPLETED | FAILED | SUSPENDED | RESUMED
  input JSONB NOT NULL,                   -- original request payload
  output JSONB,                           -- final result (null until complete)
  error_message TEXT,                     -- if failed
  
  -- Crash recovery
  checkpoint_step_id BIGINT,              -- last successfully recorded step
  recovery_count INT DEFAULT 0,           -- how many times this run was recovered
  
  -- Temporal metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  resumed_at TIMESTAMP WITH TIME ZONE,
  
  FOREIGN KEY (checkpoint_step_id) REFERENCES execution_journal_steps(id)
);

CREATE INDEX idx_execution_runs_run_id ON execution_runs(run_id);
CREATE INDEX idx_execution_runs_task_id ON execution_runs(task_id);
CREATE INDEX idx_execution_runs_agent ON execution_runs(agent);
CREATE INDEX idx_execution_runs_status ON execution_runs(status);
```

### execution_journal_steps

Records each atomic operation: tool call, LLM invocation, DB mutation, etc.

```sql
CREATE TABLE execution_journal_steps (
  id BIGSERIAL PRIMARY KEY,
  
  -- Ownership
  run_id TEXT NOT NULL,                   -- which execution_run contains this step
  step_index INT NOT NULL,                -- 0, 1, 2, ... (order within run)
  
  -- Step definition
  step_name TEXT NOT NULL,                -- e.g. "retrieve-context", "propose-patch"
  step_type TEXT NOT NULL,                -- 'tool_call' | 'llm_completion' | 'db_mutation' | 'validation'
  idempotency_key TEXT UNIQUE NOT NULL,   -- run_id + step_name + input_hash
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | EXECUTING | SUCCESS | FAILED | SKIPPED
  
  -- Input & output (immutable once recorded)
  input JSONB NOT NULL,                   -- what was passed to this step
  output JSONB,                           -- what it returned (null until SUCCESS)
  error TEXT,                             -- if FAILED
  
  -- Proof of execution
  execution_duration_ms INT,              -- wall-clock time to complete
  tokens_used INT,                        -- if LLM call
  cache_hit BOOLEAN,                      -- if this step result came from cache
  
  -- Recovery info
  execution_attempt INT DEFAULT 1,        -- which attempt succeeded (for retries)
  executed_at TIMESTAMP WITH TIME ZONE,
  
  FOREIGN KEY (run_id) REFERENCES execution_runs(run_id)
);

CREATE INDEX idx_steps_run_id ON execution_journal_steps(run_id);
CREATE INDEX idx_steps_idempotency_key ON execution_journal_steps(idempotency_key);
CREATE INDEX idx_steps_status ON execution_journal_steps(status);
CREATE INDEX idx_steps_step_type ON execution_journal_steps(step_type);
```

### execution_dependencies

Tracks dependencies between steps (step A must complete before step B can start).

```sql
CREATE TABLE execution_dependencies (
  id BIGSERIAL PRIMARY KEY,
  
  -- The dependency edge
  run_id TEXT NOT NULL,
  from_step_id BIGINT NOT NULL,          -- predecessor step
  to_step_id BIGINT NOT NULL,            -- successor step
  
  -- Metadata
  dependency_type TEXT,                  -- 'data_dependency' | 'control_flow' | 'temporal'
  reason TEXT,                           -- human-readable explanation
  
  FOREIGN KEY (run_id) REFERENCES execution_runs(run_id),
  FOREIGN KEY (from_step_id) REFERENCES execution_journal_steps(id),
  FOREIGN KEY (to_step_id) REFERENCES execution_journal_steps(id)
);

CREATE INDEX idx_deps_run_id ON execution_dependencies(run_id);
CREATE INDEX idx_deps_from_step ON execution_dependencies(from_step_id);
CREATE INDEX idx_deps_to_step ON execution_dependencies(to_step_id);
```

### execution_side_effects

Immutable log of every side effect: file writes, API calls, DB mutations.

```sql
CREATE TABLE execution_side_effects (
  id BIGSERIAL PRIMARY KEY,
  
  -- Ownership
  run_id TEXT NOT NULL,
  step_id BIGINT NOT NULL,                -- which step caused this
  
  -- Effect type
  effect_type TEXT NOT NULL,              -- 'db_write' | 'file_write' | 'api_call' | 'cache_invalidate'
  resource_id TEXT NOT NULL,              -- table name, file path, or API endpoint
  
  -- Immutable record
  operation TEXT NOT NULL,                -- 'INSERT' | 'UPDATE' | 'DELETE'
  old_value JSONB,                        -- before state (for UPDATE/DELETE)
  new_value JSONB,                        -- after state (for INSERT/UPDATE)
  
  -- Status
  status TEXT DEFAULT 'RECORDED',         -- RECORDED | VERIFIED | REVERSED
  
  -- Recovery
  reversible BOOLEAN DEFAULT FALSE,       -- can this effect be undone?
  reverse_operation TEXT,                 -- e.g. DELETE for INSERT
  reversed_at TIMESTAMP WITH TIME ZONE,
  
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  FOREIGN KEY (run_id) REFERENCES execution_runs(run_id),
  FOREIGN KEY (step_id) REFERENCES execution_journal_steps(id)
);

CREATE INDEX idx_effects_run_id ON execution_side_effects(run_id);
CREATE INDEX idx_effects_step_id ON execution_side_effects(step_id);
```

---

## Layer 3: Mastra Integration

### Mastra Workflow with Durable Steps

Use Restate as the durable journal backend:

```typescript
// src/lib/server/workflows/durable-atlas-workflow.ts

import Mastra, { Step } from '@mastra/core';
import { Restate } from '@restatedev/sdk';

const restate = new Restate({
  url: 'http://localhost:8080',  // Restate server
});

export const durableAtlasWorkflow = new Mastra.Workflow({
  id: 'atlas-repair-workflow',
  description: 'Durable error repair workflow with crash recovery',
  
  steps: {
    // Step 1: Retrieve context (pure read, idempotent)
    retrieveContext: new Step({
      id: 'retrieve-context',
      description: 'Fetch packets and retrieval results',
      
      async execute(input: { taskId: string; query: string }) {
        return restate.service('retrieval-service').call('getContext', {
          taskId: input.taskId,
          query: input.query,
        });
      },
      
      onFailure: async (error) => {
        // Log but don't retry (network issues + idempotency don't mix well)
        console.error('retrieval failed, checkpoint and resume', error);
        throw error;
      },
    }),
    
    // Step 2: Propose patch (LLM call, deterministic, must be cached)
    proposePatch: new Step({
      id: 'propose-patch',
      description: 'Call Gemma4 to generate fix',
      
      async execute(input: { context: string; errorClass: string }) {
        const idempotencyKey = `patch:${hash(input)}`;
        
        // Check if we already generated this patch
        const cached = await restate.service('cache-service').call(
          'getStepResult',
          { idempotencyKey }
        );
        if (cached) return cached;
        
        // Generate new patch
        const patch = await gemma4GeneratePatch(input);
        
        // Store for future runs
        await restate.service('cache-service').call('setStepResult', {
          idempotencyKey,
          result: patch,
          ttl: 86400,
        });
        
        return patch;
      },
    }),
    
    // Step 3: Validate patch (pure logic, no side effects)
    validatePatch: new Step({
      id: 'validate-patch',
      description: 'Structural and semantic validation',
      
      async execute(input: { patch: string; errorClass: string }) {
        // This is a pure function — no I/O
        return validatePatchSyntax(input.patch);
      },
    }),
    
    // Step 4: Write to database (mutation, MUST be idempotent)
    applyPatch: new Step({
      id: 'apply-patch',
      description: 'Write patch to filesystem and record in DB',
      
      async execute(input: { patch: string; filePath: string }) {
        const idempotencyKey = `apply:${input.filePath}:${hash(input.patch)}`;
        
        // Record intent BEFORE mutation
        await db.insert(executionSideEffects).values({
          runId: this.runId,
          stepId: this.stepId,
          effectType: 'file_write',
          resourceId: input.filePath,
          operation: 'WRITE',
          newValue: { patch: input.patch },
          status: 'RECORDED',
        });
        
        // Apply with idempotency guard
        const result = await writePatchIdempotent(input.filePath, input.patch);
        
        // Mark successful
        await db.update(executionSideEffects)
          .set({ status: 'VERIFIED' })
          .where(eq(executionSideEffects.runId, this.runId));
        
        return result;
      },
    }),
    
    // Step 5: Run smoke test (validation, recoverable)
    runSmokeTest: new Step({
      id: 'run-smoke-test',
      description: 'Verify the patch works',
      
      async execute(input: { command: string }) {
        // Smoke tests are stateless — repeat if needed
        return executeCommand(input.command);
      },
      
      retries: 2,  // Can retry validation steps
    }),
    
    // Step 6: Record outcome (immutable log, idempotent)
    recordOutcome: new Step({
      id: 'record-outcome',
      description: 'Write final result to agent_memory_registry',
      
      async execute(input: { taskId: string; passed: boolean; summary: string }) {
        const idempotencyKey = `outcome:${input.taskId}:${Date.now()}`;
        
        await db.insert(agentMemoryRegistry).values({
          taskId: input.taskId,
          agent: 'durable-repair-agent',
          status: input.passed ? 'PASS' : 'FAILED',
          metadata: { summary: input.summary },
        });
        
        return { recorded: true };
      },
    }),
  },
});
```

### Crash Recovery

When the workflow crashes and restarts:

```typescript
// src/lib/server/workflows/recovery.ts

export async function resumeWorkflow(runId: string) {
  // 1. Load execution_run from Postgres
  const run = await db.query.executionRuns.findFirst({
    where: eq(executionRuns.runId, runId),
  });
  
  // 2. Check checkpoint
  if (run.checkpointStepId) {
    console.log(`Resuming from step ${run.checkpointStepId}`);
  }
  
  // 3. Load all completed steps
  const completedSteps = await db.query.executionJournalSteps.findMany({
    where: and(
      eq(executionJournalSteps.runId, runId),
      eq(executionJournalSteps.status, 'SUCCESS')
    ),
  });
  
  // 4. Build a recovery map: step_name → output
  const recoveryMap = Object.fromEntries(
    completedSteps.map(s => [s.stepName, s.output])
  );
  
  // 5. Resume with recovery data
  return durableAtlasWorkflow.resume({
    runId,
    recoveryMap,  // Mastra/Restate uses this to skip steps
    continueFrom: run.checkpointStepId,
  });
}
```

---

## Layer 4: Idempotency Guarantees

### Three Types of Steps

| Type | Idempotent? | Retry Safe? | Examples |
|------|-----------|------------|----------|
| **Read-only** | ✅ Always | ✅ Yes (repeat) | Postgres queries, API reads, embeddings |
| **Stateless compute** | ✅ Always | ✅ Yes (repeat) | Validation, parsing, hashing |
| **Writes & mutations** | ❌ Not inherent | ⚠️ Only if guarded | DB inserts, file edits, API side effects |

### Idempotency Key Formula

For every write step, generate a deterministic key:

```typescript
import crypto from 'node:crypto';

function generateIdempotencyKey(
  runId: string,
  stepName: string,
  input: unknown
): string {
  const inputHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 16);
  
  return `${runId}:${stepName}:${inputHash}`;
}

// Usage:
const key = generateIdempotencyKey(
  'run-123',
  'apply-patch',
  { filePath: 'src/foo.ts', patch: '...' }
);
// Result: "run-123:apply-patch:a1b2c3d4e5f6g7h8"
```

### Write Guard Pattern

Before mutating, check if we've already done this:

```typescript
async function writePatchIdempotent(filePath: string, patch: string) {
  const idempotencyKey = generateIdempotencyKey(runId, 'apply-patch', {
    filePath,
    patch,
  });
  
  // Step 1: Check if already applied
  const existing = await db.query.executionSideEffects.findFirst({
    where: and(
      eq(executionSideEffects.runId, runId),
      eq(executionSideEffects.resourceId, filePath),
      eq(executionSideEffects.operation, 'WRITE')
    ),
  });
  
  if (existing && existing.status === 'VERIFIED') {
    // Already wrote this patch — return cached result
    return { alreadyApplied: true, result: existing.newValue };
  }
  
  // Step 2: Apply the write
  const oldContent = readFile(filePath);
  writeFile(filePath, patch);
  
  // Step 3: Record for idempotency
  await db.insert(executionSideEffects).values({
    runId,
    stepId,
    effectType: 'file_write',
    resourceId: filePath,
    operation: 'WRITE',
    oldValue: { content: oldContent },
    newValue: { content: patch },
    status: 'VERIFIED',
  });
  
  return { alreadyApplied: false, result: { success: true } };
}
```

---

## Layer 5: Memory Tiers (Temporal Validity)

Extend all tables with temporal metadata (inspired by Graphiti):

```sql
ALTER TABLE agent_memory_registry ADD COLUMN (
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_to TIMESTAMP WITH TIME ZONE,
  observed_at TIMESTAMP WITH TIME ZONE,
  confidence REAL DEFAULT 0.5,
  source_event_id TEXT,
  supersedes_id BIGINT,
  invalidated_at TIMESTAMP WITH TIME ZONE
);

-- Example query: "what did we know about this feature as of last Tuesday?"
SELECT * FROM agent_memory_registry
WHERE featureId = 'auth.sessions'
  AND valid_from <= '2026-07-15'::TIMESTAMP
  AND (valid_to IS NULL OR valid_to > '2026-07-15'::TIMESTAMP);
```

---

## Integration Points

### 1. **SvelteKit API Routes** → **Mastra Workflow**

```typescript
// src/routes/api/ai/repair/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { durableAtlasWorkflow } from '$lib/server/workflows/durable-atlas-workflow';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { query, errorClass, filePath } = await request.json();
  
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }
  
  try {
    // Start durable workflow
    const run = await durableAtlasWorkflow.execute({
      taskId: `task-${crypto.randomUUID()}`,
      query,
      errorClass,
      filePath,
    });
    
    return json({
      runId: run.id,
      status: run.status,
      checkpointStep: run.checkpointStepId,
    });
  } catch (err) {
    return error(500, 'Workflow failed');
  }
};
```

### 2. **OpenCode MCP Tools** → **Execution Journal**

Every MCP tool call records itself:

```typescript
// src/mcp/unified-execution-logger.ts

export function createExecutionLogger(runId: string) {
  return {
    async recordToolCall(
      toolName: string,
      input: unknown,
      result: unknown
    ) {
      await db.insert(executionJournalSteps).values({
        runId,
        stepName: `mcp:${toolName}`,
        stepType: 'tool_call',
        idempotencyKey: generateKey(runId, toolName, input),
        input,
        output: result,
        status: 'SUCCESS',
      });
    },
    
    async recordError(toolName: string, error: Error) {
      await db.insert(executionJournalSteps).values({
        runId,
        stepName: `mcp:${toolName}`,
        stepType: 'tool_call',
        status: 'FAILED',
        error: error.message,
      });
    },
  };
}
```

### 3. **Observability Dashboard** → **Execution Journal**

Query live execution state:

```typescript
// Endpoint: GET /api/workflows/[runId]/status

export const GET: RequestHandler = async ({ params }) => {
  const run = await db.query.executionRuns.findFirst({
    where: eq(executionRuns.runId, params.runId),
    with: {
      steps: {
        orderBy: (s) => [asc(s.stepIndex)],
      },
      sideEffects: true,
    },
  });
  
  return json({
    runId: run.runId,
    status: run.status,
    progress: {
      completed: run.steps.filter(s => s.status === 'SUCCESS').length,
      total: run.steps.length,
    },
    lastCheckpoint: run.checkpointStepId,
    sideEffects: run.sideEffects,
    timeline: run.steps.map(s => ({
      name: s.stepName,
      status: s.status,
      duration: s.executionDurationMs,
      error: s.error,
    })),
  });
};
```

---

## Deployment Decisions

### Restate: Optional but Recommended

| Choice | Pros | Cons | Best For |
|--------|------|------|----------|
| **Restate** | Real durable execution, built-in recovery, stream resumption | Extra service, learning curve | High-value workflows (→ Postgres writes) |
| **Custom journal** | Light, self-contained, no new dependency | Manual recovery, error-prone | Stateless ranking/analysis tasks |
| **LangGraph + Postgres** | Familiar, existing checkpoint support | LLM re-execution on crash, no idempotency | Non-critical reasoning tasks |

**Recommendation for Atlas**: Start with **custom journal** (execute_runs + execution_journal_steps), add Restate only if crash recovery becomes critical.

### Schema Deployment Order

1. **Phase 1** (this week): Add `execution_runs` + `execution_journal_steps` tables
2. **Phase 2** (next week): Integrate logging into error-agent workflow
3. **Phase 3** (following week): Build resume/recovery UI
4. **Phase 4** (optional): Add Restate integration

---

## Example: Full Repair Workflow

```typescript
export async function atlasRepairWorkflow(input: {
  taskId: string;
  errorClass: HmmErrorClass;
  filePath: string;
  query: string;
}) {
  const runId = `run-${crypto.randomUUID()}`;
  
  // Create execution record
  await db.insert(executionRuns).values({
    runId,
    taskId: input.taskId,
    agent: 'durable-repair-agent',
    status: 'ACTIVE',
    input,
  });
  
  try {
    // Step 1: Retrieve context
    const context = await recordStep(
      runId,
      0,
      'retrieve-context',
      async () => {
        return await hybridSearch({
          query: input.query,
          limit: 10,
        });
      }
    );
    
    // Step 2: Classify error
    const classification = await recordStep(
      runId,
      1,
      'classify-error',
      async () => {
        return await classifyErrorWithGemma4({
          errorClass: input.errorClass,
          context,
        });
      }
    );
    
    // Step 3: Generate patch
    const patch = await recordStep(
      runId,
      2,
      'propose-patch',
      async () => {
        return await gemma4GeneratePatch({
          filePath: input.filePath,
          classification,
          context,
        });
      }
    );
    
    // Step 4: Validate patch
    const validated = await recordStep(
      runId,
      3,
      'validate-patch',
      async () => {
        return validatePatchSyntax(patch);
      }
    );
    
    // Step 5: Apply patch (mutation — must be idempotent)
    const applied = await recordStep(
      runId,
      4,
      'apply-patch',
      async () => {
        return await writePatchIdempotent(input.filePath, patch);
      }
    );
    
    // Step 6: Run smoke test
    const smokeResult = await recordStep(
      runId,
      5,
      'run-smoke-test',
      async () => {
        return await runSmokeTest({
          command: 'npm run check',
          timeout: 30000,
        });
      }
    );
    
    // Step 7: Record outcome
    await recordStep(
      runId,
      6,
      'record-outcome',
      async () => {
        return await db.insert(agentMemoryRegistry).values({
          taskId: input.taskId,
          agent: 'durable-repair-agent',
          status: smokeResult.passed ? 'PASS' : 'NEEDS_REVIEW',
          metadata: {
            filePath: input.filePath,
            summary: smokeResult.summary,
            patchApplied: applied.success,
          },
        });
      }
    );
    
    // Mark workflow complete
    await db.update(executionRuns)
      .set({
        status: 'COMPLETED',
        output: { success: smokeResult.passed },
        completedAt: new Date(),
      })
      .where(eq(executionRuns.runId, runId));
    
  } catch (err) {
    // On error, mark run as failed and log
    await db.update(executionRuns)
      .set({
        status: 'FAILED',
        errorMessage: err.message,
      })
      .where(eq(executionRuns.runId, runId));
    
    throw err;
  }
}

// Helper: record a step execution with idempotency
async function recordStep<T>(
  runId: string,
  stepIndex: number,
  stepName: string,
  execute: () => Promise<T>
): Promise<T> {
  const idempotencyKey = generateIdempotencyKey(runId, stepName, {});
  
  // Check if already executed
  const existing = await db.query.executionJournalSteps.findFirst({
    where: eq(executionJournalSteps.idempotencyKey, idempotencyKey),
  });
  
  if (existing?.status === 'SUCCESS') {
    return existing.output as T;
  }
  
  // Execute step
  let result: T;
  let error: Error | null = null;
  
  try {
    result = await execute();
  } catch (err) {
    error = err as Error;
  }
  
  // Record result
  await db.insert(executionJournalSteps).values({
    runId,
    stepIndex,
    stepName,
    stepType: 'unknown',  // classified by caller
    idempotencyKey,
    status: error ? 'FAILED' : 'SUCCESS',
    input: {},
    output: result || null,
    error: error?.message,
  });
  
  if (error) throw error;
  return result;
}
```

---

## Testing

### Unit: Step Idempotency

```typescript
test('step result cached and reused on retry', async () => {
  const runId = 'test-run-1';
  const stepName = 'retrieve-context';
  
  const result1 = await recordStep(runId, 0, stepName, async () => {
    return { packets: [1, 2, 3] };
  });
  
  const result2 = await recordStep(runId, 0, stepName, async () => {
    throw new Error('Should not execute on retry');
  });
  
  expect(result2).toEqual(result1);
});
```

### Integration: Workflow Crash & Resume

```typescript
test('workflow resumes after crash', async () => {
  const runId = 'test-run-2';
  
  // Start workflow
  const run1 = await atlasRepairWorkflow({ /* ... */ });
  
  // Simulate crash after step 3
  await db.update(executionRuns)
    .set({ status: 'SUSPENDED' })
    .where(eq(executionRuns.runId, runId));
  
  // Resume
  const run2 = await resumeWorkflow(runId);
  
  expect(run2.status).toBe('COMPLETED');
  
  // Verify no duplicate side effects
  const sideEffects = await db.query.executionSideEffects.findMany({
    where: eq(executionSideEffects.runId, runId),
  });
  
  expect(new Set(sideEffects.map(s => s.resourceId)).size)
    .toBe(sideEffects.length);  // No duplicates
});
```

---

## Next Steps

1. **Week 1**: Deploy schema (4 new tables + temporal columns)
2. **Week 2**: Integrate `recordStep()` into error-agent workflow
3. **Week 3**: Build `/api/workflows/[runId]/status` dashboard
4. **Week 4**: Add `resumeWorkflow()` and test crash recovery
5. **(Optional)** Week 5: Evaluate Restate integration for high-value workflows

---

## References

- **Graphiti** (temporal validity model): https://github.com/Couchbase-Ecosystem/graphiti
- **Mastra** (TypeScript workflows): https://mastra.ai/
- **Restate** (durable execution): https://restate.dev/
- **LangGraph checkpoints**: https://langchain-ai.github.io/langgraph/reference/checkpointer/
- **Idempotency patterns**: https://stripe.com/blog/idempotency
