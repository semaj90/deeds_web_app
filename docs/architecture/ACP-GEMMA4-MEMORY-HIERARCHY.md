# ACP Memory Hierarchy: Infrastructure First, Gemma4 Last

**Last Updated**: June 26, 2026  
**Author**: James Woodard + Claude  
**Status**: Architecture Reference (Canonical)

---

## Core Principle

**Gemma4 is NOT the memory system. It is the last stage of a 6-stage pipeline.**

The ACP (Agent Control Plane) + infrastructure layers handle all memory, search, caching, and packet compaction. Gemma4 receives only a compact, tokenized, validated bundle of packets and performs attention/synthesis.

---

## The 6-Stage Pipeline

### Stage 1: User Prompt (Raw Text)
```
"Wire telemetry into gpu-reranker.ts."
↓
UTF-8 bytes
↓
Tokenizer (not Gemma)
↓
~25–50 tokens
```

**At this point**: No search. No Gemma. Just text tokens.

---

### Stage 2: ACP Planner (Decision Logic)

The ACP asks **infrastructure**, not Gemma:

```
Do I already know this?
    ├─ YES → BitFrost cache
    └─ NO  → Search pipeline (rg → Postgres → Qdrant → Neo4j → ...)
```

**Key insight**: This is a **binary decision tree**, not a language model.

---

### Stage 3: BitFrost Cache (L1 Memory)

Redis contains precomputed answers indexed by query patterns:

```redis
trace:gpu-reranker
packet:gpu-reranker
feature:telemetry

Value (in Redis):
{
  summary: "GPU telemetry already implemented",
  packets: [...],
  score: 0.95,
  timestamp: "2026-06-26T..."
}

Lookup time: 5–20ms
```

**Result**: Gemma never runs. Response cache-hit.

---

### Stage 4: Cache Miss → Search Pipeline

If Redis doesn't have it, ACP searches in priority order:

```
User query (50 tokens)
    ↓
rg search (codebase grep)
    ├─ Postgres JSONB (atlas_packets, workflow summaries)
    ├─ Postgres FTS (full-text search on summaries)
    ├─ pgvector (semantic search on embedding)
    ├─ Qdrant (dense vector ANN)
    ├─ Neo4j (topology + related entities via USED_CONCEPT edges)
    ├─ docs/ directory (markdown, READMEs)
    ├─ tests/ directory (live examples)
    └─ schemas/ directory (structure reference)
    ↓
Each source returns:
{
  packet_key,
  feature_id,
  summary,
  score,
  source_kind
}
```

**Critical**: Each source returns **packets**, not raw files.

---

### Stage 5: Packet Compaction (Tokenomics)

Instead of sending raw files to Gemma:

```
Raw approach:
  gpu-reranker.ts          5,200 tokens
  telemetry-collector.ts   3,100 tokens
  types/telemetry.ts       1,800 tokens
  schema.ts                2,400 tokens
  test-telemetry.ts        4,100 tokens
  docs/telemetry.md        2,200 tokens
  ─────────────────────────────────
  Total:                  18,800 tokens 😱

Packet approach:
  Packet A (gpu-reranker summary)     400 tokens
  Packet B (telemetry collector)      400 tokens
  Packet C (type definitions)         400 tokens
  Packet D (schema structure)         400 tokens
  Packet E (test example)             400 tokens
  Packet F (doc summary)              300 tokens
  Packet G (related workflows)        400 tokens
  Packet H (authority score)          300 tokens
  ... 4 more packets at 400 ea
  ─────────────────────────────────
  Total:                   4,800 tokens ✅
```

**The win**: 18,800 → 4,800 tokens (75% reduction).

**How**:
1. Retrieve full source from Postgres/Qdrant
2. Summarize locally (no LLM needed yet)
3. Truncate to 400 tokens per packet
4. Send summaries + metadata, not source code

---

### Stage 6: Gemma4 Synthesis (Last Stage Only)

Now Gemma receives:

```
System prompt
  (350 tokens, cached via KV cache reuse)
  ↓
User prompt
  (50 tokens, already tokenized in Stage 1)
  ↓
Packet bundle
  (12 packets × 400 tokens = 4,800 tokens)
  ↓
Tool list
  (MCP tools, ~500 tokens)
  ─────────────
  Total input:  5,700 tokens
  ↓
Gemma performs:
  ├─ Attention over packets
  ├─ Tool selection (if needed)
  ├─ Reasoning
  └─ Response generation
```

**Gemma does not**:
- ❌ Search the codebase
- ❌ Decide which files to read
- ❌ Tokenize the entire project
- ❌ Retrieve from databases

**Gemma only**:
- ✅ Reads the packet bundle
- ✅ Selects appropriate tools (via MCP)
- ✅ Synthesizes an answer
- ✅ Generates next-step instructions

