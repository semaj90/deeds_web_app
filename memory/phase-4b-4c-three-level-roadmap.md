---
name: Phase 4B–4C Three-Level Roadmap
description: Tiered implementation strategy preventing early overbuilding (CPU → RPC → GPU)
type: project
originSessionId: june-12-2026-evening
---

# Phase 4B–4C: Three-Level Roadmap (Prevent Overbuilding)

**Principle**: Build only what scale demands. CPU tools solve 100MB–1GB. RPC contracts next. GPU last.

---

## Level 1: CPU Streaming JSON (Weeks 1–2, NOW)

**Scale**: Suitable for 100MB–1GB artifacts  
**Tools**: `rg`, `jq`, `jq --stream`, `sd`, `ast-grep`, Node.js stream parsers  
**Throughput**: 100–500 MB/s (CPU-bound, no GPU)  
**Latency**: <5s for typical graphify.json

### What to Build

#### 1.1 Concept Extraction via Gemma4 Tool Contract

**File**: `src/lib/server/retrieval/concept-extraction-tool.ts` (NEW, ~120 lines)

```typescript
/**
 * Extract semantic concepts from query via Gemma4 agent.
 * Uses bounded tool contract: query → streaming JSON parse → concept array
 */
export async function extractQueryConceptsViaGemma(
  query: string
): Promise<string[]> {
  // 1. Stream query to Gemma4: "Extract 3–5 semantic concepts from this query"
  // 2. Parse streaming response: concept_name, confidence, category
  // 3. Filter: confidence >= 0.7
  // 4. Return array of concept_ids (lookup in postgres.concepts)
  
  // Prevents: bloated JSON response, memory OOM on huge concept lists
  // Uses: jq + stream parser for bounded memory
}
```

**Integration**: Replace `conceptOverlapSearch()` placeholder in Phase 4A.

**Why CPU-only now**:
- Concept list is <1000 items (fits in memory)
- LLM call dominates latency (not JSON parsing)
- No benefit to GPU parsing for this scale

---

#### 1.2 Neo4j Graph Signal via Cypher Queries

**File**: `src/lib/server/retrieval/neo4j-graph-signal.ts` (NEW, ~100 lines)

```typescript
/**
 * Query Neo4j for graph-based ranking signal.
 * Replaces placeholder in rrf-integration.ts.
 */
export async function queryNeoJsGraphSignal(
  conceptIds: string[],
  topK: number = 20
): Promise<Array<{ id: string; score: number; text?: string }>> {
  // Query pattern:
  // MATCH (c:Concept)-[r:USED_CONCEPT|SIMILAR]->(p:Packet)
  // WHERE c.id IN $conceptIds
  // RETURN p.id, r.weight as score, p.summary as text
  // ORDER BY score DESC LIMIT $topK
  
  // Execution: driver.query() → map results → return
  // Prevents: N+1 queries, unbounded result sets
}
```

**Integration**: Wire into `rrf-integration.ts` `multiLaneRetrievalWithRRF()`.

**Why CPU-only now**:
- Cypher queries are CPU-bound (Neo4j handles execution)
- Result set < 20 packets (not a memory concern)
- No index needed yet (relationship weights pre-materialized)

---

#### 1.3 Test Set Expansion to 20 Queries

**File**: `scripts/rrf-20-query-benchmark.ts` (NEW, ~180 lines)

```typescript
/**
 * Expand ablation test from 5 to 20 hand-labeled queries.
 * Measure DCG@10, NDCG@10, MRR@20, recall for each weight preset.
 */
const TEST_QUERIES_EXPANDED = [
  // Existing 5 from Phase 4A
  { query: "BM25 search in PostgreSQL", relevanceLabels: {...} },
  // + 15 new queries
  { query: "Concept extraction from text", relevanceLabels: {...} },
  { query: "Neo4j relationship traversal", relevanceLabels: {...} },
  // ...
];

export async function runExpandedBenchmark(): Promise<void> {
  // Run all 4 presets (default, bm25_heavy, concept_heavy, vector_heavy)
  // Compute per-query + aggregate metrics
  // Output: JSON report + markdown summary
}
```

**Success Gate**: NDCG@10 >= 0.70 across all 20 queries, all presets.

**Why CPU-only now**:
- 20 queries is not a scaling problem
- Benchmark is embarrassingly parallel (can run in 5 minutes)
- No GPU needed for metric computation

---

### Level 1 Deployment Checklist

