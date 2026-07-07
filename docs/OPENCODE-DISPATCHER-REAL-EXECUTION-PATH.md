# OpenCode Dispatcher — Real Execution Path

**Session 120 Audit Finding**: The Phase 1 `/api/opencode-dispatch` endpoint I implemented is **architecturally redundant**. The dispatcher pipeline already exists as a fully-wired event-driven system. This document maps the real execution flow and explains the integration strategy.

## Real Execution Path (Current Architecture)

### Entry Point: Event-Driven via RabbitMQ

The canonical dispatcher **is not an HTTP endpoint**. It's triggered by RabbitMQ `identity.updated` events consumed by a listener that has **circuit breaker resilience** and **exponential backoff retry logic built-in**.

```
RabbitMQ identity.updated event
  ↓
RabbitMQ Identity Listener (rabbitmq-identity-listener.ts)
  ├─ Parses event: { event_type, packet_keys, source_ref, feature_id, timestamp }
  ├─ Builds initial DispatcherState from event payload
  ├─ Invokes executeDispatcherOrchestration()
  │  └─ Runs health checks (Qdrant, Neo4j, Redis, RabbitMQ)
  │  └─ Executes LangGraph state machine (9 nodes)
  │     ├─ node_escalate_quarantine
  │     ├─ node_recover_identity
  │     ├─ node_validate_envelope
  │     ├─ node_sync_qdrant_mirror
  │     ├─ node_sync_neo4j_mirror
  │     ├─ node_expand_topology
  │     ├─ node_rerank_candidates
  │     ├─ node_synthesize_answer
  │     └─ node_escalate_operator
  │  └─ Triggers mirror worker callbacks (async)
  │     ├─ Qdrant sync (if decision is sync_qdrant or synthesize)
  │     ├─ Neo4j sync (if decision is sync_neo4j or synthesize)
  │     └─ Redis invalidation (always after mirror syncs)
  │  └─ Emits RabbitMQ events (identity.updated, operator.alert)
  │  └─ Persists audit log to Postgres
  ↓
Returns DispatcherOrchestrationResult
  └─ success: boolean
  └─ dispatch_decision: string (9 possible decisions)
  └─ synthesis_path: string[] (node execution trace)
  └─ mirror_syncs: { qdrant, neo4j, redis } with metrics
  └─ events_emitted: number
  └─ total_duration_ms: number
  └─ errors: string[]
```

### Key Components

**1. dispatcher-orchestrator.ts** (292 lines)
- `executeDispatcherOrchestration(state: DispatcherState, ctx: DispatcherOrchestrationContext): Promise<DispatcherOrchestrationResult>`
- Orchestrates the complete 3-tier pipeline
- Pre-flight health checks on all services
- Invokes LangGraph graph state machine
- Triggers mirror workers and persists audit

**2. dispatcher-graph.ts** (177 lines)
- `createDispatcherGraph(ctx: NodeContext): DispatcherGraph`
- Creates a LangGraph state machine with 9 nodes
- Each node wrapped with `withDispatcherTelemetry()` for metrics
- Conditional routing via `routeByDispatch` based on `dispatch_decision`
- All nodes route to `end` node which calculates final latency

**3. rabbitmq-identity-listener.ts** (300+ lines)
- `startIdentityListener(channel: Channel, ctx: DispatcherOrchestrationContext, config: ListenerConfig)`
- Consumes `dispatcher.identity.updated` queue
- Implements circuit breaker (open/closed/half-open states)
- Retry logic with exponential backoff (configurable)
- Constructs `DispatcherState` from RabbitMQ event payload
- Calls `executeDispatcherOrchestration()` with state and context

**4. dispatcher-signal-extractor.ts**
- Extracts dispatcher signals (confidence, routing decision) from query/state
- Feeds into decision-making logic

**5. dispatcher-audit-service.ts**
- Persists dispatcher decisions to Postgres for audit trail
- Non-blocking: failure doesn't fail the orchestration

## Why Phase 1 `/api/opencode-dispatch` is Redundant

