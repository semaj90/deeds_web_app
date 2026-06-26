# Session 84: Execution Summary — 4 Missing Visibility Layers

**Date**: June 26, 2026  
**Current State**: 76% complete (28 LIVE components, 5 PARTIAL, 3 PENDING, 8 NOT YET)  
**Target State**: 95% complete by end of Session 84  
**Scope**: Add 4 missing visibility layers to parent-atlas telemetry architecture  

---

## Quick Answer: What's Missing?

### ❌ NOT WIRED YET (Blocking 24%)

| Layer | Component | Status | Impact | Hours |
|-------|-----------|--------|--------|-------|
| **1** | Qdrant adapter → envelope | ❌ | +3% | 1-2h |
| **1** | Neo4j adapter → envelope | ❌ | +3% | 1-2h |
| **1** | Valkey adapter → bitfrostKey | ❌ | +3% | 1-2h |
| **1** | Postgres adapter → envelope | ❌ | +3% | 1-2h |
| **2** | Serialization telemetry | ❌ | +2% | 1-2h |
| **3** | GPU kernel telemetry | ❌ | +4% | 2-3h |
| **3** | Redis op telemetry | ❌ | +2% | 1-2h |
| **3** | Qdrant op telemetry | ❌ | +2% | 1-2h |
| **3** | Neo4j op telemetry | ❌ | +1% | 1h |
| **4** | Packet-centric provenance | ❌ | +8% | 3-4h |
| **5** | NATS event wiring | ❌ | +4% | 1-2h |
| **6** | LangGraph node split | ❌ | +3% | 2-3h |

**Total**: 12 gaps × 1.5h average = **18 hours to 100%** (fits in 8-12h focused Session 84 work)

---

## The 4 Layers, Explained for Parent Atlas

### Layer 1: Packet Contract Layer (CORE → ADAPTERS)

**What It Is**: Canonical PacketIdentity + AtlasMemoryEnvelope flowing through all data stores

**What's LIVE** (Session 83):
```
✅ atlas-core/packet/identity.ts — canonical types
✅ atlas-core/types/index.ts — AtlasMemoryEnvelope
✅ parent-atlas/canonical-packet-bridge.ts — bridge functions
✅ parent-atlas/packet-validator-materializer.ts — core validator uses bridge
```

**What's MISSING** (Session 84):
```
❌ adapters/qdrant.ts — NOT using createEnvelopeFromRow()
   TODO: Write payload with trace_id, packet_key, source_ref, feature_id

❌ adapters/neo4j.ts — NOT including trace_id in relationships
   TODO: Add trace_id to USED_CONCEPT, BELONGS_TO relationships

❌ adapters/valkey.ts — NOT using bitfrostKey() pattern
   TODO: Use bitfrostKey('packet', identity.packet_key) for all keys

❌ adapters/postgres.ts — NOT including envelope in audit logs
   TODO: Store envelope shape in audit_trail table
```

**Why It Matters**: Without this, adapters write inconsistent data shapes. Qdrant, Neo4j, Redis have different identity field names. Debugging packet lifecycle is impossible.

**Test After**: All adapters use `createEnvelopeFromRow()` and `verifyPacketIdentityConsistency()` before writing.

---

### Layer 2: RPC/Transport Layer (TOOL → RESOURCE)

**What It Is**: Explicit telemetry for protocol overhead (protobuf encode/decode, JSON stringify, marshalling)

**What's LIVE**:
```
✅ grpc/embedding-client.ts — HTTP + gRPC fallback exists
✅ grpc/retrieval-client.ts — gRPC client exists
```

**What's MISSING**:
```
❌ grpc/embedding-client.ts — NO protobuf encode timing
   TODO: Measure time from packet → protobuf wire format

❌ grpc/embedding-client.ts — NO protobuf decode timing
   TODO: Measure time from protobuf wire format → response object

❌ grpc/retrieval-client.ts — NO transport telemetry
   TODO: Track serialization overhead separately from RPC latency

❌ context-assembler.ts — NO JSON stringify/parse telemetry
   TODO: Measure overhead of JSON conversions in retrieval pipeline
```

**Why It Matters**: Serialization can dominate latency (especially for small payloads). Currently hidden in "tool took 3200ms".

**Test After**: Telemetry shows `{"protobuf_encode_ms": 0.05, "protobuf_decode_ms": 0.03}` on each gRPC call.

---

### Layer 3: Resource Layer (RESOURCE → RESULT)

**What It Is**: Granular telemetry for each resource operation (GPU kernels, cache ops, DB queries)

