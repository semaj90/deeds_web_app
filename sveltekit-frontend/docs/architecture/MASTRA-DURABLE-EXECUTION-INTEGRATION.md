# Mastra + Durable Execution: Integration Guide

**Status**: Design Ready | **For**: Integrating Mastra agents with durable execution  
**Reference**: Mastra docs @ https://mastra.ai/, Durable Execution @ ./DURABLE-EXECUTION-ARCHITECTURE.md

---

## Why Mastra + Durable Execution?

| Aspect | Mastra Alone | + Durable Execution |
|--------|-----------|----------------------|
| **Workflow definition** | ✅ Clean step-based | ✅ Same |
| **Step ordering** | ✅ Built-in | ✅ + explicit dependency tracking |
| **Crash recovery** | ⚠️ Checkpoint-based (replays LLMs) | ✅ Journal-based (skips LLMs) |
| **Idempotency** | ❌ App responsibility | ✅ Automatic via journal |
| **Tool deduplication** | ❌ Manual | ✅ Automatic |
| **DB mutation safety** | ❌ Repeat writes risky | ✅ Guarded by write checks |
| **Audit trail** | ⚠️ In Mastra store | ✅ + Postgres journal |

**Bottom line**: Mastra = workflow orchestration. Durable execution = crash safety. Together = production-ready agents.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Mastra Agent                                            │
│  ├─ Define tools (MCP registry)                        │
│  ├─ Define workflow steps                              │
│  ├─ Call DurableExecutor.step() for each step          │
│  └─ Attach Restate for optional journal (if scaling)   │
└─────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────┐
│ DurableExecutor (this design)                           │
│  ├─ Record step before/after execution                 │
│  ├─ Generate idempotency keys                          │
│  ├─ Guard writes (check if already applied)            │
│  └─ Load recovery map on resume                        │
└─────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────────────────┐
│ Postgres (execution_runs, execution_journal_steps, ...)│
│  ├─ Canonical proof of execution                       │
│  ├─ Recovery checkpoints                               │
│  └─ Audit trail (immutable)                            │
└─────────────────────────────────────────────────────────┘
```

---

## Pattern: Wrapping Mastra Steps

### Before (Mastra native)

```typescript
import Mastra from '@mastra/core';

const workflow = new Mastra.Workflow({
  id: 'error-repair',
  steps: {
    classify: {
      id: 'classify-error',
      execute: async (input) => {
        return await gemma4Classify(input);
      },
    },
    repair: {
      id: 'repair-code',
      execute: async (input) => {
        return await gemma4Repair(input);
      },
    },
    apply: {
      id: 'apply-repair',
      execute: async (input) => {
        writeFileSync(input.path, input.patch);
        return { ok: true };
      },
    },
  },
});

// Problem: On crash, all steps replay (including Gemma4 calls)
const result = await workflow.execute({ /* ... */ });
```

### After (Mastra + DurableExecutor)

```typescript
import Mastra from '@mastra/core';
import { startExecution, idempotentWrite } from '$lib/server/workflows/durable-execution';

const durableWorkflow = new Mastra.Workflow({
  id: 'error-repair-durable',
  steps: {
    classify: {
      id: 'classify-error',
      execute: async (input) => {
        // Get or create executor from Mastra context
        const executor = input._durable_executor;
        
        return await executor.step('classify-error', async () => {
          return await gemma4Classify(input);
        }, 'llm_completion');
      },
    },
    repair: {
      id: 'repair-code',
      execute: async (input) => {
        const executor = input._durable_executor;
        
        return await executor.step('repair-code', async () => {
          return await gemma4Repair(input);
        }, 'llm_completion');
      },
    },
    apply: {
      id: 'apply-repair',
      execute: async (input) => {
        const executor = input._durable_executor;
        
        const { alreadyWritten, result } = await idempotentWrite(db, {
          runId: executor.runId,
          stepName: 'apply-repair',
          resourceId: input.path,
          operation: 'WRITE',
          write: async () => {
            writeFileSync(input.path, input.patch);
            return { ok: true };
          },
          newValue: { patch: input.patch },
        });
        
        return result;
      },
    },
  },
});

// Solution: On crash, Gemma4 calls are cached; only apply-repair is guarded
const executor = await startExecution(db, {
  runId: `repair-${crypto.randomUUID()}`,
  taskId: 'task-123',
  agent: 'error-repair-agent',
  input,
});

const mastraResult = await durableWorkflow.execute({
  ...input,
  _durable_executor: executor,  // Pass executor to Mastra
});

await executor.complete(mastraResult);
```

---

## Integration Points

### 1. Mastra Context (Input Injection)

Pass `_durable_executor` through Mastra input:

```typescript
// In step definition:
execute: async (input) => {
  const executor = input._durable_executor;  // Extract from context
  
  return await executor.step('step-name', async () => {
    // your logic
  });
}
```

### 2. MCP Tool Wrapping

When Mastra calls an MCP tool, log it in the journal:

```typescript
// src/lib/server/mcp/execution-logger.ts

