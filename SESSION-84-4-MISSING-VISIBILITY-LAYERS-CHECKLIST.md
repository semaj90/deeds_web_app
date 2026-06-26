# Session 84: 4 Missing Visibility Layers — Parent Atlas Workstation Checklist

**Status**: 🎯 **76% → 95% in Session 84**  
**Scope**: Add 4 missing visibility layers to parent-atlas telemetry architecture  
**Date**: June 26, 2026

---

## The 4 Missing Visibility Layers

### Layer 1: Packet Contract Layer (PARTIALLY LIVE)
**What**: Canonical PacketIdentity + AtlasMemoryEnvelope flowing through all operations

**Status**: ✅ NOW LIVE (Session 83)
- [x] Canonical packet identity types created (`atlas-core`)
- [x] AtlasMemoryEnvelope defined
- [x] Bridge module created (`canonical-packet-bridge.ts`)
- [x] Core validator migrated (`packet-validator-materializer.ts`)

**Remaining** (Phase 2, Session 84):
- [ ] **Qdrant adapter** — write envelope-shaped payloads
- [ ] **Neo4j adapter** — include trace_id in relationships
- [ ] **Valkey/Redis adapter** — use bitfrostKey() pattern with envelope
- [ ] **Postgres adapter** — include envelope in audit logs

**Search Keywords**:
```bash
rg -n "qdrant.ts|neo4j.ts|valkey.ts|postgres.ts" packages/parent-atlas/src/adapters/
rg -n "TODO.*adapter|PENDING.*envelope|FIXME.*mirror" packages/parent-atlas/src/
```

**Checklist**:
```
Layer 1: Packet Contract
├─ [x] Identity types (atlas-core)
├─ [x] Envelope schema
├─ [x] Bridge functions
├─ [x] Core validator wired
├─ [ ] Qdrant adapter wired
├─ [ ] Neo4j adapter wired
├─ [ ] Valkey adapter wired
└─ [ ] Postgres adapter wired
```

---

### Layer 2: RPC/Transport Layer (PARTIALLY LIVE)

**What**: Explicit telemetry for gRPC/HTTP serialization, wire protocol overhead, marshalling latency

**Status**: ⚠️ PARTIAL
- [x] gRPC clients exist (`grpc/embedding-client.ts`, `grpc/retrieval-client.ts`)
- [x] HTTP fallbacks wired
- [ ] Serialization latency NOT tracked

**Remaining** (Session 84-85):
- [ ] **protobuf encode telemetry** — measure packet → gRPC wire format time
- [ ] **protobuf decode telemetry** — measure gRPC wire format → packet time
- [ ] **JSON stringify/parse overhead** — track conversion latency
- [ ] **Transport protocol version** — track grpc vs http in telemetry

**Search Keywords**:
```bash
rg -n "grpc|protobuf|serialize|marshal|encode|decode" sveltekit-frontend/src/lib/server/grpc/
rg -n "fetch.*grpc|HTTP.*fallback" sveltekit-frontend/src/lib/server/grpc/
rg -n "TODO.*telemetry|FIXME.*serialization" packages/parent-atlas/
```

**Checklist**:
```
Layer 2: RPC/Transport
├─ [x] gRPC clients exist
├─ [x] HTTP fallbacks wired
├─ [ ] Protobuf encode timing
├─ [ ] Protobuf decode timing
├─ [ ] JSON stringify overhead
├─ [ ] JSON parse overhead
└─ [ ] Transport protocol tracking
```

---

### Layer 3: Resource Layer (PARTIAL)

**What**: Granular telemetry for each resource operation (GPU, Redis, Qdrant, Neo4j)

**Status**: ⚠️ PARTIAL
- [x] GPU ops exist (LibTorch, GEMM, cosine, top-k)
- [x] Individual operations have performance
- [ ] Per-operation telemetry NOT separate from tool telemetry

**Remaining** (Session 84-85):
- [ ] **GPU kernel telemetry** — per-kernel {kernel, duration_ms, cuda_stream}
  - [ ] Embedding kernel
  - [ ] GEMM (matmul) kernel
  - [ ] Cosine similarity kernel
  - [ ] Top-K selection kernel
  - [ ] Cross-encoder rerank kernel
  - [ ] Autoencoder kernel (if used)
  - [ ] SOM lookup kernel
