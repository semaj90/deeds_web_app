# Codebase Intelligence Pipeline — Current State + Next Steps

**As of 2026-04-16 — updated with Steps 1–2 DONE + Phase 2 analytics pipeline DONE + Step 21 CouchDB MapReduce PageRank**
**Goal**: GPU-indexed, cluster-aware, VLM-synthesised codebase context driving ACE LLM prompting,
Claude/Copilot wiring, Ollama web-search ingestion, and production-ready consolidation.

---

## Architecture Overview (Karpathy-style knowledge source wiring)

The Karpathy KB architecture diagram (`docs/karpathy-kb-architecture.mmd`) describes a 5-tier
retrieval funnel. The codebase intelligence pipeline extends that funnel with a GPU graph layer:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INGESTION (runs once / on-demand)                                          │
│                                                                             │
│  ts-morph scan (codebase-scanner-v2.ts)                                    │
│    → 20-metric AST + regex analysis per file                               │
│    → buildCodebaseGraphV2() → ScanNodeV2[]                                 │
│                                                                             │
│  Neo4j sync (codebase-neo4j-sync.ts)                                       │
│    → MERGE CodebaseFile (25 props: complexity, hasAuthGuard, routeType…)   │
│    → IMPORTS + DYNAMIC_IMPORTS edges                                        │
│                                                                             │
│  GPU K-means (codebase-cluster-detection.ts)                               │
│    → scroll codebase_chunks_768 embeddings                                 │
│    → kmeansWithCentroids() [LibTorch CUDA] → k=20 clusters                │
│    → SET gpuCluster on CodebaseFile nodes in Neo4j                         │
│                                                                             │
│  SOM topology (som-topology-pipeline.ts)                                   │
│    → trainSOM() [LibTorch CUDA] → BMU grid adjacency                       │
│    → SIMILAR_TOPOLOGY edges in Neo4j                                        │
│    → som_cluster payload field in codebase_chunks_768                      │
│                                                                             │
│  GPU PageRank (gpu-graph-analysis.ts)                                       │
│    → pageRankGPU() [LibTorch CUDA] → power-iteration on IMPORTS adj matrix │
│    → SET pageRankScore on CodebaseFile nodes in Neo4j                      │
│                                                                             │
│  Enrich-Qdrant (routes/api/codebase-index/enrich-qdrant)                  │
│    → reads all 25 Neo4j fields per file                                    │
│    → writes neo4j_* payload to codebase_chunks_768 Qdrant points          │
│    → NOW Qdrant has: neo4j_gpuCluster, neo4j_pageRankScore,               │
│       neo4j_hasAuthGuard, neo4j_routeType, neo4j_complexity…               │
└─────────────────────────────────────────────────────────────────────────────┘
                           ↓ payload enriched
┌─────────────────────────────────────────────────────────────────────────────┐
│  RETRIEVAL (per-query, warm path)                                           │
│                                                                             │
│  Qdrant dual-vector search (content 0.6 + signature 0.4)                  │
│    ✅ FIXED: dual-embedder.ts + codebase-context.ts hit 'codebase_chunks_768'│
│    ✅ FIXED: RankedChunk carries gpuCluster, pageRankScore, routeType,      │
│              hasAuthGuard; chunk headers annotated in ACE context string    │
│                                                                             │
│  Cross-encoder reranker (cross-encoder-reranker.ts)                        │
│    ← NOT yet wired into codebase retrieval path (Step 3)                   │
│    ✅ IS wired into rag/search, sse/chat, synthesis/generate                │
│                                                                             │
│  ACE context assembler (ace/context-assembler.ts)                          │
│    → fetchCodebaseContext() → searchCodebase() → dual-embedder ✅ FIXED     │
│    → ACEContext.codebaseContext → LLM system prompt                        │
│                                                                             │
│  Analytics feedback loop (NEW — DONE):                                     │
│    chunk_hit_log ← records every ACE/KAG/DAG/RAG hit                       │
│    Redis hot-query ring ← records every search + 64-dim sketch             │
│    qlora_examples ← mines top rerank + self-eval pairs for QLoRA training  │
│    predictive_todos ← Gemma4 gap analysis on search variance               │
└─────────────────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  SYNTHESIS (LLM generation)                                                 │
│                                                                             │
│  synthesis/generate  — Gemma4-legal, ACE context, cross-encoder reranked  │
│  sse/chat            — streaming, graph-informed retrieval, reranked        │
│  rag/search          — feature-flag reranker, cluster-unaware              │
│                                                                             │
│  VLM synthesis of cluster summaries  ← NOT YET BUILT                      │
│  Cluster-to-narrative ACE prompt     ← NOT YET BUILT                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Gap Audit — RED / AMBER / GREEN

### RED — Broken paths (silent failures today)

| Gap | File(s) | Impact |
|-----|---------|--------|
| **No reranker on codebase results** | `ace/context-assembler.ts:fetchCodebaseContext` | Codebase context injected into ACE with only cosine score filtering (≥0.5), no Gemma4 cross-encoder precision pass |
| **Web fallback not ingested** | `synthesis/generate`, `sse/chat` | Reranker triggers web search on low-score queries but nobody dispatches `document.embed` to RabbitMQ — web results used once then discarded |

### AMBER — Partially wired (works, but missing a stage)

| Gap | Status | What's Missing |
|-----|--------|----------------|
| **Cluster-aware retrieval** | Clusters exist in Qdrant payload | No retrieval path filters or scores by `neo4j_gpuCluster` — same cluster members aren't boosted together |
| **PageRank-weighted ranking** | pageRankScore in Qdrant payload | No retrieval path boosts high-pageRank chunks — central files (auth middleware, db client) don't surface preferentially |
| **MCP codebase:search** | Returns neo4j fields from payload | But codebase_chunks_768 payloads are only populated AFTER enrich-qdrant runs; no auto-trigger |
| **Synthesis route + codebase** | synthesis/generate calls ACE | `enableCodebaseContext` is NOT passed in the default synthesis body schema — codebase context off by default |
| **SOM cluster → SIMILAR_TOPOLOGY** | som-topology-pipeline writes edges | But nothing reads SIMILAR_TOPOLOGY for retrieval expansion — graph neighbor lookup uses only IMPORTS |
| **VLM for code** | Gemma4 VLM wired for evidence/images | No code-specific synthesis path ("summarise cluster 7 — what is this group of files responsible for?") |

### GREEN — Fully wired and passing

| Component | Status |
|-----------|--------|
| ts-morph scanner v2 (20 metrics) | PRODUCTION — 1335 nodes, 28s, 0 errors |
| Neo4j MERGE with 25 properties | PRODUCTION — all scanner fields persisted |
| GPU k-means clustering (k=20) | PRODUCTION — 3.5s on RTX 3060 Ti |
| SOM topology (trainSOM) | PRODUCTION — SIMILAR_TOPOLOGY edges written |
| GPU PageRank (pageRankGPU) | PRODUCTION — 1.1s audit pass |
| Enrich-Qdrant bridge | PRODUCTION — neo4j_* written to codebase_chunks_768 |
| **Collection name fixed** (Step 1) | DONE — `codebase_chunks` → `codebase_chunks_768` in dual-embedder, codebase-context, error-brain |
| **neo4j_ fields in retrieval** (Step 2) | DONE — `RankedChunk` extended; `rerankChunks()` reads `som_cluster`, `neo4j_gpuCluster`, `pagerank_score`, `neo4j_pageRankScore`, `neo4j_routeType`, `neo4j_hasAuthGuard`; `fromRankedChunk()` maps to `somCluster`/`authorityScore`; chunk headers annotated with `type:`/`cluster:`/`rank:`/`auth-guarded` |
| Faceted tags API (GET/DELETE) | PRODUCTION — aggregates tags/kinds/clusters/auditFlags |
| Cross-encoder reranker | PRODUCTION — wired in rag/search, sse/chat, synthesis/generate |
| MCP cluster_members tool | PRODUCTION — Neo4j query by gpuCluster, ordered by pageRankScore |
| VS Code pipeline tasks | PRODUCTION — Full Pipeline, Scan-only, Audit-only |
| pytorch-graph addon exports | PRODUCTION — 5 GPU functions verified on RTX 3060 Ti |
| **Search analytics pipeline** (Step 19) | DONE — `search-analytics.ts` (Redis hot-query ring, 64-dim sketch, chunk_hit_log); `GET /api/analytics/search-patterns` |
| **Query expander + did-you-mean** (Step 20A) | DONE — `query-expander.ts` (cosine on 64-dim sketches, 0.82 threshold, expansion terms) |
| **Predictive todos** (Step 20B) | DONE — `POST /api/analytics/generate-todos` async Gemma4 gap analysis + rule-based fallback; `predictive_todos` Postgres table; CouchDB persistence |
| **QLoRA distillation pipeline** | DONE — `POST /api/analytics/qlora-dataset` (top_rerank_score ≥ 0.80 + self_eval_score gating); Alpaca-format JSONL export; `qlora_examples` Postgres table |
| **VS Code analytics tasks** | DONE — 6 tasks: QLoRA dry-run, full distillation, generate todos, JSONL export, search patterns, parallel batch |

---

## Next Steps — Ordered by Impact

### Step 1 ✅ DONE — Fix the collection name (30 min, CRITICAL)

**Files to change**: `src/lib/server/indexer/dual-embedder.ts:20`,
`src/lib/server/retrieval/codebase-context.ts:59,176`,
`src/routes/api/error-brain/diagnose/+server.ts:188`

Change `'codebase_chunks'` → `'codebase_chunks_768'` in all three.

This single fix restores the entire ACE → LLM codebase context path. Without it, every
query that should be grounded in indexed code gets empty context silently.

```typescript
// dual-embedder.ts line 20
- const QDRANT_COLLECTION = 'codebase_chunks';
+ const QDRANT_COLLECTION = 'codebase_chunks_768';
```

---

### Step 2 ✅ DONE — Surface neo4j_ enriched fields in codebase retrieval (2 hrs)

**File**: `src/lib/server/retrieval/codebase-context.ts`

After fixing the collection name, update the search result mapping to read and return the
`neo4j_*` payload fields so callers can rank, filter, and surface them in the LLM prompt:

```typescript
return results
  .filter((r) => r.score >= 0.5)
  .map((r) => ({
    filePath:      String(r.chunk.path ?? r.chunk.relativePath ?? 'unknown'),
    content:       String(r.chunk.content ?? ''),
    score:         r.score,
    lineStart:     typeof r.chunk.lineStart === 'number' ? r.chunk.lineStart : undefined,
    lineEnd:       typeof r.chunk.lineEnd  === 'number' ? r.chunk.lineEnd   : undefined,
    // ── new: neo4j enrichment ─────────────────────────────────────────
    gpuCluster:    r.chunk.neo4j_gpuCluster    ?? null,
    pageRankScore: r.chunk.neo4j_pageRankScore ?? null,
    routeType:     r.chunk.neo4j_routeType     ?? null,
    hasAuthGuard:  r.chunk.neo4j_hasAuthGuard  ?? null,
    complexity:    r.chunk.neo4j_complexity    ?? null,
  }));
```

