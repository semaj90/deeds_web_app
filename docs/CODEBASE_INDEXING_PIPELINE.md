# Codebase Indexing Pipeline — How-To

End-to-end guide for the 10-stage codebase indexing pipeline with TurboQuant inference,
Karpathy wiki feedback loop, and event-driven cache invalidation.

**Last updated:** 2026-04-23 (post cache-invalidation cascade + GRPO reranker wiring)

---

## Architecture

```mermaid
flowchart TB
  subgraph Ingest["Ingest"]
    S1[1. ast_embed<br/>ts-morph → chunks → embeddings]
    S2[2. cluster_assign<br/>k=20 GPU kmeans]
  end

  subgraph Graph["Graph / Topology"]
    S3[3. som_topology<br/>trainSOM BMU grid]
    S4[4. neo4j_sync<br/>CodebaseFile + SIMILAR_TOPOLOGY]
    S5[5. pagerank<br/>pageRankGPU authority scores]
  end

  subgraph Summarize["Summarize / Tag"]
    S6[6. summarize<br/>TurboQuant :8090<br/>gemma4-rotorquant:latest<br/>cache_prompt:true]
    S7[7. tag<br/>Karpathy semantic_tags]
  end

  subgraph Wiki["Durable Memory"]
    S8[8. wiki_export<br/>generateAllClusterNotes]
    S9[9. hypergraph_4d<br/>SOM+GRPO manifold4]
    S10[10. deep_research<br/>web-search-indexer<br/>→ research notes]
  end

  subgraph Cache["Cache Invalidation"]
    C1[invalidateIndexingCaches<br/>TURBO_PREFIX + GRAPH_NEIGHBORS<br/>+ KB/RESEARCH_BUNDLE<br/>+ DAG cache]
    C2[invalidateResearchCaches<br/>TURBO_PREFIX + TURBO_WARM<br/>+ RESEARCH_BUNDLE<br/>+ RAG_SEARCH]
  end

  S1 --> S2 --> C1
  C1 --> S3 --> S4 --> S5
  S5 --> S6 --> C2
  C2 --> S7 --> S8 --> S9 --> S10 --> C2

  style S6 fill:#0a3d62,color:#fff
  style C1 fill:#6a3d00,color:#fff
  style C2 fill:#6a3d00,color:#fff
  style S10 fill:#1e5128,color:#fff
```

---

## Stage Reference

| # | Stage | Implementation | Output |
|---|---|---|---|
| 1 | `ast_embed` | ts-morph batched `addSourceFilesAtPaths` + embeddinggemma | `codebase_chunk_index` + Qdrant `codebase_chunks_768` |
| 2 | `cluster_assign` | `kmeansWithCentroids` on 768-dim embeddings | `gpu_cluster` column on every chunk |
| 3 | `som_topology` | `trainSOM` builds 2D BMU grid + `SIMILAR_TOPOLOGY` adjacency | SOM grid coords written to Qdrant payload |
| 4 | `neo4j_sync` | Merge `CodebaseFile` nodes + edges | Neo4j graph ready for recommendations |
| 5 | `pagerank` | `pageRankGPU` (CUDA) or JS fallback | `page_rank_score` authority column |
| 6 | `summarize` | TurboQuant → `summarize-clusters-pg.ts` | `cluster_summaries` + Redis `summary:cluster:*` |
| 7 | `tag` | `/api/codebase-index/karpathy-tag` | `semantic_tags[]` on every chunk |
| 8 | `wiki_export` | `generateAllClusterNotes` → CouchDB + Redis | Durable cluster notes (Karpathy wiki) |
| 9 | `hypergraph_4d` | `buildHypergraph4D` writes `manifold4` column | `[som_x, som_y, semantic_z, grpo_w]` |
| 10 | `deep_research` | `runDeepResearchIndex` + `web-search-indexer` | Web results → Qdrant `knowledge_base` + research notes |

**Invalidation fires** at Stage 2 (indexing_complete — clears all downstream),
Stage 6 (research_update — refreshes summaries), and Stage 10 (research_update — refreshes research bundles).

---

## Running the Pipeline

### Full pipeline (SSE-streamed)

```bash
# From sveltekit-frontend/
curl -N -X POST http://localhost:5173/api/codebase-index/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "stages": ["ast_embed","cluster_assign","som_topology","neo4j_sync","pagerank","summarize","tag","wiki_export","hypergraph_4d","deep_research"],
    "summarize": true,
    "deepResearch": true,
    "exportWiki": true
  }'
```