**What's LIVE**:
```
✅ gpu/libtorch-bridge.ts — computeGpuSimilarity() works
✅ gpu/simdjson-bridge.ts — fastJsonParse() works
✅ Redis, Qdrant, Neo4j clients exist
```

**What's MISSING**:
```
❌ GPU KERNELS (per-kernel telemetry)
   ❌ embedding kernel — measure 768d → 768d embedding time
   ❌ GEMM kernel — measure matmul latency separately
   ❌ cosine kernel — measure dot product latency
   ❌ topk kernel — measure top-K selection latency
   ❌ cross-encoder kernel — measure rerank latency
   ❌ autoencoder kernel — measure 768→64 compression (if used)
   ❌ SOM kernel — measure grid lookup latency

❌ REDIS OPS
   ❌ GET timing — currently hidden in "cache hit took Xms"
   ❌ SET/SETEX timing — currently hidden in "cache write took Xms"
   ❌ DEL timing — invalidation latency not measured

❌ QDRANT OPS
   ❌ Search timing — separate from retrieval total
   ❌ Upsert timing — mirror sync latency not measured

❌ NEO4J OPS
   ❌ Query timing — topology queries not separate from tool latency
```

**Why It Matters**: Can't optimize what you can't measure. "GPU took 270ms" doesn't tell you if GEMM is 45ms or 180ms.

**Test After**: Each kernel/operation has `{"stage": "...", "duration_ms": X, "trace_id": "..."}` event.

---

### Layer 4: Packet-Centric Provenance Layer (REQUEST → PACKET → RESULT)

**What It Is**: Every trace event includes full packet identity + version info, creating complete audit trail

**What's LIVE**:
```
✅ atlas-core/types/index.ts — AtlasMemoryEnvelope.trace_id defined
✅ canonical-packet-bridge.ts — createEnvelopeFromRow() creates envelope
```

**What's MISSING**:
```
❌ PACKET IDENTITY TRACKING (not in telemetry yet)
   ❌ packet_id — which packet was this operation on?
   ❌ feature_id — which feature lane?
   ❌ source_ref — canonical source location
   ❌ packet_key — immutable packet identity
   ❌ som_cell — topology position [x, y]

❌ VERSION TRACKING (not in telemetry yet)
   ❌ schema_version — "atlas_packets v1.0"
   ❌ embedding_version — "embeddinggemma:latest"
   ❌ tool_version — "acp-tool:1.2.3"
   ❌ gpu_kernel_version — "cuda_12.1 + turbovector v2.1"
   ❌ rpc_transport — "grpc:1.0" or "http:1.1"

❌ EVERY TRACE EVENT should be:
   ❌ acp_routing_decision — missing packet context
   ❌ packet_builder — missing version tracking
   ❌ cache_lookup — missing packet_id
   ❌ retrieval_search — missing feature_id
   ❌ gpu_kernels — missing gpu_kernel_version
   ❌ gemma4_synthesis — missing tool_version
   ❌ validation_gates — missing packet context
   ❌ write_commit — missing rpc_transport
```

**Why It Matters**: Without this, you can't debug "why did this packet get a different answer?" Because you can't link results back to which version of which embedding model with which GPU kernel ran on which packet.

**Test After**: Every trace event includes `{"trace_id": "...", "packet_id": "...", "feature_id": "...", "schema_version": "...", "gpu_kernel_version": "..."}`.

---

## Priority Order for Session 84

### 1️⃣ CRITICAL: Phase 2 Adapters (4-6 hours) → +12%
```
This unblocks the canonical packet contract from just the core validator
to the entire system. All mirrors must write envelope-shaped data.

qdrant.ts:
  - Replace manual payload construction with createEnvelopeFromRow()
  - Verify triple before writing: verifyPacketIdentityConsistency()
  - Store trace_id in Qdrant metadata

neo4j.ts:
  - Include trace_id in all relationship properties
  - Use canonical identity for node metadata
  - Link packets with full envelope context

valkey.ts:
  - Use bitfrostKey() for ALL cache keys
  - Store envelope shape (not just values)
  - Trace_id on every SET/SETEX

postgres.ts:
  - Include envelope in audit_trail
  - Track write operations with full context
  - Maintain canonical truth with canonical shape
```

