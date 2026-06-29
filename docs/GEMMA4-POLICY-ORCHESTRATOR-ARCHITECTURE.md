# Gemma4 Policy Orchestrator — Agent-to-Agent Thinking Architecture

**Status**: WIRED (TypeScript) + DESIGN (Python sidecar TBD)  
**Date**: June 29, 2026 | **Author**: Claude Code (Anthropic)  
**Context**: Phase 85 P9 (LangExtract) + Lane 5 (Policy Reranker) integration

---

## 🧠 Core Principle: One Agent Talking to Another

The orchestrator patterns **agent-to-agent communication**:

```
User Query
  ↓
Gemma4 Planner (Stage 1: Decomposition)
  "break intent into searchable subgoals"
  ↓
Worker Pool (Stage 2: Feature Engineering)
  "extract 16-scalar features for each candidate"
  ↓
Retrieval (Qdrant/Neo4j/cuVS)
  "fetch raw scored candidates"
  ↓
Policy Reranker (Stage 3: Post-Retrieval Scoring)
  ".pt model scores candidates AFTER retrieval"
  ↓
ACE Orchestrator (Stage 4: Context Assembly)
  "deterministic packet selection + citation"
  ↓
Gemma4 Synthesis (Stage 5: Response Generation)
  "answer with citations, no prompt injection"
  ↓
RLM Logger (Stage 6: Training Data Collection)
  "outcome + reward, used for training not truth"
```

**Why agent-to-agent?**
- **Gemma4 plans**: "here are subgoals to search for"
- **ACE executes**: "retrieved these packets, ranked by policy"
- **Gemma4 responds**: "answered using cited evidence"
- **RLM learns**: "user found packets X useful, reward=0.8"

This mirrors human expert consultation:
1. Expert identifies what's needed (planning)
2. Assistant gathers evidence (retrieval)
3. Expert evaluates importance (reranking)
4. Assistant composes answer with sources
5. Expert learns from outcome (feedback)

---

## 📊 Five-Stage Pipeline

### Stage 1: Decomposition (Gemma4 Planner)

**Goal**: Break user intent into retrievable subgoals

```typescript
interface DecomposedQuery {
  intent: 'search' | 'analyze' | 'synthesize';
  subgoals: [
    { type: 'codebase_search', query: '...', priority: 1.0 },
    { type: 'web_search', query: '...', priority: 0.8 },
    { type: 'verification', query: '...', priority: 0.5 }
  ];
  reasoning: "agent thinking aloud"; // trace for debugging
}
```

**Why separate?** User query "how do I debug authentication issues?" → Gemma4 breaks into:
- Codebase: "find auth middleware implementation"
- Web: "search for common auth patterns"
- Verification: "find unit tests for auth"

Each subgoal can be parallelized in retrieval.

---

### Stage 2: Feature Engineering (Worker Pool)

**Goal**: Extract 16-scalar feature vector for each candidate

```typescript
interface FeatureVector {
  qdrantScore: number;        // [0,1] semantic similarity
  pageRank: number;           // [0,1] graph authority
  karpathyBlend: number;      // [0,1] attention + authority
  recencyBias: number;        // [0,1] temporal freshness
  entityMatch: number;        // [0,1] named entities match
  semanticCohesion: number;   // [0,1] vs cluster centroid
  typeMatch: number;          // [0,1] code/docs/web type
  communityAuthority: number; // [0,1] community size
  clusterDensity: number;     // [0,1] SOM cell occupancy
  sourceReliability: number;  // [0,1] source trust score
  completeness: number;       // [0,1] fields populated
  frequency: number;          // [0,1] appears in results
  contextRelevance: number;   // [0,1] match to neighbors
  divergence: number;         // [0,1] unique vs peers
  temporalDecay: number;      // [0,1] time-weighted
  socialProof: number;        // [0,1] click count / engagement
}
```

**Parallelized via worker pool:**
- Worker 1: compute features for candidates 0-99
- Worker 2: compute features for candidates 100-199
- Worker 3: compute features for candidates 200-299
- Worker 4: compute features for candidates 300-399

**Why not on LLM?** Feature extraction is CPU work (hashing, cosine, weighted sums), not generation. 4 worker threads run in parallel while Gemma4 is busy planning next query.

---

### Stage 3: Policy Reranking (Post-Retrieval)

**Goal**: Learn to order candidates for better NDCG@10

