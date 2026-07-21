# Mastra OKF Schema Reference

**Version**: 1.0 | **Status**: Stable | **Last Updated**: July 20, 2026

The Mastra OKF (OpenCode Knowledge Framework) schema defines workflow templates, tool bindings, and durable execution patterns for Atlas agents.

---

## Overview

OKF provides:

1. **Workflow Discovery** — Agents query the registry to find available workflows
2. **Schema Validation** — All steps, tools, and dependencies are validated on load
3. **Execution Planning** — Topologically sorted step order with dependency tracking
4. **Recovery Patterns** — Idempotency strategies, checkpoints, and resume logic
5. **Observability** — Metrics, tracing, and logging configuration

---

## Schema Structure

### Top-Level Sections

```yaml
apiVersion: okf.atlas.ai/v1
kind: WorkflowSchema

metadata: { ... }           # Schema metadata (version, author, date)
workflows: { ... }         # Workflow definitions
tools: { ... }             # MCP tool bindings
stepTypes: { ... }         # Reusable step templates
idempotency_strategies: {} # Idempotency patterns
recovery: { ... }          # Checkpoint & resume logic
error_handling: { ... }    # Retry policies
observability: { ... }     # Metrics & tracing
registry: { ... }          # Discovery & validation rules
annotations: { ... }       # Cost, compliance, SLA
examples: { ... }          # Reference implementations
validation_rules: [ ... ]  # JSON Schema compliance checks
```

---

## Workflows

### Workflow Definition

```yaml
workflows:
  error-repair-durable:
    metadata:
      name: error-repair-durable
      description: Classify, repair, and validate code fixes with crash recovery
      agent: error-repair-agent
      tags: [repair, error-fixing, code-generation, crash-safe]
      criticality: high
      estimated_duration_ms: 30000

    spec:
      # Input contract (JSON Schema)
      input:
        type: object
        required: [query, errorClass, filePath]
        properties:
          query:
            type: string
            minLength: 1
            maxLength: 2000

      # Output contract (JSON Schema)
      output:
        type: object
        required: [ok, summary, runId]
        properties:
          ok: { type: boolean }
          summary: { type: string }
          runId: { type: string, pattern: '^[a-zA-Z0-9-]{36}$' }

      # Execution steps (topologically sorted by executor)
      steps:
        - name: classify-error
          stepType: llm_completion
          # ... step definition
```

### Workflow Metadata

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Unique workflow identifier |
| `description` | string | ✅ | Human-readable purpose |
| `agent` | string | ✅ | Owner agent name |
| `tags` | string[] | ✅ | Searchable keywords |
| `criticality` | enum | ✅ | low \| medium \| high \| critical |
| `estimated_duration_ms` | number | ✅ | Expected execution time |

---

## Steps

### Step Definition

Each step in `spec.steps` is an atomic operation:

```yaml
steps:
  - name: classify-error
    stepType: llm_completion
    description: Classify error and assess severity
    model: gemma4-legal-iq4xs-direct.gguf
    timeout_ms: 10000

    # Data contracts
    input: { ... }        # JSON Schema for inputs
    output: { ... }       # JSON Schema for outputs

    # Idempotency configuration
    idempotency:
      enabled: true
      key_formula: 'runId:classify-error:input_hash'
      cache_ttl_seconds: 3600

    # Optional: side effects (mutations)
    side_effects:
      - type: file_write
        resource_id: filePath
        operation: WRITE
        reversible: true

    # Optional: retry policy
    retry:
      max_attempts: 2
      backoff_ms: 1000

    # Optional: explicit dependencies
    depends_on: [previous-step]
```

### Step Types

| Type | Idempotent | Retryable | Side Effects | Use For |
|------|-----------|-----------|--------------|---------|
| `llm_completion` | ✅ Yes | ✅ Yes | None | Gemma4/Ollama calls |
| `tool_call` | ✅ Yes | ✅ Yes | None | MCP tool invocations |
| `db_mutation` | ❌ No | ❌ No | Required | Database writes |
| `file_write` | ❌ No | ❌ No | Required | Filesystem writes |
| `validation` | ✅ Yes | ✅ Yes | None | Pure computation |

---

## Idempotency

### Configuration

```yaml
idempotency:
  enabled: true
  key_formula: 'runId:step_name:input_hash'
  cache_ttl_seconds: 3600
  strategy: write_guard  # for mutations
  check_table: execution_side_effects
  check_columns: [resource_id, operation]
```