- [ ] **Redis operation telemetry** — per-op {key, duration_ms, hit/miss}
- [ ] **Qdrant search telemetry** — per-search {duration_ms, results, prefilter}
- [ ] **Neo4j query telemetry** — per-query {duration_ms, rows}

**Search Keywords**:
```bash
rg -n "CUDA|kernel|gpu|libtorch" sveltekit-frontend/src/lib/server/gpu/
rg -n "redis-client|valkey" sveltekit-frontend/src/lib/server/
rg -n "qdrant-manager" sveltekit-frontend/src/lib/server/vector/
rg -n "neo4j|cypher" sveltekit-frontend/src/lib/server/graph/
rg -n "TODO.*kernel|FIXME.*telemetry|PENDING.*metrics" packages/atlas-core/
```

**Checklist**:
```
Layer 3: Resource Operations
├─ GPU Kernels
│  ├─ [ ] Embedding kernel timing
│  ├─ [ ] GEMM kernel timing
│  ├─ [ ] Cosine similarity timing
│  ├─ [ ] Top-K timing
│  ├─ [ ] Cross-encoder timing
│  ├─ [ ] Autoencoder timing
│  └─ [ ] SOM lookup timing
├─ Redis Operations
│  ├─ [ ] GET timing
│  ├─ [ ] SET/SETEX timing
│  ├─ [ ] DEL timing
│  └─ [ ] Hit/miss tracking
├─ Qdrant Operations
│  ├─ [ ] Search timing
│  ├─ [ ] Upsert timing
│  └─ [ ] Prefilter overhead
└─ Neo4j Operations
   ├─ [ ] Query timing
   └─ [ ] Match/traverse timing
```

---

### Layer 4: Packet-Centric Provenance Layer (NOT YET)

**What**: Track packet identity through entire pipeline lifecycle

**Status**: ❌ NOT YET
- [x] Trace ID exists (AtlasMemoryEnvelope.trace_id)
- [ ] Packet ID NOT in telemetry
- [ ] Feature ID NOT in telemetry
- [ ] Source Ref NOT in telemetry
- [ ] SOM cell NOT in telemetry
- [ ] Schema version NOT tracked
- [ ] Embedding version NOT tracked
- [ ] Tool version NOT tracked
- [ ] GPU kernel version NOT tracked

**Remaining** (Session 84):
- [ ] **Add packet_id to EVERY trace event**
- [ ] **Add feature_id to EVERY trace event**
- [ ] **Add source_ref to EVERY trace event**
- [ ] **Add som_cell to EVERY trace event**
- [ ] **Add schema_version tracking**
- [ ] **Add embedding_version tracking**
- [ ] **Add tool_version tracking**
- [ ] **Add gpu_kernel_version tracking**
- [ ] **Add rpc_transport tracking**

**Search Keywords**:
```bash
rg -n "trace_id" packages/atlas-core/src/types/
rg -n "packet_id|feature_id|source_ref" packages/atlas-core/
rg -n "schema_version|embedding_version|tool_version" packages/
rg -n "telemetry|trace|event" packages/atlas-core/src/telemetry/
rg -n "TODO.*packet|FIXME.*provenance|PENDING.*tracking" packages/
```

**Checklist**:
```
Layer 4: Packet-Centric Provenance
├─ Packet Identity Tracking
│  ├─ [ ] packet_id in all events
│  ├─ [ ] feature_id in all events
│  ├─ [ ] source_ref in all events
│  └─ [ ] packet_key in all events
├─ Topology Tracking
│  ├─ [ ] som_cell in all events
│  ├─ [ ] community_id in events (where relevant)
│  └─ [ ] cluster_id in events (where relevant)
├─ Version Tracking
│  ├─ [ ] schema_version in events
│  ├─ [ ] embedding_version in events
│  ├─ [ ] tool_version in events
│  ├─ [ ] gpu_kernel_version in events
│  └─ [ ] rpc_transport in events
└─ Provenance Trail
   ├─ [ ] Every packet operation logged
   ├─ [ ] Complete trace from ACP → Result
   └─ [ ] No gaps in chain
```

