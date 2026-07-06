# Unified Retrieval + HMM Policy Architecture

**Status**: Design-ready for Phase 111+  
**Goal**: Separate concerns — RRF ranks candidates, HMM chooses next tool  
**Scope**: 7-signal RRF + HMM state machine + go-retrieval gRPC service

---

## Architecture Overview

```
User Query
  ↓
Agent State (prior results, conversation, memory)
  ↓
go-retrieval gRPC service (orchestrator)
  ├─ Qdrant ANN (semantic)
  ├─ TurboVec prefilter (fast topology)
  ├─ Postgres/Neo4j (structural)
  ├─ BM25 (lexical)
  └─ ngram metadata (symbolic)
  ↓
RRF 7-way fusion (scores candidates 0.0–1.0)
  ├─ 0.30 × Qdrant cosine (384-dim)
  ├─ 0.20 × TurboVec ANN (64-dim prefilter)
  ├─ 0.20 × BM25 (trigram FTS)
  ├─ 0.15 × Neo4j graph (multi-hop edges)
  ├─ 0.10 × SOM topology (cluster match)
  ├─ 0.03 × ngram overlap (symbolic)
  └─ 0.02 × freshness (recency)
  ↓
Authority boost (small multiplier, not main signal)
  ├─ PageRank top-10 mean
  ├─ Community score
  └─ Tricubic 4D proximity
  ↓
HMM Observation (9 compact metrics)
  ├─ qdrantTopScore
  ├─ turbovecTopScore
  ├─ bm25TopScore
  ├─ pagerankTop10Mean
  ├─ ngramOverlap
  ├─ sourceRefCoverage
  ├─ topologyClusterCoverage
  ├─ communityCoverage
  └─ tricubic4dScore
  ↓
HMM Policy (hidden state → action)
  ├─ NeedsSearch → go_retrieval.search
  ├─ NeedsGraphExpand → neo4j.expandNeighborhood
  ├─ NeedsRerank → retrieval.rerank (BERT/SLM)
  ├─ NeedsBackfill → atlas.backfillFeatures
  ├─ NeedsSchemaValidate → envelope.validate
  └─ NeedsSynthesis → gemma4.synthesize
  ↓
LangGraph Workflow
  ├─ Execute recommended MCP tool
  ├─ Update agent state
  ├─ Possibly loop back to go-retrieval
  └─ Emit final answer
```

---

## Part 1: 7-Signal RRF (Candidate Ranking)

**Goal**: Blend 7 independent signals into single 0.0–1.0 score per candidate.

### Signal Definitions

```typescript
export interface RetrievalSignals {
  // Vector search
  qdrantCosine: number;        // 0.0–1.0, normalized cosine similarity
  turbovecAnnScore: number;    // 0.0–1.0, TurboVec prefilter confidence
  
  // Text search
  bm25Score: number;           // 0.0–1.0, normalized BM25 (trigram FTS)
  ngramOverlap: number;        // 0.0–1.0, overlap of query ngrams vs packet ngrams
  
  // Graph
  graphLinkCount: number;      // 0–N, how many edges touch this node
  pagerankScore: number;       // 0.0–10.0, Neo4j PageRank (normalized later)
  
  // Topology
  somClusterMatch: number;     // 0.0–1.0, do query + candidate share SOM cluster?
  communityMatch: number;      // 0.0–1.0, do they share Louvain community?
  tricubic4dScore: number;     // 0.0–1.0, manifold proximity (interpolated)
  
  // Recency
  freshnessScore: number;      // 0.0–1.0, log-scaled age in days
}

export interface RRFBlend {
  qdrant: number;              // Weight 0.30
  turbovec: number;            // Weight 0.20
  bm25: number;                // Weight 0.20
  graphLinkCount: number;      // Weight 0.15
  somCluster: number;          // Weight 0.10
  ngram: number;               // Weight 0.03
  freshness: number;           // Weight 0.02
}

// Sum of weights = 1.0 ✅
```

### RRF Computation (TypeScript)