SSE events stream back as `{ stage, status, message, progress }` so the admin page
can render a live progress bar.

### Single-stage (e.g., refresh summaries only)

```bash
curl -N -X POST http://localhost:5173/api/codebase-index/orchestrate \
  -H "Content-Type: application/json" \
  -d '{ "stages": ["summarize"], "summarize": true }'
```

### TurboQuant-first cluster summarization (standalone script)

```bash
# Requires TurboQuant llama-server on :8090 (see "TurboQuant setup" below)
cd sveltekit-frontend
npx tsx scripts/summarize-clusters-pg.ts --force --cluster=0

# Falls back to Ollama :11434 (legacy fallback lane) automatically if TurboQuant unhealthy
```

---

## TurboQuant Setup (Inference Layer)

TurboQuant's `cache_prompt: true` computes the system-prompt KV state **once** and
reuses it across all 20 cluster summaries, saving ~18s per run on an 8GB GPU.

| Port | Service | Model | VRAM |
|---|---|---|---|
| `8090` | llama-server.exe (TurboQuant) | `gemma4-rotorquant:latest.gguf` + `mmproj-BF16.gguf` | 5.8 GB |
| `11434` | Ollama (fallback) | `gemma4-rotorquant:latest` | legacy swappable lane |

Start TurboQuant via VS Code task: **⚡ TurboQuant: Start (vision + text, :8090)**

Health check: `curl http://127.0.0.1:8090/health` → `{"status":"ok"}`

---

## Cache Invalidation Cascade

Before this session the pipeline relied on TTL expiry only (10–30 min stale data).
Now it's event-driven:

| Trigger | Function | Patterns Cleared |
|---|---|---|
| `cluster_assign` completes | `invalidateIndexingCaches()` | `turbo:prefix:*`, `turbo:warm:*`, `turbo:dym:*`, `graph:case:*:neighbors`, `kb_bundle:*`, `research_bundle:*`, `summary:cluster:*`, `rag:search*`, `llm:semantic:*` + CouchDB `dag_cache` purge |
| `summarize` completes | `invalidateResearchCaches()` | `turbo:prefix:*`, `turbo:warm:*`, `research_bundle:*`, `kb_bundle:*`, `rag:search*` |
| `deep_research` completes | `invalidateResearchCaches()` | (same as above — refreshes TurboQuant prefix anchors that embed research summaries) |

**Why:** TurboQuant pre-loads "prefix anchors" into GPU KV slots — system prompts
that include the latest cluster summaries, RL policy weights, and DYM suggestions.
When the underlying RAG data changes, those anchors go stale. Invalidation forces
them to rebuild on next inference.

---

## Karpathy Wiki Feedback Loop

Deep research findings and error-prone domains are captured as durable notes:

| Node Type | Function | Triggered By |
|---|---|---|
| **Cluster note** | `generateClusterNote` | Stage 8 (wiki_export) |
| **Research note** | `recordResearchNote` | Stage 10 (deep_research) |
| **Playbook note** | `buildPlaybookNote` | Stage 6 (summarize) — fires for `ace`, `rag`, `indexer` domains |
| **Retrieval note** | `recordRetrievalNote` | Per-query in RAG orchestrator |

All notes live in CouchDB + Redis (`kb_bundle:*`), feeding back into ACE context
assembly and GRPO reranking on the next query.

## Query Routing Evaluation — Phase 18

Phase 18 is the query-side hardening layer for the Atlas / HyperRAG stack. It validates messy developer query routing against the same Karpathy-indexed codebase state that this pipeline builds:

- uses `codebase_chunks_768` as the indexed retrieval corpus
- samples `gpu:karpathy:scores` as the authority blend signal
- audits CHR97 fast-path gating and HyperRAG fallback decisions
- writes evaluation reports to `docs/reports/messy-query-routing-eval.json` and `docs/reports/messy-query-routing-eval.md`

Read the engineering completion doc at `docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md`.

This evaluation phase is intentionally non-production at first: it exists to verify that the indexed Karpathy retrieval surfaces and HyperRAG fallback are aligned before promoting the pattern to a live route.

---

## Export & Analysis Surface

All export paths share the indexed state built by the orchestrate pipeline
(Postgres `codebase_chunk_index` + `cluster_summaries`, Qdrant `codebase_chunks_768`
+ `knowledge_base`, Neo4j `CodebaseFile` nodes, Redis `wiki:note:*`).

### Unified Bundle (primary entry point)

