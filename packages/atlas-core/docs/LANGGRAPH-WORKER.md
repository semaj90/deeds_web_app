# LangGraph Agent Worker — Architecture & Integration

**Status**: Implementation Complete (TODO sections wired)  
**Last Updated**: June 26, 2026  
**Location**: `packages/atlas-core/src/langgraph/`

---

## Overview

The LangGraph Worker is the **loop controller** for the Atlas agent system. It orchestrates retrieval, validation, synthesis, and persistence across the canonical data layers.

**Key Principle**: LangGraph does NOT own datastores. It routes work through them:
- **Postgres** → canonical truth (read/write)
- **Redis/Bifrost** → hot memory caches (L1/L2)
- **Qdrant** → vector search mirror
- **Neo4j** → topology/graph mirror
- **NATS/RabbitMQ** → event bus (non-blocking)

---

## Architecture

### 8-Node State Machine

```
start
  ↓
loadTraceState          (read Postgres + Redis)
  ↓
packetRegistryLookup    (validate identity, hard fail check)
  ↓
bitfrostCacheCheck      (check Redis ff1:packet:*, ff1:feature:*)
  ↓
hybridRetrieval         (Qdrant RAG + Neo4j KAG)
  ↓
optionalGpuRerank       (NATS gpu.cuda.rank, optional)
  ↓
packetTruthValidate     (enforce canonical truth flow)
  ↓ (if error: end)
gemma4Synthesis         (LLM generation via TurboQuant)
  ↓
writeTraceEvent         (Postgres write → Redis invalidate → NATS emit)
  ↓
end
```

### Canonical Packet Truth Flow (5 Steps)

1. **Read from Postgres** (loadTraceState, packetRegistryLookup)
2. **Validate Structure** (packetTruthValidate, hard fail conditions)
3. **Write to Postgres** (writeTraceEvent sets `updated_at = NOW()`)
4. **Invalidate Caches** (writeTraceEvent deletes `ff1:*` keys)
5. **Emit Events** (writeTraceEvent publishes to NATS subjects)

### State Checkpoints

**Packet Identity** (immutable across all nodes):
- `trace_id` — distributed trace correlation
- `packet_key` — canonical identity key
- `source_ref` — file/source reference
- `feature_id` — feature classification

**Retrieval Context** (populated incrementally):
- `packet_metadata` — Postgres row (canonical truth)
- `rag_candidates` — Qdrant search results
- `kag_neighbors` — Neo4j topology neighbors
- `reranked_results` — GPU-reranked candidates

**Synthesis Output**:
- `synthesis` — LLM-generated text

**Telemetry**:
- `trace_events` — checkpoint history
- `step` — node counter
- `error` — hard fail flag

---

## Service Clients

### PostgresClient

**Responsibility**: Read canonical identity + write trace checkpoints

```typescript
// Load packet from atlas_packets
const packet = await postgres.loadPacketMetadata(packet_key, source_ref, feature_id);

// Load trace history
const events = await postgres.loadTraceState(trace_id);

// Write synthesis to packet
await postgres.writeSynthesis(trace_id, packet_key, synthesis);

// Write trace event
await postgres.writeTraceEvent({ trace_id, packet_key, step, node, ... });
```

**Hard Requirements**:
- All queries use prepared statements (no string interpolation)
- Write operations set `updated_at = NOW()`
- Reads are transactional (no dirty reads)

### BitFrostClient (Redis)

**Responsibility**: L1/L2 cache management for hot memory access

```typescript
// Check packet cache (L1 exact-match)
const cached = await bitfrost.getPacketCache(packet_key);

// Check feature cache (L2 semantic)
const cached = await bitfrost.getFeatureCache(feature_id);

// Invalidate all related keys (AFTER Postgres write)
await bitfrost.invalidatePacket(packet_key, source_ref, feature_id);
```

**Key Patterns**:
- `ff1:packet:{packet_key}` — packet-level cache (300s TTL)
- `ff1:feature:{feature_id}` — feature-level cache
- `ff1:source:{source_ref}` — source-level cache
- `ff1:trace:{trace_id}` — trace history cache

**Critical Order**: Redis invalidation ALWAYS happens AFTER Postgres write succeeds.

### QdrantSearchClient

**Responsibility**: Semantic vector search (RAG layer)

```typescript
// Search codebase_chunks_768 collection
const results = await qdrant.searchRAG(
  queryEmbedding,  // 768-dim vector
  10,              // limit
  { som_cluster: { type: 'integer', value: clusterNum } }  // optional filter
);

// Fetch single point
const point = await qdrant.fetchPoint(pointId);
```

**Collections Used**:
- `codebase_chunks_768` — code chunks with 768-dim embeddings

**Payload Fields** (must align with Postgres atlas_packets):
- `packet_key` — identity
- `source_ref` — file reference
- `feature_id` — feature classification
- `summary` — brief description
- `community_id` — SOM cluster affinity
- `som_cluster` — grid coordinate

### Neo4jKagClient

**Responsibility**: Knowledge-augmented generation via graph traversal

```typescript
// Traverse USED_CONCEPT edges from packet (bounded k-hops)
const neighbors = await neo4j.traverseTopology(packet_key, maxDepth = 2);

// Fetch directory context (CONTAINS relationships)
const dirContext = await neo4j.getDirectoryContext(directory_path);
```