```typescript
function computeRRFBlend(signals: RetrievalSignals): number {
  // Normalize PageRank (0.0–10.0 → 0.0–1.0)
  const pagerankNorm = Math.min(signals.pagerankScore / 10.0, 1.0);
  
  // Normalize graph link count (use log scale, cap at 100 edges)
  const graphNorm = Math.min(Math.log1p(signals.graphLinkCount) / Math.log1p(100), 1.0);
  
  // Blend 7 signals
  const blend =
    0.30 * signals.qdrantCosine +
    0.20 * signals.turbovecAnnScore +
    0.20 * signals.bm25Score +
    0.15 * graphNorm +
    0.10 * signals.somClusterMatch +
    0.03 * signals.ngramOverlap +
    0.02 * signals.freshnessScore;
  
  // Authority boost (small multiplier, does NOT replace main score)
  const authorityBoost =
    0.05 * pagerankNorm +
    0.03 * signals.communityMatch +
    0.04 * signals.tricubic4dScore;
  
  // Final score: RRF + authority (separate terms, not competing)
  return Math.min(blend + authorityBoost, 1.0);
}
```

### Why This Signal Set

| Signal | Why | Alternative Rejected |
|--------|-----|----------------------|
| **Qdrant cosine (30%)** | Semantic matching, the primary retrieval lever | — |
| **TurboVec ANN (20%)** | Fast local prefilter, candidate pool for reranking | Duplicate with Qdrant (both vector search) |
| **BM25 (20%)** | Lexical/term matching, catches exact phrase matches | No alternative; essential for keyword search |
| **Graph (15%)** | Structural relationships, multi-hop authority | Replaces single-edge cosine with graph context |
| **SOM cluster (10%)** | Topological proximity, manifold structure | Complements Qdrant (semantic) with topology |
| **ngram (3%)** | Cheap symbolic overlap (function names, imports) | Keeps signal small (not overweighting symbols) |
| **Freshness (2%)** | Recency boost (recent > stale) | Minimal weight (not a primary factor) |

**Don't add more signals.** 7 is the "Goldilocks" number:
- ✅ Covers: semantic, lexical, structural, topological, temporal
- ✅ Fast to compute (no ML inference)
- ✅ Debuggable (each signal visible)
- ✅ Resistant to overfitting (not overweighting any single dimension)
- ❌ More signals = noise, not signal
- ❌ Fewer signals = missing context

---

## Part 2: HMM Policy Layer (Tool Recommendation)

**Goal**: Given RRF scores + agent state, decide what MCP tool to call next.

### Hidden States

```typescript
export enum HMMHiddenState {
  NeedsSearch = 'NeedsSearch',                // No candidates yet
  NeedsGraphExpand = 'NeedsGraphExpand',      // Weak candidates, expand neighbors
  NeedsRerank = 'NeedsRerank',                // Many candidates, rerank with BERT
  NeedsBackfill = 'NeedsBackfill',            // Missing features, run extractors
  NeedsSchemaValidate = 'NeedsSchemaValidate', // Envelope integrity check
  NeedsSynthesis = 'NeedsSynthesis',          // Ready to generate answer
}
```

### HMM Observations

```typescript
export interface HMMObservation {
  // Top scores from RRF
  qdrantTopScore: number;           // 0.0–1.0, best Qdrant result
  turbovecTopScore: number;         // 0.0–1.0, best TurboVec result
  bm25TopScore: number;             // 0.0–1.0, best BM25 result
  
  // Authority signals
  pagerankTop10Mean: number;        // 0.0–10.0, average PageRank of top-10
  
  // Coverage metrics
  ngramOverlap: number;             // 0.0–1.0, how much query ngrams matched
  sourceRefCoverage: number;        // 0.0–1.0, % of source_refs in results
  topologyClusterCoverage: number;  // 0.0–1.0, % of SOM clusters covered
  communityCoverage: number;        // 0.0–1.0, % of communities covered
  
  // Topology score
  tricubic4dScore: number;          // 0.0–1.0, 4D manifold proximity
}
```

### HMM State Transition (Decision Tree)

```typescript
function hmm_recommendNextTool(
  obs: HMMObservation,
  agentState: AgentState,
  priorResults: SearchResult[]
): HMMHiddenState {
  
  // Gate 1: Do we have any candidates yet?
  if (priorResults.length === 0 || obs.qdrantTopScore < 0.3) {
    return HMMHiddenState.NeedsSearch;
  }
  
  // Gate 2: Are candidates weak/sparse?
  if (
    obs.sourceRefCoverage < 0.5 ||
    obs.topologyClusterCoverage < 0.3 ||
    priorResults.length < 3
  ) {
    return HMMHiddenState.NeedsGraphExpand;
  }
  
  // Gate 3: Do we have many candidates but low authority?
  if (
    priorResults.length > 20 &&
    obs.pagerankTop10Mean < 1.0
  ) {
    return HMMHiddenState.NeedsRerank;
  }
  
  // Gate 4: Are features incomplete?
  const missingFeatures = priorResults.some(r =>
    !r.ast_symbols || !r.lexical_features || !r.entities
  );
  if (missingFeatures) {
    return HMMHiddenState.NeedsBackfill;
  }
  
  // Gate 5: Envelope integrity check
  const envelopeBroken = priorResults.some(r =>
    !r.packet_key || !r.source_ref || !r.feature_id
  );
  if (envelopeBroken) {
    return HMMHiddenState.NeedsSchemaValidate;
  }
  
  // Gate 6: Ready for synthesis
  return HMMHiddenState.NeedsSynthesis;
}
```