---

## Session 84 Work Order

### Priority 1: Phase 2 Adapters (12% completion gain)
**Estimated Time**: 4-6 hours

```bash
# Qdrant adapter
packages/parent-atlas/src/adapters/qdrant.ts
  └─ Use envelope-shaped payloads
  └─ Write trace_id to Qdrant metadata
  └─ Include packet_key, source_ref, feature_id in payload

# Neo4j adapter
packages/parent-atlas/src/adapters/neo4j.ts
  └─ Create relationships with trace_id in properties
  └─ Link packet nodes with trace information
  └─ Include canonical identity in node metadata

# Valkey adapter
packages/parent-atlas/src/adapters/valkey.ts
  └─ Use bitfrostKey() pattern for all keys
  └─ Store envelope shape in cache
  └─ Include trace_id on every cache write

# Postgres adapter
packages/parent-atlas/src/adapters/postgres.ts
  └─ Include envelope in audit logs
  └─ Track write operations with trace_id
  └─ Maintain provenance trail
```

**Verification**:
```bash
rg -n "createEnvelopeFromRow\|bitfrostKey\|trace_id" packages/parent-atlas/src/adapters/
# Should find usage in all 4 adapters
```

---

### Priority 2: Packet-Centric Telemetry (8% completion gain)
**Estimated Time**: 3-4 hours

```bash
# Update ACP decision event
packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts
  └─ Add packet_id, feature_id, som_cell
  └─ Track routing_choice, cache_strategy

# Update packet builder event
packages/parent-atlas/src/core/packet-validator-materializer.ts
  └─ Add packet_id, source_ref, feature_id to envelope trace
  └─ Track schema_version, embedding_version

# Update retrieval event
packages/parent-atlas/src/pipelines/
  └─ Add packet_id, feature_id to search telemetry
  └─ Track cache_hit, candidates_returned

# Update GPU event
sveltekit-frontend/src/lib/server/gpu/
  └─ Add packet_id, gpu_kernel_version to tensor operations
  └─ Track per-kernel duration

# Update synthesis event
sveltekit-frontend/src/lib/server/ollama.ts
  └─ Add packet_id, feature_id to Gemma4 calls
  └─ Track tool_version, embedding_version
```

**Verification**:
```bash
rg -n "packet_id|feature_id|som_cell" packages/atlas-core/src/telemetry/
# Should find these fields in all major telemetry events
```

---

### Priority 3: LangGraph Node Split (3% completion gain + clarity)
**Estimated Time**: 2-3 hours

```bash
# Split monolithic worker into 7 nodes
packages/atlas-core/src/langgraph/worker.ts
  └─ Node 1: ACP Planner
     └─ Input: user query, routing decision
     └─ Output: cache strategy, domain, tool set
  
  └─ Node 2: Packet Contract Builder
     └─ Input: routing decision
     └─ Output: PacketIdentity + envelope
  
  └─ Node 3: Retrieval Worker
     └─ Input: packet, routing
     └─ Output: ranked candidates (50)
  
  └─ Node 4: GPU Processor
     └─ Input: candidates
     └─ Output: reranked candidates (10)
  
  └─ Node 5: Gemma4 Synthesis
     └─ Input: reranked candidates
     └─ Output: generated answer
  
  └─ Node 6: Validation Gates
     └─ Input: answer, packets
     └─ Output: passed/failed verdict
  
  └─ Node 7: Writer (Postgres→Redis→NATS)
     └─ Input: validated result
     └─ Output: committed, cached, published
```

**Telemetry per node edge**:
```json
{
  "edge": "acp_to_packet",
  "duration_ms": 3.8,
  "payload_size": 256,
  "trace_id": "...",
  "packet_id": "..."
}
```

---

### Priority 4: NATS Event Wiring (4% completion gain)
**Estimated Time**: 1-2 hours

