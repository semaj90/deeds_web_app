# Dispatcher 9-Node Pipeline Explained

**Status**: Complete architecture documented. Ready for Phase 1 actual implementation (wire OpenCode planner into dispatcher).

## Executive Summary

The dispatcher is a **deterministic state machine** with 9 specialized nodes that implement the canonical 5-step truth flow:

```
Step 1: Read from Postgres (identity validation)
  ↓ (node_escalate_quarantine, node_recover_identity, node_validate_envelope)
Step 2: Validate structure (envelope checks)
  ↓ (node_validate_envelope)
Step 3: Write to Postgres (update truth)
  ↓ (implicit in mirror sync nodes)
Step 4: Invalidate Redis cache (async)
  ↓ (implicit in mirror sync nodes)
Step 5: Emit events (RabbitMQ, Neo4j, Postgres)
  ↓ (implicit in mirror sync nodes, explicit in orchestrator)
```

## The 9 Nodes

### 1. **node_escalate_quarantine**
- **Purpose**: Detect packets in quarantine lane and flag for operator review
- **Inputs**: `DispatcherState` with `identity_lane = 'quarantine'`
- **Processing**:
  - Check if any candidates have `identity_lane = 'quarantine'` (lost packet identity)
  - Mark these as escalation candidates
  - Log error codes for each quarantined packet
- **Output**: Updated state with `dispatch_decision = 'escalate'` if quarantine detected
- **Canonical Truth Flow**:
  - Step 1: Read `atlas_packets.identity_lane` from Postgres (Zod-validated)
  - Step 5: Emit `operator.alert` event with quarantine list

**When used**: Always runs first in the node order to catch unrecoverable packets early

---

### 2. **node_recover_identity**
- **Purpose**: Attempt to recover packet identity from recoverable lanes (2-3)
- **Inputs**: `DispatcherState` with candidates from recovery lanes
- **Processing**:
  - For each candidate in `identity_lane ∈ ['recoverable_byte_span', 'recoverable_hash']`:
    - Attempt to reconstruct `packet_key` from byte span or content hash
    - Verify reconstruction matches a known `source_ref`
    - If successful, promote candidate to canonical lane
- **Output**: Updated candidates with recovered `packet_key` values
- **Canonical Truth Flow**:
  - Step 1: Read `atlas_packets` join on `source_ref` + `feature_id` (Postgres)
  - Step 2: Validate reconstructed packet_key against stored envelope
  - Step 3: Write `atlas_packets.identity_lane = 'canonical'` for recovered rows
  - Step 4: Invalidate `bifrost:packet:{old_key}` and create `bifrost:packet:{new_key}`
  - Step 5: Emit `identity.updated` with recovered keys

**When used**: After escalate_quarantine, before validation

---

### 3. **node_validate_envelope**
- **Purpose**: Zod-validate packet envelopes against canonical schema
- **Inputs**: `DispatcherState` with candidates (now with valid packet_keys)
- **Processing**:
  - For each candidate, extract `CanonicalAcePacketEnvelope` from Postgres
  - Validate against Zod schema:
    - Required fields: `packet_id`, `packet_key`, `source_ref`, `feature_id`, `directory_path`
    - Semantic fields: `domain_class`, `title_id`, `tree_node_id`, `summary`
  - Hard-fail on schema violation (packet cannot proceed)
  - Soft-warn on missing optional fields (packet proceeds with degraded status)
- **Output**: Validated `candidates` with `confidence` adjusted per field completeness
- **Canonical Truth Flow**:
  - Step 1: Read `atlas_packets` + `codebase_chunk_index` join (Postgres)
  - Step 2: Validate with `CanonicalAcePacketEnvelope` Zod schema
  - Hard-fail sets `dispatch_decision = 'escalate'`
- **Error Classification**:
  - `StructureError`: Missing required field → escalate
  - `SemanticError`: Missing optional field → continue with warning
  - `VectorError`: Embedding mismatch or missing → continue, will rerank without embedding

**When used**: After recovery, before mirror sync

---

### 4. **node_sync_qdrant_mirror**
- **Purpose**: Sync validated candidates to Qdrant ANN mirror
- **Inputs**: `DispatcherState` with validated `candidates`
- **Processing**:
  - For each candidate:
    - Build Qdrant payload: `{ packet_key, source_ref, feature_id, domain_class, som_cluster, community_id, ... }`
    - Upsert to `codebase_chunks_768` collection (or create if new)
    - Embed candidate via `/api/embed` if not already cached in Qdrant payload
  - Track sync metrics: `synced` (success), `failed` (error count), `duration_ms`