Then in `ace/context-assembler.ts` line ~695, include `pageRankScore` and `gpuCluster` in the
ACE prompt block so the LLM knows these are high-centrality files:

```typescript
const codeLines = context.codebaseContext
  .slice(0, limits.codebaseContextCount)
  .map((c) => {
    const meta = [
      c.routeType ? `type:${c.routeType}` : '',
      c.gpuCluster != null ? `cluster:${c.gpuCluster}` : '',
      c.pageRankScore != null ? `rank:${c.pageRankScore.toFixed(2)}` : '',
      c.hasAuthGuard ? 'auth-guarded' : '',
    ].filter(Boolean).join(' ');
    return `// ${c.filePath}${meta ? ` [${meta}]` : ''}\n${c.content}`;
  })
  .join('\n\n---\n\n');
```

---

### Step 3 — Wire cross-encoder into codebase retrieval (1 hr)

**File**: `src/lib/server/ace/context-assembler.ts` (inside `fetchCodebaseContext`)

After the `searchCodebase` call, add the same reranker pattern used in `sse/chat`:

```typescript
import { rerankWithGemma4, type RerankCandidate } from '$lib/server/retrieval/cross-encoder-reranker.js';

async function fetchCodebaseContext(query: string, userId?: string) {
  const results = await searchCodebase(query, { limit: 20, contentWeight: 0.6, signatureWeight: 0.4 });
  if (!results.length) return null;

  if (results.length > 1) {
    const candidates: RerankCandidate[] = results.map((r, i) => ({
      documentId:     String(r.chunk.path ?? `code-${i}`),
      content:        String(r.chunk.content ?? ''),
      retrievalScore: r.score,
      ...r.chunk,
    }));
    const { results: reranked } = await rerankWithGemma4(query, candidates, {
      topN: 20, returnTopK: 5, noFallback: true, userId,
    });
    if (reranked.length > 0) {
      // Merge rerank scores back
      const scoreMap = new Map(reranked.map(r => [r.doc.documentId, r.rerankScore]));
      return results
        .map(r => ({ ...r, score: scoreMap.get(String(r.chunk.path ?? '')) ?? r.score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .filter(r => r.score >= 0.45)
        .map(r => ({ filePath: …, content: …, score: r.score, … }));
    }
  }
  return results.slice(0, 5).filter(r => r.score >= 0.5).map(r => ({ … }));
}
```

`noFallback: true` prevents web search on code queries (web results aren't code).

---

### Step 4 — Cluster-aware retrieval boost (2 hrs)

**File**: `src/lib/server/retrieval/codebase-context.ts` — new helper

Add a `searchCodebaseByCluster(clusterId, query)` function that:
1. Issues a Qdrant scroll with `filter: { must: [{ key: 'neo4j_gpuCluster', match: { value: clusterId } }] }`
2. Sorts scrolled results by `neo4j_pageRankScore DESC`
3. Optionally reranks against the query

Also add a `boost by same cluster` post-processing step in the main search path: after getting
top-K results, identify which cluster the highest-scoring result belongs to, then add up to 2
same-cluster neighbours from a second Qdrant call.

---

### Step 5 — VLM cluster-to-narrative synthesis (3 hrs)

**New file**: `src/routes/api/codebase-index/cluster-summary/+server.ts`

```
POST /api/codebase-index/cluster-summary
Body: { clusterId: number, force?: boolean }

Steps:
  1. Qdrant scroll codebase_chunks_768 filtered by neo4j_gpuCluster = clusterId
  2. Sort by neo4j_pageRankScore DESC, take top 10 chunks
  3. Feed to Gemma4 synthesis:
     "You are a code architect. The following files form cluster {clusterId}.
      Analyse their purpose, dependencies, and patterns.
      Output: { summary, purpose, patterns[], keyFiles[], warnings[] }"
  4. Cache result in Redis (key: cluster-summary:{clusterId}, TTL 6h)
  5. Return { clusterId, summary, purpose, patterns, keyFiles, warnings, generatedAt }
```

This powers the "What does cluster 7 do?" answer in the codebase viewer and in Claude/Copilot
context enrichment.

---

### Step 6 — Wire cluster summaries into ACE prompting (1 hr)

**File**: `src/lib/server/ace/context-assembler.ts`

In `assembleACEContext`, after `fetchCodebaseContext` returns:

```typescript
// If codebase context has results, fetch the cluster summary for the top cluster
if (enableCodebaseContext && codebaseContext?.length) {
  const topCluster = codebaseContext[0]?.gpuCluster;
  if (topCluster != null) {
    const summary = await fetch(
      `/api/codebase-index/cluster-summary`, { method: 'POST', body: JSON.stringify({ clusterId: topCluster }) }
    ).then(r => r.ok ? r.json() : null).catch(() => null);
    if (summary?.summary) {
      // Prepend cluster narrative before individual file chunks
      aceCodebasePrefix = `// CLUSTER ${topCluster}: ${summary.purpose}\n// ${summary.summary}\n\n`;
    }
  }
}
```

---

### Step 7 — Web-search-to-Qdrant ingestion loop (1 hr)

**Files**: `synthesis/generate/+server.ts`, `sse/chat/+server.ts`

After the reranker runs and `webFallbackUsed === true`, dispatch the web results to the
`document.embed` RabbitMQ queue so they survive in the knowledge base:

```typescript
if (rerankMeta?.webFallbackUsed && rabbitmq) {
  const webDocs = reranked
    .filter((r) => (r.doc as Record<string, unknown>)['_webResult'])
    .map((r) => ({
      url:     (r.doc as Record<string, unknown>)['url'] as string,
      title:   (r.doc as Record<string, unknown>)['title'] as string,
      content: r.doc.content,
    }));
  if (webDocs.length > 0) {
    dispatchOrExecuteInline('document.embed', { docs: webDocs, collection: 'knowledge_base' }, rabbitmq)
      .catch(() => {}); // fire-and-forget
  }
}
```

---

### Step 8 — Claude / Copilot MCP bridge (3 hrs)

**New file**: `src/mcp/bridge/claude-codebase-context.ts`

Expose a `codebase:explain_cluster` MCP tool that:
1. Accepts `{ clusterId?, query, maxFiles? }`
2. If `query` given: calls Qdrant search on codebase_chunks_768 with neo4j field scoring
3. If `clusterId` given: fetches cluster summary (Step 5)
4. Returns structured JSON Claude/Copilot can use as context in their system prompts

Add to the FastMCP server alongside existing 9 tools. This is the Claude Code integration point —
when a Claude Code session asks "how does auth work?", the MCP tool returns the 5 highest-pageRank
auth-cluster chunks + cluster narrative without the user having to paste code manually.

---

### Step 9 — Enable `enableCodebaseContext` in synthesis by default (30 min)

**File**: `src/routes/api/synthesis/generate/+server.ts`

Currently `enableCodebaseContext` is only set when explicitly passed in the request body.
Add it as a default-true option when the synthesis query looks code-related:

```typescript
const enableCodebaseContext =
  parsedBody.enableCodebaseContext ??
  /\b(function|class|route|component|schema|hook|store|import|api|endpoint)\b/i.test(query);
```

---

### Step 10 — Ollama codebase indexing feedback loop (2 hrs)

**File**: `src/routes/api/codebase-index/graph-sync/+server.ts`

After graph-sync completes, automatically trigger enrich-qdrant in the background so the
Qdrant payloads are always in sync with the latest Neo4j scan:

```typescript
// At end of graph-sync handler, after Neo4j merge:
fetch('/api/codebase-index/enrich-qdrant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: event.request.headers.get('Cookie') ?? '' },
  body: JSON.stringify({ dryRun: false, batchSize: 50 }),
}).catch(() => {}); // background, fire-and-forget
```

---

## Distance-to-Goal Summary

```
GPU codebase index → VLM synthesis → ACE LLM prompting → Claude/Copilot → production

[DONE] GPU index: scanner + Neo4j + k-means + SOM + PageRank + enrich-qdrant
[DONE] Qdrant has neo4j_* enriched payload fields after enrich-qdrant run
[DONE] MCP tools: codebase:search (enriched) + codebase:cluster_members
[DONE] Cross-encoder reranker on rag/search, sse/chat, synthesis/generate
[DONE — Step 1]  Fix collection name: 'codebase_chunks' → 'codebase_chunks_768' (3 files)
[DONE — Step 2]  Return neo4j fields from codebase retrieval, surface in ACE prompt (4 fields: gpuCluster/pageRankScore/routeType/hasAuthGuard; chunk header annotations)
[DONE — analytics] search-analytics.ts + query-expander.ts + qlora-dataset + generate-todos + search-patterns + 6 VS Code analytics tasks
[Step 3 — 1hr]   Wire cross-encoder into codebase context fetch
[Step 4 — 2hrs]  Cluster-aware retrieval boost in codebase search
[Step 5 — 3hrs]  VLM cluster-to-narrative synthesis endpoint
[Step 6 — 1hr]   Feed cluster narrative into ACE assembler prefix
[Step 7 — 1hr]   Web-search results → document.embed RabbitMQ (ingestion loop)
[Step 8 — 3hrs]  Claude/Copilot MCP bridge (codebase:explain_cluster tool)
[Step 9 — 30min] Auto-enable codebase context for code-related synthesis queries
[Step 10 — 2hrs] graph-sync → auto-trigger enrich-qdrant (feedback loop)

Total: ~16 hrs of net implementation work
Production-ready estimate: Steps 1-3 in session 1 (~4 hrs) → first usable LLM-grounded
                           code answers. Steps 4-7 in session 2 (~7 hrs) → cluster-aware
                           synthesis. Steps 8-10 in session 3 (~5 hrs) → Claude/Copilot
                           integration + feedback loop.
```

---

## Knowledge Source Wiring (Karpathy model applied to this codebase)

The `karpathy-kb-architecture.mmd` diagram shows the 5-source funnel:
Web search → Wikipedia → Seed URLs → Local PDFs → Builder → `knowledge_base` Qdrant.

The codebase intelligence pipeline adds a **6th source tier** above that funnel:

```
codebase_chunks_768 (3140 files, 768-dim, dual-vector, neo4j_ enriched)
        ↓
  GPU clusters (k=20 LibTorch k-means)
        ↓
  SOM topology (SIMILAR_TOPOLOGY edges — spatial code neighbours)
        ↓
  GPU PageRank (central files: auth middleware, db client, router)
        ↓
  Cluster narrative (Gemma4 VLM synthesis → "cluster 7 = auth layer")
        ↓
  ACE codebaseContext[] → LLM system prompt prefix
        ↓
  Claude/Copilot MCP tool → external IDE context
```

Ranking in the retrieval order from `knowledge-source-evaluation.md` section 4:

1. Canonical local: glossary, statutes, precedents, internal KB
2. Curated official docs in `knowledge_base`
3. **Codebase cluster summaries** ← new tier, highest trust for code queries
4. **Codebase chunk search (codebase_chunks_768)** ← new tier, 3140 files
5. Curated repo docs + READMEs
6. Conceptual references (Karpathy notes)
7. Live web search + Wikipedia

For code-specific queries ("how does auth work", "which files handle Qdrant"), tiers 3-4 should
be the PRIMARY retrieval source, not the fallback.

---

## Karpathy Comparison — Key Steal

**Write cluster summaries at index time, not query time** (the compounding property):

```
graph-sync completes
  → enrich-qdrant (Step 10)
  → for each of 20 GPU clusters:
      scroll top-10 pageRank chunks
      → Gemma4 synthesise narrative
      → write to CouchDB cluster_summaries/{id}   ← durable, survives re-index
      → write slim to Redis (1h TTL) for fast reads
  → on re-index: PATCH CouchDB doc (merge new files, note moved files)
```

This gives you Karpathy's compounding property at GPU + graph precision scale that
his markdown-only approach cannot reach past ~100 sources.

---

## Advanced Next Steps — Semantic Search Extensions

### Step 11 — 4D Topological Search Across Multiple Clusters (4 hrs)

**What it is**: After the SOM runs, every chunk has a BMU position `(row, col)` on the SOM
grid in addition to its k-means `gpuCluster` and `pageRankScore`. Together these form a
**4-dimensional retrieval space** already captured in `UnifiedRetrievalResult` (`somCluster`
field, `retrieval.ts:116`):

```
Dimension 1: content score   — Qdrant cosine similarity (0–1)
Dimension 2: SOM grid row    — BMU row from trainSOM() bmu array
Dimension 3: SOM grid col    — BMU col from trainSOM() bmu array
Dimension 4: pageRankScore   — graph centrality (0–1, set by gpu-graph-analysis)
```

A query that returns results across **multiple k-means clusters** can use the SOM grid
distance to boost spatially adjacent results from different clusters — files that are
semantically close in embedding space but landed in different k-means partitions.

**New file**: `src/lib/server/retrieval/topological-search.ts`

```typescript
import { trainSOM, type SOMResult } from '$lib/server/gpu/pytorch-graph.js';
import { getRedis } from '$lib/server/redis.js';
import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

/** Grid coordinates from SOM result cache key: som:bmu:{collectionHash} */
interface BmuCoord { row: number; col: number; somCluster: number; pageRank: number; }

/**
 * Given a set of Qdrant results spanning multiple clusters, boost scores
 * for chunks that are spatially adjacent on the SOM grid.
 *
 * This promotes cross-cluster neighbours that are semantically close
 * (same SOM grid neighbourhood) even if they landed in different k-means
 * partitions — common for files that straddle two domains (e.g. auth+db).
 *
 * @param results  UnifiedRetrievalResult[] from Qdrant, already scored
 * @param gridW    SOM grid width (default 10)
 * @param gridH    SOM grid height (default 10)
 * @param radius   Manhattan distance threshold for adjacency boost (default 2)
 * @param boost    Score multiplier for adjacent tiles (default 1.15)
 */
export async function applyTopologicalBoost(
  results: UnifiedRetrievalResult[],
  gridW = 10,
  gridH = 10,
  radius = 2,
  boost = 1.15
): Promise<UnifiedRetrievalResult[]> {
  // Load cached BMU coords from Redis (written by som-topology-pipeline)
  const redis = getRedis();
  const idCoords = new Map<string, BmuCoord>();
  for (const r of results) {
    if (r.id && r.metadata?.['bmu_row'] != null) {
      idCoords.set(r.id, {
        row:       Number(r.metadata['bmu_row']),
        col:       Number(r.metadata['bmu_col']),
        somCluster: r.somCluster ?? -1,
        pageRank:  r.authorityScore ?? 0,
      });
    }
  }

  if (idCoords.size < 2) return results;  // not enough coords to boost

  // For each result, count how many other results are within radius on SOM grid
  return results.map((r) => {
    const coord = idCoords.get(r.id);
    if (!coord) return r;

    let adjacentCount = 0;
    for (const [otherId, other] of idCoords) {
      if (otherId === r.id) continue;
      const manhattanDist = Math.abs(coord.row - other.row) + Math.abs(coord.col - other.col);
      if (manhattanDist <= radius) adjacentCount++;
    }

    // Boost score proportionally to neighbourhood density
    const topologicalBoost = adjacentCount > 0 ? boost ** Math.min(adjacentCount, 3) : 1;
    const pageRankBoost     = 1 + coord.pageRank * 0.2;  // high-centrality files score higher

    return {
      ...r,
      score: Math.min(1, r.score * topologicalBoost * pageRankBoost),
      explain: {
        ...r.explain,
        pageRank: coord.pageRank,
      },
    };
  });
}
```

**Wire it into `codebase-context.ts`** after the cross-encoder pass (Step 3):
```typescript
if (reranked.length > 0) {
  const boosted = await applyTopologicalBoost(reranked, 10, 10, 2, 1.15);
  contextDocs = boosted.sort((a, b) => b.score - a.score).slice(0, MAX_CHUNKS);
}
```

**Type hook**: Add `bmu_row`, `bmu_col` to `metadata` when writing SOM results in
`som-topology-pipeline.ts` so the payload round-trips through Qdrant → `fromQdrantPoint()`
→ `UnifiedRetrievalResult.metadata` without a schema change.

---

### Step 12 — FastMCP HTTP Transport for Local LLM Calls (2 hrs)

**Context**: The MCP server (`src/mcp/server.ts`) runs as stdio FastMCP, which means only
Claude Desktop / Claude Code CLI can call it. To allow **local Ollama / TRT-LLM / your own
API routes** to call MCP tools directly, expose it over HTTP.

FastMCP supports `streamable_http` transport — add a second entrypoint:

**New file**: `src/mcp/http-server.ts`

```typescript
import { mcp } from './server.js';  // the same FastMCP instance

// Expose via HTTP on port 3099 (separate from SvelteKit :5173)
// FastMCP streamable_http transport handles /mcp endpoint + SSE streaming
mcp.serve_http({ port: 3099, endpoint: '/mcp' });
```

**Or** expose MCP tools as plain SvelteKit API routes for internal calling:

**New file**: `src/routes/api/mcp/call/+server.ts`
```typescript
// POST /api/mcp/call
// Body: { tool: 'codebase:search', args: { query: '...', limit: 5 } }
// Returns: tool result JSON
// Auth: locals.user guard (internal only)
```

This lets synthesis/generate and sse/chat call MCP tools at runtime without spawning a
subprocess — the same tool registry powering Claude Desktop is available to the local
inference pipeline.

**Why**: When a query arrives at `synthesis/generate`, rather than manually assembling
codebase context, the handler calls `POST /api/mcp/call` with `codebase:explain_cluster`
and gets back the pre-synthesised cluster narrative in one hop.

---

### Step 13 — JSONB Serialization Buffers for Claude Code Ingestion (2 hrs)

**Context**: Claude Code MCP tools return JSON. But for large codebase context (cluster
summaries + top-K chunks + graph metadata), serialising to JSON on every call is slow and
burns context tokens. **JSONB buffers** pre-serialise `UnifiedRetrievalResult[]` as
Postgres JSONB rows keyed by a content-addressed hash, so Claude Code reads a cached,
pre-structured buffer instead of re-running retrieval.

**New Postgres table** (add to `schema-postgres.ts`):
```sql
CREATE TABLE IF NOT EXISTS context_buffers (
  key         TEXT PRIMARY KEY,       -- SHA-256(query + caseId + clusterId)
  buffer      JSONB NOT NULL,         -- UnifiedRetrievalResult[]
  kind        TEXT NOT NULL,          -- 'codebase' | 'legal' | 'cluster_summary'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  hit_count   INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS context_buffers_expires ON context_buffers (expires_at);
```

**New file**: `src/lib/server/retrieval/context-buffer.ts`
```typescript
import { createHash } from 'crypto';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import type { UnifiedRetrievalResult } from './retrieval.js';

const TTL_HOURS = 6;

export async function getOrBuildBuffer(
  key: string,
  build: () => Promise<UnifiedRetrievalResult[]>
): Promise<UnifiedRetrievalResult[]> {
  // Check Postgres JSONB buffer
  const row = await db.execute(
    sql`SELECT buffer FROM context_buffers
        WHERE key = ${key} AND expires_at > NOW()
        LIMIT 1`
  );
  if (row.rows[0]) {
    // Increment hit count async
    db.execute(sql`UPDATE context_buffers SET hit_count = hit_count + 1 WHERE key = ${key}`)
      .catch(() => {});
    return row.rows[0].buffer as UnifiedRetrievalResult[];
  }

  // Build and store
  const results = await build();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString();
  await db.execute(
    sql`INSERT INTO context_buffers (key, buffer, kind, expires_at)
        VALUES (${key}, ${JSON.stringify(results)}::jsonb, 'codebase', ${expiresAt}::timestamptz)
        ON CONFLICT (key) DO UPDATE SET buffer = EXCLUDED.buffer, expires_at = EXCLUDED.expires_at`
  );
  return results;
}

export function bufferKey(parts: Record<string, string>): string {
  return createHash('sha256')
    .update(Object.entries(parts).sort().map(([k, v]) => `${k}:${v}`).join('|'))
    .digest('hex')
    .slice(0, 32);
}
```

**MCP tool**: Add `codebase:get_buffer` to `src/mcp/server.ts` — Claude Code calls it with
`{ key }` to pull a pre-indexed buffer. The tool also accepts `{ query, clusterId }` to
trigger a build if the key is missing.

**Claude Code CLAUDE.md hook**: Document the pattern so Claude Code sessions know to call
`codebase:get_buffer` before `codebase:search` — the buffer always wins on cache hit.

---

### Step 14 — KV Prompt Caching for Cluster Summaries + ACE Context (2 hrs)

**Two separate cache mechanisms — both apply:**

#### A. Ollama prefix KV cache (already partially active)
Ollama with Flash Attention + Q8_0 KV enabled reuses the query-prefix KV states across
sequential document calls. The cross-encoder reranker already exploits this (sequential
Gemma4 calls, shared `"Query: {q}\n\nDocument:\n"` prefix). For cluster summaries:

```typescript
// In cluster-summary generation: keep_alive: '30m' so the model stays loaded
// across all 20 cluster summary generations in a single pipeline run
body: JSON.stringify({
  model: RERANK_MODEL,
  prompt: CLUSTER_SUMMARY_PREFIX + clusterChunks.join('\n---\n') + CLUSTER_SUMMARY_SUFFIX,
  format: 'json',
  stream: false,
  keep_alive: '30m',   // model hot for all 20 clusters
  options: { temperature: 0.1, num_predict: 512 },
})
```

Generate all 20 cluster summaries **in a single Ollama session** (sequential loop) to
maximise KV cache reuse on the shared summary instruction prefix.

#### B. Anthropic prompt cache for Claude Code MCP context

When the MCP server returns large codebase context blocks to Claude Code, mark them with
`cache_control: { type: 'ephemeral' }` so Anthropic's API caches the processed tokens:

**New file**: `src/mcp/cache-aware-response.ts`
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

/**
 * Build a cache-aware message for the MCP bridge (Step 8 / codebase:explain_cluster).
 * The large cluster summary block is marked as ephemeral — Anthropic caches it
 * for 5 minutes so repeated Claude Code calls within a session pay only the
 * cache-read cost (~10% of full token cost).
 *
 * Requires: ANTHROPIC_API_KEY in environment.
 */
export async function callClaudeWithCachedCodebaseContext(
  query: string,
  clusterSummary: string,
  chunks: string[]
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: clusterSummary,
          cache_control: { type: 'ephemeral' },  // cache the large cluster block
        },
        {
          type: 'text',
          // Individual chunks — NOT cached (vary per query)
          text: chunks.map((c, i) => `// Chunk ${i + 1}\n${c}`).join('\n\n---\n\n'),
        },
        {
          type: 'text',
          text: `\n\nQuery: ${query}`,
        },
      ],
    }],
  });
  return (response.content[0] as { text: string }).text;
}
```

**Cache hit rate**: Cluster summaries for a 3140-file codebase are typically 2,000–8,000
tokens. At 5-minute TTL, any two Claude Code requests in the same session for the same
cluster hit the cache. At ~10% cache-read cost, a 5,000-token cluster summary costs 500
tokens on cache hit vs 5,000 on cold. For a session with 10 code queries against the same
cluster: **10× cost reduction on the cluster context block**.

---

### Step 15 — Local TRT-LLM / Triton Reranker (3 hrs)

**Context**: The cross-encoder reranker (`cross-encoder-reranker.ts`) currently calls Ollama
`/api/generate` for pointwise scoring. On the RTX 3060 Ti, Ollama achieves ~15 tokens/sec for
Gemma4-legal. TensorRT-LLM (TRT-LLM) via Triton Inference Server can reach **50–75 tokens/sec**
for the same model at INT4/INT8 precision — a 3–5× speedup that cuts per-candidate scoring
latency from ~300ms to ~60–100ms.

**Triton is already configured** at `src/lib/server/config.ts:55`:
```typescript
tensorrt: {
  tritonUrl: process.env.TRITON_URL || 'http://localhost:8000',
  modelName: process.env.TENSORRT_MODEL_NAME || 'gemma_legal_tensorrt',
}
```

**Update `cross-encoder-reranker.ts`** to try Triton first:

```typescript
// ── Triton TRT-LLM scorer (fast path) ────────────────────────────────────
async function _scoreTRT(query: string, doc: RerankCandidate): Promise<number | null> {
  try {
    const tritonUrl = process.env.TRITON_URL ?? 'http://localhost:8000';
    const modelName = process.env.TENSORRT_MODEL_NAME ?? 'gemma_legal_tensorrt';
    const prompt = SCORE_PROMPT_PREFIX(query) + doc.content.slice(0, SCORE_MAX_CHARS) + SCORE_PROMPT_SUFFIX;

    const res = await fetch(`${tritonUrl}/v2/models/${modelName}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text_input: prompt,
        max_tokens: 24,
        bad_words: '',
        stop_words: '}',   // stop after closing brace
        stream: false,
      }),
      signal: AbortSignal.timeout(5_000),  // TRT is fast — 5s hard limit
    });

    if (!res.ok) return null;
    const body = fastJsonParse<{ text_output?: string }>(await res.text());
    const json = fastJsonParse<{ score?: number }>(body?.text_output ?? '{}');
    if (typeof json?.score === 'number' && isFinite(json.score)) {
      return Math.max(0, Math.min(1, json.score));
    }
    return null;
  } catch {
    return null;  // fall through to Ollama
  }
}

// In _scoreOne: try TRT first, fall back to Ollama
async function _scoreOne(query: string, doc: RerankCandidate): Promise<number> {
  const trtScore = await _scoreTRT(query, doc);
  if (trtScore !== null) return trtScore;
  // ... existing Ollama path ...
}
```

**Triton model deployment** (prerequisite — requires TRT engine from Colab notebook):
```bash
# Copy built TRT engine to Triton model repository
mkdir -p /opt/triton/model_repository/gemma_legal_tensorrt/1/
cp ~/gemma3_engine_flash/* /opt/triton/model_repository/gemma_legal_tensorrt/1/

# Start Triton (Docker)
docker run --gpus all -p 8000:8000 -p 8001:8001 -p 8002:8002 \
  -v /opt/triton/model_repository:/models \
  nvcr.io/nvidia/tritonserver:24.12-trtllm-python-py3 \
  tritonserver --model-repository=/models
```

**LiteRT** (Google's TFLite Runtime successor, April 2026) targets CPU inference via XNNPACK
with AVX2/SSE4.2 SIMD — the same instruction sets used by the `simdjson` addon already in
this codebase. When `isPytorchGpuAvailable()` returns `false` (dev machine without CUDA, CI,
or Triton down), LiteRT provides a deterministic CPU scoring path instead of passthrough 0.5.

**Add LiteRT as tier 3 CPU fallback** in `cross-encoder-reranker.ts`:

```typescript
import { isPytorchGpuAvailable } from '$lib/server/gpu/pytorch-graph.js';

// ── LiteRT CPU scorer (no-GPU fallback) ──────────────────────────────────
// Requires: static/litert/cross-encoder-int8.tflite (ms-marco-MiniLM-L-6-v2
// or equivalent, converted from HuggingFace → ONNX → TFLite INT8)
// npm: @tensorflow/tfjs-node (includes LiteRT + XNNPACK delegate)

let _liteRtSession: unknown = null;

async function _getLiteRtSession() {
  if (_liteRtSession) return _liteRtSession;
  try {
    // Dynamic import — only loads when GPU unavailable (avoids cold-start cost)
    const tflite = await import('@tensorflow/tfjs-tflite');
    _liteRtSession = await tflite.loadTFLiteModel(
      'static/litert/cross-encoder-int8.tflite'
    );
    console.log('[reranker] LiteRT CPU session loaded (XNNPACK SIMD)');
    return _liteRtSession;
  } catch {
    return null;
  }
}

async function _scoreLiteRt(query: string, doc: RerankCandidate): Promise<number | null> {
  if (isPytorchGpuAvailable()) return null;  // GPU available — skip LiteRT entirely
  try {
    const session = await _getLiteRtSession() as {
      predict: (inputs: Record<string, unknown>) => Record<string, { dataSync: () => Float32Array }>;
    } | null;
    if (!session) return null;

    // Tokenize query + doc pair (BPE — reuse existing embedding tokenizer)
    const { tokenize } = await import('$lib/server/embeddings/tokenizer.js');
    const { inputIds, attentionMask } = tokenize(
      `[CLS] ${query} [SEP] ${doc.content.slice(0, SCORE_MAX_CHARS)} [SEP]`,
      { maxLength: 256, padding: true }
    );

    const output = session.predict({
      input_ids:      inputIds,
      attention_mask: attentionMask,
    });

    // Cross-encoder outputs logit — apply sigmoid to get 0–1 score
    const logit = output['logits'].dataSync()[0];
    return 1 / (1 + Math.exp(-logit));
  } catch {
    return null;
  }
}
```

**Update `_scoreOne` fallback chain**:

```typescript
async function _scoreOne(query: string, doc: RerankCandidate): Promise<number> {
  // Tier 1: Triton TRT-LLM (GPU, ~60-100ms)
  const trtScore = await _scoreTRT(query, doc);
  if (trtScore !== null) return trtScore;

  // Tier 2: Ollama Gemma4 (GPU via CUDA, ~300ms)
  if (isPytorchGpuAvailable()) {
    return _scoreOllama(query, doc);  // existing _scoreOne body, renamed
  }

  // Tier 3: LiteRT CPU XNNPACK (~500-2000ms, no GPU required)
  const liteRtScore = await _scoreLiteRt(query, doc);
  if (liteRtScore !== null) return liteRtScore;

  // Tier 4: passthrough neutral score
  return 0.5;
}
```

**Model file**: Download `ms-marco-MiniLM-L-6-v2` cross-encoder from HuggingFace, convert to
TFLite INT8 via the LiteRT converter, place at `static/litert/cross-encoder-int8.tflite`.
The model is ~23MB at INT8 — small enough to commit to git (under the 10MB pre-commit hook
limit only applies to `.wasm` binaries; `.tflite` is a different extension).

```bash
# Convert (Python, run once)
pip install ai-edge-litert
python -c "
import ai_edge_litert.converter as converter
c = converter.TFLiteConverter.from_saved_model('cross-encoder-saved-model')
c.optimizations = ['DEFAULT']
c.target_spec.supported_types = ['INT8']
tflite_model = c.convert()
open('static/litert/cross-encoder-int8.tflite', 'wb').write(tflite_model)
"
```

**Full fallback chain**: Triton TRT-LLM (GPU, 5s timeout) → Ollama Gemma4 (GPU, 30s timeout)
→ LiteRT XNNPACK (CPU, no timeout) → passthrough 0.5

**VS Code task** — add "Triton: Health Check" to tasks.json:
```json
{
  "label": "Triton: Health Check + Reranker Benchmark",
  "type": "shell",
  "command": "curl -s http://localhost:8000/v2/health/ready && echo 'Triton READY' || echo 'Triton DOWN — using Ollama fallback'"
}
```

---

## Updated Pipeline Architecture (Steps 1–15)

```
INGESTION (graph-sync → enrich-qdrant → cluster-summaries [CouchDB, durable])
                  ↓
RETRIEVAL
  Qdrant dual-vector (codebase_chunks_768) ← Step 1: collection name fixed
    ↓
  fromQdrantPoint() → UnifiedRetrievalResult (retrieval.ts)
    ↓
  Graph expansion (Neo4j IMPORTS + SIMILAR_TOPOLOGY neighbours)
    ↓
  applyTopologicalBoost() ← Step 11: 4D SOM grid boost
    ↓
  Cross-encoder reranker (Triton TRT-LLM → Ollama fallback) ← Step 15
    L0 result-set cache (Redis 1h) + L1 per-score cache (Redis 24h)
    ↓
  Context buffer read/write (Postgres JSONB) ← Step 13
                  ↓
SYNTHESIS
  ACE context assembler
    → cluster summary prefix (CouchDB durable, Redis 1h slim) ← Steps 5/6 + Karpathy steal
    → neo4j enriched chunk fields ← Step 2
    → KV prompt cache via Anthropic cache_control ephemeral ← Step 14
    ↓
  Gemma4-legal / Triton synthesis
                  ↓
MCP BRIDGE
  FastMCP HTTP transport (:3099) ← Step 12
  codebase:search + codebase:cluster_members + codebase:explain_cluster ← Step 8
  codebase:get_buffer (JSONB, content-addressed) ← Step 13
  → Claude Code sessions + Copilot + local Ollama agents
                  ↓
WEB INGESTION LOOP
  reranker web fallback → dispatchOrExecuteInline(document.embed) ← Step 7
  → knowledge_base Qdrant ← compounding Karpathy property
```

---

## Revised Distance-to-Goal

```
[DONE — Sessions 1–3]  Steps 1–10:  ~16 hrs — LLM-grounded code answers + cluster synthesis + MCP bridge
[Session 4 — ~4 hrs]  Step 11: 4D topological boost (applyTopologicalBoost + bmu coords in SOM pipeline)
[Session 4 — ~2 hrs]  Step 12: FastMCP HTTP transport + /api/mcp/call internal route
[Session 4 — ~2 hrs]  Step 13: JSONB context buffers (Postgres table + context-buffer.ts + MCP tool)
[Session 5 — ~2 hrs]  Step 14: KV prompt caching (Ollama keep_alive loop + Anthropic cache_control)
[Session 5 — ~3 hrs]  Step 15: Triton TRT-LLM reranker fast path (5s timeout → Ollama fallback)
[Session 5 — ~1 hr]   Karpathy steal: CouchDB durable cluster summaries at index time

Total new work: ~14 hrs across 2 sessions
Production-ready full pipeline: ~30 hrs total from where we started
```

---

## Enrich-Qdrant Internals — Dual-Source Payload Architecture

`src/routes/api/codebase-index/enrich-qdrant/+server.ts` is the bridge that writes Neo4j
graph analysis results back to Qdrant so retrieval can use them. Understanding its internals
is essential because the pipeline has **two separate GPU analysis sources** writing to
overlapping but differently-named payload fields.

---

### Two Parallel GPU Pipelines → One Qdrant Payload

The enrich-qdrant endpoint queries Neo4j for every `CodebaseFile` node and reads fields from
**two distinct GPU analysis runs**:

```
LOCAL GPU PIPELINE                       COLAB GPU PIPELINE
─────────────────                        ─────────────────────────────────
codebase-cluster-detection.ts            Google Colab GPU notebook
  kmeansWithCentroids() [LibTorch]         Notebook Cell 5: PageRank (GPU)
  → SET f.gpuCluster = k                   → SET f.pagerank_score = r
                                           Notebook Cell 10: SOM BMU index
gpu-graph-analysis.ts                      → SET f.som_cluster = bmu
  pageRankGPU() [LibTorch]
  → SET f.pageRankScore = r  (capital S)
```

These are **different Neo4j property names** — note the casing:

| Source | Neo4j property | Qdrant bare key | Qdrant prefixed key | Authoritative? |
|--------|---------------|-----------------|---------------------|----------------|
| Local GPU (k-means) | `f.gpuCluster` | `gpuCluster` | `neo4j_gpuCluster` | Tier 1 (always present after cluster-detect) |
| Local GPU (PageRank) | `f.pageRankScore` | — | `neo4j_pageRankScore` | Tier 1 (always present after gpu-audit) |
| **Colab GPU (PageRank)** | `f.pagerank_score` | **`pagerank_score`** | — | **Tier 2: authoritative if Colab ran** |
| **Colab GPU (SOM BMU)** | `f.som_cluster` | **`som_cluster`** | — | **Tier 2: authoritative if Colab ran** |

The log message reveals the intent:
```
[enrich-qdrant] Queried 1335 Neo4j nodes —
  pagerank_score=0 som_cluster=0 (run Colab notebook if 0)
```

If `pagerank_score=0` and `som_cluster=0` — **the Colab notebook has not run yet**. The local
GPU pipeline values (`neo4j_pageRankScore`, `neo4j_gpuCluster`) are present but the
higher-precision Colab values are missing.

---

### Bare Keys vs `neo4j_*` Prefix — Why Both Exist

The endpoint writes **25 fields** in two naming styles:

```typescript
payload: {
  // ── neo4j_* prefixed fields (21 total) ───────────────────────────
  // Used by: Qdrant filter queries, MCP tools, direct payload inspection
  neo4j_complexity:          number | null,
  neo4j_hasAuthGuard:        boolean | null,
  neo4j_hasZodValidation:    boolean | null,
  neo4j_hasCachePattern:     boolean | null,
  neo4j_isSseEndpoint:       boolean | null,
  neo4j_isWorkerBoundary:    boolean | null,
  neo4j_hasErrorHandling:    boolean | null,
  neo4j_isRouteFile:         boolean | null,
  neo4j_routeType:           string | null,
  neo4j_symbolCount:         number | null,
  neo4j_maxCallDepth:        number | null,
  neo4j_dynamicImportTargets: string[],
  neo4j_callees:             string[],
  neo4j_gpuCluster:          number | null,    // local k-means
  neo4j_pageRankScore:       number | null,    // local PageRank
  neo4j_communityId:         number | null,
  neo4j_isSvelteComponent:   boolean | null,
  neo4j_hasSvelte4Props:     boolean | null,
  neo4j_hasSvelte4Reactive:  boolean | null,
  neo4j_hasSvelte4Events:    boolean | null,
  neo4j_hasRunesInPlainTs:   boolean | null,
  neo4j_enrichedAt:          string,           // ISO timestamp

  // ── bare keys (4 total) ───────────────────────────────────────────
  // Used by: contextual-tools.ts, retrieval.ts fromQdrantPoint(), SOM pipeline
  gpuCluster:    number | null,    // mirrors neo4j_gpuCluster (k-means)
  som_cluster:   number | null,    // Colab Cell 10 BMU index (authoritative)
  pagerank_score: number | null,   // Colab GPU PageRank (authoritative)
}
```

**Why the duplication?**

- `neo4j_*` prefixed fields: used for **Qdrant filter queries** (`{ key: 'neo4j_gpuCluster', match: { value: 7 } }`) because the prefix makes it clear they came from Neo4j and prevents collision with other payload keys
- Bare keys: `contextual-tools.ts` and `retrieval.ts:fromQdrantPoint()` read `som_cluster` and `pagerank_score` directly without the prefix — these are the **authoritative Colab values** that should rank higher in scoring
- `gpuCluster` bare key: fallback for when `som_cluster` is null (Colab not run) — `fromQdrantPoint()` reads both: `som_cluster ?? neo4j_gpuCluster`

**Reading priority in retrieval** (`retrieval.ts:174`):
```typescript
somCluster: typeof p['som_cluster'] === 'number'
  ? p['som_cluster']           // Colab BMU (preferred)
  : typeof p['neo4j_gpuCluster'] === 'number'
    ? p['neo4j_gpuCluster']    // Local k-means (fallback)
    : null,
```

---

### Job Status Counters — Diagnosing Colab Run State

Every enrich-qdrant job exposes two diagnostic counters in the GET poll response:

```typescript
// GET /api/codebase-index/enrich-qdrant?jobId=<id>
{
  jobId: "...",
  status: "done",
  nodesQueried: 1335,
  qdrantUpdated: 1335,
  qdrantSkipped: 0,

  // ── Colab run diagnostics ──────────────────────────────────────
  nodesWithPageRankColab: 0,    // f.pagerank_score non-null in Neo4j
  nodesWithSomCluster: 0,       // f.som_cluster non-null in Neo4j
  // ^ Both 0 → Colab notebook has NOT run.
  //   pagerank_score + som_cluster fields in Qdrant will be null.
  //   Only local GPU values (neo4j_pageRankScore, neo4j_gpuCluster) are active.
}
```

**Interpretation table:**

| `nodesWithPageRankColab` | `nodesWithSomCluster` | State |
|--------------------------|----------------------|-------|
| 0 | 0 | Colab not run — only local GPU pipeline active |
| > 0 | 0 | Colab PageRank ran but SOM Cell 10 didn't — partial |
| > 0 | > 0 | Full Colab pipeline ran — all authoritative fields present |
| 0 | > 0 | Unusual — SOM without PageRank; likely partial notebook run |

When both counters are 0, the `pagerank_score` and `som_cluster` bare keys in Qdrant are
`null`, and the topological search (Step 11) falls back to local k-means cluster IDs only.

---

### Path Derivation Algorithm

Neo4j stores **absolute paths** (e.g. `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\redis.ts`).
Qdrant stores **relative paths from the `src/` root** (e.g. `lib/server/redis.ts`).

The derivation strips the prefix in two passes:

```typescript
const srcRoot    = 'sveltekit-frontend/src/';   // primary
const fallbackRoot = 'src/';                     // WSL/Linux paths

// 1. Normalize backslashes → forward slashes
const norm = fp.replace(/\\/g, '/');

// 2. Try stripping from sveltekit-frontend/src/
const idx = norm.indexOf(srcRoot);
const relativePath = idx >= 0
  ? norm.slice(idx + srcRoot.length)
  // 3. Try stripping from src/
  : norm.includes(fallbackRoot)
    ? norm.slice(norm.indexOf(fallbackRoot) + fallbackRoot.length)
    // 4. Last resort: use raw path (will likely miss Qdrant filter match)
    : fp;
```

**Why this matters for retrieval**: if `relativePath` doesn't match what was written into the
Qdrant payload at index time, the `filter: { must: [{ key: 'relativePath', match: { value: relativePath } }] }`
call will match 0 points and that file's payload silently stays un-enriched. This is the
primary failure mode when Neo4j paths come from a different OS or mount point than the
indexer used.

**Debugging mismatches**: Query Qdrant for a known file and compare its `relativePath` payload
field against what `enrich-qdrant` would derive from Neo4j's `filePath`:

```bash
# Check what Qdrant has
curl -s http://localhost:6333/collections/codebase_chunks_768/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"filter":{"must":[{"key":"relativePath","match":{"value":"lib/server/redis.ts"}}]},"limit":1,"with_payload":true}' \
  | jq '.result.points[0].payload.relativePath'
```

---

### Batch Update Mechanics

The enrichment writes to Qdrant via the **set payload** REST endpoint (not upsert) — it updates
only the specified payload fields on existing points, leaving all other fields (including
`content`, `vector`, `tags`, `chunk_text`) intact.

```
POST /collections/codebase_chunks_768/points/payload
{
  "payload": { neo4j_* fields + bare keys },
  "filter": { "must": [{ "key": "relativePath", "match": { "value": "..." } }] }
}
```

**Key mechanics:**
- `Promise.all()` within each batch (default 100, max 500) — parallel writes per batch
- One Qdrant request per Neo4j node (by `relativePath`)
- A single Neo4j file typically maps to **multiple Qdrant points** (one per chunk) — the filter by `relativePath` updates ALL chunks for that file simultaneously
- If the file has no Qdrant points (never indexed), the filter matches nothing; the request returns 200 with 0 points updated — `qdrantUpdated` is still incremented (Qdrant returns ok regardless)
- `qdrantSkipped` only increments on network errors or non-2xx responses

**Performance**: 1335 nodes at batchSize=100 → 14 batches × ~100 parallel requests.
On localhost Qdrant this completes in ~8–15 seconds total.

---

### Recommended Operational Sequence

Run these steps in order after any code change that affects the scanner or GPU analysis:

```
1. VS Code Task: "GPU: Codebase Scan (ts-morph only)"
   → POST /api/codebase-index/graph-sync
   → Scans ~3140 files, writes 25 properties to Neo4j CodebaseFile nodes
   → Duration: ~28s on RTX 3060 Ti

2. VS Code Task: "GPU: Codebase Index — Full Pipeline" (if cluster layout changed)
   OR individually:
   → POST /api/codebase-index/cluster-detect  (~3.5s, k=20 GPU k-means)
   → POST /api/audit/gpu                      (~1.1s, PageRank + Louvain)

3. [Optional] Run Colab GPU notebook for authoritative PageRank + SOM BMU
   → Cell 5: GPU PageRank → writes f.pagerank_score to Neo4j nodes
   → Cell 10: SOM BMU index → writes f.som_cluster to Neo4j nodes
   → Cell ?: Export → downloads .ipynb or triggers /api/graph/colab-export

4. POST /api/codebase-index/enrich-qdrant
   → Reads all 25 Neo4j fields, writes to Qdrant payload
   → Poll GET /api/codebase-index/enrich-qdrant?jobId=<id> to completion
   → Check nodesWithPageRankColab + nodesWithSomCluster in response
   → Duration: ~8–15s for 1335 nodes

5. Verify enrichment:
   curl http://localhost:6333/collections/codebase_chunks_768/points/scroll \
     -d '{"filter":{"must":[{"key":"neo4j_enrichedAt","range":{"gte":"2026-01-01"}}]},"limit":1,"with_payload":true}' \
     | jq '.result.points[0].payload | {neo4j_gpuCluster, neo4j_pageRankScore, som_cluster, pagerank_score}'
```

**Step 10 in the implementation plan** (graph-sync → auto-trigger enrich-qdrant) automates
steps 1→4 so you only run the VS Code task and enrichment happens automatically in the
background after every scan.

---

## Phase 2 Extensions — Storage, Analytics, and Predictive Intelligence

These steps extend the pipeline beyond the core GPU + Qdrant foundation:
pgvector as a mirrored durable store, cross-pipeline chunk analytics, LangExtract entity
enrichment, Redis/Bifrost search analytics, and predictive to-do generation from search
variance.

---

### Step 16 — pgvector Mirrored Indexing + Cluster Compression (3 hrs)

**Why Qdrant alone is not enough**:
- Qdrant is an in-memory vector store — data lives in Docker. If the container is deleted or
  reimaged (common in dev), the entire `codebase_chunks_768` collection and all enrich-qdrant
  payload fields are gone. Re-indexing 3140 files takes ~30 min.
- pgvector in PostgreSQL is **durable by default** — backed by WAL, point-in-time recovery,
  and your existing `pg_dump` backups.
- Postgres HNSW indexes support `halfvec(768)` (50% memory vs `vector(768)`), making
  cluster-compressed storage practical at scale.

**New Postgres table** (add to `schema-postgres.ts`):

```typescript
// Drizzle schema addition
import { pgTable, text, integer, real, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const codechunks = pgTable('code_chunks_mirror', {
  id:            text('id').primaryKey(),            // Qdrant point UUID (same ID)
  relativePath:  text('relative_path').notNull(),
  chunkIndex:    integer('chunk_index').notNull().default(0),
  content:       text('content').notNull(),
  signature:     text('signature'),
  // 768-dim halfvec (50% memory vs float32 vector)
  embedding:     sql<string>`halfvec(768)`.notNull(),
  // neo4j enrichment fields (mirror of Qdrant payload)
  gpuCluster:    integer('gpu_cluster'),
  somCluster:    integer('som_cluster'),
  pageRankScore: real('page_rank_score'),
  complexity:    real('complexity'),
  routeType:     text('route_type'),
  hasAuthGuard:  boolean('has_auth_guard'),
  // compressed cluster centroid (optional — written after cluster-detect)
  centroidDist:  real('centroid_dist'),   // L2 distance to cluster centroid
  tags:          jsonb('tags').$type<string[]>(),
  enrichedAt:    timestamp('enriched_at', { withTimezone: true }),
}, (t) => ({
  // HNSW index — faster ANN than IVFFlat for < 1M rows
  embeddingIdx:  index('code_chunks_embedding_hnsw')
                   .using('hnsw', sql`${t.embedding} halfvec_cosine_ops`),
  clusterIdx:    index('code_chunks_cluster_idx').on(t.gpuCluster),
  pathIdx:       index('code_chunks_path_idx').on(t.relativePath),
}));
```

**Create the HNSW index** (run once via migration):
```sql
-- drizzle/manual/add_code_chunks_mirror.sql
CREATE TABLE IF NOT EXISTS code_chunks_mirror (
  id             TEXT PRIMARY KEY,
  relative_path  TEXT NOT NULL,
  chunk_index    INTEGER NOT NULL DEFAULT 0,
  content        TEXT NOT NULL,
  signature      TEXT,
  embedding      halfvec(768) NOT NULL,
  gpu_cluster    INTEGER,
  som_cluster    INTEGER,
  page_rank_score REAL,
  complexity     REAL,
  route_type     TEXT,
  has_auth_guard BOOLEAN,
  centroid_dist  REAL,
  tags           JSONB,
  enriched_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS code_chunks_embedding_hnsw
  ON code_chunks_mirror
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS code_chunks_cluster_idx ON code_chunks_mirror (gpu_cluster);
CREATE INDEX IF NOT EXISTS code_chunks_path_idx    ON code_chunks_mirror (relative_path);
```

**Sync strategy** — write to both on every index run:

```typescript
// src/lib/server/indexer/dual-embedder.ts (after Qdrant upsert)
// Mirror to pgvector (non-blocking, best-effort)
db.execute(sql`
  INSERT INTO code_chunks_mirror
    (id, relative_path, chunk_index, content, signature, embedding, tags)
  VALUES (${pointId}, ${relativePath}, ${chunkIndex}, ${content}, ${signature},
          ${JSON.stringify(embedding)}::halfvec, ${JSON.stringify(tags)}::jsonb)
  ON CONFLICT (id) DO UPDATE SET
    content = EXCLUDED.content,
    embedding = EXCLUDED.embedding,
    tags = EXCLUDED.tags
`).catch(() => {}); // non-fatal — Qdrant is source of truth
```

**Cluster compression** — store `centroid_dist` so you can filter for the most representative
chunks within a cluster (closest to centroid = most central member):

```typescript
// After kmeansWithCentroids() returns centroids array:
// For each chunk: centroid_dist = L2(embedding, centroids[gpuCluster])
// Write to code_chunks_mirror.centroid_dist
// Query: SELECT * FROM code_chunks_mirror WHERE gpu_cluster = $1
//        ORDER BY centroid_dist ASC LIMIT 10  ← top-10 most representative
```

**Fallback retrieval**: if Qdrant is down, `searchCodebase()` in `codebase-context.ts` can
fall back to:
```sql
SELECT id, relative_path, content, gpu_cluster, page_rank_score,
       1 - (embedding <=> $1::halfvec) AS cosine_score
FROM   code_chunks_mirror
WHERE  1 - (embedding <=> $1::halfvec) > 0.5
ORDER  BY cosine_score DESC
LIMIT  20
```

---

### Step 17 — Cross-Pipeline Chunk Hit Analytics with GPU Analysis (3 hrs)

**Goal**: Track which chunks are hit by ACE, KAG, DAG, and RAG pipelines so the system knows
which files are actually driving LLM answers — not just which files scored high on retrieval.
This feedback loop closes the gap between "indexed" and "actually useful".

**New Postgres table**:
```sql
CREATE TABLE IF NOT EXISTS chunk_hit_log (
  id           BIGSERIAL PRIMARY KEY,
  chunk_id     TEXT NOT NULL,           -- Qdrant/pgvector point ID
  relative_path TEXT NOT NULL,
  gpu_cluster   INTEGER,
  pipeline      TEXT NOT NULL,          -- 'ace' | 'kag' | 'dag' | 'rag' | 'reranker'
  query_hash    TEXT NOT NULL,          -- SHA-256(normalized query)
  score         REAL,                   -- cosine or rerank score at hit time
  rerank_score  REAL,                   -- Gemma4 rerank score (if reranked)
  hit_at        TIMESTAMPTZ DEFAULT NOW(),
  user_id       TEXT                    -- optional (nullable for anon)
);
CREATE INDEX IF NOT EXISTS chunk_hit_pipeline_idx ON chunk_hit_log (pipeline, hit_at DESC);
CREATE INDEX IF NOT EXISTS chunk_hit_cluster_idx  ON chunk_hit_log (gpu_cluster, hit_at DESC);
```

**Instrument each pipeline** — add a single fire-and-forget call after retrieval:

```typescript
// src/lib/server/analytics/chunk-hit.ts
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';

export type HitPipeline = 'ace' | 'kag' | 'dag' | 'rag' | 'reranker';

export function recordChunkHits(
  chunks: Array<{ id: string; relativePath?: string; gpuCluster?: number | null; score: number; rerankScore?: number }>,
  query: string,
  pipeline: HitPipeline,
  userId?: string
): void {
  const queryHash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
  // Fire-and-forget — analytics must never block retrieval
  db.execute(sql`
    INSERT INTO chunk_hit_log (chunk_id, relative_path, gpu_cluster, pipeline, query_hash, score, rerank_score, user_id)
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(
      chunks.map(c => ({
        chunk_id:      c.id,
        relative_path: c.relativePath ?? '',
        gpu_cluster:   c.gpuCluster ?? null,
        pipeline,
        query_hash:    queryHash,
        score:         c.score,
        rerank_score:  c.rerankScore ?? null,
        user_id:       userId ?? null,
      }))
    )}::jsonb)
    AS t(chunk_id text, relative_path text, gpu_cluster int, pipeline text,
         query_hash text, score real, rerank_score real, user_id text)
  `).catch(() => {});
}
```

**Wire into pipelines** (one line per call site, all fire-and-forget):
```typescript
// ace/context-assembler.ts — after fetchCodebaseContext()
recordChunkHits(codebaseContext, query, 'ace', userId);

// rag-pipeline.ts — after reranker returns
recordChunkHits(reranked.map(r => ({ id: r.doc.documentId, ... })), query, 'rag', userId);

// authority-chain.ts — KAG expansion hits
recordChunkHits(kagHits, query, 'kag', userId);
```

**GPU cluster heat map** — roll up to cluster level for the admin dashboard:

```sql
SELECT gpu_cluster,
       COUNT(*)                                    AS total_hits,
       COUNT(DISTINCT query_hash)                  AS unique_queries,
       AVG(rerank_score)                           AS avg_rerank,
       COUNT(*) FILTER (WHERE pipeline = 'ace')    AS ace_hits,
       COUNT(*) FILTER (WHERE pipeline = 'rag')    AS rag_hits,
       COUNT(*) FILTER (WHERE pipeline = 'kag')    AS kag_hits
FROM   chunk_hit_log
WHERE  hit_at > NOW() - INTERVAL '7 days'
GROUP  BY gpu_cluster
ORDER  BY total_hits DESC;
```

Wire this query into the codebase viewer admin page (`admin/codebase-viewer`) as a "Cluster
Heat" tab — shows which clusters are driving answers vs which are indexed but never retrieved.

---

### Step 18 — LangExtract Entity Enrichment → Retrieval Signals (2 hrs)

**What LangExtract does here**: The existing `analysis/entity-extraction.ts` runs LLM +
regex extraction for `EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY` on evidence. The same
pipeline applied to **codebase chunks** extracts:

- **API paths** (`/api/cases`, `/api/auth/login`) → linkable route map
- **Import targets** (extracted from `callees` and `dynamicImportTargets`) → dependency signals
- **Schema table names** (`cases`, `evidence`, `documents`) → DB dependency graph
- **Environment variables** (`process.env.FOO`, `env.BAR`) → config dependency map

The extracted entities become **Qdrant payload fields** and **Neo4j node properties** that
retrieval queries can filter and rank on.

**New endpoint**: `POST /api/codebase-index/langextract`
```typescript
// Body: { paths?: string[], clusterId?: number, force?: boolean }
// For each file/cluster:
//   1. Read chunk content from codebase_chunks_768
//   2. Run entity extraction (existing entity-extraction.ts)
//   3. Write extracted entities back to Qdrant payload:
//      { extracted_api_paths: string[], extracted_tables: string[],
//        extracted_env_vars: string[], extracted_imports: string[] }
//   4. Write to Neo4j: MERGE (f:CodebaseFile)-[:USES_TABLE]->(t:DbTable)
//                      MERGE (f:CodebaseFile)-[:CALLS_API]->(a:ApiRoute)
```

**Retrieval gain**: a query "which files use the cases table" can now filter Qdrant directly:
```json
{ "must": [{ "key": "extracted_tables", "match": { "any": ["cases"] } }] }
```
instead of relying on embedding similarity alone.

---

### Step 19 — Redis/Bifrost Search Analytics + Prompt Variance Tracking (3 hrs)

**Goal**: Track every search query and its variance (how similar it is to prior queries)
so the system knows which questions are asked repeatedly, which cluster of queries maps to
which codebase cluster, and where Bifrost L2 cache is saving the most work.

**Two-layer recording:**

#### A. Redis hot-query ring buffer

```typescript
// src/lib/server/analytics/search-analytics.ts
import { getRedis } from '$lib/server/redis.js';

const HOT_QUERY_KEY  = 'analytics:hot_queries';   // sorted set: score = hit count
const QUERY_VEC_KEY  = 'analytics:query_vecs';    // hash: queryHash → JSON embedding

export async function recordSearchQuery(
  query: string,
  embedding: number[],
  pipeline: string,
  cacheHit: boolean
): Promise<void> {
  const redis  = getRedis();
  const qHash  = createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);

  await Promise.all([
    // Increment hit count in sorted set (score = count)
    redis.zincrby(HOT_QUERY_KEY, 1, qHash),
    redis.expire(HOT_QUERY_KEY, 7 * 24 * 3600),   // 7-day rolling window

    // Store embedding for variance computation (one per unique hash)
    redis.hsetnx(QUERY_VEC_KEY, qHash, JSON.stringify({
      query: query.slice(0, 200),  // truncate for storage
      embedding: embedding.slice(0, 64),  // first 64 dims enough for variance
      pipeline,
      cacheHit,
      firstSeen: new Date().toISOString(),
    })),
    redis.expire(QUERY_VEC_KEY, 7 * 24 * 3600),
  ]);
}

/** Top-N most frequent queries in the rolling window */
export async function getHotQueries(topN = 20): Promise<Array<{ query: string; hits: number }>> {
  const redis = getRedis();
  const topHashes = await redis.zrevrange(HOT_QUERY_KEY, 0, topN - 1, 'WITHSCORES');
  const results: Array<{ query: string; hits: number }> = [];
  for (let i = 0; i < topHashes.length; i += 2) {
    const hash = topHashes[i];
    const hits = Number(topHashes[i + 1]);
    const meta = await redis.hget(QUERY_VEC_KEY, hash);
    if (meta) {
      const { query } = JSON.parse(meta);
      results.push({ query, hits });
    }
  }
  return results;
}
```

#### B. Bifrost semantic variance — "did you mean" signals

When Bifrost L2 cache returns a hit (`cacheHit = true`), the matched query and the incoming
query are semantically similar (threshold 0.8). Record the **pair** as a variance signal:

```typescript
// In bifrostChat() when cache hits:
if (bifrostCacheHit) {
  recordQueryVariancePair(
    originalQuery,
    bifrostMatchedQuery,   // the cached query that matched
    similarity,
    pipeline
  );
}

// Store in Redis hash: analytics:variance_pairs
// key: SHA-256(sorted pair) → { queryA, queryB, similarity, count }
```

The variance pairs become the **training data** for the predictive to-do list (Step 20).

**Analytics endpoint**: `GET /api/analytics/search-patterns`
```typescript
// Returns:
{
  hotQueries:      [{ query, hits }],           // top 20 by frequency
  variancePairs:   [{ queryA, queryB, similarity, count }],  // top variance pairs
  bifrostHitRate:  0.72,                        // 7-day rolling L2 hit rate
  cachesByCluster: [{ gpuCluster, hits, l2Hits }],  // per cluster cache performance
  topMissedPipeline: 'kag',                    // which pipeline misses most (needs more data)
}
```

Wire into the admin dashboard at `/admin/search-analytics` (new tab in the existing
admin dashboard route).

---

### Step 20 — Predictive To-Do Lists + "Did You Mean" from Search Variance (4 hrs)

**The pattern**: When the same semantic question is asked 5+ times but hits different
clusters or misses the cache, the system has learned that this area of the codebase needs
better coverage — more chunks, better cluster summaries, or a new KB article.

**Two outputs:**
1. **"Did you mean"** suggestions — immediate query-time synonym expansion
2. **Predictive to-do list** — asynchronous background analysis of search gaps

#### A. "Did you mean" — query-time synonym expansion

```typescript
// src/lib/server/retrieval/query-expander.ts
import { getRedis } from '$lib/server/redis.js';

/**
 * Given an incoming query, check if semantically similar queries exist in the
 * variance log and return the most-hit variant as a "did you mean" suggestion.
 * Also returns query expansion terms from the top-3 similar cached queries.
 */
export async function expandQueryWithVariance(
  query: string,
  embedding: number[]
): Promise<{ suggestion: string | null; expansionTerms: string[] }> {
  const redis = getRedis();
  const allHashes = await redis.hkeys('analytics:query_vecs');

  let bestSim = 0;
  let bestQuery = '';
  const expansionTerms: string[] = [];

  // Compare incoming embedding against stored 64-dim sketches
  for (const hash of allHashes.slice(0, 500)) {  // cap at 500 to stay fast
    const meta = await redis.hget('analytics:query_vecs', hash);
    if (!meta) continue;
    const { query: storedQuery, embedding: storedEmb } = JSON.parse(meta);

    // Dot product on truncated embeddings (approximate cosine)
    const sim = dotProduct(embedding.slice(0, 64), storedEmb);
    if (sim > 0.82 && sim > bestSim && storedQuery !== query) {
      bestSim = sim;
      bestQuery = storedQuery;
    }
    if (sim > 0.75) {
      // Extract unique content words for expansion
      expansionTerms.push(...storedQuery.split(/\s+/).filter(w => w.length > 4));
    }
  }

  return {
    suggestion:     bestSim > 0.82 ? bestQuery : null,
    expansionTerms: [...new Set(expansionTerms)].slice(0, 5),
  };
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}
```

Wire into `synthesis/generate` and `sse/chat` before the retrieval step:
```typescript
const { suggestion, expansionTerms } = await expandQueryWithVariance(query, embedding);
// Prepend expansion terms to the Qdrant search query for broader recall
const expandedQuery = expansionTerms.length
  ? `${query} ${expansionTerms.join(' ')}`
  : query;
// Surface suggestion in the response metadata
aceContext.meta = { ...aceContext.meta, didYouMean: suggestion };
```

Return `didYouMean` in the API response — the frontend can display it inline with the
answer: *"Showing results for: auth middleware → Did you mean: authentication guard?"*

#### B. Predictive to-do generation — background async analysis

**New endpoint**: `POST /api/analytics/generate-todos`

```typescript
// Runs as a background job (fire-and-forget, ~2min)
// 1. Pull top-20 hot queries from Redis
// 2. For each query: check chunk_hit_log — which clusters hit most?
//    Which queries got low rerank scores (< 0.45) across all pipeline runs?
// 3. Feed to Gemma4-legal with structured output:
//    {
//      todos: [
//        {
//          type: 'add_cluster_summary' | 'reindex_cluster' | 'add_kb_article' | 'fix_collection',
//          cluster: number,
//          reason: string,         // "cluster 7 queried 23x but avg rerank 0.31"
//          suggestedAction: string, // "Run VLM synthesis on cluster 7 files"
//          estimatedImpact: 'high' | 'medium' | 'low',
//        }
//      ]
//    }
// 4. Store in CouchDB: analytics_todos/{date}
// 5. Return { jobId } for polling

// Auto-schedule: trigger every 24h via VS Code task or cron-style RabbitMQ publish
```

**CouchDB persistence** (`analytics_todos/{YYYY-MM-DD}`):
```json
{
  "_id": "2026-04-16",
  "generatedAt": "2026-04-16T09:00:00Z",
  "todos": [
    {
      "type": "add_cluster_summary",
      "cluster": 7,
      "reason": "cluster 7 queried 23 times this week, avg rerank_score 0.31 — no cluster summary exists",
      "suggestedAction": "POST /api/codebase-index/cluster-summary with { clusterId: 7, force: true }",
      "estimatedImpact": "high"
    },
    {
      "type": "fix_collection",
      "cluster": null,
      "reason": "error-brain/diagnose hits codebase_chunks (empty) 14x — Step 1 fix not applied",
      "suggestedAction": "Change COLLECTION in dual-embedder.ts to codebase_chunks_768",
      "estimatedImpact": "high"
    },
    {
      "type": "reindex_cluster",
      "cluster": 12,
      "reason": "cluster 12 has 0 chunk hits in 7 days despite 187 indexed files",
      "suggestedAction": "Check cluster 12 embedding quality; re-run cluster-detect with k=25",
      "estimatedImpact": "medium"
    }
  ]
}
```

**Admin UI surface**: Add a **"System Intelligence"** tab to `/admin` that shows:
- Today's predictive to-do list (from CouchDB)
- "Did you mean" accuracy (% of suggestions accepted by users via click)
- Hot queries heatmap by cluster (from chunk_hit_log)
- Bifrost L2 cache hit rate trend (7-day rolling)
- Chunks never retrieved vs total indexed (dark matter detection)

---

### Updated Distance-to-Goal (Phase 2 Extensions)

```
[Steps 1–15 — ~30 hrs]  Core GPU pipeline + Qdrant + reranker + MCP bridge + Triton
[DONE — Steps 1–2]      Collection name fix + neo4j_ field surfacing in retrieval
[DONE — analytics]      search-analytics.ts, query-expander.ts, qlora-dataset endpoint,
                         generate-todos endpoint, search-patterns endpoint, 6 VS Code tasks
                         Postgres tables: chunk_hit_log, qlora_examples, predictive_todos,
                         query_variance_pairs (drizzle/manual/rag_query_analytics.sql)

[Step 16 — ~3 hrs]  pgvector mirror + halfvec(768) HNSW + centroid_dist compression
[Step 17 — ~3 hrs]  chunk_hit_log (ACE/KAG/DAG/RAG analytics) + cluster heat map admin tab
[Step 18 — ~2 hrs]  LangExtract → codebase entity enrichment (API paths, tables, env vars)
[Step 21 — ~4 hrs]  CouchDB MapReduce PageRank matrix — durable link graph without Neo4j GDS
                     (see new Step 21 below — alternative/complement to gpu-graph-analysis.ts)

Phase 2 remaining: ~11 hrs
Grand total:   ~45 hrs — production-grade, self-improving, analytics-backed system
```

**Self-improvement loop** (all phases combined):

```
query arrives
  ↓ expand with variance terms (Step 20A — DONE)
  ↓ Qdrant dual-vector OR pgvector fallback (Step 16)
  ↓ topological boost (Step 11)
  ↓ cross-encoder reranker: Triton → Ollama → LiteRT CPU (Step 15)
  ↓ JSONB buffer read/write (Step 13)
  ↓ ACE assembly + cluster summary prefix (Steps 5/6)
  ↓ KV cache (Ollama keep_alive + Anthropic ephemeral) (Step 14)
  ↓ LLM answer
  ↓ record chunk hits → chunk_hit_log (Step 17)
  ↓ record query → Redis hot-query ring (Step 19 — DONE)
  ↓ Bifrost variance pair logged if L2 hit (Step 19B — DONE)
  ↓ [nightly] generate_todos → CouchDB predictive list (Step 20B — DONE)
  ↓ [high-score interactions] qlora-dataset distillation (QLoRA pipeline — DONE)
  ↓ [on todo: "add_cluster_summary"] → cluster-summary POST auto-queued
  ↓ cluster summary written to CouchDB + Redis slim
  ↓ next query hits better ACE context → higher rerank scores → loop improves
```

---

### Step 21 — CouchDB MapReduce PageRank Matrix (4 hrs)

**Why CouchDB instead of / alongside Neo4j GDS:**

- `gpu-graph-analysis.ts` calls `pageRankGPU()` via Neo4j GDS — requires Neo4j 5+ GDS plugin,
  fails gracefully when GDS is unavailable but produces no output
- Colab GPU notebook writes `pagerank_score` to Neo4j nodes — requires a full Colab run
- **CouchDB approach**: computes PageRank from the durable link graph stored in CouchDB documents,
  independent of Neo4j GDS and Colab — works in dev, CI, and after a Neo4j wipe

**Architecture:**

```
codebase-neo4j-sync.ts
  → also writes to CouchDB: codebase_graph/{relativePath}
    { _id: 'lib/server/redis.ts',
      type: 'codebase_file',
      imports: ['lib/server/env.server.ts', 'lib/server/config.ts', ...],
      lineCount, complexity, routeType, hasAuthGuard, ... }

CouchDB Design Doc: _design/codebase_graph
  View: link_matrix
    map: emit([doc._id, importTarget], 1)  → sparse adjacency rows
  View: in_degree
    map: emit(importTarget, 1) / reduce: _count  → fan-in per file
  View: out_degree
    map: emit(doc._id, doc.imports.length) / reduce: _count  → fan-out per file

Power iteration (TypeScript — runs in graph-sync handler or dedicated endpoint):
  1. GET /codebase_graph/_design/codebase_graph/_view/link_matrix?reduce=false
     → full edge list as { key: [source, target], id }
  2. Build sparse transition matrix P where P[j][i] = 1/outDegree[i] for each edge i→j
  3. Iterate: rank_new[i] = (1-d)/N + d × Σ_j rank[j] × P[i][j]   (d = 0.85)
  4. Repeat until max|rank_new - rank| < 1e-6 (converges in ~50 iterations for 3140 nodes)
  5. Normalise: rank[i] = rank[i] / max(rank)  → 0–1 range
  6. Write back to CouchDB: PATCH codebase_graph/{id} with { pagerank_score: rank[i] }
  7. Write to Neo4j: SET f.pagerank_score_couchdb = rank[i]  (separate property, no conflict)
  8. Write to Qdrant payload: pagerank_score_couchdb field (fallback when Colab score null)
```

**New file**: `src/lib/server/graph/couchdb-pagerank.ts`

```typescript
import { getRedis } from '$lib/server/redis.js';

const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://localhost:5984';
const COUCHDB_DB  = 'codebase_graph';
const DAMPING     = 0.85;
const MAX_ITER    = 100;
const TOLERANCE   = 1e-6;

/** Read all edges from CouchDB link_matrix view (no reduce) */
async function loadEdges(): Promise<Array<{ source: string; target: string }>> {
  const res = await fetch(
    `${COUCHDB_URL}/${COUCHDB_DB}/_design/codebase_graph/_view/link_matrix?reduce=false`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`CouchDB view error: ${res.status}`);
  const data = await res.json() as { rows: Array<{ key: [string, string] }> };
  return data.rows.map(r => ({ source: r.key[0], target: r.key[1] }));
}

/** Power iteration PageRank on sparse edge list */
export function computePageRank(
  edges: Array<{ source: string; target: string }>
): Map<string, number> {
  const nodes = new Set<string>();
  const outEdges = new Map<string, string[]>();

  for (const e of edges) {
    nodes.add(e.source);
    nodes.add(e.target);
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e.target);
  }

  const N = nodes.size;
  const nodeList = [...nodes];
  const rank = new Map<string, number>(nodeList.map(n => [n, 1 / N]));

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const newRank = new Map<string, number>();
    let delta = 0;

    for (const node of nodeList) {
      let score = (1 - DAMPING) / N;
      // Sum incoming PageRank contributions
      for (const e of edges) {
        if (e.target === node) {
          const outDeg = outEdges.get(e.source)?.length ?? 1;
          score += DAMPING * (rank.get(e.source) ?? 0) / outDeg;
        }
      }
      newRank.set(node, score);
      delta = Math.max(delta, Math.abs(score - (rank.get(node) ?? 0)));
    }

    for (const [n, s] of newRank) rank.set(n, s);
    if (delta < TOLERANCE) break;
  }

  // Normalise to 0–1
  const maxScore = Math.max(...rank.values());
  if (maxScore > 0) for (const [n, s] of rank) rank.set(n, s / maxScore);

  return rank;
}

/**
 * Full pipeline:
 *   1. Load edges from CouchDB
 *   2. Run power-iteration PageRank
 *   3. PATCH back to CouchDB
 *   4. Return score map for Neo4j / Qdrant sync
 */
export async function runCouchDbPageRank(): Promise<Map<string, number>> {
  const edges = await loadEdges();
  if (edges.length === 0) throw new Error('No edges in CouchDB link_matrix — run graph-sync first');

  const scores = computePageRank(edges);

  // Batch PATCH to CouchDB (100 at a time)
  const entries = [...scores.entries()];
  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    await fetch(`${COUCHDB_URL}/${COUCHDB_DB}/_bulk_docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docs: batch.map(([id, score]) => ({
          _id: id,
          pagerank_score_couchdb: score,
        })),
      }),
    }).catch(() => {}); // best-effort
  }

  // Cache result in Redis for fast reads (6h TTL)
  const redis = getRedis();
  await redis.setex(
    'couchdb:pagerank_scores',
    6 * 3600,
    JSON.stringify(Object.fromEntries(scores))
  ).catch(() => {});

  return scores;
}
```

**New endpoint**: `POST /api/codebase-index/couchdb-pagerank`

```typescript
// Triggers runCouchDbPageRank() + syncs to Qdrant payload
// Returns: { nodesScored: number, topFiles: [{ path, score }] }
// Also writes scores to Neo4j f.pagerank_score_couchdb property
```

**Retrieval fallback priority** (update `codebase-context.ts` / `retrieval.ts`):
```typescript
pageRankScore:
  payload['pagerank_score']          // Colab GPU (authoritative, highest precision)
  ?? payload['pagerank_score_couchdb']  // CouchDB power iteration (durable, no GDS)
  ?? payload['neo4j_pageRankScore']  // Local GPU (LibTorch, always present after audit)
  ?? null
