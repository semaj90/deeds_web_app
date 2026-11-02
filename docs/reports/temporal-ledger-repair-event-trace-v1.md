# Temporal Ledger Repair Event Trace (Source-Only Audit)

**Date**: 2026-10-31  
**Scope**: Source-level analysis of temporal ledger callers, repair event publishers, and database schema authorities.

---

## 1. Schema Authority & Discrepancy Resolution

| Table Name | Declaration Location | Status | Role |
| :--- | :--- | :--- | :--- |
| `error_brain_patch` | `src/lib/db/schema/route-health-tables.ts:193` | **Active Authority** | Working route health patch store. Used by `route-health-queries.ts` and `routes/[routeId]` API endpoints. |
| `route_error_patches` (A) | `schema-postgres.ts:2989`, `drizzle/schema.ts:4215` | **Physical Match** | Matches migrations 0024–0041, but unqueried by application code. |
| `route_error_patches` (B) | `src/lib/server/db/schema/route_error_patches.ts` | **Aspirational / Superseded** | Aspirational prototype, duplicate type name collision with (A). Marked for archive. |
| `atlas_agent_action_events` | PostgreSQL 18 Canonical Table | **Temporal Ledger Authority** | Append-only procedural audit ledger for tool calls, agent execution outcomes, and DAG steps. |

---

## 2. Temporal Ledger Callers & Data Flow

```
                      [Tool Call / Agent Action]
                                  │
                                  ▼
                     tool-shim.ts / executeTool()
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       applyTemporalBoundary()      dispatchTool() (terminal/rg/graph)
                  │                               │
                  ▼                               ▼
       [Query Past Ledger]        runTemporalPostDispatchHook()
   (ActionCurrentProjectionV1)                    │
                                                  ▼
                                 recordTemporalToolDispatchOutcome()
                                                  │
                                                  ▼
                                     atlas_agent_action_events
                                  (append-only PostgreSQL ledger)
```

### Key Writers:
1. **`temporal-tool-post-dispatch-recorder.ts`**:
   - `recordTemporalToolDispatchOutcome()`: Researches sequence via `reserveTemporalActionLedgerSequence()`, materializes result payload, and appends `AgentActionEventV1` to `atlas_agent_action_events`.
2. **`opencode-event-logger-v1.ts`**:
   - `recordOpenCodeAgenticEventV1()`: Writes dual records to `agent_os_events` (operational stream) and `atlas_agent_action_events` (immutable audit ledger) for every OpenCode Skill contract execution.
3. **`action-writer.ts` / Phase 79**:
   - `writeCanonicalWorkflowActionAtomically()`: Canonical workflow event persistence.

### Key Readers:
1. **`tool-shim.ts` (`applyTemporalBoundary`)**:
   - Queries `ActionCurrentProjectionV1` for previous hits or failure states to short-circuit or select alternative execution hops (`MAX_TEMPORAL_ALTERNATIVE_HOPS = 8`).
2. **`temporal-action-alternative-boundary.ts`**:
   - Evaluates failure history from the ledger and routes alternatives without granting mutation authority.
3. **`temporal-action-hypergraph-adapter.ts`**:
   - Downstream read projection transforming ledger events into hypergraph tuples (`atlas.event.hypergraph.v1`).

---

## 3. PyTorch 768 Ingestion & Component Parity

1. **PyTorch Embedding Pipeline**:
   - Model weights: `models/embeddinggemma_300m`.
   - Verification script: `scripts/atlas/prove-embeddinggemma-full-pipeline-parity-v1.py` (768 dimensions, unit normalization, cosine distance).
   - Ingestion script: `scripts/atlas/embed-parent-atlas-to-qdrant.py` targeting collection `codebase_chunks_768`.
2. **Parity Migration**:
   - `sveltekit-frontend/src/lib/server/atlas/qdrant-component-parity.spec.ts` migrated to canonical 768-dim collection `codebase_chunks_768_v2`.
   - `scripts/atlas/qdrant-parity-repair-core.mjs` enhanced with `error_vector_repair` lane for 768-dim optional vectors.
