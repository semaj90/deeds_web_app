# OpenSpec Integration Plan

**Date:** June 29, 2026  
**Status:** ⏳ PLANNING (Ready to implement)  
**Scope:** Spec-driven planning layer above LangGraph/NATS/Go sidecar

---

## Executive Summary

OpenSpec becomes your **workstation executive planner**—the layer that decomposes user intent into executable task specs before they reach LangGraph. It does NOT replace retrieval or GPU work; it generates specs that workers execute.

### Current Architecture (Before OpenSpec)
```
User request
    ↓
One-off script (idle-review, codebase-todo, parent-atlas-patch)
    ↓
Direct retrieval/GPU/Postgres calls
    ↓
Ad-hoc logging
```

### After OpenSpec Integration
```
User request (via /command or idle trigger)
    ↓
OpenSpec Planner
├─ Decompose intent
├─ Validate dependencies
├─ Generate task specs
└─ Assign priorities
    ↓
Agent Scheduler
├─ Enqueue tasks
├─ Resolve dependencies
└─ Track metrics
    ↓
LangGraph Worker
    ↓
NATS Event Bus
    ↓
Go Sidecar (execution)
```

---

## Why OpenSpec Fits

| Layer | Tool | Role |
|-------|------|------|
| **Planning** | OpenSpec | Spec decomposition, acceptance criteria, verification gates, dependency analysis |
| **Orchestration** | LangGraph | State transitions, retry logic, tool invocation |
| **Messaging** | NATS | Async event pub/sub, request/reply semantics |
| **Coordination** | Go Sidecar | Long-running handler for all 5 NATS subjects |
| **Execution** | GPU workers, Postgres, Indexer | Actual work (AE, SOM, Attention, Rerank, Summary, Index) |
| **Truth** | PostgreSQL | Immutable event log (agent_os_events) |
| **Cache** | Valkey | L1 runtime cache (7-14 day TTL) |

**Key separation:**
- OpenSpec = **what to do** (specs, tasks, criteria)
- LangGraph = **how to do it** (orchestrate, retry, tool calls)
- NATS/Go = **where to do it** (distributed, async, resilient)

---

## OpenSpec Installation & Setup

### 1. Install OpenSpec

```bash
# Option A: npm (recommended for Node/SvelteKit integration)
npm install --save-dev @openspec/cli @openspec/sdk

# Option B: pip (if using Python sidecars)
pip install openspec

# Option C: Standalone binary (all platforms)
# Download from https://github.com/openspec/openspec/releases
curl -L https://github.com/openspec/openspec/releases/download/v1.0.0/openspec-darwin-arm64 -o /usr/local/bin/openspec
chmod +x /usr/local/bin/openspec

openspec --version  # Verify installation
```

### 2. Initialize in Project

```bash
cd sveltekit-frontend
openspec init

# Creates:
# .openspec/config.yaml
# .openspec/specs/  (directory)
# .openspec/templates/
# .openspec/verifiers/
```

### 3. Configuration (`.openspec/config.yaml`)

```yaml
# OpenSpec config for deeds-web-app

version: '1.0'

project:
  name: deeds-web-app
  version: "1.0.0"
  owner: workstation-agent-os

# Spec templates
spec_templates:
  - path: .openspec/templates/task.yaml
    type: task
  - path: .openspec/templates/feature.yaml
    type: feature
  - path: .openspec/templates/refactor.yaml
    type: refactor
  - path: .openspec/templates/fix.yaml
    type: fix

# Verification gates
verifiers:
  - name: syntax_check
    command: "node --check {file}"
    required: true
  - name: atlas_lineage
    command: "npm run atlas:lineage:verify --file {file}"
    required: true
  - name: unit_tests
    command: "npm run test -- {file}"
    required: false

# Rollback strategies
rollback:
  - name: git_restore
    command: "git checkout {original_file}"
  - name: cache_invalidate
    command: "npm run cache:invalidate -- {affected_keys}"

# Integration points
integrations:
  langraph:
    url: "http://localhost:3000/api/langraph"
    endpoint: "tasks/execute"
  postgres:
    url: "postgresql://legal_admin:password@127.0.0.1:5432/legal_ai_db"
    table: "agent_scheduler_jobs"
  nats:
    url: "nats://localhost:4222"
    subject: "spec.decomposed"
```

---

## Spec-Driven Workflow

### Example 1: User Request via OpenCode