### Tool Mapping

```typescript
const HMM_TOOL_MAP: Record<HMMHiddenState, string> = {
  [HMMHiddenState.NeedsSearch]: 'go_retrieval.search',
  [HMMHiddenState.NeedsGraphExpand]: 'neo4j.expandNeighborhood',
  [HMMHiddenState.NeedsRerank]: 'retrieval.rerank',
  [HMMHiddenState.NeedsBackfill]: 'atlas.backfillFeatures',
  [HMMHiddenState.NeedsSchemaValidate]: 'envelope.validate',
  [HMMHiddenState.NeedsSynthesis]: 'gemma4.synthesize',
};

export function hmmRecommendTool(obs: HMMObservation, state: AgentState): string {
  const nextState = hmm_recommendNextTool(obs, state, state.priorResults);
  return HMM_TOOL_MAP[nextState];
}
```

### Why HMM for This

✅ **Separates concerns**:
- RRF does ranking (which results are best?)
- HMM does orchestration (what tool next?)

✅ **Observable decision process**:
- Can see which gate triggered which recommendation
- Debuggable (not a black box)

✅ **Extensible**:
- Add new states without retraining
- Change thresholds without model update

✅ **Fast**:
- No neural network inference
- <1ms decision time

---

## Part 3: Authority Boost (PageRank + Community + Topology)

**Key rule**: Authority is a **small multiplier**, not the main score.

### Computation

```typescript
function computeAuthorityScore(
  topPageRankScores: number[],  // 0.0–10.0 range
  communityId: string,
  communityAuthority: number,   // 0.0–1.0
  tricubic4d: number            // 0.0–1.0
): number {
  // Normalize PageRank: 0.0–10.0 → 0.0–1.0
  const pagerankMean = topPageRankScores.reduce((a, b) => a + b, 0) / Math.max(topPageRankScores.length, 1);
  const pagerankNorm = Math.min(pagerankMean / 10.0, 1.0);
  
  // Authority boost: small additions, not replacing RRF
  return (
    0.05 * pagerankNorm +        // Top-10 PageRank average
    0.03 * communityAuthority +  // Community score (Louvain)
    0.04 * tricubic4d            // 4D manifold proximity
  );
  
  // Total authority boost: max 0.12 (12% of final score)
}

// Final score = RRF (0.0–1.0) + Authority (0.0–0.12)
// Result: 0.0–1.12, then clamp to [0.0, 1.0]
```

### Why Small Weights

| Weight | What | Impact |
|--------|------|--------|
| **0.05** × PageRank | Top-10 authority | +5% max if all PageRank = 10 |
| **0.03** × Community | Cohesion within cluster | +3% max |
| **0.04** × Tricubic | 4D topology | +4% max |
| **Total** | Authority boost | +12% max |

**Why not larger?** Semantic relevance (Qdrant cosine) should dominate. A highly relevant result that's NOT a PageRank top-10 should still rank above a low-relevance PageRank-heavy result.

Example:
```
Candidate A: RRF 0.8, PageRank 1.0  → Final 0.8 + 0.005 = 0.805
Candidate B: RRF 0.6, PageRank 10.0 → Final 0.6 + 0.05  = 0.650
→ Candidate A wins (relevant > authoritative-but-weak)
```

---

## Part 4: ngram Metadata (Symbolic Matching)

**Goal**: Cheap intent/symbol matching without embeddings.

### Packet ngram Fields

```typescript
// Precomputed for each packet during feature extraction
export interface PacketNgrams {
  symbol_bigrams: string[];           // ["validateSession", "Session"]
  camelcase_tokens: string[];         // ["validate", "session"]
  function_tokens: string[];          // ["validateSession", "createSession"]
  route_tokens: string[];             // ["/api/auth", "/validate"]
  domain_terms: string[];             // ["auth", "session", "lucia"]
  error_terms: string[];              // ["error", "catch", "throw"]
}
```

