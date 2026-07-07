# Production Architecture Refined: Clean Layer Separation

**Date**: July 7, 2026  
**Status**: Refactored based on production feedback  
**Principle**: Each layer has one responsibility. No component reaches across layers.

---

## Layer Boundaries (Corrected)

### Layer 0: LangGraph (Workflow Orchestration Only)

**Responsibility**: Manage execution state and branching logic  
**Owns**: Workflow state, resumption, checkpoints, human approval  
**Does NOT own**: Embeddings, ANN, indexes, retrieval logic

**DispatcherState** (canonical shape):
```typescript
interface DispatcherState {
  traceId: string              // ULID for telemetry correlation
  query: string                // User query text
  
  // Workflow state
  ontologyNode: string         // Classified node type
  hmmState: 'UNKNOWN' | 'RECOVERABLE' | 'CANONICAL' | 'QUARANTINE'
  bitmapScore: number          // Current bitmap gate confidence [0, 1]
  
  // Retrieval window (for pagination/resumption)
  retrievalWindow: {
    offset: number
    limit: number
    appliedFilters: string[]
  }
  
  // Retrieved candidates (owned by LangGraph, populated by Go Retrieval)
  retrievalCandidates: Candidate[]
  
  // Telemetry (cross-layer observability)
  telemetry: TelemetryState
  
  // RabbitMQ work queue
  pendingJobs: RabbitJob[]
  completedJobs: RabbitJob[]
}
```

**LangGraph does NOT do**:
- ❌ Call Qdrant directly
- ❌ Walk Neo4j
- ❌ Compute embeddings
- ❌ Run HMM (only reads HMM advice)
- ❌ Make routing decisions (only reads dispatcher output)

**LangGraph DOES do**:
- ✅ Call `Go Retrieval` via `search()` HTTP interface
- ✅ Read bitmap gate from Valkey (current state authority)
- ✅ Queue RabbitMQ jobs (async work)
- ✅ Route to Gemma4 for explanation
- ✅ Persist state checkpoints

---

### Layer 1: Go Retrieval Sidecar (Search Logic Only)

**Responsibility**: Execute retrieval pipeline  
**Owns**: Embeddings, ANN, graph traversal, RRF fusion  
**Does NOT own**: Workflow state, HMM state, tool selection

**SearchRequest** (contract):
```typescript
interface SearchRequest {
  traceId: string              // Correlate with LangGraph
  query: string                // User query text
  embedding: Float32Array      // Pre-computed 768-d vector
  
  // Classification (from ontology layer)
  ontologyNode: string         // e.g., "implementation" | "documentation"
  featureId?: string           // Optional domain hint
  
  // Filtering constraints
  allowedStates: string[]      // HMM state filter: ["CANONICAL", "RECOVERABLE"]
  bitmapMin: number            // Minimum bitmap confidence [0, 1]
  communityId?: number         // Optional community filter
  pageRankMin?: number         // Optional authority threshold
  
  // Traversal parameters
  topK: number                 // Default 10
  graphDepth: number           // Default 1 (1-hop neighbors)
  window: {
    offset: number             // For pagination
    limit: number              // Default 100
  }
  
  // Output control
  rerank: boolean              // Apply semantic reranking? default true
}

interface SearchResponse {
  candidates: Candidate[]      // Top-K results
  
  metadata: {
    query_hash: string
    total_candidates: number
    retrieved: number
    stages_completed: string[]
  }
  
  scores: {
    qdrant_dense: number[]
    qdrant_keywords: number[]
    neo4j_graph: number[]
    rrf_fused: number[]
  }
  
  ontology: OntologyMeta[]
  graph: GraphEdge[]
  manifold: ManifoldCoords[]    // 4D coordinate system (see Layer 5)
  hmm: HmmObservation[]         // For telemetry only
  
  telemetry: {
    qdrant_ms: number
    neo4j_ms: number
    rrf_ms: number
    total_ms: number
  }
  
  traceId: string              // Echo back for correlation
}

interface Candidate {
  packet_key: string
  feature_id: string
  similarity: number           // Normalized [0, 1]
  confidence: number           // Normalized [0, 1]
  source: string              // "qdrant_dense" | "neo4j" | "rrf"
  hmm_state: string           // "CANONICAL" | "RECOVERABLE" | ...
  bitmap_score: number        // [0, 1]
}
```

