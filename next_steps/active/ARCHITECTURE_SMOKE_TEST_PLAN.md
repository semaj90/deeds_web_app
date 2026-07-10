# Architecture Smoke Test Plan

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: end-to-end smoke coverage for LangGraph, OTel, runtime cache, and graph acceleration

---

## Goal

Prove the stack is wired end to end with concrete smoke tests, not just documentation:

- browser/client loop
- server retrieval loop
- ACP / A2A / MCP / gRPC loop
- cache promotion loop
- observability loop

---

## What The Smoke Suite Should Prove

### 1. LangGraph persistence

- thread-scoped state can be checkpointed
- `thread_id` is passed in config
- Postgres checkpointer stores and restores state

### 2. OpenTelemetry bootstrap

- server starts with telemetry enabled
- spans are emitted for retrieval and ACP
- ESM bootstrapping works for the app layout used here

### 3. NetworkX acceleration path

- the graph package can dispatch through a backend
- optional `nx-cugraph` install is recognized as a backend path
- no code rewrite is required for the accelerated path

### 4. Runtime cache promotion

- stable input produces stable cache key
- exact SOM lookup and radius-1 neighbor lookup behave differently
- winner promotion is persisted
- rejected candidates stay out of the hot lane

### 5. Retrieval / packet contract

- winner packet passes identity checks
- `source_ref` is preserved as provenance
- LOD0 and LOD1 manifests stay bounded

---

## Suggested Smoke Files

- `tests/integration/runtime-cache-promotion.test.ts`
- `tests/integration/otel-bootstrap.test.ts`
- `tests/integration/langgraph-persistence.test.ts`
- `tests/integration/networkx-backend.test.ts`

---

## Suggested Route / Loop Coverage

The smoke story should cover at least one pass through each of these:

- `MCP` tool call
- `ACP` decision
- `gRPC` service hop
- retrieval candidate generation
- promotion decision
- cache write
- trace emission

If the repo only has one implementation for a step, smoke that exact step rather than inventing a duplicate surface.

---

## Implementation Notes

- Keep the smoke tests bounded and deterministic.
- Prefer state assertions over broad output snapshots.
- Keep package installation separate from smoke validation.
- Keep the OTel test isolated from Langfuse so the bootstrap can fail independently.

---

## Validation Order

1. LangGraph persistence smoke
2. OTel bootstrap smoke
3. NetworkX backend smoke
4. runtime-cache promotion smoke
5. end-to-end loop smoke

---

## Spec Eval Notes

- Verify `thread_id` restoration in the LangGraph checkpoint path.
- Verify OTel spans exist independently of Langfuse traces.
- Verify the NetworkX GPU backend path is optional and does not require code rewrites.
- Verify the browser/server split remains intact when the smoke suite runs.

---

## Recommendation

Use this plan as the contract for proving the stack is wired up end to end before adding more model work or new promotion logic.
