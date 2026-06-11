# Phase 3: GPU-Accelerated Graph-Aware Adaptive Architecture

**Integration of Taxonomy, Structural Indexing, Binary Serialization, Neo4j Contextual Trees, and Self-Learning Feedback Loops**

**Status**: Phase 3E.1 wired; Phase 3F-4B ready for activation  
**Scope**: GPU kernels + graph algorithms + learning loops across retrieval → concept → repair → planning

---

## The Complete Data Flow

```
Query (user intent)
  ↓
ACE Context Assembler (Phase 3D telemetry)
  ├─ Vector Search (Qdrant 768d)
  ├─ Lexical Search (trigram FTS)
  └─ Structural Search (AST/tokentree)
  ↓
Retrieval Telemetry (behavioral signal capture)
  ├─ strategy_distribution increment
  ├─ latency_ms, hit counts
  └─ cache_hit detection
  ↓
Concept Memory Update (Phase 3E.1 feedback loop)
  ├─ retrieval_count++
  ├─ last_retrieved_at = now()
  ├─ concept_temperature (0.50·recent + 0.30·quality + 0.20·fusion)
  └─ strategy_distribution[strategy]++ ← CAUSALITY PRESERVED
  ↓
Neo4j Graph Projection (contextual trees)
  ├─ Concept DISCOVERED_BY Strategy
  ├─ Task USED_CONCEPT Concept
  ├─ Concept SUPPORTED_BY Packet
  └─ Feature IMPLEMENTS Concept
  ↓
GDS Analysis (Louvain, PageRank, Betweenness)
  ├─ Community detection (concept clusters)
  ├─ Authority ranking (node importance)
  └─ Planning paths (task→concept→packet dependency chains)
  ↓
Agent Planning (Phase 3F+)
  ├─ Select concepts by Neo4j authority + temperature
  ├─ Route via retrieval strategy (fusion > vector_only)
  └─ Execute bounded repair scripts
  ↓
Agent Traces (Phase 3F)
  ├─ query + retrieval_strategy + selected_concepts
  ├─ tools_called + outcome + reward
  └─ Fire-and-forget non-blocking record
  ↓
QLoRA Dataset Export (Phase 3F)
  └─ Successful repairs (outcome='success', reward > 0.5)
  ↓
Gemma4 Planner Fine-Tuning (Phase 4A)
  └─ Learn: query → strategy → concepts → high_reward_outcomes
```

---

## Technical Stack Integration

### 1. GPU Structural Indexing (GpJSON Pattern)

**File Structure**: `simd-bridge/cpp/`

**Kernels**:
- `json_structural_index.cu` — Leveled bitmap construction (L0/L1 hierarchies)
- `json_path_query.cu` — JSONPath queries entirely on GPU (zero-copy)
- `tensor_layout.cu` — Compact tensor representation for VRAM efficiency

**How it applies to Parent Atlas**:

```typescript
// Phase 3E.1: concept_records JSONB updates
UPDATE concept_records
SET strategy_distribution = jsonb_set(
  coalesce(strategy_distribution, '{}'::jsonb),
  array['fusion'],  // JSONPath on CPU, but pattern mirrors GPU bitmap query
  (coalesce((strategy_distribution->'fusion')::integer, 0) + 1)::text::jsonb
);

// Future: GPU-accelerated JSONB indexing for Postgres
// GpJSON pattern: Parallel kernel processes strategy_distribution bitmap
// Leveled index:
//   L0: [1,0,0,0,0,1,0,1,0...] ← presence of strategies
//   L1: [0,1,1,0,0,0,1,0,1...] ← nesting depth markers
```

**Benefit**: Concept memory scales to millions of records with O(1) strategy_distribution lookups via GPU bitmap queries.

---

### 2. Binary Serialization & Message Passing

**Files**:
- `src/lib/server/encoding/binary-encoding.ts` — MessagePack, CBOR, Protobuf bindings
- `simd-bridge/cpp/msgpack_decoder.cc` — Zero-copy msgpack decoding

**Pattern**:

```typescript
// Concept Memory Serialization (compact, GPU-ready)
const conceptRecord = {
  concept_id: "authentication",
  strategy_distribution: { fusion: 842, vector_only: 131 },
  concept_temperature: 0.95,
  last_retrieved_at: 1718079600000
};

// Encode to binary (MessagePack)
const encoded = msgpack.encode(conceptRecord);
// ~40 bytes vs 200 bytes JSON

// Send to GPU tensor kernel (RTX memory-mapped)
const gpuBuffer = await GPU.allocate(encoded.length);
gpuBuffer.copyFrom(encoded);

// GPU kernel runs JSONPath queries on packed data
// Result: 100× faster concept ranking for planning
```

**Why**: GPU kernels work on binary, not JSON strings. Encoding → decoding → no intermediate parsing overhead.

---

### 3. Louvain Community Detection on Contextual Trees

**Neo4j Integration**:

```cypher
// Run Louvain algorithm on concept graph
CALL gds.louvain.write({
  nodeProjection: 'Concept',
  relationshipProjection: {
    DISCOVERED_BY: { type: 'DISCOVERED_BY', orientation: 'UNDIRECTED' },
    SUPPORTED_BY: { type: 'SUPPORTED_BY', orientation: 'UNDIRECTED' },
    COOCCURS_IN_TRACE: { type: 'COOCCURS_IN_TRACE', orientation: 'UNDIRECTED' }
  },
  writeProperty: 'community_id',
  communityProperty: 'concept_community'
});

// Result: Concepts grouped by semantic affinity
// Example: authentication, route_protection, error_handling → community_id=12
// Use for: "Which concept clusters solve auth problems?"
```

**Agent Planning Application**:
```typescript
// When selecting concepts for repair:
1. Query Louvain communities: concepts with community_id matching task context
2. Rank by temperature within community
3. Select top-3 by authority + temperature
4. Execute repair using unified concept cluster

// Example:
// Task: "fix missing auth guard"
// Community 12: [authentication, route_protection, error_handling]
// Authority ranking (GDS PageRank):
//   authentication (0.94) ← discovered via fusion 87%
//   route_protection (0.88)
//   error_handling (0.71)
// Select: authentication + route_protection → agent execution
```

---

### 4. PageRank Propagation for Concept Authority

**Algorithm**: GDS PageRank on Neo4j concept graph

**Graph Structure**:
```
Query → USED_STRATEGY → RetrievalStrategy
Query → SELECTED_CONCEPT → Concept
Concept ← DISCOVERED_BY ← RetrievalStrategy
Concept ← SUPPORTED_BY ← Packet
AgentTrace → USED_CONCEPT → Concept
AgentTrace → USED_STRATEGY → RetrievalStrategy
```

**PageRank Calculation**:
```
authority(concept_c) = 0.15 + 0.85 * Σ(authority(incoming) / out_degree)

Higher authority if:
- Frequently selected in successful traces (AgentTrace edges)
- Discovered via high-authority strategies (fusion)
- Supports high-authority packets
- Occurs in high-temp concepts (neighbor influence)
```

**Use Case**:
```typescript
// Phase 3F+: Planning prioritizes high-authority concepts
const topConcepts = await neo4j.query(`
  MATCH (c:Concept)
  WHERE c.pagerank_score > 0.5
  RETURN c.concept_id, c.pagerank_score, c.community_id
  ORDER BY c.pagerank_score DESC
  LIMIT 10
`);
// Result: "Which concepts drive successful repairs?"
```

---

### 5. Contextual Trees for Dependency Chains

**Neo4j Pattern**: Hierarchical path queries

```cypher
// Find all dependency paths from Task → Concept → Packet → Feature
MATCH path = (t:Task {task_id: 'fix-auth-bug'})
       -[:USED_CONCEPT]->(c:Concept)
       -[:SUPPORTED_BY]->(p:Packet)
       -[:CONTAINS]->(f:Feature)
WHERE c.concept_temperature > 0.5 AND p.community_id = 12
RETURN path, length(path) AS depth
ORDER BY depth DESC;

// Result tree:
// Task: fix-auth-bug
//   ├─ Concept: authentication (temp=0.94)
//   │   ├─ Packet: packet_auth_pattern
//   │   │   └─ Feature: isAuthenticated_check
//   │   └─ Packet: packet_sveltekit_guard
//   │       └─ Feature: guards_array_middleware
//   └─ Concept: error_handling (temp=0.71)
//       └─ Packet: packet_error_patterns
//           └─ Feature: error_boundary_component
```