`GET /api/codebase-index/export/bundle` returns everything in one JSON payload:

```json
{
  "graph":     { "nodes": [...], "edges": [...] },
  "clusters":  [{ "id", "purpose", "patterns", "warnings", "tags", "memberCount" }],
  "wikiNotes": [{ "id", "type", "body": { ... } }],
  "manifold4": [{ "id", "manifold": [som_cluster, gpu_cluster, pageRank, community_id] }],
  "tileAtlas": { "tileCount", "source" },
  "cacheStats":{ "turbo:*", "summary:cluster:*", "wiki:*", ... }
}
```

Query params:
- `?include=graph,clusters,wikiNotes,manifold4,tileAtlas,cacheStats` — selective parts
- `?limit=N` — cap graph nodes/edges (default 2000)
- `?repoId=default` — filter cluster_summaries by repo
- `?format=ipynb` — 302 redirect to `/api/graph/colab-export` (Jupyter notebook)

Degrades per-part: if Postgres is down, `graph`/`clusters`/`manifold4` are null
but `wikiNotes`/`tileAtlas`/`cacheStats` (different backends) still return.

### Downstream Consumers

| Consumer | Path | What it ingests |
|---|---|---|
| **Google Colab (PyTorch)** | `GET /api/graph/colab-export` → `.ipynb` | 768-dim embeddings from Qdrant + Neo4j adjacency → GPU PageRank + K-Means + Kohonen SOM → writes `pagerank_score` + `SIMILAR_TOPOLOGY` back |
| **LangGraph synthesis** | Docker `legal-ai-langgraph:8091` via `langgraph-client.ts` | HMM Baum-Welch + Redis KAG neighbor cache + `torch.compile()` GPU kernels |
| **CouchDB PageRank** | `src/lib/server/graph/couchdb-pagerank.ts` | MapReduce views (`link_matrix`, `in_degree`, `out_degree`) → power iteration → Redis cache `couchdb:pagerank_scores` |
| **Glyph Tile Atlas** | `src/lib/server/cartridge/glyph-tile-engine.ts` | kMeans centroids → 2D Voronoi → CouchDB `glyph_topology` + Redis tile cache |
| **Minified Research** | `src/lib/server/analytics/minified-research-cache.ts` | Int8-quantized summary embeddings (768 f32 → Int8Array) + 64-bit tag bitmask atlas |
| **Obsidian export** | `POST /api/codebase-index/export/obsidian` | Karpathy wiki notes → `.md` files with frontmatter |

### Gemma4 → embeddinggemma Summary Path

Stage 6 (`summarize`) writes:
1. **Text summary** → Postgres `cluster_summaries.summary` (gemma4-rotorquant:latest via Ollama/TurboQuant)
2. **768-dim embedding** → Postgres `cluster_summaries.summary_embedding` halfvec (embeddinggemma)
3. **Qdrant mirror** → `codebase_chunks_768` payload `summary_embedding` vector (named-vector mode)
4. **Minified** → Int8 quantized via `minified-research-cache.ts` (serves L1/L2/L3 cache tiers)

This feeds back into:
- **Graph nodes** — bundled via `/api/codebase-index/export/bundle` (`clusters[].hasSummaryEmbedding`)
- **ACE context** — `assembleACEContext` pulls `cluster_summaries.summary` for query-relevant clusters
- **MCP tools** — `rag:search` + `evidence:search_similar` over the Int8 atlas

### FastMCP Agentic Tool Calling

MCP server at `src/mcp/server.ts` exposes 28+ tools over stdio. Cosine similarity
flows: WebGPU compute shader → WASM fallback → CPU (see `src/lib/gpu/gpu-compute-pipeline.ts`).

Tool examples wired to the indexed state:
- `rag:search` → Qdrant `codebase_chunks_768` / `knowledge_base` hybrid search
- `evidence:search_similar` — cross-modal (CLIP/Whisper embeddings)
- `neo4j_dependency_graph` — traverses `IMPORTS` + `SIMILAR_TOPOLOGY` edges
- `cross_language_similarity` — GPU batch cosine over N:M vector sets
- `agentic_recommendation` — combines cluster_summaries + wiki playbooks + PageRank to suggest fixes

### Topological DB Backends (summary)