### 2️⃣ HIGH: Packet-Centric Telemetry (3-4 hours) → +8%
```
This makes the entire pipeline observable via packet identity.

Add to EVERY telemetry event:
  - packet_id (what packet are we operating on?)
  - feature_id (which lane?)
  - source_ref (canonical source)
  - som_cell (topology position)
  - schema_version (data contract version)
  - embedding_version (which embedding model?)
  - tool_version (which tool version?)
  - gpu_kernel_version (which GPU toolkit?)
  - rpc_transport (grpc or http?)

Target files:
  - packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts
  - packages/parent-atlas/src/core/packet-validator-materializer.ts
  - packages/parent-atlas/src/pipelines/*.ts (all pipelines)
  - sveltekit-frontend/src/lib/server/gpu/*.ts (GPU ops)
  - sveltekit-frontend/src/lib/server/ollama.ts (synthesis)
```

### 3️⃣ MEDIUM: GPU Kernel Telemetry (2-3 hours) → +4%
```
Break GPU work into observable kernels.

Each kernel needs: {kernel, duration_ms, cuda_stream}

Kernels to instrument:
  - embedding: 768d input → 768d output
  - gemm: A × B = C matrix multiply
  - cosine: dot product + L2 normalization
  - topk: select top K values
  - cross_encoder: rerank with cross-attention
  - autoencoder: 768→64 compression (if used)
  - som: grid lookup + adjacency

Target file:
  - sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts
  - sveltekit-frontend/src/lib/server/retrieval/gpu-graph-analysis.ts
```

### 4️⃣ MEDIUM: NATS Event Wiring (1-2 hours) → +4%
```
Connect the Postgres→Redis→NATS flow.

Currently defined but not connected:
  packages/atlas-core/src/events/subjects.ts

Needs to be called from:
  packages/parent-atlas/src/pipelines/write-trace.ts (or similar)

Flow:
  1. Postgres write succeeds
  2. Call: await redisClient.del([keys])  // invalidate
  3. Call: await natsClient.publish(subjects.TRACE_CHECKPOINT_COMPLETE, envelope)
  4. Subscribers receive event (gates can hook on this)
```

### 5️⃣ OPTIONAL: LangGraph Node Split (2-3 hours) → +3% clarity
```
Replace monolithic worker with 7 explicit nodes.

Currently: Single worker orchestrates everything → "worker took 8200ms"

Proposed:
  Node 1: ACP Decision → Node 2: Packet Builder → Node 3: Retrieval →
  Node 4: GPU → Node 5: Synthesis → Node 6: Validation → Node 7: Writer

Each edge has telemetry: "acp_to_packet took 3.8ms"

This is optional for completion but HIGH value for clarity.
```

---

## Grep Commands to Find Exact Gaps

```bash
# Find all adapters
find packages/parent-atlas/src/adapters/ -name "*.ts"

# Check if any use canonical bridge
rg -n "createEnvelopeFromRow|bitfrostKey|verifyPacketIdentityConsistency" \
  packages/parent-atlas/src/adapters/

# Expected: 0 matches (currently NOT wired)

# Find all telemetry events
rg -n "telemetry\|trace_id\|event\|emit" \
  packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts

# Check for packet_id presence
rg -n "packet_id|feature_id|som_cell" \
  packages/atlas-core/src/telemetry/

# Expected: 0-1 matches (minimal)

# Find GPU operations
rg -n "cuda|kernel|computeGpuSimilarity|GEMM|cosine|topk" \
  sveltekit-frontend/src/lib/server/gpu/

# Check for per-kernel telemetry
rg -n "kernel.*duration|cuda_stream|telemetry.*kernel" \
  sveltekit-frontend/src/lib/server/gpu/

# Expected: 0-1 matches (not instrumented)

# Find NATS subjects
rg -n "subjects\.|TRACE_CHECKPOINT|PACKET_MATERIALIZED" \
  packages/atlas-core/src/events/

# Check if published anywhere
rg -n "natsClient.publish|nats.*emit" \
  packages/parent-atlas/

# Expected: 0 matches (wiring incomplete)
```

---

## Success Criteria

✅ **Session 84 Complete When**:

1. All 4 adapters use `createEnvelopeFromRow()` before writing
2. Every telemetry event includes `packet_id`, `feature_id`, `som_cell`, version fields
3. GPU operations emit `{kernel, duration_ms, cuda_stream}` telemetry
4. Postgres→Redis→NATS flow is wired and tested
5. `npm run atlas:telemetry:packet-trace <id>` shows complete lifecycle

---

## Result

**Starting**: 76% complete (28 LIVE, 5 PARTIAL, 3 PENDING, 8 NOT YET)  
**Ending**: 95% complete (40+ LIVE, 2 PARTIAL, 0 PENDING, 2 NOT YET)  
**Time**: 8-12 focused hours in Session 84  
**Remaining**: GPU kernel optimization (Session 85)  

---

**Status**: ✅ Ready for Session 84 execution

