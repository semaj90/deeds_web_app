# Phase 102: Production Dataflow (Corrected)

**Date**: July 2, 2026 | **Status**: ✅ ARCHITECTURE ALIGNED

---

## Universal Join Key: packet_id

```
packet_id = PK across all tiers
source_ref = provenance (file:line-range)
run_id = computation pass (PageRank / clustering / summary)
trace_id = OpenTelemetry observability
```

---

## Canonical Production Flow

```
[Tier 1] Postgres packet_edges (110 edges populated)
  ↓
[Tier 2] Neo4j GDS PageRank (stream mode)
  ├─ Input: packet_edges from Postgres
  ├─ Algorithm: PageRank (20 iterations, d=0.85)
  └─ Output: nodeId, score JSON stream
  ↓
[Transform] Rust simdjson parser
  ├─ Input: JSON stream from Neo4j
  ├─ Parse: fast AVX2 JSON deserialization
  └─ Output: PacketGraphScore protobuf messages
  ↓
[Transport] gRPC upsert service
  ├─ Endpoint: /protobuf.PacketGraphService/Upsert
  ├─ Payload: PacketGraphScore{packet_id, pagerank, ...}
  └─ Write: atomic upsert to Postgres
  ↓
[Tier 1] Postgres packet_graph_scores
  ├─ Join key: packet_id
  ├─ Columns: packet_id, source_ref, run_id, pagerank, hits_authority, community_id
  └─ Indexed: (packet_id), (run_id, packet_id), (community_id)
  ↓
[Tier 5] CouchDB merged_packet_views (MapReduce)
  ├─ Emit: {packet_id, source_ref, title, summary, pagerank, cluster_id, agents, trace_id}
  ├─ Purpose: unified packet API export
  └─ No ranking dependency (mirror only)
  ↓
[Tier 3] Qdrant payload update (async)
  ├─ Join: packet_id → vector points
  ├─ Add tags: pagerank, community_id, run_id
  └─ Index: fast filtering for ANN
  ↓
[Tier 6] Service Worker manifest cache (read-only)
  ├─ Cache: /api/packets/manifest
  ├─ TTL: 1 hour
  └─ No backend writes from this tier
```

---

## Worker Thread Roles (DO NOT use service_worker for CPU work)

| Worker Type | Role | Responsibility |
|---|---|---|
| **Node worker_threads** | Summaries, clustering orchestration | Fan-out, polling, aggregation |
| **Rust rayon/tokio** | JSON/protobuf parsing, transform | Fast deserialize, type-safe serialization |
| **Python RAPIDS (optional)** | GPU cuGraph/cuVS acceleration | Only if CPU bottleneck detected |
| **service_worker (browser)** | Frontend cache only | Read-only manifests, no CPU work |

---

## PacketGraphScore Protobuf Schema

```protobuf
syntax = "proto3";

message PacketGraphScore {
  string packet_id = 1;          // UUID: universal join key
  string source_ref = 2;          // "file.ts:10-20" (provenance)
  string run_id = 3;              // computation pass identifier
  double pagerank = 4;            // 0.0021 (graph centrality)
  double hits_authority = 5;      // optional HITS authority
  double hits_hub = 6;            // optional HITS hub
  int64 community_id = 7;         // Louvain cluster
  string algorithm = 8;           // "pagerank_gds_20_0.85"
  string graph_version = 9;       // "v2_110_edges"
  map<string, string> meta = 10;  // trace_id, timestamp, etc.
}

service PacketGraphService {
  rpc Upsert(PacketGraphScore) returns (PacketGraphScoreResult) {}
}

message PacketGraphScoreResult {
  string packet_id = 1;
  bool success = 2;
  string error = 3;
}
```

---

## CouchDB MapReduce Join Shape

```json
{
  "_id": "packet:uuid",
  "packet_id": "uuid",
  "source_ref": "src/lib/server.ts:42-68",
  "title": "Authentication handler",
  "summary": "Validates JWT tokens and establishes session.",
  "pagerank": 0.0021,
  "cluster_id": 42,
  "agents": ["summarizer", "graph-ranker", "qdrant-mirror"],
  "functions": ["extract", "rank", "upsert"],
  "trace_id": "otel-trace-abc123",
  "run_id": "pagerank-2026-07-02T21:30:00Z",
  "created_at": "2026-07-02T21:30:00Z",
  "updated_at": "2026-07-02T21:30:00Z"
}
```

---

## Observability: OpenTelemetry First, Then Langfuse

