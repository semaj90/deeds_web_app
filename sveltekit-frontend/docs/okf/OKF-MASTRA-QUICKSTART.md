# OKF Mastra Schema — Quick Start

**Status**: Ready to Use | **Version**: 1.0  
**Files**: 
- Schema: `src/lib/server/okf/mastra-workflows.okf.yaml` (400+ lines)
- Loader: `src/lib/server/okf/mastra-okf-loader.ts` (350+ lines)
- Docs: `docs/okf/MASTRA-OKF-SCHEMA.md` (Complete reference)
- Tests: `tests/okf/mastra-okf-loader.test.ts` (12 test suites)

---

## What is OKF?

**OKF** = OpenCode Knowledge Framework — a YAML schema that defines:
- ✅ Workflow templates (steps, dependencies, validation)
- ✅ Tool bindings (MCP tools for agents to use)
- ✅ Durable execution patterns (idempotency, recovery)
- ✅ Error handling policies (retries, circuit breakers)
- ✅ Observability config (metrics, tracing, logging)

**Goal**: Agents query the OKF schema to discover workflows, validate execution plans, and apply recovery patterns.

---

## 5-Minute Start

### 1. Load the Schema

```typescript
import { getMastraOkfLoader } from '$lib/server/okf/mastra-okf-loader';

const loader = await getMastraOkfLoader();
```

### 2. Discover Workflows

```typescript
// List all workflows
const workflows = loader.listWorkflows();

// Get a specific workflow
const workflow = loader.getWorkflow('error-repair-durable');

// Find by tag
const repairs = loader.listWorkflowsByTag('repair');

// Find by agent
const agentWorkflows = loader.listWorkflowsByAgent('error-repair-agent');
```

### 3. Get Execution Plan

```typescript
const plan = loader.getExecutionPlan(workflow);

// plan = [
//   { name: 'classify-error', stepType: 'llm_completion', ... },
//   { name: 'propose-repair', stepType: 'llm_completion', ... },
//   { name: 'apply-repair', stepType: 'file_write', ... },
//   { name: 'run-smoke-test', stepType: 'validation', ... },
//   { name: 'log-outcome', stepType: 'db_mutation', ... }
// ]
```

### 4. Execute Steps

```typescript
for (const step of plan) {
  const idempotency = loader.getIdempotencyConfig(step);
  const retry = loader.getRetryConfig(step);

  await executor.step(step.name, async () => {
    // Your step logic here
  }, step.stepType);
}
```

### 5. Print Docs

```typescript
console.log(loader.formatExecutionPlan(workflow));

// Output:
// 📋 Execution Plan: error-repair-durable
// ⏱️  Estimated Duration: 30000ms
//
// 1. 🤖 classify-error (llm_completion, timeout: 10000ms)
//    Classify error and assess severity
//
// 2. 🤖 propose-repair (llm_completion, timeout: 15000ms)
//    Generate patch using Gemma4
//    ← depends on: classify-error
// ...
```

---

## Schema Highlights

### Workflows

Defines executable templates with:
- **Input contract** — JSON Schema for what the workflow accepts
- **Output contract** — JSON Schema for what it returns
- **Steps** — Atomic operations (classify, repair, apply, test, log)
- **Metadata** — Name, description, agent, tags, criticality, duration estimate

**Example**: `error-repair-durable` workflow for code fixing

### Steps

Each step is an atomic operation:
- **Name** — Unique identifier (e.g., `classify-error`)
- **Type** — llm_completion | tool_call | db_mutation | file_write | validation
- **Input/Output** — JSON Schemas for data contracts
- **Timeout** — Max execution time (1s–300s)
- **Idempotency** — Cache config + TTL
- **Retry** — Max attempts + backoff
- **Dependencies** — Which steps must complete first
- **Side Effects** — What gets written/mutated

### Step Types

| Type | Idempotent | Retryable | Used For |
|------|-----------|-----------|----------|
| `llm_completion` | ✅ | ✅ | Gemma4/Ollama calls |
| `tool_call` | ✅ | ✅ | MCP tool invocations |
| `db_mutation` | ❌ | ❌ | Database writes |
| `file_write` | ❌ | ❌ | Filesystem writes |
| `validation` | ✅ | ✅ | Pure computation |

### Idempotency

Automatic deduplication via:
- **Key formula**: `runId:step_name:input_hash` (LLM calls)
- **Write guard**: Check `execution_side_effects` before writing (mutations)
- **Cache TTL**: Configurable per step

### Recovery

On crash & resume:
1. Load execution_run from Postgres
2. Build recovery_map of completed steps
3. Skip all steps in recovery_map
4. Continue from checkpoint_step_id

### Observability

Metrics, tracing, and logging:
- `workflow_executions_total` — counter (by agent, status)
- `workflow_steps_duration_seconds` — histogram
- `workflow_cache_hits_total` — counter
- `workflow_side_effects_total` — counter

---

## Loader API

### Discovery

```typescript
loader.listWorkflows()           // OkfWorkflowSpec[]
loader.getWorkflow(name)         // OkfWorkflowSpec | null
loader.listWorkflowsByTag(tag)   // OkfWorkflowSpec[]
loader.listWorkflowsByAgent(agent) // OkfWorkflowSpec[]
```

### Execution Planning

```typescript
loader.getExecutionPlan(workflow)    // OkfStep[] (topologically sorted)
```

### Configuration

