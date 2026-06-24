# Session 74 Extended — Web Research: HyperRAG vs Tricubic Search vs LangGraph Deep Agents

**Date**: 2026-06-23T23:45:00Z  
**Research Focus**: How tricubic search compares to modern HyperRAG (2026), and how to wire LangGraph Deep Agents as subagents for local deep research  
**Status**: Research + Analysis Complete

---

## 1. WEB RESEARCH FINDINGS

### 1A. HyperRAG Dense Search (2026)

**Source**: ACM Web Conference 2026, Dubai | ArXiv 2602.14470

**What HyperRAG Does**:
- Designed for **n-ary hypergraphs** (not binary knowledge graphs)
- Addresses multi-hop QA where traditional graph-based RAG fails
- Two retrieval variants:
  1. **HyperRetriever**: Structural-semantic reasoning over n-ary facts (learns relational chains)
  2. **HyperRanker**: Reranks using graph topology + semantic similarity

**Key Problem It Solves**:
> "Graph-based RAG methods built on binary relational facts have rigid retrieval schemes and dense similarity search often introduce irrelevant context, increase computational overhead, and limit relational expressiveness."

**Performance Gains** (vs strongest baseline):
- **+2.95%** MRR (Mean Reciprocal Rank)
- **+1.23%** Hits@10
- Average improvement across 11 closed-domain datasets (WikiTopics)
- Open-domain: HotpotQA, MuSiQue, 2WikiMultiHopQA

**Architecture**:
```
Query → N-ary hypergraph encoding (entities + higher-order relations)
   → HyperRetriever (structural-semantic chains)
   → Top-K candidates
   → HyperRanker (relevance + graph centrality)
   → Answer
```

**Why N-ary Hypergraphs Matter**:
- Encode richer inter-entity dependencies (e.g., "drug X treats disease Y in patients with condition Z")
- Enable shallower reasoning paths (fewer hops needed)
- More efficient than binary graphs for complex queries

**Relation to Our Stack**:
✅ **We already do this**: Neo4j topology + k-hop expansion (Y-axis in 4D manifold)  
✅ **We already do this**: Qdrant ANN retrieval (X-axis in 4D manifold)  
⚠️ **We could improve**: HyperRetriever learns structural chains; our chains are static Cypher  

---

### 1B. Tricubic Interpolation Search (2014-2015)

**Finding**: No specific award for "tricubic search" from 2014-2015 found.

**What We Found Instead**:
1. **Tricubic Interpolation (Mathematical Technique)**:
   - Defined in literature as smooth interpolation on 3D grids
   - Used for medical imaging (MRI/CT reconstruction)
   - Bicubic is the 2D variant (image scaling)
   - Tricubic is the 3D variant (volumetric data)
   - Pre-dates deep learning by decades

2. **Key References**:
   - Michael Flanagan's Java library (2000s): Tricubic Interpolation
   - Wikipedia: Well-documented mathematical definition
   - Image Biomarker Standardization Initiative: Clinical imaging use
   - **No "tricubic search" award** in 2014-2015

**Your Intuition Was Right**:
> The term "tricubic search" as a retrieval technique is **not a recognized concept** in the literature. The confusion comes from:
> - Tricubic interpolation is for **numerical analysis** (filling gaps in grids)
> - Search/retrieval is **discrete ranking** (top-K selection)
> - These are fundamentally different problems

**Verdict**: Tricubic in our Session 74 4D manifold is **a misnomer**. It should be:
- `blendScore()` — weighted combination of 4 axes
- `rankByScore()` — sort candidates by blend score
- (NO tricubic kernel needed for discrete retrieval)

---

### 1C. LangGraph Deep Agents + Subagents (2026)

**Source**: LangChain official docs + community patterns

**Deep Agents Overview**:
- Built on top of LangGraph (orchestration engine)
- "Batteries-included" harness for complex multi-step tasks
- **Key innovation**: Subagents for context isolation

**Subagent Pattern** (Solves Context Explosion):
```
Main Agent (context = 95K tokens)
  ├─ Subagent 1: Research Task A (clean context, 95K tokens)
  ├─ Subagent 2: Analyze Results B (clean context, 95K tokens)
  └─ Subagent 3: Synthesize C (clean context, 95K tokens)

Results bubbled up → Main agent makes decision
```

**Problem It Solves**:
> "In long research tasks, if a single agent handles everything, its context fills up with intermediate steps, search results, and partial outputs. Subagents solve this elegantly: the main agent delegates a specific subtask to a fresh agent instance with its own clean context."