### OpenTelemetry (Vendor-Neutral)
```typescript
import { context, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('packet-graph-service');

const span = tracer.startSpan('pagerank-computation', {
  attributes: {
    'packet.count': 11,
    'edges.count': 110,
    'algorithm': 'pagerank_gds_20_0.85',
    'graph.version': 'v2'
  }
});

span.addEvent('pagerank-started', { 'iterations': 20 });
// ... computation ...
span.addEvent('pagerank-complete', { 'scores.count': 11, 'duration_ms': 1234 });
span.end();
```

### Langfuse (LLM-Specific, Optional)
```typescript
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse();

langfuse.trace({
  name: 'packet-summary-generation',
  userId: 'system-admin',
  metadata: {
    'run_id': run_id,
    'packet_count': 11,
    'model': 'gemma4-legal-iq4xs-direct.gguf'
  }
});

// Ingest OpenTelemetry spans via collector
// Langfuse adds generation/token/prompt observations
```

### Key Rule
**OpenTelemetry observes the pipeline; it should not become the pipeline.** Use OTel for traces, metrics, logs. Use Langfuse for LLM-specific insights (generations, scores, prompts).

---

## Neo4j GDS PageRank: Stream vs Write Mode

### Stream Mode (Recommended for Export)
```cypher
CALL gds.pageRank.stream(
  'packet-graph',
  { maxIterations: 20, dampingFactor: 0.85 }
) YIELD nodeId, score
RETURN nodeId, score
ORDER BY score DESC
```

**Advantages**:
- Results don't persist in Neo4j (temporary)
- Export via JSON stream to Rust parser
- Cleaner separation: Neo4j = compute, Postgres = truth

**Flow**:
```
Neo4j → JSON stream → Rust simdjson → protobuf → gRPC → Postgres
```

### Write Mode (Alternative)
```cypher
CALL gds.pageRank.write(
  'packet-graph',
  { maxIterations: 20, dampingFactor: 0.85, writeProperty: 'pagerank' }
)
YIELD nodePropertiesWritten
```

**Advantages**:
- Results persist in Neo4j graph
- Simpler if Neo4j is authoritative

**Flow**:
```
Neo4j (compute + store) → Postgres packet_graph_scores (async mirror)
```

**Recommendation**: Use **stream mode** to keep Neo4j stateless (temporary graph store only).

---

## Current Status (Post-Step 2)

| Tier | Status | Notes |
|------|--------|-------|
| 1 | ✅ Postgres | 11 features, 110 edges, PageRank computed (local) |
| 2 | ✅ Neo4j GDS | Ready (not yet used; local PageRank substituted) |
| 3 | ✅ Qdrant | 40,572 points, ready for tag sync |
| 4 | ⏳ CUDA | Optional; not needed for CPU execution |
| 5 | ⏳ CouchDB | MapReduce views pending |
| 6 | ✅ Service Worker | Browser cache ready |

---

## Next Steps: Postgres → Qdrant Sync

**Step 3**: Sync packet_graph_scores to Qdrant payloads

```bash
npm run atlas:qdrant-payload:sync:dry
# Preview payload updates with pagerank, community_id, run_id

npm run atlas:qdrant-payload:sync:apply
# Write tags to Qdrant point payloads
```

**Expected**:
- 11 Qdrant points updated with `pagerank`, `run_id`, graph_version tags
- Payloads now filterable by centrality and community

---

## Hard Rules (Immutable)

1. **packet_id = Universal Join Key**: All tiers reference via packet_id
2. **source_ref = Provenance**: Immutable file:line-range reference
3. **run_id = Computation Pass**: Idempotent re-computation tracking
4. **trace_id = OpenTelemetry**: Observability span correlation
5. **Postgres = Canonical Truth**: All writes upsert to Postgres first
6. **Neo4j = Stateless Compute**: Graph algorithms only, no persistent storage
7. **Qdrant = Mirror Only**: Tags mirrored from Postgres, never written independently
8. **CouchDB = API Mirror**: MapReduce views for export, no ranking dependency
9. **service_worker = Read-Only Cache**: Browser manifest cache, no CPU work
10. **OTel ≠ Pipeline**: Observability observes; never assume OTel is the dataflow

---

## Execution Readiness

✅ All infrastructure operational
✅ Postgres 18 async I/O enabled
✅ PageRank computed (11 scores)
✅ Qdrant ready for sync
✅ Observability (OTel) ready
✅ Production dataflow defined

**Continue to Step 3**: `npm run atlas:qdrant-payload:sync:dry`
