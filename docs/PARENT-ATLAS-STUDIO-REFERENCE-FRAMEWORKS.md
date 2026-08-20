# Parent Atlas Studio — reference-framework extraction note

Status: design note only. This records patterns to reproduce in our own Parent Atlas admin surface; it does **not** make Mastra, Paperclip, Hermes Kanban, CopilotKit, or AG-UI canonical dependencies.

Target repository: `semaj90/deeds_web_app`

Target product direction: a SvelteKit 2 / Svelte 5 / Bits UI v2 admin surface backed by Drizzle + PostgreSQL 18, with Parent Atlas workflow/task state as canonical data and optional adapters for external agent protocols.

---

## 1. Core decision

Build **our own Parent Atlas Studio** rather than adopting another framework as the control plane.

```text
Parent Atlas canonical state
        │
        ├─ PostgreSQL 18
        ├─ Drizzle repositories / transactions
        ├─ workflow/task/event lineage
        ├─ evidence + receipts
        ├─ DAG dependency state
        └─ outbox / transport adapters
                 │
                 ▼
          SvelteKit 2 admin
                 │
        ┌────────┴─────────┐
        ▼                  ▼
   Bits UI DOM        Three/WebGPU
   truth/control       activity projection
```

The admin page should borrow proven **interaction and operations patterns** from Mastra Studio, Paperclip, Hermes Kanban, and AG-UI without letting any of them become a second source of truth.

---

## 2. What to copy conceptually from Hermes Kanban

Hermes Kanban is a durable task-board primitive shared across agent profiles. Its current design distinguishes a durable board from synchronous subagent delegation and routes CLI, dashboard, and worker tools through the same board database.

Reference:
- https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban
- https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban-tutorial

### Patterns worth reproducing

#### Durable visible task lifecycle

Use a human-readable board state such as:

```text
TRIAGE
  ↓
TODO
  ↓
READY
  ↓
RUNNING
  ├─→ BLOCKED ─→ READY
  └─→ DONE
```

Parent Atlas may use different canonical status names internally, but the board should preserve this operational distinction:

- raw/untriaged work
- accepted work not yet dependency-ready
- dependency-ready work
- actively claimed work
- explicitly blocked work
- terminal completed work

#### Dependencies are first-class

Hermes lets tasks form parent/child dependency graphs instead of treating the Kanban board as a flat visual list.

Parent Atlas equivalent:

```text
Task / DAG node
   │
   ├─ depends_on[]
   ├─ blocks[]
   ├─ ready_when[]
   └─ current_run_id
```

The board is therefore a projection of the same dependency graph used by the workflow scheduler.

#### Worker heartbeats and reclaim

Borrow the operational behavior:

```text
worker claims task
      ↓
run row created
      ↓
heartbeat / useful progress
      ↓
complete

or

heartbeat expires
      ↓
run reclaimed
      ↓
task returns to READY / BLOCKED
```

For Parent Atlas, this should integrate with existing leases, run receipts, failure evidence, and revision guards rather than add another independent worker registry.

#### Same truth through multiple surfaces

Hermes exposes one board through dashboard, CLI, and agent tools. Parent Atlas should preserve the same invariant:

```text
SvelteKit admin
CLI / scripts
MCP tools
ACP adapter
A2A adapter
worker APIs

        │
        ▼
 SAME CANONICAL POSTGRES STATE
```

Do not build a UI-only task database.

#### Human-visible handoff thread

Every task should eventually support durable:

- comments / notes
- evidence references
- artifact references
- run summaries
- failure/retry notes
- approvals / unblock decisions

These are much more valuable than hidden in-process subagent context.

---

## 3. What to copy conceptually from Paperclip

Paperclip positions its dashboard as the operational cockpit for a group of heterogeneous agents and emphasizes agent activity, task progress, goals, cost/budget, governance, and recent activity.

References:
- https://docs.paperclip.ing/guides/board-operator/dashboard
- https://github.com/getpaperclipai/paperclip

### Patterns worth reproducing

#### Cockpit overview

The Parent Atlas landing view should answer in a few seconds:

```text
Is the system moving?
What is running?
What is blocked?
What needs approval?
Which agent/worker owns each action?
What failed recently?
How much resource budget is being consumed?
```

Suggested top-level cards:

```text
ACTIVE WORKFLOWS
READY TASKS
RUNNING ACTIONS
BLOCKED ACTIONS
FAILED / RETRYING
PENDING APPROVALS
GPU / VRAM ENVELOPE
TOOL / TOKEN / COST BUDGET
EVENT RATE
```

#### Agent roster / org view

Borrow the idea of a visible roster, but make it technical rather than corporate-role-centric:

```text
Planner
Retriever
AST worker
Graph worker
GPU worker
Validator
Materializer
ACP peer
A2A peer
```

For each runtime/agent show:

- status
- capabilities
- transport
- current workflow/action
- current lease/run
- last heartbeat
- recent success/failure rate
- resource envelope
- endpoint health

#### Governance should be visible

Approvals and bounded authority should be first-class UI, not hidden configuration.

Show:

- mutation approval required?
- verification required?
- current budget / envelope
- current attempt / max attempts
- exact revision being acted upon
- requested vs approved capabilities

---

## 4. What to copy conceptually from Mastra Studio

Mastra workflows support structured sequential, parallel, branching, and looping execution graphs, while Mastra Studio visualizes execution graphs and step execution.

References:
- https://mastra.ai/ai-workflows
- https://github.com/mastra-ai/mastra

### Patterns worth reproducing

#### One DAG, multiple views

Parent Atlas should render the execution topology directly from canonical workflow/DAG state:

```text
             PLANNER
               │
       ┌───────┴────────┐
       ▼                ▼
      AST            SEMANTIC
       │                │
       ├──────┐    ┌────┤
       ▼      ▼    ▼    ▼
     GRAPH   TEST GPU  EXACT
        \      │    │   /
         └─────┴────┴──┘
                ▼
             VALIDATE
                │
                ▼
             RECEIPT
```

The graph should support:

- sequential nodes
- parallel ready sets
- branching
- retry loops
- nested/sub-workflows later

#### Step inspector

Clicking a DAG node should open a Bits UI panel/dialog containing:

- input contract
- output contract
- lane
- executor/transport
- status
- attempt
- progress
- start/end timestamps
- evidence refs
- artifact refs
- failure observation
- retry reason
- exact revision/checksum

#### Run timeline / trace

A workflow needs both:

```text
TOPOLOGY VIEW
what depends on what?

TIMELINE VIEW
what actually happened and when?
```

Do not infer the DAG from UI animation order.

---

## 5. What to copy conceptually from AG-UI / CopilotKit

AG-UI is an event protocol between agent backends and user-facing applications. It standardizes lifecycle, message, tool-call, state, and custom events.

References:
- https://docs.ag-ui.com/
- https://docs.copilotkit.ai/ag-ui/introduction
- https://github.com/ag-ui-protocol/ag-ui

### Parent Atlas rule

AG-UI is an **adapter**, not the event ledger.

```text
WorkflowActionEventV1
       │
       ├─ Postgres durable history
       ├─ current materialization
       ├─ RabbitMQ / outbox
       └─ AG-UI adapter
              │
              ▼
        external/UI clients
```

Use AG-UI-style ephemeral streaming for things such as:

- text/token deltas
- frontend tool progress
- temporary shared UI state
- generated UI hints

Keep these durable in Parent Atlas only when they are real operational facts:

- action started/completed/failed
- evidence produced
- artifact produced
- approval changed
- retry scheduled
- verification receipt emitted

Do **not** persist every token delta as a canonical workflow event.

---

## 6. Parent Atlas version: proposed admin information architecture

Candidate route after existing-admin-layout reconciliation:

```text
/admin/parent-atlas
```

or, if Atlas remains a top-level product area:

```text
/atlas/studio
```

Do not duplicate both permanently.

### Navigation

```text
OVERVIEW
WORKFLOWS
KANBAN
DAG / RUNS
AGENTS
INTEGRATIONS
APPROVALS
EVIDENCE
ARTIFACTS
RUNTIMES
RETRIEVAL
GRAPH
GPU
EVENTS / AUDIT
SETTINGS
```

### Overview

Cockpit cards + live run strip + recent failures + approvals + resource envelope.

### Workflows

List active/recent `workflow_id`s with:

- revision
- sequence
- intent
- source
- status
- current ready/running/blocked counts
- ETA when evidence-supported

### Kanban

Derived board from canonical task/workflow action state.

Recommended columns:

```text
TRIAGE | TODO | READY | RUNNING | BLOCKED | DONE
```

Cards show:

- task/action title
- workflow ID
- assignee/executor
- dependencies
- progress
- attempt
- revision
- heartbeat
- evidence/artifact counts
- approval indicator

### DAG / Runs

Graph topology + execution timeline + node inspector.

### Agents

Roster of planners/workers/adapters and current leases/runs.

### Integrations

Protocol/runtime registry for:

```text
MCP
ACP
A2A
AG-UI
local worker
HTTP/RPC
gRPC
RabbitMQ
Qdrant
Neo4j
cuGraph/cuVS
llama-server / model runtimes
```

Important status vocabulary:

```text
CONFIGURED
CONNECTED
HEALTHY
DEGRADED
UNPROVEN
DISABLED
```

Configured must never imply proven.

---

## 7. Canonical technical ownership