```

**CouchDB design document** (`src/lib/server/graph/couchdb-pagerank-design.json`):
```json
{
  "_id": "_design/codebase_graph",
  "views": {
    "link_matrix": {
      "map": "function(doc) { if (doc.type !== 'codebase_file' || !doc.imports) return; doc.imports.forEach(function(t) { emit([doc._id, t], 1); }); }"
    },
    "in_degree": {
      "map": "function(doc) { if (doc.type !== 'codebase_file' || !doc.imports) return; doc.imports.forEach(function(t) { emit(t, 1); }); }",
      "reduce": "_count"
    },
    "out_degree": {
      "map": "function(doc) { if (doc.type !== 'codebase_file') return; emit(doc._id, (doc.imports || []).length); }",
      "reduce": "_sum"
    },
    "file_scores": {
      "map": "function(doc) { if (doc.type === 'codebase_file' && doc.pagerank_score_couchdb != null) emit(doc._id, { pagerank: doc.pagerank_score_couchdb, complexity: doc.complexity, routeType: doc.routeType }); }"
    }
  }
}
```

**VS Code task** (add to tasks.json):
```json
{
  "label": "📊 Analytics: CouchDB PageRank (power iteration)",
  "type": "shell",
  "command": "curl -s -X POST http://localhost:5173/api/codebase-index/couchdb-pagerank -H 'Content-Type: application/json' -H 'Cookie: session=dev' | jq '{nodesScored, topFiles: .topFiles[:5]}'"
}
```

**Why this matters for the self-improvement loop:**

CouchDB stores file documents persistently across restarts. Every `graph-sync` call writes fresh
import edges. The MapReduce views update lazily — the first `GET link_matrix` after new documents
re-indexes incrementally, not from scratch. This means CouchDB PageRank is:

1. **Always available** — no Neo4j GDS plugin required
2. **Incrementally maintained** — new files don't require a full re-index
3. **Durable** — survives Docker restarts, Neo4j wipes, Colab session expiry
4. **Auditable** — CouchDB document history shows how pagerank_score changed over time

The `file_scores` view enables a fast admin query: "top 20 most central files by PageRank" without
hitting Neo4j or Qdrant — useful for the admin codebase-viewer dashboard and for seeding the
predictive to-do list (Step 20) with authoritative centrality data.