**Go Retrieval Pipeline** (inside Go, hidden from LangGraph):
```
Query + Embedding
  ↓
Bitmap Gate Check (Valkey) [current state authority]
  ↓
Ontology Classification (Postgres)
  ↓
Named Vector Search (Qdrant)
  ├─ content (768-d semantic)
  ├─ summary (768-d)
  ├─ keywords (tfidf)
  └─ latent64 (routing only, NOT reranking)
  ↓
Top-20 Dense Candidates
  ↓
Graph Expansion (Neo4j, 1-hop)
  ├─ Structural: CALLS, IMPORTS, USES, TESTED_BY
  └─ Semantic: SIMILAR_TO (Phase 3b.1)
  ↓
Truth Join (Postgres → canonical packets)
  ├─ Verify identity
  ├─ Verify state (HMM: CANONICAL/RECOVERABLE/QUARANTINE)
  └─ Add pagerank, community, freshness
  ↓
RRF Fusion (6 signals, all normalized [0, 1])
  ├─ 0.30 × qdrant_dense
  ├─ 0.20 × qdrant_keywords
  ├─ 0.20 × neo4j_graph
  ├─ 0.15 × postgres_authority
  ├─ 0.10 × ontology_confidence
  └─ 0.05 × freshness_boost
  ↓
Semantic Reranking (384/768-d cosine, if enabled)
  ↓
Top-K Candidates [returned to LangGraph]
```

**Go Retrieval does NOT do**:
- ❌ Choose which tools to call (LangGraph routes work)
- ❌ Make HMM state predictions (HMM is read-only advisory)
- ❌ Persist workflow state
- ❌ Call Gemma4 for explanations

**Go Retrieval DOES do**:
- ✅ Embed queries (use pre-computed if passed in)
- ✅ Search Qdrant ANN
- ✅ Walk Neo4j graphs
- ✅ Join Postgres canonical truth
- ✅ Normalize all scores to [0, 1]
- ✅ Fuse signals via RRF
- ✅ Return complete SearchResponse

---

### Layer 2: HMM State Machine (Lifecycle Prediction, Read-Only)

**Responsibility**: Predict packet lifecycle state  
**Owns**: State transitions, observation weights  
**Does NOT own**: Tool selection, routing decisions, tool calling

**Hidden States** (4 states only):
```
UNKNOWN → RECOVERABLE → CANONICAL → QUARANTINE
  ↓           ↓            ↓
(seed)      STALE        STALE
             ↓             ↓
           REPAIR       REPAIR
```

**Observed Variables** (10 signals):
```
bitmap_score         [0, 1]  // Current bitmap gate score
ontology_confidence  [0, 1]  // Keyword overlap confidence
qdrant_exists        [0, 1]  // Vector in Qdrant? (binary → 0 or 1)
neo4j_exists         [0, 1]  // Node in Neo4j? (binary → 0 or 1)
telemetry_score      [0, 1]  // Tool execution success rate
pagerank             [0, 1]  // Authority score
community_id_match   [0, 1]  // Community consistency
freshness            [0, 1]  // Time-decay freshness [0, 1]
feature_confidence   [0, 1]  // Feature extraction confidence
reconstruction_error [0, 1]  // Autoencoder error (1 - error)
```

**Transition Rules** (deterministic):
```
UNKNOWN:
  → CANONICAL if: qdrant_exists=1 AND neo4j_exists=1 AND bitmap=0.9+
  → RECOVERABLE if: bitmap=0.7+ OR telemetry=0.8+
  → QUARANTINE if: qdrant_exists=0 AND neo4j_exists=0

RECOVERABLE:
  → CANONICAL if: pagerank=0.7+ AND community_match=1 AND freshness=0.8+
  → STALE if: freshness < 0.5 (30+ days old)
  → REPAIR if: reconstruction_error > 0.15

CANONICAL:
  → STALE if: freshness < 0.5
  → REPAIR if: reconstruction_error > 0.15

QUARANTINE:
  (absorbing state)
```