### Computation

```typescript
function computeNgramOverlap(
  queryNgrams: string[],
  packetNgrams: PacketNgrams
): number {
  const allPacketNgrams = [
    ...packetNgrams.symbol_bigrams,
    ...packetNgrams.camelcase_tokens,
    ...packetNgrams.function_tokens,
    ...packetNgrams.domain_terms,
  ];
  
  if (allPacketNgrams.length === 0) return 0.0;
  
  const querySet = new Set(queryNgrams);
  const matches = allPacketNgrams.filter(ng => querySet.has(ng)).length;
  
  // Jaccard similarity: intersection / union
  const union = new Set([...queryNgrams, ...allPacketNgrams]).size;
  const overlap = matches / Math.max(union, 1);
  
  return Math.min(overlap, 1.0);
}
```

### Why Small Weight (3%)

- ✅ Catches symbol name matches (e.g., query "validateSession" → exact match)
- ❌ Susceptible to name collision (generic names like "utils", "get", "post")
- ❌ Doesn't understand semantics (synonyms aren't caught)

So: Use as a tiebreaker, not primary signal.

---

## Part 5: Tricubic 4D Manifold Search

**Goal**: Refine candidates using manifold topology, NOT as primary search.

### Computation

```typescript
function computeTricubic4dScore(
  queryLatent4d: Float32Array,     // 4D vector
  candidateLatent4d: Float32Array, // 4D vector
  maxDistance: number = 2.0         // Radius threshold
): number {
  // Euclidean distance in 4D space
  let distSq = 0;
  for (let i = 0; i < 4; i++) {
    const delta = queryLatent4d[i] - candidateLatent4d[i];
    distSq += delta * delta;
  }
  const dist = Math.sqrt(distSq);
  
  // Tricubic weight: falls off smoothly from 1.0 → 0.0
  // w(d) = (1 - (d/max)^3)^3 for d < max
  if (dist >= maxDistance) return 0.0;
  
  const normalized = dist / maxDistance;
  const cubic = Math.pow(1 - Math.pow(normalized, 3), 3);
  return cubic;
}
```

### Why Tricubic (Not Linear/Gaussian)

| Function | Behavior | Use |
|----------|----------|-----|
| **Linear** | w(d) = max(0, 1 - d/max) | Sharp cutoff, discontinuous derivative |
| **Gaussian** | w(d) = exp(-d²/σ²) | Never reaches zero, heavy tail | 
| **Tricubic** | w(d) = (1-(d/max)³)³ | Smooth, compact support, C² continuous | ✅ |

Tricubic is the Goldilocks kernel: smooth, compact, and zero beyond the radius.

### Integration (Refine, Don't Replace)

```
Candidates from Qdrant/TurboVec/Neo4j
  ↓
For each candidate:
  Compute tricubic 4D weight
  Multiply candidate score by (1 + 0.04 * tricubic4dScore)
  ↓
Re-rank by adjusted score
```

**Important**: 4D manifold is NOT the primary retrieval path. It refines candidates already found by Qdrant/TurboVec/Neo4j.

---

## Part 6: Arrow IPC + mmap for Batch Matrices

**Goal**: Memory-efficient batch processing of large matrices.

### Workflow

```
Postgres/Qdrant export
  ↓
Arrow IPC serialization (columnar, typed)
  ├─ columns: [packet_id, latent64, latent128, manifold4d, metadata]
  └─ format: Apache Arrow (language-neutral)
  ↓
mmap[] (memory-mapped file)
  ├─ OS pages in lazily
  ├─ No deserialization overhead
  └─ GPU can read directly from disk
  ↓
Batch compute (GPU/CPU)
  ├─ cuVS: kmeans, IVF-Flat, CAGRA
  ├─ RAPIDS: matrix ops, filtering
  └─ Output: cluster_id, latent64_quantized, manifold4d
  ↓
Write back to Postgres/Qdrant
```

### Arrow IPC Schema (TypeScript)

```typescript
export interface ArrowBatchMatrix {
  schema: {
    packet_id: 'utf8',
    latent64: 'float32[64]',      // 64-dim vector
    latent128: 'float32[128]',     // 128-dim vector
    manifold4d: 'float32[4]',      // 4D vector
    pagerank: 'float32',
    community_id: 'uint32',
    timestamp: 'timestamp[ms]',
  };
  
  // Total per row: 8 + (64+128+4)*4 + 4 + 4 + 8 = ~800 bytes
  // 58K rows: ~46 MB file (compressible with Zstd to ~15 MB)
  
  batchSize: 1024;  // Process in chunks
}
```