export function createExecutionLogger(runId: string, db) {
  return {
    async recordToolCall(toolName: string, input: unknown, result: unknown) {
      const executor = new DurableExecutor(runId, db);
      
      await executor.step(`mcp:${toolName}`, async () => {
        return result;  // Already executed, just record
      }, 'tool_call');
    },
  };
}
```

### 3. Error Handling

Mastra's error handling + durable execution:

```typescript
const durableWorkflow = new Mastra.Workflow({
  id: 'example',
  steps: {
    someStep: {
      execute: async (input) => {
        const executor = input._durable_executor;
        
        try {
          return await executor.step('some-step', async () => {
            // logic
          });
        } catch (err) {
          await executor.fail(err);
          throw err;  // Let Mastra handle
        }
      },
    },
  },
});
```

### 4. Conditional Branching

Use Mastra's conditional routing with durable steps:

```typescript
const workflow = new Mastra.Workflow({
  id: 'conditional-repair',
  steps: {
    classify: { /* ... */ },
    decideApproach: {
      async execute(input) {
        const classification = input.previousStep;
        
        if (classification.severity === 'high') {
          return { approach: 'aggressive' };
        } else {
          return { approach: 'conservative' };
        }
      },
    },
    aggressiveRepair: { /* only runs if approach === aggressive */ },
    conservativeRepair: { /* only runs if approach === conservative */ },
  },
});
```

---

## Real Example: Error-Repair Workflow

```typescript
// src/lib/server/workflows/error-repair-durable.ts

import Mastra from '@mastra/core';
import { startExecution, resumeExecution, idempotentWrite } from '$lib/server/workflows/durable-execution';
import type { DurableExecutor } from '$lib/server/workflows/durable-execution';

interface ErrorRepairInput {
  query: string;
  errorClass: string;
  filePath: string;
  _durable_executor?: DurableExecutor;
}

export const errorRepairWorkflow = new Mastra.Workflow({
  id: 'error-repair-durable',
  description: 'Classify, repair, and validate code fixes with crash recovery',
  
  steps: {
    classify: {
      id: 'classify-error',
      async execute(input: ErrorRepairInput) {
        const executor = input._durable_executor!;
        
        return await executor.step('classify-error', async () => {
          const response = await fetch('http://localhost:8090/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemma4-legal-iq4xs-direct.gguf',
              messages: [
                {
                  role: 'user',
                  content: `Classify this error: ${input.errorClass}. Query: ${input.query}`,
                },
              ],
              temperature: 0.3,
              max_tokens: 200,
            }),
          });
          
          const data = await response.json();
          return {
            errorClass: input.errorClass,
            classification: data.choices[0].message.content,
            riskScore: 0.7,
          };
        }, 'llm_completion');
      },
    },
    
    proposeRepair: {
      id: 'propose-repair',
      async execute(input: ErrorRepairInput & { classification?: any }) {
        const executor = input._durable_executor!;
        
        return await executor.step('propose-repair', async () => {
          const response = await fetch('http://localhost:8090/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gemma4-legal-iq4xs-direct.gguf',
              messages: [
                {
                  role: 'user',
                  content: `Generate a patch for: ${input.errorClass}. File: ${input.filePath}`,
                },
              ],
              temperature: 0.5,
              max_tokens: 500,
            }),
          });
          
          const data = await response.json();
          return {
            patch: data.choices[0].message.content,
            summary: `Fix for ${input.errorClass}`,
          };
        }, 'llm_completion');
      },
    },
    
    applyRepair: {
      id: 'apply-repair',
      async execute(input: ErrorRepairInput & { patch?: any }) {
        const executor = input._durable_executor!;
        
        return await executor.step('apply-repair', async () => {
          const { alreadyWritten, result } = await idempotentWrite(db, {
            runId: executor.runId,
            stepName: 'apply-repair',
            resourceId: input.filePath,
            operation: 'WRITE',
            write: async () => {
              // Pseudo-code: write to file
              const fs = await import('fs/promises');
              await fs.writeFile(input.filePath, input.patch);
              return { success: true };
            },
            newValue: { content: input.patch },
          });
          
          return {
            applied: true,
            filePath: input.filePath,
            alreadyApplied: alreadyWritten,
          };
        }, 'db_mutation');
      },
    },
    
    runSmokeTest: {
      id: 'run-smoke-test',
      async execute(input: ErrorRepairInput) {
        const executor = input._durable_executor!;
        
        return await executor.step('run-smoke-test', async () => {
          // Execute npm run check (or similar)
          const { execSync } = await import('child_process');
          try {
            execSync('npm run check', { timeout: 30000 });
            return { passed: true, output: 'All checks passed' };
          } catch (err) {
            return { passed: false, output: (err as any).message };
          }
        }, 'validation');
      },
    },
  },
});