- [ ] `concept-extraction-tool.ts` wired into `rrf-integration.ts`
- [ ] `neo4j-graph-signal.ts` wired into `multiLaneRetrievalWithRRF()`
- [ ] 20-query benchmark passes with NDCG@10 >= 0.70
- [ ] API `/api/search/rrf` tested with all weight presets
- [ ] npm scripts updated: `rrf:benchmark:20-query`
- [ ] Memory updated with Level 1 completion status

---

## Level 2: RPC Encoding & Stable Contracts (Weeks 3–4, NEXT)

**Scale**: When subagents start passing packet data between services  
**Tools**: MessagePack (NOW), Protobuf (NEXT), FlatBuffers (LATER)  
**When to activate**: After Level 1 validates metrics, before pushing to >10 subagents

### What to Build

#### 2.1 MessagePack Packet Encoding

**File**: `src/lib/server/retrieval/packet-msgpack.ts` (NEW, ~80 lines)

```typescript
/**
 * Encode/decode atlas_packets via MessagePack for RPC.
 * Reduces JSON 5.3KB → msgpack 2.1KB (60% smaller).
 * Zero-copy deserialization: direct TypedArray → Struct.
 */
export function encodePacketMsgPack(packet: AtlasPacket): Buffer {
  // Stable schema: [id, summary, concept_ids, embedding_id, payload_hash]
  // Omit: transient fields (created_at, updated_at)
  // Returns: Buffer suitable for Redis storage or gRPC transmission
}

export function decodePacketMsgPack(buf: Buffer): AtlasPacket {
  // Reverse: Buffer → Struct → TypeScript object
}
```

**Integration**: Use in:
- Redis packet cache (faster serialization than JSON.stringify)
- Subagent RPC calls (smaller payloads)
- Packet streaming pipelines (Phase 5 QLoRA dataset export)

**Tool contract** (Gemma4/OpenCode):
```typescript
packet.encode_msgpack(packet: AtlasPacket): Buffer
packet.decode_msgpack(buf: Buffer): AtlasPacket
```

**Why NOW**: Packet size is 5KB; compressing to 2KB saves 60% bandwidth to subagents.

---

#### 2.2 Protobuf Service Contract for Retrieval

**File**: `proto/retrieval.proto` (NEW, ~80 lines)

```protobuf
// Stable RPC contract between:
// - Gemma4 agent (caller)
// - Retrieval service (responder)
// - Subagents (future scalers)

syntax = "proto3";

package deeds.retrieval;

service RetrievalService {
  rpc SearchMultiSignal(SearchRequest) returns (SearchResponse);
  rpc ExportTrainingDataset(ExportRequest) returns (stream PacketBatch);
}

message SearchRequest {
  string query = 1;
  int32 k = 2;
  int32 topK = 3;
  float minScore = 4;
  string useWeights = 5; // "default" | "bm25_heavy" | ...
}

message SearchResponse {
  bool success = 1;
  string query = 2;
  repeated SearchResult results = 3;
  SearchBreakdown breakdown = 4;
  int32 durationMs = 5;
}

message SearchResult {
  string id = 1;
  float score = 2;
  string source = 3;
  repeated string sources = 4;
  string text = 5;
  map<string, float> breakdown = 6;
}

message SearchBreakdown {
  int32 bm25Count = 1;
  int32 conceptCount = 2;
  int32 qdrantCount = 3;
  int32 neoCount = 4;
}

// ... ExportRequest, PacketBatch, etc.
```

**Generate**: `protoc retrieval.proto --go_out=. --node_out=.`

**Why NEXT (not NOW)**: Subagents don't exist yet. Wire this once MCP agents start calling retrieval service.

---

#### 2.3 Bounded JSON Materialization Tool

**File**: `src/lib/server/retrieval/json-tools.ts` (NEW, ~100 lines)

```typescript
/**
 * Bounded tools for large JSON processing.
 * Prevents Gemma4 from loading 100MB files into memory.
 */
export async function materializeJsonToNdjson(
  sourceFile: string,
  query: string, // jq query
  outputFile: string,
  maxRowsPerBatch: number = 1000
): Promise<void> {
  // 1. Stream sourceFile line-by-line
  // 2. Apply jq query to each line
  // 3. Emit NDJSON to outputFile (batch writes)
  // 4. Never loads full source into memory
  
  // Example: graphify.json (100MB)
  //   → materializeJsonToNdjson('graphify.json', '.nodes[]', 'nodes.ndjson')
  //   → outputs 1000-line batches (fast, bounded)
}

export async function sampleJsonLines(
  sourceFile: string,
  sampleSize: number = 100,
  seed?: number
): Promise<string[]> {
  // Reservoir sampling: read file once, keep random sample
  // Memory: O(sampleSize), not O(fileSize)
}

export async function validateJsonSchema(
  sourceFile: string,
  schema: ZodSchema,
  maxRowsToCheck: number = 100
): Promise<ValidationResult> {
  // Stream first N rows, validate against Zod
  // Fast feedback for schema mismatches
}
```