### mmap Usage

```typescript
// Node.js with mmap library
import { mmap } from 'mmap-io';

const fd = fs.openSync('batch_matrices.arrow');
const size = fs.statSync('batch_matrices.arrow').size;
const buffer = mmap(fd, size, mmap.PROT_READ, mmap.MAP_SHARED);

// Arrow parser reads directly from mmap buffer (no copy)
const table = parseArrowTable(buffer);

// Send to GPU via cuVS
const clusters = await cudaKMeans(table.latent64, {
  k: 128,
  maxIter: 100,
});

// Write results back to Postgres
await db.batchUpdate('atlas_packets', clusters);
```

---

## Part 7: GPU Acceleration (cuVS / RAPIDS Lane)

**Goal**: Use GPU for batch operations, not online queries.

### Best Fit Operations

| Operation | Best | Why |
|-----------|------|-----|
| **Batch cosine** | GPU (cuVS) | 100+ vectors at once, 1000× speedup |
| **KMeans** | GPU (cuVS) | Convergence 50× faster on RTX |
| **IVF-Flat / IVF-PQ** | GPU (cuVS) | Parallel distance computation |
| **Large backfill** | GPU (cuVS) | Terabytes at once via mmap |
| **Latent matrix search** | GPU (cuVS) | All packets vs query in parallel |
| **Quantization** | GPU (cuVS) | Product quantization 10× faster |

**NOT GPU**:
- ❌ Single online query (overhead > benefit)
- ❌ Small batches (<50 vectors)
- ❌ Streaming ingestion (prefer TurboVec on CPU)

### cuVS Integration

```typescript
// Offline: compute clusters for all 58K packets
import cuVS from 'rapids-cuml';  // GPU ML library

const latent64Matrix = await loadArrowMatrix('latent64.arrow');
const clusters = await cuVS.kmeans({
  data: latent64Matrix,
  n_clusters: 128,
  max_iter: 100,
  tol: 1e-3,
  random_state: 42,
});

// Write to Postgres
await db.execute(`
  UPDATE atlas_packets 
  SET topology_cluster = $1
  WHERE packet_key = $2
`, clusters);
```

---

## Part 8: go-retrieval gRPC Service

**Goal**: Typed orchestrator exposing one unified retrieval interface.

### Protobuf Schema

```protobuf
syntax = "proto3";

package retrieval;

service RetrievalService {
  // Main search entry point
  rpc Search(SearchRequest) returns (SearchResponse);
  
  // HMM tool recommendation
  rpc RecommendTool(AgentState) returns (ToolRecommendation);
  
  // Graph expansion
  rpc ExpandGraph(GraphExpandRequest) returns (GraphExpandResponse);
  
  // Feature backfill
  rpc BackfillSignals(BackfillRequest) returns (BackfillResponse);
}

message SearchRequest {
  string query = 1;
  string intent = 2;  // "find_auth_code" | "list_dependencies" | ...
  int32 limit = 3;
  repeated string filters = 4;  // "created_after:2024-01-01", "token_count:>100"
}

message SearchResponse {
  repeated Candidate candidates = 1;
  HMMObservation observation = 2;  // For tool recommendation
  float total_latency_ms = 3;
}

message Candidate {
  string packet_key = 1;
  string source_ref = 2;
  float rrf_score = 3;           // 0.0–1.0
  float authority_score = 4;     // Authority boost
  string title = 5;
  string snippet = 6;
  repeated string tags = 7;
}

message AgentState {
  string query = 1;
  repeated Candidate prior_results = 2;
  string conversation_context = 3;
  int32 tool_call_count = 4;
}

message ToolRecommendation {
  string next_tool = 1;  // "go_retrieval.search" | "neo4j.expandNeighborhood" | ...
  string reason = 2;     // Human-readable explanation
  float confidence = 3;  // 0.0–1.0
}

message GraphExpandRequest {
  string packet_key = 1;
  int32 depth = 2;
  string direction = 3;  // "incoming" | "outgoing" | "bidirectional"
}

message GraphExpandResponse {
  repeated Candidate neighbors = 1;
}

message BackfillRequest {
  repeated string packet_keys = 1;
  repeated string missing_features = 2;  // "ast_symbols", "lexical_features", ...
}

message BackfillResponse {
  int32 filled_count = 1;
  repeated string errors = 2;
}
```

### Recommended Flow