**Architecture**:
- **Planning tool**: Main agent decides what sub-tasks to spawn
- **Subagents**: Autonomous execution of delegated tasks
- **Filesystem/Memory**: Persistent state across subagent runs
- **Summarization**: When context reaches 85% capacity, auto-generate summary

**Model Support**:
- OpenAI, Anthropic, Google frontier APIs
- Open-weight models via Baseten, Fireworks
- Self-hosted: Ollama, vLLM, llama.cpp

**Example Use Case** (Deep Research):
```
Main: "Research topic X"
  ├─ Subagent 1: "Search web for recent papers"
  ├─ Subagent 2: "Analyze findings for contradictions"
  ├─ Subagent 3: "Generate synthesis report"
  └─ Subagent 4: "Create bibliography with citations"

Main: Reads 4 summaries → Writes final report
```

**Installation**: `uv add deepagents`

---

## 2. YOUR EXISTING STACK ANALYSIS

### 2A. Retrieval Pipeline (Context Assembler)

**File**: `src/lib/server/ace/context-assembler.ts`

```
Current Implementation:
  1. normalizeLabels(rawLabels)
  2. Build ClusterCard with:
     - centroid_label
     - topology_label
     - hotness_bucket
     - feature_family
     - summary (from searchResults)
     - top_files
  3. Return array of cards
```