**Tool contract** (Gemma4/OpenCode):
```typescript
json.materialize_ndjson(sourceFile, query, outputFile)
json.sample_jq(sourceFile, query, maxSamples)
json.validate_schema(sourceFile, schemaName, maxRows)
```

**Why NEXT**: Graphify outputs are currently <100MB; this tool scales to GB without changes.

---

### Level 2 Deployment Checklist

- [ ] `packet-msgpack.ts` compiles, tests pass
- [ ] Redis packet cache uses MessagePack (drop-in replacement for JSON)
- [ ] `retrieval.proto` generated (Go + Node.js bindings)
- [ ] Proto service registered in MCP tool registry
- [ ] `json-tools.ts` wired into bounded OpenCode tools
- [ ] Subagent RPC calls use MessagePack payloads
- [ ] Documentation: protobuf schema versioning policy
- [ ] Backward compatibility: JSON fallback if proto unavailable

---

## Level 3: GPU-Assisted JSON (Weeks 5+, LATER)

**Scale**: ONLY when CPU streaming becomes the bottleneck  
**Tools**: GpJSON (CUDA JSONPath), TurboVec (GPU vector indexing), LibTorch (AE compression)  
**Activation criterion**: Graphify JSON > 10GB OR retrieval latency p95 > 1000ms due to JSON parsing

### What NOT to Build Yet

❌ **GpJSON / CUDA JSONPath**
- Use when: Scanning 10GB+ NDJSON files for structural patterns
- Cost: High schema friction, CUDA 12.1 dependency
- Now: CPU jq is sufficient (<1s for 1GB JSON)

❌ **GPU Vector Indexing (cuVS)**
- Use when: Qdrant ingestion becomes bottleneck (>10K vectors/sec)
- Cost: Extra service dependency, CUDA memory pressure
- Now: Qdrant CPU indexing is fast enough

❌ **GPU Tensor Compression (LibTorch AE)**
- Use when: Manifold4 inference becomes the bottleneck
- Cost: GPU memory (3060 Ti only has 8GB total)
- Now: CPU inference on 64-dim latents is negligible

### Level 3 Placeholder (Do NOT implement)

```typescript
/**
 * GPU-ASSISTED JSON — RESERVED FOR FUTURE
 * 
 * Do not activate until:
 * 1. Graphify.json > 10GB (currently 100MB)
 * 2. CPU jq latency p95 > 1000ms (currently <5ms)
 * 3. Qdrant ingestion > 100K vectors/sec (currently <10K/sec)
 * 4. Gemma4 planner approval (not auto-scaling)
 * 
 * When activated:
 * - GpJSON: CUDA JSONPath bytecode compilation
 * - TurboVec: cuVS index on Qdrant payloads
 * - LibTorch: AE 768→64 on GPU (reserved VRAM: 2GB max)
 * 
 * DO NOT touch this code path yet.
 */
export async function gpuJsonPathScan(
  sourceFile: string,
  jsonpathQuery: string
): Promise<void> {
  throw new Error('GPU JSON deferred until scale demands it');
}
```

---

## Tool Ladder (Execution Order)

```
User Query
  ↓
[1] search.rg              ← Find files by name pattern (CPU)
  ↓
[2] code.ast_grep          ← Structural code search (CPU)
  ↓
[3] json.jq                ← Query JSON arrays (CPU streaming)
  ↓
[4] json.materialize_ndjson ← Bounded JSON→NDJSON (CPU Level 2)
  ↓
[5] packet.encode_msgpack  ← Compact serialization (CPU Level 2)
  ↓
[6] state.postgres_lookup  ← Query atlas_packets (Postgres)
  ↓
[7] vector.qdrant_search   ← Semantic vector search (Qdrant GPU)
  ↓
[8] graph.neo4j_expand     ← Relationship traversal (Neo4j)
  ↓
[9] agent.langgraph_step   ← Multi-step reasoning (Gemma4 LLM)
  ↓
[10] validate.run_command  ← Safety gate (regex check)
  ↓
Response (MessagePack if RPC, JSON if HTTP)
```