---

## Memory Hierarchy Analogy

Just like CPU caches:

```
Your AI Stack              CPU Architecture
─────────────────         ──────────────────
Gemma4                    CPU registers
     ↓
BitFrost Redis            L1 cache (32KB, ~5ns)
     ↓
Postgres JSONB            L2 cache (256KB, ~12ns)
     ↓
Qdrant vectors            L3 cache (8MB, ~40ns)
     ↓
Neo4j topology            RAM (8–16GB, ~100ns)
     ↓
Filesystem (rg search)    SSD (1–2TB, ~10μs)
     ↓
Firecrawl (web fetch)     Network (internet, ~100ms)
```

**Hierarchy principle**: Faster layers (Redis) are consulted first. Slower, deeper searches (Neo4j) only if cache misses.

---

## KV Cache Misconception

**What KV cache is NOT**: Cached text or tokens.

**What KV cache IS**: Transformer layer outputs.

```
System prompt
  ↓
Tokenize
  ↓
Pass through Transformer
  ├─ Layer 1  → compute KV tensors → store in memory
  ├─ Layer 2  → compute KV tensors → store in memory
  ├─ ...
  └─ Layer 42 → compute KV tensors → store in memory
  ↓
KV state lives in GPU/CPU RAM
(not on disk, only while session active)

Next user message in same session:
  ↓
Reuse Layer 1–42 KV state
  ↓
Don't recompute layers 1–42
  ↓
Only compute new tokens using cached KV
```

**Result**: System prompt tokenization is amortized across the session. Repeated queries don't re-tokenize it.

---

## Workflow Capture & Searchability

Instead of caching only final answers, **cache entire workflows**:

```
Query 1: "Analyze gpu-reranker impact"
  ├─ Tool 1: Search codebase (rg gpu-reranker)
  ├─ Tool 2: Retrieve Qdrant embeddings
  ├─ Tool 3: Fetch schema from Postgres
  ├─ Tool 4: Call Gemma (synthesis)
  └─ Result: "GPU reranker improves latency 50×"
  
  Store as workflow packet:
  {
    trace_id: "trace:gpu-reranker:20260626",
    workflow_summary: "GPU reranker impact analysis",
    tools_used: ["rg_search", "qdrant_retrieval", "postgres_schema", "gemma_synthesis"],
    tool_args: [...],
    latencies: { rg: 120ms, qdrant: 450ms, postgres: 95ms, gemma: 2300ms },
    packet_ids: ["packet:gpu-reranker:1", "packet:telemetry:1", ...],
    feature_ids: ["feature:gpu", "feature:telemetry"],
    source_refs: ["src/lib/server/gpu/libtorch-bridge.ts", ...],
    success: true,
    score: 0.92,
    embedding: [0.234, -0.156, ...],  // 768-dim
    latent64: [0.1, 0.2, ...],        // 64-dim (AE compressed)
    timestamp: "2026-06-26T...",
    domain: "gpu_acceleration",
    tags: ["telemetry", "performance", "gpu"]
  }
```

### Benefits

1. **Workflow becomes searchable**: Query "How do we analyze GPU performance?" → retrieves past workflows
2. **Gemma doesn't reinvent**: Retrieves similar workflow structure instead of building from scratch
3. **Metrics collected**: Every workflow contributes to reward dataset for future training
4. **Latency tracking**: Tool-by-tool breakdown informs optimization priorities

---

## Workflow as Packet → Qdrant Mirror

Store workflow summaries in Qdrant for fast retrieval:

```
Qdrant collection: workflow_patterns

Point:
{
  id: "workflow:gpu-reranker:20260626",
  vector: [768-dim workflow embedding],
  payload: {
    summary: "GPU reranker impact analysis",
    tools: ["rg_search", "qdrant", "postgres", "gemma"],
    success: true,
    latency_ms: 2965,
    domain: "gpu_acceleration",
    tags: ["telemetry", "performance"],
    feature: "gpu",
    packet_ids: [...],
    source_refs: [...]
  }
}
```

**Query**: User asks "How do we optimize GPU latency?"
```
Query embedding → Qdrant ANN → top-5 workflows
Each workflow includes tool sequence + packet IDs
ACP retrieves those packets + workflow structure
Gemma synthesizes using past pattern
```

---

## PostgreSQL Schema for Workflows

Keep canonical truth in Postgres:

```sql
CREATE TABLE workflow_summaries (
  workflow_id uuid PRIMARY KEY,
  trace_id text UNIQUE NOT NULL,
  summary text NOT NULL,
  tools_used text[] NOT NULL,
  success boolean NOT NULL,
  latency_ms integer,
  timestamp timestamptz DEFAULT now(),
  domain text,
  tags text[],
  
  -- Embedding
  embedding vector(768),
  latent64 vector(64),
  
  -- Metadata JSONB
  metadata jsonb,  -- { tool_args: {...}, latencies: {...} }
  packet_ids text[],
  feature_ids text[],
  source_refs text[]
);

-- Indexes
CREATE INDEX workflow_ts_idx ON workflow_summaries (timestamp DESC);
CREATE INDEX workflow_domain_idx ON workflow_summaries USING GIN (tags);
CREATE INDEX workflow_vector_idx ON workflow_summaries USING IVFFLAT (embedding vector_cosine_ops);
CREATE INDEX workflow_metadata_idx ON workflow_summaries USING GIN (metadata);
```

---

## GPU Shaders: Visualization & Lightweight Compute

Shaders are **not** language-model replacements. They're best for:

```
✅ Visualization:
  - 2D/3D embedding plots
  - SOM grid heatmaps
  - Topology network diagrams

✅ Lightweight compute:
  - Distance matrix (cosine, L2)
  - Neighborhood queries (k-nearest)
  - Clustering visualization
  - Centroid updates

❌ NOT for:
  - Tokenization
  - Attention computation
  - Token prediction
  - Language understanding
```

**Practical use**: GPU shader for topology visualization

```
latent64 vectors (4,000 vectors × 64 dims)
  ↓
GPU compute shader (WebGPU or DirectCompute)
  ├─ Compute pairwise distances
  ├─ Project to 2D (t-SNE or UMAP)
  ├─ Color by cluster
  ├─ Render heatmap
  ├─ Label nearest 10 clusters
  └─ Return cluster IDs as packet pointers
  ↓
ACP retrieves those cluster packets before Gemma runs
```

---

## Intel Integrated Graphics

Integrated GPUs (Intel HD Graphics, Intel Iris Xe) can run compute shaders:

```
WebGPU (cross-platform)
  ├─ Desktop (RTX 3060 Ti, Iris Xe, AMD GPU)
  ├─ Mobile (iPhone Metal, Android Vulkan)
  └─ Web (Canvas + compute)

DirectCompute (Windows-only)
  └─ Pixel/compute shaders

They're 10–100× slower than dedicated NVIDIA GPUs for neural inference,
but fast enough for:
  - Topology visualization (sub-100ms)
  - SOM grid heatmaps (sub-500ms)
  - Clustering visualization (sub-1s)
```

---

## Router: Multi-Modal Input

When text isn't enough, route to appropriate backend:

```
User input
  ↓
ACP Router (decision tree)
  ├─ Text?
  │  └─ Codebase search (rg → Postgres → Qdrant)
  │     ↓ ACP retrieval + compaction
  │     ↓ Gemma synthesis
  │
  ├─ Image/PDF?
  │  ├─ Vision/OCR service (Claude Vision or local CLIP)
  │  ├─ Extract text/metadata
  │  ├─ Generate image embedding
  │  └─ Create packet with image + text
  │     ↓ ACP retrieval + compaction
  │     ↓ Gemma synthesis (with image context)
  │
  ├─ Large codebase?
  │  ├─ rg search (recursive grep)
  │  ├─ LangExtract (parse AST)
  │  ├─ Create ACE (atomic code element) packets
  │  └─ Compact + deduplicate
  │     ↓ ACP retrieval + compaction
  │     ↓ Gemma synthesis
  │
  └─ Graph traversal?
     ├─ Neo4j USED_CONCEPT edges
     ├─ Expand neighborhood (k-hops)
     ├─ Retrieve related packets
     └─ Rank by PageRank + attention
        ↓ ACP retrieval + compaction
        ↓ Gemma synthesis
```

---

## Hard Rules

1. **Gemma is not the memory system.**
   - Gemma should NEVER decide "what files to search."
   - Gemma should NEVER tokenize the entire project.
   - Gemma should NEVER do multiple queries to "explore" the codebase.

2. **ACP is the retrieval + caching layer.**
   - ACP decides: "Do we have this cached?"
   - ACP decides: "Which search strategy to use?"
   - ACP compacts 10,000 tokens down to 5,000.
   - ACP validates packets before sending to Gemma.

3. **Packets are the universal currency.**
   - Every retrieval source → packet
   - Every cache entry → packet
   - Every workflow → packet
   - Gemma receives ONLY packets, never raw files.

4. **Redis is the L1 cache.**
   - Pre-compute common queries
   - Index by (query_hash, domain, feature)
   - TTL: 24–72 hours
   - Miss rate should be < 30% for known domains

5. **Qdrant mirrors Postgres packets.**
   - Qdrant is read-only
   - ANN retrieval returns packet IDs
   - ACP fetches full packets from Postgres
   - Qdrant is fast, Postgres is truth

