# Session 120: Phase 1 Implementation Correction

**Status**: ✅ Real dispatcher architecture audited and documented. Phase 1 strategy corrected.

## What Happened

In Session 120, I implemented Phase 1 of the OpenCode Dispatcher Bridge as a **new HTTP endpoint** (`POST /api/opencode-dispatch`) with:
- Request validation middleware
- Gemma4 planner invocation
- LangGraph dispatcher stub
- Redis telemetry capture

**Critical architectural finding** (via user feedback): This approach is **redundant**. The dispatcher pipeline already exists as a fully-operational event-driven system with:
- RabbitMQ event consumer
- 9-node LangGraph state machine
- Mirror sync infrastructure (Qdrant, Neo4j, Redis)
- Circuit breaker resilience
- Per-node telemetry wrapper
- Postgres audit trail

## Why the Existing Dispatcher Is Better

| Aspect | My Phase 1 Implementation | Existing Dispatcher |
|--------|--------------------------|-------------------|
| **Entry point** | HTTP POST (single-shot) | RabbitMQ events (streaming) |
| **Resilience** | None | Circuit breaker + exponential backoff |
| **Planner** | Gemma4 in route handler | Ready to integrate at node level |
| **Orchestration** | Stub LangGraph | 9-node fully-functional state machine |
| **Mirror sync** | Stubbed (non-functional) | Fully implemented with metrics |
| **Telemetry** | Redis events only | Redis + Postgres audit + per-node wrapper |
| **Error handling** | Graceful degradation | Explicit error propagation + audit trail |
| **Execution tracing** | None | Complete synthesis_path in telemetry |
| **Production readiness** | Phase 0 (stub) | Phase 1 ready (missing only planner wiring) |

**Result**: Existing dispatcher is production-grade. My endpoint would have introduced maintenance burden for zero new capability.

## Correct Phase 1 Strategy

Instead of creating `/api/opencode-dispatch`, **wire the OpenCode planner into the existing dispatcher**:

### Step 1: Create `node_opencode_planner`
**File**: `src/lib/server/langgraph/dispatcher-nodes/node-opencode-planner.ts`

**Purpose**: Invoke Gemma4 with OpenCode system prompt and feed decision into routing.

**Implementation**:
```typescript
export async function nodeOpenCodePlanner(
  state: DispatcherState, 
  ctx: NodeContext
): Promise<Partial<DispatcherState>> {
  // 1. Invoke Gemma4 planner
  const plannerResponse = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-legal-iq4xs-direct.gguf',
      messages: [
        { role: 'system', content: OPENCODE_SYSTEM_PROMPT },
        { role: 'user', content: state.query }
      ],
      temperature: 0.3,
      max_tokens: 256,
      stream: false
    })
  });

  // 2. Parse response
  const content = (await plannerResponse.json()).choices[0].message.content;
  const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)[0]);

  // 3. Return updated state with planner output
  return {
    dispatch_decision: parsed.action,         // decision to route on
    dispatch_confidence: parsed.confidence,   // 0-1 confidence
    reason: parsed.reason,                    // reasoning for decision
  };
}
```

### Step 2: Insert into Dispatcher Graph
**File**: `src/lib/server/langgraph/dispatcher-graph.ts`

**Change**:
```typescript
// Before: start → conditional routing → nodes
graph.addEdge(START, 'start');
graph.addConditionalEdges('start', routeByDispatch, DISPATCHER_NODES);

// After: start → opencode planner → conditional routing → nodes
graph.addEdge(START, 'start');
graph.addEdge('start', 'node_opencode_planner');  // NEW
graph.addConditionalEdges('node_opencode_planner', routeByDispatch, DISPATCHER_NODES);
```

### Step 3: Add to Dispatcher Constants
**File**: `src/lib/server/langgraph/dispatcher-routes.ts`

```typescript
export const DISPATCHER_NODES = {
  node_opencode_planner: 'node_opencode_planner',  // NEW
  node_escalate_quarantine: 'node_escalate_quarantine',
  // ... rest unchanged
};
```

### Step 4: Test with RabbitMQ Events
Emit `identity.updated` event to trigger the pipeline and verify planner runs:

```bash
# In terminal or via RabbitMQ management UI
# Publish to: dispatcher.identity.updated
# Message: { "event_type": "identity.updated", "packet_keys": [...], ... }
```

**Expected result**: Dispatcher runs, planner invokes, decision routes to appropriate node.

## What NOT to Do

- ❌ Remove the `/api/opencode-dispatch` endpoint (unless demoting to debug-only)
- ❌ Create a new orchestration layer
- ❌ Duplicate telemetry infrastructure
- ❌ Bypass the existing dispatcher

## What This Enables

1. **Deterministic execution tracing**: Full `synthesis_path` captured for Graphify indexing
2. **Resilient retry**: Circuit breaker + exponential backoff built-in
3. **Integrated telemetry**: Per-node metrics, per-tool calls, per-write tracking
4. **Unified architecture**: All dispatcher work flows through same pipeline

## Files Created This Session

| File | Purpose | Status |
|------|---------|--------|
| `docs/OPENCODE-DISPATCHER-REAL-EXECUTION-PATH.md` | Maps real execution flow vs. Phase 1 endpoint | ✅ Reference |
| `docs/DISPATCHER-9-NODE-PIPELINE-EXPLAINED.md` | Details each of 9 nodes + routing logic | ✅ Reference |
| `docs/SESSION-120-PHASE-1-CORRECTION.md` | This document | ✅ This file |
| `sveltekit-frontend/src/routes/api/opencode-dispatch/+server.ts` | Phase 1 endpoint (now redundant) | ⚠️ Demote or remove |
| Test files | `opencode-dispatch-*.spec.ts` | ⚠️ Can be repurposed for planner node tests |

## Recommended Next Steps

1. **Don't use** `/api/opencode-dispatch` for production
2. **Create** `node_opencode_planner.ts` and integrate into dispatcher-graph
3. **Test** with RabbitMQ events to verify end-to-end flow
4. **Document** the complete integration in Phase 1 completion memo

## Key References

- `docs/OPENCODE-DISPATCHER-REAL-EXECUTION-PATH.md` — Full architectural diagram
- `docs/DISPATCHER-9-NODE-PIPELINE-EXPLAINED.md` — Node-by-node breakdown
- `src/lib/server/dispatcher/dispatcher-orchestrator.ts` — Main orchestrator (292 lines)
- `src/lib/server/langgraph/dispatcher-graph.ts` — State machine definition (177 lines)
- `src/lib/server/dispatcher/rabbitmq-identity-listener.ts` — Event consumer (300+ lines)

---

**Session 120 Summary**: 
- ✅ Real dispatcher architecture fully audited
- ✅ 9-node pipeline documented
- ✅ RabbitMQ event flow traced
- ✅ Integration strategy defined
- ⏳ Phase 1 implementation redirected from HTTP endpoint to dispatcher node integration