```text
SvelteKit 2
  = SSR routes, server actions/endpoints, SSE delivery

Svelte 5 runes
  = browser projection of semantic events

Bits UI v2
  = authoritative accessible controls and state display

Drizzle ORM
  = typed persistence boundary and transactions

PostgreSQL 18
  = canonical workflow/task/event/approval/evidence truth

pgvector
  = PostgreSQL semantic retrieval executor/index, not workflow truth

RabbitMQ
  = durable asynchronous commands/events where required

gRPC
  = targeted executor calls where required

ACP / A2A / AG-UI / MCP
  = adapters at their appropriate protocol boundaries

Three.js / WebGPU
  = optional spatial/activity visualization only
```

---

## 8. Canonical event flow

```text
executor / scheduler / adapter
           │
           ▼
WorkflowActionEventV1
           │
           ▼
Postgres transaction
     ┌─────┴───────────┐
     ▼                 ▼
append-only event   current projection
     │                 │
     └──────┬──────────┘
            ▼
           outbox
            │
      ┌─────┼───────────────┐
      ▼     ▼               ▼
     SSE  RabbitMQ       external adapter
      │                     AG-UI/ACP/A2A
      ▼
Svelte $state
   ┌──┴───────────┐
   ▼              ▼
Bits UI        Three/WebGPU
truth UI       visual projection
```

---

## 9. Board / workflow invariants to preserve

1. **Board status is not canonical identity.** Moving a card changes operational state, never entity identity.
2. **Task != run.** A task may have many attempts/runs.
3. **Run != agent.** Agents execute runs but do not own canonical task truth.
4. **Ready is dependency-derived.** Do not let a drag operation bypass unresolved dependencies without an explicit override event.
5. **Blocked needs a reason.** Store blocker/evidence, not only `status='blocked'`.
6. **Heartbeat is liveness evidence, not completion evidence.**
7. **A UI animation is never a workflow transition.**
8. **All write surfaces converge on the same Postgres transaction/repository rules.**
9. **SSR = current snapshot; SSE = later deltas.**
10. **CDC is for data-change propagation, not reconstruction of semantic agent intent.**
11. **One `workflow_id` lineage must remain visible through DAG, Kanban, events, evidence, retries and UI.**
12. **Approximate retrieval/projections cannot rewrite canonical workflow truth.**

---

## 10. First implementation tranche

Do this before copying every visual feature from the reference products:

```text
STUDIO-01
Canonical workflow/task/run projection contract

STUDIO-02
Kanban board from canonical state

STUDIO-03
Task detail drawer with comments/evidence/artifacts/runs

STUDIO-04
DAG topology + execution timeline

STUDIO-05
Agent/runtime roster + heartbeat/lease status

STUDIO-06
Integration registry with CONFIGURED vs PROVEN distinction

STUDIO-07
Approval / unblock / retry controls

STUDIO-08
SSE workflow stream with revision/sequence gap recovery

STUDIO-09
AG-UI output adapter for external/UI interoperability

STUDIO-10
Optional Three/WebGPU Jester activity projection
```

The 3D/game visualization is deliberately last in the canonical dependency order. The DOM admin page must remain complete without it.

---

## 11. Feature ideas to borrow later

From Hermes:

- multiple boards/workspaces
- dependency-aware auto-ready
- dispatcher concurrency limit
- worker heartbeat and reclaim
- task comments
- task attachments
- explicit run history
- verifier/synthesizer swarm pattern
- board-by-profile / agent lane view

From Paperclip:

- global cockpit dashboard
- agent roster and current activity
- resource/cost budget cards
- recent activity feed
- governance/approval visibility
- goal/work alignment

From Mastra Studio:

- workflow graph visualization
- step-by-step trace
- run inspector
- sequential/parallel/branch/loop visualization
- tool/agent execution inspection

From AG-UI/CopilotKit:

- shared frontend/agent state
- tool-call presentation
- human-in-the-loop interaction events
- external frontend interoperability
- ephemeral text/state streaming separate from durable workflow lineage

---

## 12. License / copying rule

Use these projects primarily as architecture and UX references.

As of this note:

- Hermes Agent repository: MIT licensed.
- Paperclip repository: MIT licensed.
- Mastra core is primarily Apache-2.0, but `ee/` directories use a separate enterprise license and must not be copied into Parent Atlas without an explicit license review.

Even when source is permissively licensed, prefer implementing Parent Atlas-native contracts instead of importing foreign persistence/event semantics wholesale. If literal code is copied or substantially adapted, preserve required notices and document provenance.

---

## 13. Summary rule

```text
COPY THE PRODUCT PATTERNS
NOT THE SOURCE OF TRUTH
```

Parent Atlas Studio should feel as operationally useful as Hermes Kanban, Paperclip, and Mastra Studio while remaining:

```text
SvelteKit-native
Postgres-native
revision-qualified
evidence-linked
DAG-aware
agent-framework-neutral
protocol-adaptable
GPU-optional
```

The framework references are design inputs. Parent Atlas remains the owner.