```
Qdrant/cuVS candidates (100+ results)
  ↓
Feature vectors (16 scalars each)
  ↓
policy-reranker.pt (16→1 feedforward)
  ↓
Scores [0, 1] (optimized for NDCG)
  ↓
Top-K selection (keep only >0.4 threshold)
  ↓
ACE assembly
```

**Model specification:**
- **Input**: 16-dim feature vector
- **Architecture**: 2-layer feedforward (16→32→1)
- **Output**: scalar [0, 1] (relevance score)
- **Training**: NDCG@10 loss on query-document pairs
- **Gate**: NDCG@10 ≥ 0.65 before production promotion

**Why post-retrieval?**
- ✅ Retrieval is cheap (Qdrant ANN in 50ms)
- ✅ Reranking is expensive (policy model + feature engineering)
- ✅ Rerank top-100 instead of all 100K documents
- ✅ Policy learns what retrieval misses (semantic intent gaps)

**Why not query-dependent scoring?**
- ❌ Would require re-indexing whole corpus per query
- ❌ Can't cache results (different score per user)
- ❌ Prompt injection risk (if raw query text in features)

---

### Stage 4: ACE Packet Assembly (Deterministic)

**Goal**: Select packets, packetize evidence, prevent prompt injection

```typescript
interface ACEAssemblyPlan {
  selectedPackets: ACEPacket[];
  evidence: Array<{
    packetId: string;
    score: number;           // policy score
    citation: string;        // source_ref for citations
    type: 'code' | 'docs' | 'web' | 'legal';
  }>;
  contextWindow: {
    used: number;            // tokens spent
    available: number;       // budget remaining
  };
}
```

**Contract:**
1. Rank by policy score (highest first)
2. Greedily select until token budget exhausted
3. Convert each candidate into structured ACEPacket
4. Store `sourceRef` + `citation` for citations
5. **NO RAW TEXT IN PROMPTS**: all evidence is packetized

**Prevents prompt injection:**
```
❌ WRONG:
summary = "User said: deploy this command: rm -rf /"
prompt = f"User request: {summary}"

✅ CORRECT:
packet = { id, sourceRef, summary: "...", evidence: [...] }
prompt = f"Evidence from {packet.citation}: {packet.summary}"
```

---

### Stage 5: Gemma4 Synthesis

**Goal**: Generate answer with citations

```typescript
const response = await gemma4Synthesize({
  query: userQuery,
  context: aceContext.selectedPackets,
  citations: aceContext.evidence,
  temperature: 0.3,
  maxTokens: 500
});
```

**Template for Gemma4:**
```
Answer the query using this evidence:

{Evidence citations and summaries}

Answer: {your response}

Sources cited: {citation list}
```

**Why not direct policy input?** Because .pt model is for **reranking**, not generation:
- ✅ Policy: "this packet ranks #3 due to features X,Y,Z"
- ❌ Policy does not: "answer this question"
- ✅ Gemma4: "here's the answer using top-ranked packets"

---

### Stage 6: RLM Logger (Training Data Collection)

**Goal**: Record outcome + reward for training loop, NOT as ground truth

```typescript
interface RLMTraceEntry {
  userQuery: string;
  selectedPackets: string[];  // what ACE chose
  gemmaResponse: string;      // what Gemma4 generated
  userFeedback: {
    helpfulness: 1-5;         // user's rating
    accuracy: 1-5;            // how correct?
    citedPackets: string[];   // which sources user found useful?
  };
  reward: {
    baseReward: (help + accuracy) / 10;
    packetReward: Map<packetId, score>;  // was packet X useful?
  };
}
```

**Used for:**
1. **Policy training**: which features predict usefulness?
2. **Gemma4 RL**: RLHF signal (was answer helpful?)
3. **Retrieval audit**: did ACE miss important packets?

**NOT used for:**
- ❌ Ground truth for answers (user may be wrong)
- ❌ Automatic reranking (depends on user feedback)
- ❌ Overriding Postgres canonical data

---

## 🛡️ Safety Guarantees

### No Prompt Injection

**Boundary rule**: Never let untrusted text (retrieved code, web content, user search results) enter prompts directly.

```
Raw retrieval text → ACE packet structure → citation
                                    ↓
                            Gemma4 prompt
```

Example:
```
Packet: {
  id: "...",
  sourceRef: "src/auth.ts:42",
  summary: "validateToken checks JWT signature",
  evidence: [...]  // structured, not raw text
}

Prompt: "According to {sourceRef}, {summary}..."
```