```
User types: /parent-atlas-patch src/lib/server/ace/context-assembler.ts "add gpu reranker fallback"
    ↓
OpenCode routes to parent-atlas-patch command handler
    ↓
Handler calls: `openspec decompose --intent "add gpu reranker fallback" --target src/lib/server/ace/context-assembler.ts`
    ↓
OpenSpec generates spec (YAML):
```

```yaml
# .openspec/specs/context-assembler-gpu-fallback-20260629.yaml

metadata:
  spec_id: spec-ctx-asm-gpu-fb
  version: 1
  created_at: 2026-06-29T15:30:00Z
  user: workstation
  intent: "add gpu reranker fallback when CUDA unavailable"

intent:
  description: "Ensure context-assembler falls back to CPU reranking if GPU unavailable"
  priority: high
  complexity: medium
  estimated_duration_minutes: 15

target:
  file: src/lib/server/ace/context-assembler.ts
  line_range: [240, 280]  # reranker call site
  feature_id: ace.gpu_reranker
  source_ref: src/lib/server/ace/context-assembler.ts

decomposition:
  - task_id: task-1
    title: "Retrieve reranker architecture"
    type: information_gathering
    acceptance_criteria:
      - "Found reranker function signature"
      - "Identified GPU initialization point"
      - "Located fallback hook location"
    dependencies: []
  
  - task_id: task-2
    title: "Implement CPU fallback logic"
    type: code_change
    acceptance_criteria:
      - "Fallback function added"
      - "Error handling covers OOM/timeout"
      - "Fallback slower but maintains correctness"
    dependencies: [task-1]
  
  - task_id: task-3
    title: "Validate syntax and lineage"
    type: verification
    acceptance_criteria:
      - "node --check passes"
      - "npm run atlas:lineage:verify passes"
      - "Type checking shows no errors"
    dependencies: [task-2]
  
  - task_id: task-4
    title: "Record outcome in Engram"
    type: observation
    acceptance_criteria:
      - "Engram packet created/updated"
      - "Trace recorded in agent_os_events"
    dependencies: [task-3]

verification:
  gates:
    - gate_id: syntax_gate
      command: "node --check {file}"
      required: true
      rollback: "git checkout {original_file}"
    
    - gate_id: lineage_gate
      command: "npm run atlas:lineage:verify --file {file}"
      required: true
      rollback: "npm run cache:invalidate -- {affected_keys}"
    
    - gate_id: test_gate
      command: "npm run test -- src/lib/server/ace/context-assembler.ts"
      required: false

rollback_plan:
  - step: "Restore original file"
    command: "git checkout src/lib/server/ace/context-assembler.ts"
  - step: "Invalidate caches"
    command: "npm run cache:invalidate -- ace:context:* bifrost:*"
  - step: "Record rollback in Engram"
    command: "npm run engram:record:task -- --status failed --reason 'User rollback'"

estimated_cost:
  tokens: 2000
  latency_ms: 8000
  cache_hits_expected: 3

risk_assessment:
  risk_level: low
  concerns:
    - "Changes GPU error path (rarely executed)"
    - "Fallback adds ~200ms latency"
  mitigations:
    - "Add unit tests for fallback path"
    - "Cache pre-computed fallback results"
```

This spec gets passed to LangGraph:

```
LangGraph reads spec_id: spec-ctx-asm-gpu-fb
    ↓
For each task in decomposition:
    ├─ task-1 (information_gathering)
    │   └─ Call: atlas.packet_search, engram.recall
    ├─ task-2 (code_change)
    │   └─ Call: gemma4_synthesis, ops.propose_patch
    ├─ task-3 (verification)
    │   └─ Call: syntax_check, atlas_lineage, test runner
    └─ task-4 (observation)
        └─ Call: engram.ace_packet_inject, agent_os_events INSERT
    ↓
Store result in Agent Scheduler job (agent_scheduler_jobs table)
    ↓
NATS publishes: spec.decomposed + job.queued
    ↓
Go Sidecar receives, logs to Layer 1 (agent_os_events)
```

---

### Example 2: Idle-Triggered Workflow

```
VS Code idle for 30s
    ↓
openspec decompose --trigger idle --git_state {branch, commits, dirty_files}
    ↓
OpenSpec generates spec for "incremental indexing + health check + GPU refresh"
    ↓
Spec includes subtasks:
    - git_state_analysis (info gathering)
    - blocker_detection (decision making)
    - gpu_refresh_planner (scheduling)
    - cache_warmer (optimization)
    - recommendation_generator (synthesis)
    ↓
LangGraph processes spec → Agent Scheduler queues jobs
    ↓
NATS publishes events
    ↓
Workers pick up queued jobs
```

---

### Example 3: Kanban Task Decomposition