- **Output**: Updated state with sync metrics
- **Canonical Truth Flow**:
  - Step 1: Read `atlas_packets.embedding_id` → lookup in Redis + Qdrant (dual-check)
  - Step 3: Write Qdrant point with payload tags + vectors
  - Step 4: Invalidate `bifrost:feature:{feature_id}:packets` (so next search uses updated Qdrant)
  - Step 5: Emit `mirror.synced` event with point_ids

**When used**: After validation, conditional on `dispatch_decision ∈ ['sync_qdrant', 'synthesize']`

---

### 5. **node_sync_neo4j_mirror**
- **Purpose**: Sync validated candidates to Neo4j topology mirror
- **Inputs**: `DispatcherState` with validated `candidates`
- **Processing**:
  - For each candidate, create or update Neo4j nodes:
    - `(Feature)-[:HAS_PACKET]->(Packet)`
    - `(Packet)-[:BELONGS_TO_CLUSTER]->(Cluster)`
    - `(Packet)-[:SIMILAR_TOPOLOGY]->(NearbyPacket)` (from SOM grid or KNN)
  - Track metrics: `nodes_created`, `nodes_updated`, `edges_created`, `duration_ms`
- **Output**: Updated state with Neo4j sync metrics
- **Canonical Truth Flow**:
  - Step 1: Read `atlas_packets` + SOM coordinates + community assignments (Postgres)
  - Step 3: Write Neo4j nodes (deterministic `CREATE IF NOT EXISTS`)
  - Step 4: Invalidate `bitfrost:topology:{feature_id}` (topology cache)
  - Step 5: Emit `topology.updated` with edge_ids

**When used**: After validation (can run in parallel with Qdrant sync), conditional on `dispatch_decision ∈ ['sync_neo4j', 'synthesize']`

---

### 6. **node_expand_topology**
- **Purpose**: Expand candidate set via k-hop graph traversal (bounded)
- **Inputs**: `DispatcherState` with initial `candidates`
- **Processing**:
  - For top-N candidates, query Neo4j: "What packets are within k=2 hops?"
  - Apply edge type filter: only follow `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY`, `SHARES_TAGS`
  - Limit expansion: max 50 additional candidates per initial candidate
  - Merge expanded set with originals, deduplicate by `packet_key`
- **Output**: Expanded `candidates` list with new members marked `expansion_source = 'topology_k2'`
- **Canonical Truth Flow**:
  - Step 1: Read Neo4j edges (read-only, no writes here)
  - This node does NOT write Postgres/Neo4j, only expands in-memory candidate set

**When used**: Optional expansion stage, typically AFTER validation but BEFORE rerank

---

### 7. **node_rerank_candidates**
- **Purpose**: Rerank expanded candidates using Karpathy authority blend
- **Inputs**: `DispatcherState` with expanded `candidates`
- **Processing**:
  - For each candidate, fetch pre-computed scores from Redis:
    - `gpu:karpathy:scores` hash: `{ pr, attn, authority, blend }`
  - If Redis miss, fall back to Neo4j PageRank + Qdrant attention compute
  - Sort candidates by `blend` score (descending)
  - Trim to top-K (typically 10-20)
- **Output**: Reranked `candidates` list with final scores
- **Canonical Truth Flow**:
  - Step 1: Read `gpu:karpathy:scores` from Redis (cache) OR compute from Neo4j + Qdrant
  - This node does NOT write, only reorders in-memory
- **Rerank Formula**: `0.4·PageRank + 0.3·attention + 0.3·authority`

**When used**: After expansion, before synthesis

---

### 8. **node_synthesize_answer**
- **Purpose**: Generate synthesis using top-K candidates via Gemma4
- **Inputs**: `DispatcherState` with reranked `candidates`
- **Processing**:
  - Build LLM context: top-K candidate summaries + code snippets
  - Invoke Gemma4 :8090 with synthesis prompt
  - Parse response: extract structured answer + confidence
  - Validate response structure via Zod
- **Output**: `result` field populated with synthesis, `dispatch_confidence` set to model confidence
- **Canonical Truth Flow**:
  - Step 1: Read `atlas_packets.summary` from Postgres (via candidates)
  - This node calls Gemma4 but does NOT write Postgres/Redis
  - Step 5: Emit `synthesis.complete` event with result