**Planning Algorithm**:
```typescript
// Build contextual tree for planning
const tree = await buildContextualTree(taskId);
// tree has metadata:
// - depth: relevance proximity
// - temperature: behavioral importance
// - authority: graph centrality
// - strategy_distribution: discovery method confidence

// Select repair target: highest (depth + authority + temperature)
// Execute: traverse tree → collect packets → run repair script
```

---

### 6. NES/CHROM Packet Binary Encoding

**File Structure**: `.opencode/ndjson/`

**Format**:
```
NES = Native Encoded Semantic
  ├─ Binary header (4B: version + flags + compression)
  ├─ CBOR-encoded metadata (concept_id, temperature, strategy)
  └─ Zlib-compressed packet content

CHROM = Concept Hierarchical Retrieval Optimization Map
  └─ Bitmap index: which concepts appear in which packets
```

**Integration with Postgres+Qdrant**:
```typescript
// Cold storage: SeaweedFS (NES/CHROM binary format)
// Hot cache: Postgres JSONB
// Dense vectors: Qdrant 768d payloads

// Example: concept "authentication" retrieval
1. Qdrant ANN query → top-20 packets by similarity
2. Postgres payload filter: temperature > 0.5, strategy='fusion'
3. Neo4j authority boost: PageRank weight
4. SeaweedFS fetch: NES packet for full content

// Result: Ranked packet list for agent execution
```

---

### 7. RTX Tensor Analysis & 4D Manifold Search

**Architecture**: `simd-bridge/cpp/tensor_rt*.cu`

**4D Manifold Representation**:
```
[x, y, z, w] = [SOM_x, SOM_y, concept_temperature, fusion_rate]

- (x, y): SOM grid position (topology)
- z: Behavioral heat (0.0-1.0 temperature)
- w: Robustness metric (fusion % of retrievals)

Query embedding → Nearest neighbors in 4D space
  ├─ Topologically close (SOM proximity)
  ├─ Temporally hot (high temperature)
  └─ Robustly discovered (fusion > vector_only)

Result: Concepts that are relevant, active, and reliable
```

**GPU Implementation**:
```cuda
// RTX kernel: compute 4D distances in parallel
__global__ void manifold_distance_4d(
  float4* query_point,      // (SOM_x, SOM_y, temp, fusion%)
  float4* concept_points,   // all concepts
  float* distances,         // output
  int n_concepts
) {
  int idx = blockIdx.x * blockDim.x + threadIdx.x;
  if (idx < n_concepts) {
    float dx = concept_points[idx].x - query_point->x;
    float dy = concept_points[idx].y - query_point->y;
    float dz = concept_points[idx].z - query_point->z; // temp weight
    float dw = concept_points[idx].w - query_point->w; // fusion weight
    
    distances[idx] = sqrt(dx*dx + dy*dy + 0.3*dz*dz + 0.2*dw*dw);
  }
}
```

**Planning Application**:
```typescript
// Phase 3F: Select concepts near task context
const taskContext = {
  som_x: 45.2,      // from codebase SOM projection
  som_y: 12.8,
  task_temperature: 0.85,  // inferred from recent traces
  preferred_fusion_rate: 0.87
};

const nearConcepts = await gpu.manifoldSearch4d(
  taskContext,
  topK: 10,
  maxDistance: 2.5
);
// Result: Top 10 concepts matching task context in topology + behavior + robustness
```

---

### 8. Token Mapping & Kernel Streams

**Future Enhancement**: `later_token_mapping_needed`

**Pattern**:
```
Query tokens
  ↓
Embed via Ollama (768d)
  ↓
GPU kernel stream 1: Qdrant ANN
  GPU kernel stream 2: Neo4j GDS PageRank (async)
  GPU kernel stream 3: 4D manifold distance (async)
  ↓
Merge results (stream synchronization)
  ↓
Agent execution
```

**Benefit**: Overlap computation + network latency via CUDA streams.

---

## Phase Roadmap with Technical Integration