```bash
# Wire Postgres→Redis→NATS flow
packages/parent-atlas/src/pipelines/write-trace.ts (or similar)
  └─ After Postgres commit succeeds
     └─ Invalidate Redis cache (bitfrost:packet:*, etc.)
     └─ Publish NATS event
  
# NATS subjects to emit:
packages/atlas-core/src/events/subjects.ts
  └─ TRACE_CHECKPOINT_COMPLETE
  └─ PACKET_MATERIALIZED
  └─ CACHE_INVALIDATED
  └─ SYNTHESIS_COMPLETE

# Wire event handlers
packages/parent-atlas/src/gates/
  └─ Listen for TRACE_CHECKPOINT_COMPLETE
  └─ Update proof-of-truth status
```

**Verification**:
```bash
rg -n "nats|event|publish|subscribe" packages/atlas-core/src/events/
# Should find NATS subject definitions and publishers wired
```

---

## Quick Audit: Find What's Missing

Run these grep commands to identify gaps:

```bash
# Find adapters that need envelope wiring
rg -n "TODO|PENDING|FIXME" packages/parent-atlas/src/adapters/ --type ts

# Find telemetry that's missing packet-centric fields
rg -n "packet_id|feature_id|som_cell" packages/atlas-core/src/telemetry/ --type ts

# Find GPU operations without per-kernel telemetry
rg -n "CUDA|kernel|gpu" sveltekit-frontend/src/lib/server/gpu/ --type ts

# Find NATS definitions without wiring
rg -n "nats|publish|subscribe" packages/atlas-core/src/events/ --type ts

# Find LangGraph worker that needs splitting
rg -n "orchestrator|monolithic" packages/atlas-core/src/langgraph/ --type ts
```

---

## Parent Atlas Workstation Integration

### Current Status (from workstation-todo.md)
- Production readiness: PASS 66 / WARN 0 / FAIL 0 ✅
- Parent Atlas package final gate: 5/5 PASS ✅
- Packet identity and fusion-score repeatability: 50/50 exact ✅
- Live service environment: READY 6 / mismatch 0 ✅

### What Gets Better with 4 Layers
1. **Debugging**: Instead of "Tool took 8200ms", you see exact breakdown
2. **Optimization**: Identify which kernel/resource dominates latency
3. **Reliability**: Track packet provenance from query→result
4. **Auditing**: Complete trace of which version ran on which packet

### Hooks This Enables
```bash
npm run atlas:telemetry:packet-trace <packet_id>
  # Shows complete lifecycle of packet_id through entire pipeline
  
npm run atlas:telemetry:kernel-breakdown <trace_id>
  # Shows per-kernel GPU telemetry for a specific query
  
npm run atlas:telemetry:latency-heatmap
  # Renders heatmap showing which stage dominates latency
  
npm run atlas:dashboard:packet-centric
  # Grafana dashboard from packet-centric provenance data
```

---

## Success Criteria

### Layer 1: Packet Contract
✅ All 4 adapters write envelope-shaped data
✅ trace_id flows through all mirrors
✅ Triple consistency verified before all writes

### Layer 2: RPC/Transport
✅ Protobuf encode/decode timing measured
✅ JSON serialization overhead tracked
✅ Transport protocol version recorded in telemetry

### Layer 3: Resource
✅ Per-kernel GPU telemetry {kernel, duration, cuda_stream}
✅ Redis, Qdrant, Neo4j operations tracked separately
✅ No operation latency hidden in parent tool event

### Layer 4: Packet-Centric Provenance
✅ packet_id in every trace event
✅ feature_id in every trace event
✅ som_cell, schema_version, embedding_version tracked
✅ Complete packet lifecycle traceable via trace_id + packet_id

---

## Timeline

**Session 84**: 8-12 hours focused work
- [ ] Phase 2 adapters (4-6h)
- [ ] Packet-centric telemetry (3-4h)
- [ ] LangGraph split (2-3h) [optional, clarity only]
- [ ] NATS wiring (1-2h)
- Result: **95% complete**

**Session 85**: GPU kernel optimization
- [ ] Per-kernel telemetry
- [ ] Serialization latency
- [ ] Dashboard
- Result: **100% complete + observable**

---

**Checklist Status**: ⏳ READY FOR SESSION 84