**When used**: Final node before escalate_operator, typically always runs

---

### 9. **node_escalate_operator**
- **Purpose**: Handle cases that need human review
- **Inputs**: `DispatcherState` with any decision requiring operator intervention
- **Processing**:
  - Collect all errors + low-confidence results
  - Build escalation message: synthesis_path + candidates + errors
  - Emit `operator.alert` RabbitMQ event with severity level
  - Persist escalation to Postgres `escalation_log` table
- **Output**: Final state marked with escalation metadata
- **Canonical Truth Flow**:
  - Step 1: No reads (uses existing state)
  - Step 3: Write `escalation_log` to Postgres (for operator review)
  - Step 5: Emit `operator.alert` with full context

**When used**: Only if `dispatch_decision = 'escalate'`

---

## Node Routing Logic

The dispatcher uses **conditional routing** based on `dispatch_decision`:

```typescript
routeByDispatch(state: DispatcherState): string {
  switch (state.dispatch_decision) {
    case 'escalate_quarantine':
      return 'node_escalate_quarantine'; // → end
    case 'recover_identity':
      return 'node_recover_identity';    // → node_validate_envelope
    case 'sync_qdrant':
      return 'node_sync_qdrant_mirror';  // → end
    case 'sync_neo4j':
      return 'node_sync_neo4j_mirror';   // → end
    case 'synthesize':
      // Run validation → qdrant + neo4j (parallel) → expand → rerank → synthesize → escalate
      return 'node_validate_envelope';   // chains to rest
    case 'escalate':
      return 'node_escalate_operator';   // → end
    default:
      return 'node_validate_envelope';   // default path
  }
}
```

## Execution Paths (Real Examples)

### Path 1: Quarantine Detection
```
escalate_quarantine → (emit operator.alert) → end
Duration: ~50ms
Result: Operator alerted, packet held for manual review
```

### Path 2: Identity Recovery
```
recover_identity → validate_envelope → sync_qdrant + sync_neo4j → end
Duration: ~200-500ms
Result: Recovered packet_key synced to mirrors
```

### Path 3: Full Synthesis (Happy Path)
```
validate_envelope → sync_qdrant + sync_neo4j → expand_topology
  → rerank_candidates → synthesize_answer → escalate_operator (if needed)
Duration: ~2-5s
Result: Synthesis returned, optional operator alert if low confidence
```

## Telemetry Capture

Each node is wrapped with `withDispatcherTelemetry()` which:
- Records node execution time
- Captures tool calls (MCP tools invoked, if any)
- Tracks Postgres reads/writes
- Logs Redis operations
- Emits metrics to observability backend

Final state includes `synthesis_path: ['start', 'node_X', 'node_Y', ..., 'end']` for tracing.

---

## Integration with OpenCode Planner (Phase 1 Actual)

**Current state**: Nodes are hardcoded to make specific decisions. Planner input is NOT wired.

**Phase 1 change**: Add `node_opencode_planner` that:
1. Invokes Gemma4 with OpenCode system prompt
2. Parses planner response: `{ action, confidence, reason }`
3. Sets `dispatch_decision = action` based on planner output
4. Routes to appropriate node based on decision

**New routing**: 
```
start → node_opencode_planner → routeByDispatch(state.dispatch_decision) → ...
```

This way, OpenCode planner feeds into the existing 9-node pipeline without creating a duplicate orchestration layer.

---

## Key Design Decisions

1. **Deterministic node execution**: Each node is pure (given state, returns new state). No side effects except logging.
2. **Conditional routing**: Decision tree drives which nodes run, not hardcoded node sequences.
3. **Telemetry at every step**: `synthesis_path` logs the exact execution trace for debugging and Graphify indexing.
4. **Mirror sync is async**: Qdrant/Neo4j/Redis writes happen in parallel via callbacks, don't block the state machine.
5. **Hard-fail on validation**: Packets that fail envelope checks → escalate (operator intervention).
6. **Soft-warn on incomplete data**: Missing optional fields → continue but mark confidence lower.

---

**See also**: 
- `docs/OPENCODE-DISPATCHER-REAL-EXECUTION-PATH.md` — Full execution flow diagram
- `src/lib/server/langgraph/dispatcher-nodes/` — Node implementations
- `src/lib/server/dispatcher/dispatcher-orchestrator.ts` — Orchestration logic