| Aspect | Phase 1 Endpoint | Real Architecture |
|--------|-----------------|-------------------|
| **Entry point** | HTTP POST `/api/opencode-dispatch` | RabbitMQ event consumer + circuit breaker |
| **Request validation** | Custom middleware | Built into event consumer + Zod in state |
| **Planner invocation** | Gemma4 :8090 (in route handler) | Integrated into LangGraph nodes |
| **Dispatcher** | LangGraph stub (lines 152-162 of +server.ts) | 9-node state machine with conditional routing |
| **Mirror sync** | Stubbed (non-blocking) | Full implementation with metrics |
| **Telemetry** | Redis events only | Postgres audit + Redis events + telemetry wrapper on every node |
| **Resilience** | None | Circuit breaker + exponential backoff retry + health checks |
| **Error handling** | Graceful degradation | Explicit error propagation + audit trail |
| **Response shape** | Custom `{ success, results, telemetry, proof, metadata }` | `DispatcherOrchestrationResult` with synthesis_path + mirror_syncs metrics |

## Integration Strategy (Sessions 121+)

Instead of creating a new endpoint, **extend the existing dispatcher pipeline**:

### Phase 1 (Actual): Wire OpenCode Planner into Dispatcher Graph

**Goal**: Replace the stub Gemma4 invocation inside dispatcher nodes with real planner output.

**Current state**: `dispatcher-signal-extractor.ts` already has slots for planner output. Gemma4 planner output feeds the decision tree via `dispatch_confidence` + `dispatch_decision`.

**Implementation**:
1. Create `opencode-planner-node.ts` that invokes Gemma4 :8090 with OpenCode system prompt
2. Insert as a new node in the LangGraph graph **before** the routing decision
3. Wire Gemma4 response (`action`, `confidence`, `reason`) into `DispatcherState`
4. Let the conditional router (`routeByDispatch`) use the planner's action decision

**Not this**: Create `/api/opencode-dispatch` endpoint
**Yes this**: Add `node_opencode_planner` to dispatcher-graph nodes

### Phase 2 (Sessions 121+): Execution Graph Telemetry

**Goal**: Capture execution traces so Graphify can index "what execution cluster implemented this feature?"

**What's missing**: The dispatcher already logs `synthesis_path` (node execution trace), but it doesn't capture:
- Which MCP tools were called
- Which Postgres rows were written
- Which Qdrant points were synced
- Which Neo4j edges were created
- Per-node execution timing + memory usage

**Implementation**:
1. Enhance `withDispatcherTelemetry()` wrapper to capture tool invocations
2. Add per-node metrics to `synthesis_path` objects: `{ node: string, duration_ms: number, tools: string[], writes: { postgres?: number, qdrant?: number, neo4j?: number } }`
3. Write complete execution graph to:
   - Neo4j: `(Feature)-[:EXECUTED_BY]->(ExecutionGraph)-[:USED_TOOL]->(Tool)-[:WROTE]->(File)`
   - Qdrant: Embed execution trace as semantic vector
   - Postgres: `execution_graphs` table with full JSON envelope

### Phase 3 (Sessions 122+): Graphify Indexing

**Goal**: Make execution graphs searchable for "find the implementation cluster".

**Implementation**:
1. Graphify stage that reads Postgres `execution_graphs` + Neo4j `ExecutionGraph` nodes
2. Index execution traces as searchable artifacts alongside code
3. Query: "Find all execution traces that touched auth.ts" → returns feature + tests + routes + dependencies

## Recommended Next Steps

1. **Don't use `/api/opencode-dispatch`**: Remove the Phase 1 endpoint (or demote it to a debug-only `/debug/opencode-dispatch` route for testing)
2. **Wire OpenCode planner into dispatcher**: Add `node_opencode_planner` that calls Gemma4 and feeds `dispatch_decision` into the routing logic
3. **Extend telemetry**: Enhance dispatcher telemetry wrapper to capture tool calls + writes per node
4. **Test with RabbitMQ events**: Emit `identity.updated` events and verify dispatcher runs end-to-end
5. **Document execution graph schema**: Define Neo4j/Qdrant/Postgres shapes for indexing

## Real Architecture Summary

The dispatcher is a **deterministic state machine** that:
- ✅ Validates packet identity via envelope checks
- ✅ Routes decisions based on identity lane + signals
- ✅ Syncs mirrors (Qdrant, Neo4j, Redis)
- ✅ Emits events for async subscribers
- ✅ Captures execution traces in telemetry
- ✅ Has built-in resilience (circuit breaker, retries)
- ✅ Persists audit trail to Postgres

**The only gap**: Execution graphs are not yet indexed by Graphify. That's a separate Phase 2 concern (sessions 121+).

---

**Status**: Real architecture fully documented. Ready for Phase 2 execution graph wiring.