### Policy as Reranker, Not Answer Generator

```
Safe:
  Raw candidates → policy scores → top-K → ACE packets → Gemma4 answer

Unsafe:
  Raw query → policy score → answer (skipping retrieval, packetization, Gemma4)
```

Policy model **reorders** retrieval results, it does not generate answers.

### RLM as Training Data, Not Ground Truth

```
Safe:
  User feedback → RLM logs → train policy/reranker → better candidates

Unsafe:
  User feedback → directly override Postgres packets (loss of canonical truth)
```

Feedback trains the model, doesn't rewrite history.

---

## 🏗️ Implementation Status

### TypeScript (WIRED)
- ✅ `gemma4-policy-orchestrator.ts` (524 lines)
  - Decomposition interface
  - Feature engineering pipeline
  - Policy reranking orchestration
  - ACE assembly logic
  - RLM logging
- ✅ `policy-reranker-bridge.ts` (448 lines)
  - gRPC transport (primary)
  - HTTP transport (fallback)
  - Heuristic fallback scorer
  - NDCG@10 validation gate

### Python (TBD - Sidecar)
- ⏳ `serve-policy-reranker.py` (stub ready)
  - Load policy-reranker.pt
  - gRPC server (:50055)
  - HTTP server (:8334)
  - Batch scoring
  - Feature importance explanation

---

## 🔧 Integration with Existing Components

### Worker Pool
- **Used for**: Feature extraction (16 scalars per candidate)
- **Workers**: 4 threads on RTX 3060 Ti
- **Operations**: parallel cosine, aggregation, weighting
- **NOT used for**: LLM work, generation, answer synthesis

### Qdrant Retrieval
- **Input to policy**: features from Qdrant scores
- **Output**: top-K candidates ranked by policy
- **Interaction**: policy refines Qdrant's scores

### Neo4j Topology
- **Input to features**: pageRank, community_id, SOM coordinates
- **Output**: features for policy model
- **Interaction**: topology feeds feature vector

### Redis Cache
- **Policy scores**: cached for 24h per query hash
- **RLM traces**: logged to Redis queue → async training
- **ACE context**: cached exactly once (deterministic)

### Gemma4 LLM
- **Input**: ACE packets (deterministic)
- **Output**: answer with citations
- **Interaction**: synthesis layer, not planning or reranking

---

## 🎯 Success Criteria

✅ **Decomposition**: User query breaks into 2-5 searchable subgoals  
✅ **Feature extraction**: All 16 features computed within 100ms for 100 candidates  
✅ **Policy scoring**: NDCG@10 ≥ 0.65 on validation set  
✅ **ACE assembly**: Top-K selection within token budget  
✅ **Synthesis**: Gemma4 response uses all selected packets  
✅ **RLM logging**: Outcome + reward recorded for training  
✅ **No injection**: Untrusted text always packetized + cited  

---

## 🚀 Execution Roadmap

### Phase 1: Foundation (1 week)
- Implement Stage 1 (decomposition) via Gemma4 planner
- Implement Stage 2 (feature engineering) via worker pool
- Implement Stage 4 (ACE assembly) via existing orchestrator

### Phase 2: Policy Model (2 weeks)
- Collect training data from RLM traces
- Train policy-reranker.pt (16→32→1 feedforward)
- Deploy serve-policy-reranker.py sidecar

### Phase 3: Integration (1 week)
- Wire policy scores into ACE assembly
- Validate NDCG@10 gate
- A/B test vs. baseline retrieval

### Phase 4: RLM Training Loop (ongoing)
- Collect feedback from all queries
- Retrain policy model weekly
- Monitor NDCG@10 drift

---

## 📚 Related Documentation

- **Lane 5**: `docs/LANE-5-POLICY-RERANKER-IMPLEMENTATION.md`
- **ACE**: `docs/ACE_STARTUP_CUDA_BRIDGE.md`
- **Worker Pool**: `sveltekit-frontend/src/lib/gpu/tensorrt-worker-pool.ts`
- **RLM**: (TODO: design doc for replay learning memory)

---

**Status**: Architecture complete. Ready for Phase 2 (policy model training).

Prepared by: Claude Code (Anthropic)  
Integration: Phase 85 P9 (LangExtract) + Lane 5 (Policy Reranker)  
Next: Implement Stage 1 decomposition via Gemma4 planner