**What's Missing** (vs HyperRAG):
- No multi-hop structural reasoning (static Cypher, no learned chains)
- No N-ary hypergraph encoding (binary relations only)
- No structural-semantic reranking (Karpathy blend is good but doesn't learn)

**How to Add It**:
Replace `normalizeLabels()` with a learning-based step that:
1. Scores all possible N-ary relation chains (A → B → C)
2. Picks top chains by relevance to query
3. Injects chains into context before LLM synthesis

---

### 2B. Graphify LangGraph Pipeline

**File**: `scripts/atlas/graphify-langgraph-pipeline.mjs`

**Current Nodes** (runs sequentially):
1. `audit_coverage` — Compute signal-density gaps
2. `feature_extract` — Assign feature_id to missing packets
3. `kanban_task` — Emit prioritized task list
4. `embed_missing` — Embed packets missing Qdrant vectors
5. `index_bm25` — Backfill BM25 text in payload
6. `rank_signals` — Compute RRF ranking coverage
7. `prune_noise` — Remove cache artifacts + flag duplicates

**Architecture**:
```typescript
class StateGraph {
  addNode(name, fn)           // Node: function that takes state → returns patch
  addEdge(from, to)           // Simple edge: always route from→to
  addConditionalEdge(from, condFn)  // Conditional: route based on state
  async invoke(input, opts)   // Execute from startNode
}
```

**Key Features**:
- ✅ **Stateful**: Each node patches the global state
- ✅ **Sequential routing**: Can conditionally skip/repeat nodes
- ✅ **Observability**: Each node logs its execution time
- ⚠️ **No subagents**: All computation in-process

**How It Differs from Deep Agents**:
- Deep Agents = multi-model, multi-context subagents
- Graphify = single-process, single-context state machine
- Graphify is **more efficient** for deterministic pipelines
- Deep Agents are **more powerful** for exploratory research

---

## 3. COMPARISON: HyperRAG vs Tricubic vs Your Stack

| Aspect | HyperRAG (2026) | Tricubic Interp (Pre-2015) | Your 4D Manifold |
|--------|-----------------|---------------------------|------------------|
| **Problem Space** | N-ary multi-hop QA | Numerical field interpolation | Discrete packet ranking |
| **Core Operation** | Structural reasoning chains | Smooth grid interpolation | Weighted blend of 4 scores |
| **Learning** | Learns chain patterns | None (fixed kernel) | Fixed weights (0.3/0.3/0.2/0.2) |
| **Performance** | +2-3% MRR gain | Medical imaging quality | Unknown (not benchmarked) |
| **Relevance to Code Search** | ⭐⭐⭐ High | ❌ None | ⭐⭐ Moderate |
| **Computational Cost** | High (chain inference) | Low (kernel eval) | Low (redis lookup + blend) |
| **Maturity** | Production (ACM 2026) | Mature (decades old) | Prototype (Session 74) |

---

## 4. HOW TO WIRE LANGGRAPH DEEP AGENTS INTO YOUR STACK

### 4A. Current Graphify is NOT Deep Agents

**What Graphify Does** (Lightweight StateGraph):
```
Query → 7-node pipeline → Output JSON
  (all nodes in-process, single context window)
```

**What Deep Agents Do** (Multi-agent, context-isolated):
```
Main Agent: "Index the codebase"
  ├─ Subagent 1: Scan directory structure (Ollama gemma4)
  ├─ Subagent 2: Extract features per file (Ollama gemma4)
  ├─ Subagent 3: Build graph topology (Ollama gemma4)
  └─ Subagent 4: Synthesize summary (Ollama gemma4)

Main Agent: Reads 4 summaries, writes final context
```

### 4B. Implementation Strategy

**Step 1: Add Deep Agents to graphify-langgraph-pipeline.mjs**

```javascript
import { createAgent } from 'deepagents';

// Each "stage" becomes a subagent
const stage1 = createAgent({
  name: 'audit-coverage-agent',
  model: 'ollama:gemma4-rotorquant:latest',  // Local Gemma4
  tools: ['db.query', 'qdrant.search', 'neo4j.run'],
  instructions: 'Audit signal-density gaps across Qdrant, Neo4j, Postgres',
  fileSystem: '/tmp/atlas-audit'  // Persistent state
});

const stage2 = createAgent({
  name: 'feature-extract-agent',
  model: 'ollama:gemma4-rotorquant:latest',
  tools: ['db.update', 'ast.parse', 'feature.assign'],
  instructions: 'Assign feature_id to packets missing it using heuristics'
});

// Main orchestrator
async function runDeepGraphify() {
  const auditResults = await stage1.invoke({
    task: 'Compute gaps',
    context: currentState
  });

  const featureResults = await stage2.invoke({
    task: 'Extract features',
    audit: auditResults.summary,  // Pass summary, not full audit
    context: currentState
  });

  return { audit: auditResults, features: featureResults };
}
```

**Step 2: Logging (Key Requirement)**

```javascript
// Log every subagent call to file + stderr
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync('graphify-deep-agents.log', line + '\n');
};

stage1.on('invoke', (input) => log(`Stage 1 START: ${JSON.stringify(input)}`));
stage1.on('complete', (output) => log(`Stage 1 DONE: ${output.summary}`));
```

**Step 3: Compare to Existing (Baseline)**

Run both versions:
```bash
# Lightweight Graphify (current)
time node scripts/atlas/graphify-langgraph-pipeline.mjs --apply

# Deep Agents version (new)
time node scripts/atlas/graphify-langgraph-pipeline-deep-agents.mjs --apply
```

**Expected Metrics**:
- **Lightweight**: 2-3 minutes, single Ollama call for synthesis
- **Deep Agents**: 5-8 minutes, 4 parallel Ollama calls (subagents)
- **Quality**: Expect +10-20% better feature extraction (more thoughtful reasoning)

---

## 5. COMPARISON: Existing vs Deep Agents

### 5A. Existing Graphify Stack

**Architecture**:
```
Query → audit_coverage (SQL scan)
     → feature_extract (path heuristic)
     → kanban_task (JSON emit)
     → embed_missing (Ollama nomic-embed-text)
     → index_bm25 (BM25 tokenize)
     → rank_signals (RRF compute)
     → prune_noise (dedup)

Total: ~3 min (all deterministic, no LLM thinking)
```

**Strengths** ✅:
- Fast (no LLM per node)
- Deterministic (same input → same output)
- Low latency (great for CI/CD)
- Easy to debug (each node is a pure function)

**Weaknesses** ❌:
- No semantic understanding (path heuristic misses context)
- No self-correction (no retry logic)
- No exploration (can't ask "what if?" questions)
- Feature extraction is brittle (regex + hardcoded rules)

### 5B. Deep Agents Version

**Architecture**:
```
Main Agent decides subtasks
  ├─ Subagent 1 (LLM): "Audit this coverage report, what's missing?"
  │  → Returns: structured JSON summary (context isolated)
  │
  ├─ Subagent 2 (LLM): "Extract features from these 100 files"
  │  → Returns: structured JSON summary
  │
  ├─ Subagent 3 (LLM): "Build topology from features"
  │  → Returns: Neo4j Cypher commands
  │
  └─ Subagent 4 (LLM): "Synthesize final report"
     → Returns: markdown summary

Main Agent aggregates 4 summaries, writes final output
```

**Strengths** ✅:
- Semantic understanding (LLM "thinks" per stage)
- Self-correcting (LLM can catch errors)
- Flexible (LLM can ask clarifying questions)
- Better quality (LLM reasoning > heuristics)
- Parallel subagents (if stages are independent)

**Weaknesses** ❌:
- Slow (~5-8 min for 4 subagent calls)
- Nondeterministic (LLM may vary slightly)
- Expensive (4× Ollama inference)
- Context management overhead (summaries need to be compact)
- Debugging harder (LLM reasoning is opaque)

---

## 6. HYBRID APPROACH: Best of Both

**Recommended Architecture**:
```
Fast deterministic stage (Graphify):
  1. audit_coverage → SQL scan (10s)
  2. feature_extract → path heuristic (20s)
  3. kanban_task → emit tasks (2s)

Slow semantic stage (Deep Agents):
  4-1. Subagent: "Refine features using LLM" (60s)
  4-2. Subagent: "Validate topology" (60s)
  4-3. Subagent: "Synthesize report" (30s)

Resume fast stage (Graphify):
  5. index_bm25 → BM25 index (10s)
  6. rank_signals → RRF (5s)
  7. prune_noise → dedup (5s)

Total: ~7 min (fast pipeline + targeted LLM reasoning)
```

**Implementation**:
```javascript
// Run existing Graphify up to kanban_task
const graph = new StateGraph({ /* ... */ });
graph.addNode('audit_coverage', auditCoverageNode);
graph.addNode('feature_extract', featureExtractNode);
graph.addNode('kanban_task', kanbanTaskNode);

// Insert Deep Agents here
graph.addNode('deep_refine', async (state) => {
  const subagent = createAgent({ name: 'refine-agent', /* ... */ });
  const refined = await subagent.invoke({
    features: state.features,
    gaps: state.gaps
  });
  return { features: refined.features };
});

// Resume Graphify
graph.addNode('index_bm25', indexBm25Node);
graph.addNode('rank_signals', rankSignalsNode);
graph.addNode('prune_noise', pruneNoiseNode);

// Execute
const result = await graph.invoke(initialState);
```

---

## 7. RECOMMENDED NEXT STEPS

### Immediate (1 hour)

1. **Fix Session 74 Tricubic Misnomer**
   - Remove tricubic kernel from `packet-rpc-4d-manifold.mjs`
   - Use simple `topK()` ranking instead
   - Document: "Blend score, not tricubic interpolation"

2. **Implement HyperRAG Structural Chains** (Optional)
   - Replace static Cypher with learned chain scoring
   - Start with simple: "A uses B uses C" chains
   - Score by co-occurrence in code

### Short-term (2-3 hours)

3. **Wire Deep Agents into Graphify**
   - Create `graphify-langgraph-pipeline-deep-agents.mjs`
   - Add subagents for stages 4-1 to 4-3
   - Log every invocation to file + stderr
   - Compare performance vs existing

4. **Benchmark Both**
   - Runtime: existing vs Deep Agents
   - Quality: feature extraction accuracy
   - Cost: Ollama inference count

### Medium-term (Next session)

5. **Hybrid Execution**
   - Use fast deterministic pipeline for 70% of work
   - Use Deep Agents for semantic refinement (20% of work)
   - Goal: 70% speed, 95% quality

---

## SUMMARY: What You Should Know

| Finding | Implication |
|---------|-------------|
| **HyperRAG** is for n-ary multi-hop; you do binary k-hop today | Add learned chain scoring to match HyperRAG quality |
| **Tricubic** is for image interpolation, NOT retrieval | Remove from Session 74; use simple blend + ranking |
| **Deep Agents** solve context explosion via subagent isolation | Wire into Graphify for semantic refinement stages |
| **Your Graphify** is fast but brittle (heuristics) | Hybrid: fast + targeted LLM thinking for quality |

---

## SOURCES

- [HyperRAG: Reasoning N-ary Facts over Hypergraphs](https://arxiv.org/abs/2602.14470)
- [ACM Web Conference 2026 Proceedings](https://dl.acm.org/doi/10.1145/3774904.3792710)
- [Deep Agents Overview - LangChain Docs](https://docs.langchain.com/oss/python/deepagents/overview)
- [LangGraph Supervisor + Deep Agents: Production Guide](https://www.buildmvpfast.com/blog/langgraph-supervisor-deep-agents-multi-agent-patterns-2026)
- [Tricubic Interpolation - Wikipedia](https://en.wikipedia.org/wiki/Tricubic_interpolation)
- [Michael Flanagan's Java Library: Tricubic Interpolation](https://www.ee.ucl.ac.uk/mflanaga/java/TriCubicInterpolation.html)