```
User creates Kanban card: "Implement cuVS GPU search service"
    ↓
Card metadata includes acceptance_criteria + labels + priority
    ↓
openspec decompose --kanban-card card-id
    ↓
OpenSpec generates 8-task spec:
    - Research cuVS API (info gathering)
    - Design Go sidecar integration (design)
    - Implement service (code)
    - Write unit tests (verification)
    - Integration test (verification)
    - Performance baseline (measurement)
    - Document API (documentation)
    - Record in Engram (observation)
    ↓
Each task → Agent Scheduler job
    ↓
Kanban card auto-updates as tasks complete
```

---

## Recommendation Engine (Unified)

Currently scattered across idle-review + codebase-todo + parent-atlas-patch. OpenSpec can generate unified recommendation specs.

```typescript
// scripts/executive-planner.mjs (new)

import Openspec from '@openspec/sdk';

export async function generateRecommendations(context) {
  const openspec = new Openspec({
    configPath: '.openspec/config.yaml'
  });

  // Collect signals
  const signals = {
    recent_commits: context.gitState.commits,
    build_failures: await queryBuildFailures(),
    test_failures: await queryTestFailures(),
    redis_signals: await readRedisSignals(), // gpu:karpathy:scores, ace:authority:top
    replay_reward: await computeReplayReward(),
    gpu_availability: await checkGpuHealth(),
    task_dependencies: await loadTaskDependencies(),
    openspec_tasks: await openspec.listActiveTasks(),
    kanban_state: await readKanbanBoard(),
    policy_scores: await loadPolicyScores(),
  };

  // OpenSpec generates spec for "determine next priorities"
  const recommendationSpec = await openspec.decompose({
    intent: 'Recommend next 7 tasks based on current signals',
    context: signals,
    template: 'recommendation_engine'
  });

  // Returns:
  // {
  //   spec_id: "rec-20260629-001"
  //   recommendations: [
  //     {
  //       rank: 1,
  //       task: "GPU refresh stale packets",
  //       priority: 0.92,
  //       eta_minutes: 45,
  //       confidence: 0.87,
  //       cost: { tokens: 5000, latency_ms: 30000 },
  //       risk: "low",
  //       suggested_agent: "gpu-worker",
  //       suggested_tools: ["gpu_compute_events", "packet_features"],
  //       verification: ["gpu_feature_cache:consistency", "packet_features:row_count"]
  //     },
  //     { rank: 2, ... },
  //     ...
  //   ]
  // }

  return recommendationSpec;
}
```

---

## Integration with Agent Scheduler

### Before: Separate Scripts

```
idle-review.mjs
  ├─ git state
  ├─ mock recommendations
  └─ simulate NATS publish

codebase-todo-aggregator.mjs
  ├─ Redis signals
  ├─ mock blend
  └─ simulate cache warm

parent-atlas-patch (command)
  ├─ inline L0-L11 logic
  └─ direct Postgres writes
```

### After: OpenSpec → Agent Scheduler → Workers

```
Executive Planner (unified):
  ├─ Collect signals (git, Redis, Postgres, GPU, Kanban)
  ├─ Call OpenSpec.decompose()
  ├─ Returns: spec_id + recommendation_spec
  └─ Insert into Agent Scheduler

Agent Scheduler (from Session 94):
  ├─ Read queued jobs
  ├─ Assign to workers
  ├─ Track dependencies
  └─ Publish NATS events

LangGraph Worker (Phase 6a):
  ├─ Read job from Postgres
  ├─ Execute tasks from spec.decomposition
  ├─ Call registered tools (retrieval, synthesis, verification)
  └─ Update Postgres job status

NATS (event bus):
  ├─ spec.decomposed
  ├─ task.started
  ├─ task.completed
  └─ recommendation.published

Go Sidecar (coordination):
  ├─ Receive NATS events
  ├─ INSERT agent_os_events (Layer 1 truth)
  ├─ Publish bifrost.invalidate
  └─ Trigger cache invalidation (Valkey)
```

---

## Implementation Roadmap

### Phase 1: Install & Configure (Session 95, 1 hour)
- [ ] `npm install @openspec/cli @openspec/sdk`
- [ ] `openspec init`
- [ ] Create `.openspec/config.yaml` (copy template below)
- [ ] Create spec templates (task.yaml, feature.yaml, refactor.yaml)
- [ ] Test: `openspec decompose --help`

### Phase 2: Integrate with Agent Scheduler (Session 96, 2 hours)
- [ ] Write `executive-planner.mjs` (unified recommendation generator)
- [ ] Wire OpenSpec output → Agent Scheduler jobs
- [ ] Test spec generation (dry-run mode)
- [ ] Add npm script: `npm run plan:recommendations`