// Wrapper function for API routes
export async function runErrorRepairWorkflow(input: {
  query: string;
  errorClass: string;
  filePath: string;
  runId?: string;
}) {
  let executor: DurableExecutor;
  
  if (input.runId) {
    // Resume from checkpoint
    const { executor: resumedExecutor } = await resumeExecution(input.runId, db);
    executor = resumedExecutor;
  } else {
    // Start new
    executor = await startExecution(db, {
      runId: `repair-${crypto.randomUUID()}`,
      taskId: `task-${crypto.randomUUID()}`,
      agent: 'error-repair-agent',
      input,
    });
  }
  
  try {
    const result = await errorRepairWorkflow.execute({
      ...input,
      _durable_executor: executor,
    });
    
    await executor.complete(result);
    return result;
  } catch (err) {
    await executor.fail(err as Error);
    throw err;
  }
}
```

### Usage in API Route

```typescript
// src/routes/api/ai/repair/+server.ts

import { json, error } from '@sveltejs/kit';
import { runErrorRepairWorkflow } from '$lib/server/workflows/error-repair-durable';

export const POST = async ({ request, locals }) => {
  if (!locals.user) return error(401, 'Unauthorized');
  
  const { query, errorClass, filePath } = await request.json();
  
  try {
    const result = await runErrorRepairWorkflow({
      query,
      errorClass,
      filePath,
    });
    
    return json({ success: result.passed, runId: result.runId });
  } catch (err) {
    return error(500, 'Workflow failed');
  }
};

export const GET = async ({ url }) => {
  const runId = url.searchParams.get('runId');
  
  if (!runId) return error(400, 'Missing runId');
  
  try {
    // Fetch status from execution_runs + execution_journal_steps
    const run = await db.query.executionRuns.findFirst({
      where: eq(executionRuns.runId, runId),
    });
    
    const steps = await db.query.executionJournalSteps.findMany({
      where: eq(executionJournalSteps.runId, runId),
    });
    
    return json({
      status: run?.status,
      progress: {
        completed: steps.filter(s => s.status === 'SUCCESS').length,
        total: steps.length,
      },
    });
  } catch (err) {
    return error(500, 'Failed to fetch status');
  }
};
```

---

## Mastra Tools Integration

When using Mastra's built-in tool registry:

```typescript
import { Mastra } from '@mastra/core';

const mastra = new Mastra({
  tools: {
    // MCP tools automatically wired
    searchPackets: {
      definition: {
        name: 'search-packets',
        description: 'Search codebase packets',
        inputSchema: { /* ... */ },
      },
      execute: async (input) => {
        // This tool is called by Mastra
        // Log to durable execution journal
        const result = await db.query.atlasPackets.findMany({ /* ... */ });
        
        // Record in execution journal (optional)
        console.log(`Tool call: search-packets, returned ${result.length} packets`);
        
        return result;
      },
    },
  },
});
```

---

## Testing Mastra + Durable Execution

```typescript
// tests/workflows/error-repair-durable.test.ts

import { describe, it, expect } from 'vitest';
import { runErrorRepairWorkflow } from '$lib/server/workflows/error-repair-durable';
import { resumeExecution } from '$lib/server/workflows/durable-execution';

describe('Error-Repair Workflow (Durable)', () => {
  it('completes workflow end-to-end', async () => {
    const result = await runErrorRepairWorkflow({
      query: 'fix missing imports',
      errorClass: 'import_error',
      filePath: 'src/test.ts',
    });
    
    expect(result).toHaveProperty('runId');
    expect(result).toHaveProperty('status');
  });
  
  it('resumes after crash', async () => {
    const firstRun = await runErrorRepairWorkflow({
      query: 'fix type errors',
      errorClass: 'type_error',
      filePath: 'src/test.ts',
    });
    
    // Simulate crash and resume
    const resumedRun = await runErrorRepairWorkflow({
      query: 'fix type errors',
      errorClass: 'type_error',
      filePath: 'src/test.ts',
      runId: firstRun.runId,  // Resume this run
    });
    
    // Verify same result without duplication
    expect(resumedRun.runId).toBe(firstRun.runId);
    expect(resumedRun.status).toBe('COMPLETED');
  });
});
```

---

## Next Steps

1. **This week**: Deploy schema + library (no Mastra changes yet)
2. **Next week**: Wrap error-agent with `DurableExecutor`
3. **Week 3**: Test crash & resume
4. **Week 4**: Ship to production

**Optional Week 5**: Evaluate Restate for additional guarantees (if crashes become a pattern).

---

## References

- **Mastra docs**: https://mastra.ai/docs/
- **Mastra workflows**: https://mastra.ai/docs/guides/workflows
- **Durable Execution**: ./DURABLE-EXECUTION-ARCHITECTURE.md
- **Example**: ../examples/DURABLE-WORKFLOW-EXAMPLE.md
