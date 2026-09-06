## Why

Reconcile existing implementation work with explicit memory/agent ownership.

## What Changes

## Memory/agent ownership update — 2026-09-05

This updates the existing governed-compute-fabric owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

Keep persistent AtlasKernelWorker work under existing section 4 gates: revisioned
environment, one authenticated host bridge, admitted skills, lifecycle controls,
execution receipts and resource budgets. Kernel code composes bounded capabilities,
never bypasses mutation admission. ACP, MCP, A2A and internal child sessions are
different transports, not workflow identity.

WorkflowExecutionCoordinatesV1 already accepts mastra/mastra_engine/mastra_storage
and LangGraph values. Enum presence and callable tool shims are not live backend proof.
WorkflowActionEventV1 remains the event/identity owner across checkpoint backends.

Alternative evaluated by operator architecture comparison: LANGCHAIN_DEEP_AGENTS,
NOT_ADOPTED; no benchmark or installation claim. It duplicates existing agent hierarchy,
DAG/context, kernel and persistence ownership. Nested legacy E2E tasks are reference
material; root owners govern compatible tests and side effects.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.