### Phase 3: LangGraph Integration (Session 97, 3 hours)
- [ ] LangGraph node reads spec_id from Agent Scheduler job
- [ ] For each task in spec.decomposition: invoke registered tools
- [ ] Update job status in Postgres (task.started → task.completed)
- [ ] Emit NATS events on transitions

### Phase 4: Verification & Rollback (Session 98, 2 hours)
- [ ] Implement verification gate runner (from spec.verification)
- [ ] Wire rollback commands (from spec.rollback_plan)
- [ ] Test end-to-end (spec → LangGraph → verification → Engram)

### Phase 5: Kanban Integration (Session 99, 2 hours)
- [ ] OpenCode Kanban board syncs with OpenSpec tasks
- [ ] Card completion triggers spec task completion
- [ ] Spec completion triggers card state update

---

## Spec Template Examples

### `.openspec/templates/task.yaml`

```yaml
metadata:
  type: task
  schema_version: "1.0"

intent:
  description: string
  priority: enum(low, medium, high)
  complexity: enum(low, medium, high)
  estimated_duration_minutes: integer

target:
  file: string
  feature_id: string
  source_ref: string

decomposition:
  - task_id: string
    title: string
    type: enum(information_gathering, decision_making, code_change, verification, observation)
    acceptance_criteria: array(string)
    dependencies: array(string)  # references other task_ids

verification:
  gates:
    - gate_id: string
      command: string
      required: boolean
      rollback: string

rollback_plan:
  - step: string
    command: string

estimated_cost:
  tokens: integer
  latency_ms: integer
  cache_hits_expected: integer

risk_assessment:
  risk_level: enum(low, medium, high)
  concerns: array(string)
  mitigations: array(string)
```

---

## npm Scripts to Add

```json
{
  "openspec:init": "openspec init",
  "openspec:list": "openspec list --active",
  "openspec:decompose": "openspec decompose --intent",
  "openspec:verify": "openspec verify --spec-id",
  "plan:recommendations": "node scripts/executive-planner.mjs",
  "plan:idle": "node scripts/executive-planner.mjs --trigger idle",
  "plan:kanban:decompose": "openspec decompose --kanban-card",
  "agent:scheduler:from-spec": "node scripts/agent/scheduler-from-openspec.mjs"
}
```

---

## Key Principles

1. **OpenSpec generates specs, LangGraph executes them**
   - Clean separation: planning vs. execution
   - Specs are versioned, auditable, reproducible

2. **Specs reference Postgres truth (no hardcoded paths)**
   - `feature_id` → atlas_feature_labels lookup
   - `source_ref` → atlas_source_refs lookup
   - Specs are identity-gated

3. **Verification gates are mandatory before rollback**
   - All specs include verification section
   - Rollback only if ALL required gates pass
   - User confirmation required for high-risk specs

4. **Metrics flow to Agent Scheduler → Engram → Policy**
   - OpenSpec records estimated_cost
   - LangGraph records actual_cost + execution_time
   - Comparison trains policy model (GRPO)

5. **Specs are idempotent**
   - Running same spec twice produces identical results
   - No silent data races or corruption
   - Rollback can be run multiple times safely

---

## Why This Matters

Without OpenSpec:
- ❌ Recommendation logic scattered across 3+ scripts
- ❌ No formal spec → LangGraph contract
- ❌ Ad-hoc acceptance criteria (user guesses)
- ❌ Rollback plans are informal (git checkout?)
- ❌ Hard to replay or learn from past decisions

With OpenSpec:
- ✅ Unified spec-driven workflow
- ✅ Formal spec → LangGraph → Agent Scheduler → Workers pipeline
- ✅ Machine-readable acceptance criteria (verification gates)
- ✅ Formal rollback plans (versioned, tested)
- ✅ Specs are artifacts that can be replayed for training

---

## Next Steps

1. **Install OpenSpec** (5 min): `npm install @openspec/cli @openspec/sdk`
2. **Initialize** (5 min): `openspec init`
3. **Copy template configs** (from this doc)
4. **Write executive-planner.mjs** (2 hours)
5. **Test spec generation** (dry-run: `openspec decompose --intent "..."`)
6. **Wire to Agent Scheduler** (1 hour)
7. **Test end-to-end** (spec → Postgres job → NATS event → Layer 1 event log)

---

**Status:** ⏳ Ready to implement  
**Owner:** Workstation Executive Planner  
**Next:** Session 95 installation + configuration