**Usage** (LangGraph reads advice only):
```typescript
// LangGraph reads HMM advisory, doesn't invoke it
const hmmAdvice = hmmModel.predict(observations);
// hmmAdvice.state: "CANONICAL" | "RECOVERABLE" | ...
// hmmAdvice.confidence: [0, 1]

// LangGraph uses advice to modify routing confidence
dispatcher_confidence *= hmmAdvice.confidence;

// LangGraph does NOT use HMM to call tools
// HMM only predicts lifecycle, not actions
```

**HMM does NOT do**:
- ❌ Call tools
- ❌ Make routing decisions
- ❌ Choose reranking strategies
- ❌ Filter candidates

**HMM DOES do**:
- ✅ Predict next state
- ✅ Assign confidence to prediction
- ✅ Return observation likelihood

---

### Layer 3: RabbitMQ Work Queue (Async Job Scheduling)

**Responsibility**: Schedule and track async work  
**Owns**: Job queues, retry logic, completion tracking  
**Does NOT own**: Job logic (workers own that)

**Queue Types**:
```
embed_packet          → Compute 768-d embedding
extract_ontology      → Extract keywords + AST features
generate_latent64     → Train autoencoder (if Path A)
sync_neo4j            → Persist structural edges
sync_qdrant           → Update named-vector payloads
refresh_bitmap        → Invalidate Valkey keys
replay_benchmark      → Revalidate correlation gates
```

**Job Message** (canonical shape):
```typescript
interface RabbitJob {
  jobId: string                // ULID
  traceId: string              // Correlate to DispatcherState
  queue: string                // Queue name
  action: string               // Job type
  
  payload: {
    packet_key?: string
    feature_id?: string
    // action-specific fields
  }
  
  // Lifecycle
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retry'
  retries: number
  maxRetries: number
  
  // Telemetry
  startedAt?: ISO8601
  completedAt?: ISO8601
  durationMs?: number
  error?: string
}
```

**Worker Pattern** (for each queue):
```
1. Read job from queue
2. Execute action (job-specific logic)
3. Emit telemetry (tool name, duration, result)
4. Update LangGraph state (via traceId)
5. Mark job completed
```

**RabbitMQ does NOT do**:
- ❌ Make retrieval calls
- ❌ Run HMM predictions
- ❌ Call Gemma4
- ❌ Return results to user

**RabbitMQ DOES do**:
- ✅ Queue work
- ✅ Track job lifecycle
- ✅ Retry failed jobs
- ✅ Emit completion events

---

### Layer 4: Engram Memory Bridge (Query-Result Caching, BM25 Sanitized)

**Responsibility**: Cache query results, not tool outputs  
**Owns**: Query-result pairs, sanitized summaries, embedded queries  
**Does NOT own**: Entire tool responses, raw JSON blobs

**Engram Entry** (minimal):
```typescript
interface EngamEntry {
  queryHash: string            // SHA256(normalized query)
  query: string                // Original query (for display)
  
  // Retrieval metadata
  ontologyNode: string         // Query classification
  hmmState: string             // Dominant state of results
  confidence: number           // [0, 1] BM25 confidence
  
  // Result summary (NOT full tool output)
  topK: Candidate[]            // Top-K packet_keys only
  
  // Ontology tags (extracted, not stored raw)
  ontologyTags: string[]
  
  // Embedding (for future semantic search on results)
  queryEmbedding: Float32Array // 768-d
  
  // Temporal
  createdAt: ISO8601
  lastAccessed: ISO8601
  accessCount: number
  
  // Status
  stale: boolean               // Invalidated?
  version: number              // For schema changes
}
```

**What Engram does NOT store**:
- ❌ Full Qdrant responses
- ❌ Full Neo4j traversal results
- ❌ Raw tool JSON blobs
- ❌ Thousands of embedding numbers
- ❌ Entire tool outputs

**What Engram DOES store**:
- ✅ Query hash → top-K results
- ✅ Sanitized BM25 summary
- ✅ Ontology tags (keywords only)
- ✅ Query embedding (for meta-search)
- ✅ Staleness flag (for invalidation)