### Key Formula

Automatically generates deterministic keys:

- `runId:step_name:input_hash` — LLM calls, read operations
- `runId:step_name:resource_id` — File writes, DB mutations

### Strategies

| Strategy | Use | Check Before |
|----------|-----|--------|
| `step_cache` | LLM, tool calls, validation | `execution_journal_steps.output` |
| `write_guard` | DB mutations, file writes | `execution_side_effects` |

---

## Side Effects

Track all mutations:

```yaml
side_effects:
  - type: db_write            # or file_write, api_call, cache_invalidate
    resource_id: table_name   # table name, file path, or endpoint
    operation: INSERT          # INSERT, UPDATE, DELETE, WRITE
    reversible: true          # can this be undone?
    reverse_operation: DELETE # how to undo
```

**Why**: Idempotent re-execution needs to know what was already changed.

---

## Retry Policy

```yaml
retry:
  max_attempts: 2
  backoff_ms: 1000
```

**Rules**:
- ✅ LLM calls: retry up to 2 times
- ✅ Tool calls: retry up to 2 times
- ✅ Validation: retry up to 2 times
- ❌ DB mutations: **never retry** (not idempotent)
- ❌ File writes: **never retry** (not idempotent)

---

## Dependencies

Explicit step ordering:

```yaml
depends_on:
  - classify-error
  - propose-repair
```

**Execution order**: Executor topologically sorts steps and ensures:
1. All dependencies complete before dependent step starts
2. Circular dependencies are detected on load
3. Recovery respects dependency order

---

## Tools

Tool bindings for MCP integration:

```yaml
tools:
  search-codebase:
    apiVersion: mcp.tool/v1
    kind: Tool
    metadata:
      name: search-codebase
      provider: atlas-tools
      description: Search Atlas packet index

    spec:
      input:
        type: object
        required: [query]
        properties:
          query: { type: string }

      output:
        type: object
        properties:
          packets: { type: array }

      timeout_ms: 5000
      retry_policy: exponential_backoff
```

---

## Recovery

### Checkpoint

```yaml
recovery:
  checkpoint:
    description: Saved after each step succeeds
    storage: execution_runs.checkpoint_step_id
    granularity: per_step
    automatic: true
```

### Resume

```yaml
  resume:
    algorithm:
      - load_execution_run_by_run_id
      - build_recovery_map_from_completed_steps
      - skip_steps_in_recovery_map
      - continue_from_checkpoint_step
      - record_recovery_count
```

**On resume**:
1. Load execution_run from Postgres
2. Build recovery_map of completed steps
3. Skip all steps in recovery_map
4. Continue from checkpoint_step_id

### Rollback

```yaml
  rollback:
    strategy: apply_reverse_operation
    supported_for: [file_write]
    on_rollback_failure: manual_review
```

---

## Error Handling

### Hard Failures (No Retry)

```yaml
error_handling:
  hard_failures:
    - step_type: db_mutation
      max_retries: 0
      action: suspend_for_review

    - step_type: file_write
      max_retries: 0
      action: suspend_for_review
```

### Soft Failures (With Retry)

```yaml
  soft_failures:
    - step_type: llm_completion
      max_retries: 2
      backoff_ms: 1000
      action: retry_then_fail
```

---

## Observability

### Metrics

```yaml
observability:
  metrics:
    - name: workflow_executions_total
      type: counter
      dimensions: [agent, workflow, status]

    - name: workflow_steps_duration_seconds
      type: histogram
      dimensions: [workflow, step_name, status]

    - name: workflow_cache_hits_total
      type: counter
      dimensions: [workflow, step_type, cache_type]
```

### Tracing

```yaml
  tracing:
    enabled: true
    export_to: [postgres_journal, langfuse_optional]
    trace_fields:
      - run_id
      - task_id
      - step_name
      - status
      - duration_ms
      - cache_hit
```

---

## Validation

### On Load

```yaml
registry:
  validation:
    on_load: strict

    rules:
      - all_steps_must_have_names: true
      - all_steps_must_have_types: true
      - circular_dependencies_forbidden: true
      - input_schema_must_be_valid: true
      - all_dependencies_must_exist: true
      - all_models_must_be_available: true
```

### Validation Rules

