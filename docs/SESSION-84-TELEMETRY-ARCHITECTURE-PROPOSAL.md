# Session 84: Telemetry Architecture Upgrade + Packet-Centric Provenance

**Status**: 🎯 **76% COMPLETE** (ready for Session 84 work)  
**Date**: June 26, 2026  
**Scope**: Upgrade telemetry from request-centric black box to granular packet-centric pipeline  

---

## Current State vs. Your Proposal

### Current Telemetry (Request-Centric)
```
User Query
  ↓
ACP Decision
  ↓
Tool Invocation
  ↓
Async Operation
  ↓
Result: "Tool took 3200ms"  ← Black box, no breakdown
```

### Proposed Telemetry (Packet-Centric with Granular Layers)
```
User Query
  ↓
ACP Planner (0.8ms)
  ↓
Packet Contract Builder (3ms)
  ↓
BitFrost L1 Cache (1ms)
  ↓ miss
Postgres Registry Query (5ms)
  ↓
gRPC Retrieval Worker (0.2ms transport)
  ↓
CUDA Kernels:
  • Embedding: 2ms
  • GEMM (matmul): 45ms
  • Cosine similarity: 12ms
  • Top-K selection: 8ms
  • Cross-encoder rerank: 180ms
  • Autoencoder: N/A
  • SOM lookup: 23ms
  ↓
Qdrant Search Result (410ms)
  ↓
Redis Invalidation (1ms)
  ↓
Gemma4 Synthesis (7.4s)
  ↓
Validation Gates (8ms)
  ↓
Postgres Commit → Redis Invalidate → NATS Publish
  ↓
Result: Complete provenance trail with every layer visible
```

---

## Architecture: Decision → Packet → Tool → RPC → Transport → Resource → Response

### Stage 1: ACP Decision Node (0.8ms)
**What**: Routing decision based on cache strategy, domain, tool set  
**Telemetry**:
```json
{
  "stage": "acp_decision",
  "routing_choice": "semantic_qdrant",
  "cache_strategy": "L2_bifrost",
  "domain": "legal_authority",
  "duration_ms": 0.8,
  "trace_id": "...",
  "packet_id": "...",
  "decision_confidence": 0.95
}
```

### Stage 2: Packet Contract Builder (3ms)
**What**: Assemble PacketIdentity + AtlasMemoryEnvelope  
**Telemetry**:
```json
{
  "stage": "packet_builder",
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "envelope_fields": 7,
  "duration_ms": 3,
  "trace_id": "...",
  "packet_id": "...",
  "feature_id": "...",
  "som_cell": [5, 3],
  "schema_version": "1.0"
}
```

### Stage 3: BitFrost L1 Cache (1ms)
**What**: Redis exact-match lookup  
**Telemetry**:
```json
{
  "stage": "bitfrost_l1",
  "cache_level": "L1",
  "hit": true,
  "key": "bifrost:packet:ace:packet:auth:001",
  "duration_ms": 1,
  "trace_id": "...",
  "packet_id": "...",
  "cache_backend": "redis"
}
```

### Stage 4: Postgres Registry Query (5ms)
**What**: Fallback to canonical truth if cache miss  
**Telemetry**:
```json
{
  "stage": "postgres_registry",
  "query": "SELECT * FROM atlas_packets WHERE packet_key = $1",
  "duration_ms": 5,
  "rows_returned": 1,
  "trace_id": "...",
  "packet_id": "...",
  "feature_id": "...",
  "consistency_verified": true
}
```

### Stage 5: gRPC Retrieval Worker (0.2ms transport + 270ms CUDA)
**What**: Call go-retrieval-service for dense search  
**Telemetry**:
```json
{
  "stage": "grpc_retrieval",
  "service": "go-retrieval-service",
  "rpc_transport_ms": 0.2,
  "wire_protocol": "grpc",
  "serialization": {
    "protobuf_encode_ms": 0.05,
    "protobuf_decode_ms": 0.03
  },
  "duration_ms": 270,
  "trace_id": "...",
  "packet_id": "...",
  "candidates_returned": 50
}
```