**GPU tools (Level 3) would insert AFTER step 5, BEFORE step 6 — only if CPU becomes bottleneck.**

---

## Implementation Timeline

### Week 1 (NOW): Level 1 Phase 4B
- [x] Phase 4A delivery (completed in parallel session)
- [ ] Concept extraction tool
- [ ] Neo4j graph signal
- [ ] 20-query benchmark
- [ ] Gate: NDCG@10 >= 0.70

### Week 2: Level 1 Phase 4C (SOM + Hybrid Index)
- [ ] SOM topology integration into RRF
- [ ] Hybrid index: skip Qdrant if BM25 > 0.8
- [ ] Production safeguards (circuit breaker per signal)
- [ ] Langfuse telemetry (RRF breakdown per query)
- [ ] Gate: Latency p95 < 250ms, error rate < 0.5%

### Week 3: Level 2 MessagePack + Protobuf
- [ ] MessagePack encoding for packets
- [ ] Protobuf service contract
- [ ] Bounded JSON tools (materialize, sample, validate)
- [ ] Redis cache upgrade (JSON → MessagePack)
- [ ] Gate: Subagent RPC calls use proto serialization

### Week 4+: Level 2 Production Hardening
- [ ] Backward compatibility layer (JSON fallback)
- [ ] Subagent contract versioning
- [ ] Load testing: 100+ concurrent RPC calls
- [ ] Gate: Zero data loss on serialization mismatch

### Week 5+ (DEFERRED): Level 3 GPU Tools
- **Do NOT implement unless**:
  - Graphify.json > 10GB (currently 100MB)
  - CPU jq p95 > 1000ms (currently <5ms)
  - Gemma4 planner explicitly requests GPU JSON
  - Architecture review confirms scale trigger met

---

## Decision Tree: When to Activate Each Level

```
Current Scale: 100MB JSON, 239 packets, 1,134 traces, 20qps

Is Graphify > 10GB?           → YES: Activate Level 3 GPU JSON
                              → NO: Stay on Level 1

Is latency p95 > 1000ms?      → YES: Profile; likely JSON parsing → try Level 2
                              → NO: Stay on current level

Are subagents calling?        → YES: Activate Level 2 MessagePack/Proto
                              → NO: Level 1 sufficient

Is Qdrant ingestion > 100K/s? → YES: Consider Level 3 cuVS
                              → NO: Level 1 Qdrant fine

Is Gemma4 memory-constrained? → YES: Check Level 3 LibTorch AE
                              → NO: CPU inference acceptable
```

---

## What NOT to Do

❌ **Don't build FlatBuffers yet**  
- Zero-copy benefits only matter at 10GB+ scale
- Schema friction costs more than serialization savings now
- Defer to Year 2 if needed

❌ **Don't add GPU JSON now**  
- jq is sufficient for 100MB JSON (handles in <5ms)
- Waiting for 10GB trigger is the right call
- Early GPU adoption would idle on 100MB data

❌ **Don't over-engineer Proto**  
- Start with simple message format
- Versioning can be added when subagents multiply
- No need for complex evolution policies yet

❌ **Don't distribute Level 2 before Level 1 validates**  
- NDCG@10 >= 0.70 is the gate
- MessagePack only goes out once RRF metrics confirm value
- Premature optimization kills momentum

---

## Success Metrics per Level

### Level 1 Success
- NDCG@10 >= 0.70 on 20-query benchmark
- Latency p95 < 250ms (including embedding)
- Error rate < 0.5% on `/api/search/rrf`
- Zero memory OOMs on concept extraction

### Level 2 Success
- MessagePack payload 40–60% smaller than JSON
- Subagent RPC latency < 100ms (network included)
- Proto schema versioned without code changes
- Backward compatibility: old clients read new proto

### Level 3 Success (IF activated)
- GPU JSON latency < 500ms for 10GB files
- Zero memory OOM on GPU even at 8GB limit
- cuVS ingestion > 100K vectors/sec
- LibTorch AE inference < 1ms per vector

---

## References

**Phase 4A delivery**: `memory/phase-4a-implementation-delivery.md`  
**Architecture reference**: `CLAUDE.md` (streaming tools section)  
**Tool contracts**: `src/lib/server/ai/bounded-tool-gateway.ts`  
**Current scale metrics**: Phase 3I–4A checkpoint (100MB, 239 packets, 20qps)
