# Proposal: Agentic Run Receipts Bound to OpenSpec Changes

## Memory/agent ownership update — 2026-09-05

This updates the existing agentic-run-receipt-binding owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

Keep WorkflowActionEventV1 as canonical run/action/event identity and
WorkflowExecutionCoordinatesV1 as the framework/runtime/checkpoint/transport separator.
Mastra snapshots and LangGraph checkpoints are backend artifacts. Audit existing
evidenceRefs/artifactRefs first; add a missing checkpoint link only after proving the
existing shape cannot express it. Preserve event identity and authorization across retries.

The curated post-run digest question is still open, distinct from raw event history.
Resolve reuse with ContextManifest/summary/artifact refs before creating a new type.
No checkpoint storage or live recorder is implemented by this planning update.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.

## Problem

Agentic workflow runs (ACP tool-call chains, A2A tasks, `Workflow`/`Agent` forks) already produce
real usage data when they finish — token cost, wall-clock duration, tool-call counts, and (when
the agent edited files) a file list. Example, verbatim from this session's fork-completion
notification:

```
<usage><subagent_tokens>752970</subagent_tokens><tool_uses>6</tool_uses><duration_ms>77383</duration_ms></usage>
```

None of that currently lands anywhere durable. It's visible once in the task-notification, then
gone. The human operator (or a future session with no memory of this one) has no record of which
OpenSpec change a given agentic run was working under, what it cost, or what it touched — so
`tasks.md` checkboxes get hand-transcribed from memory, if at all, and cost/time accounting for
agentic work is invisible.

## Goal

When an agentic workflow reports back, automatically produce a structured **run receipt**
(tokens, duration, files edited, summary) and bind it to the OpenSpec change it was working
under, so `tasks.md` accumulates a real, machine-written execution ledger instead of relying on
the coordinating session to remember and transcribe it correctly.

## Non-goals (explicitly out of scope for this change)

- Not a general APM/observability system — no dashboards, no Langfuse/Grafana wiring. That's the
  existing ACP/MCP telemetry system (`packages/atlas-core/src/telemetry/`); this change produces
  the *receipt*, not the analysis layer on top of it.
- Not a replacement for git history — "files edited" here is a *self-reported convenience index*
  pointing at commits/diffs, not a second source of truth. `git log`/`git blame` remain
  authoritative for what actually changed.
- Does not modify how `Workflow`/`Agent` tools compute usage — this change only consumes the
  `usage` block those tools already emit and the file-edit list an agent already knows it touched.

## Design

### 1. Receipt schema (`AgenticRunReceiptV1`)

```ts
interface AgenticRunReceiptV1 {
  schema: 'atlas.agentic-run-receipt.v1';
  openspecChange: string;        // slug under openspec/changes/, e.g. "parent-atlas-compiler-semantic-graph-resolution"
  taskRef?: string;               // optional: specific tasks.md checkbox/heading this run addressed
  agentLabel: string;             // what ran — fork name, workflow name, or agent type
  startedAt: string;               // ISO 8601
  completedAt: string;
  durationMs: number;
  tokensUsed: number;              // from the tool's own <usage> block — not re-derived
  toolUses?: number;
  filesEdited: string[];           // repo-relative paths, self-reported by the agent
  summary: string;                 // one paragraph, what was actually done
  outcome: 'completed' | 'partial' | 'blocked';
}
```

### 2. Binding convention (how a run declares which OpenSpec change it's under)

The coordinating session (not the sub-agent) is responsible for knowing which OpenSpec change a
delegated task belongs to — sub-agents don't reliably infer this on their own. So the binding is
supplied by the caller, not self-declared by the agent: whoever spawns the `Agent`/`Workflow` call
passes `openspecChange` explicitly, and the receipt-recording step runs in the coordinating
session after the task-notification arrives (never inside the sub-agent itself — sub-agents don't
have a reliable place to write receipts to, and self-reported completion is exactly the failure
mode `AGENT_EXECUTION_INTEGRITY` (root CLAUDE.md, "Agent Execution Integrity — Evidence Rules")
already prohibits accepting without corroboration).

### 3. Recording

`scripts/atlas/record-agentic-run-receipt.mjs <openspecChange> --json '<AgenticRunReceiptV1>'`
(or stdin for the JSON body):

- Validates the receipt against the schema (Zod).
- Appends a `## Run Receipts` section (creating it if absent) to
  `openspec/changes/<openspecChange>/tasks.md` — one bullet per receipt, newest last, in the
  existing tasks.md prose style already used throughout this repo's OpenSpec changes (see e.g.
  `parent-atlas-agentic-repair-bundle-integration/tasks.md` for the established voice/format).
- Also appends the raw JSON receipt to `openspec/changes/<openspecChange>/receipts.jsonl`
  (append-only, one JSON object per line) — the tasks.md bullet is for humans, the `.jsonl` is
  the machine-readable ledger a future audit/rollup script can aggregate without re-parsing
  markdown.
- Idempotency: receipts key on `(openspecChange, startedAt, agentLabel)` — re-running the same
  receipt is a no-op, not a duplicate append.

### 4. Where this hooks into existing agentic flows

- `Agent` tool (fork or fresh agent) completions surface a `<usage>` block in the
  task-notification already — the coordinating session extracts it and calls the recorder.
- `Workflow` tool runs expose `budget.spent()` (this-turn token spend) and per-agent-call results
  via the journal (`journal.jsonl` in the transcript dir) — a follow-up task can add a
  `record-workflow-run-receipt.mjs` variant that walks the journal and emits one receipt per
  workflow run (not per individual `agent()` call inside it — that would be too granular to be
  useful).
- ACP/A2A tool-call chains (MCP `ops_*` tools, TRACE MCP surface) don't currently have a
  standard "I'm done, here's what I did" envelope with token/time/file data — before wiring these
  in, confirm whether one exists (grep `AcpRoutingDecision`/`McpToolCall` in
  `packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts`, referenced in root CLAUDE.md's
  "Sessions 82–83" section) and reuse that shape rather than inventing a parallel one.

## Why this belongs in OpenSpec, not ad-hoc code

This repo's own hard rule (root CLAUDE.md, "🚫 Duplication Prevention — Audit Before You Build")
requires auditing before adding a new capability-owner. A receipt-recording script is small, but
it introduces a new persistent artifact shape (`receipts.jsonl` per change) and a new convention
(who's responsible for supplying `openspecChange`) that needs to be stable across every future
agentic run — worth freezing as a spec before code, not worth re-deciding differently next
session.