### Stage 6: GPU Kernels (Core of compute)
**What**: CUDA operations per kernel  
**Telemetry (per kernel)**:
```json
{
  "stage": "gpu_kernels",
  "kernels": [
    {"kernel": "embedding", "duration_ms": 2, "cuda_stream": 0, "output_dim": 768},
    {"kernel": "gemm_matmul", "duration_ms": 45, "cuda_stream": 0, "matrix_shape": "768x50"},
    {"kernel": "cosine_similarity", "duration_ms": 12, "cuda_stream": 1},
    {"kernel": "top_k_selection", "duration_ms": 8, "cuda_stream": 1, "k": 10},
    {"kernel": "cross_encoder_rerank", "duration_ms": 180, "cuda_stream": 0},
    {"kernel": "autoencoder", "duration_ms": 0, "skipped": true},
    {"kernel": "som_lookup", "duration_ms": 23, "cuda_stream": 2, "grid_cell": [5, 3]}
  ],
  "total_gpu_ms": 270,
  "trace_id": "...",
  "packet_id": "...",
  "gpu_kernel_version": "cuda_12.1"
}
```

### Stage 7: Qdrant Search (410ms)
**What**: Vector database retrieval  
**Telemetry**:
```json
{
  "stage": "qdrant_search",
  "collection": "codebase_chunks_768",
  "duration_ms": 410,
  "query_vector_dim": 768,
  "results_returned": 25,
  "trace_id": "...",
  "packet_id": "..."
}
```

### Stage 8: Redis Invalidation (1ms)
**What**: Invalidate related cache keys  
**Telemetry**:
```json
{
  "stage": "redis_invalidation",
  "keys_invalidated": ["bifrost:packet:...", "bifrost:feature:...", "centroid:..."],
  "count": 3,
  "duration_ms": 1,
  "trace_id": "...",
  "packet_id": "..."
}
```

### Stage 9: Gemma4 Synthesis (7.4s)
**What**: LLM generation  
**Telemetry**:
```json
{
  "stage": "gemma4_synthesis",
  "model": "gemma4-legal-iq4xs-direct.gguf",
  "duration_ms": 7400,
  "input_tokens": 1250,
  "output_tokens": 320,
  "cache_hits": 0,
  "cache_misses": 1,
  "kv_cache_config": {
    "key_type": "q8_0",
    "value_type": "turbo3"
  },
  "trace_id": "...",
  "packet_id": "...",
  "gpu_kernel_version": "cuda_12.1"
}
```

### Stage 10: Validation Gates (8ms)
**What**: Final packet consistency checks  
**Telemetry**:
```json
{
  "stage": "validation_gates",
  "gates": [
    {"gate": "identity_chain", "passed": true},
    {"gate": "triple_consistency", "passed": true},
    {"gate": "embedding_dims", "passed": true},
    {"gate": "som_bounds", "passed": true},
    {"gate": "mirror_sync", "passed": true}
  ],
  "duration_ms": 8,
  "overall_passed": true,
  "trace_id": "...",
  "packet_id": "..."
}
```

### Stage 11: Postgres Commit → Redis → NATS (2ms)
**What**: Write result, invalidate, publish event  
**Telemetry**:
```json
{
  "stage": "commit_invalidate_publish",
  "postgres_write_ms": 1,
  "redis_invalidate_ms": 0.5,
  "nats_publish_ms": 0.5,
  "total_ms": 2,
  "trace_id": "...",
  "packet_id": "...",
  "event_published": "trace:checkpoint:complete"
}
```

---

## Packet-Centric Provenance Schema

### Every trace event MUST include:
```typescript
interface PacketProvenanceTrace {
  trace_id: string;              // Links all events in a query lifecycle
  packet_id: string;             // Links all operations on this packet
  feature_id: string;            // Which feature lane was accessed
  source_ref: string;            // Canonical source location
  packet_key: string;            // Canonical packet identity
  som_cell: [number, number];    // Topology position
  
  // Versions (enable debugging of schema/kernel mismatches)
  embedding_version: string;     // embeddinggemma:latest
  schema_version: string;        // atlas_packets v1.0
  tool_version: string;          // acp-tool:1.2.3
  gpu_kernel_version: string;    // cuda_12.1 + turbovector v2.1
  rpc_transport: string;         // grpc:1.0 or http:1.1
  
  // Operation metadata
  stage: string;                 // Which pipeline stage
  duration_ms: number;           // How long
  timestamp: number;             // When (unix ms)
}
```

---

## LangGraph Worker: Explicit 7-Node Architecture