### ✅ DONE
- **3A**: Multi-lane retrieval (vector + lexical + structural)
- **3B**: Retrieval fusion (weighted combination)
- **3C**: Directory topology (SOM + clustering)
- **3D**: Retrieval telemetry (behavioral logging)
- **3E**: Concept memory foundation (lifecycle fields)
- **3E.1**: Concept telemetry integration (feedback loop + strategy_distribution)

### 🔨 ACTIVE
- **3F**: Agent trace distillation (decision provenance + reward)
  - Wire: task_id, query, retrieval_strategy, selected_concepts, outcome, reward
  - GDS integration: Task USED_CONCEPT Concept edges
  - Output: qlora_examples.jsonl for training

### 🔮 READY
- **3G**: Neo4j contextual tree expansion + Louvain communities
  - Nodes: Query, Strategy, Concept, Packet, Feature, Task, AgentTrace
  - Algorithms: PageRank (authority), Louvain (community), Betweenness (bottleneck)
  - Use: Planning path discovery, concept authority ranking

- **3H**: Qdrant payload enrichment (concept_ids, temperature, strategy, trace_count)
  - ANN + payload filter + Neo4j expansion + concept ranking
  - Pattern: Dense retrieval → planning topology → concept authority

- **4A**: Retrieval evaluation harness (benchmark strategy win rates)
  - Measure: Which strategies work best for which concept clusters?
  - Use: Adapt routing policy based on learned preferences

- **4B**: Autonomous repair evaluation (self-improving loop)
  - No human intervention; outcomes feed back into agent_traces
  - Close the learning loop: repair → trace → QLoRA → fine-tuning

### 📚 LATER
- **4C**: Token mapping kernel streams (overlap ANN + GDS + manifold search)
- **4D**: Cold storage archival (SeaweedFS NES/CHROM binary encoding)
- **4E**: Distributed multi-GPU orchestration (scaling to 100M+ packets)

---

## The Unified Data Model

| Layer | Storage | Technology | Purpose |
|-------|---------|-----------|---------|
| **L1: Signals** | Postgres (retrieval_telemetry) | Fire-and-forget telemetry | Behavioral evidence capture |
| **L2: Memory** | Postgres (concept_records) + JSONB | strategy_distribution + temperature | Concept lifecycle tracking |
| **L3: Topology** | Neo4j | Contextual trees + Louvain + PageRank | Planning path discovery + authority |
| **L4: Retrieval** | Qdrant (768d) + payloads | Dense ANN + concept metadata | Semantic search with context |
| **L5: Learning** | agent_traces + qlora_examples | Traces + outcomes + rewards | Training dataset for adaptation |
| **L6: Compute** | RTX GPU (4D manifold, GDS async) | CUDA kernels + GPU streams | Parallel ranking + planning |
| **L7: Archive** | SeaweedFS | NES/CHROM binary | Cold storage for inactive concepts |

---

## Strategic Significance

**Before Phase 3E.1**: Retrieval system (static index → static answers)

**After Phase 3E.1**: Learning infrastructure (observe what works → adapt behavior)

**After Phase 3F+**: Adaptive orchestration (Gemma4 learns planning, routing, scheduling)

**End goal**: Autonomous system that improves repair success by learning from every successful repair.

```
Cycle time: Query → Repair → Trace → QLoRA → Fine-tuning → Gemma4 Adaptation
Feedback latency: Hours to days (eventually real-time)
Learning signal: outcome (success/partial/failure) + reward (0.0-1.0)
Adaptation target: retrieval_strategy selection, concept prioritization, tool calling patterns
```

---

## References

- **GpJSON Paper**: https://arxiv.org/abs/2303.18064 (GPU-accelerated JSON queries)
- **Louvain Algorithm**: Blondel et al. (community detection)
- **Neo4j GDS**: https://neo4j.com/docs/graph-data-science/ (PageRank, Betweenness, etc.)
- **CUDA Streams**: https://docs.nvidia.com/cuda/cuda-c-programming-guide/ (async kernel execution)
- **MessagePack**: https://msgpack.org/ (binary serialization)
- **simdjson**: https://github.com/simdjson/simdjson (SIMD JSON parsing)

---

**Status**: ✅ Phase 3E.1 foundation complete. Phase 3F documentation ready. Ready for agent trace activation.

**Next Checkpoint**: >100 telemetry records → validate strategy_distribution variance → activate Phase 3F.