| Rule | Applies To | Severity | Check |
|------|-----------|----------|-------|
| `input_required` | workflow | error | spec.input is valid JSON Schema |
| `output_required` | workflow | error | spec.output is valid JSON Schema |
| `steps_required` | workflow | error | spec.steps is non-empty |
| `step_names_unique` | workflow | error | all step names are unique |
| `dependencies_valid` | workflow | error | all depends_on refs exist |
| `no_cycles` | workflow | error | dependency graph is acyclic |
| `models_available` | step | warning | model exists if llm_completion |
| `timeout_reasonable` | step | warning | timeout between 1s–300s |

---

## Discovery

### List Workflows

```typescript
const loader = await getMastraOkfLoader();

// All workflows
loader.listWorkflows();

// By tag
loader.listWorkflowsByTag('repair');

// By agent
loader.listWorkflowsByAgent('error-repair-agent');
```

### Get Workflow

```typescript
const workflow = loader.getWorkflow('error-repair-durable');
```

### Get Execution Plan

```typescript
const plan = loader.getExecutionPlan(workflow);
// Returns: OkfStep[] in topological order
```

### Print Documentation

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

## Usage Patterns

### Pattern 1: Execute Workflow

```typescript
import { getMastraOkfLoader } from '$lib/server/okf/mastra-okf-loader';

const loader = await getMastraOkfLoader();
const workflow = loader.getWorkflow('error-repair-durable');
const steps = loader.getExecutionPlan(workflow);

for (const step of steps) {
  const idempotency = loader.getIdempotencyConfig(step);
  const retry = loader.getRetryConfig(step);

  await executor.step(step.name, async () => {
    // Execute step logic
  }, step.stepType);
}
```

### Pattern 2: Validate Before Execute

```typescript
try {
  loader.validateWorkflow(workflow);
  console.log('✅ Workflow is valid');
} catch (err) {
  console.error('❌ Validation failed:', err.message);
}
```

### Pattern 3: Check for Mutations

```typescript
if (loader.hasWriteOperations(workflow)) {
  console.log('⚠️  Workflow has write operations, enabling durable execution');
}
```

### Pattern 4: Get Idempotency Strategy

```typescript
const step = steps[0];
if (loader.isIdempotent(step)) {
  const config = loader.getIdempotencyConfig(step);
  // Apply cache: key_formula, ttl, strategy
}
```

---

## Examples from Schema

### Example 1: Basic Execution

```typescript
executor = await startExecution(db, {
  runId: 'repair-abc123',
  taskId: 'task-456',
  agent: 'error-repair-agent',
  input: {
    query: 'fix missing imports',
    errorClass: 'import_error',
    filePath: 'src/test.ts'
  }
});

result = await errorRepairWorkflow.execute({
  ...input,
  _durable_executor: executor
});

await executor.complete(result);
```

### Example 2: Crash Recovery

```typescript
{ executor, recoveryMap } = await resumeExecution(runId, db);

// executor automatically skips steps in recoveryMap
result = await errorRepairWorkflow.execute({
  ...input,
  _durable_executor: executor
});
```

### Example 3: Idempotent Write

```typescript
{ alreadyWritten, result } = await idempotentWrite(db, {
  runId,
  stepName: 'apply-repair',
  resourceId: 'src/foo.ts',
  operation: 'WRITE',
  write: async () => writeFile(path, patch),
  newValue: { patch }
});

if (alreadyWritten) {
  console.log('Patch already applied, skipping');
}
```

---

## File Location

- **YAML Schema**: `src/lib/server/okf/mastra-workflows.okf.yaml`
- **Loader**: `src/lib/server/okf/mastra-okf-loader.ts`
- **Tests**: `tests/okf/mastra-okf.test.ts` (examples)

---

## Next Steps

1. **Load the schema**: `const loader = await getMastraOkfLoader()`
2. **Query workflows**: `loader.listWorkflows()` or `getWorkflow(name)`
3. **Validate**: `loader.validateWorkflow(workflow)`
4. **Execute**: `const plan = loader.getExecutionPlan(workflow)`
5. **Observe**: Use metrics + tracing from observability section

---

## References

- [Durable Execution Architecture](../architecture/DURABLE-EXECUTION-ARCHITECTURE.md)
- [Mastra Integration Guide](../architecture/MASTRA-DURABLE-EXECUTION-INTEGRATION.md)
- [OKF Loader API](../../src/lib/server/okf/mastra-okf-loader.ts)