```typescript
loader.getIdempotencyConfig(step)   // Idempotency config or null
loader.getRetryConfig(step)         // Retry config or null
loader.getSideEffects(step)         // OkfStep['side_effects']
```

### Validation

```typescript
loader.validateWorkflow(workflow)   // throws if invalid
loader.isIdempotent(step)          // boolean
loader.isRetryable(step)           // boolean
loader.hasWriteOperations(workflow) // boolean
```

### Documentation

```typescript
loader.formatExecutionPlan(workflow) // string (human-readable)
```

### Exports

```typescript
await loadWorkflowExecutionPlan(name)  // Promise<OkfStep[]>
await printWorkflowDoc(name)           // Promise<string>
```

---

## Common Patterns

### Pattern 1: Validate Before Execute

```typescript
try {
  loader.validateWorkflow(workflow);
  console.log('✅ Workflow is valid');
} catch (err) {
  console.error('❌ Validation failed:', err.message);
  return;
}
```

### Pattern 2: Execute with Durable Steps

```typescript
const plan = loader.getExecutionPlan(workflow);

for (const step of plan) {
  const idempotency = loader.getIdempotencyConfig(step);
  const retry = loader.getRetryConfig(step);

  await executor.step(step.name, async () => {
    // Execute the step
  }, step.stepType);
}
```

### Pattern 3: Check Mutation Handling

```typescript
if (loader.hasWriteOperations(workflow)) {
  console.log('⚠️  Workflow has mutations, using durable execution');
  // Enable durable execution, idempotency guards, etc.
}
```

### Pattern 4: Log Execution Plan

```typescript
const doc = loader.formatExecutionPlan(workflow);
logger.info(`\n${doc}`);
```

---

## Testing

Run the test suite:

```bash
npm run test tests/okf/mastra-okf-loader.test.ts
```

Tests cover:
- ✅ Loading & discovery
- ✅ Validation (cycles, dependencies, schemas)
- ✅ Execution planning (topological sort)
- ✅ Idempotency configuration
- ✅ Retry configuration
- ✅ Side effects tracking
- ✅ Documentation generation

---

## File Structure

```
sveltekit-frontend/
├── src/lib/server/okf/
│   ├── mastra-workflows.okf.yaml      # OKF schema (400+ lines)
│   └── mastra-okf-loader.ts           # Loader & validator (350+ lines)
├── docs/okf/
│   ├── MASTRA-OKF-SCHEMA.md           # Full reference
│   └── OKF-MASTRA-QUICKSTART.md       # This file
└── tests/okf/
    └── mastra-okf-loader.test.ts      # 12 test suites
```

---

## When to Use OKF

### ✅ Use OKF For
- Defining reusable workflow templates
- Validating step configurations
- Discovering available workflows
- Planning execution order
- Applying recovery patterns
- Documenting workflows

### ⚠️ OKF Does NOT
- Execute workflows (use Mastra for that)
- Store execution state (use Postgres for that)
- Handle durable execution (use DurableExecutor for that)
- Manage MCP connections (use Mastra tools for that)

**In short**: OKF is the schema layer. Mastra is the executor. DurableExecutor is the crash-safety layer.

---

## Integration with Durable Execution

OKF workflows are designed to work with [Durable Execution Architecture](../architecture/DURABLE-EXECUTION-ARCHITECTURE.md):

1. **Load workflow from OKF**: `const workflow = loader.getWorkflow('error-repair-durable')`
2. **Get execution plan**: `const steps = loader.getExecutionPlan(workflow)`
3. **Start durable execution**: `const executor = await startExecution(db, {...})`
4. **Execute steps**: For each step, call `executor.step(name, logic, type)`
5. **Apply idempotency**: Use `executor.step()` auto-caching + `idempotentWrite()`
6. **Resume on crash**: `const {executor} = await resumeExecution(runId, db)`

---

## Integration with Mastra

OKF workflows integrate with Mastra agents:

```typescript
const mastraWorkflow = new Mastra.Workflow({
  id: 'error-repair-durable',
  steps: {
    classifyError: {
      execute: async (input) => {
        const executor = input._durable_executor;
        return await executor.step('classify-error', async () => {
          // Execute Gemma4 classification
        }, 'llm_completion');
      },
    },
    // ... more steps
  },
});

// Start execution with durable executor
const executor = await startExecution(db, {...});
const result = await mastraWorkflow.execute({
  ...input,
  _durable_executor: executor,
});
await executor.complete(result);
```

---

## Next Steps

1. **Import loader**: `import { getMastraOkfLoader } from '$lib/server/okf/mastra-okf-loader'`
2. **Load schema**: `const loader = await getMastraOkfLoader()`
3. **Get workflow**: `const workflow = loader.getWorkflow('error-repair-durable')`
4. **Execute**: Follow patterns above or read full reference

---

## References

- **Full Schema Reference**: [MASTRA-OKF-SCHEMA.md](MASTRA-OKF-SCHEMA.md)
- **Durable Execution**: [DURABLE-EXECUTION-ARCHITECTURE.md](../architecture/DURABLE-EXECUTION-ARCHITECTURE.md)
- **Mastra Integration**: [MASTRA-DURABLE-EXECUTION-INTEGRATION.md](../architecture/MASTRA-DURABLE-EXECUTION-INTEGRATION.md)
- **Loader Tests**: [mastra-okf-loader.test.ts](../../tests/okf/mastra-okf-loader.test.ts)