```
TRACE MCP tool invocation
  ↓ (e.g., mcp.kb.trace_search)
go-retrieval.Search(SearchRequest)
  ├─ Call Qdrant ANN
  ├─ Call TurboVec prefilter
  ├─ Call Postgres BM25
  ├─ Call Neo4j graph
  └─ Compute RRF + authority
  ↓
Return SearchResponse
  ├─ candidates[]
  └─ HMMObservation
  ↓
LangGraph/ACP receives response
  ↓
Optional: Call go-retrieval.RecommendTool(AgentState)
  ↓
HMM decision: next_tool
  ├─ If NeedsSearch → loop back to Search()
  ├─ If NeedsGraphExpand → call ExpandGraph()
  ├─ If NeedsRerank → call external BERT reranker
  ├─ If NeedsBackfill → call BackfillSignals()
  ├─ If NeedsSchemaValidate → validate envelopes
  └─ If NeedsSynthesis → call Gemma4 synthesize
  ↓
Final answer to user
```

---

## Summary: Signal Stack

```
Retrieval Layer (finding candidates):
  ✅ Qdrant ANN (semantic)
  ✅ TurboVec prefilter (fast topology)
  ✅ Postgres BM25 (lexical)
  ✅ Neo4j graph (structural)
  ✅ ngram metadata (symbolic)
  ✅ SOM topology (manifold)
  ✅ Freshness (temporal)
  ↓ RRF fusion (0.0–1.0 score)

Authority Boost Layer (refining score):
  ✅ PageRank top-10 (+0.05)
  ✅ Community score (+0.03)
  ✅ Tricubic 4D (+0.04)
  ↓ (small multipliers, not main signal)

Policy Layer (choosing next tool):
  ✅ HMM state machine (7 states)
  ✅ Decision gates (coverage, authority, features)
  ✅ Tool mapping (state → MCP tool)
  ↓ (NOT ranking, orchestrating)

Orchestration Layer (executing workflow):
  ✅ go-retrieval gRPC service
  ✅ LangGraph/ACP state machine
  ✅ Loop on HMM recommendations
  ↓ Final answer

Acceleration Layer (batch ops):
  ✅ Arrow IPC (columnar serialization)
  ✅ mmap[] (zero-copy disk access)
  ✅ cuVS / RAPIDS (GPU batch compute)
  ↓ Write results back to Postgres/Qdrant
```

---

## Implementation Checklist (Phase 111+)

### Checkpoint 1: RRF Refinement (2h)
- [ ] Implement `computeRRFBlend()` function
- [ ] Verify 7 signals normalize to 0.0–1.0
- [ ] Add authority boost (small multipliers)
- [ ] Test on 100 queries (verify ranking quality)

### Checkpoint 2: HMM Wiring (3h)
- [ ] Define HMMObservation type
- [ ] Implement state transition function
- [ ] Wire into LangGraph/ACP
- [ ] Add decision logging (which gate triggered?)

### Checkpoint 3: go-retrieval gRPC (4h)
- [ ] Write Protobuf schema
- [ ] Implement Go service (orchestrator)
- [ ] Wire Qdrant + TurboVec + Postgres + Neo4j calls
- [ ] Test with 10 queries (end-to-end)

### Checkpoint 4: Batch Acceleration (6h)
- [ ] Export matrices to Arrow IPC format
- [ ] Implement mmap[] loading
- [ ] Wire cuVS kmeans call
- [ ] Write results back to Postgres

### Checkpoint 5: Integration (2h)
- [ ] Wire TRACE MCP tools → go-retrieval gRPC
- [ ] LangGraph executes HMM recommendations
- [ ] Smoke test full workflow (5 user queries)

**Total**: ~15–20 hours (Sessions 111–112)

---

## Why This Architecture

| Principle | Benefit |
|-----------|---------|
| **RRF fuses ranking** | No single signal overweights others; robust to outliers |
| **HMM orchestrates, not ranks** | Clear separation: ranking vs. workflow |
| **Authority as small boost** | Semantic relevance stays primary; PageRank refines |
| **Tricubic 4D refines, not primary** | Topology is context, not search engine |
| **ngram as tiebreaker** | Catches symbol names without over-matching |
| **Arrow IPC + mmap** | Batch ops without memory overhead or deserialization |
| **cuVS on GPU** | Cluster/KMeans 50× faster than CPU; save for batch |
| **go-retrieval gRPC** | Typed contract, language-neutral, fast serialization |

**Status**: 🟢 ARCHITECTURE READY FOR IMPLEMENTATION (Phase 111+)