**Usage** (Layer 1 calls Engram for cache check):
```typescript
// Go Retrieval checks cache BEFORE expensive search
const cached = engram.lookup(queryHash);
if (cached && !cached.stale) {
  return cached.topK;  // Immediate response
}

// Cache miss → execute full pipeline
const results = executeRetrievalPipeline(query);
engram.store(queryHash, results);  // BM25 sanitization happens here
```

---

### Layer 5: 4D Manifold (Independent Coordinate Systems)

**Responsibility**: Model packets across four independent axes  
**Owns**: Coordinate computation, axis-specific indexing  
**Does NOT own**: Retrieval logic, tool selection

**Four Axes** (all normalized [0, 1], independent):
```
Semantic Axis:
  - Embedding similarity (768-d cosine)
  - Keyword overlap
  - Concept proximity (ontology edges)

Structural Axis:
  - Graph distance (Neo4j hops)
  - Dependency type (CALLS, IMPORTS, USES, TESTED_BY)
  - Module hierarchy

Runtime Axis:
  - Execution frequency (pagerank)
  - Community clustering (modularity)
  - Test coverage

Temporal Axis:
  - Freshness (days since update)
  - Activity recency
  - Stability (edit frequency)
```

**Packet in 4D Space**:
```typescript
interface Packet4D {
  packet_key: string
  
  semantic: {
    similarity: number         // [0, 1]
    keyword_overlap: number    // [0, 1]
    concept_proximity: number  // [0, 1]
  }
  
  structural: {
    graph_distance: number     // [0, 1] (1 / (1 + hops))
    dependency_strength: number// [0, 1]
    hierarchy_depth: number    // [0, 1] (normalized)
  }
  
  runtime: {
    authority: number          // [0, 1] pagerank
    community: number          // [0, 1] modularity
    coverage: number           // [0, 1] test coverage
  }
  
  temporal: {
    freshness: number          // [0, 1] time-decay
    recency: number            // [0, 1] last update
    stability: number          // [0, 1] (inverse edit freq)
  }
}
```

**Traversal** (move through coordinate system):
```typescript
// Start at query embedding (semantic axis)
// Expand via graph (structural axis)
// Weight by authority (runtime axis)
// Discount by staleness (temporal axis)

// Each axis independent → can traverse any dimension
// RRF fusion blends all four axes
```

**4D Manifold does NOT do**:
- ❌ Make retrieval decisions
- ❌ Select ranking strategy
- ❌ Call external services

**4D Manifold DOES do**:
- ✅ Compute coordinate per packet
- ✅ Index independently per axis
- ✅ Support multi-axis traversal

---

### Layer 6: Named Vectors (Routing, Not Semantic Truth)

**Responsibility**: Fast routing via compressed vectors  
**Owns**: Multiple vector spaces, dimensional reduction  
**Does NOT own**: Final ranking, semantic truth

**Named Vector Spaces** (Qdrant):
```
content (768-d):
  - Semantic truth for reranking
  - Embeds full code content
  - Used for final top-K ordering

summary (768-d):
  - Semantic truth for summary-based search
  - Embeds generated summaries
  - Used for documentation queries

keywords (sparse/tfidf):
  - Lexical routing
  - Term frequency per packet
  - Used for exact-match queries

graph (entity vector, 256-d):
  - Structural routing
  - Entity overlap + relationship types
  - Used for dependency-based search

latent64 (64-d):
  - ROUTING ONLY, NOT TRUTH
  - Fast prefilter (1K from 40K candidates)
  - Gated on correlation benchmark >0.85
  - Reranked by content (768-d)
```

**Retrieval Uses All Vectors**:
```
Query Embedding (768-d)
  ↓
Search 4 named vectors in parallel:
  ├─ content: Dense semantic
  ├─ summary: Dense summary-based
  ├─ keywords: Sparse lexical
  └─ latent64: Fast routing (if trained)
  ↓
Merge results (RRF fusion)
  ↓
Truth join + reranking (using content 768-d)
  ↓
Top-K candidates
```