| Backend | Role | Written By | Read By |
|---|---|---|---|
| **Postgres** `codebase_chunk_index` | Chunk metadata + halfvec embeddings | Stage 1 (ast_embed) | Bundle endpoint, cluster_summaries joins |
| **Postgres** `cluster_summaries` | Gemma4 cluster summaries + embeddings | Stage 6 (summarize) | ACE context, bundle, MCP |
| **Qdrant** `codebase_chunks_768` | Dual-vector (content + signature) ANN index | Stage 1 + mirror from Postgres | RAG search, MCP `rag:search` |
| **Qdrant** `knowledge_base` | Deep research web results | Stage 10 (deep_research) | ACE, MCP |
| **Neo4j** `CodebaseFile` + `SIMILAR_TOPOLOGY` | Graph relationships | Stage 3 (som_topology) + Colab write-back | Graph queries, bundle edges |
| **CouchDB** `wiki_notes`, `glyph_topology`, `dag_cache` | Durable memory layer | Stages 6/8/10 + DAG ordering | Karpathy wiki browser, glyph renderer |
| **Redis** `wiki:note:*`, `turbo:*`, `summary:cluster:*`, `embed:*` | Hot cache tier | Every stage (write-through) | Bundle cacheStats, invalidation cascade |

---

## Admin Visualization

**URL:** [http://localhost:5173/admin/codebase-index](http://localhost:5173/admin/codebase-index)

Sibling pages:
- `/admin/cache` — Redis / memory / GPU buffer pool stats
- `/admin/codebase-graph` — Neo4j graph explorer (SIMILAR_TOPOLOGY edges)
- `/admin/search-intelligence` — GRPO reranker leaderboard, RL audit trail
- `/admin/topology` — SOM grid + cluster heatmap
- `/admin/knowledge-search` — wiki note browser

The orchestrate endpoint streams SSE events so any of these pages can subscribe
to live progress via `EventSource`.

---

## VS Code Tasks (Pipeline Control)

All tasks live in `.vscode/tasks.json`. Run via `Ctrl+Shift+P` → **Tasks: Run Task**:

| Task Label | Action |
|---|---|
| `📚 Admin: Open Codebase Pipeline` | Opens `/admin/codebase-index` in VS Code Simple Browser |
| `🔄 Pipeline: Run Full Orchestrate (SSE)` | Triggers all 10 stages, streams progress to terminal |
| `🔄 Pipeline: Summarize Only` | Stage 6 only — regenerates cluster summaries via TurboQuant |
| `🔄 Pipeline: Deep Research Only` | Stage 10 only — refreshes research notes |
| `🔄 Pipeline: Invalidate Downstream Caches` | Fires `invalidateIndexingCaches` manually |
| `⚡ TurboQuant: Start (vision + text, :8090)` | Starts llama-server with VLM |
| `⚡ TurboQuant: Health Check` | Verifies `:8090/health` |

---

## Troubleshooting

**TurboQuant falls back to Ollama** — check `curl http://127.0.0.1:8090/health`.
If llama-server crashed, restart via the TurboQuant task.

**Stale summaries after re-indexing** — Verify invalidation fired:
```bash
redis-cli --scan --pattern "turbo:prefix:*" | head
# should be empty or only have fresh keys (TTL < original)
```

**Deep research runs but no wiki notes** — Check CouchDB `wiki_notes` DB.
`recordResearchNote` is fire-and-forget; errors are swallowed to avoid
blocking the pipeline. Check server logs for `[karpathy-wiki]` entries.

**svelte-check errors after changes** — Expected invariants:
- `AceChunkContext` has both `gpuCluster` and `somCluster` fields
- `CACHE_PATTERNS` includes `TURBO_PREFIX`, `TURBO_WARM`, `TURBO_DYM`
- `InvalidationType` includes `'indexing_complete'`, `'cluster_reassign'`, `'research_update'`

---

## Related Files

| Path | Role |
|---|---|
| `src/routes/api/codebase-index/orchestrate/+server.ts` | Pipeline orchestrator (SSE) |
| `src/lib/server/cache/invalidation.ts` | Cache cascade functions |
| `src/lib/server/cache/dag-cache.ts` | CouchDB DAG ordering cache + purge |
| `src/lib/server/indexer/karpathy-wiki.ts` | Wiki note authors (cluster/research/playbook/retrieval) |
| `src/lib/server/indexer/web-search-indexer.ts` | Deep research (Stage 10) |
| `src/lib/server/retrieval/orchestrator.ts` | Main RAG orchestrator (w/ LangExtract GRPO reranker) |
| `src/lib/server/retrieval/langextract-reranker.ts` | 3-pass entity + section + retrieval fusion |
| `scripts/summarize-clusters-pg.ts` | Standalone summarizer w/ TurboQuant-first inference |