6. **Neo4j is topology, not search.**
   - Neo4j answers "what's related?"
   - Neo4j answers "shortest path?"
   - Neo4j does NOT replace semantic search
   - Neo4j is ONLY for graph queries

7. **Workflows are learnable patterns.**
   - Every successful query → capture workflow
   - Workflows become training data
   - Workflows + embeddings → searchable patterns
   - Gemma retrieves patterns, doesn't invent them

---

## Example: "Wire telemetry into gpu-reranker"

### Without ACP (Wasteful)

```
User: "Wire telemetry into gpu-reranker.ts"
  ↓
Gemma tokenizes entire /src/lib/server/gpu/ (8,000 tokens)
  ↓
Gemma tokenizes /docs/ (12,000 tokens)
  ↓
Gemma searches memory for "telemetry" (generates queries internally)
  ↓
Gemma tokenizes test files (4,000 tokens)
  ↓
Gemma decides which tools to call
  ↓
Gemma synthesizes answer
  ↓
Total prompt: ~25,000 tokens
Gemma time: ~8 seconds
```

### With ACP (Efficient)

```
User: "Wire telemetry into gpu-reranker.ts"
  ├─ Tokenizer: 45 tokens
  ├─ ACP Planner:
  │  ├─ BitFrost lookup (5ms) → cache HIT
  │  │  ├─ summary: "GPU telemetry integration pattern"
  │  │  ├─ packets: [packet:gpu-reranker:1, packet:telemetry:1]
  │  │  └─ score: 0.92
  │  └─ Return cached answer (no search, no Gemma)
  └─ Total: 25ms, 0 tokens to Gemma
```

**If cache miss** (Redis doesn't have it):

```
  ├─ ACP Search:
  │  ├─ rg gpu-reranker (120ms) → 6 results
  │  ├─ Postgres FTS telemetry (95ms) → 4 results
  │  ├─ Qdrant embedding (450ms) → 8 results (similar patterns)
  │  └─ Deduplicate + compact → 12 packets @ 400 tokens each
  ├─ Packet compaction (200ms):
  │  └─ Summarize, truncate, embed, score
  ├─ Gemma synthesis (2,300ms):
  │  ├─ Attention over 12 packets
  │  ├─ Tool selection (rg, grep, edit)
  │  └─ Response generation
  ├─ Workflow capture (150ms):
  │  └─ Store workflow packet for future reuse
  └─ Total: ~3.3 seconds, 5,700 tokens to Gemma (vs 25,000 without ACP)
```

---

## Implementation Checklist

- [ ] BitFrost Redis cache (Stage 3)
  - [ ] Pre-compute common queries
  - [ ] Index by feature + domain
  - [ ] TTL policy (24–72h)

- [ ] Packet compaction service (Stage 5)
  - [ ] Summarize source code
  - [ ] Truncate to 400 tokens/packet
  - [ ] Generate embeddings
  - [ ] Assign source_ref, feature_id, packet_key

- [ ] Workflow capture (Stage 5.5)
  - [ ] Create workflow_summaries table
  - [ ] Embed workflows into Qdrant
  - [ ] Index by domain, tools, tags
  - [ ] Enable workflow search

- [ ] ACP Router (Stage 2)
  - [ ] Decision tree for text/image/code/graph
  - [ ] Multi-modal input handling
  - [ ] Search strategy selection

- [ ] GPU shader visualization (optional)
  - [ ] WebGPU compute for SOM heatmaps
  - [ ] Distance matrix computation
  - [ ] Cluster labeling

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Redis hit rate (L1) | >70% | TBD |
| Cache packet count (BitFrost) | >1,000 | TBD |
| Avg tokens to Gemma (with ACP) | <6,000 | ~15,000 (est) |
| Packet compaction ratio | 75%+ | TBD |
| End-to-end latency (cache hit) | <100ms | TBD |
| End-to-end latency (cache miss) | <5s | TBD |
| Workflow reuse rate | >30% | TBD |

---

## Key Takeaway

**Gemma4 should never ask "What should I search?" or "What files do I need?" or "Let me explore this codebase."**

The ACP infrastructure layer asks those questions *before* Gemma runs. Gemma receives a compact, pre-validated packet bundle and performs attention/synthesis. This design:

- ✅ Reduces token usage by 75%
- ✅ Reduces latency by 80% (via caching)
- ✅ Enables workflow reuse
- ✅ Keeps Gemma focused on reasoning
- ✅ Scales to multi-million-file codebases

---

**Maintained by**: Claude (Anthropic) + James Woodard  
**Last Updated**: June 26, 2026  
**Status**: Canonical Architecture Reference  
**Next**: Implement BitFrost cache pre-population + packet compaction service