**Latent64 Special Case**:
- Used ONLY for prefiltering (1K from 40K → N fast, O(1) instead of O(log N))
- NEVER used for final ranking
- Gated on correlation benchmark validation
- Reranked by 768-d content vectors before output

**Named Vectors do NOT do**:
- ❌ Make ranking decisions
- ❌ Replace semantic vectors
- ❌ Filter results independently

**Named Vectors DOES do**:
- ✅ Provide parallel search spaces
- ✅ Enable fast routing
- ✅ Support ontology-specific queries

---

### Layer 7: Go Retrieval + Dispatcher Integration

**Dispatcher Loop** (in LangGraph):
```typescript
async function dispatcherNode(state: DispatcherState) {
  // 1. Read current state (bitmap gate = authority)
  const bitmapState = await valkey.get(`bitfrost:state:${packet_key}`);
  state.bitmapScore = bitmapState.confidence;
  
  // 2. Query HMM (advisory only, read-only)
  const hmmAdvice = hmmModel.predict(telemetryObservations);
  let confidence = state.bitmapScore * hmmAdvice.confidence;
  
  // 3. Rule engine (hard constraints)
  if (ontologyNode === 'implementation' && confidence < 0.7) {
    // Reject uncertain implementation queries
    return { route: 'worker_dag' };
  }
  
  // 4. Route decision
  if (confidence >= 0.85) {
    // Call Go Retrieval
    const searchRequest = buildSearchRequest(state);
    const response = await goRetrieval.search(searchRequest);
    state.retrievalCandidates = response.candidates;
    return { route: 'gemma4' };
  } else {
    // Queue async work
    state.pendingJobs.push(createRecoveryJob(state));
    return { route: 'worker_dag' };
  }
}
```

---

## Data Flow: Query to Explanation

```
User Query
  │
  ├─ LangGraph receives query
  │
  ├─ Embed query (768-d via embeddinggemma)
  │
  ├─ Call Go Retrieval.search()
  │  │
  │  ├─ Bitmap gate check (Valkey)
  │  ├─ Ontology classification (Postgres)
  │  ├─ Named vector search (Qdrant)
  │  ├─ Graph expansion (Neo4j)
  │  ├─ Truth join (Postgres)
  │  ├─ RRF fusion (6 normalized signals)
  │  └─ Return top-K candidates
  │
  ├─ Dispatcher reads HMM advice (read-only)
  │
  ├─ If confidence >= 0.85:
  │  │
  │  ├─ Route to Gemma4 for explanation
  │  │
  │  └─ Return explanation + evidence
  │
  └─ If confidence < 0.85:
      │
      ├─ Queue RabbitMQ recovery job
      │
      └─ Return "searching" state (async)

RabbitMQ Worker DAG (background):
  ├─ Retry embedding
  ├─ Expand graph search
  ├─ Manual packet reconstruction
  └─ Update bitmap gate → next query learns
```

---

## Transport Phasing (Windows 10 + WSL2)

### Phase A (Now)
- SvelteKit ↔ HTTP JSON ↔ Go Retrieval
- Simple, reliable, debuggable
- Latency: ~100ms p99

### Phase B (After 4 weeks)
- HTTP + SSE for progress streaming
- Longer-running searches can show partial results
- Latency: same, UX improves

### Phase C (Month 3+, if profiling shows bottleneck)
- gRPC for low-latency RPC
- Only after measurable profiling proves TCP overhead
- Benchmark: measure before adopting

### Phase D (Month 6+, if needed)
- HTTP/3 + QUIC
- Ultra-high-frequency query patterns only
- Current bottlenecks: embeddings, ANN, reranking (NOT TCP)

---

## Canonical Telemetry Table (Agent State Log)