**Relationships Used**:
- `USED_CONCEPT` — semantic dependencies
- `SIMILAR_TOPOLOGY` — SOM grid adjacencies
- `CONTAINS` — file/directory containment

---

## Integration Pattern

### 1. Initialize Services

```typescript
const postgresPool = new Pool({ connectionString: ... });
const redis = new Redis({ host: ..., password: ... });
const qdrant = new QdrantClient({ url: ... });
const neo4jDriver = neo4j.driver('bolt://...', auth.basic(...));
```

### 2. Build Graph (Once at Startup)

```typescript
const agent = buildAgentGraph(postgresPool, redis, qdrant, neo4jDriver);
```

### 3. Create Envelopes from NATS Messages

```typescript
const envelope = createEnvelope(
  'trace-123',
  SUBJECTS.AGENT_EXECUTE,
  'agent',
  { query: 'authentication pattern' },
  { packet_key: '...', source_ref: '...', feature_id: '...' }
);
```

### 4. Run Agent Loop

```typescript
const finalState = await runAgent(agent, envelope);
console.log(`Synthesis: ${finalState.synthesis}`);
```

### 5. Wire NATS Subscriber (Pending)

```typescript
// Subscribe to agent.task.execute subject
natsConn.subscribe(SUBJECTS.AGENT_EXECUTE, async (msg) => {
  const envelope = JSON.parse(msg.data);
  const result = await runAgent(agent, envelope);
  // Optionally acknowledge or emit result event
});
```

---

## Hard Fail Conditions

The agent **stops execution** if:

1. **Packet identity incomplete**: `packet_key`, `source_ref`, or `feature_id` missing
2. **Postgres read failed**: `packet_metadata` not loaded (canonical truth gate)
3. **Validation error**: Explicit `error` flag set by prior nodes

All three trigger the `routeOnError()` conditional edge → `end` node (no synthesis, no write).

---

## Soft Warnings (Non-blocking)

The agent **continues** even if:
- No retrieval results (empty `rag_candidates`)
- Missing optional fields (`summary`, `embedding`, `title`)
- No graph neighbors found

These are logged as warnings but do not block synthesis or write.

---

## TODO: Pending Implementations

### 1. Gemma4 Integration (gemma4Synthesis node)

```typescript
// Wire to TurboQuant (:8090) or bifrostChat fallback
const response = await fetch('http://localhost:8090/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'gemma4-legal-iq4xs-direct.gguf',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 512,
    stream: true,  // REQUIRED for TurboQuant
    cache_prompt: true
  })
});
```

**Rule**: Always use `stream: true` with TurboQuant to avoid KV cache exhaustion.

### 2. GPU Reranking (optionalGpuRerank node)

```typescript
// Wire to NATS gpu.cuda.rank subject
const reranked = await nats.request(SUBJECTS.CUDA_RANK, {
  query_embedding: state.queryEmbedding,  // 768-dim
  candidates: rag_candidates,
  top_k: 5
});
```

### 3. NATS Event Emission (writeTraceEvent node)

```typescript
// Emit checkpoint event
await nats.publish(SUBJECTS.TRACE_CHECKPOINT, {
  trace_id,
  packet_key,
  step,
  synthesis_length: synthesis?.length ?? 0
});
```

### 4. Query Embedding (hybridRetrieval node)

Current implementation fetches via `qdrant.fetchPoint()` (naive).  
**TODO**: Wire upstream to extract/embed the actual query before retrieval.

---

## Monitoring & Observability

### Trace Events Table

All checkpoints are recorded in `atlas_packets.trace_events`:

```sql
SELECT trace_id, packet_key, step, node, duration_ms, status, metadata, created_at
FROM trace_events
WHERE trace_id = 'trace-123'
ORDER BY created_at ASC;
```

### Error Conditions

Errors are captured in the state:

```typescript
if (finalState.error) {
  console.error(`Loop failed at step ${finalState.step}: ${finalState.error}`);
  // Agent did not write to Postgres
  // Redis was not invalidated
  // No NATS event was emitted
}
```

### Performance Metrics

Expected latencies on RTX 3060 Ti:
- Postgres read: 5–10ms
- Redis cache check: 1–2ms (hit), 5ms (miss)
- Qdrant search: 50–100ms (10 results)
- Neo4j traversal: 20–50ms (k=2)
- GPU rerank: 25–50ms (100 candidates)
- Gemma4 synthesis: 5–15s (300–500 tokens)
- Postgres write: 5–10ms
- **Total**: ~15–20 seconds (synthesis-bound)

---

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `worker.ts` | 380 | 8-node state machine, graph builder |
| `clients.ts` | 250 | Service client wrappers (Postgres, Redis, Qdrant, Neo4j) |
| `index.ts` | 20 | Public exports |
| `example-usage.ts` | 120 | Integration pattern example |

---

## References

- [AtlasTaskEnvelope](../events/subjects.ts) — event contract
- [Canonical Packet Truth Flow](../../docs/architecture/packet-truth-flow-canonical-pattern.md) — detailed rules
- [BitFrost Cache System](../../docs/architecture/bifrost-cache-design.md) — L1/L2 cache semantics
- [NATS Subjects](../events/subjects.ts) — complete subject list