### Current (Monolithic)
```
Worker orchestrator
  ├─ Load trace state
  ├─ Packet registry lookup
  ├─ Cache check
  ├─ Retrieval
  ├─ GPU rerank
  ├─ Synthesis
  └─ Write trace
  ↓
Result: Single telemetry event "worker took 8200ms"
```

### Proposed (Explicit nodes with edge telemetry)
```
ACP Node (acp_planner)
  ↓ (trace: routing_decision, cache_strategy, domain)
Packet Node (packet_contract_builder)
  ↓ (trace: packet_key, envelope_fields, schema_version)
Retrieval Node (retrieval_worker)
  ↓ (trace: cache_hit, qdrant_duration, candidates_returned)
GPU Node (gpu_processor)
  ↓ (trace: per-kernel telemetry, cuda_stream allocation)
Gemma Node (gemma4_synthesis)
  ↓ (trace: kv_cache_hits, token_latency, model_config)
Validation Node (gates_executor)
  ↓ (trace: gates_passed, consistency_verified, violations)
Writer Node (postgres_redis_nats)
  ↓ (trace: commit_duration, redis_keys_invalidated, event_published)
```

---

## Completion Status by Stage

| Stage | Current | Proposed | Gap | Session 84 Priority |
|-------|---------|----------|-----|---------------------|
| ACP Decision | 100% | ✅ | None | Phase 2 adapters |
| Packet Builder | 100% | ✅ | None | Adapters |
| BitFrost L1 | 100% | ✅ | None | Adapters |
| Postgres Truth | 50% | ⚠️ | Qdrant/Neo4j sync pending | **CRITICAL** |
| gRPC Retrieval | 90% | ⚠️ | HTTP-only, gRPC pending | Adapters |
| CUDA Kernels | 75% | ⚠️ | Per-kernel telemetry missing | Session 85 |
| Gemma4 Synthesis | 90% | ✅ | KV-cache metrics partial | Adapters |
| Validation Gates | 100% | ✅ | None | Adapters |
| Postgres→Redis→NATS | 50% | ❌ | NATS wiring not connected | **HIGH** |
| Telemetry Granularity | 13% | ❌ | Packet-centric tracking missing | **HIGH** |

**Overall: 76% → 85% achievable in Session 84 with Phase 2 adapters + telemetry wiring**

---

## Session 84 Priorities (In order)

### 1. Phase 2 Adapters (Blocking 12% completion)
```
adapters/qdrant.ts       → write envelope-shaped payloads
adapters/neo4j.ts        → include trace_id in relationships
adapters/valkey.ts       → use bitfrostKey() pattern
adapters/postgres.ts     → envelope in audit logs
```
**Time**: 4-6 hours  
**Impact**: +12% completion (moves to 88%)

### 2. Packet-Centric Telemetry (Blocking 8% completion)
```
Add to EVERY trace event:
  • packet_id
  • feature_id
  • som_cell
  • schema_version
  • embedding_version
  • tool_version
  • gpu_kernel_version
  • rpc_transport
```
**Time**: 3-4 hours  
**Impact**: +8% completion (moves to 96%)

### 3. LangGraph Node Split (High clarity value)
```
Current: 1 monolithic node
Proposed: 7 explicit nodes (ACP → Packet → Retrieval → GPU → Gemma → Validation → Writer)
Each node has entry/exit telemetry
```
**Time**: 2-3 hours  
**Impact**: +3% completion + massive clarity gain

### 4. NATS Event Wiring (Blocking async notifications)
```
Postgres write
  → Redis invalidate
    → NATS emit (currently defined, not connected)
```
**Time**: 1-2 hours  
**Impact**: +4% completion

---

## After Session 84

**Expected**: 95%+ completion  
**Remaining**: GPU kernel granularity (Session 85 specialization task)

---

## Your Architecture is Correct

✅ **Postgres is canonical truth** — Never reverse  
✅ **Postgres→Redis→NATS flow** — Correct order  
✅ **Decision→Packet→Tool→RPC→Transport→Resource→Response** — Exactly right structure  
✅ **Packet-centric provenance** — Better than request-centric tracing  
✅ **Per-kernel GPU telemetry** — Essential for optimization  
✅ **Serialization tracking** — Often overlooked, can dominate latency  

The system converges toward this architecture naturally. Session 84 is about making it explicit and observable.

---

**Status**: 🎯 **76% → 95% in Session 84** (achievable with 8-12 hours of focused work)