```sql
CREATE TABLE agent_state_log (
  id BIGSERIAL PRIMARY KEY,
  trace_id VARCHAR(26) NOT NULL,      -- ULID, correlate all layers
  
  packet_key VARCHAR(255),
  worker VARCHAR(50),                 -- "dispatcher" | "go_retrieval" | "gemma4" | "rabbit"
  action VARCHAR(100),                -- "search" | "embed" | "explain" | "recover"
  
  hmm_state VARCHAR(50),              -- "UNKNOWN" | "CANONICAL" | ...
  bitmap_score REAL,                  -- [0, 1]
  confidence REAL,                    -- [0, 1] dispatcher confidence
  
  manifold JSONB,                     -- 4D coordinates (if applicable)
  
  telemetry JSONB,                    -- Tool-specific metrics
  -- {
  --   "qdrant_ms": 45,
  --   "neo4j_ms": 12,
  --   "rrf_ms": 8,
  --   "total_ms": 65
  -- }
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_trace_id (trace_id),
  INDEX idx_packet_key (packet_key),
  INDEX idx_created_at (created_at DESC)
);

-- All telemetry queries reference this table
-- Everything else (Qdrant, Neo4j, Valkey) references this via trace_id
```

---

## Correlation Benchmark (Gate 1: Evidence-Driven Deployment)

**Your corrected execution is exactly right**:

1. Build benchmark harness ✅
2. Run on simple averaging (768→64)
3. Measure gates: Spearman, Recall, NDCG, latency
4. Gate verdict:
   - ✅ PASS: Deploy latent64 as prefilter
   - ❌ FAIL: Path A (train autoencoder) or Path B (skip latent64)

**Do NOT deploy latent64 without gate validation**. Simple averaging fails (Spearman 0.595). This is why evidence-driven gates exist.

---

## Production Gates (Refined)

### Gate 1: Correlation Benchmark ✅ **COMPLETE**
- Latent64 ranking preservation validated
- Result: Simple averaging insufficient
- Decision: Path A (autoencoder) or Path B (skip)

### Gate 2: Confidence Normalization ⏳ **READY**
- All signals [0, 1] scale
- Dispatcher uses normalized scores
- RRF applies without rescaling

### Gate 3: Symbol Resolver + Structural Edges ⏳ **READY**
- 95%+ symbol resolution
- 10K+ structural edges in Neo4j
- Hybrid graph (semantic + structural)

### Gate 4: Go Retrieval API Contract ⏳ **READY**
- HTTP JSON interface documented
- Response shape Zod-validated
- Latency <100ms p99

### Gate 5: Dispatcher + Bitmap Gate ⏳ **READY**
- Bitmap gate reads/writes <5ms
- HMM advisory wired (read-only)
- Routing confidence blended

---

## Key Principles (Refined)

1. **LangGraph orchestrates, doesn't retrieve**
   - Owns workflow state only
   - Calls Go Retrieval via HTTP
   - Reads HMM advice (doesn't invoke it)

2. **Go Retrieval owns search, not decisions**
   - Executes full pipeline (Qdrant → Neo4j → RRF)
   - Returns SearchResponse
   - Doesn't know about HMM or tools

3. **HMM predicts state, not actions**
   - Reads observations (bitmap, telemetry, pagerank)
   - Outputs state prediction + confidence
   - Dispatcher reads this as advisory only

4. **RabbitMQ schedules work, not results**
   - Queues jobs
   - Workers execute
   - Updates LangGraph state via traceId

5. **Latent64 is routing, not truth**
   - Fast prefilter (1K from 40K)
   - Gated on correlation benchmark >0.85
   - Reranked by 768-d content

6. **Each layer has one responsibility**
   - LangGraph: workflow
   - Go: retrieval
   - HMM: state prediction
   - RabbitMQ: work queue
   - Engram: cache
   - 4D: coordinates
   - Named vectors: routing

---

## Summary

This refined architecture separates concerns cleanly:

- **LangGraph** manages workflow (checkpoints, branching, state)
- **Go Retrieval** executes search (Qdrant, Neo4j, RRF, truth join)
- **HMM** predicts lifecycle (read-only advisory)
- **RabbitMQ** schedules async work (queues, retries)
- **Engram** caches sanitized results (query-result pairs)
- **4D Manifold** models packets independently (four axes)
- **Named Vectors** enable multi-axis search (routing only)
- **Dispatcher** blends signals and routes (LangGraph node)
- **Gemma4** explains results (final stage, read-only input)

Each layer is testable, scalable, and independently verifiable. The correlation benchmark gates deployment on evidence, not assumptions.

---

**Status**: Architecture refined for production. Ready for Sessions 121-125 implementation.
